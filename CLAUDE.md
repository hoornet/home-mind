# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreChat-HomeAssistant is a bridge between LibreChat and Home Assistant that provides persistent conversational memory, learning capabilities, and advanced AI features for smart home control. The project is currently in the planning phase.

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
- **MCP Server**: Bridge that translates natural language to Home Assistant API calls (Node.js or Python - TBD)
- **Home Assistant Integration**: Optional HACS component for enhanced HA-side features

## Development Environment

**Infrastructure:**
- Dev workstation: omarchy (Arch Linux, 192.168.88.29)
- Deployment target: ubuntuserver (192.168.88.12)
- Home Assistant: haos12 on pve-intel (192.168.88.14)
- Network: Tailscale (tailf9add.ts.net)

**Prerequisites:**
- Docker & Docker Compose
- Node.js or Python 3.11+ (depending on MCP server implementation choice)
- Home Assistant long-lived access token
- Anthropic API key

## Planned Directory Structure

```
src/
  mcp-server/      # MCP server implementation
  ha-integration/  # Optional Home Assistant custom component
  librechat-config/ # LibreChat configuration templates
docker/            # Docker Compose files
docs/              # Documentation
examples/          # Example configurations and use cases
tests/             # Unit and integration tests
```

## Key Technical Decisions Pending

1. **MCP Server Language**: Node.js (LibreChat ecosystem) vs Python (HA ecosystem) - needs prototyping
2. **State Management**: Cache HA state in MCP server vs query on-demand
3. **Memory Storage**: Use LibreChat's built-in memory vs custom storage for HA-specific context

## External References

- LibreChat: https://www.librechat.ai
- MCP Protocol: https://modelcontextprotocol.io
- Home Assistant REST API: https://developers.home-assistant.io/docs/api/rest
