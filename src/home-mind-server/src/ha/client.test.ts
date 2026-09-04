import { describe, it, expect, beforeEach, vi } from "vitest";
import { HomeAssistantClient } from "./client.js";
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
