/**
 * Periodic memory cleanup job.
 * Iterates over known users, fetches their stored facts,
 * runs them through garbage-detection patterns, and deletes matches.
 * Also cleans up stale conversation history.
 */

import type { IMemoryStore } from "../memory/interface.js";
import { matchesGarbagePattern } from "../memory/fact-patterns.js";

export interface CleanupResult {
  usersProcessed: number;
  factsAnalyzed: number;
  factsDeleted: number;
  conversationsDeleted: number;
}

export class MemoryCleanupJob {
  private timer: NodeJS.Timeout | null = null;
  private initialDelay: NodeJS.Timeout | null = null;

  constructor(
    private memory: IMemoryStore,
    private intervalHours: number
  ) {}

  /**
   * Start the periodic cleanup. First run after 30s delay, then every intervalHours.
   * No-op if intervalHours is 0 (disabled).
   */
  start(): void {
    if (this.intervalHours <= 0) {
      console.log("[cleanup] Memory cleanup disabled (interval = 0)");
      return;
    }

    const intervalMs = this.intervalHours * 60 * 60 * 1000;

    console.log(`[cleanup] Memory cleanup scheduled every ${this.intervalHours}h`);

    // Initial run after 30s (let server fully start)
    this.initialDelay = setTimeout(() => {
      this.runOnce().catch((err) => {
        console.error("[cleanup] Initial cleanup failed:", err);
      });

      // Then repeat on interval
      this.timer = setInterval(() => {
        this.runOnce().catch((err) => {
          console.error("[cleanup] Periodic cleanup failed:", err);
        });
      }, intervalMs);
    }, 30_000);
  }

  stop(): void {
    if (this.initialDelay) {
      clearTimeout(this.initialDelay);
      this.initialDelay = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<CleanupResult> {
    const users = this.memory.getKnownUsers();
    const result: CleanupResult = {
      usersProcessed: 0,
      factsAnalyzed: 0,
      factsDeleted: 0,
      conversationsDeleted: 0,
    };

    if (users.length === 0) {
      console.log("[cleanup] No known users, skipping fact cleanup");
    }

    for (const userId of users) {
      try {
        const facts = await this.memory.getFacts(userId);
        result.factsAnalyzed += facts.length;

        for (const fact of facts) {
          const reason = matchesGarbagePattern(fact.content, fact.confidence);
          if (reason) {
            const deleted = await this.memory.deleteFact(userId, fact.id);
            if (deleted) {
              result.factsDeleted++;
              console.log(`[cleanup] Deleted fact for ${userId}: "${fact.content}" — ${reason}`);
            }
          }
        }

        result.usersProcessed++;
      } catch (err) {
        console.error(`[cleanup] Failed to clean facts for ${userId}:`, err);
      }
    }

    // Clean up stale conversations
    try {
      result.conversationsDeleted = this.memory.cleanupOldConversations();
    } catch (err) {
      console.error("[cleanup] Failed to clean old conversations:", err);
    }

    console.log(
      `[cleanup] Done: ${result.usersProcessed} users, ` +
        `${result.factsAnalyzed} facts analyzed, ${result.factsDeleted} deleted, ` +
        `${result.conversationsDeleted} stale conversation messages removed`
    );

    return result;
  }
}
