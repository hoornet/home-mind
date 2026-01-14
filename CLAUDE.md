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

### Running the MCP Server

The server requires environment variables:
```bash
export HA_URL=http://192.168.88.14:8123
export HA_TOKEN=<your_long_lived_access_token>
npm start
```

Or create a `.env` file (copy from `.env.example`).

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
