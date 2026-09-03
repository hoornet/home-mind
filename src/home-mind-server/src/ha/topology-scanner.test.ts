import { describe, it, expect, vi } from "vitest";
import { TopologyScanner, DEFAULT_LAYOUT_DOMAINS } from "./topology-scanner.js";
import type { HomeAssistantClient } from "./client.js";

// One kitchen holding a light, a sensor, and the config/diagnostic entities an
// integration creates by the dozen — the shape that makes the layout expensive.
const LAYOUT = {
  floors: [
    {
      id: "ground",
      name: "Ground floor",
      areas: [
        {
          id: "kitchen",
          name: "Kitchen",
          entities: [
            "light.kitchen",
            "sensor.kitchen_temperature",
            "button.kitchen_identify",
            "update.kitchen_firmware",
            "number.kitchen_transition",
            "select.kitchen_power_on_behaviour",
          ],
        },
      ],
    },
  ],
  unassigned: [
    { id: "garage", name: "Garage", entities: ["cover.garage_door", "event.garage_button"] },
  ],
};

function makeHa(layout: unknown = LAYOUT): HomeAssistantClient {
  return {
    renderTemplate: vi.fn().mockResolvedValue(JSON.stringify(layout)),
  } as unknown as HomeAssistantClient;
}

describe("TopologyScanner layout filtering", () => {
  it("drops config and diagnostic domains by default", async () => {
    const scanner = new TopologyScanner(makeHa());
    await scanner.scan();
    const section = scanner.formatSection();

    expect(section).toContain("light.kitchen");
    expect(section).toContain("sensor.kitchen_temperature");
    expect(section).toContain("cover.garage_door");

    expect(section).not.toContain("button.kitchen_identify");
    expect(section).not.toContain("update.kitchen_firmware");
    expect(section).not.toContain("number.kitchen_transition");
    expect(section).not.toContain("select.kitchen_power_on_behaviour");
    expect(section).not.toContain("event.garage_button");
  });

  it("keeps everything when the domain set is null", async () => {
    const scanner = new TopologyScanner(makeHa(), 30 * 60 * 1000, null);
    await scanner.scan();
    const section = scanner.formatSection();

    expect(section).toContain("button.kitchen_identify");
    expect(section).toContain("event.garage_button");
  });

  it("honours an explicit domain list", async () => {
    const scanner = new TopologyScanner(makeHa(), 30 * 60 * 1000, ["light"]);
    await scanner.scan();
    const section = scanner.formatSection();

    expect(section).toContain("light.kitchen");
    expect(section).not.toContain("sensor.kitchen_temperature");
    // The garage keeps nothing, so the room itself must not be listed empty.
    expect(section).not.toContain("Garage");
  });

  it("produces no layout at all when the filter empties every room", async () => {
    const scanner = new TopologyScanner(makeHa(), 30 * 60 * 1000, ["vacuum"]);
    await scanner.scan();

    // An empty layout section is worse than none: it would tell the model the
    // house has no devices. hasLayout() has to stay false so nothing is injected.
    expect(scanner.hasLayout()).toBe(false);
    expect(scanner.formatSection()).toBe("");
  });

  it("defaults to a set that covers what the model can act on and read", () => {
    for (const domain of ["light", "switch", "cover", "climate", "sensor", "binary_sensor"]) {
      expect(DEFAULT_LAYOUT_DOMAINS).toContain(domain);
    }
    for (const domain of ["button", "update", "number", "select", "event"]) {
      expect(DEFAULT_LAYOUT_DOMAINS).not.toContain(domain);
    }
  });

  it("keeps every input_* helper, since they are user-created controls", () => {
    // input_boolean was in and the rest were out, which was an arbitrary split:
    // they are the same kind of entity and none of them is ever diagnostic.
    for (const domain of [
      "input_boolean",
      "input_number",
      "input_select",
      "input_text",
      "input_datetime",
    ]) {
      expect(DEFAULT_LAYOUT_DOMAINS).toContain(domain);
    }
  });

  it("prefers the Assist exposure list over the domain default", async () => {
    // A button the user deliberately exposed, and a light they did not: the
    // domain default would decide both the other way round.
    const exposure = async () => new Set(["button.kitchen_identify", "cover.garage_door"]);
    const scanner = new TopologyScanner(makeHa(), 30 * 60 * 1000, DEFAULT_LAYOUT_DOMAINS, exposure);
    await scanner.scan();
    const section = scanner.formatSection();

    expect(section).toContain("button.kitchen_identify");
    expect(section).toContain("cover.garage_door");
    expect(section).not.toContain("light.kitchen");
    expect(section).not.toContain("sensor.kitchen_temperature");
  });

  it("falls back to domains when nothing is exposed", async () => {
    // Exposing nothing must not empty the layout — that would leave the model
    // believing the house has no devices.
    const scanner = new TopologyScanner(
      makeHa(),
      30 * 60 * 1000,
      DEFAULT_LAYOUT_DOMAINS,
      async () => new Set<string>()
    );
    await scanner.scan();

    expect(scanner.formatSection()).toContain("light.kitchen");
    expect(scanner.formatSection()).not.toContain("button.kitchen_identify");
  });

  it("falls back to domains when the exposure list cannot be read", async () => {
    const scanner = new TopologyScanner(
      makeHa(),
      30 * 60 * 1000,
      DEFAULT_LAYOUT_DOMAINS,
      async () => null
    );
    await scanner.scan();

    expect(scanner.formatSection()).toContain("light.kitchen");
    expect(scanner.formatSection()).not.toContain("button.kitchen_identify");
  });

  it("picks up an entity exposed after the first scan", async () => {
    let exposed = new Set(["light.kitchen"]);
    const scanner = new TopologyScanner(
      makeHa(),
      30 * 60 * 1000,
      DEFAULT_LAYOUT_DOMAINS,
      async () => exposed
    );
    await scanner.scan();
    expect(scanner.formatSection()).not.toContain("cover.garage_door");

    exposed = new Set(["light.kitchen", "cover.garage_door"]);
    await scanner.scan();
    expect(scanner.formatSection()).toContain("cover.garage_door");
  });

  it("keeps the previous layout when a scan fails", async () => {
    const ha = makeHa();
    const scanner = new TopologyScanner(ha);
    await scanner.scan();
    const good = scanner.formatSection();

    (ha.renderTemplate as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    await scanner.scan();

    expect(scanner.formatSection()).toBe(good);
  });
});
