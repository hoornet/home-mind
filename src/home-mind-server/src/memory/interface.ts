/**
 * Memory Store Interface
 *
 * Common interface for memory backends (SQLite, Shodh, etc.)
 * All methods return Promises for consistency across sync/async backends.
 */

import type { Fact, FactCategory, ConversationMessage } from "./types.js";

export interface IMemoryStore {
  // Fact operations
  getFacts(userId: string): Promise<Fact[]>;
  getFactsWithinTokenLimit(
    userId: string,
    maxTokens: number,
    currentContext?: string
  ): Promise<Fact[]>;
  addFact(
    userId: string,
    content: string,
    category: FactCategory,
    confidence?: number
  ): Promise<string>;
  addFacts(
    userId: string,
    facts: { content: string; category: FactCategory; confidence?: number }[]
  ): Promise<string[]>;
  factExists(userId: string, content: string): Promise<boolean>;
  addFactIfNew(
    userId: string,
    content: string,
    category: FactCategory,
    confidence?: number
  ): Promise<string | null>;
  deleteFact(userId: string, factId: string): Promise<boolean>;
  clearUserFacts(userId: string): Promise<number>;
  getFactCount(userId: string): Promise<number>;

  // Conversation history
  storeMessage(
    conversationId: string,
    userId: string,
    role: "user" | "assistant",
    content: string
  ): string;
  getConversationHistory(
    conversationId: string,
    limit?: number
  ): ConversationMessage[];
  cleanupOldConversations(hoursOld?: number): number;

  // Lifecycle
  close(): void;
}
