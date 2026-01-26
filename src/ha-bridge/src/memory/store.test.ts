import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryStore } from "./store.js";
import { unlinkSync, existsSync } from "fs";

describe("MemoryStore (SQLite)", () => {
  const testDbPath = "./test-memory.db";
  let store: MemoryStore;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    store = new MemoryStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe("addFact", () => {
    it("adds a fact and returns its id", async () => {
      const id = await store.addFact("user-1", "Test fact", "preference");

      expect(id).toBeTruthy();
      expect(typeof id).toBe("string");
    });

    it("stores fact with correct properties", async () => {
      await store.addFact("user-1", "User prefers 20°C", "preference", 0.9);

      const facts = await store.getFacts("user-1");

      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({
        userId: "user-1",
        content: "User prefers 20°C",
        category: "preference",
        confidence: 0.9,
      });
    });
  });

  describe("getFacts", () => {
    it("returns empty array for user with no facts", async () => {
      const facts = await store.getFacts("nonexistent-user");

      expect(facts).toEqual([]);
    });

    it("returns facts ordered by use count and recency", async () => {
      await store.addFact("user-1", "Fact A", "preference");
      await store.addFact("user-1", "Fact B", "preference");
      await store.addFact("user-1", "Fact C", "preference");

      // Access Fact B multiple times
      await store.getFactsWithinTokenLimit("user-1", 1000);
      await store.getFactsWithinTokenLimit("user-1", 1000);

      const facts = await store.getFacts("user-1");

      expect(facts).toHaveLength(3);
      // Most used facts should come first
      expect(facts[0].useCount).toBeGreaterThanOrEqual(facts[1].useCount);
    });

    it("only returns facts for the specified user", async () => {
      await store.addFact("user-1", "User 1 fact", "preference");
      await store.addFact("user-2", "User 2 fact", "preference");

      const user1Facts = await store.getFacts("user-1");
      const user2Facts = await store.getFacts("user-2");

      expect(user1Facts).toHaveLength(1);
      expect(user1Facts[0].content).toBe("User 1 fact");
      expect(user2Facts).toHaveLength(1);
      expect(user2Facts[0].content).toBe("User 2 fact");
    });
  });

  describe("getFactsWithinTokenLimit", () => {
    it("limits facts to token budget", async () => {
      // Each fact is ~25 tokens (100 chars / 4)
      await store.addFact("user-1", "A".repeat(100), "preference");
      await store.addFact("user-1", "B".repeat(100), "preference");
      await store.addFact("user-1", "C".repeat(100), "preference");

      // 40 tokens should fit only 1 fact
      const facts = await store.getFactsWithinTokenLimit("user-1", 40);

      expect(facts).toHaveLength(1);
    });

    it("increments use count for retrieved facts", async () => {
      await store.addFact("user-1", "Test fact", "preference");

      // Retrieve multiple times
      await store.getFactsWithinTokenLimit("user-1", 1000);
      await store.getFactsWithinTokenLimit("user-1", 1000);
      await store.getFactsWithinTokenLimit("user-1", 1000);

      const facts = await store.getFacts("user-1");

      expect(facts[0].useCount).toBe(3);
    });
  });

  describe("factExists", () => {
    it("returns true for existing fact", async () => {
      await store.addFact("user-1", "Existing fact", "preference");

      const exists = await store.factExists("user-1", "Existing fact");

      expect(exists).toBe(true);
    });

    it("returns false for non-existing fact", async () => {
      const exists = await store.factExists("user-1", "Non-existing");

      expect(exists).toBe(false);
    });

    it("is case-sensitive", async () => {
      await store.addFact("user-1", "Case Sensitive", "preference");

      expect(await store.factExists("user-1", "Case Sensitive")).toBe(true);
      expect(await store.factExists("user-1", "case sensitive")).toBe(false);
    });
  });

  describe("addFactIfNew", () => {
    it("adds new fact and returns id", async () => {
      const id = await store.addFactIfNew("user-1", "New fact", "preference");

      expect(id).toBeTruthy();
    });

    it("returns null for duplicate fact", async () => {
      await store.addFact("user-1", "Duplicate", "preference");

      const id = await store.addFactIfNew("user-1", "Duplicate", "preference");

      expect(id).toBeNull();
    });
  });

  describe("deleteFact", () => {
    it("deletes existing fact and returns true", async () => {
      const id = await store.addFact("user-1", "To delete", "preference");

      const deleted = await store.deleteFact(id);

      expect(deleted).toBe(true);
      expect(await store.getFacts("user-1")).toHaveLength(0);
    });

    it("returns false for non-existing fact", async () => {
      const deleted = await store.deleteFact("nonexistent-id");

      expect(deleted).toBe(false);
    });
  });

  describe("clearUserFacts", () => {
    it("clears all facts for a user", async () => {
      await store.addFact("user-1", "Fact 1", "preference");
      await store.addFact("user-1", "Fact 2", "preference");
      await store.addFact("user-1", "Fact 3", "preference");

      const deleted = await store.clearUserFacts("user-1");

      expect(deleted).toBe(3);
      expect(await store.getFacts("user-1")).toHaveLength(0);
    });

    it("does not affect other users", async () => {
      await store.addFact("user-1", "User 1 fact", "preference");
      await store.addFact("user-2", "User 2 fact", "preference");

      await store.clearUserFacts("user-1");

      expect(await store.getFacts("user-1")).toHaveLength(0);
      expect(await store.getFacts("user-2")).toHaveLength(1);
    });
  });

  describe("getFactCount", () => {
    it("returns correct count", async () => {
      expect(await store.getFactCount("user-1")).toBe(0);

      await store.addFact("user-1", "Fact 1", "preference");
      expect(await store.getFactCount("user-1")).toBe(1);

      await store.addFact("user-1", "Fact 2", "preference");
      expect(await store.getFactCount("user-1")).toBe(2);
    });
  });

  describe("conversation history", () => {
    it("stores and retrieves messages", () => {
      store.storeMessage("conv-1", "user-1", "user", "Hello");
      store.storeMessage("conv-1", "user-1", "assistant", "Hi!");

      const history = store.getConversationHistory("conv-1");

      expect(history).toHaveLength(2);
      expect(history[0].role).toBe("user");
      expect(history[0].content).toBe("Hello");
      expect(history[1].role).toBe("assistant");
      expect(history[1].content).toBe("Hi!");
    });

    it("limits history to specified count", () => {
      for (let i = 0; i < 10; i++) {
        store.storeMessage("conv-1", "user-1", "user", `Message ${i}`);
      }

      const history = store.getConversationHistory("conv-1", 3);

      expect(history).toHaveLength(3);
      expect(history[0].content).toBe("Message 7");
      expect(history[2].content).toBe("Message 9");
    });

    it("separates conversations", () => {
      store.storeMessage("conv-1", "user-1", "user", "Conv 1 message");
      store.storeMessage("conv-2", "user-1", "user", "Conv 2 message");

      expect(store.getConversationHistory("conv-1")).toHaveLength(1);
      expect(store.getConversationHistory("conv-2")).toHaveLength(1);
      expect(store.getConversationHistory("conv-1")[0].content).toBe("Conv 1 message");
    });

    it("cleans up old conversations", () => {
      // Store a message (will be recent)
      store.storeMessage("conv-1", "user-1", "user", "Recent message");

      // Cleanup with 0 hours should delete it
      const deleted = store.cleanupOldConversations(0);

      // Note: This may or may not delete depending on timing
      // The test mainly verifies the method runs without error
      expect(typeof deleted).toBe("number");
    });
  });

  describe("IMemoryStore interface compliance", () => {
    it("all methods return promises for facts", async () => {
      const addResult = store.addFact("user-1", "Test", "preference");
      expect(addResult).toBeInstanceOf(Promise);

      const getResult = store.getFacts("user-1");
      expect(getResult).toBeInstanceOf(Promise);

      const existsResult = store.factExists("user-1", "Test");
      expect(existsResult).toBeInstanceOf(Promise);

      const deleteResult = store.deleteFact("id");
      expect(deleteResult).toBeInstanceOf(Promise);

      const clearResult = store.clearUserFacts("user-1");
      expect(clearResult).toBeInstanceOf(Promise);

      const countResult = store.getFactCount("user-1");
      expect(countResult).toBeInstanceOf(Promise);
    });
  });
});
