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

/**
 * The layout now arrives in two kinds of call — the structure, then entities for
 * a batch of areas — so the fake answers whichever it was asked for. `cap`
 * imitates Home Assistant's 262 144-character limit by refusing any render whose
 * result would be larger, which is the failure in home-mind#34.
 */
function makeHa(
  layout: any = LAYOUT,
  cap = Infinity,
  names: Record<string, string> = {}
): HomeAssistantClient {
  const areas: { id: string; name: string; entities: string[] }[] = [
    ...layout.floors.flatMap((f: any) => f.areas),
    ...layout.unassigned,
  ];
  const renderTemplate = vi.fn(async (template: string) => {
    if (template.includes("floor_name")) {
      const strip = (a: any) => ({ id: a.id, name: a.name, total: a.entities.length });
      return JSON.stringify({
        floors: layout.floors.map((f: any) => ({
          id: f.id,
          name: f.name,
          areas: f.areas.map(strip),
        })),
        unassigned: layout.unassigned.map(strip),
      });
    }
    const asked: string[] = JSON.parse(template.match(/for aid in (\[.*?\])/s)![1]);
    // The template prefilters by domain when the caller passed one.
    const doms: string[] | null = template.includes("e.split('.')[0] in ")
      ? JSON.parse(template.match(/e\.split\('\.'\)\[0\] in (\[.*?\])/s)![1])
      : null;
    const rows = asked.map((id) => {
      const area = areas.find((a) => a.id === id)!;
      const entities = doms
        ? area.entities.filter((e) => doms.includes(e.slice(0, e.indexOf("."))))
        : area.entities;
      const withNames = template.includes('state_attr(e, "friendly_name")');
      return {
        id,
        entities: withNames ? entities.map((e) => ({ id: e, name: names[e] ?? null })) : entities,
      };
    });
    const body = JSON.stringify(rows);
    if (body.length > cap) throw new Error(`HA API error 400: Error rendering template: Template output exceeded maximum size of ${cap} characters`);
    return body;
  });
  return { renderTemplate } as unknown as HomeAssistantClient;
}

/** A house the size of the one in home-mind#34. */
function bigHouse(areaCount: number, perArea: number) {
  const area = (i: number) => ({
    id: `area${i}`,
    name: `Area ${i}`,
    entities: Array.from({ length: perArea }, (_, j) =>
      j % 3 === 0 ? `light.a${i}_e${j}` : `number.a${i}_e${j}`
    ),
  });
  return {
    floors: [
      {
        id: "ground",
        name: "Ground floor",
        areas: Array.from({ length: areaCount }, (_, i) => area(i)),
      },
    ],
    unassigned: [],
  };
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

describe("TopologyScanner on a large home (home-mind#34)", () => {
  // Reported: 9 059 entities across 31 areas, and every scan failed with
  // "Template output exceeded maximum size of 262144 characters", so the layout
  // was never available at all.
  const CAP = 262144;

  it("still returns a layout where the old single call would have failed", async () => {
    const house = bigHouse(31, 292); // ~9 052 entities, like the report
    const ha = makeHa(house, CAP);
    const scanner = new TopologyScanner(ha);
    await scanner.scan();

    const section = scanner.formatSection();
    expect(section).toContain("Area 0");
    expect(section).toContain("Area 30");
    expect(section).toContain("light.a0_e0");
  });

  it("splits the request rather than giving up when one call is too big", async () => {
    // A cap low enough that even the domain-filtered batch has to be halved.
    const house = bigHouse(8, 400);
    const ha = makeHa(house, 4000);
    const scanner = new TopologyScanner(ha);
    await scanner.scan();

    const calls = (ha.renderTemplate as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(calls).toBeGreaterThan(2); // structure + more than one entity batch
    expect(scanner.formatSection()).toContain("light.a7_e0");
  });

  it("reads an area without names when only its bare ids fit", async () => {
    // 134 lights render in ~3 kB as ids and ~5 kB with the name field.
    const house = bigHouse(1, 400);
    const names = Object.fromEntries(
      house.floors[0].areas[0].entities.map((e: string) => [e, "Some light"])
    );
    const ha = makeHa(house, 4000, names);
    const scanner = new TopologyScanner(ha);
    await scanner.scan();

    const section = scanner.formatSection();
    expect(section).toContain("light.a0_e0");
    expect(section).not.toContain("(Some light)");
  });

  it("keeps the rest of the house when a single area cannot be read", async () => {
    // One area so large it cannot render alone. Losing it must not lose the home.
    const house = bigHouse(3, 10);
    house.floors[0].areas[1].entities = Array.from({ length: 5000 }, (_, j) => `light.huge_${j}`);
    const ha = makeHa(house, 3000);
    const scanner = new TopologyScanner(ha);
    await scanner.scan();

    const section = scanner.formatSection();
    expect(section).toContain("light.a0_e0");
    expect(section).toContain("light.a2_e0");
  });

  it("asks Home Assistant only for domains that could survive the filter", async () => {
    const ha = makeHa();
    await new TopologyScanner(ha).scan();
    const entityCalls = (ha.renderTemplate as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as string)
      .filter((t) => !t.includes("floor_name"));
    expect(entityCalls).toHaveLength(1);
    expect(entityCalls[0]).toContain('"light"');
    // The point of prefiltering: the config domains never cross the wire.
    expect(entityCalls[0]).not.toContain('"update"');
  });

  it("prefilters by the exposed entities' domains, not by our defaults", async () => {
    // Exposure wins over the domain heuristic, so a user who exposed a `number`
    // entity must still get it — prefiltering must not quietly drop it.
    const exposure = async () => new Set(["number.kitchen_transition"]);
    const ha = makeHa();
    const scanner = new TopologyScanner(ha, 30 * 60 * 1000, DEFAULT_LAYOUT_DOMAINS, exposure);
    await scanner.scan();

    const entityCall = (ha.renderTemplate as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as string)
      .find((t) => !t.includes("floor_name"))!;
    expect(entityCall).toContain('"number"');
    expect(scanner.formatSection()).toContain("number.kitchen_transition");
  });
});

describe("TopologyScanner scan log", () => {
  it("still reports how many entities the filter dropped", async () => {
    // The filtering now happens inside Home Assistant, so the scanner never sees
    // what it saved unless the structure call counts it. That number is the
    // layout's running cost in every system prompt, so it must not go quiet.
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await new TopologyScanner(makeHa()).scan();
    const line = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("[topology]"))!;
    log.mockRestore();
    expect(line).toContain("dropped");
    expect(line).toMatch(/\d+ entities/);
  });
});

describe("TopologyScanner entity names", () => {
  it("shows each entity's friendly name next to its id", async () => {
    const ha = makeHa(LAYOUT, Infinity, {
      "light.kitchen": "Kitchen ceiling",
      "cover.garage_door": "Garage Door",
    });
    const scanner = new TopologyScanner(ha);
    await scanner.scan();
    const text = scanner.formatSection();
    expect(text).toContain("light.kitchen (Kitchen ceiling)");
    expect(text).toContain("cover.garage_door (Garage Door)");
  });

  it("keeps a name with a line break or comma on one unambiguous entry", async () => {
    const ha = makeHa(LAYOUT, Infinity, { "light.kitchen": "Kitchen,\nmain" });
    const scanner = new TopologyScanner(ha);
    await scanner.scan();
    expect(scanner.formatSection()).toContain("light.kitchen (Kitchen main)");
  });

  it("falls back to the bare id when an entity has no name", async () => {
    const scanner = new TopologyScanner(makeHa());
    await scanner.scan();
    expect(scanner.formatSection()).toMatch(/light\.kitchen(,|$)/m);
    expect(scanner.formatSection()).not.toContain("(null)");
  });

  it("asks the template for the friendly names", async () => {
    const ha = makeHa();
    await new TopologyScanner(ha).scan();
    const templates = (ha.renderTemplate as any).mock.calls.map((c: any[]) => c[0] as string);
    expect(templates.some((t: string) => t.includes('state_attr(e, "friendly_name")'))).toBe(true);
  });
});
