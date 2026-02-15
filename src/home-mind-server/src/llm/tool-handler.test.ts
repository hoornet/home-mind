import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleToolCall, extractAndStoreFacts, filterExtractedFacts, normalizeTimestamp, truncateHistory } from "./tool-handler.js";
import type { HomeAssistantClient } from "../ha/client.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";
import type { ExtractedFact } from "../memory/types.js";

describe("handleToolCall", () => {
  let ha: HomeAssistantClient;

  beforeEach(() => {
    ha = {
      getState: vi.fn().mockResolvedValue({ state: "on" }),
      getEntities: vi.fn().mockResolvedValue([{ entity_id: "light.kitchen" }]),
      searchEntities: vi.fn().mockResolvedValue([{ entity_id: "light.bed" }]),
      callService: vi.fn().mockResolvedValue({ success: true }),
      getHistory: vi.fn().mockResolvedValue([{ state: "22" }]),
    } as unknown as HomeAssistantClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches get_state to ha.getState", async () => {
    const result = await handleToolCall(ha, "get_state", {
      entity_id: "light.kitchen",
    });

    expect(ha.getState).toHaveBeenCalledWith("light.kitchen");
    expect(result).toEqual({ state: "on" });
  });

  it("dispatches get_entities to ha.getEntities", async () => {
    const result = await handleToolCall(ha, "get_entities", {
      domain: "light",
    });

    expect(ha.getEntities).toHaveBeenCalledWith("light");
    expect(result).toEqual([{ entity_id: "light.kitchen" }]);
  });

  it("dispatches get_entities without domain", async () => {
    await handleToolCall(ha, "get_entities", {});

    expect(ha.getEntities).toHaveBeenCalledWith(undefined);
  });

  it("dispatches search_entities to ha.searchEntities", async () => {
    const result = await handleToolCall(ha, "search_entities", {
      query: "bedroom",
    });

    expect(ha.searchEntities).toHaveBeenCalledWith("bedroom");
    expect(result).toEqual([{ entity_id: "light.bed" }]);
  });

  it("dispatches call_service to ha.callService", async () => {
    const result = await handleToolCall(ha, "call_service", {
      domain: "light",
      service: "turn_on",
      entity_id: "light.kitchen",
      data: { brightness: 255 },
    });

    expect(ha.callService).toHaveBeenCalledWith("light", "turn_on", "light.kitchen", {
      brightness: 255,
    });
    expect(result).toEqual({ success: true });
  });

  it("dispatches get_history to ha.getHistory", async () => {
    const result = await handleToolCall(ha, "get_history", {
      entity_id: "sensor.temp",
      start_time: "2026-01-01T00:00:00Z",
      end_time: "2026-01-02T00:00:00Z",
    });

    expect(ha.getHistory).toHaveBeenCalledWith(
      "sensor.temp",
      "2026-01-01T00:00:00Z",
      "2026-01-02T00:00:00Z"
    );
    expect(result).toEqual([{ state: "22" }]);
  });

  it("returns error for unknown tool", async () => {
    const result = await handleToolCall(ha, "nonexistent_tool", {});

    expect(result).toEqual({ error: "Unknown tool: nonexistent_tool" });
  });

  it("wraps exceptions in error object", async () => {
    (ha.getState as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Connection refused")
    );

    const result = await handleToolCall(ha, "get_state", {
      entity_id: "light.kitchen",
    });

    expect(result).toEqual({ error: "Connection refused" });
  });

  it("wraps non-Error exceptions in error object", async () => {
    (ha.getState as ReturnType<typeof vi.fn>).mockRejectedValue("string error");

    const result = await handleToolCall(ha, "get_state", {
      entity_id: "light.kitchen",
    });

    expect(result).toEqual({ error: "string error" });
  });
});

describe("filterExtractedFacts", () => {
  it("keeps valid facts", () => {
    const facts: ExtractedFact[] = [
      { content: "User prefers 22°C for the bedroom", category: "preference", confidence: 0.9 },
    ];
    const { kept, skipped } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(1);
    expect(skipped).toHaveLength(0);
  });

  it("skips facts shorter than 10 characters", () => {
    const facts: ExtractedFact[] = [
      { content: "Too short", category: "preference", confidence: 0.9 },
    ];
    const { kept, skipped } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toContain("too short");
  });

  it("skips facts with transient state patterns", () => {
    const transientFacts: ExtractedFact[] = [
      { content: "Kitchen light is currently displaying red color", category: "device" },
      { content: "Sensor is showing 22 degrees right now in the bedroom", category: "baseline" },
      { content: "The light was just turned on by the assistant", category: "device" },
      { content: "Temperature is now set to 25 degrees", category: "device" },
    ];
    const { kept, skipped } = filterExtractedFacts(transientFacts);
    expect(kept).toHaveLength(0);
    expect(skipped).toHaveLength(4);
    for (const s of skipped) {
      expect(s.reason).toContain("transient");
    }
  });

  it("skips facts with confidence below 0.5", () => {
    const facts: ExtractedFact[] = [
      { content: "User might prefer warm lighting", category: "preference", confidence: 0.3 },
    ];
    const { kept, skipped } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(0);
    expect(skipped[0].reason).toContain("low confidence");
  });

  it("keeps facts without confidence field (defaults to acceptable)", () => {
    const facts: ExtractedFact[] = [
      { content: "User prefers lights dim in the evening", category: "preference" },
    ];
    const { kept } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(1);
  });

  it("skips device spec/capability dump facts", () => {
    const facts: ExtractedFact[] = [
      { content: "light.led_strip_colors_kitchen supports RGBW and color_temp modes", category: "device", confidence: 0.9 },
      { content: "light.kitchen supports 170 effects including rainbow and fire", category: "device", confidence: 0.8 },
      { content: "The entity has supported_color modes of rgbw and xy", category: "device", confidence: 0.85 },
      { content: "Device supports brightness and on_off color modes", category: "device", confidence: 0.9 },
      { content: "The light has a firmware version 2.1.3 installed", category: "device", confidence: 0.7 },
      { content: "Light strip supports rgb color mode natively", category: "device", confidence: 0.8 },
    ];
    const { kept, skipped } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(0);
    expect(skipped).toHaveLength(6);
    for (const s of skipped) {
      expect(s.reason).toContain("device spec");
    }
  });

  it("skips command echo facts (restating what assistant did)", () => {
    const facts: ExtractedFact[] = [
      { content: "Kitchen light was set to red color by the assistant", category: "device", confidence: 0.8 },
      { content: "Bedroom brightness was changed to 50 percent", category: "device", confidence: 0.7 },
      { content: "Living room light was turned off at night", category: "device", confidence: 0.8 },
      { content: "Temperature has been set to 22 degrees in the bedroom", category: "baseline", confidence: 0.8 },
      { content: "The light color has been changed to blue", category: "device", confidence: 0.7 },
    ];
    const { kept, skipped } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(0);
    expect(skipped).toHaveLength(5);
    for (const s of skipped) {
      expect(s.reason).toContain("command echo");
    }
  });

  it("does not false-positive on legitimate facts containing similar words", () => {
    const facts: ExtractedFact[] = [
      { content: "User's name is Jure and he supports open source projects", category: "identity", confidence: 0.9 },
      { content: "User prefers warm white color temperature for evenings", category: "preference", confidence: 0.85 },
      { content: "User calls the kitchen LED strip Big Bertha", category: "device", confidence: 0.9 },
    ];
    const { kept, skipped } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(3);
    expect(skipped).toHaveLength(0);
  });

  it("applies all filters and returns mixed results", () => {
    const facts: ExtractedFact[] = [
      { content: "User's name is Jure", category: "identity", confidence: 1.0 },
      { content: "short", category: "preference", confidence: 0.9 },
      { content: "Light is currently red in the kitchen", category: "device", confidence: 0.8 },
      { content: "Maybe the user likes blue lights", category: "preference", confidence: 0.2 },
    ];
    const { kept, skipped } = filterExtractedFacts(facts);
    expect(kept).toHaveLength(1);
    expect(kept[0].content).toBe("User's name is Jure");
    expect(skipped).toHaveLength(3);
  });
});

describe("extractAndStoreFacts", () => {
  let memory: IMemoryStore;
  let extractor: IFactExtractor;

  beforeEach(() => {
    memory = {
      getFacts: vi.fn().mockResolvedValue([
        { id: "old-1", content: "old fact", category: "preference" },
      ]),
      addFact: vi.fn().mockResolvedValue("new-id"),
      addFacts: vi.fn().mockResolvedValue(["new-id"]),
      deleteFact: vi.fn().mockResolvedValue(true),
    } as unknown as IMemoryStore;

    extractor = {
      extract: vi.fn().mockResolvedValue([
        {
          content: "User prefers 22°C for bedroom",
          category: "preference",
          confidence: 0.9,
          replaces: ["old-1"],
        },
      ]),
    } as unknown as IFactExtractor;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls getFacts, extract, deleteFact for replaced, addFacts for new", async () => {
    const count = await extractAndStoreFacts(
      memory,
      extractor,
      "user-1",
      "I prefer 22",
      "Got it!"
    );

    expect(memory.getFacts).toHaveBeenCalledWith("user-1");
    expect(extractor.extract).toHaveBeenCalledWith("I prefer 22", "Got it!", [
      { id: "old-1", content: "old fact", category: "preference" },
    ]);
    expect(memory.deleteFact).toHaveBeenCalledWith("user-1", "old-1");
    expect(memory.addFacts).toHaveBeenCalledWith("user-1", [
      { content: "User prefers 22°C for bedroom", category: "preference", confidence: 0.9 },
    ]);
    expect(count).toBe(1);
  });

  it("stores multiple facts via batch and returns correct count", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([
      { content: "Fact A is a long enough preference", category: "preference", confidence: 0.8, replaces: [] },
      { content: "Fact B is identity information", category: "identity", confidence: 0.9, replaces: [] },
      { content: "Fact C is baseline sensor data", category: "baseline", confidence: 0.7, replaces: [] },
    ]);
    (memory.addFacts as ReturnType<typeof vi.fn>).mockResolvedValue(["id-1", "id-2", "id-3"]);

    const count = await extractAndStoreFacts(
      memory,
      extractor,
      "user-1",
      "msg",
      "resp"
    );

    expect(count).toBe(3);
    expect(memory.addFacts).toHaveBeenCalledTimes(1);
  });

  it("returns 0 when extraction yields no facts", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const count = await extractAndStoreFacts(
      memory,
      extractor,
      "user-1",
      "msg",
      "resp"
    );

    expect(count).toBe(0);
    expect(memory.addFacts).not.toHaveBeenCalled();
    expect(memory.deleteFact).not.toHaveBeenCalled();
  });

  it("does not call deleteFact when replaces is empty", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([
      { content: "New fact about user preference", category: "preference", confidence: 0.8, replaces: [] },
    ]);

    await extractAndStoreFacts(memory, extractor, "user-1", "msg", "resp");

    expect(memory.deleteFact).not.toHaveBeenCalled();
  });

  it("does not call deleteFact when replaces is undefined", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([
      { content: "New fact about user preference", category: "preference", confidence: 0.8 },
    ]);

    await extractAndStoreFacts(memory, extractor, "user-1", "msg", "resp");

    expect(memory.deleteFact).not.toHaveBeenCalled();
  });

  it("filters out garbage facts before storing", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([
      { content: "User prefers 22°C for bedroom", category: "preference", confidence: 0.9, replaces: [] },
      { content: "Light is currently red in the kitchen", category: "device", confidence: 0.8, replaces: [] },
      { content: "too short", category: "preference", confidence: 0.9, replaces: [] },
    ]);
    (memory.addFacts as ReturnType<typeof vi.fn>).mockResolvedValue(["id-1"]);

    const count = await extractAndStoreFacts(
      memory,
      extractor,
      "user-1",
      "msg",
      "resp"
    );

    expect(count).toBe(1);
    expect(memory.addFacts).toHaveBeenCalledWith("user-1", [
      { content: "User prefers 22°C for bedroom", category: "preference", confidence: 0.9 },
    ]);
  });
});

describe("normalizeTimestamp", () => {
  it("passes through timestamps with Z suffix unchanged", () => {
    expect(normalizeTimestamp("2026-01-15T20:00:00Z")).toBe("2026-01-15T20:00:00Z");
    expect(normalizeTimestamp("2026-01-15T20:00:00.000Z")).toBe("2026-01-15T20:00:00.000Z");
  });

  it("passes through timestamps with +HH:MM offset unchanged", () => {
    expect(normalizeTimestamp("2026-01-15T20:00:00+01:00")).toBe("2026-01-15T20:00:00+01:00");
    expect(normalizeTimestamp("2026-01-15T20:00:00-05:00")).toBe("2026-01-15T20:00:00-05:00");
  });

  it("passes through timestamps with +HHMM offset unchanged", () => {
    expect(normalizeTimestamp("2026-01-15T20:00:00+0100")).toBe("2026-01-15T20:00:00+0100");
  });

  it("appends Z to bare timestamps", () => {
    expect(normalizeTimestamp("2026-01-15T20:00:00")).toBe("2026-01-15T20:00:00Z");
    expect(normalizeTimestamp("2026-01-15T20:00:00.000")).toBe("2026-01-15T20:00:00.000Z");
  });

  it("returns undefined for undefined input", () => {
    expect(normalizeTimestamp(undefined)).toBeUndefined();
  });
});

describe("handleToolCall get_history normalization", () => {
  let ha: HomeAssistantClient;

  beforeEach(() => {
    ha = {
      getState: vi.fn().mockResolvedValue({ state: "on" }),
      getEntities: vi.fn().mockResolvedValue([]),
      searchEntities: vi.fn().mockResolvedValue([]),
      callService: vi.fn().mockResolvedValue({ success: true }),
      getHistory: vi.fn().mockResolvedValue([{ state: "22" }]),
    } as unknown as HomeAssistantClient;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes bare start_time and end_time by appending Z", async () => {
    await handleToolCall(ha, "get_history", {
      entity_id: "sensor.temp",
      start_time: "2026-01-15T20:00:00",
      end_time: "2026-01-15T21:00:00",
    });

    expect(ha.getHistory).toHaveBeenCalledWith(
      "sensor.temp",
      "2026-01-15T20:00:00Z",
      "2026-01-15T21:00:00Z"
    );
  });

  it("passes through timestamps that already have timezone info", async () => {
    await handleToolCall(ha, "get_history", {
      entity_id: "sensor.temp",
      start_time: "2026-01-15T20:00:00+01:00",
      end_time: "2026-01-15T21:00:00Z",
    });

    expect(ha.getHistory).toHaveBeenCalledWith(
      "sensor.temp",
      "2026-01-15T20:00:00+01:00",
      "2026-01-15T21:00:00Z"
    );
  });

  it("passes undefined timestamps through without normalization", async () => {
    await handleToolCall(ha, "get_history", {
      entity_id: "sensor.temp",
    });

    expect(ha.getHistory).toHaveBeenCalledWith(
      "sensor.temp",
      undefined,
      undefined
    );
  });
});

describe("truncateHistory", () => {
  it("strips attributes and keeps all entries when under limit", () => {
    const entries = [
      { entity_id: "sensor.temp", state: "22", attributes: { unit: "°C", friendly_name: "Temperature", icon: "mdi:thermometer" }, last_changed: "2026-01-01T00:00:00Z", last_updated: "2026-01-01T00:00:00Z" },
      { entity_id: "sensor.temp", state: "23", attributes: { unit: "°C", friendly_name: "Temperature", icon: "mdi:thermometer" }, last_changed: "2026-01-01T01:00:00Z", last_updated: "2026-01-01T01:00:00Z" },
    ];

    const result = truncateHistory(entries);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ entity_id: "sensor.temp", state: "22", last_changed: "2026-01-01T00:00:00Z" });
    // No attributes in output
    expect((result[0] as any).attributes).toBeUndefined();
  });

  it("downsamples to MAX_HISTORY_ENTRIES when over limit", () => {
    const entries = Array.from({ length: 500 }, (_, i) => ({
      entity_id: "sensor.temp",
      state: String(20 + (i % 10)),
      attributes: { unit: "°C" },
      last_changed: `2026-01-01T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`,
      last_updated: `2026-01-01T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00Z`,
    }));

    const result = truncateHistory(entries);
    expect(result.length).toBeLessThanOrEqual(200);
    // First and last preserved
    expect(result[0].state).toBe(entries[0].state);
    expect(result[result.length - 1].state).toBe(entries[entries.length - 1].state);
  });

  it("returns empty array for empty input", () => {
    expect(truncateHistory([])).toEqual([]);
  });
});
