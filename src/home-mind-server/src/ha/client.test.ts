import { describe, it, expect, beforeEach, vi } from "vitest";
import { HomeAssistantClient } from "./client.js";
import { AssistExposure } from "./exposure.js";
import type { Config } from "../config.js";

const baseConfig: Config = {
  haUrl: "http://supervisor/core",
  haToken: "test-token",
  haSkipTlsVerify: false,
} as Config;

describe("HomeAssistantClient.getHistory URL encoding", () => {
  let captured: string | undefined;

  beforeEach(() => {
    captured = undefined;
    global.fetch = vi.fn(async (input: unknown) => {
      captured = typeof input === "string" ? input : String(input);
      return new Response(JSON.stringify([[]]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
  });

  it("URL-encodes the `+` in `+HH:MM` tz offsets on start_time, end_time, and entity_id", async () => {
    const ha = new HomeAssistantClient(baseConfig);
    await ha.getHistory(
      "sensor.solaredge_current_power",
      "2026-05-11T00:00:00+02:00",
      "2026-05-11T09:46:47+02:00"
    );

    expect(captured).toBeDefined();
    // Raw `+` would be decoded as space by aiohttp on the HA side.
    expect(captured).not.toContain("+02:00");
    // Properly encoded forms.
    expect(captured).toContain("%2B02%3A00");
    expect(captured).toContain("end_time=2026-05-11T09%3A46%3A47%2B02%3A00");
  });

  it("still works for plain `Z` (UTC) timestamps", async () => {
    const ha = new HomeAssistantClient(baseConfig);
    await ha.getHistory(
      "sensor.foo",
      "2026-05-11T00:00:00Z",
      "2026-05-11T09:00:00Z"
    );

    expect(captured).toContain("end_time=2026-05-11T09%3A00%3A00Z");
  });
});

describe("HomeAssistantClient.callService and ?return_response", () => {
  // HA 400s a response-only service called WITHOUT ?return_response
  // ("Service call requires responses but caller did not ask for responses")
  // and a no-response service called WITH it ("Service does not support
  // responses"). The catalog at GET /api/services says which is which, so the
  // client decides from that, never from the caller. Same gap as nives #64.
  let calls: { url: string; method: string; body?: string }[];
  let catalogStatus: number;

  const catalog = [
    {
      domain: "weather",
      services: { get_forecasts: { response: { optional: false }, fields: { type: {} } } },
    },
    { domain: "light", services: { turn_on: { response: null }, turn_off: {} } },
    { domain: "conversation", services: { process: { response: { optional: true } } } },
  ];

  beforeEach(() => {
    calls = [];
    catalogStatus = 200;
    global.fetch = vi.fn(async (input: unknown, init?: unknown) => {
      const url = typeof input === "string" ? input : String(input);
      const opts = (init ?? {}) as { method?: string; body?: string };
      calls.push({ url, method: opts.method ?? "GET", body: opts.body });
      if (url.endsWith("/api/services")) {
        return new Response(catalogStatus === 200 ? JSON.stringify(catalog) : "nope", {
          status: catalogStatus,
          headers: { "Content-Type": "application/json" },
        });
      }
      const withResponse = url.includes("?return_response");
      return new Response(
        JSON.stringify(
          withResponse
            ? { changed_states: [], service_response: { "weather.forecast_home": { forecast: [] } } }
            : [{ entity_id: "light.kitchen", state: "on", attributes: {} }]
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;
  });

  const posts = () => calls.filter((c) => c.method === "POST");

  it("adds ?return_response for a response-only service and surfaces service_response", async () => {
    const client = new HomeAssistantClient(baseConfig);
    const result = await client.callService("weather", "get_forecasts", "weather.forecast_home", {
      type: "daily",
    });
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toMatch(/\/api\/services\/weather\/get_forecasts\?return_response$/);
    expect(JSON.parse(posts()[0].body!)).toEqual({ type: "daily", entity_id: "weather.forecast_home" });
    expect(result).toEqual({
      changed_states: [],
      service_response: { "weather.forecast_home": { forecast: [] } },
    });
  });

  it("adds it for an optional-response service as well", async () => {
    const client = new HomeAssistantClient(baseConfig);
    await client.callService("conversation", "process", undefined, { text: "hi" });
    expect(posts()[0].url).toMatch(/\?return_response$/);
  });

  it("never adds it for a service without a response, even when the caller hints", async () => {
    const client = new HomeAssistantClient(baseConfig);
    const result = await client.callService("light", "turn_on", "light.kitchen", {
      brightness: 255,
      return_response: true,
    });
    expect(posts()[0].url).toMatch(/\/api\/services\/light\/turn_on$/);
    // the hint is not a service field and must not reach HA
    expect(JSON.parse(posts()[0].body!)).toEqual({ brightness: 255, entity_id: "light.kitchen" });
    expect(result).toEqual([{ entity_id: "light.kitchen", state: "on", attributes: {} }]);
  });

  it("leaves it off for a service the catalog does not know, unless hinted", async () => {
    const client = new HomeAssistantClient(baseConfig);
    await client.callService("custom", "do_thing");
    expect(posts()[0].url).toMatch(/\/api\/services\/custom\/do_thing$/);
    await client.callService("custom", "do_thing", undefined, { return_response: true });
    expect(posts()[1].url).toMatch(/\/api\/services\/custom\/do_thing\?return_response$/);
  });

  it("falls back to a plain call when the catalog cannot be fetched", async () => {
    catalogStatus = 500;
    const client = new HomeAssistantClient(baseConfig);
    const result = await client.callService("light", "turn_off", "light.kitchen");
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toMatch(/\/api\/services\/light\/turn_off$/);
    expect(Array.isArray(result)).toBe(true);
  });

  it("fetches the catalog once and reuses it across calls", async () => {
    const client = new HomeAssistantClient(baseConfig);
    await client.callService("light", "turn_on", "light.a");
    await client.callService("light", "turn_off", "light.a");
    await client.callService("weather", "get_forecasts", "weather.forecast_home", { type: "daily" });
    expect(calls.filter((c) => c.url.endsWith("/api/services") && c.method === "GET")).toHaveLength(1);
    expect(posts()).toHaveLength(3);
  });
});

describe("HomeAssistantClient and the Assist exposure list", () => {
  // Home Assistant's own agent filters states.async_all() through
  // async_should_expose before anything sees it, so an unexposed entity does
  // not exist for the assistant — not in the prompt, and not through a tool.
  // Before this the layout honoured the user's choices while the tools went
  // straight to /api/states and returned the whole house.
  const house = [
    { entity_id: "light.kitchen_table", state: "on", attributes: { friendly_name: "Kitchen table" } },
    { entity_id: "light.kitchen_table_1", state: "off", attributes: { friendly_name: "Kitchen table 1" } },
    { entity_id: "light.kitchen_table_2", state: "off", attributes: { friendly_name: "Kitchen table 2" } },
    { entity_id: "sensor.kitchen_presence", state: "on", attributes: { friendly_name: "Kitchen presence" } },
  ];

  let calls: string[];

  beforeEach(() => {
    calls = [];
    global.fetch = vi.fn(async (input: unknown) => {
      const url = typeof input === "string" ? input : String(input);
      calls.push(url);
      if (url.includes("/api/services")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/history/period")) {
        return new Response(JSON.stringify([[]]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/states")) {
        return new Response(JSON.stringify(house), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const id = url.split("/api/states/")[1];
      const state = house.find((s) => s.entity_id === id);
      return new Response(JSON.stringify(state ?? { message: "Entity not found." }), {
        status: state ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
  });

  const exposing = (...ids: string[]) => new AssistExposure(async () => new Set(ids));

  it("search_entities returns only what the user exposed", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    const found = await client.searchEntities("kitchen");
    expect(found.map((s) => s.entity_id)).toEqual(["light.kitchen_table"]);
  });

  it("get_entities returns only what the user exposed", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    expect((await client.getEntities()).map((s) => s.entity_id)).toEqual(["light.kitchen_table"]);
    expect((await client.getEntities("sensor")).map((s) => s.entity_id)).toEqual([]);
  });

  it("get_state refuses an entity that exists but is not exposed", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(client.getState("light.kitchen_table_1")).rejects.toThrow(/not available to you/);
    // and never asks HA for it
    expect(calls.some((u) => u.includes("/api/states/light.kitchen_table_1"))).toBe(false);
  });

  it("get_history refuses an unexposed entity", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(client.getHistory("sensor.kitchen_presence")).rejects.toThrow(/not available to you/);
    expect(calls.some((u) => u.includes("/api/history"))).toBe(false);
  });

  it("call_service refuses to drive an unexposed entity", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(
      client.callService("light", "turn_on", "light.kitchen_table_1")
    ).rejects.toThrow(/not available to you/);
    expect(calls.some((u) => u.includes("/api/services/light/turn_on"))).toBe(false);
  });

  it("call_service checks entity_id smuggled in data, and every id in a list", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(
      client.callService("light", "turn_on", undefined, { entity_id: "light.kitchen_table_2" })
    ).rejects.toThrow(/not available to you/);
    await expect(
      client.callService("light", "turn_on", undefined, {
        entity_id: ["light.kitchen_table", "light.kitchen_table_2"],
      })
    ).rejects.toThrow(/kitchen_table_2/);
  });

  it("call_service splits a comma-separated entity_id", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(
      client.callService("light", "turn_on", "light.kitchen_table, light.kitchen_table_2")
    ).rejects.toThrow(/kitchen_table_2/);
  });

  it("call_service refuses area, device, floor and label targets, nested or not", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(
      client.callService("light", "turn_off", undefined, { area_id: "kitchen" })
    ).rejects.toThrow(/area_id is not available/);
    await expect(
      client.callService("light", "turn_off", undefined, { target: { label_id: "all_lights" } })
    ).rejects.toThrow(/label_id is not available/);
    await expect(
      client.callService("light", "turn_off", undefined, {
        target: { entity_id: "light.kitchen_table_2" },
      })
    ).rejects.toThrow(/kitchen_table_2/);
    expect(calls.some((u) => u.includes("/api/services/light/turn_off"))).toBe(false);
  });

  it("call_service refuses entity_id all", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(client.callService("light", "turn_off", "all")).rejects.toThrow(/entity_id "all"/);
  });

  it("script.<name> needs that script exposed; a call without a target passes", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table", "script.good_night"));
    await expect(client.callService("script", "garage_door")).rejects.toThrow(/script\.garage_door/);
    await client.callService("script", "good_night");
    await client.callService("notify", "notify", undefined, { message: "hi" });
    expect(calls.some((u) => u.includes("/api/services/script/garage_door"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/services/script/good_night"))).toBe(true);
  });

  it("indirect targets pass when the list has no opinion", async () => {
    const client = new HomeAssistantClient(baseConfig, new AssistExposure(async () => null));
    await client.callService("light", "turn_off", undefined, { area_id: "kitchen" });
    expect(calls.some((u) => u.includes("/api/services/light/turn_off"))).toBe(true);
  });

  it("lets an exposed entity through untouched", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    expect((await client.getState("light.kitchen_table")).state).toBe("on");
    await client.callService("light", "turn_on", "light.kitchen_table");
    expect(calls.some((u) => u.includes("/api/services/light/turn_on"))).toBe(true);
  });

  it("without an exposure list the client behaves exactly as before", async () => {
    const client = new HomeAssistantClient(baseConfig);
    expect((await client.searchEntities("kitchen")).map((s) => s.entity_id)).toEqual(
      house.map((s) => s.entity_id)
    );
    await client.callService("light", "turn_on", "light.kitchen_table_1");
    expect(calls.some((u) => u.includes("/api/services/light/turn_on"))).toBe(true);
  });

  it("a list that cannot be read means no opinion, not a house with no devices", async () => {
    const client = new HomeAssistantClient(baseConfig, new AssistExposure(async () => null));
    expect((await client.searchEntities("kitchen"))).toHaveLength(house.length);
    expect((await client.getState("sensor.kitchen_presence")).state).toBe("on");
  });
});

describe("HomeAssistantClient.searchEntities accent folding", () => {
  const states = [
    { entity_id: "switch.flush_1d_relay", state: "off", attributes: { friendly_name: "Garaz Dvere" } },
    { entity_id: "light.spalna_svetlo", state: "on", attributes: { friendly_name: "Spálňa svetlo" } },
    { entity_id: "light.kuchyna_svetlo", state: "on", attributes: { friendly_name: "Kuchyňa svetlo" } },
  ];

  beforeEach(() => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(states), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    ) as unknown as typeof fetch;
  });

  const ids = async (query: string) =>
    (await new HomeAssistantClient(baseConfig).searchEntities(query)).map((s) => s.entity_id);

  it("finds an unaccented name from an accented query", async () => {
    // The model asks in Slovak; the installer typed the name without accents.
    expect(await ids("garáž")).toEqual(["switch.flush_1d_relay"]);
  });

  it("finds an accented name from an unaccented query", async () => {
    // The other direction: speech-to-text drops the accents.
    expect(await ids("spalna")).toEqual(["light.spalna_svetlo"]);
  });

  it("still matches when both sides carry the same accents", async () => {
    expect(await ids("Kuchyňa")).toEqual(["light.kuchyna_svetlo"]);
  });

  it("does not turn folding into a match-everything", async () => {
    expect(await ids("terasa")).toEqual([]);
  });
});
