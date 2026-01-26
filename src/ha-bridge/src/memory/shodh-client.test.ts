import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShodhMemoryClient, ShodhMemoryStore } from "./shodh-client.js";
import type { FactCategory } from "./types.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ShodhMemoryClient", () => {
  let client: ShodhMemoryClient;

  beforeEach(() => {
    client = new ShodhMemoryClient({
      baseUrl: "http://localhost:3030",
      apiKey: "test-api-key",
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("isHealthy", () => {
    it("returns true when health endpoint responds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "healthy" }),
      });

      const result = await client.isHealthy();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3030/health",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-API-Key": "test-api-key",
          }),
        })
      );
    });

    it("returns false when health endpoint fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await client.isHealthy();

      expect(result).toBe(false);
    });

    it("returns false when health endpoint returns non-ok status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const result = await client.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe("remember", () => {
    it("stores a memory and returns the id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "mem-123", success: true }),
      });

      const id = await client.remember(
        "user-1",
        "User prefers 20°C",
        "preference",
        0.9
      );

      expect(id).toBe("mem-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3030/api/remember",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            user_id: "user-1",
            content: "User prefers 20°C",
            memory_type: "Preference",
            importance: 0.9,
            tags: ["preference", "home-mind"],
          }),
        })
      );
    });

    it("maps category to correct Shodh memory type", async () => {
      const categoryMappings: [FactCategory, string][] = [
        ["baseline", "Observation"],
        ["preference", "Preference"],
        ["identity", "Context"],
        ["device", "Context"],
        ["pattern", "Observation"],
        ["correction", "Learning"],
      ];

      for (const [category, expectedType] of categoryMappings) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "mem-123", success: true }),
        });

        await client.remember("user-1", "test", category);

        const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const body = JSON.parse(lastCall[1].body);
        expect(body.memory_type).toBe(expectedType);
      }
    });
  });

  describe("recall", () => {
    it("retrieves memories and converts to Fact format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          memories: [
            {
              id: "mem-123",
              experience: {
                content: "User prefers 20°C",
                memory_type: "Preference",
                tags: ["preference", "home-mind"],
              },
              importance: 0.8,
              created_at: "2026-01-25T10:00:00Z",
              score: 0.95,
            },
          ],
          count: 1,
        }),
      });

      const facts = await client.recall("user-1", "temperature", 10);

      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({
        id: "mem-123",
        userId: "user-1",
        content: "User prefers 20°C",
        category: "preference",
        confidence: 0.8,
      });
      expect(facts[0].createdAt).toBeInstanceOf(Date);
    });

    it("sends correct query to API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories: [], count: 0 }),
      });

      await client.recall("user-1", "bedroom temperature", 5);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3030/api/recall",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            user_id: "user-1",
            query: "bedroom temperature",
            limit: 5,
          }),
        })
      );
    });

    it("uses default query when none provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories: [], count: 0 }),
      });

      await client.recall("user-1");

      const lastCall = mockFetch.mock.calls[0];
      const body = JSON.parse(lastCall[1].body);
      expect(body.query).toBe("all memories");
    });
  });

  describe("reinforce", () => {
    it("sends reinforce request with correct format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories_processed: 2 }),
      });

      await client.reinforce("user-1", ["mem-1", "mem-2"]);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3030/api/reinforce",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            user_id: "user-1",
            ids: ["mem-1", "mem-2"],
            outcome: "positive",
          }),
        })
      );
    });
  });

  describe("forget", () => {
    it("sends forget request with correct format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await client.forget("user-1", "mem-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3030/api/forget",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            user_id: "user-1",
            memory_id: "mem-123",
          }),
        })
      );
    });
  });
});

describe("ShodhMemoryStore", () => {
  let store: ShodhMemoryStore;

  beforeEach(() => {
    store = new ShodhMemoryStore({
      baseUrl: "http://localhost:3030",
      apiKey: "test-api-key",
    });
    mockFetch.mockReset();
  });

  describe("getFacts", () => {
    it("retrieves facts for a user", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          memories: [
            {
              id: "mem-1",
              experience: {
                content: "Fact 1",
                memory_type: "Context",
                tags: ["identity"],
              },
              importance: 0.5,
              created_at: "2026-01-25T10:00:00Z",
            },
          ],
          count: 1,
        }),
      });

      const facts = await store.getFacts("user-1");

      expect(facts).toHaveLength(1);
      expect(facts[0].content).toBe("Fact 1");
    });
  });

  describe("getFactsWithinTokenLimit", () => {
    it("limits facts to token budget", async () => {
      // Create facts with known content lengths
      const memories = [
        { id: "1", experience: { content: "Short", memory_type: "Context", tags: [] }, importance: 0.5, created_at: "2026-01-25T10:00:00Z" },
        { id: "2", experience: { content: "A".repeat(100), memory_type: "Context", tags: [] }, importance: 0.5, created_at: "2026-01-25T10:00:00Z" },
        { id: "3", experience: { content: "B".repeat(100), memory_type: "Context", tags: [] }, importance: 0.5, created_at: "2026-01-25T10:00:00Z" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories, count: 3 }),
      });

      // Mock the reinforce call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories_processed: 1 }),
      });

      // 50 tokens * 4 chars = 200 chars max
      // "Short" = 5 chars = ~2 tokens
      // 100 chars = 25 tokens
      // Should fit: Short + first 100-char = ~27 tokens
      const facts = await store.getFactsWithinTokenLimit("user-1", 50);

      expect(facts.length).toBeLessThanOrEqual(2);
    });

    it("reinforces retrieved facts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          memories: [
            { id: "mem-1", experience: { content: "Test", memory_type: "Context", tags: [] }, importance: 0.5, created_at: "2026-01-25T10:00:00Z" },
          ],
          count: 1,
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ memories_processed: 1 }),
      });

      await store.getFactsWithinTokenLimit("user-1", 100);

      // Wait for async reinforce
      await new Promise((r) => setTimeout(r, 10));

      // Check that reinforce was called
      const reinforceCall = mockFetch.mock.calls.find(
        (call) => call[0].includes("/api/reinforce")
      );
      expect(reinforceCall).toBeDefined();
    });
  });

  describe("addFact", () => {
    it("adds a fact and returns id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "new-mem-id", success: true }),
      });

      const id = await store.addFact("user-1", "New fact", "preference");

      expect(id).toBe("new-mem-id");
    });
  });

  describe("deleteFact", () => {
    it("deletes a fact and returns true", async () => {
      // First add a fact to populate the user map
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "mem-to-delete", success: true }),
      });
      await store.addFact("user-1", "To delete", "preference");

      // Now delete it
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await store.deleteFact("mem-to-delete");

      expect(result).toBe(true);
    });

    it("returns false when forget fails", async () => {
      mockFetch.mockRejectedValueOnce(new Error("API error"));

      const result = await store.deleteFact("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("conversation history (in-memory)", () => {
    it("stores and retrieves messages", () => {
      store.storeMessage("conv-1", "user-1", "user", "Hello");
      store.storeMessage("conv-1", "user-1", "assistant", "Hi there!");

      const history = store.getConversationHistory("conv-1");

      expect(history).toHaveLength(2);
      expect(history[0].content).toBe("Hello");
      expect(history[1].content).toBe("Hi there!");
    });

    it("limits history to last N messages", () => {
      for (let i = 0; i < 5; i++) {
        store.storeMessage("conv-1", "user-1", "user", `Message ${i}`);
      }

      const history = store.getConversationHistory("conv-1", 3);

      expect(history).toHaveLength(3);
      expect(history[0].content).toBe("Message 2");
      expect(history[2].content).toBe("Message 4");
    });

    it("keeps only last 20 messages per conversation", () => {
      for (let i = 0; i < 25; i++) {
        store.storeMessage("conv-1", "user-1", "user", `Message ${i}`);
      }

      const history = store.getConversationHistory("conv-1", 100);

      expect(history).toHaveLength(20);
      expect(history[0].content).toBe("Message 5");
      expect(history[19].content).toBe("Message 24");
    });
  });
});

describe("Integration tests (requires running Shodh)", () => {
  const SHODH_URL = process.env.SHODH_TEST_URL || "http://192.168.88.12:3030";
  const SHODH_API_KEY = process.env.SHODH_TEST_API_KEY || "";

  // Skip if no API key configured
  const describeIfShodh = SHODH_API_KEY ? describe : describe.skip;

  describeIfShodh("ShodhMemoryClient integration", () => {
    let client: ShodhMemoryClient;

    beforeEach(() => {
      // Restore real fetch for integration tests
      vi.unstubAllGlobals();
      client = new ShodhMemoryClient({
        baseUrl: SHODH_URL,
        apiKey: SHODH_API_KEY,
      });
    });

    afterEach(() => {
      // Re-stub fetch for other tests
      vi.stubGlobal("fetch", mockFetch);
    });

    it("can check health", async () => {
      const healthy = await client.isHealthy();
      expect(healthy).toBe(true);
    });

    it("can remember and recall", async () => {
      const testUser = `test-user-${Date.now()}`;
      const testContent = `Integration test memory ${Date.now()}`;

      // Remember
      const id = await client.remember(testUser, testContent, "preference");
      expect(id).toBeTruthy();

      // Recall
      const facts = await client.recall(testUser, testContent, 10);
      expect(facts.length).toBeGreaterThan(0);
      expect(facts.some((f) => f.content === testContent)).toBe(true);

      // Cleanup
      await client.forget(testUser, id);
    });
  });
});
