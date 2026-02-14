# Home Mind

**AI assistant for Home Assistant with cognitive memory.**

Home Mind adds learning capabilities, persistent memory, and voice control to your smart home. Unlike stateless AI integrations, Home Mind remembers -- corrections, preferences, sensor baselines, and device nicknames persist across conversations and sessions.

## What It Does

- **Learns from you** -- Tell it "100 ppm NOx is normal for my home" once, and it remembers across all future conversations.
- **Controls your devices** -- Turn lights on/off, adjust thermostats, query sensors, and analyze history through natural language.
- **Works with voice** -- Integrates with Home Assistant Assist for hands-free voice control via the Wyoming protocol.
- **Runs locally** -- Self-hosted with Docker Compose. Your data stays on your network.
- **Supports multiple LLM providers** -- Anthropic (Claude), OpenAI, or Ollama for fully local inference.

## How It Works

```
HA Assist (Voice/Text)
        |
HA Custom Component (Python)
        |
Home Mind Server (Express/TypeScript)
        |
   +---------+---------+
   |         |         |
Shodh     LLM API    HA REST
Memory   (Claude/    API
          OpenAI/
          Ollama)
```

Home Mind sits between Home Assistant and a large language model. It enriches every conversation with remembered facts from Shodh Memory, calls Home Assistant tools to query or control devices, and asynchronously extracts new facts from each exchange.

## Quick Links

| Page | Description |
|------|-------------|
| [Installation](Installation) | Step-by-step setup guide (Docker, HA integration, verification) |
| [Configuration](Configuration) | All environment variables, LLM provider setup, custom prompts |
| [Architecture](Architecture) | Technical deep-dive for contributors (request flow, memory, tools) |
| [Troubleshooting](Troubleshooting) | Common issues, log inspection, provider-specific tips |

## Project Status

**Current Version:** 0.10.0

Completed:
- Voice control via HA Assist
- Cognitive memory with Shodh (semantic search, Hebbian learning, natural decay)
- Streaming responses (SSE)
- HACS integration for easy HA installation
- Multi-LLM provider support (Anthropic, OpenAI, Ollama)
- Custom system prompt (AI personality customization)

Planned:
- Multi-user support (OIDC)
- HA Add-on packaging

## Links

- [GitHub Repository](https://github.com/hoornet/home-mind)
- [HACS Repository](https://github.com/hoornet/home-mind-hacs)
- [Changelog](https://github.com/hoornet/home-mind/blob/main/CHANGELOG.md)
- [Memory Examples](https://github.com/hoornet/home-mind/blob/main/docs/MEMORY_EXAMPLES.md)

## License

GNU Affero General Public License v3.0
