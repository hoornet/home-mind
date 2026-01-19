# Home Mind Architecture

**Version:** 0.3.0
**Last Updated:** January 18, 2026
**Status:** Phase 2.5 Complete - Voice + Text Assist Working

---

## Overview

Home Mind is an AI assistant for Home Assistant with persistent memory and voice control. It consists of two independent interfaces that share the same intelligence but currently have separate memory stores.

## Current Architecture (v0.3.0)

### Two Interface Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Home Mind Architecture                          │
├─────────────────────────────┬───────────────────────────────────────┤
│     Web Interface           │      Voice/Text Interface             │
│     (LibreChat)             │      (HA Assist)                      │
│                             │                                        │
│  User → LibreChat Web UI    │  User → Voice Satellite / HA Text     │
│           ↓                 │              ↓                         │
│       MCP Server            │    HA Conversation Agent               │
│           ↓                 │              ↓                         │
│    Home Assistant API       │       Home Mind API                    │
│           ↓                 │    (ha-bridge @ :3100)                 │
│    MongoDB (memory)         │              ↓                         │
│                             │    Claude Haiku + HA Tools             │
│                             │              ↓                         │
│                             │       SQLite (memory)                  │
└─────────────────────────────┴───────────────────────────────────────┘
```

**Key Point:** Web and Voice have separate memory stores currently. Memory sync planned for v1.0.

---

## Voice/Text Interface (HA Assist)

This is the primary interface for Home Mind, providing voice and text control through Home Assistant's native Assist feature.

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Home Assistant                                  │
│                                                                      │
│  ┌────────────────────┐                                             │
│  │  Voice Satellite   │  ESP32 with microphone/speaker              │
│  │  (Wyoming)         │  Example: M5Stack Atom Echo                 │
│  └────────┬───────────┘                                             │
│           │                                                          │
│           │ Audio Stream (Wake word → Speech)                        │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Wyoming Protocol Handler                        │   │
│  │          (HA's native voice pipeline)                        │   │
│  │  - Handles audio streaming                                   │   │
│  │  - Wake word detection                                       │   │
│  └─────────────────────┬───────────────────────────────────────┘   │
│                        │                                             │
│                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Assist Pipeline                             │   │
│  │  1. Wake word detected                                       │   │
│  │  2. Audio → Speech-to-Text (Whisper)                         │   │
│  │  3. Route to conversation agent                              │   │
│  └─────────────────────┬───────────────────────────────────────┘   │
│                        │                                             │
│                        ▼                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │      Home Mind Conversation Agent (OUR COMPONENT)            │   │
│  │                                                              │   │
│  │  custom_components/home_mind/conversation.py                 │   │
│  │                                                              │   │
│  │  1. Receives text from Assist                                │   │
│  │  2. Calls Home Mind API                                      │   │
│  │  3. Returns AI response to HA                                │   │
│  └─────────────────────┬───────────────────────────────────────┘   │
│                        │                                             │
└────────────────────────┼────────────────────────────────────────────┘
                         │
                         │ HTTP POST to Home Mind API
                         │
                         ▼
          ┌──────────────────────────────────────┐
          │      Home Mind API (HA Bridge)       │
          │  (http://ubuntuserver:3100/api)      │
          │                                      │
          │  Processing:                         │
          │  1. Load user memory from SQLite     │
          │  2. Build prompt with context        │
          │  3. Stream to Claude Haiku           │
          │  4. Execute HA tools as needed       │
          │  5. Extract facts, update memory     │
          │  6. Return response                  │
          └──────────────┬───────────────────────┘
                         │
                         │ HA REST API calls
                         │
                         ▼
          ┌──────────────────────────────────────┐
          │     Home Assistant REST API          │
          │  (https://192.168.88.14:8123/api)    │
          │                                      │
          │  - Entity states                     │
          │  - Service calls                     │
          │  - Historical data                   │
          └──────────────────────────────────────┘
```

### Home Mind API Components

The HA Bridge (`src/ha-bridge/`) is a Node.js/Express server with:

| Directory | Purpose |
|-----------|---------|
| `api/` | Express routes (`/api/chat`, `/api/chat/stream`, `/api/health`) |
| `llm/` | Claude client with streaming support |
| `memory/` | SQLite storage + Haiku-based fact extraction |
| `ha/` | Home Assistant client with 10-second entity caching |

**Key Features:**
- Streaming responses (60-80% faster for simple queries)
- Parallel tool execution
- Automatic fact extraction and memory persistence
- Entity caching for performance

### HA Custom Component

The conversation agent (`src/ha-integration/custom_components/home_mind/`) registers with HA Assist:

```python
class HomeMindConversationAgent(ConversationEntity):
    async def async_process(self, user_input: ConversationInput) -> ConversationResult:
        response = await self._call_api(user_input.text, user_id)
        intent_response = intent.IntentResponse(language=user_input.language)
        intent_response.async_set_speech(response)
        return ConversationResult(response=intent_response)
```

---

## Web Interface (LibreChat)

The original interface using LibreChat's web UI with MCP integration.

### Flow Diagram

```
User → LibreChat Web UI (port 3080)
              ↓
        LibreChat API
              ↓
         MCP Server (stdio)
              ↓
    Home Assistant REST API
              ↓
        MongoDB (memory via LibreChat)
```

### MCP Server

The MCP server (`src/mcp-server/`) provides tools to LibreChat:

| Tool | Purpose |
|------|---------|
| `get_state` | Get current state of an entity |
| `get_entities` | List entities by domain |
| `search_entities` | Search entities by name |
| `call_service` | Control devices |
| `get_history` | Query historical data |

---

## Memory Systems

### Voice Memory (SQLite)

**Location:** `src/ha-bridge/data/memory.db`

**Fact Categories:**
- `baseline` - Sensor normal values ("NOx 100ppm is normal")
- `preference` - User preferences ("prefers 22°C")
- `identity` - User info ("name is Jure")
- `device` - Device nicknames
- `pattern` - Routines and habits

**Operations:**
1. Load facts for user on each request
2. Inject into system prompt
3. Call Claude with HA tools
4. Extract new facts from response (via Haiku)
5. Store new facts

### Web Memory (MongoDB)

Managed by LibreChat's built-in memory system. Separate from voice memory.

---

## Performance

### Response Time Breakdown

| Component | Time | Notes |
|-----------|------|-------|
| HA Assist → Conversation Agent | ~100ms | |
| Conversation Agent → HA Bridge | ~100ms | |
| Claude API (per round-trip) | ~2-3s | With streaming |
| Tool execution (cached) | ~10ms | Parallel execution |
| Tool execution (uncached) | ~500ms | |
| **Simple query (no tools)** | **2-3s** | Voice mode |
| **Query with 2 tools** | **8-9s** | 2 Claude round-trips |
| **Query with 4+ tools** | **12-15s** | Multiple round-trips |

### Optimizations Implemented

1. **Streaming** - `messages.stream()` for faster time-to-first-token
2. **Parallel tool execution** - `Promise.all()` for concurrent tools
3. **Entity caching** - 10-second TTL for HA state queries
4. **SSE endpoint** - `/api/chat/stream` for web clients

---

## Deployment

### Infrastructure

| Component | Host | IP/Port |
|-----------|------|---------|
| Home Assistant | haos12 | 192.168.88.14:8123 |
| LibreChat | ubuntuserver | 192.168.88.12:3080 |
| Home Mind API | ubuntuserver | 192.168.88.12:3100 |
| Dev Workstation | omarchy | 192.168.88.29 |

### Network

```
┌─────────────────────────────────────────────────────┐
│  Physical Deployment                                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│  haos12 (192.168.88.14):                            │
│  ├─ Home Assistant                                  │
│  └─ home_mind custom component                      │
│                                                      │
│  ubuntuserver (192.168.88.12):                      │
│  ├─ LibreChat container (:3080)                     │
│  │  ├─ Web UI                                       │
│  │  ├─ Memory system (MongoDB)                      │
│  │  └─ MCP Server (mounted volume)                  │
│  ├─ Home Mind API (:3100)                           │
│  │  └─ SQLite memory                                │
│  └─ MongoDB container                               │
│                                                      │
│  Voice Satellites (WiFi):                           │
│  ├─ ESP32 devices                                   │
│  └─ Wyoming protocol to HA                          │
│                                                      │
│  Network:                                            │
│  └─ Tailscale VPN (all devices)                     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## Security

| Layer | Implementation |
|-------|----------------|
| Network | Tailscale VPN, no internet exposure |
| HA Auth | Long-lived access token (scoped) |
| API Auth | Single-user mode (OIDC deferred to v1.0) |
| Memory | User-keyed SQLite/MongoDB |

---

## Future Enhancements (v1.0+)

| Feature | Status | Notes |
|---------|--------|-------|
| Multi-user (OIDC) | Planned | hass-oidc-auth integration |
| Memory sync | Planned | Unified web + voice memory |
| HACS integration | Planned | One-click install |
| HA Add-on | Planned | Simplified deployment |
| Prompt caching | Planned | Anthropic cache feature |
| Hybrid routing | Planned | Skip Claude for simple commands |
| Local LLM | Planned | Ollama fallback |

---

## Related Documentation

- **INTEGRATION_STATUS.md** - Current project status
- **PROJECT_PLAN.md** - Full roadmap
- **CLAUDE.md** - Development guide
- **docs/PHASE_2.5_ARCHITECTURE.md** - Original voice integration design
- **docs/MEMORY_EXAMPLES.md** - Memory system examples

---

**Version History:**
| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2026-01-17 | Initial Phase 2.5 architecture planning |
| 0.3.0 | 2026-01-18 | Updated to reflect actual implementation |
