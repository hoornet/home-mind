import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryCleanupJob } from "./memory-cleanup.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IConversationStore } from "../memory/types.js";
import type { Fact } from "../memory/types.js";

function makeFact(overrides: Partial<Fact> & { id: string; content: string }): Fact {
  return {
    userId: "user-1",
    category: "preference",
    confidence: 0.8,
    createdAt: new Date(),
    lastUsed: new Date(),
    useCount: 1,
    ...overrides,
  };
}

describe("MemoryCleanupJob", () => {
  let memory: IMemoryStore;
  let conversations: IConversationStore;

  beforeEach(() => {
    vi.useFakeTimers();
    memory = {
      getFacts: vi.fn().mockResolvedValue([]),
      deleteFact: vi.fn().mockResolvedValue(true),
      // Stubs for unused methods
      getFactsWithinTokenLimit: vi.fn(),
      addFact: vi.fn(),
      addFacts: vi.fn(),
      factExists: vi.fn(),
      addFactIfNew: vi.fn(),
      clearUserFacts: vi.fn(),
      getFactCount: vi.fn(),
      isHealthy: vi.fn(),
      close: vi.fn(),
    } as unknown as IMemoryStore;

    conversations = {
      getKnownUsers: vi.fn().mockReturnValue(["user-1"]),
      cleanupOldConversations: vi.fn().mockReturnValue(0),
      storeMessage: vi.fn(),
      getConversationHistory: vi.fn(),
      close: vi.fn(),
    } as unknown as IConversationStore;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("deletes garbage facts and keeps good ones", async () => {
    const facts: Fact[] = [
      makeFact({ id: "good-1", content: "User prefers warm white in the evening" }),
      makeFact({ id: "bad-1", content: "Kitchen light is currently displaying red" }),
      makeFact({ id: "bad-2", content: "Light was set to blue by the assistant" }),
      makeFact({ id: "bad-3", content: "light.kitchen supports RGBW and color_temp modes" }),
      makeFact({ id: "good-2", content: "User's name is Jure and he lives in Prague" }),
    ];
    (memory.getFacts as ReturnType<typeof vi.fn>).mockResolvedValue(facts);

    const job = new MemoryCleanupJob(memory, conversations, 6);
    const result = await job.runOnce();

    expect(result.usersProcessed).toBe(1);
    expect(result.factsAnalyzed).toBe(5);
    expect(result.factsDeleted).toBe(3);
    expect(memory.deleteFact).toHaveBeenCalledWith("user-1", "bad-1");
    expect(memory.deleteFact).toHaveBeenCalledWith("user-1", "bad-2");
    expect(memory.deleteFact).toHaveBeenCalledWith("user-1", "bad-3");
    expect(memory.deleteFact).not.toHaveBeenCalledWith("user-1", "good-1");
    expect(memory.deleteFact).not.toHaveBeenCalledWith("user-1", "good-2");
  });

  it("interval=0 disables the job (start is no-op)", () => {
    const job = new MemoryCleanupJob(memory, conversations, 0);
    job.start();

    // Advance past initial delay — nothing should happen
    vi.advanceTimersByTime(60_000);
    expect(conversations.getKnownUsers).not.toHaveBeenCalled();

    job.stop();
  });

  it("handles empty user set as no-op", async () => {
    (conversations.getKnownUsers as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const job = new MemoryCleanupJob(memory, conversations, 6);
    const result = await job.runOnce();

    expect(result.usersProcessed).toBe(0);
    expect(result.factsAnalyzed).toBe(0);
    expect(result.factsDeleted).toBe(0);
    expect(memory.getFacts).not.toHaveBeenCalled();
  });

  it("calls cleanupOldConversations during each cycle", async () => {
    (conversations.cleanupOldConversations as ReturnType<typeof vi.fn>).mockReturnValue(5);

    const job = new MemoryCleanupJob(memory, conversations, 6);
    const result = await job.runOnce();

    expect(conversations.cleanupOldConversations).toHaveBeenCalled();
    expect(result.conversationsDeleted).toBe(5);
  });

  it("start() triggers initial run after 30s delay", async () => {
    const facts: Fact[] = [
      makeFact({ id: "bad-1", content: "Light is currently on right now in kitchen" }),
    ];
    (memory.getFacts as ReturnType<typeof vi.fn>).mockResolvedValue(facts);

    const job = new MemoryCleanupJob(memory, conversations, 6);
    job.start();

    // Before 30s — nothing runs
    expect(conversations.getKnownUsers).not.toHaveBeenCalled();

    // Advance past initial delay
    await vi.advanceTimersByTimeAsync(30_000);

    expect(conversations.getKnownUsers).toHaveBeenCalled();
    expect(memory.getFacts).toHaveBeenCalledWith("user-1");

    job.stop();
  });

  it("continues processing remaining users when one fails", async () => {
    (conversations.getKnownUsers as ReturnType<typeof vi.fn>).mockReturnValue(["user-fail", "user-ok"]);
    (memory.getFacts as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Shodh timeout"))
      .mockResolvedValueOnce([
        makeFact({ id: "good-1", userId: "user-ok", content: "User prefers dim lights in bedroom" }),
      ]);

    const job = new MemoryCleanupJob(memory, conversations, 6);
    const result = await job.runOnce();

    // user-fail failed, user-ok succeeded
    expect(result.usersProcessed).toBe(1);
    expect(result.factsAnalyzed).toBe(1);
  });
});
