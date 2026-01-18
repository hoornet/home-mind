# Integration Status

**Last Updated:** January 18, 2026 (v0.2.0 Release)
**Current Phase:** Phase 2.5 - HA Bridge with Memory (Voice Assistant Working!)
**Project Status:** v0.2.0 Released - Voice + Text Assist with Streaming

---

## Quick Reference

### What's Working ✅

| Feature | Status | Evidence |
|---------|--------|----------|
| MCP Server | ✅ Production | Memory + history features validated |
| LibreChat Web UI | ✅ Production | Running on ubuntuserver:3080 |
| Persistent Memory (Web) | ✅ Validated | Cross-session persistence working |
| Historical Analysis | ✅ Validated | 7-day trend analysis, comparison tables |
| Device Control | ✅ Working | Lights, sensors, service calls |
| Anomaly Detection | ✅ Validated | Contextual alerts using learned baselines |
| **HA Bridge API** | ✅ Deployed | Running on ubuntuserver:3100 |
| **HA Bridge Memory** | ✅ Working | SQLite persistence, fact extraction |
| **HA Text Assist** | ✅ Working | Entity search, device control, live sensor data |
| **Entity Caching** | ✅ Working | 10-second TTL, faster repeat queries |
| **Voice Control** | ✅ Working | Wyoming protocol, ESP32 satellites |
| **Streaming Responses** | ✅ Working | 60-80% faster simple queries |

### What's Complete ✅

| Feature | Phase | Status | Notes |
|---------|-------|--------|-------|
| HA Bridge API | 2.5 | ✅ Complete | ubuntuserver:3100 |
| Our Memory Layer | 2.5 | ✅ Complete | SQLite persistence |
| HA Conversation Agent | 2.5 | ✅ Complete | Custom component |
| Text Assist | 2.5 | ✅ Complete | Live sensor data |
| Voice Control | 2.5 | ✅ Complete | v0.2.0 release |
| Streaming | 2.5 | ✅ Complete | SSE endpoint available |

---

## Architecture Overview

### Current (Phase 2) - Web Only
```
User → LibreChat Web → MCP Server → Home Assistant
              ↓
         MongoDB (memory)
```

### New (Phase 2.5) - Web + Voice
```
┌─────────────────────────────────────────────────────────────┐
│                      Two Interfaces                          │
├─────────────────────────────┬───────────────────────────────┤
│     Web (LibreChat)         │      Voice (HA Assist)        │
│            ↓                │             ↓                 │
│       MCP Server            │    HA Conversation Agent      │
│            ↓                │        ✅ Working             │
│     (existing flow)         │             ↓                 │
│                             │       HA Bridge API           │
│                             │    ✅ ubuntuserver:3100       │
│                             │             ↓                 │
│                             │    Claude Haiku 4.5 + Tools   │
└─────────────────────────────┴───────────────────────────────┘
                              ↓
                    Home Assistant REST API (with caching)
```

**Key Point:** Web and Voice have separate memory stores for now. Future: sync them.

---

## Major Architecture Decision (January 17, 2026)

### Build Our Own Memory Layer

**Finding:** LibreChat does NOT have an official public API for programmatic message sending. The maintainer explicitly stated "that's not its intended usage" ([Discussion #4679](https://github.com/danny-avila/LibreChat/discussions/4679)).

**Decision:** Build our own HA Bridge service with integrated memory, rather than depending on LibreChat's undocumented internal APIs.

**New Component: `ha-bridge`**
- HTTP API for HA conversation agent
- SQLite-based memory storage
- Direct Claude integration with HA tools
- Entity caching for performance

**Benefits:**
- ✅ No dependency on undocumented APIs
- ✅ Full control over memory behavior
- ✅ Simpler architecture (fewer hops)
- ✅ Can optimize for voice use case
- ✅ Enables future SaaS monetization

**Trade-off:** LibreChat web UI and HA Assist will have separate memories initially.

See `docs/PHASE_2.5_IMPLEMENTATION.md` for full details.

---

## Key Components

### Our Code (This Repository)

```
librechat-homeassistant/
├── src/
│   ├── mcp-server/              ✅ WORKING - LibreChat web integration
│   │   └── src/
│   │       ├── index.ts         # MCP tools
│   │       ├── config.ts
│   │       └── ha-client.ts
│   │
│   ├── ha-bridge/               ✅ WORKING - Voice integration API (with streaming)
│   │   └── src/
│   │       ├── index.ts         # Express server
│   │       ├── api/routes.ts    # HTTP routes + SSE streaming endpoint
│   │       ├── memory/          # SQLite storage + extraction
│   │       ├── llm/client.ts    # Claude client with streaming
│   │       └── ha/              # HA client with caching
│   │
│   └── ha-integration/          ✅ WORKING - HA custom component
│       └── custom_components/
│           └── librechat_ha/
│               ├── __init__.py
│               ├── conversation.py  # Uses intent.IntentResponse
│               ├── config_flow.py
│               └── const.py         # 120s timeout for Claude
│
├── docs/
│   ├── MEMORY_EXAMPLES.md           ✅ Complete
│   ├── PHASE_2.5_ARCHITECTURE.md    ✅ Complete
│   ├── PHASE_2.5_IMPLEMENTATION.md  ✅ Complete
│   └── BETA_RELEASE_CHECKLIST.md    ✅ Complete
│
├── CLAUDE.md                        ✅ Updated
├── PROJECT_PLAN.md                  🔄 Needs update
├── ARCHITECTURE.md                  🔄 Needs update
└── README.md                        ✅ Updated
```

### External Dependencies

| Project | Purpose | Status |
|---------|---------|--------|
| **LibreChat** | Web chat UI (existing) | ✅ Deployed |
| **Home Assistant** | Smart home platform | ✅ Running |
| **hass-oidc-auth** | Multi-user auth (optional) | ⏸️ Deferred to later |

**Note:** OIDC authentication deferred. Starting with simpler user ID approach first.

---

## Phase 2.5 Implementation Plan

### Week 1: HA Bridge API + Memory ✅ COMPLETE

| Day | Task | Status |
|-----|------|--------|
| 1 | Create ha-bridge directory structure | ✅ Done |
| 2 | HTTP API skeleton (Express + routes) | ✅ Done |
| 3 | SQLite memory storage | ✅ Done |
| 4 | Fact extraction with Haiku | ✅ Done |
| 5 | Claude client + HA tools | ✅ Done |
| 5 | Deploy to ubuntuserver | ✅ Done |

**Week 1 Success Criteria:**
- [x] `POST /api/chat` returns AI response
- [x] Memory persists between requests
- [x] HA tools work (get_state, search_entities, call_service, get_history)
- [x] Deployed and accessible at ubuntuserver:3100

### Week 2: HA Integration + Voice ✅ MOSTLY COMPLETE

| Day | Task | Status |
|-----|------|--------|
| 6-7 | HA custom component | ✅ Done |
| 7 | Install on HA | ✅ Done |
| 7 | Configure integration | ✅ Done |
| 8 | Debug conversation processing | ✅ Done |
| 8 | Test text Assist | ✅ Done |
| 8 | Add entity caching | ✅ Done |
| 9 | Voice testing (Wyoming) | ⬜ Ready |
| 10 | Documentation | ✅ Done |

**Bugs Fixed (Jan 17):**
1. `conversation.IntentResponse` → `intent.IntentResponse` (HA 2026.1 API change)
2. Timeout increased to 120s for Claude tool calls
3. System prompt strengthened for mandatory tool use
4. Switched to Claude Haiku 4.5 for better instruction following
5. Added 10-second entity caching for performance

**Week 2 Success Criteria:**
- [x] HA custom component installed
- [x] Config flow working
- [x] Text commands work via Assist
- [x] Live sensor data (not just memory recall)
- [x] Voice commands work (v0.2.0!)
- [x] Response time acceptable (2-3s with streaming)

### Week 3: Streaming + Voice Testing ✅ COMPLETE

| Priority | Task | Status |
|----------|------|--------|
| 1 | **Implement streaming in HA Bridge** | ✅ Done |
| 2 | **SSE endpoint for web clients** | ✅ Done |
| 3 | **Stream to conversation agent** | ✅ Done (uses streaming internally) |
| 4 | Voice satellite testing | ✅ Done (v0.2.0) |
| 5 | Multi-user testing | ⬜ Deferred to v1.0 |
| 6 | Beta release prep | ✅ Done (v0.2.0 released) |

**Streaming Implementation (January 17, 2026):**
- `llm/client.ts` now uses `messages.stream()` instead of `messages.create()`
- Tool calls executed in parallel with `Promise.all()` for better performance
- New SSE endpoint: `POST /api/chat/stream` for web clients
- Regular `/api/chat` still works for HA Assist (uses streaming internally)

**Measured Results (January 17, 2026):**
| Query Type | Before | After | Improvement |
|------------|--------|-------|-------------|
| Simple query (no tools, voice mode) | 5-15s | **2-3s** | 60-80% faster |
| HA query (2 tools, voice mode) | 10-15s | **8-9s** | 20-40% faster |
| Complex query (4+ tools) | 15-60s | **12-15s** | More consistent |

**Key Insight:** Streaming helps most for simple queries. Tool-heavy queries are still bottlenecked by multiple Claude API round-trips (each tool use = another 2-4s call).

**Note:** HA conversation API requires complete response before TTS, so streaming to voice is limited. But internal streaming still reduces time-to-first-token.

---

## Performance Optimizations

### Implemented ✅

1. **Entity Caching (10s TTL)**
   - First query fetches all HA states
   - Subsequent queries within 10s use cached data
   - Cache invalidated after service calls

2. **Streaming Responses (January 17, 2026)**
   - Uses `anthropic.messages.stream()` for faster time-to-first-token
   - Tool calls executed in parallel with `Promise.all()`
   - SSE endpoint (`/api/chat/stream`) for web clients that want chunks
   - Regular endpoint uses streaming internally for faster processing

### Planned 🚧

1. **Hybrid Routing** - Simple commands to HA built-in, complex to Claude
2. **Local LLM Fallback** - Ollama for simple queries
3. **Prompt Caching** - Anthropic cache feature for system prompts

### Response Time Breakdown (Updated January 17, 2026)

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

**Remaining Bottleneck:** Each tool use requires a full Claude API round-trip. This is architectural - Claude must see tool results before generating the final response.

### Performance Analysis & Streaming Implementation (January 17, 2026)

**Initial Finding:** Entity caching provided minimal improvement (~6%) because the bottleneck was NOT the HA API calls - it was the Claude API calls.

**Root Cause Analysis:**

1. **Non-Streaming API Calls** (FIXED)
   - ~~`llm/client.ts` uses `anthropic.messages.create()` which blocks until full response~~
   - Now uses `messages.stream()` for faster time-to-first-token
   - Simple queries improved from 5-15s → **2-3s**

2. **Multiple Claude Calls for Tool Use** (Architectural limitation)
   ```
   Request → Claude call #1 (2-3s) → tool_use → execute tool → Claude call #2 (2-3s) → Response
   ```
   - Each tool use still triggers another Claude API round-trip
   - Tools now execute in parallel (was: sequential)
   - Query with 2 tools: ~8-9s (improved from 10-15s)

3. **Where Time Goes (Updated):**
   | Component | % of Total | Optimized? |
   |-----------|------------|------------|
   | Claude API calls | ~85% | ✅ Streaming |
   | Tool execution | ~5% | ✅ Caching + Parallel |
   | Network overhead | ~10% | - |

**What We Implemented:**
1. ✅ **Streaming** - `messages.stream()` instead of `messages.create()`
2. ✅ **Parallel tool execution** - `Promise.all()` for concurrent tools
3. ✅ **SSE endpoint** - `/api/chat/stream` for web clients

**Remaining Optimizations:**
1. **Hybrid routing** - Skip Claude for simple commands (biggest potential gain)
2. **Prompt caching** - Anthropic cache feature for system prompts
3. **Local LLM** - Ollama for simple queries

---

## Memory System

### New Implementation (ha-bridge)

**Storage:** SQLite (simple, portable, no extra services)

**Fact Categories:**
- `baseline` - Sensor normal values ("NOx 100ppm is normal")
- `preference` - User preferences ("prefers 22°C")
- `identity` - User info ("name is Jure")
- `device` - Device nicknames
- `pattern` - Routines and habits

**Operations:**
1. Load facts for user (on each request)
2. Inject into system prompt
3. Call Claude with HA tools
4. Extract new facts from response (Haiku)
5. Store new facts

### Existing Implementation (LibreChat)

Still works for web interface. Uses MongoDB via LibreChat's memory system.

---

## Critical Decisions Log

### January 17, 2026: Use Claude Haiku 4.5

**Decision:** Use `claude-haiku-4-5-20251001` for chat responses.

**Rationale:**
- Better instruction following than older Haiku
- Faster than Sonnet (which took 60s+)
- More reliable tool use with strengthened prompts
- Cost-effective for voice use case

---

### January 17, 2026: Build Own Memory Layer

**Decision:** Build `ha-bridge` service with our own memory implementation.

**Rationale:**
- LibreChat has no public API for programmatic access
- Using undocumented internal API is risky
- Building our own gives us full control
- Enables future SaaS monetization
- Simpler architecture for voice use case

---

### January 17, 2026: Defer OIDC

**Decision:** Start with simple user ID approach, add OIDC later.

**Rationale:**
- Reduces complexity
- Can add OIDC for multi-user later
- Single-user works fine for beta

---

### January 17, 2026: Streaming is Critical, Caching is Not

**Finding:** Entity caching provides only ~6% improvement. The real bottleneck is serial, non-streaming Claude API calls.

**Evidence:**
- LibreChat direct (streaming): Response feels fast, tokens appear immediately
- HA Assist (non-streaming): Must wait 5-10s for full response

**Technical Details:**
- `ha-bridge/src/llm/client.ts` uses blocking `messages.create()`
- Tool use requires multiple serial Claude calls (2-4s each)
- Entity caching only affects the ~5% of time spent on tool execution

**Decision:** Prioritize streaming implementation over further caching optimizations.

**Implementation Plan:**
1. Add streaming to HA Bridge (`messages.stream()`)
2. Stream partial responses to conversation agent
3. HA can start TTS before full response arrives

---

## Development Environment

| Component | Host | IP/Port | Status |
|-----------|------|---------|--------|
| LibreChat | ubuntuserver | 192.168.88.12:3080 | ✅ Running |
| Home Assistant | haos12 | 192.168.88.14:8123 | ✅ Running |
| Dev Workstation | omarchy | 192.168.88.29 | ✅ Active |
| **HA Bridge** | ubuntuserver | 192.168.88.12:3100 | ✅ Running |

---

## Success Metrics

### Phase 2 (Complete)
- ✅ Memory persistence validated
- ✅ Historical analysis working
- ✅ Anomaly detection with context
- ✅ Cross-session memory retention

### Phase 2.5 (Complete - v0.2.0!)
- [x] HA Bridge API working
- [x] Memory persistence (SQLite)
- [x] Fact extraction working
- [x] HA custom component installed
- [x] Text Assist working with live data
- [x] Entity caching implemented
- [x] Voice commands working (v0.2.0)
- [x] Response time 2-3s for voice (with streaming)

### v1.0 Launch (Targets)
- [ ] 500+ GitHub stars in week 1
- [ ] 10+ successful installations
- [ ] Demo video: 5,000+ views
- [ ] Positive community feedback

---

## Quick Start for New Developers

**Read these files in order:**

1. **INTEGRATION_STATUS.md** (this file) - Current state
2. **docs/PHASE_2.5_IMPLEMENTATION.md** - Implementation plan
3. **CLAUDE.md** - Development guide
4. **PROJECT_PLAN.md** - Full roadmap

**Current Focus:**
- Voice testing with Wyoming/ESPHome
- Performance optimization (streaming)

---

## Troubleshooting

### Common Issues

**"Cannot find temperature sensor"**
- Ensure "Prefer handling commands locally" is DISABLED in HA Voice Assistant settings
- This setting intercepts queries before they reach LibreChat

**Slow responses (5-10s) via HA Assist but fast via LibreChat**
- This is expected with current non-streaming implementation
- LibreChat streams tokens; HA Bridge waits for full response
- Solution: Implement streaming (Week 3 priority)
- Entity caching won't help - bottleneck is Claude API, not HA API

**Slow responses (>30s)**
- Check if using correct model (should be `claude-haiku-4-5-20251001`)
- Verify tool calls aren't failing (check ha-bridge logs)
- Each failed tool = retry = more Claude calls

**500 errors from conversation agent**
- Verify ha-bridge is running: `curl http://192.168.88.12:3100/api/health`
- Check HA logs for Python errors

---

## Contact & Links

- **Repository:** https://github.com/hoornet/librechat-homeassistant
- **License:** AGPL v3.0
- **Project Lead:** Jure (hoornet)

---

**Status Summary:**
- ✅ **Phase 2:** Complete, web features working
- ✅ **Phase 2.5:** Complete! Voice + Text Assist with streaming (v0.2.0)
- 🎯 **Target:** Early March 2026 for v1.0 launch

**Deployed Services:**
- HA Bridge: `http://192.168.88.12:3100` (ubuntuserver) ✅
- Custom Component: Installed on haos12 (192.168.88.14) ✅
- Voice Assistant: Working with Wyoming satellites ✅

**Current Version:** v0.2.0 (January 18, 2026)

**Next Steps:**
1. Multi-user support (OIDC integration)
2. Prompt caching for further TTFT improvement
3. Documentation polish for v1.0
4. Demo video production
