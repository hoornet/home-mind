# LibreChat-HomeAssistant

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Status: Planning](https://img.shields.io/badge/Status-Planning-yellow.svg)]()

Persistent AI assistant for Home Assistant using LibreChat. Adds conversation memory, learning capabilities, and advanced AI features to your smart home.

## The Problem

Current Home Assistant AI integrations suffer from:

- **No persistent memory** - Forgets corrections and preferences between sessions
- **No learning capability** - Can't remember sensor baselines or user preferences
- **Stateless interactions** - Every conversation starts from zero

**Example:** You tell the AI that a NOX sensor value of 96 is normal for your home. Next conversation, it makes the same mistake again.

## The Solution

This integration bridges LibreChat with Home Assistant to provide:

- Persistent conversation memory across sessions
- Learning from corrections and user preferences
- Document upload and analysis (floor plans, manuals)
- Searchable conversation history
- Multiple AI model support (Claude, GPT, local via Ollama)
- Self-hosted and privacy-focused

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

## Project Status

**Current Phase:** Planning (Phase 0)

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for detailed roadmap and [ARCHITECTURE.md](ARCHITECTURE.md) for technical design.

## Requirements

- Home Assistant instance with REST API access
- Docker & Docker Compose
- API key for AI provider (Anthropic, OpenAI, or local Ollama)
- Home Assistant long-lived access token

## Quick Start

> **Note:** Installation instructions will be added once the project reaches MVP stage.

## Documentation

- [PROJECT_PLAN.md](PROJECT_PLAN.md) - Project roadmap and milestones
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture and design decisions

## Contributing

Contributions are welcome! Please see the project plan for current priorities.

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [LibreChat](https://www.librechat.ai) - Feature-rich chat interface
- [Home Assistant](https://www.home-assistant.io) - Open source home automation
- [Model Context Protocol](https://modelcontextprotocol.io) - AI tool integration standard
