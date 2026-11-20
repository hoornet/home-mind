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
    { entity_id: "tts.piper", state: "unknown", attributes: { friendly_name: "Piper" } },
    { entity_id: "media_player.living_room_speaker", state: "idle", attributes: { friendly_name: "Living room speaker" } },
    { entity_id: "media_player.bedroom_speaker", state: "idle", attributes: { friendly_name: "Bedroom speaker" } },
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

  it("get_entities returns only what the user exposed, plus the voice engines", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    expect((await client.getEntities()).map((s) => s.entity_id)).toEqual(["light.kitchen_table", "tts.piper"]);
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

  it("call_service checks the entity maps and lists that scenes and groups take", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(
      client.callService("scene", "apply", undefined, {
        entities: { "light.kitchen_table": "on", "light.kitchen_table_1": "on" },
      })
    ).rejects.toThrow(/light\.kitchen_table_1 is not available/);
    await expect(
      client.callService("scene", "create", undefined, {
        scene_id: "before",
        snapshot_entities: ["sensor.kitchen_presence"],
      })
    ).rejects.toThrow(/sensor\.kitchen_presence is not available/);
    await expect(
      client.callService("group", "set", undefined, {
        object_id: "evening",
        add_entities: ["light.kitchen_table", "light.kitchen_table_2"],
      })
    ).rejects.toThrow(/kitchen_table_2 is not available/);
    // Home Assistant lower-cases entity ids, so a capitalised one must not slip past.
    await expect(
      client.callService("scene", "apply", undefined, { entities: { "Light.Kitchen_Table_2": "on" } })
    ).rejects.toThrow(/light\.kitchen_table_2 is not available/);
    expect(calls.some((u) => u.includes("/api/services/scene/"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/services/group/set"))).toBe(false);

    await client.callService("scene", "apply", undefined, {
      entities: { "light.kitchen_table": { state: "on", brightness: 120 } },
    });
    expect(calls.some((u) => u.includes("/api/services/scene/apply"))).toBe(true);
  });

  it("call_service refuses entity_id all", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
    await expect(client.callService("light", "turn_off", "all")).rejects.toThrow(/entity_id "all"/);
  });

  it("call_service announces with any voice engine, but only on an exposed speaker", async () => {
    const client = new HomeAssistantClient(
      baseConfig,
      exposing("light.kitchen_table", "media_player.living_room_speaker")
    );
    await client.callService("tts", "speak", undefined, {
      entity_id: "tts.piper",
      media_player_entity_id: "media_player.living_room_speaker",
      message: "Good morning",
    });
    expect(calls.some((u) => u.includes("/api/services/tts/speak"))).toBe(true);
    calls = [];
    await expect(
      client.callService("tts", "speak", undefined, {
        entity_id: "tts.piper",
        media_player_entity_id: "media_player.bedroom_speaker",
        message: "Good morning",
      })
    ).rejects.toThrow(/media_player\.bedroom_speaker is not available/);
    await expect(
      client.callService("media_player", "join", "media_player.living_room_speaker", {
        group_members: ["media_player.bedroom_speaker"],
      })
    ).rejects.toThrow(/media_player\.bedroom_speaker is not available/);
    expect(calls.some((u) => u.includes("/api/services/tts/speak"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/services/media_player/join"))).toBe(false);
  });

  it("script.<name> needs that script exposed; a call without a target passes", async () => {
    const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table", "script.good_night"));
    await expect(client.callService("script", "garage_door")).rejects.toThrow(/script\.garage_door/);
    await client.callService("script", "good_night");
    await client.callService("notify", "notify", undefined, { message: "hi" });
    expect(calls.some((u) => u.includes("/api/services/script/garage_door"))).toBe(false);
    expect(calls.some((u) => u.includes("/api/services/script/good_night"))).toBe(true);
  });

  it("refuses indirect targets while the list cannot be read, and when nothing is exposed", async () => {
    for (const answer of [null, new Set<string>()]) {
      const client = new HomeAssistantClient(baseConfig, new AssistExposure(async () => answer));
      await expect(
        client.callService("light", "turn_off", undefined, { area_id: "kitchen" })
      ).rejects.toThrow(/Targeting by area_id is not available/);
    }
    expect(calls.some((u) => u.includes("/api/services/light/"))).toBe(false);
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
      house.filter((s) => s.entity_id.includes("kitchen")).map((s) => s.entity_id)
    );
    expect(await client.getEntities()).toHaveLength(house.length);
    await client.callService("light", "turn_on", "light.kitchen_table_1");
    expect(calls.some((u) => u.includes("/api/services/light/turn_on"))).toBe(true);
  });

  it("a list that cannot be read allows nothing, and says why", async () => {
    const client = new HomeAssistantClient(baseConfig, new AssistExposure(async () => null));
    expect((await client.getEntities()).map((s) => s.entity_id)).toEqual(["tts.piper"]);
    expect(await client.searchEntities("kitchen")).toEqual([]);
    await expect(client.getState("sensor.kitchen_presence")).rejects.toThrow(
      /has not told the assistant yet/
    );
    await expect(client.callService("light", "turn_on", "light.kitchen_table")).rejects.toThrow(
      /has not told the assistant yet/
    );
    expect(calls.some((u) => u.includes("/api/services/light/"))).toBe(false);
  });

  it("an empty list allows nothing", async () => {
    const client = new HomeAssistantClient(baseConfig, new AssistExposure(async () => new Set()));
    expect((await client.getEntities()).map((s) => s.entity_id)).toEqual(["tts.piper"]);
    await expect(client.getState("light.kitchen_table")).rejects.toThrow(
      /light\.kitchen_table is not available to you/
    );
  });

  describe("names that reach a URL", () => {
    // Domains, services and entity ids become part of request paths, so only
    // plain, well-formed names get that far.
    const reached = () => calls.filter((u) => !u.endsWith("/api/states") && !u.endsWith("/api/services"));
    const exposing = (...ids: string[]) => new AssistExposure(async () => new Set(ids));

    it("refuses a domain or service that is not a plain name, before any request", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      for (const [domain, service] of [
        ["light/x", "turn_on"],
        ["light", "turn on"],
        ["light", "turn_on/x"],
        ["light", "turn_on?x=1"],
        ["Light", "turn_on"],
      ]) {
        await expect(client.callService(domain, service, "light.kitchen_table")).rejects.toThrow(
          /Invalid service (domain|name)/
        );
        await expect(
          client.callServiceAsAssistant(domain, service, "light.kitchen_table")
        ).rejects.toThrow(/Invalid service (domain|name)/);
      }
      expect(reached()).toEqual([]);
    });

    it("refuses an entity id that is not one entity, before any request", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      for (const id of [
        "light.kitchen_table/x",
        "Light Kitchen Table",
        "light.kitchen_table,sensor.kitchen_presence",
        "sensor",
      ]) {
        await expect(client.getState(id)).rejects.toThrow(/Invalid entity_id/);
        await expect(client.getHistory(id)).rejects.toThrow(/Invalid entity_id/);
      }
      expect(reached()).toEqual([]);
    });

    it("refuses malformed names with the exposure list turned off too", async () => {
      const client = new HomeAssistantClient(baseConfig);
      await expect(client.getState("light.kitchen_table/x")).rejects.toThrow(/Invalid entity_id/);
      await expect(client.callService("light/x", "turn_on")).rejects.toThrow(/Invalid service domain/);
      expect(reached()).toEqual([]);
    });

    it("reads an entity id written in capitals as Home Assistant stores it", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      expect((await client.getState(" Light.Kitchen_Table ")).state).toBe("on");
    });
  });

  describe("what the assistant may call", () => {
    const exposing = (...ids: string[]) => new AssistExposure(async () => new Set(ids));
    const posted = (service: string) => calls.some((u) => u.includes(`/api/services/${service}`));

    it("never calls a system service, even one handed an exposed entity", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      for (const [domain, service] of [
        ["homeassistant", "restart"],
        ["homeassistant", "stop"],
        ["hassio", "host_reboot"],
        ["hassio", "addon_stop"],
        ["shell_command", "open_gate"],
        ["rest_command", "open_gate"],
        ["mqtt", "publish"],
        ["backup", "create"],
        ["conversation", "process"],
      ]) {
        await expect(
          client.callServiceAsAssistant(domain, service, "light.kitchen_table")
        ).rejects.toThrow(/is not available to you/);
      }
      expect(calls.some((u) => u.includes("/api/services/"))).toBe(false);
    });

    it("never calls a system service with the exposure list turned off either", async () => {
      const client = new HomeAssistantClient(baseConfig);
      await expect(client.callServiceAsAssistant("homeassistant", "restart")).rejects.toThrow(
        /is not available to you/
      );
      expect(calls.some((u) => u.includes("/api/services/"))).toBe(false);
    });

    it("refuses a call that names nothing it acts on", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      await expect(client.callServiceAsAssistant("light", "turn_off")).rejects.toThrow(
        /names no entity/
      );
      await expect(
        client.callServiceAsAssistant("persistent_notification", "create", undefined, { message: "x" })
      ).rejects.toThrow(/is not available to you/);
      expect(calls.some((u) => u.includes("/api/services/"))).toBe(false);
    });

    it("still makes the ordinary calls", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      await client.callServiceAsAssistant("light", "turn_on", "light.kitchen_table");
      await client.callServiceAsAssistant("homeassistant", "turn_off", "light.kitchen_table");
      await client.callServiceAsAssistant("notify", "mobile_app_phone", undefined, { message: "Hi" });
      await client.callServiceAsAssistant("shopping_list", "add_item", undefined, { name: "milk" });
      for (const service of ["light/turn_on", "homeassistant/turn_off", "notify/mobile_app_phone", "shopping_list/add_item"]) {
        expect(posted(service)).toBe(true);
      }
    });

    it("refuses services outside the allowlist, whatever entity they name", async () => {
      const client = new HomeAssistantClient(
        baseConfig,
        exposing("light.kitchen_table", "media_player.living_room_speaker")
      );
      for (const [domain, service, entity, data] of [
        ["some_integration", "set_value", "light.kitchen_table", { value: 1 }],
        ["some_integration", "run", "media_player.living_room_speaker", {}],
        ["input_select", "set_options", "light.kitchen_table", { options: ["a"] }],
      ] as const) {
        await expect(
          client.callServiceAsAssistant(domain, service, entity, { ...data })
        ).rejects.toThrow(/is not available to you/);
      }
      expect(calls.some((u) => u.includes("/api/services/"))).toBe(false);
    });

    it("does not count a voice engine as a device to act on", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      await expect(client.callServiceAsAssistant("light", "turn_off", "tts.piper")).rejects.toThrow(
        /names no entity/
      );
      const speaking = new HomeAssistantClient(baseConfig, exposing("media_player.living_room_speaker"));
      await speaking.callServiceAsAssistant("tts", "speak", "tts.piper", {
        media_player_entity_id: "media_player.living_room_speaker",
        message: "Dobro jutro",
      });
      expect(posted("tts/speak")).toBe(true);
      expect(posted("light/")).toBe(false);
    });

    it("checks devices named inside a call's fields", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("script.good_night"));
      await expect(
        client.callServiceAsAssistant("script", "good_night", undefined, { light: "light.kitchen_table_1" })
      ).rejects.toThrow(/light\.kitchen_table_1 is not available to you/);
      expect(posted("script/")).toBe(false);
    });

    it("sends no notification when nothing is exposed, to another recipient, or as a phone command", async () => {
      const empty = new HomeAssistantClient(baseConfig, new AssistExposure(async () => new Set()));
      await expect(
        empty.callServiceAsAssistant("notify", "mobile_app_phone", undefined, { message: "hi" })
      ).rejects.toThrow(/has not exposed any devices/);
      const unread = new HomeAssistantClient(baseConfig, new AssistExposure(async () => null));
      await expect(
        unread.callServiceAsAssistant("shopping_list", "add_item", undefined, { name: "milk" })
      ).rejects.toThrow(/has not told the assistant yet/);
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      await expect(
        client.callServiceAsAssistant("notify", "email", undefined, { message: "hi", target: "x@example.com" })
      ).rejects.toThrow(/"target" is not available/);
      await expect(
        client.callServiceAsAssistant("notify", "mobile_app_phone", undefined, { message: "request_location_update" })
      ).rejects.toThrow(/command to the phone/);
      expect(calls.some((u) => u.includes("/api/services/"))).toBe(false);
    });

    it("plays only from allowed sources", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("media_player.living_room_speaker"));
      await expect(
        client.callServiceAsAssistant("media_player", "play_media", "media_player.living_room_speaker", {
          media_content_id: "media-source://some_source/item",
          media_content_type: "music",
        })
      ).rejects.toThrow(/is not available to you/);
      await client.callServiceAsAssistant("media_player", "play_media", "media_player.living_room_speaker", {
        media_content_id: "media-source://radio_browser/abc",
        media_content_type: "music",
      });
      expect(calls.filter((u) => u.includes("/api/services/media_player/play_media"))).toHaveLength(1);
    });

    it("stops sending security codes after a few", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("lock.front_door"));
      const reply = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
      global.fetch = vi.fn(async (input: unknown) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/api/states")) return reply(house);
        if (url.includes("/api/services/lock/unlock")) return reply({ message: "Invalid code" }, 400);
        return reply([]);
      }) as unknown as typeof fetch;
      for (let i = 0; i < 3; i++) {
        await expect(
          client.callServiceAsAssistant("lock", "unlock", "lock.front_door", { code: String(i) })
        ).rejects.toThrow(/HA API error 400/);
      }
      await expect(
        client.callServiceAsAssistant("lock", "unlock", "lock.front_door", { code: "3" })
      ).rejects.toThrow(/has been sent a code 3 times/);
      expect(calls.filter((u) => u.includes("/api/services/lock/unlock"))).toHaveLength(3);
    });

    it("leaves the server's own calls alone", async () => {
      const client = new HomeAssistantClient(baseConfig, exposing("light.kitchen_table"));
      await client.callService("persistent_notification", "create", undefined, { message: "x" });
      expect(posted("persistent_notification/create")).toBe(true);
    });
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
