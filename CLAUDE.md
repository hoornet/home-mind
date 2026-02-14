# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

```
HA Assist (Voice/Text) → HA Custom Component (Python) → Home Mind Server (Express/TS) → LLM API (Anthropic/OpenAI/Ollama) + Shodh Memory + HA REST API
```

**Single path, no fallbacks.** All interactions flow through home-mind-server. Shodh Memory is the only memory backend (required, no SQLite fallback). LLM provider is selected via `LLM_PROVIDER` env var (default: `anthropic`).

### Request Flow (IChatEngine.chat)

1. Load user's facts from Shodh via semantic search (query = current message)
2. Build system prompt: static part (cached via `cache_control: ephemeral` for Anthropic, plain string for OpenAI) + dynamic part (facts + datetime)
3. Load conversation history from in-memory Map (keyed by conversationId)
4. Stream response with tool loop (parallel tool execution)
5. Fire-and-forget fact extraction (extracts facts, replaces conflicting old ones)
6. Return response to caller

### Two LLM Calls Per Request

- **Chat**: `IChatEngine` — handles conversation + HA tool calls. Implementations: `LLMClient` (Anthropic), `OpenAIChatEngine` (OpenAI/Ollama)
- **Extraction**: `IFactExtractor` — extracts facts from conversation (async, non-blocking). Implementations: `FactExtractor` (Anthropic), `OpenAIFactExtractor` (OpenAI/Ollama)

Provider is selected at startup by `llm/factory.ts` based on `LLM_PROVIDER` config.

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

## Testing Patterns

Vitest with `globals: true`. Tests mock constructors using `class` syntax in `vi.mock()` factories (not `vi.fn().mockImplementation()`) because the code uses `new`. Config tests use `vi.resetModules()` + dynamic `import()` to test different env var configurations.

Integration tests (e.g., `shodh-client.test.ts`) only run when `SHODH_TEST_URL` and `SHODH_TEST_API_KEY` are set — otherwise `describe.skip`.

## Code Patterns

**ES Modules with `.js` extensions** in TypeScript imports (required by `moduleResolution: "NodeNext"` in tsconfig):
```typescript
import { loadConfig } from "./config.js";
```

**Zod validation** for all config and request schemas. Config loads from env vars via `loadConfig()` in `config.ts` — exits process on validation failure. Uses `emptyToUndefined()` helper because Docker Compose sets empty strings (not `undefined`) for unset env vars.

**HA tool definitions** are provider-neutral `ToolDefinition[]` in `llm/tool-definitions.ts`, converted to provider format via `toAnthropicTools()` / `toOpenAITools()`. Five tools: `get_state`, `get_entities`, `search_entities`, `call_service`, `get_history`. Shared execution logic in `llm/tool-handler.ts`.

**Prompt caching**: System prompt split into static (cached) + dynamic (facts/datetime) blocks in `llm/prompts.ts`. Two variants: regular and voice (shorter). Custom prompt replaces the default identity line (opening sentence) rather than appending — this gives it maximum authority over persona. Dynamic block includes both human-readable datetime with UTC offset (e.g., `10:15 PM CET (UTC+1)`) and a raw ISO timestamp for unambiguous tool use.

**Timestamp normalization**: `normalizeTimestamp()` in `tool-handler.ts` appends `Z` to bare ISO timestamps (no timezone suffix) before passing them to HA. This prevents HA from misinterpreting timezone-naive timestamps from the LLM. All tool calls are debug-logged with `[tool]` prefix showing name, input, and elapsed time.

**HA light service data fields**: `brightness` (0-255), `rgb_color` ([R,G,B] each 0-255), `color_temp_kelvin` (2000-6500; 2700=warm white, 4000=neutral, 6500=daylight), `hs_color` ([hue 0-360, saturation 0-100]), `rgbw_color` ([R,G,B,W] each 0-255). For white light on RGBW strips (WLED etc.), use `rgbw_color: [0,0,0,255]` — the dedicated white LED channel. `color_temp_kelvin` is accepted by HA but WLED doesn't render it correctly on RGBW strips. For non-RGBW lights, `color_temp_kelvin` works fine. Check `supported_color_modes` in entity attributes to determine which mode to use. There is no separate `set_color` service — use `light.turn_on` with data fields. These are documented in `call_service` tool description in `tool-definitions.ts`.

**White light mode selection** (by `supported_color_modes`): `rgbw` → `rgbw_color: [0,0,0,255]`; `color_temp` only → `color_temp_kelvin`; `xy`/`hs`/`rgb` (RGB-only, no white channel) → `rgb_color: [255,255,255]`. RGB-only lights (e.g. Gledopto GL-C-008P) cannot render `color_temp_kelvin` even though HA accepts it — they need explicit RGB values.

**Shodh type mapping**: Our fact categories map to Shodh memory types (e.g., `baseline` → `Observation`, `preference` → `Preference`) in `shodh-client.ts`.

**Self-signed TLS**: HA client uses undici Agent with `rejectUnauthorized: false` when `HA_SKIP_TLS_VERIFY=true`.

**Token estimation**: Uses `content.length / 4` as rough token count (4 chars ≈ 1 token) for fact budget limiting.

**JSON from LLMs**: Both fact extractors strip markdown code fences (`` ```json ... ``` ``) before `JSON.parse()` — LLMs sometimes wrap JSON responses.

**Startup sequence**: Server checks Shodh health (`memory.isHealthy()`) and exits with `process.exit(1)` if unhealthy, before Express starts listening. Graceful shutdown handles SIGTERM/SIGINT and calls `memory.close()`.

**SSE streaming**: `/api/chat/stream` sends `event: chunk` for text, `event: done` with full response, `event: error` on failure. Calls `res.flushHeaders()` immediately. Both `/api/chat` and `/api/chat/stream` use the same `llm.chat()` internally — non-streaming just omits the `onChunk` callback.

### HA Integration Gotchas (Python)

**HA conversation agent** uses `intent.IntentResponse` (not `conversation.IntentResponse`):
```python
intent_response = intent.IntentResponse(language=user_input.language)
intent_response.async_set_speech(response)
return ConversationResult(response=intent_response)
```

**OptionsFlow has no `__init__`** — passing `config_entry` to the superclass constructor breaks in newer HA versions (fixed in v0.9.1).

**Voice detection**: Detected via `user_input.agent_id is not None` (not HA metadata), sets `isVoice=true` on server request.

**Conversation IDs**: Uses `ulid.ulid_now()` (not UUID).

**120-second timeout**: `DEFAULT_TIMEOUT = 120` for API calls because tool-using LLM responses can take 60+ seconds.

## Environment Variables

Server requires: `HA_URL`, `HA_TOKEN`, `SHODH_URL`, `SHODH_API_KEY`, plus the API key for the selected provider (not needed for Ollama).

LLM config:
- `LLM_PROVIDER` — `anthropic` (default), `openai`, or `ollama`
- `LLM_MODEL` — model ID (default: `claude-haiku-4-5-20251001`; must be set explicitly for Ollama)
- `ANTHROPIC_API_KEY` — required when `LLM_PROVIDER=anthropic`
- `OPENAI_API_KEY` — required when `LLM_PROVIDER=openai`
- `OPENAI_BASE_URL` — optional, for OpenAI-compatible APIs (Azure, local proxies)
- `OLLAMA_BASE_URL` — optional, Ollama API endpoint (default: `http://localhost:11434/v1`)

Optional: `PORT` (default 3100), `HA_SKIP_TLS_VERIFY`, `MEMORY_TOKEN_LIMIT` (default 1500), `LOG_LEVEL`, `CUSTOM_PROMPT` (server-level default custom system prompt), `TZ` (timezone for the Docker container, default `Europe/Prague` in docker-compose; Node.js uses this for `toLocaleString()` so the LLM sees correct local time)

Integration tests: `SHODH_TEST_URL`, `SHODH_TEST_API_KEY`

## API Endpoints

- `POST /api/chat` — Full response (uses streaming internally). Body: `{ message, userId?, conversationId?, isVoice?, customPrompt? }`
- `POST /api/chat/stream` — SSE streaming (`event: chunk` then `event: done`). Same body as `/api/chat`
- `GET /api/health` — Health check
- `GET /api/memory/:userId` — List user's facts
- `POST /api/memory/:userId/facts` — Add fact manually
- `DELETE /api/memory/:userId` — Clear all facts
- `DELETE /api/memory/:userId/facts/:factId` — Delete specific fact

## Deployment

Docker Compose (root `docker-compose.yml`) runs two services: `shodh` (memory backend, port 3030) and `server` (API, port 3100). Server depends on Shodh healthcheck.

**Shodh Docker**: Uses Ubuntu 24.04 (not Alpine) because the pre-compiled binary requires GLIBC 2.38+. Both `shodh-memory-server` binary and `libonnxruntime.so` must be in `docker/shodh/` before build. `deploy.sh` auto-generates `SHODH_API_KEY` via `openssl rand -hex 32` if not set.

HA custom component installed via HACS from `https://github.com/hoornet/home-mind-hacs` or manually copied to `/config/custom_components/home_mind/`.

## Known Limitations

- Single-user only (multi-user via OIDC planned)
- Conversation history lost on server restart (in-memory only)
- Both chat and extraction use the same model (configured via `LLM_MODEL`)
- Fact extraction sometimes stores transient state or LLM hallucinations (improvement planned)
