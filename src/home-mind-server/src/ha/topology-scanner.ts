import type { HomeAssistantClient } from "./client.js";

/**
 * The layout is fetched in two steps, because one call cannot be made to fit.
 *
 * Home Assistant caps a template render at 262 144 characters. The old single
 * template asked for every area's full entity list, and `area_entities()`
 * returns everything — config knobs, diagnostics, the lot — so a large house
 * blows the cap and the whole layout is lost (home-mind#34: 9 059 entities,
 * about 283 KB of JSON). Filtering by domain inside the template helps but does
 * not fix it: the same house still renders around 186 KB, so a slightly bigger
 * one fails again. Only a bounded number of areas per call is actually safe.
 *
 * Step one asks for the shape of the home — floors and areas, names and ids, and
 * how many entities each area holds. Counts rather than ids, so it stays small
 * however large the house; the count is what lets the scan log keep reporting
 * how much the filter saved, which is a running cost worth seeing.
 */
const STRUCTURE_TEMPLATE = `
{%- set ns = namespace(floors=[], assigned=[]) -%}
{%- for fid in floors() -%}
  {%- set ans = namespace(areas=[]) -%}
  {%- for aid in floor_areas(fid) -%}
    {%- set ans.areas = ans.areas + [{"id": aid, "name": area_name(aid), "total": area_entities(aid) | count}] -%}
    {%- set ns.assigned = ns.assigned + [aid] -%}
  {%- endfor -%}
  {%- set ns.floors = ns.floors + [{"id": fid, "name": floor_name(fid), "areas": ans.areas}] -%}
{%- endfor -%}
{%- set orphans = namespace(areas=[]) -%}
{%- for aid in areas() -%}
  {%- if aid not in ns.assigned -%}
    {%- set orphans.areas = orphans.areas + [{"id": aid, "name": area_name(aid), "total": area_entities(aid) | count}] -%}
  {%- endif -%}
{%- endfor -%}
{{ {"floors": ns.floors, "unassigned": orphans.areas} | tojson }}
`.trim();

/**
 * Step two asks for the entities of a given batch of areas.
 *
 * `domains` prefilters inside the template when we know which domains can
 * survive the filter applied later in TypeScript. That is not a substitute for
 * batching — it is what keeps the number of calls small on a normal house.
 * Passing null prefilters nothing, which is right when the caller keeps every
 * domain, and batching alone keeps that safe.
 */
function entitiesTemplate(
  areaIds: readonly string[],
  domains: readonly string[] | null,
  withNames = true
): string {
  const ids = JSON.stringify(areaIds);
  // Bare ids are the fallback for an area too big to render with its names.
  const item = withNames ? `{"id": e, "name": state_attr(e, "friendly_name")}` : "e";
  const test = domains
    ? `e.split('.')[0] in ${JSON.stringify([...domains])}`
    : "true";
  return `
{%- set ns = namespace(rows=[]) -%}
{%- for aid in ${ids} -%}
  {%- set ents = namespace(list=[]) -%}
  {%- for e in area_entities(aid) -%}
    {%- if ${test} -%}{%- set ents.list = ents.list + [${item}] -%}{%- endif -%}
  {%- endfor -%}
  {%- set ns.rows = ns.rows + [{"id": aid, "entities": ents.list}] -%}
{%- endfor -%}
{{ ns.rows | tojson }}
`.trim();
}

/** Home Assistant's wording when a render is too big to return. */
const TOO_BIG = /exceeded maximum size/i;

/** An area as the structure call returns it, before its entities are fetched. */
interface AreaStub {
  id: string;
  name: string;
  total?: number;
}

/**
 * Domains worth putting in front of the model by default: everything it can
 * act on, plus the ones it is routinely asked to read.
 *
 * This is a *proxy*. What we actually want to drop is everything Home Assistant
 * marks `entity_category: config | diagnostic` — the knobs an integration
 * creates for setup, not for daily use. That marker lives in the entity
 * registry, and the registry is reachable over the websocket API only: it is
 * neither in `/api/states` nor exposed to the template engine (there is no
 * `entity_category()` template function, unlike `device_attr()` or
 * `is_hidden_entity()`). This scanner is pure REST by design, so the domain is
 * the best signal available here.
 *
 * How good a proxy, measured against the registry of a 7,612-entity install:
 * of the entities this list drops, 80 % are genuinely `config`/`diagnostic`.
 * It is not a substitute, though — an `entity_category` filter would drop
 * about twice as many, because `sensor` and `switch` are full of diagnostic
 * entities the domain cannot tell apart from real ones. If this ever moves to
 * the websocket registry, filter on the category and delete this list.
 *
 * `automation` is left out for a different reason: an automation belongs to no
 * room, and driving automations is a separate feature this server does not have.
 */
export const DEFAULT_LAYOUT_DOMAINS = [
  // controllable
  "alarm_control_panel", "climate", "cover", "fan", "humidifier",
  "lawn_mower", "light", "lock", "media_player", "remote", "scene", "script",
  "siren", "switch", "vacuum", "valve", "water_heater",
  // helpers: user-created controls, never diagnostic
  "input_boolean", "input_datetime", "input_number", "input_select", "input_text",
  // routinely asked about
  "binary_sensor", "camera", "device_tracker", "person", "sensor", "timer", "weather",
] as const;

/** One entity in a room. `name` is null when Home Assistant has none. */
interface EntityRef {
  id: string;
  name: string | null;
}

/**
 * How an entity appears in the layout. The id is what a tool call needs; the
 * name is the only thing tying it to the words a user actually says —
 * `switch.flush_1d_relay` is a garage door in exactly one house, and nothing
 * in the id says so.
 */
function entityLabel(entity: EntityRef): string {
  // A line break or comma in a name would blur where one entity ends.
  const name = entity.name?.replace(/[\r\n,]+/g, " ").replace(/\s+/g, " ").trim();
  return name ? `${entity.id} (${name})` : entity.id;
}

interface AreaData {
  id: string;
  name: string;
  entities: EntityRef[];
}

interface FloorData {
  id: string;
  name: string;
  areas: AreaData[];
}

interface LayoutData {
  floors: FloorData[];
  unassigned: AreaData[];
}

/**
 * Scans the Home Assistant home layout (floors → rooms → entities) via the
 * template API and injects it into every system prompt. This gives the LLM
 * spatial awareness without tool calls — it knows which floor/room a device
 * belongs to before reasoning begins.
 *
 * Uses POST /api/template with a single Jinja2 query (no registry REST
 * endpoints needed, works on all HA versions with template support).
 *
 * Runs at startup and refreshes every scanIntervalMs.
 */
/** Reads the entities exposed to Assist; `null` when the list is unavailable. */
export type ExposureProvider = () => Promise<Set<string> | null>;

export class TopologyScanner {
  private ha: HomeAssistantClient;
  private lastScanTime: number = 0;
  private readonly scanIntervalMs: number;
  private readonly domains: Set<string> | null;
  private readonly exposure: ExposureProvider | null;
  private exposed: Set<string> | null = null;
  private layoutText: string = "";

  /**
   * @param domains Entity domains to keep in the layout. `null` keeps every
   *   domain — the previous behaviour, and what a home with few entities
   *   wants. On a large install `area_entities()` returns everything, so the
   *   default filter drops the config and diagnostic domains nobody asks a
   *   voice assistant about (`button`, `update`, `number`, `select`, `event`).
   * @param exposure Optional reader for the Assist exposure list. When it
   *   returns entities they win over `domains`, because the user picking them
   *   by hand beats any heuristic. Falls back to `domains` when it yields
   *   nothing, so a home that exposes nothing still gets a layout.
   */
  constructor(
    ha: HomeAssistantClient,
    scanIntervalMs = 30 * 60 * 1000,
    domains: readonly string[] | null = DEFAULT_LAYOUT_DOMAINS,
    exposure: ExposureProvider | null = null
  ) {
    this.ha = ha;
    this.scanIntervalMs = scanIntervalMs;
    this.domains = domains === null ? null : new Set(domains);
    this.exposure = exposure;
  }

  private keep(entityId: string): boolean {
    if (this.exposed) return this.exposed.has(entityId);
    if (this.domains === null) return true;
    return this.domains.has(entityId.slice(0, entityId.indexOf(".")));
  }

  /** Which filter the last scan used — for the log line and for tests. */
  private filterName(): string {
    if (this.exposed) return `exposed to Assist`;
    if (this.domains === null) return "unfiltered";
    return "filtered by domain";
  }

  /**
   * The domains worth asking Home Assistant for.
   *
   * A superset of what `keep()` will accept, never a subset — prefiltering must
   * not drop something the exact filter would have kept. When the user has
   * exposed entities to Assist those win, so the prefilter becomes the domains
   * present in that list rather than our own default.
   */
  private prefilterDomains(): readonly string[] | null {
    if (this.exposed) {
      return [...new Set([...this.exposed].map((e) => e.slice(0, e.indexOf("."))))];
    }
    return this.domains === null ? null : [...this.domains];
  }

  /**
   * Entities for a batch of areas, halving the batch whenever the render comes
   * back too big.
   *
   * Halving rather than guessing a fixed size: how many entities an area holds
   * is unknowable from here, and a house that fails at sixteen areas may be
   * fine at eight. A single area that still cannot render is skipped with a
   * warning rather than losing the whole layout, which is what happened before.
   */
  private async fetchEntities(
    areaIds: string[],
    domains: readonly string[] | null
  ): Promise<Map<string, EntityRef[]>> {
    const out = new Map<string, EntityRef[]>();
    const queue: { ids: string[]; withNames: boolean }[] =
      areaIds.length > 0 ? [{ ids: areaIds, withNames: true }] : [];

    while (queue.length > 0) {
      const { ids: batch, withNames } = queue.shift()!;
      try {
        const raw = await this.ha.renderTemplate(entitiesTemplate(batch, domains, withNames));
        const rows = JSON.parse(raw.trim()) as { id: string; entities: (EntityRef | string)[] }[];
        for (const row of rows) {
          out.set(
            row.id,
            row.entities.map((e) => (typeof e === "string" ? { id: e, name: null } : e))
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!TOO_BIG.test(msg)) throw err;
        if (batch.length === 1 && withNames) {
          // Names make each entry several times longer; ids alone may still fit.
          queue.unshift({ ids: batch, withNames: false });
          continue;
        }
        if (batch.length === 1) {
          console.warn(
            `[topology] Area ${batch[0]} has too many entities to read in one call; ` +
              `it will be missing from the layout`
          );
          out.set(batch[0], []);
          continue;
        }
        const half = Math.ceil(batch.length / 2);
        queue.unshift(
          { ids: batch.slice(0, half), withNames },
          { ids: batch.slice(half), withNames }
        );
      }
    }
    return out;
  }

  /** How many entities the home really has, before any filtering. */
  private totalEntities = 0;

  /** The whole layout, assembled from the structure call plus batched entities. */
  private async fetchLayout(): Promise<LayoutData> {
    const raw = await this.ha.renderTemplate(STRUCTURE_TEMPLATE);
    const structure = JSON.parse(raw.trim()) as {
      floors: { id: string; name: string; areas: AreaStub[] }[];
      unassigned: AreaStub[];
    };
    this.totalEntities = [
      ...structure.floors.flatMap((f) => f.areas),
      ...structure.unassigned,
    ].reduce((n, a) => n + (a.total ?? 0), 0);

    const areaIds = [
      ...structure.floors.flatMap((f) => f.areas.map((a) => a.id)),
      ...structure.unassigned.map((a) => a.id),
    ];
    const entities = await this.fetchEntities(areaIds, this.prefilterDomains());
    const fill = (a: AreaStub) => ({
      id: a.id,
      name: a.name,
      entities: entities.get(a.id) ?? [],
    });

    return {
      floors: structure.floors.map((f) => ({ ...f, areas: f.areas.map(fill) })),
      unassigned: structure.unassigned.map(fill),
    };
  }

  async scan(): Promise<void> {
    try {
      // Refreshed per scan: the user can expose an entity at any time, and a
      // stale set would silently hide a device they just added.
      if (this.exposure) {
        const exposed = await this.exposure();
        // An empty set means "exposed nothing", which must not empty the whole
        // layout — fall back to the domain filter in that case.
        this.exposed = exposed && exposed.size > 0 ? exposed : null;
      }

      const data = await this.fetchLayout();
      this.layoutText = this.buildLayout(data);
      this.lastScanTime = Date.now();

      const floorCount = data.floors.length;
      const areas = [...data.floors.flatMap((f) => f.areas), ...data.unassigned];
      // Counted in the structure call: what the house holds before prefiltering.
      const total = this.totalEntities;
      const kept = areas.reduce((n, a) => n + a.entities.filter((e) => this.keep(e.id)).length, 0);
      // The layout ships in every system prompt, so its size is a running cost.
      const dropped = kept === total ? "" : ` (${total - kept} dropped, ${this.filterName()})`;
      console.log(
        `[topology] Scanned home layout: ${floorCount} floors, ${areas.length} areas, ` +
          `${kept} entities${dropped}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[topology] Scan failed — home layout unavailable: ${msg}`);
      // Keep previous layout if scan fails
    }
  }

  async refreshIfStale(): Promise<void> {
    if (Date.now() - this.lastScanTime > this.scanIntervalMs) {
      await this.scan();
    }
  }

  hasLayout(): boolean {
    return this.layoutText.length > 0;
  }

  formatSection(): string {
    return this.layoutText;
  }

  /** Room lines for one group of areas, skipping rooms the filter emptied. */
  private roomLines(areas: AreaData[]): string[] {
    return areas
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((area) => ({ name: area.name, entities: area.entities.filter((e) => this.keep(e.id)) }))
      .filter((area) => area.entities.length > 0)
      .map((area) => {
        const list = area.entities
          .sort((x, y) => x.id.localeCompare(y.id, "en"))
          .map(entityLabel)
          .join(", ");
        return `- ${area.name}: ${list}`;
      });
  }

  private buildLayout(data: LayoutData): string {
    const body: string[] = [];

    for (const floor of data.floors) {
      const rooms = this.roomLines(floor.areas);
      if (rooms.length === 0) continue;
      body.push(`**${floor.name}**`, ...rooms, "");
    }

    const orphans = this.roomLines(data.unassigned);
    if (orphans.length > 0) {
      body.push("**Other rooms (no floor assigned)**", ...orphans, "");
    }

    // A header with no rooms under it would tell the model the house is empty,
    // which is worse than saying nothing. Emptiness is decided after filtering.
    if (body.length === 0) return "";

    return [
      "## Home Layout (auto-detected from Home Assistant)",
      "",
      "Use this to know which floor/room a device belongs to — never assume locations.",
      "",
      ...body,
    ]
      .join("\n")
      .trimEnd();
  }
}
