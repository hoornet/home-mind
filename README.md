# Home Mind

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/Version-0.6.0-brightgreen.svg)]()
[![Status](https://img.shields.io/badge/Status-Voice%20Working-success.svg)]()

AI assistant for Home Assistant with cognitive memory. Adds learning capabilities, persistent memory, and voice control to your smart home.

## The Problem

Current Home Assistant AI integrations suffer from:

- **No persistent memory** - Forgets corrections and preferences between sessions
- **No learning capability** - Can't remember sensor baselines or user preferences
- **Stateless interactions** - Every conversation starts from zero

## The Solution

Home Mind provides:

- **Cognitive memory** with semantic search and natural decay (via Shodh Memory)
- **Learning** from corrections and user preferences
- **Voice control** via HA Assist (Wyoming protocol)
- **Self-hosted** and privacy-focused

## Memory in Action

Unlike stateless AI assistants, Home Mind **learns and remembers** across conversations:

**First Conversation:**
```
User: What's the NOx sensor reading?
AI: The NOx sensor shows 100 ppm.

User: Is that high?
AI: Typically indoor NOx is 20-40 ppm, so this seems elevated...

User: Actually, 100 is normal for my home. Remember that.
AI: I'll remember that 100 ppm is within normal parameters for your NOx levels.
```

**Next Day (New Conversation):**
```
User: How's the air quality?
AI: The NOx sensor shows 98 ppm, which is within normal parameters for your home.
```

**Result:** Home Mind remembers the baseline without being reminded!

### What Gets Remembered

- Sensor baselines and thresholds
- Device nicknames and locations
- User preferences and patterns
- Corrections and clarifications

See [docs/MEMORY_EXAMPLES.md](docs/MEMORY_EXAMPLES.md) for more examples.

## Architecture

```
┌─────────────────────────────────────────┐
│  HA Assist (Voice + Text)               │
│              ↓                          │
│  HA Custom Component                    │
│              ↓                          │
│  Home Mind API (home-mind-server)              │
│              ↓                          │
│  Shodh Memory (Cognitive Memory)        │
│              ↓                          │
│  Claude API + Home Assistant REST API   │
└─────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Docker & Docker Compose** - [Install Docker](https://docs.docker.com/engine/install/) or run `curl -fsSL https://get.docker.com | sh`
- **Home Assistant** with a [long-lived access token](https://developers.home-assistant.io/docs/auth_api/#long-lived-access-token)
- **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com/)

### 1. Clone and Configure

```bash
git clone https://github.com/hoornet/home-mind.git
cd home-mind
cp .env.example .env
```

Edit `.env` with your credentials:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
HA_URL=https://your-ha-instance:8123
HA_TOKEN=your-long-lived-access-token
SHODH_API_KEY=$(openssl rand -hex 32)
```

### 2. Deploy with Docker Compose

```bash
# Download Shodh Memory binary (latest release)
cd docker/shodh
curl -sL https://github.com/varun29ankuS/shodh-memory/releases/latest/download/shodh-memory-linux-x64.tar.gz | tar -xz
cd ../..

# Deploy
./scripts/deploy.sh
```

### 3. Install HA Custom Component

**HACS (Recommended):**
1. Add `https://github.com/hoornet/home-mind-hacs` as custom repository in HACS
2. Install "Home Mind"
3. Restart Home Assistant

**Manual:**
```bash
cp -r src/ha-integration/custom_components/home_mind /config/custom_components/
```

### 4. Configure in Home Assistant

1. Settings → Devices & Services → Add Integration → Home Mind
2. Enter your Home Mind API URL (e.g., `http://192.168.1.100:3100`)
3. Set as conversation agent in Voice Assistants

## Available Tools

| Tool | Description |
|------|-------------|
| `get_state` | Get current state of an entity |
| `get_entities` | List entities by domain |
| `search_entities` | Search entities by name |
| `call_service` | Control devices (turn_on, turn_off, etc.) |
| `get_history` | Get historical state data |

## Project Status

**Current Version:** v0.6.0

- [x] Voice control via HA Assist
- [x] Cognitive memory with Shodh
- [x] Streaming responses
- [x] HACS integration
- [ ] Multi-user support (OIDC)
- [ ] HA Add-on packaging

## Documentation

- [CLAUDE.md](CLAUDE.md) - Development guide
- [docs/MEMORY_EXAMPLES.md](docs/MEMORY_EXAMPLES.md) - Memory system examples

## License

GNU Affero General Public License v3.0 - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [Shodh Memory](https://github.com/varun29ankuS/shodh-memory) - Cognitive memory backend
- [Home Assistant](https://www.home-assistant.io) - Open source home automation
- [Anthropic Claude](https://www.anthropic.com) - AI model
