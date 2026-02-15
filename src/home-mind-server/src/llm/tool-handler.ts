import type { HomeAssistantClient, HistoryEntry } from "../ha/client.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";
import type { ExtractedFact } from "../memory/types.js";

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
  input: Record<string, unknown>
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

// Patterns that indicate transient state — these should not be stored as long-term facts
const TRANSIENT_PATTERNS = /\b(currently|right now|at the moment|is showing|was just|is displaying|just turned|just set|is now)\b/i;

// Device spec/capability dump patterns — LLM catalogs entity attributes instead of extracting user facts
const DEVICE_SPEC_PATTERNS = /\b(supports?\s+\d+|supports?\s+(rgbw|rgb|color_temp|xy|hs|brightness|on_off)|color.?mode|effect.?list|\d+\+?\s+effects?|firmware|protocol|supported.?features?|supported.?color)\b/i;

// Command-echo patterns — assistant restating what it just did, not a user-stated fact
const COMMAND_ECHO_PATTERNS = /\b(was set to|was changed to|was turned|has been set|has been turned|has been changed)\b/i;

/**
 * Filter out garbage facts that the LLM extracted despite prompt instructions.
 * Returns only facts worth storing.
 */
export function filterExtractedFacts(facts: ExtractedFact[]): { kept: ExtractedFact[]; skipped: { fact: ExtractedFact; reason: string }[] } {
  const kept: ExtractedFact[] = [];
  const skipped: { fact: ExtractedFact; reason: string }[] = [];

  for (const fact of facts) {
    if (fact.content.length < 10) {
      skipped.push({ fact, reason: "too short (<10 chars)" });
      continue;
    }

    if (TRANSIENT_PATTERNS.test(fact.content)) {
      skipped.push({ fact, reason: "transient state pattern" });
      continue;
    }

    if (DEVICE_SPEC_PATTERNS.test(fact.content)) {
      skipped.push({ fact, reason: "device spec/capability dump" });
      continue;
    }

    if (COMMAND_ECHO_PATTERNS.test(fact.content)) {
      skipped.push({ fact, reason: "command echo (restating action)" });
      continue;
    }

    if (typeof fact.confidence === "number" && fact.confidence < 0.5) {
      skipped.push({ fact, reason: `low confidence (${fact.confidence})` });
      continue;
    }

    kept.push(fact);
  }

  return { kept, skipped };
}

export async function extractAndStoreFacts(
  memory: IMemoryStore,
  extractor: IFactExtractor,
  userId: string,
  userMessage: string,
  assistantResponse: string
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

  if (kept.length === 0) return 0;

  // Delete replaced facts first
  for (const fact of kept) {
    if (fact.replaces && fact.replaces.length > 0) {
      for (const oldFactId of fact.replaces) {
        const deleted = await memory.deleteFact(userId, oldFactId);
        if (deleted) {
          console.log(`Replaced old fact ${oldFactId} for ${userId}`);
        }
      }
    }
  }

  // Batch store all kept facts
  const ids = await memory.addFacts(
    userId,
    kept.map((f) => ({ content: f.content, category: f.category, confidence: f.confidence }))
  );

  for (const fact of kept) {
    console.log(`Stored new fact for ${userId}: ${fact.content}`);
  }

  return ids.length;
}
