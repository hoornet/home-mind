import type { HomeAssistantClient } from "../ha/client.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";

export async function handleToolCall(
  ha: HomeAssistantClient,
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (toolName) {
      case "get_state":
        return await ha.getState(input.entity_id as string);

      case "get_entities":
        return await ha.getEntities(input.domain as string | undefined);

      case "search_entities":
        return await ha.searchEntities(input.query as string);

      case "call_service":
        return await ha.callService(
          input.domain as string,
          input.service as string,
          input.entity_id as string | undefined,
          input.data as Record<string, unknown> | undefined
        );

      case "get_history":
        return await ha.getHistory(
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
