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
