import type { HomeAssistantClient, EntityState } from "./client.js";

/**
 * Per-entity overrides for when HA reports incorrect capabilities
 * (e.g. Gledopto firmware always reports color_temp+xy regardless of wiring).
 * Keys are entity IDs; values override auto-detected methods.
 */
export type DeviceOverride = {
  whiteMethod?: "color_temp" | "rgbw" | "rgb_white" | "none";
  colorMethod?: "rgb_color" | "xy_color" | "hs_color" | "none";
};

export type DeviceOverrides = Record<string, DeviceOverride>;

/**
 * How to set white light on a specific device.
 * This is pre-computed from supported_color_modes + known device quirks.
 */
export type WhiteMethod =
  | { type: "color_temp"; defaultKelvin: number; minKelvin: number; maxKelvin: number }
  | { type: "rgbw"; value: [number, number, number, number] }
  | { type: "rgb_white"; value: [number, number, number] }
  | { type: "none" };

/**
 * How to set a color on a specific device.
 */
export type ColorMethod =
  | { type: "rgb_color" }
  | { type: "xy_color" }
  | { type: "hs_color" }
  | { type: "none" };

/**
 * Pre-computed capability profile for a single device.
 * Scanner builds these once; they're injected into the system prompt so the LLM
 * never has to reason about color modes from raw attributes.
 */
export interface DeviceCapabilityProfile {
  entityId: string;
  friendlyName: string;
  domain: string;
  state: string;
  // Light-specific
  hasBrightness: boolean;
  whiteMethod: WhiteMethod;
  colorMethod: ColorMethod;
}

/**
 * Scans Home Assistant entities and builds pre-computed capability profiles.
 * Runs on startup and periodically. Profiles are injected into the system prompt
 * so the LLM doesn't have to re-discover capabilities via tool calls every request.
 */
export class DeviceScanner {
  private ha: HomeAssistantClient;
  private profiles: Map<string, DeviceCapabilityProfile> = new Map();
  private lastScanTime: number = 0;
  private readonly scanIntervalMs: number;
  private readonly overrides: DeviceOverrides;

  constructor(ha: HomeAssistantClient, scanIntervalMs = 30 * 60 * 1000, overrides: DeviceOverrides = {}) {
    this.ha = ha;
    this.scanIntervalMs = scanIntervalMs;
    this.overrides = overrides;
  }

  /**
   * Scan all light entities and build capability profiles.
   * Call on startup and then periodically.
   */
  async scan(): Promise<void> {
    try {
      const entities = await this.ha.getEntities("light");
      const newProfiles = new Map<string, DeviceCapabilityProfile>();

      for (const entity of entities) {
        const profile = this.buildProfile(entity);
        newProfiles.set(entity.entity_id, profile);
      }

      this.profiles = newProfiles;
      this.lastScanTime = Date.now();
      console.log(`[scanner] Scanned ${newProfiles.size} light entities`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[scanner] Scan failed: ${msg}`);
      // Keep previous profiles if scan fails
    }
  }

  /**
   * Refresh profiles if the scan interval has elapsed.
   */
  async refreshIfStale(): Promise<void> {
    if (Date.now() - this.lastScanTime > this.scanIntervalMs) {
      await this.scan();
    }
  }

  getProfiles(): DeviceCapabilityProfile[] {
    return Array.from(this.profiles.values());
  }

  hasProfiles(): boolean {
    return this.profiles.size > 0;
  }

  /**
   * Returns a compact cheat sheet for injection into the system prompt.
   * The LLM should use these pre-computed values instead of calling get_entities
   * or reasoning from raw supported_color_modes attributes.
   */
  formatCheatSheet(): string {
    const lights = Array.from(this.profiles.values()).filter(
      (p) => p.domain === "light"
    );

    if (lights.length === 0) return "";

    const lines: string[] = [
      "## Device Capability Reference (auto-scanned — use these exact params, skip search_entities for known devices)",
      "",
      "### Lights",
    ];

    for (const p of lights) {
      lines.push(`\n**${p.entityId}** "${p.friendlyName}" [${p.state}]`);

      // White method
      switch (p.whiteMethod.type) {
        case "color_temp":
          lines.push(
            `  → white: \`color_temp_kelvin\` (${p.whiteMethod.minKelvin}–${p.whiteMethod.maxKelvin}K; warm≈2700, neutral≈4000, daylight≈${p.whiteMethod.maxKelvin})`
          );
          break;
        case "rgbw":
          lines.push(
            `  → white: \`rgbw_color: [0,0,0,255]\` ⚠ DO NOT use color_temp_kelvin (WLED reports it but ignores it)`
          );
          break;
        case "rgb_white":
          lines.push(`  → white: \`rgb_color: [255,255,255]\``);
          break;
        case "none":
          lines.push(`  → white: not supported`);
          break;
      }

      // Color method
      switch (p.colorMethod.type) {
        case "rgb_color":
          lines.push(`  → color: \`rgb_color: [R,G,B]\` (0–255 each)`);
          break;
        case "xy_color":
          lines.push(
            `  → color: \`xy_color: [x,y]\` (CIE xy; e.g. red≈[0.7,0.3], blue≈[0.17,0.04])`
          );
          break;
        case "hs_color":
          lines.push(`  → color: \`hs_color: [hue,sat]\` (hue 0–360, sat 0–100)`);
          break;
        case "none":
          lines.push(`  → color: not supported`);
          break;
      }

      if (p.hasBrightness) {
        lines.push(`  → brightness: 0–255`);
      }
    }

    lines.push(
      "\n> When controlling a device listed above, call call_service directly with the exact params shown. No need to call search_entities or get_entities first."
    );

    return lines.join("\n");
  }

  /**
   * Build a capability profile from raw HA entity state.
   */
  private buildProfile(entity: EntityState): DeviceCapabilityProfile {
    const attrs = entity.attributes;
    const modes: string[] = (attrs.supported_color_modes as string[]) ?? [];
    const friendlyName = (attrs.friendly_name as string) ?? entity.entity_id;
    const domain = entity.entity_id.split(".")[0];

    const hasBrightness =
      modes.some((m) => ["brightness", "color_temp", "rgb", "rgbw", "rgbww", "xy", "hs", "white"].includes(m));

    let whiteMethod = this.computeWhiteMethod(entity.entity_id, modes, attrs);
    let colorMethod = this.computeColorMethod(modes);

    const override = this.overrides[entity.entity_id];
    if (override) {
      if (override.whiteMethod) {
        whiteMethod = this.applyWhiteOverride(override.whiteMethod, attrs);
      }
      if (override.colorMethod) {
        colorMethod = this.applyColorOverride(override.colorMethod);
      }
    }

    return {
      entityId: entity.entity_id,
      friendlyName,
      domain,
      state: entity.state,
      hasBrightness,
      whiteMethod,
      colorMethod,
    };
  }

  /**
   * Determine the correct method for setting white light.
   *
   * Order of precedence:
   * 1. rgbw/rgbww → use dedicated W channel (even if color_temp is also listed — WLED quirk)
   * 2. color_temp → use color_temp_kelvin
   * 3. rgb/xy/hs → use rgb_color [255,255,255]
   * 4. brightness/onoff only → no white setting needed, just brightness or on/off
   */
  private computeWhiteMethod(
    entityId: string,
    modes: string[],
    attrs: Record<string, unknown>
  ): WhiteMethod {
    if (modes.includes("rgbww") || modes.includes("rgbw")) {
      return { type: "rgbw", value: [0, 0, 0, 255] };
    }

    if (modes.includes("color_temp")) {
      const min = (attrs.min_color_temp_kelvin as number) ?? 2000;
      const max = (attrs.max_color_temp_kelvin as number) ?? 6500;
      const defaultKelvin = Math.round((min + max) / 2 / 100) * 100; // midpoint, rounded to nearest 100
      return { type: "color_temp", defaultKelvin, minKelvin: min, maxKelvin: max };
    }

    if (modes.some((m) => ["rgb", "xy", "hs"].includes(m))) {
      return { type: "rgb_white", value: [255, 255, 255] };
    }

    return { type: "none" };
  }

  private applyWhiteOverride(type: string, attrs: Record<string, unknown>): WhiteMethod {
    switch (type) {
      case "rgbw": return { type: "rgbw", value: [0, 0, 0, 255] };
      case "rgb_white": return { type: "rgb_white", value: [255, 255, 255] };
      case "color_temp": {
        const min = (attrs.min_color_temp_kelvin as number) ?? 2000;
        const max = (attrs.max_color_temp_kelvin as number) ?? 6500;
        return { type: "color_temp", defaultKelvin: Math.round((min + max) / 2 / 100) * 100, minKelvin: min, maxKelvin: max };
      }
      default: return { type: "none" };
    }
  }

  private applyColorOverride(type: string): ColorMethod {
    switch (type) {
      case "rgb_color": return { type: "rgb_color" };
      case "xy_color": return { type: "xy_color" };
      case "hs_color": return { type: "hs_color" };
      default: return { type: "none" };
    }
  }

  /**
   * Determine the correct method for setting a specific color.
   */
  private computeColorMethod(modes: string[]): ColorMethod {
    // rgbw/rgbww strips can use rgb_color for the R/G/B channels
    if (modes.some((m) => ["rgb", "rgbw", "rgbww"].includes(m))) {
      return { type: "rgb_color" };
    }
    if (modes.includes("xy")) {
      // xy is more universal than hs; prefer it
      return { type: "xy_color" };
    }
    if (modes.includes("hs")) {
      return { type: "hs_color" };
    }
    return { type: "none" };
  }
}
