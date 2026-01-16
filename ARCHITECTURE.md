---

## Phase 2.5: Voice Integration Architecture

### Overview

Phase 2.5 adds voice control capabilities by integrating with Home Assistant's native Assist feature. This allows users to control their home using voice commands while maintaining all the memory and contextual intelligence of LibreChat.

### Complete System with Voice Support
```
┌─────────────────────────────────────────────────────────────────────┐
│                          Home Assistant                              │
│                                                                       │
│  ┌────────────────────┐                                              │
│  │  Voice Satellite   │  ESP32 with microphone/speaker              │
│  │  (Wyoming)         │  Example: M5Stack Atom Echo                 │
│  └────────┬───────────┘                                              │
│           │                                                           │
│           │ Audio Stream (Wake word → Speech)                        │
│           ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Wyoming Protocol Handler                        │    │
│  │          (HA's native voice pipeline)                        │    │
│  │  - Handles audio streaming                                  │    │
│  │  - Wake word detection ("Hey Jarvis")                       │    │
│  └─────────────────────┬───────────────────────────────────────┘    │
│                        │                                              │
│                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  Assist Pipeline                             │    │
│  │  1. Wake word detected                                       │    │
│  │  2. Audio → Speech-to-Text (Whisper)                         │    │
│  │  3. Text → Intent parsing                                    │    │
│  │  4. Route to conversation agent                              │    │
│  └─────────────────────┬───────────────────────────────────────┘    │
│                        │                                              │
│                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │            Conversation Agent Selector                       │    │
│  │  Determines which agent handles the request                  │    │
│  │  (Extended OpenAI, Claude, or OUR LibreChat agent)           │    │
│  └─────────────────────┬───────────────────────────────────────┘    │
│                        │                                              │
│                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │      LibreChat Conversation Agent (OUR COMPONENT)            │    │
│  │                                                               │    │
│  │  custom_components/librechat_conversation/                   │    │
│  │                                                               │    │
│  │  Flow:                                                        │    │
│  │  1. Receives text: "is the temperature normal"              │    │
│  │  2. Extracts user from OIDC context                          │    │
│  │  3. Maps HA user → LibreChat session ID                      │    │
│  │  4. Calls LibreChat API with user context                    │    │
│  │  5. Returns AI response                                      │    │
│  └─────────────────────┬───────────────────────────────────────┘    │
│                        │                                              │
│                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              OIDC Authentication Layer                        │    │
│  │           (hass-oidc-auth - EXTERNAL)                        │    │
│  │                                                               │    │
│  │  Provides:                                                    │    │
│  │  - User identity tokens (JWT)                                │    │
│  │  - SSO login flow                                            │    │
│  │  - Session management                                        │    │
│  │  - Multi-user support                                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
└────────────────────────────┬──────────────────────────────────────────┘
                             │
                             │ HTTP POST to LibreChat API
                             │ Headers: User context from OIDC
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │         LibreChat API                │
              │  (http://ubuntuserver:3080/api)      │
              │                                       │
              │  Processing:                          │
              │  1. Receives: {                       │
              │       message: "is temp normal",      │
              │       userId: "alice",                │
              │       conversationId: "ha-alice"      │
              │     }                                 │
              │  2. Loads Alice's memory              │
              │     - Knows: 20-21°C is normal        │
              │  3. Gets current temp via MCP         │
              │  4. Claude processes with context     │
              │  5. Returns: "Yes, 21°C is normal"   │
              └──────────────┬───────────────────────┘
                             │
                             │ MCP Protocol (stdio)
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │       Our MCP Server                 │
              │  (Inside LibreChat container)        │
              │                                       │
              │  src/mcp-server/dist/index.js        │
              │                                       │
              │  Tools Available:                     │
              │  - get_state(entity_id)               │
              │  - get_entities(domain?)              │
              │  - search_entities(query)             │
              │  - call_service(...)                  │
              │  - get_history(entity, start, end)    │
              └──────────────┬───────────────────────┘
                             │
                             │ HA REST API
                             │ Authorization: Bearer {HA_TOKEN}
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │     Home Assistant REST API          │
              │  (https://192.168.88.14:8123/api)    │
              │                                       │
              │  Returns:                             │
              │  {                                    │
              │    "entity_id": "sensor.temp",        │
              │    "state": "21.0",                   │
              │    "attributes": {                    │
              │      "unit": "°C",                    │
              │      "friendly_name": "Temperature"   │
              │    }                                  │
              │  }                                    │
              └──────────────────────────────────────┘
                             │
                             │ Response flows back up
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │        Text-to-Speech                │
              │  HA converts response to speech       │
              │  "Yes, 21°C is normal - right at     │
              │   your typical 20-21°C range"        │
              └──────────────┬───────────────────────┘
                             │
                             │ Audio stream
                             ▼
              ┌──────────────────────────────────────┐
              │      Voice Satellite Speaker         │
              │  User hears contextualized response  │
              └──────────────────────────────────────┘
```

### Voice Command Flow Example

**Scenario:** User asks about temperature via voice
```
1. User speaks: "Hey Jarvis, is the temperature normal?"

2. Voice Satellite (ESP32):
   - Detects wake word "Hey Jarvis"
   - Streams audio to HA

3. Wyoming Protocol:
   - Sends audio to HA's Assist pipeline
   
4. HA Assist Pipeline:
   - Speech-to-Text: "is the temperature normal"
   - Intent recognition: Conversation query
   - Routes to LibreChat Conversation Agent

5. Our Conversation Agent:
   user_input = {
     text: "is the temperature normal",
     context: {
       user_id: "alice",
       oidc_token: "eyJhbGciOi...",
       home: "home_assistant_instance_1"
     }
   }

6. Extract User Identity:
   user_id = extract_user_from_oidc(context.oidc_token)
   # Result: "alice"

7. Map to LibreChat Session:
   session_id = f"ha-{user_id}-{date.today()}"
   # Result: "ha-alice-20260117"

8. Call LibreChat API:
   POST http://librechat:3080/api/ask
   {
     "message": "is the temperature normal",
     "userId": "alice",
     "conversationId": "ha-alice-20260117"
   }

9. LibreChat Processing:
   - Loads Alice's memory from MongoDB
   - Memory contains: "Normal temp range is 20-21°C"
   - Calls MCP tool: get_state("sensor.living_room_temperature")
   - MCP returns: 21.0°C
   - Claude processes: "Current is 21°C, Alice's normal is 20-21°C"
   - Response: "Yes, 21°C is essentially normal. It's right at your 
                typical 20-21°C range."

10. Our Agent Returns:
    return ConversationResult(
      response="Yes, 21°C is essentially normal. It's right at your 
                typical 20-21°C range.",
      conversation_id="ha-alice-20260117"
    )

11. HA Assist:
    - Text-to-Speech conversion
    - Streams audio to voice satellite

12. Voice Satellite:
    - Plays audio response
    - User hears contextualized answer

Total Time: ~2-3 seconds
```

### Multi-User Voice Scenario

**Scenario:** Different users, different preferences, same sensor

**User Alice's Profile:**
- Preferred temperature: 20-21°C
- Session: "ha-alice-20260117"

**User Bob's Profile:**
- Preferred temperature: 22-23°C
- Session: "ha-bob-20260117"

**Same Question, Different Responses:**
```
Alice asks: "Is the temperature okay?"
Claude: "Yes, 21°C is right at your preferred 20-21°C range."

[Later, same day]

Bob asks: "Is the temperature okay?"
Claude: "It's 21°C, which is below your preferred 22-23°C range. 
         Would you like me to adjust it?"
```

**How It Works:**
1. OIDC identifies which user is asking
2. Conversation agent maps to user-specific session
3. LibreChat loads that user's memory
4. Response is personalized based on learned preferences

### Authentication Flow (OIDC)
```
┌─────────────────────────────────────────────────────────────┐
│                    Initial Setup (One-Time)                  │
└─────────────────────────────────────────────────────────────┘

1. Install hass-oidc-auth in Home Assistant

2. Configure OIDC Provider (choose one):
   Option A: Self-hosted Keycloak
   Option B: HA's native auth provider (if supported)
   Option C: External provider (Auth0, etc.)

3. Configure HA to use OIDC:
   # configuration.yaml
   auth_providers:
     - type: oidc
       issuer: "https://your-oidc-provider.com"
       client_id: "home-assistant"
       client_secret: "secret"

4. User logs into HA via OIDC
   - Opens HA web UI
   - Clicks "Login with OIDC"
   - Authenticates with provider
   - OIDC provider issues JWT token
   - Token stored in HA session

┌─────────────────────────────────────────────────────────────┐
│                 Per-Request Flow (Every Voice Command)       │
└─────────────────────────────────────────────────────────────┘

1. User speaks command

2. Wyoming → Assist → Our Agent

3. Our Agent receives context:
   {
     "text": "command here",
     "context": {
       "user_id": "alice",
       "oidc_claims": {
         "sub": "alice@example.com",
         "name": "Alice Smith",
         "email": "alice@example.com"
       }
     }
   }

4. Extract user identity:
   def _get_user_from_context(self, context):
       return context.oidc_claims["sub"]
   # Returns: "alice@example.com"

5. Map to LibreChat session:
   session_id = f"ha-{user_id}-persistent"
   # Result: "ha-alice@example.com-persistent"

6. Call LibreChat with user context

7. LibreChat loads user-specific memory

8. Response personalized for that user
```

### Component Interaction Diagram
```
┌───────────────────────────────────────────────────────────────┐
│  Component Responsibilities                                    │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  Voice Satellite (ESP32)                            │      │
│  │  Responsibility: Audio capture and playback         │      │
│  │  - Wake word detection                              │      │
│  │  - Audio streaming                                  │      │
│  │  - TTS playback                                     │      │
│  └─────────────────────────────────────────────────────┘      │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  Wyoming Protocol (HA Native)                       │      │
│  │  Responsibility: Voice pipeline management          │      │
│  │  - Audio transport                                  │      │
│  │  - STT coordination                                 │      │
│  │  - TTS coordination                                 │      │
│  └─────────────────────────────────────────────────────┘      │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  HA Assist Pipeline (HA Native)                     │      │
│  │  Responsibility: Intent processing                  │      │
│  │  - Speech-to-Text (Whisper)                         │      │
│  │  - Intent recognition                               │      │
│  │  - Agent routing                                    │      │
│  │  - Text-to-Speech                                   │      │
│  └─────────────────────────────────────────────────────┘      │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  hass-oidc-auth (EXTERNAL DEPENDENCY)               │      │
│  │  Responsibility: User authentication                │      │
│  │  - OIDC token management                            │      │
│  │  - User identity verification                       │      │
│  │  - Session management                               │      │
│  └─────────────────────────────────────────────────────┘      │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  LibreChat Conversation Agent (OUR CODE)            │      │
│  │  Responsibility: Bridge HA ↔ LibreChat              │      │
│  │  - Extract user from OIDC                           │      │
│  │  - Map to LibreChat session                         │      │
│  │  - Call LibreChat API                               │      │
│  │  - Return formatted response                        │      │
│  └─────────────────────────────────────────────────────┘      │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  LibreChat (EXISTING - NO CHANGES)                  │      │
│  │  Responsibility: AI processing + memory             │      │
│  │  - Load user memory                                 │      │
│  │  - Process with Claude/GPT                          │      │
│  │  - Call MCP tools as needed                         │      │
│  │  - Return AI response                               │      │
│  └─────────────────────────────────────────────────────┘      │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  MCP Server (OUR CODE - NO CHANGES)                 │      │
│  │  Responsibility: HA API bridge                      │      │
│  │  - get_state, get_entities, search                  │      │
│  │  - call_service for device control                  │      │
│  │  - get_history for trends                           │      │
│  └─────────────────────────────────────────────────────┘      │
│                          │                                     │
│                          ▼                                     │
│  ┌─────────────────────────────────────────────────────┐      │
│  │  Home Assistant REST API (EXISTING)                 │      │
│  │  Responsibility: Device control and state           │      │
│  │  - Entity states                                    │      │
│  │  - Service execution                                │      │
│  │  - Historical data                                  │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                                │
└───────────────────────────────────────────────────────────────┘
```

### New Components (Phase 2.5)

#### 1. LibreChat Conversation Agent

**Location:** `src/ha-integration/custom_components/librechat_conversation/`

**Files:**
```
librechat_conversation/
├── __init__.py              # Component initialization
├── manifest.json            # Component metadata
├── conversation.py          # Main agent logic
├── config_flow.py           # Configuration UI
├── api.py                   # LibreChat API client
└── const.py                # Constants and defaults
```

**Responsibilities:**
- Register with HA as conversation agent
- Receive requests from HA Assist
- Extract user identity from OIDC context
- Call LibreChat API with user context
- Return AI responses to HA

**Key Code:**
```python
# conversation.py
class LibreChatConversationAgent(AbstractConversationAgent):
    async def async_process(self, user_input: ConversationInput):
        # 1. Extract user from OIDC
        user_id = self._get_user_from_oidc(user_input.context)
        
        # 2. Map to LibreChat session
        session_id = f"ha-{user_id}-{date.today()}"
        
        # 3. Call LibreChat API
        response = await self.librechat_api.ask(
            message=user_input.text,
            user_id=user_id,
            conversation_id=session_id
        )
        
        # 4. Return to HA
        return ConversationResult(
            response=response,
            conversation_id=session_id
        )
```

#### 2. OIDC Authentication (External)

**Project:** hass-oidc-auth  
**Repository:** https://github.com/ganhammar/hass-oidc-auth

**Why External:**
- Proven implementation
- Security best practices
- Multi-user support built-in
- Saves development time

**What It Provides:**
- JWT token management
- User authentication flow
- Session persistence
- Standard OIDC protocol

**How We Use It:**
```python
# In our conversation agent
def _get_user_from_oidc(self, context):
    # Access OIDC claims from HA context
    claims = context.user.oidc_claims
    return claims["sub"]  # User identifier
```

### Existing Components (No Changes)

#### MCP Server
**Location:** `src/mcp-server/`  
**Status:** ✅ Working, no changes needed

**Why No Changes:**
- Already provides all needed tools
- Memory + history features working
- LibreChat calls it via stdio (unchanged)
- HA never directly interacts with MCP

**Flow:**
```
HA Assist → Our Agent → LibreChat → MCP Server → HA API
                                      ↑
                               No changes here!
```

#### LibreChat
**Location:** External (danny-avila/LibreChat)  
**Status:** ✅ Deployed, no changes needed

**Why No Changes:**
- Already has API we'll use
- Memory system working
- MCP integration working
- Just needs to be called by our agent

### Data Flow Details

#### Request Processing
```
1. Voice Input
   - User: "Turn on kitchen lights"
   - Satellite: Captures audio
   - Wyoming: Streams to HA

2. Speech Processing
   - HA Assist: Audio → "turn on kitchen lights"
   - Intent: Conversation request
   - Route: LibreChat agent

3. User Context Extraction
   - OIDC: Provides user identity
   - Our Agent: Extracts "alice"
   - Session: "ha-alice-20260117"

4. LibreChat API Call
   POST /api/ask
   {
     "message": "turn on kitchen lights",
     "userId": "alice",
     "conversationId": "ha-alice-20260117"
   }

5. Memory Loading
   - LibreChat loads Alice's memory
   - Finds: "kitchen lights" = light.wled_kitchen
   - Context aware

6. MCP Tool Call
   - Claude decides: call_service needed
   - MCP executes: light.turn_on
   - Target: light.wled_kitchen

7. HA Execution
   - REST API receives command
   - Lights turn on
   - Success returned

8. Response Generation
   - Claude: "Kitchen lights are on"
   - LibreChat returns to agent

9. Speech Synthesis
   - HA Assist: Text → Speech
   - Plays via satellite speaker

10. User Hears
    - "Kitchen lights are on"
    - Total time: ~2-3 seconds
```

### Performance Considerations

#### Response Time Targets

| Hop | Target | Budget |
|-----|--------|--------|
| Voice → HA (Wyoming) | <100ms | Network + wake |
| HA → Our Agent | <50ms | Local call |
| Agent → LibreChat | <200ms | HTTP localhost |
| LibreChat → Claude | <1000ms | API call |
| Claude → MCP → HA | <500ms | Local execution |
| Response chain back | <150ms | Return path |
| **Total** | **<2000ms** | **2 second target** |

#### Optimization Strategies

1. **Keep-Alive Connections:**
```python
   # Reuse HTTP session
   self.session = aiohttp.ClientSession()
```

2. **Concurrent Operations:**
```python
   # Start MCP call while LLM thinking
   async with asyncio.gather(
       llm_process(),
       mcp_get_state()
   ):
       pass
```

3. **Caching (Future):**
   - Cache recent entity states (5min TTL)
   - Reduce HA API calls for frequent queries

### Security Architecture
```
┌───────────────────────────────────────────────────────┐
│  Security Layers                                       │
├───────────────────────────────────────────────────────┤
│                                                        │
│  Layer 1: Network Isolation                           │
│  ├─ All services on private network (Tailscale)       │
│  ├─ No internet exposure required                     │
│  └─ TLS for HTTPS connections                         │
│                                                        │
│  Layer 2: OIDC Authentication                         │
│  ├─ Industry-standard auth protocol                   │
│  ├─ JWT tokens with expiry                            │
│  ├─ Per-user sessions                                 │
│  └─ No shared credentials                             │
│                                                        │
│  Layer 3: API Authorization                           │
│  ├─ HA API: Long-lived token (scoped)                 │
│  ├─ LibreChat API: User-contexted calls               │
│  └─ No API keys in voice flow                         │
│                                                        │
│  Layer 4: Memory Isolation                            │
│  ├─ User-specific sessions                            │
│  ├─ No cross-user data access                         │
│  └─ MongoDB user-keyed documents                      │
│                                                        │
└───────────────────────────────────────────────────────┘
```

### Deployment Architecture
```
┌─────────────────────────────────────────────────────┐
│  Physical Deployment                                 │
├─────────────────────────────────────────────────────┤
│                                                      │
│  haos12 (192.168.88.14):                            │
│  ├─ Home Assistant                                  │
│  ├─ hass-oidc-auth (custom component)               │
│  └─ librechat_conversation (our component)          │
│                                                      │
│  ubuntuserver (192.168.88.12):                      │
│  ├─ LibreChat container                             │
│  │  ├─ Web UI                                       │
│  │  ├─ Memory system (MongoDB)                      │
│  │  └─ MCP Server (mounted volume)                  │
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

### Error Handling
```
┌───────────────────────────────────────────────────────┐
│  Error Scenarios & Handling                           │
├───────────────────────────────────────────────────────┤
│                                                        │
│  Scenario 1: LibreChat Down                           │
│  ├─ Detection: HTTP connection failed                 │
│  ├─ Response: "Sorry, I'm having trouble connecting"  │
│  └─ Fallback: Could route to basic agent              │
│                                                        │
│  Scenario 2: MCP Tool Failure                         │
│  ├─ Detection: HA API error                           │
│  ├─ Response: "I couldn't control that device"        │
│  └─ Log: Full error for debugging                     │
│                                                        │
│  Scenario 3: OIDC Token Expired                       │
│  ├─ Detection: Invalid token claim                    │
│  ├─ Response: "Please log in again"                   │
│  └─ Action: Trigger re-auth flow                      │
│                                                        │
│  Scenario 4: Slow Response (>5s)                      │
│  ├─ Detection: Timeout threshold                      │
│  ├─ Response: "Still working on that..."              │
│  └─ Async: Continue processing, notify when done      │
│                                                        │
│  Scenario 5: Unknown User                             │
│  ├─ Detection: No OIDC context                        │
│  ├─ Response: "I don't know who you are"              │
│  └─ Action: Prompt for login                          │
│                                                        │
└───────────────────────────────────────────────────────┘
```

### Testing Strategy

#### Integration Test Flow
```python
async def test_voice_to_device_control():
    """Test complete voice command flow."""
    
    # 1. Simulate voice input
    voice_input = "turn on kitchen lights"
    
    # 2. Mock OIDC context
    context = MockContext(
        user_id="test_alice",
        oidc_claims={"sub": "alice@test.com"}
    )
    
    # 3. Process through agent
    result = await conversation_agent.async_process(
        ConversationInput(
            text=voice_input,
            context=context
        )
    )
    
    # 4. Verify LibreChat called
    assert librechat_mock.called
    assert librechat_mock.user_id == "alice@test.com"
    
    # 5. Verify response
    assert "lights" in result.response.lower()
    assert "on" in result.response.lower()
```

### Future Enhancements

**Phase 3+ Possibilities:**

1. **Voice Recognition:**
   - Identify users by voice
   - No need to map satellite to user
   - Uses Wyoming's speaker ID

2. **Streaming Responses:**
   - Start TTS before full response ready
   - Reduce perceived latency
   - Better for long responses

3. **Wake Word Customization:**
   - Per-user wake words
   - "Hey Alice's Assistant"
   - More natural interaction

4. **Multi-Satellite Coordination:**
   - Respond on closest satellite
   - Follow user room-to-room
   - Contextual "here" and "there"

---

## External Dependencies Summary

### New Dependencies (Phase 2.5)

| Dependency | Type | Purpose | Status |
|-----------|------|---------|--------|
| hass-oidc-auth | External | OIDC authentication | To integrate |

### Existing Dependencies (Unchanged)

| Dependency | Type | Purpose | Status |
|-----------|------|---------|--------|
| LibreChat | External | Chat UI + Memory | Working |
| Home Assistant | External | Smart home platform | Working |
| MongoDB | External | Memory storage | Working |
| Anthropic API | External | AI processing | Working |

### Reference Projects (Not Dependencies)

| Project | Relation | Note |
|---------|----------|------|
| hass-mcp-server | Reference | Similar approach, we keep our own |

---

## Conclusion

Phase 2.5 adds voice control to our existing working system without changing the core components. By using hass-oidc-auth for authentication, we get secure multi-user support while focusing our development effort on the conversation agent bridge.

**Key Takeaways:**
- ✅ Voice adds new interface, not new complexity
- ✅ MCP server unchanged (already working)
- ✅ LibreChat unchanged (already working)
- ✅ OIDC handles auth (external, proven)
- ✅ Our agent is thin bridge layer
- ✅ Memory works across web + voice

**See Also:**
- `docs/PHASE_2.5_ARCHITECTURE.md` - Detailed phase documentation
- `INTEGRATION_STATUS.md` - Current project status
- `PROJECT_PLAN.md` - Full roadmap