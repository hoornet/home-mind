# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server that bridges LibreChat and Home Assistant, enabling AI models to query and control smart home devices with persistent memory across sessions.

**Status:** Phase 2 (Core Features) - Memory working, MCP integration complete. See `PROJECT_PLAN.md` for roadmap.

## Architecture

```
LibreChat (chat UI) ──► MCP Server (this repo) ──► Home Assistant REST API
```

The MCP server runs inside the LibreChat container via stdio transport. It receives tool calls from the LLM and translates them to Home Assistant API requests. See `ARCHITECTURE.md` for detailed diagrams.

## MCP Server Code (`src/mcp-server/src/`)

| File | Purpose |
|------|---------|
| `index.ts` | Server entry point, Zod tool schemas (`*Schema`), and request handlers |
| `config.ts` | Environment config loading with Zod validation |
| `ha-client.ts` | Home Assistant REST API client (uses undici Agent for self-signed cert support) |

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

## Environment Variables

Create `src/mcp-server/.env` from `.env.example`:

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

## LibreChat Memory Configuration

Memory enables persistent facts across chat sessions. Configuration in `librechat.yaml` (see `src/librechat-config/librechat.yaml.example`):

```yaml
memory:
  disabled: false
  tokenLimit: 2000
  agent:
    provider: "anthropic"
    model: "claude-3-5-haiku-20241022"  # MUST use Haiku, not Sonnet 4
```

**Gotchas:**
- **Use Haiku, not Sonnet 4** - Sonnet 4's extended thinking causes `temperature is not supported when thinking is enabled` errors
- Agent provider/model must exist in your config (invalid refs break all chats)
- Memory runs on every request when enabled (cost implications)

## Code Patterns

- **Zod schemas** for all tool parameter validation (see `*Schema` objects in `index.ts`)
- **ES Modules** (`"type": "module"` in package.json, `.js` extensions in imports)
- **undici Agent** for TLS certificate bypass when `HA_SKIP_TLS_VERIFY=true`
- Tool handlers return `{ content: [{ type: "text", text: "..." }] }` format

## References

- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest)
- [LibreChat MCP Config](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers)
- [LibreChat Memory Config](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/memory)
