# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## READ THIS FIRST

**Project Name:** Home Mind
**Current Phase:** Phase 2.5 Complete - v0.2.0 Released (Voice + Text Assist Working!)
**Last Major Update:** January 18, 2026
**Quick Status:** [Read INTEGRATION_STATUS.md](INTEGRATION_STATUS.md)

---

## Recent Architecture Changes (January 2026)

### Phase 2.5: Home Assistant Assist Integration

**Goal:** Enable voice control through HA's native Assist feature with persistent memory.

**Key Architectural Decisions:**

1. **Keep our MCP server**
   - Already working with memory + history features
   - We control the roadmap
   - Can contribute upstream later if desired

2. **Use hass-oidc-auth for authentication** (deferred to v1.0)
   - External project: https://github.com/ganhammar/hass-oidc-auth
   - Provides secure OIDC/SSO authentication
   - Enables clean multi-user support

3. **Build custom conversation agent**
   - Component: `src/ha-integration/custom_components/home_mind/`
   - Bridges HA Assist → Home Mind API
   - Handles user context and session management

**Architecture Flow:**
```
HA User (Voice/Text) → Custom Conversation Agent → Home Mind API → Claude + HA Tools
                                                         ↓
                                                  SQLite Memory
```

**Our Components:**
- `src/mcp-server/` - MCP bridge for LibreChat web interface
- `src/ha-bridge/` - Home Mind API server for voice/HA integration
- `src/ha-integration/` - HA custom component (conversation agent)

---

## Project Overview

Home Mind is an AI assistant for Home Assistant with **persistent memory across sessions** and **voice control integration**.

**Key Differentiator:** Unlike other HA AI integrations, Home Mind **remembers**:
- Sensor baselines ("100ppm NOx is normal in my home")
- User preferences ("I prefer 22°C")
- Device nicknames ("main kitchen light" = light.wled_kitchen)
- Historical patterns (learns what's normal vs unusual)

See `docs/MEMORY_EXAMPLES.md` for validated examples.

---

## Architecture

### Web Interface (via LibreChat)
```
LibreChat (web UI) → MCP Server → Home Assistant REST API
         ↓
    Memory System (MongoDB)
```

### Voice Interface (via HA Assist) - Phase 2.5
```
User → HA Assist (Voice/Text) → Custom Agent → Home Mind API → Claude + HA Tools
                                                     ↓
                                              SQLite Memory
```

**Complete voice flow:**
- User speaks to voice satellite (ESP32)
- Wyoming protocol captures audio
- HA Assist converts speech to text
- Home Mind conversation agent receives request
- Agent calls Home Mind API with user context
- Claude processes with HA tools and user memory
- Response flows back to user via TTS

---

## MCP Server Code (`src/mcp-server/src/`)

**Status:** Working, used for LibreChat web interface

| File | Purpose | Status |
|------|---------|--------|
| `index.ts` | Server entry point, Zod schemas, request handlers | Complete |
| `config.ts` | Environment config with Zod validation | Complete |
| `ha-client.ts` | HA REST API client (undici for self-signed certs) | Complete |

**Tools Exposed:**
- `get_state` - Get current state of entity
- `get_entities` - List entities by domain
- `search_entities` - Search entities by name
- `call_service` - Control devices
- `get_history` - Query historical data

---

## HA Bridge Code (`src/ha-bridge/src/`)

**Status:** Complete and working (v0.2.0)

| Directory | Purpose |
|-----------|---------|
| `api/` | Express routes and HTTP endpoints |
| `llm/` | Claude client with streaming |
| `memory/` | SQLite storage and fact extraction |
| `ha/` | Home Assistant client with caching |

**Endpoints:**
- `POST /api/chat` - Process chat request
- `POST /api/chat/stream` - SSE streaming endpoint
- `GET /api/health` - Health check

---

## HA Integration Code (`src/ha-integration/`)

**Status:** Complete and working (v0.2.0)

**Directory Structure:**
```
src/ha-integration/
└── custom_components/
    └── home_mind/
        ├── __init__.py          # Component setup
        ├── manifest.json        # Component metadata
        ├── conversation.py      # Main conversation agent
        ├── config_flow.py       # UI configuration
        ├── strings.json         # UI strings
        └── const.py             # Constants
```

**Purpose:**
- Registers as HA conversation agent
- Receives requests from HA Assist
- Calls Home Mind API
- Returns AI responses to HA

---

## Development Commands

### MCP Server (for LibreChat)
Run from `src/mcp-server/`. Requires Node.js 18+.
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx watch (hot reload)
npm run typecheck    # Type check without emitting
npm run lint         # ESLint
npm start            # Run compiled dist/index.js
```

### HA Bridge (for voice/HA)
Run from `src/ha-bridge/`. Requires Node.js 18+.
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx watch (hot reload)
npm start            # Run compiled dist/index.js
```

---

## Environment Variables

### MCP Server (`src/mcp-server/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `HA_URL` | Yes | Home Assistant URL (e.g., `https://192.168.88.14:8123`) |
| `HA_TOKEN` | Yes | Long-lived access token from HA |
| `HA_SKIP_TLS_VERIFY` | No | Set `true` for self-signed certs |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |

### HA Bridge (`src/ha-bridge/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `HA_URL` | Yes | Home Assistant URL |
| `HA_TOKEN` | Yes | Long-lived access token from HA |
| `PORT` | No | Server port (default: 3100) |

---

## Deployment

**Infrastructure:**
- LibreChat: ubuntuserver (192.168.88.12)
- Home Assistant: haos12 (192.168.88.14)
- Home Mind API: ubuntuserver (192.168.88.12:3100)
- Dev Workstation: omarchy (192.168.88.29)

**Deploy MCP server changes:**
```bash
scp -r src/mcp-server ubuntuserver:~/LibreChat/
ssh ubuntuserver "cd ~/LibreChat && docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'"
ssh ubuntuserver "cd ~/LibreChat && docker compose restart api"
```

**Deploy HA Bridge changes:**
```bash
scp -r src/ha-bridge ubuntuserver:~/home-mind/
ssh ubuntuserver "cd ~/home-mind/ha-bridge && npm install && npm run build"
ssh ubuntuserver "sudo systemctl restart home-mind"
```

**Deploy HA custom component:**
```bash
scp -r src/ha-integration/custom_components/home_mind haos12:/config/custom_components/
ssh haos12 "ha core restart"
```

**View logs:**
```bash
# Home Mind API logs
ssh ubuntuserver "journalctl -u home-mind -f"

# Home Assistant logs
ssh haos12 "tail -f /config/home-assistant.log | grep home_mind"
```

---

## Code Patterns

### MCP Server Patterns

**Zod schemas for validation:**
```typescript
const GetStateSchema = z.object({
  entity_id: z.string().describe("Entity ID to get state for"),
});

const { entity_id } = GetStateSchema.parse(args);
```

**ES Modules:**
```typescript
// Use .js extensions in imports
import { loadConfig } from "./config.js";
import { HomeAssistantClient } from "./ha-client.js";
```

### HA Integration Patterns

**Conversation agent:**
```python
class HomeMindConversationAgent(ConversationEntity):
    async def async_process(self, user_input: ConversationInput) -> ConversationResult:
        response = await self._call_api(user_input.text, user_id)
        intent_response = intent.IntentResponse(language=user_input.language)
        intent_response.async_set_speech(response)
        return ConversationResult(response=intent_response)
```

---

## Known Limitations

### Current (v0.2.0)
- Single-user only (multi-user via OIDC in v1.0)
- Web and voice have separate memory stores
- Voice response time ~2-3s for simple queries, longer with tools

### Planned for v1.0
- HACS integration (one-click install)
- HA Add-on packaging
- Multi-user support
- Memory sync between web and voice

---

## Quick Reference Links

### Documentation (This Repo)
- **INTEGRATION_STATUS.md** - Current project status (read first!)
- **PROJECT_PLAN.md** - Full roadmap and milestones
- **ARCHITECTURE.md** - Technical architecture overview
- **docs/PHASE_2.5_ARCHITECTURE.md** - Voice integration architecture
- **docs/MEMORY_EXAMPLES.md** - Memory system examples
- **README.md** - Project overview for users

### External Documentation
- [LibreChat Docs](https://www.librechat.ai/docs)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest)
- [Wyoming Protocol](https://github.com/rhasspy/wyoming)

---

## For Future Claude Code Sessions

When starting a new session:

1. **Say:** "Read INTEGRATION_STATUS.md first"
2. **Then:** "What phase are we in?"
3. **Context files to read:**
   - INTEGRATION_STATUS.md (quick status)
   - CLAUDE.md (this file - development guide)
   - PROJECT_PLAN.md (for detailed roadmap)

---

## Version History

| Date | Change | Author |
|------|--------|--------|
| 2026-01-12 | Initial version | Jure + Claude |
| 2026-01-16 | Updated for memory validation | Jure + Claude |
| 2026-01-17 | Added Phase 2.5 architecture changes | Jure + Claude |
| 2026-01-18 | v0.2.0 release - Voice assistant working | Jure + Claude |
| 2026-01-18 | Renamed project to Home Mind | Jure + Claude |

---

**Last Updated:** January 18, 2026
**Current Phase:** Phase 2.5 Complete - v0.2.0 Released
**Next Milestone:** v1.0 - HACS/Add-on packaging, multi-user support
