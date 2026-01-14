# Architecture

Technical architecture and design decisions for LibreChat-HomeAssistant integration.

## System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         User's Browser                              │
└────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                          LibreChat                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Chat UI      │  │ Conversation │  │ Document Storage         │  │
│  │              │  │ Memory       │  │ (RAG)                    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│                            │                                        │
│                            ▼                                        │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    MCP Client                                 │  │
│  │                 (Tool Execution)                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                                   │
                          MCP Protocol (stdio/SSE)
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                       MCP Server (HA Bridge)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Tool         │  │ HA API       │  │ State Cache              │  │
│  │ Definitions  │  │ Client       │  │ (Optional)               │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                                   │
                          REST API / WebSocket
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│                        Home Assistant                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Entities     │  │ Services     │  │ Automations              │  │
│  │ (Devices)    │  │ (Actions)    │  │                          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Component Details

### LibreChat

LibreChat serves as the user-facing interface and provides:

- **Conversation UI**: Web-based chat interface
- **Memory System**: Persistent conversation history stored in MongoDB
- **Multi-Model Support**: Claude, GPT-4, Ollama, and other providers
- **Document Upload**: RAG capabilities for floor plans, manuals, etc.
- **MCP Integration**: Native support for Model Context Protocol tools

**Deployment:** Docker container with MongoDB for persistence.

### MCP Server (Home Assistant Bridge)

The MCP server bridges LibreChat and Home Assistant using the Model Context Protocol.

#### Tool Definitions

The server exposes these tools to the LLM:

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_entities` | List all HA entities | `domain?`, `area?` |
| `get_state` | Get current state of entity | `entity_id` |
| `get_history` | Get historical state data | `entity_id`, `start_time?`, `end_time?` |
| `call_service` | Execute HA service | `domain`, `service`, `entity_id?`, `data?` |
| `get_areas` | List all areas/rooms | - |
| `search_entities` | Find entities by name | `query` |

#### Example Tool Flow

```
User: "Turn on the kitchen lights"
       │
       ▼
LLM identifies intent → call_service tool
       │
       ▼
MCP Server receives:
{
  "tool": "call_service",
  "arguments": {
    "domain": "light",
    "service": "turn_on",
    "entity_id": "light.kitchen"
  }
}
       │
       ▼
MCP Server calls HA API:
POST /api/services/light/turn_on
{"entity_id": "light.kitchen"}
       │
       ▼
Returns result to LLM → "Kitchen lights turned on"
```

### Home Assistant API Integration

#### Authentication

```
Authorization: Bearer <LONG_LIVED_ACCESS_TOKEN>
```

Long-lived access tokens are created in HA under User Profile > Security.

#### Key API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/` | GET | API status check |
| `/api/states` | GET | All entity states |
| `/api/states/<entity_id>` | GET | Single entity state |
| `/api/services/<domain>/<service>` | POST | Call a service |
| `/api/history/period/<timestamp>` | GET | Historical data |
| `/api/config` | GET | HA configuration |

#### WebSocket API (Optional)

For real-time state updates:
```
ws://<ha_host>:8123/api/websocket
```

## Data Flow

### Query Flow (Get State)

```
1. User: "What's the temperature in the living room?"
2. LibreChat → LLM with conversation context
3. LLM decides to use get_state tool
4. LibreChat → MCP Server: get_state(entity_id="sensor.living_room_temperature")
5. MCP Server → HA API: GET /api/states/sensor.living_room_temperature
6. HA API → MCP Server: {"state": "21.5", "attributes": {...}}
7. MCP Server → LibreChat: {"temperature": "21.5°C"}
8. LLM → LibreChat → User: "The living room temperature is 21.5°C"
```

### Command Flow (Control Device)

```
1. User: "Set the thermostat to 22 degrees"
2. LibreChat → LLM with context
3. LLM decides to use call_service tool
4. LibreChat → MCP Server: call_service(domain="climate", service="set_temperature", data={"temperature": 22})
5. MCP Server → HA API: POST /api/services/climate/set_temperature
6. HA API → MCP Server: {"success": true}
7. MCP Server → LibreChat: {"result": "success"}
8. LLM → User: "Thermostat set to 22°C"
```

## Configuration

### Environment Variables

```bash
# MCP Server
HA_URL=http://192.168.88.14:8123
HA_TOKEN=<long_lived_access_token>
MCP_PORT=3000

# LibreChat
ANTHROPIC_API_KEY=<api_key>
MCP_SERVERS='[{"name":"homeassistant","url":"http://localhost:3000"}]'
```

### LibreChat MCP Configuration

```yaml
# librechat.yaml
endpoints:
  mcp:
    homeassistant:
      type: "stdio"  # or "sse" for HTTP transport
      command: "node"
      args: ["./mcp-server/index.js"]
      env:
        HA_URL: "${HA_URL}"
        HA_TOKEN: "${HA_TOKEN}"
```

## Security Considerations

### Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Tailscale Network                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ omarchy     │    │ ubuntuserver│    │ haos12          │  │
│  │ (dev)       │    │ (LibreChat) │    │ (Home Assistant)│  │
│  │ .88.29      │    │ .88.12      │    │ .88.14          │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Security Best Practices

1. **Token Scope**: Create HA token with minimal required permissions
2. **Network Isolation**: Keep services on internal/VPN network only
3. **HTTPS**: Use TLS for all external connections
4. **No Internet Exposure**: HA API should not be publicly accessible
5. **Audit Logging**: Log all service calls for review

### Entity Exposure Control

Not all entities should be controllable via AI. Consider:

- **Whitelist approach**: Only expose specific entities
- **Domain filtering**: Allow lights, climate; block locks, alarms
- **Area restrictions**: Only certain rooms accessible

## Technology Decisions

### MCP Server Language: Node.js vs Python

| Factor | Node.js | Python |
|--------|---------|--------|
| LibreChat ecosystem | Native (same stack) | Foreign |
| HA ecosystem | Foreign | Native (HA uses Python) |
| MCP SDK | Official TypeScript SDK | Community Python SDK |
| Async handling | Native (event loop) | asyncio (good) |
| Performance | Excellent | Good |
| Package ecosystem | npm | pip |

**Decision Pending**: Will prototype both approaches in Phase 1.

### State Management Strategy

Options:
1. **On-demand queries**: Always fetch fresh from HA API
   - Pro: Always accurate
   - Con: Higher latency, more API calls

2. **Cached state**: Subscribe to HA events, maintain local cache
   - Pro: Fast responses
   - Con: Complexity, potential staleness

3. **Hybrid**: Cache for queries, fresh fetch for commands
   - Pro: Balance of speed and accuracy
   - Con: More complex

**Initial approach**: On-demand queries for MVP, add caching if needed.

## Directory Structure

```
librechat-homeassistant/
├── src/
│   ├── mcp-server/          # MCP server implementation
│   │   ├── index.ts         # Entry point
│   │   ├── tools/           # Tool implementations
│   │   │   ├── entities.ts
│   │   │   ├── services.ts
│   │   │   └── history.ts
│   │   ├── ha-client/       # HA API client
│   │   │   ├── api.ts
│   │   │   └── types.ts
│   │   └── config.ts
│   ├── ha-integration/      # Optional HA custom component
│   │   ├── manifest.json
│   │   ├── __init__.py
│   │   └── config_flow.py
│   └── librechat-config/    # LibreChat configuration templates
│       ├── librechat.yaml
│       └── .env.example
├── docker/
│   ├── docker-compose.yml   # Full stack deployment
│   ├── Dockerfile.mcp       # MCP server container
│   └── .env.example
├── docs/
│   ├── INSTALLATION.md
│   ├── CONFIGURATION.md
│   └── TROUBLESHOOTING.md
├── examples/
│   └── example-commands.md
├── tests/
│   ├── unit/
│   └── integration/
├── ARCHITECTURE.md          # This file
├── PROJECT_PLAN.md
├── README.md
└── LICENSE
```

## Future Considerations

### Scalability

- Support for multiple HA instances
- Multi-user with separate conversation histories
- Rate limiting and request queuing

### Advanced Features

- **Voice Integration**: Wyoming protocol for voice assistants
- **Automation Generation**: Create HA automations from natural language
- **Analytics**: Usage patterns, common commands, optimization suggestions

## References

- [LibreChat Documentation](https://www.librechat.ai/docs)
- [MCP Specification](https://spec.modelcontextprotocol.io)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest)
- [Home Assistant WebSocket API](https://developers.home-assistant.io/docs/api/websocket)
