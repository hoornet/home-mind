# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Status

**Version:** See `src/home-mind-server/package.json` for current version (currently 0.6.0)

## Architecture

```
┌─────────────────────────────────────────┐
│  HA Assist (Voice + Text)               │
│              ↓                          │
│  src/ha-integration/ (Custom Component) │
│              ↓                          │
│  src/home-mind-server/ (Express API)    │
│              ↓                          │
│  Shodh Memory (Cognitive Memory)        │
│              ↓                          │
│  Claude API + Home Assistant REST API   │
└─────────────────────────────────────────┘
```

**Single path architecture** - All interactions go through home-mind-server with Shodh as the only memory backend.

## Development Commands

Run from `src/home-mind-server/`:

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

# Run a single test file
npm test -- src/memory/shodh-client.test.ts

# Run a specific test by name
npm test -- -t "can check health"
```

**Local Development:**
```bash
cd src/home-mind-server
cp .env.example .env  # Create and edit with your credentials
npm install
npm run dev           # Starts server at localhost:3100 with hot reload
```

**Note:** Requires Shodh Memory to be running. See Deployment section.

**API Endpoints:**
- `POST /api/chat` - Send message, get full response
- `POST /api/chat/stream` - SSE streaming response
- `GET /api/health` - Health check

## Source Structure

### src/home-mind-server/src/
Home Mind API server. Express + Claude SDK + Shodh Memory.

- `index.ts` - Express server entry point
- `config.ts` - Zod-validated environment config
- `api/routes.ts` - HTTP endpoints
- `llm/client.ts` - Claude client with streaming (`messages.stream()`)
- `llm/tools.ts` - HA tool definitions for Claude
- `llm/prompts.ts` - System prompts with memory injection
- `memory/shodh-client.ts` - Shodh Memory API client
- `memory/extractor.ts` - Fact extraction using Claude Haiku
- `memory/interface.ts` - Memory store interface
- `memory/types.ts` - Type definitions
- `ha/client.ts` - HA client with 10-second entity caching

### src/ha-integration/custom_components/home_mind/
HA custom component that registers as a conversation agent.

- `conversation.py` - Main agent: receives Assist requests → calls Home Mind Server API → returns response
- `config_flow.py` - UI configuration flow
- `const.py` - Constants (120s timeout for Claude tool calls)

### archive/
Deprecated code preserved for reference. See `archive/README.md`.

## Environment Variables

**Home Mind Server** (`src/home-mind-server/.env` or root `.env` for Docker):
- `ANTHROPIC_API_KEY` (required) - Anthropic API key
- `HA_URL` (required) - Home Assistant URL
- `HA_TOKEN` (required) - Long-lived access token
- `SHODH_URL` (required) - Shodh Memory server URL
- `SHODH_API_KEY` (required) - Shodh API key
- `PORT` - Server port (default: 3100)
- `HA_SKIP_TLS_VERIFY` - Set `true` for self-signed certs
- `MEMORY_TOKEN_LIMIT` - Max tokens for memory context (default: 1500)

**Integration Tests** (optional, for running against real Shodh):
- `SHODH_TEST_URL` - Shodh URL for integration tests
- `SHODH_TEST_API_KEY` - Shodh API key for integration tests

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

### Docker Compose (Recommended)

```bash
# Clone and configure
git clone https://github.com/hoornet/home-mind.git
cd home-mind
cp .env.example .env
# Edit .env with your credentials

# Place Shodh binary (see docker/shodh/README.md)
cp ~/shodh-memory-server docker/shodh/

# Deploy
./scripts/deploy.sh
```

### Manual Deployment

**Start Shodh Memory:**
```bash
export SHODH_API_KEY=$(openssl rand -hex 32)
SHODH_DEV_API_KEY=$SHODH_API_KEY SHODH_HOST=0.0.0.0 ./shodh-memory-server
```

**Start Home Mind Server:**
```bash
cd src/home-mind-server
npm install && npm run build
node dist/index.js
```

### HA Custom Component

**HACS (Recommended):**
1. Add `https://github.com/hoornet/home-mind-hacs` as a custom repository in HACS
2. Install "Home Mind" from HACS
3. Restart Home Assistant

**Manual:**
```bash
scp -r src/ha-integration/custom_components/home_mind haos12:/config/custom_components/
ssh haos12 "ha core restart"
```

### View Logs

```bash
docker compose logs -f server   # Home Mind Server logs
docker compose logs -f shodh    # Shodh logs
```

### Test API

```bash
curl -X POST http://localhost:3100/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "what lights are on?", "userId": "test"}'
```

## Key Technical Decisions

1. **Shodh Memory** - Cognitive memory backend with semantic search, Hebbian learning, and natural decay. Required dependency (no fallback).

2. **Claude Haiku 4.5** for chat - Better instruction following than older Haiku, faster than Sonnet. Model: `claude-haiku-4-5-20251001`.

3. **Streaming responses** - `messages.stream()` reduces time-to-first-token. Simple queries: 2-3s. Tool queries: 8-15s (multiple API round-trips).

4. **Entity caching** - 10-second TTL in Home Mind Server.

5. **120s timeout** in HA integration - Claude with tool use can take 60s+.

6. **Smart fact replacement** - New facts supersede conflicting old ones.

7. **Single architecture** (v0.5.0) - Removed LibreChat/MCP integration and SQLite fallback. One path: HA Assist → home-mind-server → Shodh.

## Known Limitations

- Single-user only (multi-user via OIDC planned for v1.0)
- Voice response time: ~2-3s simple, ~8-15s with tools (Claude API round-trips)
- Requires Shodh Memory server running

## Common Debugging

**Home Mind Server not responding:**
1. Check health: `curl http://localhost:3100/api/health`
2. Check env vars are set (ANTHROPIC_API_KEY, HA_URL, HA_TOKEN, SHODH_URL, SHODH_API_KEY)
3. Check Shodh is running: `curl http://localhost:3030/health`

**"Shodh Memory is not available" error:**
- Ensure Shodh is running before starting home-mind-server
- Check SHODH_URL is correct (use `http://shodh:3030` in Docker, `http://localhost:3030` locally)

**Claude returns generic responses (no HA data):**
- Verify HA_URL and HA_TOKEN in .env
- Check Home Mind Server logs for tool call errors

**Memory not persisting:**
- Check Shodh health: `curl http://localhost:3030/health`
- Check fact extraction in home-mind-server logs

**Follow-up questions don't work:**
- Verify `conversationId` is being passed from HA
- Conversation history is stored in-memory in ShodhMemoryStore

**Slow responses (>30s):**
- Check model is `claude-haiku-4-5-20251001` (not Sonnet)
- Look for failed tool calls in logs
- Multiple tools = multiple API round-trips (architectural limit)
