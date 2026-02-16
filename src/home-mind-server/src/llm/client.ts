import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "../config.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IConversationStore } from "../memory/types.js";
import { HomeAssistantClient } from "../ha/client.js";
import { buildSystemPrompt, type CachedSystemPrompt } from "./prompts.js";
import { HA_TOOLS } from "./tools.js";
import { handleToolCall, extractAndStoreFacts } from "./tool-handler.js";
import type {
  ChatRequest,
  ChatResponse,
  StreamCallback,
  IChatEngine,
  IFactExtractor,
} from "./interface.js";

export type { ChatRequest, ChatResponse, StreamCallback };

export class LLMClient implements IChatEngine {
  private anthropic: Anthropic;
  private memory: IMemoryStore;
  private conversations: IConversationStore;
  private extractor: IFactExtractor;
  private ha: HomeAssistantClient;
  private config: Config;

  constructor(
    config: Config,
    memory: IMemoryStore,
    conversations: IConversationStore,
    extractor: IFactExtractor,
    ha: HomeAssistantClient
  ) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
    this.memory = memory;
    this.conversations = conversations;
    this.extractor = extractor;
    this.ha = ha;
  }

  /**
   * Chat with streaming - uses Anthropic's streaming API for faster time-to-first-token.
   * Optional onChunk callback receives text chunks as they arrive.
   */
  async chat(
    request: ChatRequest,
    onChunk?: StreamCallback
  ): Promise<ChatResponse> {
    const { message, userId, conversationId, isVoice = false, customPrompt } = request;
    const toolsUsed: string[] = [];

    // 1. Load user's memory (pass current message as context for Shodh's proactive retrieval)
    const facts = await this.memory.getFactsWithinTokenLimit(
      userId,
      this.config.memoryTokenLimit,
      message
    );
    const factContents = facts.map((f) => f.content);

    // 2. Build system prompt with memory
    const systemPrompt = buildSystemPrompt(factContents, isVoice, customPrompt);

    // 3. Load conversation history if we have a conversationId
    const messages: Anthropic.MessageParam[] = [];

    if (conversationId) {
      const history = await this.conversations.getConversationHistory(conversationId, 10);
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // 4. Add current user message
    messages.push({ role: "user", content: message });

    // Store user message in conversation history
    if (conversationId) {
      this.conversations.storeMessage(conversationId, userId, "user", message);
    }

    let response = await this.streamMessage(
      systemPrompt,
      messages,
      isVoice,
      onChunk
    );

    // 4. Handle tool calls in a loop
    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      // Execute tools in parallel for better performance
      const toolBlocks = assistantContent.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolPromises = toolBlocks.map(async (block) => {
        toolsUsed.push(block.name);
        const result = await handleToolCall(
          this.ha,
          block.name,
          block.input as Record<string, unknown>
        );
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: JSON.stringify(result, null, 2),
        };
      });

      const results = await Promise.all(toolPromises);
      toolResults.push(...results);

      messages.push({ role: "user", content: toolResults });

      // Continue with streaming for the follow-up response
      response = await this.streamMessage(
        systemPrompt,
        messages,
        isVoice,
        onChunk
      );
    }

    // 5. Extract final text response
    const textContent = response.content.find((c) => c.type === "text");
    const responseText = textContent?.type === "text" ? textContent.text : "";

    // 6. Store assistant response in conversation history
    if (conversationId && responseText) {
      this.conversations.storeMessage(conversationId, userId, "assistant", responseText);
    }

    // 7. Extract and store new facts (async, don't block response)
    extractAndStoreFacts(
      this.memory,
      this.extractor,
      userId,
      message,
      responseText
    ).catch((err) => console.error("Fact extraction failed:", err));

    // Count facts learned (we don't wait for extraction, so return 0 for now)
    return {
      response: responseText,
      toolsUsed,
      factsLearned: 0,
    };
  }

  /**
   * Stream a message and return the final message object.
   * Calls onChunk with text deltas as they arrive.
   * Uses prompt caching for the static system prompt.
   */
  private async streamMessage(
    systemPrompt: CachedSystemPrompt,
    messages: Anthropic.MessageParam[],
    isVoice: boolean,
    onChunk?: StreamCallback
  ): Promise<Anthropic.Message> {
    const stream = this.anthropic.messages.stream({
      model: this.config.llmModel,
      max_tokens: isVoice ? 500 : 2048,
      system: systemPrompt,
      tools: HA_TOOLS,
      messages,
    });

    // Stream text chunks to callback if provided
    if (onChunk) {
      stream.on("text", (textDelta) => {
        onChunk(textDelta);
      });
    }

    // Wait for the complete message
    return await stream.finalMessage();
  }
}
