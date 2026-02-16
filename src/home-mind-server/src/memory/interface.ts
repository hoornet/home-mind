/**
 * Memory Store Interface
 *
 * Common interface for long-term fact/memory backends (Shodh, etc.)
 * Conversation history is handled separately by IConversationStore.
 */

import type { Fact, FactCategory } from "./types.js";

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

  // Lifecycle
  isHealthy(): Promise<boolean>;
  close(): void;
}
