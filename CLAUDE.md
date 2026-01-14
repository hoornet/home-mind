# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat-HomeAssistant is a bridge between LibreChat and Home Assistant that provides persistent conversational memory, learning capabilities, and advanced AI features for smart home control.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   LibreChat     │◄───────►│   MCP Server     │
│   (Frontend)    │         │  (HA Bridge)     │
└─────────────────┘         └──────────────────┘
        │                            │
        ▼                            ▼
┌─────────────────┐         ┌──────────────────┐
│  Anthropic API  │         │ Home Assistant   │
│  (or OpenAI)    │         │   REST API       │
└─────────────────┘         └──────────────────┘
```

**Key Components:**
- **LibreChat**: User-facing chat interface with conversation history and document upload
- **MCP Server**: Node.js/TypeScript server using MCP SDK to bridge LibreChat and Home Assistant
- **Home Assistant Integration**: Optional HACS component for enhanced HA-side features

## Development Commands

### MCP Server (`src/mcp-server/`)

```bash
cd src/mcp-server

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode (with watch)
npm run dev

# Type check without building
npm run typecheck

# Lint code
npm run lint
```

### Running the MCP Server Standalone

The server requires environment variables:
```bash
export HA_URL=https://192.168.88.14:8123
export HA_TOKEN=<your_long_lived_access_token>
export HA_SKIP_TLS_VERIFY=true
npm start
```

Or create a `.env` file (copy from `.env.example`).

## Deployment

### Current Deployment

| Service | Host | URL |
|---------|------|-----|
| LibreChat | ubuntuserver (192.168.88.12) | http://100.95.208.82:3080/ (Tailscale) |
| Home Assistant | haos12 (192.168.88.14) | https://192.168.88.14:8123 |
| MCP Server | Inside LibreChat container | stdio transport |

### LibreChat Deployment

LibreChat runs via Docker Compose on ubuntuserver with our MCP server mounted as a volume:

```bash
# On ubuntuserver
cd ~/LibreChat

# Key files:
# - docker-compose.override.yml  - Mounts MCP server and librechat.yaml
# - librechat.yaml               - MCP server configuration
# - mcp-server/                  - Our MCP server code

# Restart after changes
docker compose down && docker compose up -d

# View logs
docker logs LibreChat -f
```

### Updating MCP Server on Deployment

```bash
# From dev workstation (omarchy)
cd /home/hoornet/projects/librechat-homeassistant

# Copy updated MCP server to ubuntuserver
scp -r src/mcp-server ubuntuserver:~/LibreChat/

# Rebuild on ubuntuserver
ssh ubuntuserver "cd ~/LibreChat && docker run --rm -v ~/LibreChat/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'"

# Restart LibreChat
ssh ubuntuserver "cd ~/LibreChat && docker compose restart api"
```

## Development Environment

**Infrastructure:**
- Dev workstation: omarchy (Arch Linux, 192.168.88.29)
- Deployment target: ubuntuserver (192.168.88.12)
- Home Assistant: haos12 on pve-intel (192.168.88.14)
- Network: Tailscale (tailf9add.ts.net)

**Prerequisites:**
- Node.js >= 18.0.0
- Home Assistant long-lived access token
- Anthropic API key (for LibreChat)

## MCP Server Tools

The server exposes these tools to AI models:

| Tool | Description |
|------|-------------|
| `get_state` | Get current state of a single entity |
| `get_entities` | List all entities, optionally filtered by domain |
| `search_entities` | Search entities by name or ID |
| `call_service` | Call HA service (turn_on, turn_off, etc.) |

## External References

- [LibreChat](https://www.librechat.ai)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest)
