# LibreChat-HomeAssistant

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/Version-0.2.0-brightgreen.svg)]()
[![Status](https://img.shields.io/badge/Status-Voice%20Working-success.svg)]()

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


## Memory in Action

Unlike stateless AI assistants, this integration **learns and remembers** across conversations:

### Example: Sensor Baselines

**First Conversation:**
```
User: What's the NOx sensor reading?
Claude: The NOx sensor shows 100 ppm.

User: Is that high?
Claude: Typically indoor NOx is 20-40 ppm, so this seems elevated...

User: Actually, 100 is normal for my home. Remember that.
Claude: 🔖 Updated saved memory
        I'll remember that 100 ppm is within normal parameters for your NOx levels.
```

**Next Day (New Conversation):**
```
User: How's the air quality?
Claude: The NOx sensor shows 98 ppm, which is within normal parameters for your home.
```

**Result:** Claude remembers the baseline without being reminded!

### Example: Personal Preferences

```
Chat 1:
User: My name is Jure, also known as Hoornet
Claude: 🔖 Updated saved memory
        Great to meet you, Jure!

Chat 2 (Later):
Claude: Hi Jure! How can I help you today?
```

### What Gets Remembered

✅ **Sensor baselines and thresholds**  
✅ **Device nicknames and locations**  
✅ **User preferences and patterns**  
✅ **Corrections and clarifications**  
✅ **Automation routines**

### Memory Transparency

You'll see "🔖 Updated saved memory" notifications when Claude learns something new. You can always ask "What do you know about X?" to see what's stored.

See [Memory Examples](docs/MEMORY_EXAMPLES.md) for detailed documentation.

---

## Memory + History: Intelligence That Learns

The real power comes from combining **persistent memory** with **historical data analysis**:

### Example: Contextual Temperature Monitoring

**Teaching Claude What's Normal:**
```
User: Remember that 20-21°C is normal for the living room in the morning

Claude: 🔖 Updated saved memory
        I'll remember that 20-21°C is your normal living room temperature range
        in the morning.
```

**Next Day (New Conversation):**
```
User: Is the living room temperature normal this morning?

Claude: [checks current temperature: 21.1°C]
        [recalls from memory: normal = 20-21°C]

        Yes, your living room temperature is essentially normal this morning.
        It's 21.1°C, just 0.1°C above your typical 20-21°C range - which is
        negligible. You're right at the comfortable range you prefer.
```

**Result:** Claude provides **contextualized answers** instead of just raw numbers.

### Example: Trend Analysis with Context

**Query:**
```
How has the living room temperature changed since this morning?
```

**Response:**
```
Claude: [queries history API]
        Temperature progression:
        • 06:00 AM: 19.9°C
        • 07:00 AM: 20.1°C
        • 08:00 AM: 20.7°C (current)

        [uses memory: normal = 20-21°C]

        The temperature has been steadily increasing by 0.8°C throughout the
        morning, now reaching the lower end of your normal comfort range.
        This is a typical morning warm-up pattern.
```

### Example: Anomaly Detection

**Query:**
```
Was there anything unusual about the temperature today?
```

**Response:**
```
Claude: [checks history for today]
        [compares to remembered baseline: 20-21°C]

        No, temperatures stayed within your normal 20-21°C morning range all day.
        The peak was 21.4°C at 2pm, which is typical for afternoon warming.
```

### Why This Matters

**Traditional HA AI:**
- "The temperature is 21.1°C" ← Raw data, no context

**LibreChat + Memory + History:**
- "21.1°C is normal for you" ← Contextual, learned intelligence

### What Gets Learned

The system automatically remembers and applies:

✅ **Sensor baselines** - "100 ppm NOx is normal in my home"
✅ **Comfort ranges** - "20-21°C is comfortable morning temperature"
✅ **Patterns** - "Temperature rises 6-9am due to morning sun"
✅ **Anomalies** - "Spike to 25°C is unusual, investigate"
✅ **Preferences** - "I prefer bedroom cooler than living room"

### Technical Implementation

- **Memory**: LibreChat's native memory system (MongoDB storage)
- **History**: Home Assistant's `/api/history/period` endpoint
- **Analysis**: Claude Sonnet 4's reasoning over combined data
- **Learning**: Automatic memory updates from corrections

See [MEMORY_EXAMPLES.md](docs/MEMORY_EXAMPLES.md) for more examples.

---

## Quick Start



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

**Current Version:** v0.2.0 (January 18, 2026)
**Current Phase:** Phase 2.5 Complete - Voice + Text Assist

- [x] MCP Server with Home Assistant integration
- [x] LibreChat deployment with MCP integration
- [x] Persistent memory across chat sessions
- [x] Sensor history queries
- [x] Voice control via HA Assist (Wyoming protocol)
- [x] Streaming responses for faster voice
- [ ] Multi-user support (OIDC)
- [ ] Advanced device controls (climate, media, covers)

See [PROJECT_PLAN.md](PROJECT_PLAN.md) for detailed roadmap and [ARCHITECTURE.md](ARCHITECTURE.md) for technical design.

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Home Assistant instance with API access
- Anthropic API key (or other AI provider)

### 1. Clone LibreChat

```bash
git clone https://github.com/danny-avila/LibreChat.git
cd LibreChat
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` and set your Anthropic API key:
```bash
ANTHROPIC_API_KEY=your_api_key_here
```

### 3. Add MCP Server

Clone this repository and copy the MCP server:
```bash
git clone https://github.com/hoornet/librechat-homeassistant.git
cp -r librechat-homeassistant/src/mcp-server ./mcp-server
```

Build the MCP server:
```bash
docker run --rm -v $(pwd)/mcp-server:/app -w /app node:20 sh -c 'npm install && npm run build'
```

### 4. Configure LibreChat for MCP

Create `librechat.yaml`:
```yaml
version: 1.2.1

mcpServers:
  homeassistant:
    type: stdio
    command: node
    args:
      - /app/mcp-server/dist/index.js
    env:
      HA_URL: "https://your-ha-instance:8123"
      HA_TOKEN: "your_long_lived_access_token"
      HA_SKIP_TLS_VERIFY: "true"  # If using self-signed cert
    timeout: 30000
```

Create `docker-compose.override.yml`:
```yaml
services:
  api:
    volumes:
      - ./mcp-server:/app/mcp-server
      - ./librechat.yaml:/app/librechat.yaml
```

### 5. Start LibreChat

```bash
docker compose up -d
```

Access LibreChat at http://localhost:3080

## Available MCP Tools

Once configured, Claude can use these tools to interact with Home Assistant:

| Tool | Description |
|------|-------------|
| `get_state` | Get current state of an entity |
| `get_entities` | List entities by domain |
| `search_entities` | Search entities by name |
| `call_service` | Control devices (turn_on, turn_off, etc.) |
| `get_history` | Get historical state data for sensors over time |

## Documentation

- [PROJECT_PLAN.md](PROJECT_PLAN.md) - Project roadmap and milestones
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture and design decisions
- [src/librechat-config/](src/librechat-config/) - Example configuration files

## Contributing

Contributions are welcome! Please see the project plan for current priorities.

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [LibreChat](https://www.librechat.ai) - Feature-rich chat interface
- [Home Assistant](https://www.home-assistant.io) - Open source home automation
- [Model Context Protocol](https://modelcontextprotocol.io) - AI tool integration standard
