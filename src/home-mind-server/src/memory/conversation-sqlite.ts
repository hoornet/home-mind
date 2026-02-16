/**
 * SQLite-backed conversation store.
 * Conversations persist across server restarts.
 * Uses better-sqlite3 (synchronous) for simplicity.
 */

import Database from "better-sqlite3";
import type { ConversationMessage, IConversationStore } from "./types.js";

export class SqliteConversationStore implements IConversationStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    `);
  }

  storeMessage(
    conversationId: string,
    userId: string,
    role: "user" | "assistant",
    content: string
  ): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO messages (id, conversation_id, user_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, conversationId, userId, role, content, now);

    // Keep only last 20 messages per conversation
    this.db.prepare(
      `DELETE FROM messages WHERE id IN (
        SELECT id FROM messages
        WHERE conversation_id = ?
        ORDER BY rowid DESC
        LIMIT -1 OFFSET 20
      )`
    ).run(conversationId);

    return id;
  }

  getConversationHistory(
    conversationId: string,
    limit: number = 10
  ): ConversationMessage[] {
    const rows = this.db.prepare(
      `SELECT id, conversation_id, user_id, role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY rowid DESC
       LIMIT ?`
    ).all(conversationId, limit) as Array<{
      id: string;
      conversation_id: string;
      user_id: string;
      role: "user" | "assistant";
      content: string;
      created_at: string;
    }>;

    // Reverse to get chronological order (oldest first)
    return rows.reverse().map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      createdAt: new Date(row.created_at),
    }));
  }

  getKnownUsers(): string[] {
    const rows = this.db.prepare(
      `SELECT DISTINCT user_id FROM messages`
    ).all() as Array<{ user_id: string }>;

    return rows.map((row) => row.user_id);
  }

  cleanupOldConversations(hoursOld: number = 24): number {
    const cutoff = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

    const result = this.db.prepare(
      `DELETE FROM messages WHERE conversation_id IN (
        SELECT conversation_id FROM messages
        GROUP BY conversation_id
        HAVING MAX(created_at) < ?
      )`
    ).run(cutoff);

    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
