import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqliteConversationStore } from "./conversation-sqlite.js";

describe("SqliteConversationStore", () => {
  let store: SqliteConversationStore;

  beforeEach(() => {
    // Use in-memory SQLite for tests
    store = new SqliteConversationStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  it("stores and retrieves messages", () => {
    store.storeMessage("conv-1", "user-1", "user", "Hello");
    store.storeMessage("conv-1", "user-1", "assistant", "Hi there!");

    const history = store.getConversationHistory("conv-1");

    expect(history).toHaveLength(2);
    expect(history[0].content).toBe("Hello");
    expect(history[0].role).toBe("user");
    expect(history[1].content).toBe("Hi there!");
    expect(history[1].role).toBe("assistant");
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
    // Insert a message with a backdated timestamp directly
    const db = (store as unknown as { db: import("better-sqlite3").Database }).db;
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run("old-id", "conv-old", "user-1", "user", "Old message", oldDate);

    // Store a recent message in a different conversation
    store.storeMessage("conv-new", "user-1", "user", "New message");

    const deleted = store.cleanupOldConversations(24);
    expect(deleted).toBe(1);

    // Old conversation gone, new one remains
    expect(store.getConversationHistory("conv-old")).toHaveLength(0);
    expect(store.getConversationHistory("conv-new")).toHaveLength(1);
  });

  it("returns messages with createdAt as Date objects", () => {
    store.storeMessage("conv-1", "user-1", "user", "Hello");

    const history = store.getConversationHistory("conv-1");
    expect(history[0].createdAt).toBeInstanceOf(Date);
  });

  it("returns message id from storeMessage", () => {
    const id = store.storeMessage("conv-1", "user-1", "user", "Hello");
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("isolates conversations by id", () => {
    store.storeMessage("conv-1", "user-1", "user", "Message A");
    store.storeMessage("conv-2", "user-1", "user", "Message B");

    expect(store.getConversationHistory("conv-1")).toHaveLength(1);
    expect(store.getConversationHistory("conv-2")).toHaveLength(1);
    expect(store.getConversationHistory("conv-1")[0].content).toBe("Message A");
  });
});
