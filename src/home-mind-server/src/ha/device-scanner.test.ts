import { describe, it, expect, vi } from "vitest";
import { DeviceScanner } from "./device-scanner.js";
import type { HomeAssistantClient, EntityState } from "./client.js";

function makeEntity(
  entity_id: string,
  friendly_name: string,
  supported_color_modes: string[],
  extra: Record<string, unknown> = {}
): EntityState {
  return {
    entity_id,
    state: "on",
    last_changed: "2026-01-01T00:00:00Z",
    last_updated: "2026-01-01T00:00:00Z",
    attributes: { friendly_name, supported_color_modes, ...extra },
  };
}

const WLED_RGBW = makeEntity(
  "light.led_strip_colors_kitchen",
  "RGBW Kitchen",
  ["color_temp", "rgbw"],
  { min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 }
);

const GLEDOPTO = makeEntity(
  "light.gledopto_gl_c_008p",
  "LED dnevna",
  ["color_temp", "xy"],
  { min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6329 }
);

const BRIGHTNESS_ONLY = makeEntity(
  "light.led_strip_kuhinja_main",
  "Kitchen Volume Strip",
  ["brightness"]
);

const RGB_ONLY = makeEntity(
  "light.rgb_bulb",
  "RGB Bulb",
  ["rgb"]
);

function makeMockHa(entities: EntityState[]): HomeAssistantClient {
  return {
    getEntities: vi.fn().mockResolvedValue(entities),
  } as unknown as HomeAssistantClient;
}

describe("DeviceScanner", () => {
  describe("buildProfile — white method", () => {
    it("RGBW strip uses rgbw_color even though color_temp is also listed", async () => {
      const scanner = new DeviceScanner(makeMockHa([WLED_RGBW]));
      await scanner.scan();
      const [profile] = scanner.getProfiles();
      expect(profile.whiteMethod.type).toBe("rgbw");
    });

    it("color_temp-only light uses color_temp_kelvin", async () => {
      const scanner = new DeviceScanner(makeMockHa([GLEDOPTO]));
      await scanner.scan();
      const [profile] = scanner.getProfiles();
      expect(profile.whiteMethod.type).toBe("color_temp");
      if (profile.whiteMethod.type === "color_temp") {
        expect(profile.whiteMethod.minKelvin).toBe(2000);
        expect(profile.whiteMethod.maxKelvin).toBe(6329);
      }
    });

    it("RGB-only light uses rgb_color [255,255,255] for white", async () => {
      const scanner = new DeviceScanner(makeMockHa([RGB_ONLY]));
      await scanner.scan();
      const [profile] = scanner.getProfiles();
      expect(profile.whiteMethod.type).toBe("rgb_white");
    });

    it("brightness-only light returns white method none", async () => {
      const scanner = new DeviceScanner(makeMockHa([BRIGHTNESS_ONLY]));
      await scanner.scan();
      const [profile] = scanner.getProfiles();
      expect(profile.whiteMethod.type).toBe("none");
    });
  });

  describe("buildProfile — color method", () => {
    it("RGBW strip gets rgb_color for color", async () => {
      const scanner = new DeviceScanner(makeMockHa([WLED_RGBW]));
      await scanner.scan();
      const [profile] = scanner.getProfiles();
      expect(profile.colorMethod.type).toBe("rgb_color");
    });

    it("xy-only light gets xy_color", async () => {
      const scanner = new DeviceScanner(makeMockHa([GLEDOPTO]));
      await scanner.scan();
      const [profile] = scanner.getProfiles();
      expect(profile.colorMethod.type).toBe("xy_color");
    });

    it("brightness-only returns color none", async () => {
      const scanner = new DeviceScanner(makeMockHa([BRIGHTNESS_ONLY]));
      await scanner.scan();
      const [profile] = scanner.getProfiles();
      expect(profile.colorMethod.type).toBe("none");
    });
  });

  describe("formatCheatSheet", () => {
    it("includes WLED warning for rgbw light", async () => {
      const scanner = new DeviceScanner(makeMockHa([WLED_RGBW]));
      await scanner.scan();
      const sheet = scanner.formatCheatSheet();
      expect(sheet).toContain("rgbw_color: [0,0,0,255]");
      expect(sheet).toContain("DO NOT use color_temp_kelvin");
    });

    it("includes color_temp range for Gledopto", async () => {
      const scanner = new DeviceScanner(makeMockHa([GLEDOPTO]));
      await scanner.scan();
      const sheet = scanner.formatCheatSheet();
      expect(sheet).toContain("color_temp_kelvin");
      expect(sheet).toContain("2000");
      expect(sheet).toContain("6329");
    });

    it("lists all lights", async () => {
      const scanner = new DeviceScanner(makeMockHa([WLED_RGBW, GLEDOPTO, BRIGHTNESS_ONLY]));
      await scanner.scan();
      const sheet = scanner.formatCheatSheet();
      expect(sheet).toContain("light.led_strip_colors_kitchen");
      expect(sheet).toContain("light.gledopto_gl_c_008p");
      expect(sheet).toContain("light.led_strip_kuhinja_main");
    });

    it("returns empty string if no profiles", () => {
      const scanner = new DeviceScanner(makeMockHa([]));
      const sheet = scanner.formatCheatSheet();
      expect(sheet).toBe("");
    });
  });

  describe("scan error handling", () => {
    it("keeps previous profiles if scan fails", async () => {
      const ha = makeMockHa([GLEDOPTO]);
      const scanner = new DeviceScanner(ha);
      await scanner.scan();
      expect(scanner.getProfiles()).toHaveLength(1);

      // Make scan fail
      (ha.getEntities as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("HA down"));
      await scanner.scan();

      // Still has previous profiles
      expect(scanner.getProfiles()).toHaveLength(1);
    });
  });

  describe("refreshIfStale", () => {
    it("rescans when interval elapsed", async () => {
      const ha = makeMockHa([GLEDOPTO]);
      const scanner = new DeviceScanner(ha, 100); // 100ms interval for test
      await scanner.scan();
      expect(ha.getEntities).toHaveBeenCalledTimes(1);

      await new Promise((r) => setTimeout(r, 150));
      await scanner.refreshIfStale();
      expect(ha.getEntities).toHaveBeenCalledTimes(2);
    });

    it("does not rescan within interval", async () => {
      const ha = makeMockHa([GLEDOPTO]);
      const scanner = new DeviceScanner(ha, 10000);
      await scanner.scan();
      await scanner.refreshIfStale();
      expect(ha.getEntities).toHaveBeenCalledTimes(1);
    });
  });
});
