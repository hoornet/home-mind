import type { HomeAssistantClient } from "../ha/client.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";
import type { ExtractedFact } from "../memory/types.js";

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
        result = await ha.getHistory(
          input.entity_id as string,
          startTime,
          endTime
        );
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
