import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";
import { MemoryStore } from "../memory/store.js";
import { FactExtractor } from "../memory/extractor.js";
import { HomeAssistantClient } from "../ha/client.js";
import { buildSystemPrompt } from "./prompts.js";
import { HA_TOOLS } from "./tools.js";

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

export class LLMClient {
  private anthropic: Anthropic;
  private memory: MemoryStore;
  private extractor: FactExtractor;
  private ha: HomeAssistantClient;
  private config: Config;

  constructor(
    config: Config,
    memory: MemoryStore,
    extractor: FactExtractor,
    ha: HomeAssistantClient
  ) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.memory = memory;
    this.extractor = extractor;
    this.ha = ha;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const { message, userId, isVoice = false } = request;
    const toolsUsed: string[] = [];

    // 1. Load user's memory
    const facts = this.memory.getFactsWithinTokenLimit(
      userId,
      this.config.memoryTokenLimit
    );
    const factContents = facts.map((f) => f.content);

    // 2. Build system prompt with memory
    const systemPrompt = buildSystemPrompt(factContents, isVoice);

    // 3. Initial Claude call - using Haiku for speed
    let response = await this.anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: isVoice ? 500 : 2048,
      system: systemPrompt,
      tools: HA_TOOLS,
      messages: [{ role: "user", content: message }],
    });

    // 4. Handle tool calls in a loop
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: message },
    ];

    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          toolsUsed.push(block.name);
          const result = await this.handleToolCall(
            block.name,
            block.input as Record<string, unknown>
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result, null, 2),
          });
        }
      }

      messages.push({ role: "user", content: toolResults });

      response = await this.anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: isVoice ? 500 : 2048,
        system: systemPrompt,
        tools: HA_TOOLS,
        messages,
      });
    }

    // 5. Extract final text response
    const textContent = response.content.find((c) => c.type === "text");
    const responseText = textContent?.type === "text" ? textContent.text : "";

    // 6. Extract and store new facts (async, don't block response)
    this.extractAndStoreFacts(userId, message, responseText).catch((err) =>
      console.error("Fact extraction failed:", err)
    );

    // Count facts learned (we don't wait for extraction, so return 0 for now)
    return {
      response: responseText,
      toolsUsed,
      factsLearned: 0,
    };
  }

  private async handleToolCall(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    try {
      switch (toolName) {
        case "get_state":
          return await this.ha.getState(input.entity_id as string);

        case "get_entities":
          return await this.ha.getEntities(input.domain as string | undefined);

        case "search_entities":
          return await this.ha.searchEntities(input.query as string);

        case "call_service":
          return await this.ha.callService(
            input.domain as string,
            input.service as string,
            input.entity_id as string | undefined,
            input.data as Record<string, unknown> | undefined
          );

        case "get_history":
          return await this.ha.getHistory(
            input.entity_id as string,
            input.start_time as string | undefined,
            input.end_time as string | undefined
          );

        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }

  private async extractAndStoreFacts(
    userId: string,
    userMessage: string,
    assistantResponse: string
  ): Promise<number> {
    const extractedFacts = await this.extractor.extract(
      userMessage,
      assistantResponse
    );

    let storedCount = 0;
    for (const fact of extractedFacts) {
      const id = this.memory.addFactIfNew(userId, fact.content, fact.category);
      if (id) {
        storedCount++;
        console.log(`Stored new fact for ${userId}: ${fact.content}`);
      }
    }

    return storedCount;
  }
}
