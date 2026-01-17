# Integration Status

**Last Updated:** January 17, 2026
**Current Phase:** Phase 2.5 - HA Bridge with Memory (Week 1 Complete)
**Project Status:** Active Development - HA Bridge Deployed, Building Custom Component

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

### What's Being Built 🚧

| Feature | Phase | Status | ETA |
|---------|-------|--------|-----|
| HA Bridge API | 2.5 | ✅ Complete | Done |
| Our Memory Layer | 2.5 | ✅ Complete | Done |
| HA Conversation Agent | 2.5 | 🚧 In Progress | This Week |
| Voice Control | 2.5 | Not Started | Week 3 |

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
│            ↓                │        (🚧 building)          │
│     (existing flow)         │             ↓                 │
│                             │       HA Bridge API           │
│                             │    ✅ ubuntuserver:3100       │
│                             │             ↓                 │
│                             │    Claude + HA Tools          │
└─────────────────────────────┴───────────────────────────────┘
                              ↓
                    Home Assistant REST API
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
- ~1 week additional development

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
│   ├── ha-bridge/               🚧 NEW - Voice integration API
│   │   └── src/
│   │       ├── index.ts         # Express server
│   │       ├── api/             # HTTP routes
│   │       ├── memory/          # SQLite storage + extraction
│   │       ├── llm/             # Claude client
│   │       └── ha/              # HA client
│   │
│   └── ha-integration/          🚧 NEW - HA custom component
│       └── custom_components/
│           └── librechat_ha/
│               ├── __init__.py
│               ├── conversation.py
│               └── config_flow.py
│
├── docs/
│   ├── MEMORY_EXAMPLES.md           ✅ Complete
│   ├── PHASE_2.5_ARCHITECTURE.md    ✅ Complete
│   ├── PHASE_2.5_IMPLEMENTATION.md  ✅ NEW - Implementation plan
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

### Week 2: HA Integration + Voice 🚧 CURRENT

| Day | Task | Status |
|-----|------|--------|
| 6-7 | HA custom component | ✅ Done |
| 7 | Install on HA | ✅ Done |
| 7 | Configure integration | ✅ Done |
| 8 | Debug conversation processing | 🚧 In Progress |
| 9 | Voice testing (Wyoming) | ⬜ Pending |
| 10 | Documentation | ⬜ Pending |

**Current Issue (Jan 17):**
- Integration loads successfully (state: "loaded")
- Entity `conversation.librechat_ha_bridge` registered
- `/api/conversation/process` returns 500 error
- Needs HA debug logging to diagnose root cause

**Week 2 Success Criteria:**
- [x] HA custom component installed
- [x] Config flow working
- [ ] Text commands work via Assist (debugging)
- [ ] Voice commands work
- [ ] Response time <3s

### Week 3: Polish + Beta

- Performance optimization
- Multi-user testing
- Documentation
- Beta release prep

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

### January 17, 2026: Build Own Memory Layer (NEW)

**Decision:** Build `ha-bridge` service with our own memory implementation.

**Rationale:**
- LibreChat has no public API for programmatic access
- Using undocumented internal API is risky
- Building our own gives us full control
- Enables future SaaS monetization
- Simpler architecture for voice use case

**Alternative Rejected:** Use LibreChat's undocumented `/api/messages` endpoint

---

### January 17, 2026: Defer OIDC (UPDATED)

**Decision:** Start with simple user ID approach, add OIDC later.

**Rationale:**
- Reduces Week 1 complexity
- Can add OIDC for multi-user later
- Single-user works fine for beta
- hass-oidc-auth still an option for v1.1

---

### January 17, 2026: Keep Our MCP Server

**Decision:** Keep our MCP server implementation (unchanged from earlier).

---

### January 16, 2026: Delay Beta for Voice Integration

**Decision:** Add voice integration before v1.0 launch (unchanged).

---

## Monetization Strategy

### Free Tier (Self-Hosted)
- User runs own ha-bridge instance
- User provides Anthropic API key
- Manual setup via documentation
- Basic memory (100 facts/user)
- Community support

### Pro Tier (Hosted) - Future
- We run infrastructure
- Fast servers (<2s voice response)
- Pre-configured HA addon
- Unlimited memory
- Priority support
- $9.99/month

### Enterprise - Future
- On-premise deployment
- SLA guarantees
- Custom integrations

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

### Phase 2.5 (In Progress)
- [x] HA Bridge API working
- [x] Memory persistence (SQLite)
- [x] Fact extraction working
- [ ] HA custom component installed
- [ ] Text Assist working
- [ ] Voice commands <3s response time
- [ ] End-to-end voice flow

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
- Building `src/ha-bridge/` - HTTP API with memory
- Then `src/ha-integration/` - HA custom component

---

## Contact & Links

- **Repository:** https://github.com/hoornet/librechat-homeassistant
- **License:** AGPL v3.0
- **Project Lead:** Jure (hoornet)

---

**Status Summary:**
- ✅ **Phase 2:** 70% complete, web features working
- 🚧 **Phase 2.5:** Week 1 complete, Week 2 in progress (debugging conversation agent)
- 🎯 **Target:** Early March 2026 for v1.0 launch

**Deployed Services:**
- HA Bridge: `http://192.168.88.12:3100` (ubuntuserver) ✅
- Custom Component: Installed on haos12 (192.168.88.14) ✅

**Next Steps:**
1. Enable HA debug logging for `custom_components.librechat_ha`
2. Diagnose 500 error in conversation processing
3. Test text Assist, then voice
