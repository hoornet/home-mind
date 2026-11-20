import type { Config } from "../config.js";
import {
  AssistExposure,
  exposureUnavailableMessage,
  notExposedMessage,
  nothingExposedMessage,
} from "./exposure.js";
import {
  CODE_DOMAINS,
  SCRIPT_LIFECYCLE,
  assertServiceName,
  isVoiceEngine,
  mediaRefusal,
  normalizeEntityId,
  notifyRefusal,
  serviceRefusal,
} from "./service-policy.js";

/** Calls with a security code allowed per entity within `CODE_WINDOW_MS`. */
const CODE_ATTEMPTS = 3;
const CODE_WINDOW_MS = 10 * 60 * 1000;

export interface EntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

/**
 * One recorder row. Everything but `state` and `last_changed` is optional
 * because we ask for `minimal_response`, under which HA returns those two alone
 * for every entry other than the first and last.
 */
export interface HistoryEntry {
  entity_id?: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed: string;
  last_updated?: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * What HA's services catalog says about a service's response. HA rejects a
 * call with `?return_response` on a service that has none ("none"), and
 * rejects a call WITHOUT it on a service that must return one ("only").
 */
export type ServiceResponseSupport = "none" | "optional" | "only";

/** Shape HA returns when a response was requested (`?return_response`). */
export interface ServiceCallWithResponse {
  changed_states: EntityState[];
  service_response: unknown;
}

/** The entity IDs a service call targets; HA accepts one, a list, or "a, b". */
function targetedEntities(target: unknown): string[] {
  const ids = typeof target === "string" ? [target] : Array.isArray(target) ? target : [];
  return ids
    .filter((t): t is string => typeof t === "string")
    .flatMap((t) => t.split(","))
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

/**
 * Data keys that carry entity ids besides `entity_id`: `scene.apply` and
 * `scene.create` take `entities` as a map keyed by entity id, `scene.create`
 * takes `snapshot_entities`, `group.set` takes `entities`, `add_entities` and
 * `remove_entities` as lists, `tts.speak` names its speaker in
 * `media_player_entity_id` (its `entity_id` is the voice engine), and
 * `media_player.join` takes the speakers to group in `group_members`.
 */
const ENTITY_LIST_KEYS = [
  "entities",
  "snapshot_entities",
  "add_entities",
  "remove_entities",
  "media_player_entity_id",
  "group_members",
] as const;

/**
 * The entity ids in one of `ENTITY_LIST_KEYS`: the keys of a scene's entity map,
 * or a list. Only strings shaped like an entity id count, because other
 * integrations use the same key names for things that are not entities.
 * Lower-cased first, as Home Assistant's `cv.entity_id` does: `Light.Hall`
 * fails the shape test as written but reaches `light.hall` all the same.
 */
function listedEntities(value: unknown): string[] {
  const ids =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
      : targetedEntities(value);
  return ids
    .map((id) => id.trim().toLowerCase())
    .filter((id) => /^[a-z0-9_]+\.[a-z0-9_]+$/.test(id));
}

/** Targets that select entities indirectly, which the exposure list cannot vet. */
const INDIRECT_TARGETS = ["area_id", "device_id", "floor_id", "label_id"] as const;

/**
 * Entity-shaped words in a call's other fields (a script's field, an id inside
 * a url or a message), lower-cased. Only the
 * ones that exist are held to the exposure list.
 */
function mentionedEntities(payload: Record<string, unknown>): Set<string> {
  const found = new Set<string>();
  const walk = (value: unknown, key?: string): void => {
    if (key === "entity_id" || (ENTITY_LIST_KEYS as readonly string[]).includes(key ?? "")) return;
    if (typeof value === "string") {
      // An id in a url may be percent-encoded, and Home Assistant decodes it.
      let decoded = value;
      try {
        decoded = decodeURIComponent(value);
      } catch {
        // Not valid percent-encoding: the text as written is all there is.
      }
      for (const text of decoded === value ? [value] : [value, decoded]) {
        for (const word of text.toLowerCase().match(/[a-z0-9_]+(?:\.[a-z0-9_]+)+/g) ?? []) {
          const parts = word.split(".");
          for (let i = 0; i + 1 < parts.length; i++) {
            if (parts[i] !== "zone" && parts[i] !== "sun") found.add(`${parts[i]}.${parts[i + 1]}`);
          }
        }
      }
    } else if (Array.isArray(value)) {
      value.forEach((v) => walk(v));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, k);
    }
  };
  walk(payload);
  return found;
}

/**
 * Lower-case and strip combining diacritics, so "Spálňa" and "spalna" compare
 * equal. Letters that do not decompose (ł, ø, ß) are left as they are.
 * NFD splits an accented letter into base + combining mark; the range
 * U+0300–U+036F is exactly those marks.
 */
export function foldAccents(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export class HomeAssistantClient {
  private baseUrl: string;
  private token: string;
  private skipTlsVerify: boolean;

  // Cache settings
  private cacheTTL: number = 10000; // 10 seconds default
  private allStatesCache: CacheEntry<EntityState[]> | null = null;
  private entityCache: Map<string, CacheEntry<EntityState>> = new Map();
  // The services catalog changes only when integrations load or unload, so it
  // can live much longer than entity state. It is never invalidated by a
  // service call. Missing or failed → looked up again next time.
  private serviceResponseTTL: number = 5 * 60 * 1000;
  private serviceResponseCache: CacheEntry<Map<string, ServiceResponseSupport>> | null = null;
  /** When calls carrying a security code were made, by entity, for `CODE_ATTEMPTS`. */
  private codeAttempts = new Map<string, number[]>();

  /**
   * @param exposure The entities the user exposed to Assist. When given, it
   *   bounds everything the tools can read and drive, the same bound Home
   *   Assistant's own agent puts on its tools; an empty or unread list allows
   *   nothing. Omitted (`TOOLS_FROM_EXPOSED=false`), the client reaches every
   *   entity.
   */
  constructor(
    config: Config,
    private readonly exposure?: AssistExposure
  ) {
    this.baseUrl = config.haUrl.replace(/\/$/, "");
    this.token = config.haToken;
    this.skipTlsVerify = config.haSkipTlsVerify;
  }

  /**
   * Refuses an entity the user has not exposed, before any request is made.
   *
   * Throwing beats returning an empty result: the tool handler turns it into a
   * message the model reads, so "not exposed" is said out loud instead of
   * looking like a device that is missing or broken.
   */
  private async requireExposed(...entityIds: string[]): Promise<void> {
    if (!this.exposure) return;
    for (const id of entityIds) {
      if (await this.exposure.allows(id)) continue;
      const unread = (await this.exposure.list()) === null;
      throw new Error(unread ? exposureUnavailableMessage() : notExposedMessage(id));
    }
  }

  /**
   * The entities a service call names, from `entity_id`, a nested `target`, the
   * entity maps and lists of `ENTITY_LIST_KEYS`, and the script that
   * `script.<name>` runs; plus the first area, device, floor or label target.
   */
  private serviceTargets(
    domain: string,
    service: string,
    payload: Record<string, unknown>
  ): { ids: string[]; indirect?: string } {
    const nested =
      payload.target && typeof payload.target === "object"
        ? (payload.target as Record<string, unknown>)
        : {};
    const indirect = INDIRECT_TARGETS.find((k) => payload[k] !== undefined || nested[k] !== undefined);
    const ids = [
      ...targetedEntities(payload.entity_id),
      ...targetedEntities(nested.entity_id),
      ...ENTITY_LIST_KEYS.flatMap((k) => listedEntities(payload[k])),
    ];
    if (domain === "script" && !SCRIPT_LIFECYCLE.has(service)) ids.push(`script.${service}`);
    return { ids, indirect };
  }

  /**
   * Refuses a service call that would reach past the exposure list.
   *
   * Named entities are checked one by one, including a nested `target` and the
   * entity maps and lists that scenes and groups take (`ENTITY_LIST_KEYS`).
   * Area, device, floor and label targets would need resolving to know what
   * they hit, so they are refused and the model is told to name entities. A
   * call with no target at all touches no entity in current Home Assistant,
   * except `script.<name>`, which runs that script; whether the assistant may
   * make such a call at all is `serviceRefusal`'s question
   * (`callServiceAsAssistant`).
   */
  private async requireExposedTargets(
    domain: string,
    service: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.exposure) return;
    const { ids, indirect } = this.serviceTargets(domain, service, payload);
    if (indirect) {
      throw new Error(
        `Targeting by ${indirect} is not available to you: only entities the user exposed to the ` +
          `assistant may be controlled. Call the service with the exposed entity_ids instead.`
      );
    }
    if (ids.includes("all")) {
      throw new Error(
        `entity_id "all" is not available to you: it reaches entities the user has not exposed. ` +
          `Call the service with the exposed entity_ids instead.`
      );
    }
    await this.requireExposed(...ids);
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    if (!entry) return false;
    return Date.now() - entry.timestamp < this.cacheTTL;
  }

  /**
   * Invalidate all caches (call after service calls)
   */
  private invalidateCache(): void {
    this.allStatesCache = null;
    this.entityCache.clear();
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    // Handle self-signed certificates
    if (this.skipTlsVerify && url.startsWith("https://")) {
      const { Agent } = await import("undici");
      (fetchOptions as any).dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HA API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  private async fetchText(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<string> {
    const url = `${this.baseUrl}${endpoint}`;

    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    if (this.skipTlsVerify && url.startsWith("https://")) {
      const { Agent } = await import("undici");
      (fetchOptions as any).dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HA API error ${response.status}: ${text}`);
    }

    return response.text();
  }

  /**
   * Get all states (cached)
   */
  private async getAllStatesCached(): Promise<EntityState[]> {
    if (this.isCacheValid(this.allStatesCache)) {
      return this.allStatesCache.data;
    }

    const states = await this.fetch<EntityState[]>("/api/states");
    this.allStatesCache = { data: states, timestamp: Date.now() };

    // Also populate individual entity cache
    for (const state of states) {
      this.entityCache.set(state.entity_id, { data: state, timestamp: Date.now() });
    }

    return states;
  }

  /**
   * Get state of a single entity (cached)
   */
  async getState(rawEntityId: string): Promise<EntityState> {
    const entityId = normalizeEntityId(rawEntityId);
    await this.requireExposed(entityId);

    // Check individual cache first
    const cached = this.entityCache.get(entityId);
    if (this.isCacheValid(cached)) {
      return cached.data;
    }

    // Check if we have a recent all-states cache
    if (this.isCacheValid(this.allStatesCache)) {
      const state = this.allStatesCache.data.find(s => s.entity_id === entityId);
      if (state) return state;
    }

    // Fetch individual entity
    const state = await this.fetch<EntityState>(`/api/states/${encodeURIComponent(entityId)}`);
    this.entityCache.set(entityId, { data: state, timestamp: Date.now() });
    return state;
  }

  /**
   * Get all entities, optionally filtered by domain (cached)
   */
  async getEntities(domain?: string): Promise<EntityState[]> {
    const states = await this.visibleStates();

    if (domain) {
      return states.filter((s) => s.entity_id.startsWith(`${domain}.`));
    }

    return states;
  }

  /** Every state the assistant may see — all of them when nothing is exposed. */
  private async visibleStates(): Promise<EntityState[]> {
    const states = await this.getAllStatesCached();
    return this.exposure ? this.exposure.filter(states) : states;
  }

  /**
   * Search entities by name or ID substring (cached)
   *
   * Both sides are accent-folded before comparing. An `entity_id` is ASCII by
   * construction, so a query in the user's own language ("garáž") could never
   * match the entity slugged from it ("garaz_dvere"), and a friendly name is
   * whatever the installer typed — sometimes accented, sometimes not, for the
   * same device. Folding makes the two spellings one.
   */
  async searchEntities(query: string): Promise<EntityState[]> {
    const needle = foldAccents(query);

    const states = await this.visibleStates();
    return states.filter((s) => {
      const name = (s.attributes.friendly_name as string) || "";
      return (
        foldAccents(s.entity_id).includes(needle) ||
        foldAccents(name).includes(needle)
      );
    });
  }

  /**
   * A service call the assistant asked for. Everything `callService` checks,
   * plus what the assistant may call at all (`serviceRefusal`): no system
   * services, and no call that names nothing it acts on, except the few meant
   * to be called that way. The server's own calls (its notifications) go
   * through `callService` and are not limited.
   */
  async callServiceAsAssistant(
    domain: string,
    service: string,
    entityId?: string,
    data?: Record<string, unknown>
  ): Promise<EntityState[] | ServiceCallWithResponse> {
    assertServiceName(domain, service);
    const payload: Record<string, unknown> = { ...data };
    if (entityId) payload.entity_id = entityId;
    const { ids, indirect } = this.serviceTargets(domain, service, payload);
    const targeted = ids.some((id) => !isVoiceEngine(id.toLowerCase())) || indirect !== undefined;
    const refusal =
      serviceRefusal(domain, service, targeted) ??
      (domain === "notify" ? notifyRefusal(service, payload) : null) ??
      mediaRefusal(payload, service === "browse_media" || service === "search_media");
    if (refusal) throw new Error(refusal);
    // Before anything is awaited: the model's calls run in parallel, and each
    // must see the attempts the others have already taken.
    this.takeCodeAttempt(domain, payload, ids, indirect);
    if (this.exposure) {
      // A call that names nothing still acts for the household: with nothing
      // exposed, or the list unread, the assistant may do nothing at all.
      if (!targeted) {
        const exposed = await this.exposure.list();
        if (exposed === null) throw new Error(exposureUnavailableMessage());
        if (exposed.size === 0) throw new Error(nothingExposedMessage());
      }
      const mentioned = mentionedEntities(payload);
      if (mentioned.size > 0) {
        const existing = new Set((await this.getAllStatesCached()).map((s) => s.entity_id));
        await this.requireExposed(...[...mentioned].filter((id) => existing.has(id)));
      }
    }
    return this.callService(domain, service, entityId, data);
  }

  /**
   * A code is often all that guards an alarm or a lock, and many answer a wrong
   * one without an error, so every call that carries a code counts: a few per
   * entity within `CODE_WINDOW_MS`, then no more. Throws when none is left.
   */
  private takeCodeAttempt(
    domain: string,
    payload: Record<string, unknown>,
    ids: string[],
    indirect: string | undefined
  ): void {
    if (!CODE_DOMAINS.has(domain) || payload.code === undefined) return;
    const keys = ids.map((id) => id.trim().toLowerCase());
    if (keys.length === 0 || indirect !== undefined) {
      throw new Error(
        `A security code can only be sent to a named alarm or lock, not to an area or device. ` +
          `Call it again with the entity_id.`
      );
    }
    const now = Date.now();
    for (const key of keys) {
      const recent = (this.codeAttempts.get(key) ?? []).filter((t) => now - t < CODE_WINDOW_MS);
      this.codeAttempts.set(key, recent);
      if (recent.length >= CODE_ATTEMPTS) {
        throw new Error(
          `${key} has been sent a code ${CODE_ATTEMPTS} times in the last few minutes, so you ` +
            `can't send another now. Tell the user to use Home Assistant or the device itself.`
        );
      }
    }
    for (const key of keys) this.codeAttempts.get(key)!.push(now);
  }

  /**
   * Call a Home Assistant service (invalidates cache)
   */
  async callService(
    domain: string,
    service: string,
    entityId?: string,
    data?: Record<string, unknown>
  ): Promise<EntityState[] | ServiceCallWithResponse> {
    // Services that return data (`weather.get_forecasts`, `calendar.get_events`,
    // `todo.get_items`, ...) must be called with `?return_response`, and services
    // that don't must NOT be — HA 400s either way round. Which is which is
    // declared in the services catalog, so the decision is made here from that,
    // never by the caller. A `return_response` key inside `data` is accepted as
    // a hint (it is not a service field, so it is stripped from the payload) and
    // can only ADD the parameter for a service the catalog doesn't know.
    assertServiceName(domain, service);
    const payload: Record<string, unknown> = { ...data };
    const hint = payload.return_response === true;
    delete payload.return_response;
    if (entityId) {
      payload.entity_id = entityId;
    }

    // Every entity this call would touch, whether named in `entityId` or
    // handed in through `data` — a model that has been told an entity is out of
    // scope will otherwise try the other door.
    await this.requireExposedTargets(domain, service, payload);

    const support = await this.getServiceResponseSupport(domain, service);
    const wantResponse =
      support === "only" || support === "optional" || (support === undefined && hint);

    const endpoint =
      `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}` +
      (wantResponse ? "?return_response" : "");
    const result = await this.fetch<EntityState[] | ServiceCallWithResponse>(endpoint, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    // Invalidate cache after service call since states may have changed
    this.invalidateCache();

    return result;
  }

  /**
   * Whether `domain.service` supports a response, per HA's services catalog:
   * `response: null` → "none", `{ optional: true }` → "optional",
   * `{ optional: false }` → "only". `undefined` when the service is not in the
   * catalog or the catalog could not be fetched — best-effort, a catalog hiccup
   * must never stop a light from turning on.
   */
  private async getServiceResponseSupport(
    domain: string,
    service: string
  ): Promise<ServiceResponseSupport | undefined> {
    const cached = this.serviceResponseCache;
    if (!cached || Date.now() - cached.timestamp >= this.serviceResponseTTL) {
      try {
        const raw = await this.fetch<
          { domain: string; services: Record<string, { response?: { optional?: boolean } | null }> }[]
        >("/api/services");
        const map = new Map<string, ServiceResponseSupport>();
        for (const entry of raw) {
          for (const [name, desc] of Object.entries(entry.services ?? {})) {
            const r = desc?.response;
            map.set(
              `${entry.domain}.${name}`,
              r == null ? "none" : r.optional ? "optional" : "only"
            );
          }
        }
        this.serviceResponseCache = { data: map, timestamp: Date.now() };
      } catch {
        return undefined;
      }
    }
    return this.serviceResponseCache!.data.get(`${domain}.${service}`);
  }

  /**
   * Render a Jinja2 template via the HA template API.
   * Returns the rendered plain-text result (HA returns text/plain, not JSON).
   */
  async renderTemplate(template: string): Promise<string> {
    return this.fetchText("/api/template", {
      method: "POST",
      body: JSON.stringify({ template }),
    });
  }

  /**
   * Get historical states for an entity (not cached - historical data)
   */
  async getHistory(
    rawEntityId: string,
    startTime?: string,
    endTime?: string
  ): Promise<HistoryEntry[]> {
    // One entity: `filter_entity_id` also takes a comma-separated list.
    const entityId = normalizeEntityId(rawEntityId);
    await this.requireExposed(entityId);

    const start = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // URL-encode every interpolated value. The `+` in `+HH:MM` tz offsets is
    // otherwise decoded as a space in query strings by aiohttp (HA's HTTP
    // layer), producing "Invalid end_time" 400s for any LLM that includes
    // an explicit timezone offset in its history args.
    // `minimal_response` drops attributes from every entry except the first and
    // last. We only ever read state + last_changed, so serializing icon,
    // friendly_name and device_class onto fifty thousand rows was work HA did
    // purely for us to discard: six of these calls took 15-23s each on a real
    // house. The first entry stays complete, which is where the unit comes from.
    let endpoint = `/api/history/period/${encodeURIComponent(start)}?filter_entity_id=${encodeURIComponent(entityId)}&minimal_response=true`;

    if (endTime) {
      endpoint += `&end_time=${encodeURIComponent(endTime)}`;
    }

    const result = await this.fetch<HistoryEntry[][]>(endpoint);
    return result[0] || [];
  }
}
