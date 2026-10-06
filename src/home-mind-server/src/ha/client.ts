import type { Config } from "../config.js";
import { AssistExposure, notExposedMessage } from "./exposure.js";

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

/** Targets that select entities indirectly, which the exposure list cannot vet. */
const INDIRECT_TARGETS = ["area_id", "device_id", "floor_id", "label_id"] as const;

/** Lifecycle services of the script domain; any other `script.X` runs script X. */
const SCRIPT_LIFECYCLE = new Set(["turn_on", "turn_off", "toggle", "reload"]);

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

  /**
   * @param exposure The entities the user exposed to Assist. When given, it
   *   bounds everything the tools can read and drive — the same bound Home
   *   Assistant's own agent puts on its tools. Omitted (or reporting "no
   *   opinion") leaves the client unfiltered.
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
      if (!(await this.exposure.allows(id))) throw new Error(notExposedMessage(id));
    }
  }

  /**
   * Refuses a service call that would reach past the exposure list.
   *
   * Named entities are checked one by one, including a nested `target`. Area,
   * device, floor and label targets would need resolving to know what they
   * hit, so with an opinionated list they are refused and the model is told
   * to name entities. A call with no target at all touches no entity in
   * current Home Assistant, except `script.<name>`, which runs that script.
   */
  private async requireExposedTargets(
    domain: string,
    service: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.exposure || (await this.exposure.list()) === null) return;
    const nested =
      payload.target && typeof payload.target === "object"
        ? (payload.target as Record<string, unknown>)
        : {};
    const indirect = INDIRECT_TARGETS.find((k) => payload[k] !== undefined || nested[k] !== undefined);
    if (indirect) {
      throw new Error(
        `Targeting by ${indirect} is not available to you: only entities the user exposed to the ` +
          `assistant may be controlled. Call the service with the exposed entity_ids instead.`
      );
    }
    const ids = [...targetedEntities(payload.entity_id), ...targetedEntities(nested.entity_id)];
    if (ids.includes("all")) {
      throw new Error(
        `entity_id "all" is not available to you: it reaches entities the user has not exposed. ` +
          `Call the service with the exposed entity_ids instead.`
      );
    }
    if (domain === "script" && !SCRIPT_LIFECYCLE.has(service)) ids.push(`script.${service}`);
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
  async getState(entityId: string): Promise<EntityState> {
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
    const state = await this.fetch<EntityState>(`/api/states/${entityId}`);
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

    const endpoint = `/api/services/${domain}/${service}${wantResponse ? "?return_response" : ""}`;
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
    entityId: string,
    startTime?: string,
    endTime?: string
  ): Promise<HistoryEntry[]> {
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
