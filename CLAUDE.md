# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Status

**Version:** See `src/ha-bridge/package.json` for current version
**Status:** INTEGRATION_STATUS.md for project status

## Architecture

```
┌─────────────────────────────────┬───────────────────────────────┐
│     Web (LibreChat)             │      Voice (HA Assist)        │
│            ↓                    │             ↓                 │
│   src/mcp-server/ (MCP)         │   src/ha-integration/ (Agent) │
│            ↓                    │             ↓                 │
│     (LibreChat memory)          │     src/ha-bridge/ (API)      │
│                                 │             ↓                 │
│                                 │    Claude + SQLite Memory     │
└─────────────────────────────────┴───────────────────────────────┘
                              ↓
                  Home Assistant REST API
```

**Key Point:** Web and Voice have separate memory stores. The MCP server is used via LibreChat, while HA Bridge is a standalone API for voice/HA Assist.

## Development Commands

Both TypeScript packages require Node.js 18+. Run from each package directory (`src/mcp-server/` or `src/ha-bridge/`):

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx watch (hot reload)
npm run typecheck    # Type check only
npm run lint         # ESLint
npm start            # Run compiled dist/index.js
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

**Local Development (HA Bridge):**
```bash
cd src/ha-bridge
cp .env.example .env  # Create and edit with your credentials
npm install
npm run dev           # Starts server at localhost:3100 with hot reload
```

**API Endpoints (HA Bridge):**
- `POST /api/chat` - Send message, get full response
- `POST /api/chat/stream` - SSE streaming response
- `GET /api/health` - Health check

## Source Structure

### src/mcp-server/src/
MCP bridge for LibreChat web interface. Uses `@modelcontextprotocol/sdk`.

- `index.ts` - MCP tool definitions and handlers (get_state, get_entities, search_entities, call_service, get_history)
- `config.ts` - Zod-validated environment config
- `ha-client.ts` - HA REST API client using undici (supports self-signed certs)

### src/ha-bridge/src/
Home Mind API server for voice/HA integration. Express + Claude SDK + SQLite.

- `index.ts` - Express server entry point
- `api/routes.ts` - HTTP endpoints (`POST /api/chat`, `POST /api/chat/stream`, `GET /api/health`)
- `llm/client.ts` - Claude client with streaming (`messages.stream()`)
- `llm/tools.ts` - HA tool definitions for Claude
- `llm/prompts.ts` - System prompts with memory injection
- `memory/store.ts` - SQLite fact storage
- `memory/extractor.ts` - Fact extraction using Claude Haiku
- `memory/types.ts` - Memory type definitions
- `ha/client.ts` - HA client with 10-second entity caching

### src/ha-integration/custom_components/home_mind/
HA custom component that registers as a conversation agent.

- `conversation.py` - Main agent: receives Assist requests → calls HA Bridge API → returns response
- `config_flow.py` - UI configuration flow
- `const.py` - Constants (120s timeout for Claude tool calls)

## Environment Variables

**MCP Server** (`src/mcp-server/.env`):
- `HA_URL` (required) - Home Assistant URL
- `HA_TOKEN` (required) - Long-lived access token
- `HA_SKIP_TLS_VERIFY` - Set `true` for self-signed certs
- `LOG_LEVEL` - debug/info/warn/error

**HA Bridge** (`src/ha-bridge/.env`):
- `ANTHROPIC_API_KEY` (required) - Anthropic API key
- `HA_URL` (required) - Home Assistant URL
- `HA_TOKEN` (required) - Long-lived access token
- `PORT` - Server port (default: 3100)

## Code Patterns

**ES Modules** - Use `.js` extensions in TypeScript imports:
```typescript
import { loadConfig } from "./config.js";
```

**Zod validation** - All config and tool inputs use Zod schemas:
```typescript
const GetStateSchema = z.object({
  entity_id: z.string().describe("Entity ID to get state for"),
});
```

**HA conversation agent** - Uses `intent.IntentResponse` (not `conversation.IntentResponse`):
```python
intent_response = intent.IntentResponse(language=user_input.language)
intent_response.async_set_speech(response)
return ConversationResult(response=intent_response)
```

## Deployment

**Infrastructure:**
- LibreChat + MCP server: ubuntuserver ~/LibreChat/ (192.168.88.12:3080)
- Home Mind API: ubuntuserver ~/home-mind/ (192.168.88.12:3100)
- Home Assistant: haos12 (192.168.88.14:8123)

**Deploy MCP server** (LibreChat plugin):
```bash
scp -r src/mcp-server ubuntuserver:~/LibreChat/
ssh ubuntuserver "docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'"
ssh ubuntuserver "cd ~/LibreChat && docker compose restart api"
```

**Deploy Home Mind API** (runs as Docker container `ha-bridge`):
```bash
scp -r src/ha-bridge/* ubuntuserver:~/home-mind/
ssh ubuntuserver "docker run --rm -v ~/home-mind:/app -w /app node:20 sh -c 'npm install && npm run build'"
ssh ubuntuserver "docker restart ha-bridge"
```

Note: Don't copy node_modules - they must be built inside the container due to native dependencies (better-sqlite3).

**Deploy HA custom component:**
```bash
scp -r src/ha-integration/custom_components/home_mind haos12:/config/custom_components/
ssh haos12 "ha core restart"
```

**View logs:**
```bash
ssh ubuntuserver "docker logs ha-bridge -f"       # Home Mind API logs
ssh haos12 "tail -f /config/home-assistant.log | grep home_mind"  # HA logs
```

**Test API locally:**
```bash
curl -X POST http://localhost:3100/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "what lights are on?", "userId": "test"}'
```

**Start Shodh Memory (optional):**
```bash
# On ubuntuserver - generate API key and start
export SHODH_API_KEY=$(openssl rand -hex 32)
SHODH_DEV_API_KEY=$SHODH_API_KEY SHODH_HOST=0.0.0.0 nohup ~/shodh-memory > ~/shodh.log 2>&1 &
# Then add to ha-bridge .env: SHODH_ENABLED=true, SHODH_URL, SHODH_API_KEY
```

## Release Process

After completing a feature or set of features, always create a tagged release for traceability:

1. **Update version** in `src/ha-bridge/package.json`
2. **Update documentation** in `INTEGRATION_STATUS.md`:
   - Add to "What's Working" table
   - Add to "What's Complete" table
   - Add entry to "Critical Decisions Log" with problem/solution/files changed
   - Update version number at bottom
3. **Commit** with descriptive message
4. **Create annotated tag:**
   ```bash
   git tag -a v0.X.Y -m "v0.X.Y - Brief description

   Features:
   - Feature 1
   - Feature 2"
   ```
5. **Push tag:** `git push origin v0.X.Y`

This ensures code and documentation changes are traceable by version name (e.g., "conversation history was added in v0.3.1").

## Key Technical Decisions

1. **Shodh Memory** (v0.4.0) - Cognitive memory backend with semantic search, Hebbian learning, and natural decay. Falls back to SQLite if unavailable. Set `SHODH_ENABLED=true` in .env.

2. **Separate memory stores** - Web (LibreChat/MongoDB) and Voice (Shodh/SQLite) have separate memories. Sync planned for v1.0.

3. **Claude Haiku 4.5** for chat - Better instruction following than older Haiku, faster than Sonnet.

4. **Streaming responses** - `messages.stream()` reduces time-to-first-token. Simple queries: 2-3s. Tool queries: 8-15s (multiple API round-trips).

5. **Entity caching** - 10-second TTL in HA Bridge. Minimal impact (~6%) since bottleneck is Claude API calls, not HA API.

6. **120s timeout** in HA integration - Claude with tool use can take 60s+.

## Known Limitations

- Single-user only (multi-user via OIDC planned for v1.0)
- Web and voice have separate memory stores
- Voice response time: ~2-3s simple, ~8-15s with tools (architectural limit from Claude API round-trips)

## Documentation

- `INTEGRATION_STATUS.md` - Current project status
- `PROJECT_PLAN.md` - Full roadmap
- `ARCHITECTURE.md` - Technical architecture
- `docs/MEMORY_EXAMPLES.md` - Memory system examples
- `docs/PHASE_2.5_ARCHITECTURE.md` - Voice integration details

## Common Debugging

**HA Bridge not responding:**
1. Check health: `curl http://localhost:3100/api/health`
2. Check env vars are set (ANTHROPIC_API_KEY, HA_URL, HA_TOKEN)
3. Check HA is accessible from the bridge host

**Claude returns generic responses (no HA data):**
- Verify HA_URL and HA_TOKEN in .env
- Check HA Bridge logs for tool call errors
- System prompt requires tools - if Claude ignores tools, check `llm/prompts.ts`

**Memory not persisting:**
- Check SQLite DB exists: `src/ha-bridge/data/memory.db`
- Check fact extraction in logs (Haiku extracts facts from responses)
