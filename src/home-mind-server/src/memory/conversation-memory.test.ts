import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryConversationStore } from "./conversation-memory.js";

describe("InMemoryConversationStore", () => {
  let store: InMemoryConversationStore;

  beforeEach(() => {
    store = new InMemoryConversationStore();
  });

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

  it("returns empty array for unknown conversation", () => {
    const history = store.getConversationHistory("nonexistent");
    expect(history).toEqual([]);
  });

  it("tracks known users", () => {
    store.storeMessage("conv-1", "user-1", "user", "Hello");
    store.storeMessage("conv-2", "user-2", "user", "Hi");

    const users = store.getKnownUsers();
    expect(users).toContain("user-1");
    expect(users).toContain("user-2");
  });

  it("cleans up old conversations", () => {
    // Store a message, then manually backdate it
    store.storeMessage("conv-1", "user-1", "user", "Old message");

    // Access the internal state to backdate (for testing only)
    const history = store.getConversationHistory("conv-1");
    history[0].createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago

    const deleted = store.cleanupOldConversations(24);
    expect(deleted).toBe(1);

    const after = store.getConversationHistory("conv-1");
    expect(after).toHaveLength(0);
  });

  it("clears all data on close", () => {
    store.storeMessage("conv-1", "user-1", "user", "Hello");
    store.close();

    const history = store.getConversationHistory("conv-1");
    expect(history).toHaveLength(0);
  });
});
