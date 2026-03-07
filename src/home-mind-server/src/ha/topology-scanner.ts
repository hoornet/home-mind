import type { HomeAssistantClient } from "./client.js";

interface FloorEntry {
  floor_id: string;
  name: string;
  level: number;
}

interface AreaEntry {
  area_id: string;
  name: string;
  floor_id: string | null;
}

interface EntityRegistryEntry {
  entity_id: string;
  area_id: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
}

/**
 * Scans Home Assistant registries (entity, area, floor) and builds a compact
 * home layout map that is injected into the system prompt. This gives the LLM
 * spatial awareness (which floor/room a device belongs to) without requiring
 * tool calls or guessing.
 *
 * Runs at startup and refreshes every scanIntervalMs. If the registry endpoints
 * are unavailable (older HA versions), it logs a warning and returns empty.
 */
export class TopologyScanner {
  private ha: HomeAssistantClient;
  private lastScanTime: number = 0;
  private readonly scanIntervalMs: number;
  private layoutText: string = "";

  constructor(ha: HomeAssistantClient, scanIntervalMs = 30 * 60 * 1000) {
    this.ha = ha;
    this.scanIntervalMs = scanIntervalMs;
  }

  async scan(): Promise<void> {
    try {
      const [entities, areas, floors] = await Promise.all([
        this.ha.getEntityRegistry(),
        this.ha.getAreaRegistry(),
        this.ha.getFloorRegistry(),
      ]);

      this.layoutText = this.buildLayout(
        entities as EntityRegistryEntry[],
        areas as AreaEntry[],
        floors as FloorEntry[]
      );
      this.lastScanTime = Date.now();

      const areaCount = (areas as AreaEntry[]).length;
      const floorCount = (floors as FloorEntry[]).length;
      console.log(`[topology] Scanned home layout: ${floorCount} floors, ${areaCount} areas`);
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

  private buildLayout(
    entities: EntityRegistryEntry[],
    areas: AreaEntry[],
    floors: FloorEntry[]
  ): string {
    // Build area lookup
    const areaMap = new Map(areas.map((a) => [a.area_id, a]));

    // Group active entities by area
    const areaEntities = new Map<string, string[]>();
    for (const entity of entities) {
      if (!entity.area_id) continue;
      if (entity.disabled_by || entity.hidden_by) continue;
      if (!areaMap.has(entity.area_id)) continue;
      const list = areaEntities.get(entity.area_id) ?? [];
      list.push(entity.entity_id);
      areaEntities.set(entity.area_id, list);
    }

    if (areaEntities.size === 0) return "";

    // Group areas by floor_id (null = no floor)
    const floorAreas = new Map<string | null, AreaEntry[]>();
    for (const area of areas) {
      if (!areaEntities.has(area.area_id)) continue; // skip empty areas
      const key = area.floor_id ?? null;
      const list = floorAreas.get(key) ?? [];
      list.push(area);
      floorAreas.set(key, list);
    }

    const lines: string[] = [
      "## Home Layout (auto-detected from Home Assistant)",
      "",
      "Use this to know which floor/room a device belongs to — never assume locations.",
      "",
    ];

    // Floors sorted by level
    const sortedFloors = [...floors].sort((a, b) => a.level - b.level);
    for (const floor of sortedFloors) {
      const areasOnFloor = floorAreas.get(floor.floor_id);
      if (!areasOnFloor) continue;
      lines.push(`**${floor.name}**`);
      for (const area of areasOnFloor.sort((a, b) => a.name.localeCompare(b.name))) {
        const entityList = (areaEntities.get(area.area_id) ?? []).sort().join(", ");
        lines.push(`- ${area.name}: ${entityList}`);
      }
      lines.push("");
    }

    // Areas with no floor assigned
    const unflooredAreas = floorAreas.get(null);
    if (unflooredAreas && unflooredAreas.length > 0) {
      lines.push("**Other rooms (no floor assigned)**");
      for (const area of unflooredAreas.sort((a, b) => a.name.localeCompare(b.name))) {
        const entityList = (areaEntities.get(area.area_id) ?? []).sort().join(", ");
        lines.push(`- ${area.name}: ${entityList}`);
      }
      lines.push("");
    }

    return lines.join("\n").trimEnd();
  }
}
