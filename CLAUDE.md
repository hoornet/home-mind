# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 🚨 READ THIS FIRST 🚨

**Current Phase:** Phase 2.5 - Home Assistant Assist Integration (Planning)  
**Last Major Update:** January 17, 2026  
**Quick Status:** [Read INTEGRATION_STATUS.md](INTEGRATION_STATUS.md)

---

## Recent Architecture Changes (January 2026)

### Phase 2.5: Home Assistant Assist Integration

**New Goal:** Enable voice control through HA's native Assist feature with LibreChat's memory and intelligence.

**Key Architectural Decisions:**

1. ✅ **Keep our MCP server** 
   - Already working with memory + history features
   - We control the roadmap
   - Can contribute upstream later if desired

2. ✅ **Use hass-oidc-auth for authentication**
   - External project: https://github.com/ganhammar/hass-oidc-auth
   - Provides secure OIDC/SSO authentication
   - Enables clean multi-user support
   - Saves ~2 weeks of development time

3. ✅ **Build custom conversation agent**
   - New component: `src/ha-integration/custom_components/librechat_conversation/`
   - Bridges HA Assist → LibreChat API
   - Handles user context and session management

**What Changed:**
- **NOT using** `hass-mcp-server` (different project by ganhammar) - we keep our own
- **ARE using** `hass-oidc-auth` (by ganhammar) for authentication only
- **ARE building** custom HA conversation agent to connect everything

**Architecture Flow:**
```
HA User (Voice/Text) → OIDC Auth → Our Conversation Agent → LibreChat API
                                                                   ↓
                                                           Our MCP Server → HA API
```

**External Dependencies Added:**
- `hass-oidc-auth` for authentication (to be installed)

**Our Components (Unchanged):**
- `src/mcp-server/` - Still our bridge, still working, no changes needed

**Our Components (New):**
- `src/ha-integration/` - HA conversation agent (to be built)

---

## Project Overview

MCP (Model Context Protocol) server that bridges LibreChat and Home Assistant, enabling AI models to query and control smart home devices with **persistent memory across sessions** and **voice control integration**.

**Status:** Phase 2.5 - Adding voice control via HA Assist

**Key Differentiator:** Unlike other HA AI integrations, this system **remembers**:
- Sensor baselines ("100ppm NOx is normal in my home")
- User preferences ("I prefer 22°C")
- Device nicknames ("main kitchen light" = light.wled_kitchen)
- Historical patterns (learns what's normal vs unusual)

See `docs/MEMORY_EXAMPLES.md` for validated examples.

---

## Architecture

### Current (Phase 2 - Working)
```
LibreChat (web UI) → MCP Server → Home Assistant REST API
         ↓
    Memory System (MongoDB)
```

### Future (Phase 2.5 - In Development)
```
User → HA Assist (Voice/Text) → Custom Agent → LibreChat API → MCP Server → HA
                                      ↑
                                 OIDC Auth
                            (hass-oidc-auth)
```

**Complete flow:**
- User speaks to voice satellite (ESP32)
- Wyoming protocol captures audio
- HA Assist converts speech to text
- Our custom conversation agent receives request
- OIDC provides user identity
- Agent calls LibreChat API with user context
- LibreChat processes with user-specific memory
- MCP server bridges to HA for device control/queries
- Response flows back to user via TTS

---

## MCP Server Code (`src/mcp-server/src/`)

**Status:** ✅ Working, no changes needed for Phase 2.5

| File | Purpose | Status |
|------|---------|--------|
| `index.ts` | Server entry point, Zod schemas, request handlers | ✅ Complete |
| `config.ts` | Environment config with Zod validation | ✅ Complete |
| `ha-client.ts` | HA REST API client (undici for self-signed certs) | ✅ Complete |

**Tools Exposed:**
- `get_state` - Get current state of entity
- `get_entities` - List entities by domain
- `search_entities` - Search entities by name
- `call_service` - Control devices
- `get_history` - Query historical data (added Phase 2.2)

---

## HA Integration Code (`src/ha-integration/`) 

**Status:** 🚧 To be built in Phase 2.5

**Directory Structure:**
```
src/ha-integration/
└── custom_components/
    └── librechat_conversation/
        ├── __init__.py          # Component setup
        ├── manifest.json        # Component metadata
        ├── conversation.py      # Main conversation agent
        ├── config_flow.py       # UI configuration
        ├── api.py              # LibreChat API client
        └── const.py            # Constants
```

**Purpose:**
- Registers as HA conversation agent
- Receives requests from HA Assist
- Extracts user identity from OIDC tokens
- Calls LibreChat API with user context
- Returns AI responses to HA

**Key Dependencies:**
- `hass-oidc-auth` (external) for user authentication
- LibreChat API (to be researched/documented)

See `docs/PHASE_2.5_ARCHITECTURE.md` for detailed design.

---

## Development Commands

All commands run from `src/mcp-server/`. Requires Node.js 18+.
```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx watch (hot reload)
npm run typecheck    # Type check without emitting
npm run lint         # ESLint
npm start            # Run compiled dist/index.js
```

**Local debugging:** Run `npm run dev` with `.env` configured, then test via stdio (the server reads from stdin and writes JSON responses to stdout, logs go to stderr).

---

## Environment Variables

Create `src/mcp-server/.env` from `.env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `HA_URL` | Yes | Home Assistant URL (e.g., `https://192.168.88.14:8123`) |
| `HA_TOKEN` | Yes | Long-lived access token from HA |
| `HA_SKIP_TLS_VERIFY` | No | Set `true` for self-signed certs |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |

---

## Deployment

**Infrastructure:**
- LibreChat: ubuntuserver (192.168.88.12)
- Home Assistant: haos12 (192.168.88.14)
- MCP Server: Mounted volume in LibreChat container

**Deploy MCP server changes from dev workstation:**
```bash
scp -r src/mcp-server ubuntuserver:~/LibreChat/
ssh ubuntuserver "cd ~/LibreChat && docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'"
ssh ubuntuserver "cd ~/LibreChat && docker compose restart api"
```

**Deploy HA integration (Phase 2.5):**
```bash
# TBD - Will be documented when component is built
# Likely: Copy to HA's custom_components directory and restart HA
```

**View logs:**
```bash
# LibreChat logs
ssh ubuntuserver "docker logs LibreChat -f"

# Home Assistant logs
ssh ubuntuserver "ssh haos12 'tail -f /config/home-assistant.log'"
```

---

## LibreChat Memory Configuration

Memory enables persistent facts across chat sessions. Configuration in `librechat.yaml`:
```yaml
memory:
  disabled: false
  tokenLimit: 2000
  agent:
    provider: "anthropic"
    model: "claude-3-5-haiku-20241022"  # MUST use Haiku, not Sonnet 4
```

**Critical Gotchas:**
- **Use Haiku, not Sonnet 4** - Sonnet 4's extended thinking causes `temperature is not supported when thinking is enabled` errors
- Agent provider/model must exist in your config (invalid refs break all chats)
- Memory runs on every request when enabled (cost implications)

**How it works:**
- Memory agent processes each message
- Extracts facts to remember
- Stores in MongoDB
- Loads relevant memories for future requests
- User sees "🔖 Updated saved memory" notifications

**Validated Examples:** See `docs/MEMORY_EXAMPLES.md`

---

## Code Patterns

### MCP Server Patterns

**Zod schemas for validation:**
```typescript
const GetStateSchema = z.object({
  entity_id: z.string().describe("Entity ID to get state for"),
});

// Use in handler
const { entity_id } = GetStateSchema.parse(args);
```

**ES Modules:**
```typescript
// Use .js extensions in imports
import { loadConfig } from "./config.js";
import { HomeAssistantClient } from "./ha-client.js";
```

**undici Agent for TLS bypass:**
```typescript
if (this.skipTlsVerify && url.startsWith("https://")) {
  const { Agent } = await import("undici");
  fetchOptions.dispatcher = new Agent({
    connect: { rejectUnauthorized: false },
  });
}
```

**Tool response format:**
```typescript
return {
  content: [
    {
      type: "text",
      text: JSON.stringify(result, null, 2)
    }
  ]
};
```

### HA Integration Patterns (To Be Established)

**Conversation agent interface:**
```python
class LibreChatConversationAgent(AbstractConversationAgent):
    async def async_process(self, user_input):
        # Extract user from OIDC
        user_id = self._get_user_from_context(user_input.context)
        
        # Call LibreChat
        response = await self._call_librechat(user_input.text, user_id)
        
        # Return to HA
        return ConversationResult(response=response)
```

**OIDC token handling:**
```python
def _get_user_from_context(self, context):
    # Extract from HA's OIDC context
    # Implementation TBD based on hass-oidc-auth internals
    pass
```

---

## Testing Strategy

### Phase 2 (Existing)
- Manual testing on real homelab
- Memory validation via cross-session tests
- Historical analysis validation
- See `docs/MEMORY_EXAMPLES.md` for test results

### Phase 2.5 (To Be Implemented)
- Unit tests for conversation agent
- Integration tests for OIDC flow
- End-to-end tests with voice satellite
- Performance benchmarks (<3s voice response)
- Multi-user isolation tests

---

## External Projects We Interact With

### Projects We USE

| Project | Repository | Purpose | Status |
|---------|-----------|---------|--------|
| **LibreChat** | danny-avila/LibreChat | Chat UI + Memory | ✅ Deployed |
| **hass-oidc-auth** | ganhammar/hass-oidc-auth | OIDC Authentication | 🚧 To integrate |
| **Home Assistant** | home-assistant/core | Smart Home | ✅ Working |

### Projects for REFERENCE (Not Using)

| Project | Repository | Note |
|---------|-----------|------|
| **hass-mcp-server** | ganhammar/hass-mcp-server | Similar MCP server. We keep our own but may collaborate later. |

**Why we're not using hass-mcp-server:**
- We built our own MCP server first
- Ours already has memory + history features
- We want control over the roadmap
- May contribute upstream or collaborate later

**Why we ARE using hass-oidc-auth:**
- Proven OIDC implementation
- Saves development time
- Enables multi-user cleanly
- We focus on integration logic

---

## Known Limitations

### Phase 2 (Current)
- Memory token limit: 2000 tokens
- Must use Haiku (not Sonnet 4)
- Single-user (Phase 2.5 adds multi-user)
- Web interface only (Phase 2.5 adds voice)

### Phase 2.5 (Anticipated)
- LibreChat API may need research/documentation
- Voice response time may need optimization
- User identification from voice satellites TBD
- OIDC setup complexity for end users

---

## Development Workflow

### Starting a new feature

1. **Read current status:**
```bash
   cat INTEGRATION_STATUS.md
```

2. **Check relevant architecture:**
   - For MCP: `ARCHITECTURE.md`
   - For Phase 2.5: `docs/PHASE_2.5_ARCHITECTURE.md`

3. **Update project plan:**
   - Mark tasks as started/complete
   - Update status percentages

4. **Code with patterns:**
   - Follow existing code style
   - Use Zod for validation
   - Add proper error handling

5. **Test locally:**
   - Run `npm run dev` for MCP server
   - Test with real HA instance
   - Verify memory persistence

6. **Deploy and verify:**
   - Use deployment commands above
   - Check logs for errors
   - Test end-to-end functionality

7. **Update documentation:**
   - Update INTEGRATION_STATUS.md
   - Add to MEMORY_EXAMPLES.md if relevant
   - Update PROJECT_PLAN.md milestones

---

## Troubleshooting

### MCP Server Issues

**"Unknown tool" errors:**
```bash
# Verify build
ssh ubuntuserver "cd ~/LibreChat/mcp-server && npm run build"

# Check tool registration
ssh ubuntuserver "docker logs LibreChat 2>&1 | grep 'MCP.*Tools'"
# Should show: get_state, get_entities, search_entities, call_service, get_history
```

**"Cannot find module" errors:**
```bash
# Verify files exist
ssh ubuntuserver "ls -la ~/LibreChat/mcp-server/src/"

# Rebuild
ssh ubuntuserver "cd ~/LibreChat/mcp-server && npm install && npm run build"
```

**Memory not persisting:**
```bash
# Check memory config
ssh ubuntuserver "grep -A 10 'memory:' ~/LibreChat/librechat.yaml"

# Verify using Haiku
# Should see: model: "claude-3-5-haiku-20241022"
# NOT: model: "claude-sonnet-4-20250514"
```

### HA Integration Issues (Phase 2.5)

**OIDC not working:**
- Check `hass-oidc-auth` installation
- Verify OIDC provider configuration
- Check HA logs for auth errors

**Conversation agent not registered:**
- Verify custom component installed
- Check HA logs for import errors
- Restart HA after changes

**LibreChat API errors:**
- Verify LibreChat is running
- Check API endpoint format
- Verify user context passed correctly

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
- [Home Assistant WebSocket API](https://developers.home-assistant.io/docs/api/websocket)
- [LibreChat Memory Config](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/memory)
- [hass-oidc-auth](https://github.com/ganhammar/hass-oidc-auth)

### Related Projects
- [hass-mcp-server](https://github.com/ganhammar/hass-mcp-server) - Reference implementation
- [Wyoming Protocol](https://github.com/rhasspy/wyoming) - Voice satellite protocol

---

## For Future Claude Code Sessions

When starting a new session:

1. **Say:** "Read INTEGRATION_STATUS.md first"
2. **Then:** "What phase are we in?"
3. **Context files to read:**
   - INTEGRATION_STATUS.md (quick status)
   - CLAUDE.md (this file - development guide)
   - docs/PHASE_2.5_ARCHITECTURE.md (if working on voice)
   - PROJECT_PLAN.md (for detailed roadmap)

This ensures you have full context on:
- What's currently working
- What's being built
- Why decisions were made
- Which external projects we use

---

## Version History

| Date | Change | Author |
|------|--------|--------|
| 2026-01-12 | Initial version | Jure + Claude |
| 2026-01-16 | Updated for memory validation | Jure + Claude |
| 2026-01-17 | Added Phase 2.5 architecture changes | Jure + Claude |

---

**Last Updated:** January 17, 2026  
**Current Phase:** Phase 2.5 - HA Assist Integration (Planning)  
**Next Milestone:** Week 1 - OIDC Authentication Setup