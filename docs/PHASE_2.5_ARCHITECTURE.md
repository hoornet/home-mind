# Phase 2.5: Home Assistant Assist Integration

**Duration:** 3 weeks  
**Status:** Planning  
**Goal:** Enable voice control through HA's native Assist with LibreChat's memory and intelligence

---

## Overview

Phase 2.5 adds voice control capabilities by integrating with Home Assistant's native Assist feature. Users will be able to use voice commands (via Wyoming protocol satellites like ESP32) while maintaining all the memory and contextual intelligence of LibreChat.

### Key Innovation

**Other voice assistants:** "The temperature is 21°C"  
**Our system:** "The temperature is 21°C - right at your normal 20-21°C morning range"

The AI remembers baselines, preferences, and context across both web and voice interfaces.

---

## Key Architectural Decision

### Authentication: Use External OIDC Provider

**Decision:** We will use `hass-oidc-auth` for authentication rather than building our own.

**Repository:** https://github.com/ganhammar/hass-oidc-auth

**Rationale:**
1. **Security:** Proven OIDC implementation, industry standard
2. **Multi-user:** Clean separation of user contexts and memories
3. **Time Savings:** ~2 weeks of development time saved
4. **Focus:** Allows us to focus on core integration logic
5. **Professional:** SSO approach is enterprise-grade

**Alternative Considered:** Build custom API key or OAuth system  
**Why Rejected:** 
- Reinventing the wheel
- Security complexity
- Multi-user would be harder to implement correctly
- Maintenance burden

### MCP Server: Keep Our Implementation

**Decision:** We will NOT use `hass-mcp-server`, we'll keep our own.

**Alternative Project:** https://github.com/ganhammar/hass-mcp-server

**Rationale:**
1. **Already Working:** Our MCP server is functional and tested
2. **Memory Features:** We've added memory + history that theirs doesn't have
3. **Control:** We control the roadmap and features
4. **Customization:** Can optimize for our specific use case

**Future Collaboration:**
- We may contribute our memory/history features upstream
- We can compare tool definitions and adopt improvements
- Not mutually exclusive - can collaborate later

---

## System Architecture

### Complete Flow Diagram
```
┌───────────────────────────────────────────────────────────────────┐
│                        Home Assistant                              │
│                                                                     │
│  ┌────────────────────┐                                            │
│  │  Voice Satellite   │  (ESP32 with microphone)                  │
│  │  (Wyoming)         │                                            │
│  └────────┬───────────┘                                            │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              Wyoming Protocol Handler                        │  │
│  │          (HA's native voice pipeline)                        │  │
│  └─────────────────────┬───────────────────────────────────────┘  │
│                        │                                            │
│                        ▼                                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                  Assist Pipeline                             │  │
│  │  - Wake word detection                                       │  │
│  │  - Speech-to-Text (Whisper)                                  │  │
│  │  - Intent → Text                                             │  │
│  └─────────────────────┬───────────────────────────────────────┘  │
│                        │                                            │
│                        ▼                                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │            Conversation Agent Selector                       │  │
│  │  (Choose which agent handles the request)                    │  │
│  └─────────────────────┬───────────────────────────────────────┘  │
│                        │                                            │
│                        ▼                                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │      LibreChat Conversation Agent (OUR CODE)                 │  │
│  │                                                               │  │
│  │  1. Receives text from Assist                                │  │
│  │  2. Gets user identity from OIDC context                     │  │
│  │  3. Maps HA user → LibreChat session                         │  │
│  │  4. Calls LibreChat API with user context                    │  │
│  │  5. Returns AI response to Assist                            │  │
│  └─────────────────────┬───────────────────────────────────────┘  │
│                        │                                            │
│                        ▼                                            │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              OIDC Authentication                              │  │
│  │           (hass-oidc-auth - EXTERNAL)                        │  │
│  │                                                               │  │
│  │  - Provides user identity tokens                             │  │
│  │  - Handles SSO login flow                                    │  │
│  │  - Maintains user sessions                                   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ HTTP Request with User Context
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │         LibreChat API                │
              │  (Running on ubuntuserver:3080)      │
              │                                       │
              │  - Receives request with user ID     │
              │  - Loads user-specific memory        │
              │  - Processes with Claude/GPT         │
              │  - Maintains conversation context    │
              └──────────────┬───────────────────────┘
                             │
                             │ MCP Protocol (stdio)
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │       Our MCP Server                 │
              │  (Running inside LibreChat container)│
              │                                       │
              │  Tools:                               │
              │  - get_state                          │
              │  - get_entities                       │
              │  - search_entities                    │
              │  - call_service                       │
              │  - get_history                        │
              └──────────────┬───────────────────────┘
                             │
                             │ HA REST API
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │     Home Assistant REST API          │
              │  (https://192.168.88.14:8123)        │
              │                                       │
              │  - Entity states                      │
              │  - Service calls                      │
              │  - Historical data                    │
              └──────────────────────────────────────┘
```

---

## Authentication Flow (Detailed)

### User Login (One-Time Setup)
```
1. User opens Home Assistant web UI
2. HA shows login page
3. User clicks "Login with OIDC" (configured via hass-oidc-auth)
4. Redirects to OIDC provider (Keycloak, HA native, etc.)
5. User authenticates
6. OIDC provider issues token
7. User redirected back to HA
8. HA stores user session with OIDC token
```

### Voice Command Flow (Every Request)
```
1. User: "Hey HA, is the temperature normal?"
   
2. Voice satellite captures audio → Wyoming → HA Assist
   
3. HA Assist converts speech to text: "is the temperature normal"
   
4. HA Assist routing:
   - Checks configured conversation agent
   - Routes to LibreChat Conversation Agent
   
5. Our Conversation Agent receives:
   {
     "text": "is the temperature normal",
     "user_context": {
       "user_id": "alice",
       "oidc_token": "eyJhbG...",
       "home_assistant_user": "alice@example.com"
     }
   }
   
6. Our agent extracts user identity:
   user_id = extract_from_oidc_token(context.oidc_token)
   # Result: "alice"
   
7. Our agent calls LibreChat API:
   POST http://librechat:3080/api/ask
   {
     "message": "is the temperature normal",
     "user_id": "alice",  # Maps to LibreChat session
     "conversation_id": "session-alice-20260117"
   }
   
8. LibreChat:
   - Loads Alice's memory (knows her baseline is 20-21°C)
   - Calls our MCP server to get_state("sensor.temperature")
   - MCP returns: 21.1°C
   - Claude processes with context
   
9. Claude response:
   "Yes, 21.1°C is essentially normal. It's right at your 
    typical 20-21°C morning range - just 0.1°C above."
   
10. Our agent returns response to HA Assist
   
11. HA Assist → TTS → Voice satellite → User hears response
```

---

## Multi-User Isolation

### How It Works

Each Home Assistant user gets:
- **Separate LibreChat session**
- **Isolated memory**
- **Own conversation history**

### Example Scenario

**User: Alice**
```
Alice (web): "Remember, my normal temperature is 20-21°C"
Claude: 🔖 Updated saved memory

Alice (voice): "Is temperature normal?"
Claude: "Yes, 21°C - right at your 20-21°C range"
```

**User: Bob (different person, same house)**
```
Bob (web): "Remember, I prefer 22-23°C"
Claude: 🔖 Updated saved memory

Bob (voice): "Is temperature normal?"
Claude: "It's 21°C. That's below your preferred 22-23°C range"
```

**Key Point:** Same sensor, different responses based on user preferences!

### Technical Implementation
```python
# In our conversation agent

def process(self, user_input: ConversationInput):
    # Extract user from OIDC token
    user_id = self.get_user_from_token(user_input.context.token)
    
    # Map to LibreChat session
    librechat_session = f"ha-user-{user_id}"
    
    # Call LibreChat with user context
    response = self.librechat_api.ask(
        message=user_input.text,
        user_id=user_id,
        session_id=librechat_session
    )
    
    return response
```

---

## Component Details

### 1. OIDC Authentication (External Dependency)

**Project:** `hass-oidc-auth`  
**Repository:** https://github.com/ganhammar/hass-oidc-auth  
**Purpose:** Provides OIDC authentication provider for Home Assistant

**Installation (TBD - Will document in Week 1):**
```yaml
# Example configuration.yaml (details TBD)
auth_providers:
  - type: oidc
    issuer: "https://your-oidc-provider.com"
    client_id: "home-assistant"
    client_secret: "secret"
```

**What it provides us:**
- User identity tokens
- SSO login flow
- Session management
- Multi-user support

---

### 2. LibreChat Conversation Agent (Our Code)

**Location:** `src/ha-integration/custom_components/librechat_conversation/`

**Files:**

#### `manifest.json`
```json
{
  "domain": "librechat_conversation",
  "name": "LibreChat Conversation",
  "codeowners": ["@hoornet"],
  "config_flow": true,
  "dependencies": [],
  "documentation": "https://github.com/hoornet/librechat-homeassistant",
  "iot_class": "cloud_polling",
  "requirements": ["aiohttp>=3.8.0"],
  "version": "1.0.0"
}
```

#### `__init__.py`
```python
"""LibreChat conversation agent for Home Assistant."""
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

DOMAIN = "librechat_conversation"

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up LibreChat conversation from a config entry."""
    # Initialize the conversation agent
    # Register with HA's conversation system
    return True
```

#### `conversation.py` (Core Logic)
```python
"""LibreChat conversation agent implementation."""
from homeassistant.components.conversation import AbstractConversationAgent
from homeassistant.helpers.aiohttp_client import async_get_clientsession

class LibreChatConversationAgent(AbstractConversationAgent):
    """LibreChat conversation agent."""
    
    def __init__(self, hass, config):
        """Initialize the agent."""
        self.hass = hass
        self.librechat_url = config["librechat_url"]
        self.session = async_get_clientsession(hass)
    
    async def async_process(self, user_input):
        """Process a user input and return a response."""
        
        # 1. Extract user identity from OIDC context
        user_id = self._get_user_from_context(user_input.context)
        
        # 2. Map to LibreChat session
        session_id = f"ha-user-{user_id}"
        
        # 3. Call LibreChat API
        response = await self._call_librechat(
            message=user_input.text,
            user_id=user_id,
            session_id=session_id
        )
        
        # 4. Return response to HA Assist
        return ConversationResult(
            response=response,
            conversation_id=session_id
        )
    
    def _get_user_from_context(self, context):
        """Extract user ID from OIDC token in context."""
        # Implementation TBD - depends on how HA exposes OIDC context
        # May need to decode JWT token or use HA's user API
        pass
    
    async def _call_librechat(self, message, user_id, session_id):
        """Call LibreChat API."""
        url = f"{self.librechat_url}/api/ask"
        
        # TBD: Determine exact LibreChat API format
        payload = {
            "message": message,
            "userId": user_id,
            "conversationId": session_id
        }
        
        async with self.session.post(url, json=payload) as resp:
            data = await resp.json()
            return data["response"]  # Format TBD
```

#### `config_flow.py`
```python
"""Config flow for LibreChat conversation."""
from homeassistant import config_entries
import voluptuous as vol

class LibreChatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for LibreChat."""
    
    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if user_input is not None:
            # Validate LibreChat URL
            return self.async_create_entry(
                title="LibreChat",
                data=user_input
            )
        
        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required("librechat_url"): str,
                # Add more config as needed
            })
        )
```

#### `api.py`
```python
"""LibreChat API client."""
import aiohttp

class LibreChatAPI:
    """Client for LibreChat API."""
    
    def __init__(self, base_url: str, session: aiohttp.ClientSession):
        """Initialize the client."""
        self.base_url = base_url
        self.session = session
    
    async def ask(self, message: str, user_id: str, session_id: str):
        """Send a message to LibreChat."""
        # Implementation based on LibreChat's actual API
        # TBD: Research exact endpoint format
        pass
    
    async def health_check(self):
        """Check if LibreChat is accessible."""
        url = f"{self.base_url}/api/health"  # TBD: actual endpoint
        async with self.session.get(url) as resp:
            return resp.status == 200
```

#### `const.py`
```python
"""Constants for LibreChat conversation."""

DOMAIN = "librechat_conversation"
CONF_LIBRECHAT_URL = "librechat_url"

# Default values
DEFAULT_LIBRECHAT_URL = "http://localhost:3080"
DEFAULT_TIMEOUT = 30  # seconds

# API endpoints (TBD - based on LibreChat's actual API)
API_ASK = "/api/ask"
API_HEALTH = "/api/health"
```

---

### 3. MCP Server (Existing - No Changes)

**Location:** `src/mcp-server/`  
**Status:** ✅ Working, no changes needed for Phase 2.5

**Current capabilities:**
- get_state
- get_entities  
- search_entities
- call_service
- get_history

**Runs inside LibreChat container via stdio transport.**

---

## Development Timeline

### Week 1: OIDC Authentication Setup

**Goals:**
- Install and configure `hass-oidc-auth`
- Understand OIDC token structure
- Test authentication flow
- Document setup process

**Tasks:**
1. [ ] Install `hass-oidc-auth` in test HA instance
2. [ ] Choose OIDC provider (Keycloak vs HA native vs other)
3. [ ] Configure OIDC provider
4. [ ] Test user login flow
5. [ ] Verify OIDC token contains user identity
6. [ ] Document configuration steps
7. [ ] Test with multiple users

**Success Criteria:**
- ✅ Users can log in via OIDC
- ✅ User identity accessible in HA context
- ✅ Multi-user login works
- ✅ Setup documented

**Deliverables:**
- OIDC installation guide
- Configuration examples
- Token structure documentation

---

### Week 2: Conversation Agent Development

**Goals:**
- Build custom HA conversation agent
- Integrate OIDC user context
- Connect to LibreChat API
- Test text conversation flow

**Tasks:**
1. [ ] Create custom component structure
2. [ ] Implement `conversation.py` agent interface
3. [ ] Extract user identity from OIDC token
4. [ ] Research LibreChat API endpoints
5. [ ] Implement LibreChat API client
6. [ ] Map HA user → LibreChat session
7. [ ] Handle API errors gracefully
8. [ ] Test via HA's text-based Assist interface

**Success Criteria:**
- ✅ Agent registered with HA
- ✅ Text queries route to our agent
- ✅ User context passed correctly
- ✅ LibreChat returns responses
- ✅ Multi-user isolation works

**Deliverables:**
- Working custom component
- API client implementation
- Integration tests

---

### Week 3: Voice Integration & Optimization

**Goals:**
- Integrate with Wyoming protocol
- Test with voice satellite
- Optimize response time
- Polish and document

**Tasks:**
1. [ ] Verify Wyoming protocol compatibility
2. [ ] Test with ESP32 voice satellite
3. [ ] Measure response times
4. [ ] Optimize if needed (<3 second target)
5. [ ] Handle voice-specific edge cases
6. [ ] Test multi-user voice sessions
7. [ ] Handle voice satellite user identification
8. [ ] Documentation and examples

**Success Criteria:**
- ✅ Voice commands work end-to-end
- ✅ Response time <3 seconds
- ✅ Multi-user voice works
- ✅ Memory persists across web/voice
- ✅ Error handling robust

**Deliverables:**
- Voice integration working
- Performance benchmarks
- User documentation
- Demo video footage

---

## Known Challenges & Solutions

### Challenge 1: LibreChat API Authentication

**Problem:** LibreChat may require authentication for API calls. We need to determine:
- Does LibreChat have a public API?
- How does it handle authentication?
- Can we create service accounts?

**Research Needed:**
- [ ] LibreChat API documentation
- [ ] Authentication methods
- [ ] Session management

**Potential Solutions:**
1. Use LibreChat's existing auth system
2. Create service account with elevated permissions
3. Use OIDC token forwarding if LibreChat supports it

**Week 1 Task:** Research and document LibreChat API

---

### Challenge 2: User Identity in Voice Sessions

**Problem:** Voice satellites may not inherently know which user is speaking.

**Potential Solutions:**

**Option A: Voice Recognition**
- Use HA's person detection
- Wyoming protocol may support user identification
- Requires training/setup

**Option B: Device-Based**
- Each voice satellite assigned to a user
- "Bedroom satellite" = User Alice
- Simple but less flexible

**Option C: Ask User**
- First command: "Who are you?"
- Store session context
- Fragile if session times out

**Week 3 Task:** Test Wyoming protocol capabilities, choose solution

---

### Challenge 3: Response Time for Voice

**Problem:** Voice users expect <2-3 second responses. Our flow has multiple hops:
```
Voice → HA → Our Agent → LibreChat → MCP → HA API → Response chain back
```

**Mitigation Strategies:**

1. **Optimize API calls:**
   - Use keep-alive connections
   - Minimize serialization overhead
   - Cache where appropriate

2. **Parallel processing:**
   - Start MCP calls while LLM is thinking
   - Stream responses if possible

3. **Fallback for slow queries:**
   - "Let me check on that..." acknowledgment
   - Async response delivery if needed

**Week 3 Task:** Benchmark and optimize

---

### Challenge 4: Session Management

**Problem:** Mapping HA users to LibreChat sessions persistently.

**Requirements:**
- Session survives HA restart
- Session survives LibreChat restart
- User can have multiple sessions (web + voice)
- Sessions eventually expire/clean up

**Solution:**
```python
# Deterministic session ID generation
session_id = f"ha-{user_id}-{datetime.now().strftime('%Y%m%d')}"
# Result: "ha-alice-20260117"
# New day = new session (automatic daily reset)

# Or persistent:
session_id = f"ha-{user_id}-persistent"
# Manually reset if needed
```

**Week 2 Task:** Implement and test session management

---

## Testing Strategy

### Unit Tests

**MCP Server (Existing):**
- Already has basic tests
- No changes needed

**Conversation Agent (New):**
```python
# tests/test_conversation_agent.py

async def test_user_extraction():
    """Test extracting user from OIDC token."""
    agent = LibreChatConversationAgent(hass, config)
    user_id = agent._get_user_from_context(mock_context)
    assert user_id == "alice"

async def test_librechat_api_call():
    """Test calling LibreChat API."""
    agent = LibreChatConversationAgent(hass, config)
    response = await agent._call_librechat(
        message="test",
        user_id="alice",
        session_id="test-session"
    )
    assert response is not None
```

---

### Integration Tests

**Test 1: End-to-End Text Conversation**
```
1. User logs in via OIDC as "alice"
2. User opens HA Assist (text interface)
3. User types: "What's the temperature?"
4. Verify:
   - Request reaches our agent
   - User context is "alice"
   - LibreChat called correctly
   - Response returned
   - Response is contextual if Alice has memory
```

**Test 2: Multi-User Isolation**
```
1. Alice logs in, asks: "Remember my baseline is 20°C"
2. Bob logs in, asks: "Remember my baseline is 22°C"
3. Alice asks: "What's my baseline?"
4. Verify response: "Your baseline is 20°C"
5. Bob asks: "What's my baseline?"
6. Verify response: "Your baseline is 22°C"
```

**Test 3: Voice Integration**
```
1. User speaks to voice satellite: "Turn on lights"
2. Verify:
   - Audio captured
   - Speech-to-text works
   - Routed to our agent
   - User identified
   - Command executed
   - Response spoken
3. Measure total time
4. Verify <3 seconds
```

**Test 4: Memory Across Interfaces**
```
1. Alice uses LibreChat web: "Remember 100ppm NOx is normal"
2. Alice uses voice: "Is NOx normal?"
3. Verify response references the learned baseline
4. Confirms same memory accessed across interfaces
```

---

### Manual Testing Checklist

**Week 1: OIDC**
- [ ] Login with User A
- [ ] Login with User B
- [ ] Verify separate sessions
- [ ] Test logout/re-login
- [ ] Test token expiry handling

**Week 2: Conversation Agent**
- [ ] Text query via HA Assist
- [ ] Multi-turn conversation
- [ ] Error handling (LibreChat down)
- [ ] Multiple users simultaneously

**Week 3: Voice**
- [ ] Wake word detection
- [ ] Speech recognition accuracy
- [ ] Response time measurement
- [ ] Background noise handling
- [ ] Multiple voice satellites

---

## Performance Targets

### Response Time

| Interface | Target | Acceptable | Unacceptable |
|-----------|--------|------------|--------------|
| Web (LibreChat direct) | <1s | <2s | >3s |
| Text (HA Assist) | <2s | <3s | >5s |
| Voice (Wyoming) | <2s | <3s | >4s |

### Throughput

| Metric | Target |
|--------|--------|
| Concurrent users | 5-10 |
| Requests/second | 2-5 |
| Session duration | Hours (no timeout issues) |

### Reliability

| Metric | Target |
|--------|--------|
| Uptime | >99% |
| Error rate | <1% |
| Recovery time | <30s (auto-restart) |

---

## Documentation Deliverables

### User Documentation

1. **Installation Guide**
   - OIDC provider setup
   - Custom component installation
   - Configuration steps
   - Verification procedure

2. **Usage Guide**
   - How to use voice commands
   - Multi-user setup
   - Troubleshooting
   - Example commands

3. **FAQ**
   - Common issues
   - Performance tips
   - Multi-user questions

### Developer Documentation

1. **Architecture Overview** (this document)
2. **API Reference**
   - LibreChat API endpoints
   - Our conversation agent API
3. **Development Setup**
   - Local testing environment
   - Debug procedures
4. **Contribution Guide**
   - Code standards
   - Testing requirements
   - PR process

---

## Success Criteria

### Functional

- ✅ OIDC authentication working
- ✅ Text conversation via HA Assist
- ✅ Voice conversation via Wyoming
- ✅ Multi-user isolation
- ✅ Memory persists across interfaces
- ✅ Error handling robust

### Performance

- ✅ Voice response <3 seconds (95th percentile)
- ✅ Text response <2 seconds (95th percentile)
- ✅ Support 5+ concurrent users

### Documentation

- ✅ Installation guide complete
- ✅ User guide complete
- ✅ All code documented
- ✅ Demo video recorded

### Launch Ready

- ✅ Works on fresh HA install
- ✅ No critical bugs
- ✅ Community feedback positive
- ✅ Ready for v1.0 announcement

---

## Risk Mitigation

### High Risk: LibreChat API Issues

**Risk:** LibreChat API doesn't exist or is incompatible  
**Probability:** Medium  
**Impact:** High (blocks entire Phase 2.5)

**Mitigation:**
- Research in Week 1
- Have fallback: direct MCP integration from HA
- Worst case: Fork LibreChat and add API ourselves

**Contingency:** If API blocked, fall back to Phase 2 (web-only) for v1.0

---

### Medium Risk: Voice Response Time

**Risk:** Full chain too slow for voice UX  
**Probability:** Medium  
**Impact:** Medium (voice feature less useful)

**Mitigation:**
- Benchmark early (Week 2)
- Optimize critical path
- Consider caching strategies
- Stream responses if possible

**Contingency:** Launch with text-only Assist, add voice in v1.1

---

### Low Risk: OIDC Configuration Complex

**Risk:** OIDC setup too complicated for users  
**Probability:** Low  
**Impact:** Medium (adoption barrier)

**Mitigation:**
- Clear documentation
- Setup wizard in config flow
- Pre-configured examples
- Video tutorial

**Contingency:** Offer managed OIDC service or simple API key fallback

---

## Next Steps (Week 1)

### Immediate Actions

1. **Install hass-oidc-auth**
   - [ ] Clone repository
   - [ ] Follow installation instructions
   - [ ] Configure in test HA instance

2. **Research LibreChat API**
   - [ ] Check LibreChat documentation
   - [ ] Test API endpoints manually
   - [ ] Document authentication method
   - [ ] Test with curl/Postman

3. **Create Component Structure**
   - [ ] Create directory: `src/ha-integration/custom_components/librechat_conversation/`
   - [ ] Create skeleton files
   - [ ] Set up development environment

4. **Update Documentation**
   - [ ] Document OIDC setup process
   - [ ] Document LibreChat API findings
   - [ ] Update PROJECT_PLAN.md with progress

---

## Appendix: External Project Links

### Projects We Use

- **hass-oidc-auth:** https://github.com/ganhammar/hass-oidc-auth
- **LibreChat:** https://github.com/danny-avila/LibreChat
- **Home Assistant:** https://github.com/home-assistant/core

### Projects for Reference

- **hass-mcp-server:** https://github.com/ganhammar/hass-mcp-server (similar approach, different implementation)
- **Wyoming Protocol:** https://github.com/rhasspy/wyoming (voice satellite protocol)
- **Extended OpenAI Conversation:** https://github.com/jekalmin/extended_openai_conversation (alternative conversation agent)

---

**Document Status:** Complete and ready for implementation  
**Last Updated:** January 17, 2026  
**Next Review:** After Week 1 completion