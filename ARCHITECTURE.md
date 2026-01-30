# Home Mind Architecture

**Version:** 0.6.0
**Last Updated:** January 30, 2026
**Status:** Phase 1 Complete - Voice + Text + Memory Working

---

## Overview

Home Mind is an AI assistant for Home Assistant with cognitive memory. It provides voice and text control through HA Assist with persistent, semantic memory via Shodh Memory.

## Architecture (v0.6.0)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Home Mind                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User (Voice/Text)                                             │
│          ↓                                                       │
│   HA Assist (Wyoming protocol / Text input)                     │
│          ↓                                                       │
│   Home Mind Conversation Agent (HA custom component)            │
│          ↓                                                       │
│   Home Mind Server (Express API @ :3100)                        │
│          ↓                         ↓                            │
│   Claude Haiku 4.5          Shodh Memory (@ :3030)              │
│          ↓                         ↓                            │
│   HA REST API              Cognitive Memory                     │
│   (device control)         (semantic search, Hebbian learning)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Home Mind Server

**Location:** `src/home-mind-server/`
**Runtime:** Node.js/Express
**Port:** 3100

The API server that processes chat requests:

```
src/home-mind-server/
├── src/
│   ├── index.ts           # Entry point
│   ├── config.ts          # Zod-validated config
│   ├── api/routes.ts      # HTTP endpoints
│   ├── llm/
│   │   ├── client.ts      # Claude client with streaming
│   │   ├── tools.ts       # HA tool definitions
│   │   └── prompts.ts     # System prompt builder
│   ├── memory/
│   │   ├── shodh-client.ts  # Shodh Memory API client
│   │   ├── extractor.ts     # Fact extraction with Haiku
│   │   └── types.ts         # Memory types
│   └── ha/
│       └── client.ts      # HA REST API client
└── Dockerfile
```

**Endpoints:**
- `POST /api/chat` - Send message, get response
- `POST /api/chat/stream` - SSE streaming response
- `GET /api/health` - Health check

### 2. Shodh Memory

**Binary:** `docker/shodh/shodh-memory-server`
**Version:** 0.1.75
**Port:** 3030

Cognitive memory backend with:
- Semantic search (MiniLM embeddings)
- Hebbian learning (connections strengthen with use)
- Natural decay (unused memories fade)
- Knowledge graph relationships

**Data Location:** `/data` (mounted from host or Docker volume)

### 3. HA Custom Component

**Location:** `src/ha-integration/custom_components/home_mind/`

Registers as a conversation agent in Home Assistant:

```python
class HomeMindConversationAgent(ConversationEntity):
    async def async_process(self, user_input):
        response = await self._call_api(user_input.text)
        return ConversationResult(response=intent_response)
```

---

## Request Flow

```
1. User speaks "Turn off the kitchen light"
        ↓
2. HA Assist (Wyoming STT) → Text
        ↓
3. Home Mind Agent receives text
        ↓
4. HTTP POST to Home Mind Server
        ↓
5. Server loads relevant memories from Shodh
        ↓
6. Claude Haiku generates response (may call HA tools)
        ↓
7. Tools execute: search_entities → call_service
        ↓
8. Response returned: "Done, kitchen light is off"
        ↓
9. Haiku extracts any new facts → stored in Shodh
        ↓
10. TTS speaks response to user
```

---

## Memory System

### Fact Categories

| Category | Purpose | Example |
|----------|---------|---------|
| `baseline` | Normal sensor values | "NOx 100ppm is normal for this home" |
| `preference` | User preferences | "Prefers bedroom at 21°C" |
| `identity` | User info | "User's name is Jure" |
| `device` | Device nicknames | "The main light is the living room LED" |
| `pattern` | Routines and habits | "Usually turns off lights at 11pm" |
| `correction` | Learned corrections | "Don't lower blinds when sunny" |

### Memory Operations

1. **Recall** - On each request, retrieve relevant memories using semantic search
2. **Reinforce** - Retrieved memories get Hebbian boost
3. **Store** - New facts extracted from conversations via Claude Haiku
4. **Replace** - Conflicting facts are superseded by new ones
5. **Decay** - Unused memories naturally fade over time

---

## Deployment

### Docker Compose

```yaml
services:
  shodh:
    build: ./docker/shodh
    ports: ["3030:3030"]
    volumes:
      - ${SHODH_DATA_PATH:-shodh_data}:/data
      - shodh_cache:/root/.cache/shodh-memory

  server:
    build: ./src/home-mind-server
    ports: ["${PORT:-3100}:3100"]
    depends_on:
      shodh: { condition: service_healthy }
    environment:
      - SHODH_URL=http://shodh:3030
```

### Infrastructure

| Component | Host | Port |
|-----------|------|------|
| Home Assistant | haos12 | 8123 |
| Home Mind Server | ubuntuserver | 3100 |
| Shodh Memory | ubuntuserver | 3030 |

---

## Performance

| Query Type | Response Time | Notes |
|------------|---------------|-------|
| Simple (no tools) | 2-3s | Streaming helps |
| With 1-2 tools | 5-8s | Tool execution + Claude |
| Complex (4+ tools) | 10-15s | Multiple Claude round-trips |

### Optimizations

- **Streaming** - `messages.stream()` for faster time-to-first-token
- **Parallel tools** - `Promise.all()` for concurrent tool execution
- **Retry logic** - 3 retries with exponential backoff for Shodh
- **Keep-alive** - Connection reuse for Shodh requests

---

## Tools Available

| Tool | Description |
|------|-------------|
| `get_state` | Get current state of an entity |
| `get_entities` | List entities by domain |
| `search_entities` | Search entities by name |
| `call_service` | Control devices (turn_on, turn_off, etc.) |
| `get_history` | Get historical state data |

---

## Security

| Layer | Implementation |
|-------|----------------|
| Network | Docker internal network, optional Tailscale |
| HA Auth | Long-lived access token |
| Shodh Auth | API key (SHODH_API_KEY) |
| Multi-user | Single user (OIDC planned for v1.0) |

---

## Future Plans

| Feature | Status |
|---------|--------|
| SaaS hosted option | Phase 3 planned |
| Multi-user (OIDC) | v1.0 planned |
| HA Add-on packaging | v1.0 planned |
| Hybrid routing | Planned (skip Claude for simple commands) |

---

## Related Documentation

- **README.md** - Quick start guide
- **CLAUDE.md** - Development guide
- **ROADMAP.md** - Task tracking
- **docs/MEMORY_EXAMPLES.md** - Memory system examples
- **docs/SAAS_ARCHITECTURE.md** - SaaS plans

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-01-17 | Initial architecture |
| 0.3.0 | 2026-01-18 | Voice integration, SQLite memory |
| 0.5.0 | 2026-01-29 | Shodh Memory, consolidated architecture |
| 0.6.0 | 2026-01-30 | Shodh v0.1.75, bundled ONNX, documentation cleanup |
