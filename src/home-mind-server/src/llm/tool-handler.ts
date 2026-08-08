import type { HomeAssistantClient, HistoryEntry } from "../ha/client.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";
import type { ExtractedFact } from "../memory/types.js";
import { filterFacts } from "../memory/fact-patterns.js";
import type { Fact } from "../memory/types.js";
import {
  resolveForgetQuery,
  contentSimilarity,
  normalizeFactContent,
  looksLikeRelearn,
  MATCH_THRESHOLD,
} from "../memory/fact-resolution.js";
import {
  isConfirmed,
  recordPreview,
  pendingIdentities,
  clearIdentity,
} from "./forget-confirmations.js";

/**
 * Per-request context for tools that need conversation continuity or the
 * requesting user's memory.
 *
 * Engines MUST create ONE ToolContext per chat() turn and pass that same
 * instance to every handleToolCall in the turn's tool loop — forget_memory
 * writes `forgetTargets` back onto it, and a fresh object per call would
 * silently drop them.
 */
export interface ToolContext {
  conversationId?: string;
  /** A nonce unique to this assistant turn (one per chat() call). */
  turnId?: string;
  /** The requesting user — required for memory tools. */
  userId?: string;
  /** The memory store — required for memory tools. */
  memory?: IMemoryStore;
  /**
   * Memories this turn's forget_memory calls touched. Post-turn extraction
   * filters these out, so the "forget that X" exchange cannot teach X straight
   * back, while anything else said in the same breath is still learned.
   */
  forgetTargets?: string[];
}

/** Record a memory this turn's forget flow touched, so extraction won't re-learn it. */
function noteForgetTargets(ctx: ToolContext | undefined, ...contents: string[]): void {
  if (!ctx || contents.length === 0) return;
  ctx.forgetTargets = [...(ctx.forgetTargets ?? []), ...contents];
}

/**
 * Did the memory we previewed disappear before the user confirmed?
 *
 * The fact extractor's replace-on-update path can delete it in between. If so,
 * re-resolving the same request lands on whatever is most similar among the
 * survivors — typically the replacement — and the assistant ends up offering to
 * forget the value the user just set. The gate refuses to delete it (the
 * identity does not match), but proposing it at all is wrong: the user's
 * request has in fact already been carried out, so say so.
 */
function alreadyGoneResult(
  ctx: ToolContext | undefined,
  query: string,
  facts: Fact[]
): Record<string, unknown> | null {
  const conversationId = ctx?.conversationId;
  if (!conversationId) return null;
  const present = new Set(facts.map((f) => normalizeFactContent(f.content)));
  for (const identity of pendingIdentities(conversationId)) {
    if (present.has(identity)) continue; // still there → ordinary confirm flow
    if (contentSimilarity(query, identity) < MATCH_THRESHOLD) continue; // unrelated pending forget
    clearIdentity(conversationId, identity);
    noteForgetTargets(ctx, identity);
    return {
      already_gone: true,
      message:
        "That memory is no longer stored — it was removed after you previewed it (a newer fact replaced it). The user's request is ALREADY satisfied: tell them it is forgotten. Do NOT report a failure and do NOT offer to forget any other memory instead.",
    };
  }
  return null;
}

/** Max history entries to return to the LLM to avoid blowing context window */
const MAX_HISTORY_ENTRIES = 200;

/**
 * Normalize a timestamp to ensure it has timezone info.
 * If the timestamp lacks a Z suffix or ±HH:MM offset, append Z (UTC).
 */
export function normalizeTimestamp(ts: string | undefined): string | undefined {
  if (ts === undefined) return undefined;
  // Already has Z suffix or ±HH:MM / ±HHMM offset
  if (/Z$/i.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts) || /[+-]\d{4}$/.test(ts)) {
    return ts;
  }
  return ts + "Z";
}

/**
 * Downsample history to avoid blowing the LLM context window.
 * Strips bulky attributes and evenly samples entries when over the limit.
 */
export function truncateHistory(
  entries: HistoryEntry[]
): { entity_id: string; state: string; last_changed: string }[] {
  // Strip attributes — they're huge (friendly_name, unit, icon, device_class, etc.)
  // and the LLM only needs state + timestamp
  const slim = entries.map((e) => ({
    entity_id: e.entity_id,
    state: e.state,
    last_changed: e.last_changed,
  }));

  if (slim.length <= MAX_HISTORY_ENTRIES) return slim;

  // Evenly sample, always keeping first and last
  const step = (slim.length - 1) / (MAX_HISTORY_ENTRIES - 1);
  const sampled: typeof slim = [];
  for (let i = 0; i < MAX_HISTORY_ENTRIES; i++) {
    sampled.push(slim[Math.round(i * step)]);
  }

  console.log(`[tool] get_history truncated ${entries.length} → ${sampled.length} entries`);
  return sampled;
}

export async function handleToolCall(
  ha: HomeAssistantClient,
  toolName: string,
  input: Record<string, unknown>,
  ctx?: ToolContext
): Promise<unknown> {
  const start = Date.now();
  console.log(`[tool] ${toolName} called with: ${JSON.stringify(input)}`);

  try {
    let result: unknown;

    switch (toolName) {
      case "get_state":
        result = await ha.getState(input.entity_id as string);
        break;

      case "get_entities":
        result = await ha.getEntities(input.domain as string | undefined);
        break;

      case "search_entities":
        result = await ha.searchEntities(input.query as string);
        break;

      case "call_service":
        result = await ha.callService(
          input.domain as string,
          input.service as string,
          input.entity_id as string | undefined,
          input.data as Record<string, unknown> | undefined
        );
        break;

      case "get_history": {
        const startTime = normalizeTimestamp(input.start_time as string | undefined);
        const endTime = normalizeTimestamp(input.end_time as string | undefined);
        const history = await ha.getHistory(
          input.entity_id as string,
          startTime,
          endTime
        );
        result = truncateHistory(history);
        break;
      }

      case "forget_memory": {
        const query = (input.query as string | undefined)?.trim();
        if (!query) {
          result = { error: "forget_memory requires a 'query' — the exact text of the remembered fact." };
          break;
        }
        if (!ctx?.memory || !ctx?.userId) {
          result = { error: "Memory is not available for this request, so nothing can be forgotten." };
          break;
        }

        const facts = await ctx.memory.getFacts(ctx.userId);

        // Was the memory we already previewed removed in the meantime? Then
        // this call is the user confirming something that has already happened.
        const gone = alreadyGoneResult(ctx, query, facts);
        if (gone) {
          result = gone;
          break;
        }

        const resolution = resolveForgetQuery(query, facts);

        if (resolution.status === "none") {
          noteForgetTargets(ctx, ...resolution.suggestions);
          result = {
            no_match: true,
            suggestions: resolution.suggestions,
            message:
              "No remembered fact matches that. NOTHING was deleted. Do NOT retry with reworded guesses. If the user was trying to change YOUR name or personality, that is not a stored memory and never will be — tell them it is set in the custom system prompt for this integration. If exactly one of 'suggestions' is clearly what they mean, call again with that suggestion's exact text (it will still only preview). Otherwise tell them you don't have that memory — never delete something merely similar.",
          };
          break;
        }

        if (resolution.status === "ambiguous") {
          noteForgetTargets(ctx, ...resolution.candidates.map((c) => c.content));
          result = {
            needs_disambiguation: true,
            candidates: resolution.candidates.map((c) => c.content),
            message:
              "Several remembered facts match and NOTHING was deleted. List the candidate texts to the user VERBATIM and ask which one to forget. When they answer in their NEXT message, call forget_memory again with that candidate's exact text as the query.",
          };
          break;
        }

        const group = resolution.group;
        // Whether this call previews or commits, the fact is on its way out —
        // never let this turn's transcript teach it back.
        noteForgetTargets(ctx, group.content);

        const conversationId = ctx.conversationId;
        const turnId = ctx.turnId;
        // Without conversation continuity the confirmation cannot happen, so
        // refuse rather than delete. A memory removed by mistake is not
        // recoverable, and a caller with no conversation (a one-shot API
        // request, say) has nobody to ask.
        if (!conversationId || !turnId) {
          result = {
            error:
              "This request isn't part of an ongoing conversation, so the user cannot be asked to confirm — and memories are only ever deleted after they confirm. NOTHING was deleted.",
          };
          break;
        }

        if (!isConfirmed(conversationId, group.normalized, turnId)) {
          recordPreview(conversationId, group.normalized, turnId);
          result = {
            confirmation_required: true,
            memory_to_forget: group.content,
            message:
              'This is a PREVIEW — NOTHING has been forgotten yet (this is expected, not an error, so do NOT retry or reword in this turn). Tell the user you will forget exactly this memory, quoting "memory_to_forget" word for word, and ask them to confirm. Then STOP. After they say yes in their NEXT message, call forget_memory again with "query" set to that exact text to actually forget it. Never tell the user a memory is forgotten until a call returns "success": true.',
          };
          break;
        }

        let failures = 0;
        for (const id of group.ids) {
          const deleted = await ctx.memory.deleteFact(ctx.userId, id);
          if (!deleted) failures++;
        }
        if (failures > 0) {
          // Re-arm with the CURRENT turnId so "try again" next turn commits
          // straight away instead of restarting the confirmation.
          recordPreview(conversationId, group.normalized, turnId);
          result = {
            error:
              "The memory service could not delete that right now. Tell the user it didn't work and to ask again in a moment — a repeat request will delete it without another confirmation.",
          };
          break;
        }
        result = {
          success: true,
          forgotten: group.content,
          summary: `Forgotten: "${group.content}". This memory is gone for good.`,
        };
        break;
      }

      default:
        result = { error: `Unknown tool: ${toolName}` };
    }

    const elapsed = Date.now() - start;
    console.log(`[tool] ${toolName} completed in ${elapsed}ms`);
    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[tool] ${toolName} failed in ${elapsed}ms: ${message}`);
    return { error: message };
  }
}

/**
 * Filter out garbage facts that the LLM extracted despite prompt instructions.
 * Delegates to shared pattern matching in fact-patterns.ts.
 */
export function filterExtractedFacts(facts: ExtractedFact[]): { kept: ExtractedFact[]; skipped: { fact: ExtractedFact; reason: string }[] } {
  return filterFacts(facts);
}

export async function extractAndStoreFacts(
  memory: IMemoryStore,
  extractor: IFactExtractor,
  userId: string,
  userMessage: string,
  assistantResponse: string,
  /**
   * Memories this turn's forget_memory calls touched (see ToolContext). Any
   * extracted fact that merely restates one of them is dropped — otherwise
   * "forget that my name is Jure" teaches it straight back under a new id and
   * the user watches a deleted memory reappear. Anything else in the same turn
   * ("…and my name is now Alex") is stored as usual.
   */
  forgetTargets?: string[]
): Promise<number> {
  const existingFacts = await memory.getFacts(userId);

  const extractedFacts = await extractor.extract(
    userMessage,
    assistantResponse,
    existingFacts
  );

  // Filter out garbage
  const { kept, skipped } = filterExtractedFacts(extractedFacts);

  for (const { fact, reason } of skipped) {
    console.debug(`[filter] Skipped fact for ${userId}: "${fact.content}" — ${reason}`);
  }

  const targets = forgetTargets ?? [];
  const survivors =
    targets.length === 0
      ? kept
      : kept.filter((fact) => {
          const hit = targets.find((target) => looksLikeRelearn(fact.content, target));
          if (hit) {
            console.log(
              `[memory] extraction dropped "${fact.content}" for ${userId} — it re-learns a memory just forgotten ("${hit}")`
            );
            return false;
          }
          return true;
        });

  if (survivors.length === 0) return 0;

  // Delete replaced facts first
  for (const fact of survivors) {
    if (fact.replaces && fact.replaces.length > 0) {
      for (const oldFactId of fact.replaces) {
        const deleted = await memory.deleteFact(userId, oldFactId);
        if (deleted) {
          console.log(`Replaced old fact ${oldFactId} for ${userId}`);
        }
      }
    }
  }

  // Batch store all surviving facts
  const ids = await memory.addFacts(
    userId,
    survivors.map((f) => ({ content: f.content, category: f.category, confidence: f.confidence }))
  );

  for (const fact of survivors) {
    console.log(`Stored new fact for ${userId}: ${fact.content}`);
  }

  return ids.length;
}
