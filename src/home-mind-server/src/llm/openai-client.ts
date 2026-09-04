import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IConversationStore } from "../memory/types.js";
import { HomeAssistantClient } from "../ha/client.js";
import { DeviceScanner } from "../ha/device-scanner.js";
import { TopologyScanner } from "../ha/topology-scanner.js";
import { buildSystemPromptText } from "./prompts.js";
import { TOOL_DEFINITIONS, toOpenAITools } from "./tool-definitions.js";
import { handleToolCall, extractAndStoreFacts, type ToolContext } from "./tool-handler.js";
import { withTokenCap } from "./token-cap.js";
import {
  readUsage,
  describeUsage,
  spentBudgetOnReasoning,
  WRITTEN_OUTPUT_CAP,
  VOICE_OUTPUT_CAP,
  TRUNCATION_NOTICE,
  VOICE_TRUNCATION_NOTICE,
  type TokenUsage,
} from "./usage.js";
import type {
  ChatRequest,
  ChatResponse,
  ChatError,
  StreamCallback,
  IChatEngine,
  IFactExtractor,
} from "./interface.js";

type FunctionToolCall = OpenAI.ChatCompletionMessageFunctionToolCall;

const OPENAI_TOOLS = toOpenAITools(TOOL_DEFINITIONS);

/**
 * Hard cap on tool round-trips per user message. A model that loops (repeatedly
 * re-searching entities, retrying a tool it misreads as failing) otherwise runs
 * until the HA integration's 120s client timeout with nothing to show for it —
 * and on a metered API, at the user's expense. On the last iteration we re-ask
 * with tool calling disabled so there is still a written answer.
 */
const MAX_TOOL_ITERATIONS = 8;

export class OpenAIChatEngine implements IChatEngine {
  private client: OpenAI;
  private memory: IMemoryStore;
  private conversations: IConversationStore;
  private extractor: IFactExtractor;
  private ha: HomeAssistantClient;
  private scanner: DeviceScanner;
  private topology: TopologyScanner;
  private config: Config;

  constructor(
    config: Config,
    memory: IMemoryStore,
    conversations: IConversationStore,
    extractor: IFactExtractor,
    ha: HomeAssistantClient,
    scanner: DeviceScanner,
    topology: TopologyScanner
  ) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/hoornet/home-mind",
        "X-Title": "Home Mind",
      },
    });
    this.memory = memory;
    this.conversations = conversations;
    this.extractor = extractor;
    this.ha = ha;
    this.scanner = scanner;
    this.topology = topology;
  }

  async chat(
    request: ChatRequest,
    onChunk?: StreamCallback
  ): Promise<ChatResponse> {
    const { message, userId, conversationId, isVoice = false, customPrompt } = request;
    // A nonce for this turn, and ONE shared context for the whole turn:
    // forget_memory writes forgetTargets back onto it, so a fresh object per
    // tool call would lose them.
    const turnId = randomUUID();
    const toolCtx: ToolContext = { conversationId, turnId, userId, memory: this.memory };
    const toolsUsed: string[] = [];

    // 1. Load user's memory
    const facts = await this.memory.getFactsWithinTokenLimit(
      userId,
      this.config.memoryTokenLimit,
      message
    );
    const factContents = facts.map((f) => f.content);
    if (this.config.logLevel === "debug") {
      const approxTokens = Math.ceil(factContents.join(" ").length / 4);
      console.debug(
        `[recall] userId=${userId} factCount=${factContents.length} tokens=${approxTokens}`
      );
    }

    // 2. Refresh device profiles and home layout if stale, then build system prompt
    await Promise.all([this.scanner.refreshIfStale(), this.topology.refreshIfStale()]);
    const deviceCheatSheet = this.scanner.hasProfiles()
      ? this.scanner.formatCheatSheet()
      : undefined;
    const homeLayout = this.topology.hasLayout() ? this.topology.formatSection() : undefined;
    const systemPrompt = buildSystemPromptText(factContents, isVoice, customPrompt, deviceCheatSheet, homeLayout);

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

    let iterations = 0;
    while (result.finishReason === "tool_calls" && result.toolCalls.length > 0) {
      iterations++;

      // Add assistant message with tool calls
      messages.push({
        role: "assistant",
        content: result.text || null,
        tool_calls: result.toolCalls,
      });

      // Execute all tool calls in parallel
      const toolPromises = result.toolCalls.map(async (tc: FunctionToolCall) => {
        toolsUsed.push(tc.function.name);

        // Small local models routinely emit truncated or non-JSON arguments.
        // Hand that back as a tool error the model can recover from — throwing
        // here would reject the whole Promise.all and fail the user's request.
        let args: Record<string, unknown>;
        try {
          args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          console.warn(
            `[tool] ${tc.function.name} got unparseable arguments: ${tc.function.arguments}`
          );
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: JSON.stringify({
              error:
                `Arguments for ${tc.function.name} were not valid JSON and could not be read. ` +
                `Call the tool again with valid JSON arguments.`,
            }),
          };
        }

        const toolResult = await handleToolCall(this.ha, tc.function.name, args, toolCtx);
        return {
          role: "tool" as const,
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult, null, 2),
        };
      });

      const toolResults = await Promise.all(toolPromises);
      messages.push(...toolResults);

      // Continue streaming. On the final allowed iteration, disable tool calling
      // so the model has to answer in words rather than loop again.
      const forceAnswer = iterations >= MAX_TOOL_ITERATIONS;
      if (forceAnswer) {
        console.warn(
          `[llm] tool loop hit ${MAX_TOOL_ITERATIONS} iterations — forcing a final answer`
        );
      }
      result = await this.streamCompletion(messages, isVoice, onChunk, forceAnswer);
      if (forceAnswer) break;
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
      responseText,
      toolCtx.forgetTargets
    ).catch((err) => console.error("Fact extraction failed:", err));

    // 8. If the model produced no usable response, attach a structured error
    // so the HA integration can surface a useful hint instead of the generic
    // "I received your request but got no response." fallback. The `finish_reason`
    // from the final stream tells us which diagnostic applies.
    const error = responseText === "" && result.toolCalls.length === 0
      ? this.classifyEmptyResponse(result.finishReason, result.usage)
      : undefined;

    // A reply that ran out of room but did write something is the *common* case,
    // and it used to be delivered silently: the integration returns the text
    // whenever there is any, so `error` never reached the reader and a sentence
    // stopping in the middle looked like the assistant's own choice. Say so in
    // the reply itself, which is the only channel every caller shares.
    const truncated = result.finishReason === "length" && responseText !== "";
    const response = truncated
      ? responseText + (isVoice ? VOICE_TRUNCATION_NOTICE : TRUNCATION_NOTICE)
      : responseText;

    return {
      response,
      toolsUsed,
      factsLearned: 0,
      ...(error ? { error } : {}),
    };
  }

  private classifyEmptyResponse(
    finishReason: string | null,
    usage?: TokenUsage
  ): ChatError {
    if (finishReason === "length") {
      // The output cap covers hidden reasoning as well as the visible answer, so
      // a reasoning-heavy turn can exhaust it without writing a single word.
      // That needs different advice from a prompt being too large, and the two
      // are only distinguishable from the reported token counts. This used to be
      // decided by which spelling of the cap parameter the model accepted, which
      // told us nothing on providers that accept both.
      const hint = spentBudgetOnReasoning(usage)
        ? "Home Mind ran out of room before it could write the answer. The model " +
          "spent this turn's budget working the problem out and had none left " +
          "for the reply. A shorter time range, or fewer sensors in one " +
          "question, will usually get it through."
        : "Home Mind ran out of room before it could finish the answer. A shorter " +
          "time range, or fewer sensors in one question, will usually get it " +
          "through.";
      return { code: "MAX_TOKENS_TRUNCATED", hint };
    }
    if (finishReason === "content_filter") {
      return {
        code: "CONTENT_FILTERED",
        hint:
          "The provider blocked the response (content filter). " +
          "If this happens on benign smart-home commands, try a different model.",
      };
    }
    return {
      code: "EMPTY_CONTENT",
      hint:
        "The model returned no text and no tool calls. " +
        "If you're routing through an OpenAI-compatible shim/proxy, verify it streams " +
        "OpenAI-format SSE chunks. For local models, ensure the model emits a final " +
        "answer rather than just thinking. For the fact extractor specifically, set " +
        "OPENAI_RESPONSE_FORMAT=json_object on picky providers (e.g. some Ollama models).",
    };
  }

  /** Ceiling on one reply; see WRITTEN_OUTPUT_CAP for why it is what it is. */
  private maxOutputTokens(isVoice: boolean): number {
    return this.config.maxOutputTokens ?? (isVoice ? VOICE_OUTPUT_CAP : WRITTEN_OUTPUT_CAP);
  }

  private async streamCompletion(
    messages: OpenAI.ChatCompletionMessageParam[],
    isVoice: boolean,
    onChunk?: StreamCallback,
    disableTools = false
  ): Promise<{
    text: string;
    finishReason: string | null;
    toolCalls: FunctionToolCall[];
    usage?: TokenUsage;
  }> {
    const cap = this.maxOutputTokens(isVoice);
    const stream = await withTokenCap(this.config.llmModel, cap, (capParam) =>
      this.client.chat.completions.create({
        model: this.config.llmModel,
        ...capParam,
        messages,
        tools: OPENAI_TOOLS,
        // Keep the tool list in the request (history already references it) but
        // stop the model from issuing more calls.
        ...(disableTools ? { tool_choice: "none" as const } : {}),
        stream: true,
        // Ask for the token breakdown. Without this a streamed call reports no
        // usage at all, which is why a cap being spent entirely on reasoning
        // looked identical to a prompt being too large.
        stream_options: { include_usage: true },
      })
    );

    let text = "";
    let finishReason: string | null = null;
    let usage: TokenUsage | undefined;

    // Accumulate tool calls from streamed deltas, indexed by position
    const toolCallAccumulator = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      // The usage chunk arrives last and carries no choices, so read it before
      // the guard below skips it.
      if (chunk.usage) usage = readUsage(chunk.usage);

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

    // A cap that runs out is worth a line in the log whatever it interrupted.
    // It cuts tool-call arguments mid-JSON as readily as it cuts an answer, and
    // that case leaves no trace at all in the reply the user sees.
    if (finishReason === "length") {
      console.warn(
        `[llm] output cap reached: cap=${cap} ${describeUsage(usage)} ` +
          `visible_chars=${text.length} tool_calls=${toolCalls.length} ` +
          `model=${this.config.llmModel}`
      );
    } else if (this.config.logLevel === "debug") {
      // Knowing what a *successful* turn cost is what tells you how close the
      // ceiling is. Reading usage only from failures shows the cases that
      // already went wrong and nothing about the margin on the rest.
      console.log(
        `[llm] turn ok: cap=${cap} ${describeUsage(usage)} ` +
          `finish=${finishReason ?? "none"} tool_calls=${toolCalls.length}`
      );
    }

    return { text, finishReason, toolCalls, usage };
  }
}
