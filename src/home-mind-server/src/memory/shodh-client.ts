/**
 * Shodh Memory REST API Client
 *
 * Implements cognitive memory with Hebbian learning, natural decay,
 * and semantic search via Shodh Memory service.
 *
 * API: https://github.com/varun29ankuS/shodh-memory
 */

import type { Fact, FactCategory, ConversationMessage } from "./types.js";

// Map our fact categories to Shodh memory types
const CATEGORY_TO_SHODH_TYPE: Record<FactCategory, string> = {
  baseline: "Observation",
  preference: "Preference",
  identity: "Context",
  device: "Context",
  pattern: "Observation",
  correction: "Learning",
};

// Reverse mapping for recall
const SHODH_TYPE_TO_CATEGORY: Record<string, FactCategory> = {
  Observation: "baseline",
  Preference: "preference",
  Context: "identity",
  Learning: "correction",
  Decision: "preference",
  Insight: "pattern",
  Error: "correction",
  Success: "pattern",
};

interface ShodhExperience {
  content: string;
  memory_type: string;
  tags: string[];
}

interface ShodhMemory {
  id: string;
  experience: ShodhExperience;
  importance: number;
  created_at: string;
  last_accessed?: string;
  access_count?: number;
  score?: number;
}

interface ShodhRecallResponse {
  memories: ShodhMemory[];
  count: number;
}

interface ShodhRememberResponse {
  id: string;
  success: boolean;
}

export interface ShodhConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export class ShodhMemoryClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;

  constructor(config: ShodhConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 60000; // 60s to handle Shodh cold start
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    body?: unknown,
    retries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
            "Connection": "keep-alive",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Shodh API error ${response.status}: ${text}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err as Error;

        // Don't retry on abort (timeout)
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err;
        }

        // Retry on all fetch failures (connection issues, socket errors, DNS)
        if (attempt < retries - 1) {
          const delay = Math.min(500 * Math.pow(2, attempt), 3000);
          console.log(`Shodh request failed (attempt ${attempt + 1}/${retries}), retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw lastError || new Error("Shodh request failed after retries");
  }

  /**
   * Check if Shodh service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.request("/health", "GET");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store a fact in Shodh memory
   */
  async remember(
    userId: string,
    content: string,
    category: FactCategory,
    confidence: number = 0.8
  ): Promise<string> {
    const memoryType = CATEGORY_TO_SHODH_TYPE[category];

    const response = await this.request<ShodhRememberResponse>(
      "/api/remember",
      "POST",
      {
        user_id: userId,
        content,
        memory_type: memoryType,
        importance: confidence,
        tags: [category, "home-mind"],
      }
    );

    return response.id;
  }

  /**
   * Recall memories using semantic search
   */
  async recall(
    userId: string,
    query?: string,
    limit: number = 50
  ): Promise<Fact[]> {
    const response = await this.request<ShodhRecallResponse>(
      "/api/recall",
      "POST",
      {
        user_id: userId,
        query: query || "all memories",
        limit,
      }
    );

    return response.memories.map((mem) => this.toFact(mem, userId));
  }

  /**
   * Recall memories by tags (faster than semantic search)
   * Falls back to regular recall since Shodh uses user_id for filtering
   */
  async recallByTags(userId: string, limit: number = 50): Promise<Fact[]> {
    // Shodh filters by user_id, so we just use regular recall
    return this.recall(userId, undefined, limit);
  }

  /**
   * Get proactive context - memories Shodh thinks are relevant
   */
  async getProactiveContext(
    userId: string,
    currentContext: string,
    limit: number = 20
  ): Promise<Fact[]> {
    // Use semantic search with the current context as query
    return this.recall(userId, currentContext, limit);
  }

  /**
   * Reinforce memories (Hebbian learning - strengthens the connection)
   */
  async reinforce(userId: string, memoryIds: string[]): Promise<void> {
    await this.request("/api/reinforce", "POST", {
      user_id: userId,
      ids: memoryIds,
      outcome: "positive",
    });
  }

  /**
   * Forget a memory explicitly
   */
  async forget(userId: string, memoryId: string): Promise<void> {
    await this.request("/api/forget", "POST", {
      user_id: userId,
      memory_id: memoryId,
    });
  }

  /**
   * Convert Shodh memory to our Fact type
   */
  private toFact(mem: ShodhMemory, userId: string): Fact {
    const exp = mem.experience;

    // Try to get category from tags
    let category: FactCategory = "preference";
    for (const tag of exp.tags) {
      if (
        ["baseline", "preference", "identity", "device", "pattern", "correction"].includes(
          tag
        )
      ) {
        category = tag as FactCategory;
        break;
      }
    }

    // Fallback to mapping from memory_type
    if (exp.memory_type in SHODH_TYPE_TO_CATEGORY) {
      category = SHODH_TYPE_TO_CATEGORY[exp.memory_type];
    }

    return {
      id: mem.id,
      userId,
      content: exp.content,
      category,
      confidence: mem.importance,
      createdAt: new Date(mem.created_at),
      lastUsed: mem.last_accessed ? new Date(mem.last_accessed) : new Date(mem.created_at),
      useCount: mem.access_count || 0,
    };
  }
}

/**
 * Memory store that uses Shodh for long-term facts and in-memory storage
 * for short-term conversation history. Shodh excels at semantic memory;
 * conversation state is transient and lost on restart (by design).
 */
export class ShodhMemoryStore {
  private shodh: ShodhMemoryClient;
  private conversationDb: Map<string, ConversationMessage[]> = new Map();

  constructor(shodhConfig: ShodhConfig) {
    this.shodh = new ShodhMemoryClient(shodhConfig);
  }

  /**
   * Check if Shodh is available
   */
  async isHealthy(): Promise<boolean> {
    return this.shodh.isHealthy();
  }

  /**
   * Get all facts for a user using semantic recall
   */
  async getFacts(userId: string): Promise<Fact[]> {
    return this.shodh.recallByTags(userId, 100);
  }

  /**
   * Get facts within a token limit, using proactive context for relevance
   */
  async getFactsWithinTokenLimit(
    userId: string,
    maxTokens: number,
    currentContext?: string
  ): Promise<Fact[]> {
    // Use proactive context if we have current context, otherwise use tag recall
    const facts = currentContext
      ? await this.shodh.getProactiveContext(userId, currentContext, 50)
      : await this.shodh.recallByTags(userId, 50);

    // Trim to token limit
    const result: Fact[] = [];
    let tokenCount = 0;
    const charsPerToken = 4;

    for (const fact of facts) {
      const factTokens = Math.ceil(fact.content.length / charsPerToken);
      if (tokenCount + factTokens > maxTokens) break;
      result.push(fact);
      tokenCount += factTokens;
    }

    // Reinforce retrieved facts (Hebbian learning) - batch operation
    if (result.length > 0) {
      const ids = result.map((f) => f.id);
      this.shodh.reinforce(userId, ids).catch(() => {
        // Non-critical, ignore errors
      });
    }

    return result;
  }

  /**
   * Add a new fact
   */
  async addFact(
    userId: string,
    content: string,
    category: FactCategory,
    confidence: number = 0.8
  ): Promise<string> {
    return this.shodh.remember(userId, content, category, confidence);
  }

  /**
   * Check if a fact exists (semantic similarity check)
   * With Shodh, we rely on semantic deduplication
   */
  async factExists(userId: string, content: string): Promise<boolean> {
    const similar = await this.shodh.recall(userId, content, 5);
    // Check if any memory is very similar (this is approximate)
    return similar.some(
      (fact) =>
        fact.content.toLowerCase().includes(content.toLowerCase().slice(0, 50)) ||
        content.toLowerCase().includes(fact.content.toLowerCase().slice(0, 50))
    );
  }

  /**
   * Add fact if it doesn't already exist
   */
  async addFactIfNew(
    userId: string,
    content: string,
    category: FactCategory,
    confidence: number = 0.8
  ): Promise<string | null> {
    // Shodh handles deduplication via semantic similarity
    // We can just add and let it manage
    return this.addFact(userId, content, category, confidence);
  }

  /**
   * Delete a fact explicitly
   */
  async deleteFact(userId: string, factId: string): Promise<boolean> {
    try {
      await this.shodh.forget(userId, factId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all facts for a user
   */
  async clearUserFacts(userId: string): Promise<number> {
    const facts = await this.getFacts(userId);
    let deleted = 0;
    for (const fact of facts) {
      try {
        await this.shodh.forget(userId, fact.id);
        deleted++;
      } catch {
        // Ignore individual failures
      }
    }
    return deleted;
  }

  /**
   * Get fact count for a user
   */
  async getFactCount(userId: string): Promise<number> {
    const facts = await this.shodh.recallByTags(userId, 1000);
    return facts.length;
  }

  // ============== Conversation History (in-memory for now) ==============
  // Shodh is optimized for long-term memory, not short-term conversation state.
  // We use a simple in-memory store for conversation history.

  storeMessage(
    conversationId: string,
    userId: string,
    role: "user" | "assistant",
    content: string
  ): string {
    const id = crypto.randomUUID();
    const messages = this.conversationDb.get(conversationId) || [];
    messages.push({
      id,
      conversationId,
      userId,
      role,
      content,
      createdAt: new Date(),
    });

    // Keep only last 20 messages per conversation
    if (messages.length > 20) {
      messages.shift();
    }

    this.conversationDb.set(conversationId, messages);
    return id;
  }

  getConversationHistory(
    conversationId: string,
    limit: number = 10
  ): ConversationMessage[] {
    const messages = this.conversationDb.get(conversationId) || [];
    return messages.slice(-limit);
  }

  cleanupOldConversations(hoursOld: number = 24): number {
    const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;
    let deleted = 0;

    for (const [convId, messages] of this.conversationDb.entries()) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.createdAt.getTime() < cutoff) {
        this.conversationDb.delete(convId);
        deleted += messages.length;
      }
    }

    return deleted;
  }

  close(): void {
    this.conversationDb.clear();
  }
}
