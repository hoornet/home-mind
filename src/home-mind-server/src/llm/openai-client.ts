import OpenAI from "openai";
import type { Config } from "../config.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IConversationStore } from "../memory/types.js";
import { HomeAssistantClient } from "../ha/client.js";
import { buildSystemPromptText } from "./prompts.js";
import { TOOL_DEFINITIONS, toOpenAITools } from "./tool-definitions.js";
import { handleToolCall, extractAndStoreFacts } from "./tool-handler.js";
import type {
  ChatRequest,
  ChatResponse,
  StreamCallback,
  IChatEngine,
  IFactExtractor,
} from "./interface.js";

type FunctionToolCall = OpenAI.ChatCompletionMessageFunctionToolCall;

const OPENAI_TOOLS = toOpenAITools(TOOL_DEFINITIONS);

export class OpenAIChatEngine implements IChatEngine {
  private client: OpenAI;
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
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
    });
    this.memory = memory;
    this.conversations = conversations;
    this.extractor = extractor;
    this.ha = ha;
  }

  async chat(
    request: ChatRequest,
    onChunk?: StreamCallback
  ): Promise<ChatResponse> {
    const { message, userId, conversationId, isVoice = false, customPrompt } = request;
    const toolsUsed: string[] = [];

    // 1. Load user's memory
    const facts = await this.memory.getFactsWithinTokenLimit(
      userId,
      this.config.memoryTokenLimit,
      message
    );
    const factContents = facts.map((f) => f.content);

    // 2. Build system prompt as plain text
    const systemPrompt = buildSystemPromptText(factContents, isVoice, customPrompt);

    // 3. Load conversation history
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    if (conversationId) {
      const history = await this.conversations.getConversationHistory(conversationId, 10);
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // 4. Add current user message
    messages.push({ role: "user", content: message });

    if (conversationId) {
      this.conversations.storeMessage(conversationId, userId, "user", message);
    }

    // 5. Stream and handle tool call loop
    let result = await this.streamCompletion(messages, isVoice, onChunk);

    while (result.finishReason === "tool_calls" && result.toolCalls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: result.text || null,
        tool_calls: result.toolCalls,
      });

      // Execute all tool calls in parallel
      const toolPromises = result.toolCalls.map(async (tc: FunctionToolCall) => {
        toolsUsed.push(tc.function.name);
        const args = JSON.parse(tc.function.arguments);
        const toolResult = await handleToolCall(this.ha, tc.function.name, args);
        return {
          role: "tool" as const,
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult, null, 2),
        };
      });

      const toolResults = await Promise.all(toolPromises);
      messages.push(...toolResults);

      // Continue streaming
      result = await this.streamCompletion(messages, isVoice, onChunk);
    }

    const responseText = result.text;

    // 6. Store assistant response
    if (conversationId && responseText) {
      this.conversations.storeMessage(conversationId, userId, "assistant", responseText);
    }

    // 7. Extract and store facts (fire-and-forget)
    extractAndStoreFacts(
      this.memory,
      this.extractor,
      userId,
      message,
      responseText
    ).catch((err) => console.error("Fact extraction failed:", err));

    return {
      response: responseText,
      toolsUsed,
      factsLearned: 0,
    };
  }

  private async streamCompletion(
    messages: OpenAI.ChatCompletionMessageParam[],
    isVoice: boolean,
    onChunk?: StreamCallback
  ): Promise<{
    text: string;
    finishReason: string | null;
    toolCalls: FunctionToolCall[];
  }> {
    const stream = await this.client.chat.completions.create({
      model: this.config.llmModel,
      max_tokens: isVoice ? 500 : 2048,
      messages,
      tools: OPENAI_TOOLS,
      stream: true,
    });

    let text = "";
    let finishReason: string | null = null;

    // Accumulate tool calls from streamed deltas, indexed by position
    const toolCallAccumulator = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      // Accumulate text
      if (choice.delta?.content) {
        text += choice.delta.content;
        if (onChunk) {
          onChunk(choice.delta.content);
        }
      }

      // Accumulate tool call deltas
      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const existing = toolCallAccumulator.get(tc.index);
          if (existing) {
            // Append to existing tool call's arguments
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            // New tool call at this index
            toolCallAccumulator.set(tc.index, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            });
          }
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    // Convert accumulated tool calls to the expected format
    const toolCalls: FunctionToolCall[] = [];
    for (const [, tc] of [...toolCallAccumulator.entries()].sort(
      (a, b) => a[0] - b[0]
    )) {
      toolCalls.push({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      });
    }

    return { text, finishReason, toolCalls };
  }
}
