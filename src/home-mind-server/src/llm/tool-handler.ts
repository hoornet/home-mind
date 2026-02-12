import type { HomeAssistantClient } from "../ha/client.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";

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

  let storedCount = 0;
  for (const fact of extractedFacts) {
    if (fact.replaces && fact.replaces.length > 0) {
      for (const oldFactId of fact.replaces) {
        const deleted = await memory.deleteFact(oldFactId);
        if (deleted) {
          console.log(`Replaced old fact ${oldFactId} for ${userId}`);
        }
      }
    }

    await memory.addFact(userId, fact.content, fact.category);
    storedCount++;
    console.log(`Stored new fact for ${userId}: ${fact.content}`);
  }

  return storedCount;
}
