/**
 * Factory for creating the appropriate conversation store based on config.
 */

import type { Config } from "../config.js";
import type { IConversationStore } from "./types.js";
import { InMemoryConversationStore } from "./conversation-memory.js";
import { SqliteConversationStore } from "./conversation-sqlite.js";

export function createConversationStore(config: Config): IConversationStore {
  if (config.conversationStorage === "sqlite") {
    return new SqliteConversationStore(config.conversationDbPath);
  }
  return new InMemoryConversationStore();
}
