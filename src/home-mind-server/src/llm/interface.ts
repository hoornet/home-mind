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
}

export interface ChatResponse {
  response: string;
  toolsUsed: string[];
  factsLearned: number;
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
