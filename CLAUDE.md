# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

```
HA Assist (Voice/Text) → HA Custom Component (Python) → Home Mind Server (Express/TS) → Claude API + Shodh Memory + HA REST API
```

**Single path, no fallbacks.** All interactions flow through home-mind-server. Shodh Memory is the only memory backend (required, no SQLite fallback).

### Request Flow (LLMClient.chat)

1. Load user's facts from Shodh via semantic search (query = current message)
2. Build system prompt: static part (cached via `cache_control: ephemeral`) + dynamic part (facts + datetime)
3. Load conversation history from in-memory Map (keyed by conversationId)
4. Stream response via `messages.stream()` with tool loop (parallel tool execution)
5. Fire-and-forget fact extraction (Claude Haiku 3.5 extracts facts, replaces conflicting old ones)
6. Return response to caller

### Two Claude Calls Per Request

- **Chat model**: `claude-haiku-4-5-20251001` in `llm/client.ts` - handles conversation + HA tool calls
- **Extraction model**: `claude-3-5-haiku-20241022` in `memory/extractor.ts` - extracts facts from conversation (async, non-blocking)

### Memory Architecture

- **Long-term facts**: Shodh Memory (external service, semantic search, Hebbian learning, natural decay)
- **Conversation history**: In-memory `Map<string, ConversationMessage[]>` in ShodhMemoryStore (lost on restart, max 20 messages/conversation)
- **Entity cache**: 10-second TTL in HomeAssistantClient (invalidated after service calls)
- **Fact categories**: baseline, preference, identity, device, pattern, correction
- **Smart replacement**: Extractor identifies existing facts that new facts supersede (via `replaces` field)

## Development Commands

All commands run from `src/home-mind-server/`:

```bash
npm run dev          # tsx watch (hot reload), starts at localhost:3100
npm run build        # tsc → dist/
npm run typecheck    # tsc --noEmit
npm run lint         # eslint src/
npm test             # vitest run
npm run test:watch   # vitest (watch mode)
npm run test:coverage # vitest with v8 coverage

# Single test file
npm test -- src/memory/shodh-client.test.ts

# Single test by name
npm test -- -t "can check health"
```

Requires Shodh Memory running at SHODH_URL. For local dev: `cp .env.example .env` and fill in credentials.

## Code Patterns

**ES Modules with `.js` extensions** in TypeScript imports:
```typescript
import { loadConfig } from "./config.js";
```

**Zod validation** for all config and request schemas. Config loads from env vars via `loadConfig()` in `config.ts` — exits process on validation failure.

**HA tool definitions** are raw `Anthropic.Tool[]` objects in `llm/tools.ts` (not Zod schemas). Five tools: `get_state`, `get_entities`, `search_entities`, `call_service`, `get_history`.

**Prompt caching**: System prompt split into static (cached) + dynamic (facts/datetime) blocks in `llm/prompts.ts`. Two variants: regular and voice (shorter).

**Shodh type mapping**: Our fact categories map to Shodh memory types (e.g., `baseline` → `Observation`, `preference` → `Preference`) in `shodh-client.ts`.

**Self-signed TLS**: HA client uses undici Agent with `rejectUnauthorized: false` when `HA_SKIP_TLS_VERIFY=true`.

**HA conversation agent** (Python) uses `intent.IntentResponse` (not `conversation.IntentResponse`):
```python
intent_response = intent.IntentResponse(language=user_input.language)
intent_response.async_set_speech(response)
return ConversationResult(response=intent_response)
```

## Environment Variables

Server requires: `ANTHROPIC_API_KEY`, `HA_URL`, `HA_TOKEN`, `SHODH_URL`, `SHODH_API_KEY`

Optional: `PORT` (default 3100), `HA_SKIP_TLS_VERIFY`, `MEMORY_TOKEN_LIMIT` (default 1500), `LOG_LEVEL`

Integration tests: `SHODH_TEST_URL`, `SHODH_TEST_API_KEY`

## API Endpoints

- `POST /api/chat` — Full response (uses streaming internally)
- `POST /api/chat/stream` — SSE streaming (`event: chunk` then `event: done`)
- `GET /api/health` — Health check
- `GET /api/memory/:userId` — List user's facts
- `POST /api/memory/:userId/facts` — Add fact manually
- `DELETE /api/memory/:userId` — Clear all facts
- `DELETE /api/memory/:userId/facts/:factId` — Delete specific fact

## Deployment

Docker Compose runs two services: `shodh` (memory backend, port 3030) and `server` (API, port 3100). Server depends on Shodh healthcheck. Shodh binary must be placed in `docker/shodh/` before build.

HA custom component installed via HACS from `https://github.com/hoornet/home-mind-hacs` or manually copied to `/config/custom_components/home_mind/`.

## Known Limitations

- Single-user only (multi-user via OIDC planned)
- Conversation history lost on server restart (in-memory only)
- Voice response: ~2-3s simple, ~8-15s with tool calls (Claude API round-trips)
- Fact extraction uses older Haiku 3.5 (`claude-3-5-haiku-20241022`), chat uses Haiku 4.5
