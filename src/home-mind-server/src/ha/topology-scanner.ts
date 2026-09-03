import type { HomeAssistantClient } from "./client.js";

/**
 * Single Jinja2 template that returns the full home layout as JSON in one call.
 * Uses HA template functions: floors(), floor_name(), floor_areas(),
 * area_name(), area_entities(), areas(), area_floor_id().
 * All available since HA 2024.4.
 */
const LAYOUT_TEMPLATE = `
{%- set ns = namespace(floors=[], assigned=[]) -%}
{%- for fid in floors() -%}
  {%- set ans = namespace(areas=[]) -%}
  {%- for aid in floor_areas(fid) -%}
    {%- set ans.areas = ans.areas + [{"id": aid, "name": area_name(aid), "entities": area_entities(aid) | list}] -%}
    {%- set ns.assigned = ns.assigned + [aid] -%}
  {%- endfor -%}
  {%- set ns.floors = ns.floors + [{"id": fid, "name": floor_name(fid), "areas": ans.areas}] -%}
{%- endfor -%}
{%- set orphans = namespace(areas=[]) -%}
{%- for aid in areas() -%}
  {%- if aid not in ns.assigned -%}
    {%- set orphans.areas = orphans.areas + [{"id": aid, "name": area_name(aid), "entities": area_entities(aid) | list}] -%}
  {%- endif -%}
{%- endfor -%}
{{ {"floors": ns.floors, "unassigned": orphans.areas} | tojson }}
`.trim();

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

interface AreaData {
  id: string;
  name: string;
  entities: string[];
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

      const raw = await this.ha.renderTemplate(LAYOUT_TEMPLATE);
      const data = JSON.parse(raw.trim()) as LayoutData;
      this.layoutText = this.buildLayout(data);
      this.lastScanTime = Date.now();

      const floorCount = data.floors.length;
      const areas = [...data.floors.flatMap((f) => f.areas), ...data.unassigned];
      const total = areas.reduce((n, a) => n + a.entities.length, 0);
      const kept = areas.reduce((n, a) => n + a.entities.filter((e) => this.keep(e)).length, 0);
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
      .map((area) => ({ name: area.name, entities: area.entities.filter((e) => this.keep(e)) }))
      .filter((area) => area.entities.length > 0)
      .map((area) => `- ${area.name}: ${area.entities.sort().join(", ")}`);
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
