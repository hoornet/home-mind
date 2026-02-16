import type { Config } from "../config.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IConversationStore } from "../memory/types.js";
import { HomeAssistantClient } from "../ha/client.js";
import type { IChatEngine, IFactExtractor } from "./interface.js";
import { LLMClient } from "./client.js";
import { OpenAIChatEngine } from "./openai-client.js";
import { FactExtractor } from "../memory/extractor.js";
import { OpenAIFactExtractor } from "../memory/openai-extractor.js";

export function createChatEngine(
  config: Config,
  memory: IMemoryStore,
  conversations: IConversationStore,
  extractor: IFactExtractor,
  ha: HomeAssistantClient
): IChatEngine {
  switch (config.llmProvider) {
    case "openai":
      return new OpenAIChatEngine(config, memory, conversations, extractor, ha);
    case "ollama":
      return new OpenAIChatEngine(
        {
          ...config,
          openaiApiKey: "ollama",
          openaiBaseUrl: config.ollamaBaseUrl ?? "http://localhost:11434/v1",
        },
        memory,
        conversations,
        extractor,
        ha
      );
    case "anthropic":
      return new LLMClient(config, memory, conversations, extractor, ha);
  }
}

export function createFactExtractor(config: Config): IFactExtractor {
  switch (config.llmProvider) {
    case "openai":
      return new OpenAIFactExtractor(
        config.openaiApiKey!,
        config.llmModel,
        config.openaiBaseUrl
      );
    case "ollama":
      return new OpenAIFactExtractor(
        "ollama",
        config.llmModel,
        config.ollamaBaseUrl ?? "http://localhost:11434/v1"
      );
    case "anthropic":
      return new FactExtractor(config.anthropicApiKey!, config.llmModel);
  }
}
