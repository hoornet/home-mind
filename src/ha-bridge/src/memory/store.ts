import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import type { Fact, FactCategory, ConversationMessage } from "./types.js";
import type { IMemoryStore } from "./interface.js";

export class MemoryStore implements IMemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        confidence REAL DEFAULT 0.8,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
        use_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_facts_user_id ON facts(user_id);
      CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(user_id, category);

      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_id ON conversation_messages(conversation_id, created_at);
    `);
  }

  /**
   * Get all facts for a user, ordered by relevance (use count, recency)
   */
  async getFacts(userId: string): Promise<Fact[]> {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM facts
        WHERE user_id = ?
        ORDER BY use_count DESC, last_used DESC
      `
      )
      .all(userId) as any[];

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      content: row.content,
      category: row.category as FactCategory,
      confidence: row.confidence,
      createdAt: new Date(row.created_at),
      lastUsed: new Date(row.last_used),
      useCount: row.use_count,
    }));
  }

  /**
   * Get facts for a user, limited to approximately maxTokens
   * Rough estimate: 1 token ≈ 4 characters
   */
  async getFactsWithinTokenLimit(
    userId: string,
    maxTokens: number,
    _currentContext?: string // Unused in SQLite backend, used by Shodh
  ): Promise<Fact[]> {
    const facts = await this.getFacts(userId);
    const result: Fact[] = [];
    let tokenCount = 0;
    const charsPerToken = 4;

    for (const fact of facts) {
      const factTokens = Math.ceil(fact.content.length / charsPerToken);
      if (tokenCount + factTokens > maxTokens) break;
      result.push(fact);
      tokenCount += factTokens;
    }

    // Update last_used and use_count for retrieved facts
    if (result.length > 0) {
      const ids = result.map((f) => f.id);
      this.db
        .prepare(
          `
          UPDATE facts
          SET last_used = CURRENT_TIMESTAMP, use_count = use_count + 1
          WHERE id IN (${ids.map(() => "?").join(",")})
        `
        )
        .run(...ids);
    }

    return result;
  }

  /**
   * Add a new fact for a user
   */
  async addFact(
    userId: string,
    content: string,
    category: FactCategory,
    confidence: number = 0.8
  ): Promise<string> {
    const id = uuidv4();
    this.db
      .prepare(
        `
        INSERT INTO facts (id, user_id, content, category, confidence)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(id, userId, content, category, confidence);
    return id;
  }

  /**
   * Check if a similar fact already exists (simple exact match for now)
   */
  async factExists(userId: string, content: string): Promise<boolean> {
    const row = this.db
      .prepare(
        `
        SELECT id FROM facts
        WHERE user_id = ? AND content = ?
      `
      )
      .get(userId, content);
    return !!row;
  }

  /**
   * Add fact only if it doesn't already exist
   */
  async addFactIfNew(
    userId: string,
    content: string,
    category: FactCategory,
    confidence: number = 0.8
  ): Promise<string | null> {
    if (await this.factExists(userId, content)) {
      return null;
    }
    return this.addFact(userId, content, category, confidence);
  }

  /**
   * Delete a specific fact
   */
  async deleteFact(factId: string): Promise<boolean> {
    const result = this.db.prepare("DELETE FROM facts WHERE id = ?").run(factId);
    return result.changes > 0;
  }

  /**
   * Clear all facts for a user
   */
  async clearUserFacts(userId: string): Promise<number> {
    const result = this.db
      .prepare("DELETE FROM facts WHERE user_id = ?")
      .run(userId);
    return result.changes;
  }

  /**
   * Get fact count for a user
   */
  async getFactCount(userId: string): Promise<number> {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM facts WHERE user_id = ?")
      .get(userId) as { count: number };
    return row.count;
  }

  // ============== Conversation History Methods ==============

  /**
   * Store a message in conversation history
   */
  storeMessage(
    conversationId: string,
    userId: string,
    role: "user" | "assistant",
    content: string
  ): string {
    const id = uuidv4();
    this.db
      .prepare(
        `
        INSERT INTO conversation_messages (id, conversation_id, user_id, role, content)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(id, conversationId, userId, role, content);
    return id;
  }

  /**
   * Get conversation history for a conversation, limited to last N messages
   */
  getConversationHistory(
    conversationId: string,
    limit: number = 10
  ): ConversationMessage[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `
      )
      .all(conversationId, limit) as any[];

    // Reverse to get chronological order (oldest first)
    return rows.reverse().map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      role: row.role as "user" | "assistant",
      content: row.content,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Delete old conversations (older than specified hours)
   * Run periodically to clean up stale conversations
   */
  cleanupOldConversations(hoursOld: number = 24): number {
    const result = this.db
      .prepare(
        `
        DELETE FROM conversation_messages
        WHERE created_at < datetime('now', '-' || ? || ' hours')
      `
      )
      .run(hoursOld);
    return result.changes;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
