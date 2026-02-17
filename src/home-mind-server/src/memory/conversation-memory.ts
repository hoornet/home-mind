/**
 * In-memory conversation store.
 * Extracted from ShodhMemoryStore — preserves the original behavior exactly.
 * Conversations are lost on server restart.
 */

import type { ConversationMessage, ConversationSummary, IConversationStore } from "./types.js";

export class InMemoryConversationStore implements IConversationStore {
  private conversations = new Map<string, ConversationMessage[]>();
  private knownUsers = new Set<string>();

  storeMessage(
    conversationId: string,
    userId: string,
    role: "user" | "assistant",
    content: string
  ): string {
    this.knownUsers.add(userId);
    const id = crypto.randomUUID();
    const messages = this.conversations.get(conversationId) || [];
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

    this.conversations.set(conversationId, messages);
    return id;
  }

  getConversationHistory(
    conversationId: string,
    limit: number = 10
  ): ConversationMessage[] {
    const messages = this.conversations.get(conversationId) || [];
    return messages.slice(-limit);
  }

  listConversations(userId: string): ConversationSummary[] {
    const results: ConversationSummary[] = [];

    for (const [convId, messages] of this.conversations.entries()) {
      // Only include conversations belonging to this user
      const userMessages = messages.filter((m) => m.userId === userId);
      if (userMessages.length === 0) continue;

      const lastMsg = userMessages[userMessages.length - 1];
      results.push({
        conversationId: convId,
        lastMessage: lastMsg.content,
        lastMessageAt: lastMsg.createdAt,
        messageCount: messages.length,
      });
    }

    // Sort by most recent first
    results.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
    return results;
  }

  deleteConversation(conversationId: string): number {
    const messages = this.conversations.get(conversationId);
    if (!messages) return 0;
    const count = messages.length;
    this.conversations.delete(conversationId);
    return count;
  }

  getKnownUsers(): string[] {
    return [...this.knownUsers];
  }

  cleanupOldConversations(hoursOld: number = 24): number {
    const cutoff = Date.now() - hoursOld * 60 * 60 * 1000;
    let deleted = 0;

    for (const [convId, messages] of this.conversations.entries()) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.createdAt.getTime() < cutoff) {
        this.conversations.delete(convId);
        deleted += messages.length;
      }
    }

    return deleted;
  }

  close(): void {
    this.conversations.clear();
  }
}
