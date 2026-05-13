/**
 * LLM Interface
 *
 * Provider-agnostic interfaces for chat and fact extraction.
 * Concrete implementations (Anthropic, OpenAI, etc.) implement these.
 */

import type { ExtractedFact, Fact } from "../memory/types.js";

// Chat types (LLM-agnostic)
export interface ChatRequest {
  message: string;
  userId: string;
  conversationId?: string;
  isVoice?: boolean;
  customPrompt?: string;
}

/**
 * Structured failure information emitted when chat produces no usable
 * response (no text and no tool call). The HA integration surfaces
 * `hint` to the user instead of the generic "I received your request but
 * got no response." fallback, so failures are diagnosable from HA Assist
 * without needing server logs.
 */
export interface ChatError {
  code:
    | "EMPTY_CONTENT"
    | "MAX_TOKENS_TRUNCATED"
    | "CONTENT_FILTERED";
  hint: string;
}

export interface ChatResponse {
  response: string;
  toolsUsed: string[];
  factsLearned: number;
  error?: ChatError;
}

export type StreamCallback = (chunk: string) => void;

// Provider interfaces
export interface IChatEngine {
  chat(request: ChatRequest, onChunk?: StreamCallback): Promise<ChatResponse>;
}

export interface IFactExtractor {
  extract(
    userMessage: string,
    assistantResponse: string,
    existingFacts?: Fact[]
  ): Promise<ExtractedFact[]>;
}
