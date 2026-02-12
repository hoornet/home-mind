import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleToolCall, extractAndStoreFacts, normalizeTimestamp } from "./tool-handler.js";
import type { HomeAssistantClient } from "../ha/client.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";

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

describe("extractAndStoreFacts", () => {
  let memory: IMemoryStore;
  let extractor: IFactExtractor;

  beforeEach(() => {
    memory = {
      getFacts: vi.fn().mockResolvedValue([
        { id: "old-1", content: "old fact", category: "preference" },
      ]),
      addFact: vi.fn().mockResolvedValue("new-id"),
      deleteFact: vi.fn().mockResolvedValue(true),
    } as unknown as IMemoryStore;

    extractor = {
      extract: vi.fn().mockResolvedValue([
        {
          content: "User prefers 22°C",
          category: "preference",
          replaces: ["old-1"],
        },
      ]),
    } as unknown as IFactExtractor;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls getFacts, extract, deleteFact for replaced, addFact for new", async () => {
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
    expect(memory.deleteFact).toHaveBeenCalledWith("old-1");
    expect(memory.addFact).toHaveBeenCalledWith(
      "user-1",
      "User prefers 22°C",
      "preference"
    );
    expect(count).toBe(1);
  });

  it("stores multiple facts and returns correct count", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([
      { content: "Fact A", category: "preference", replaces: [] },
      { content: "Fact B", category: "identity", replaces: [] },
      { content: "Fact C", category: "baseline", replaces: [] },
    ]);

    const count = await extractAndStoreFacts(
      memory,
      extractor,
      "user-1",
      "msg",
      "resp"
    );

    expect(count).toBe(3);
    expect(memory.addFact).toHaveBeenCalledTimes(3);
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
    expect(memory.addFact).not.toHaveBeenCalled();
    expect(memory.deleteFact).not.toHaveBeenCalled();
  });

  it("does not call deleteFact when replaces is empty", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([
      { content: "New fact", category: "preference", replaces: [] },
    ]);

    await extractAndStoreFacts(memory, extractor, "user-1", "msg", "resp");

    expect(memory.deleteFact).not.toHaveBeenCalled();
  });

  it("does not call deleteFact when replaces is undefined", async () => {
    (extractor.extract as ReturnType<typeof vi.fn>).mockResolvedValue([
      { content: "New fact", category: "preference" },
    ]);

    await extractAndStoreFacts(memory, extractor, "user-1", "msg", "resp");

    expect(memory.deleteFact).not.toHaveBeenCalled();
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
