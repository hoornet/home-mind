# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat-HomeAssistant is an MCP (Model Context Protocol) server that bridges LibreChat and Home Assistant, enabling AI models to query and control smart home devices.

## Current Status

**Phase 2 (Core Features): IN PROGRESS** - Memory working, MCP integration complete.

**Verified working:**
- Querying devices by room: "Tell me what devices are in the bedroom"
- Querying sensor states: "What is the state of air quality in the bedroom"
- Controlling devices: "Turn off the lights in the kitchen"
- **Persistent memory across chat sessions** - AI remembers facts like "NOx 100 is baseline for my home"

## Project Phases (from PROJECT_PLAN.md)

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 0: Planning & Setup | ✅ Complete | Repo, architecture, dev environment |
| Phase 1: Proof of Concept | ✅ Complete | Basic MCP server, device control working |
| Phase 2: Core Features | 🔄 In Progress | Memory working, need full device support, error handling |
| Phase 3: Polish | Pending | Installation wizard, documentation, testing |
| Phase 4: Community Release | Pending | Public release, HACS submission |

## Enabling Memory (Phase 2 Priority)

LibreChat's memory feature must be configured in `librechat.yaml`. See `src/librechat-config/librechat.yaml.example` for the full config.

**Minimum required addition to librechat.yaml:**
```yaml
memory:
  disabled: false
  tokenLimit: 2000
  agent:
    provider: "anthropic"
    model: "claude-3-5-haiku-20241022"
```

**How it works:**
- Memory agent runs before each chat response
- Analyzes recent messages (`messageWindowSize`) to decide what to remember
- Stores facts that persist across chat sessions
- Users can toggle memory on/off per chat when `personalize: true`

**Key gotchas:**
- **Use Haiku, not Sonnet 4** - Sonnet 4 has "extended thinking" which causes `temperature is not supported when thinking is enabled` errors
- Agent provider/model must exist in your config (invalid refs break all chats)
- Memory runs on every request when enabled (cost implications)
- Custom endpoints require exact name matching

**Documentation:**
- [Memory Feature](https://www.librechat.ai/docs/features/memory)
- [Memory Configuration](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/memory)

## Architecture

```
LibreChat (chat UI) ──► MCP Server (this repo) ──► Home Assistant REST API
```

The MCP server runs inside the LibreChat container via stdio transport. It receives tool calls from the LLM and translates them to Home Assistant API requests.

## MCP Server Code Structure (`src/mcp-server/src/`)

| File | Purpose |
|------|---------|
| `index.ts` | MCP server entry point, tool definitions, and request handlers |
| `config.ts` | Environment config loading with Zod validation |
| `ha-client.ts` | Home Assistant REST API client (fetch-based with self-signed cert support) |

## Development Commands

All commands run from `src/mcp-server/`:

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with tsx watch (hot reload)
npm run typecheck    # Type check without emitting
npm run lint         # ESLint
npm start            # Run compiled dist/index.js
```

## Environment Variables

Create `.env` from `.env.example`:

| Variable | Required | Description |
|----------|----------|-------------|
| `HA_URL` | Yes | Home Assistant URL (e.g., `https://192.168.88.14:8123`) |
| `HA_TOKEN` | Yes | Long-lived access token from HA |
| `HA_SKIP_TLS_VERIFY` | No | Set `true` for self-signed certs |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |

## MCP Tools Exposed

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_state` | `entity_id` | Get current state of a single entity |
| `get_entities` | `domain?` | List entities, optionally filtered by domain |
| `search_entities` | `query` | Search entities by name/ID substring |
| `call_service` | `domain`, `service`, `entity_id?`, `data?` | Call any HA service |

## Deployment

**Infrastructure:**
- LibreChat: ubuntuserver (192.168.88.12)
- Home Assistant: haos12 (192.168.88.14)
- MCP Server: Mounted volume in LibreChat container

**Deploy changes from dev workstation:**
```bash
scp -r src/mcp-server ubuntuserver:~/LibreChat/
ssh ubuntuserver "cd ~/LibreChat && docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'"
ssh ubuntuserver "cd ~/LibreChat && docker compose restart api"
```

**View logs:**
```bash
ssh ubuntuserver "docker logs LibreChat -f"
```

## Code Patterns

- **Zod schemas** for all tool parameter validation (see `*Schema` objects in index.ts)
- **ES Modules** (`"type": "module"` in package.json, `.js` extensions in imports)
- **undici Agent** for TLS certificate bypass when `HA_SKIP_TLS_VERIFY=true`
- Tool handlers return `{ content: [{ type: "text", text: "..." }] }` format

## References

- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest)
- [LibreChat MCP Config](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers)
