# Integration Status

**Last Updated:** January 17, 2026  
**Current Phase:** Phase 2.5 - Home Assistant Assist Integration (Planning)  
**Project Status:** Active Development - Preparing for v1.0 Launch

---

## Quick Reference

### What's Working ✅

| Feature | Status | Evidence |
|---------|--------|----------|
| MCP Server | ✅ Production | Memory + history features validated |
| LibreChat Web UI | ✅ Production | Running on ubuntuserver:3080 |
| Persistent Memory | ✅ Validated | Cross-session persistence working |
| Historical Analysis | ✅ Validated | 7-day trend analysis, comparison tables |
| Device Control | ✅ Working | Lights, sensors, service calls |
| Anomaly Detection | ✅ Validated | Contextual alerts using learned baselines |

### What's Being Built 🚧

| Feature | Phase | Status | ETA |
|---------|-------|--------|-----|
| HA Assist Integration | 2.5 | Planning | 3 weeks |
| OIDC Authentication | 2.5 | Not Started | Week 1 |
| Conversation Agent | 2.5 | Not Started | Week 2 |
| Voice Control | 2.5 | Not Started | Week 3 |

---

## Architecture Overview
```
Current (Phase 2):
User → LibreChat Web → MCP Server → Home Assistant

Future (Phase 2.5):
User → HA Assist (Voice/Text) → Custom Agent → LibreChat API → MCP Server → HA
                                      ↑
                                 OIDC Auth
                            (hass-oidc-auth)
```

---

## External Dependencies

### Projects We ARE Using

| Project | Repository | Purpose | Integration Status |
|---------|-----------|---------|-------------------|
| **LibreChat** | danny-avila/LibreChat | Chat UI + Memory | ✅ Deployed |
| **hass-oidc-auth** | ganhammar/hass-oidc-auth | OIDC Authentication | 🚧 To be integrated |
| **Home Assistant** | home-assistant/core | Smart Home Platform | ✅ Working |

### Projects We Are NOT Using (and Why)

| Project | Repository | Why We're Not Using It |
|---------|-----------|----------------------|
| **hass-mcp-server** | ganhammar/hass-mcp-server | We built our own MCP server with memory + history features. Theirs is good but we need control over our implementation. May collaborate later. |

---

## Key Components

### Our Code (This Repository)
```
librechat-homeassistant/
├── src/
│   ├── mcp-server/              ✅ WORKING - Bridge between LibreChat and HA
│   │   ├── src/
│   │   │   ├── index.ts        # MCP server entry point + tool handlers
│   │   │   ├── config.ts       # Environment config with Zod validation
│   │   │   └── ha-client.ts    # HA REST API client
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── ha-integration/          🚧 PLANNED - HA Assist voice integration
│       └── custom_components/
│           └── librechat_conversation/
│               ├── __init__.py           # Component setup
│               ├── manifest.json         # Component metadata
│               ├── conversation.py       # Conversation agent
│               ├── config_flow.py        # UI configuration
│               ├── api.py               # LibreChat API client
│               └── const.py             # Constants
│
├── docs/
│   ├── MEMORY_EXAMPLES.md       ✅ Complete
│   ├── PHASE_2.5_ARCHITECTURE.md ✅ Complete
│   └── BETA_RELEASE_CHECKLIST.md ✅ Complete
│
├── CLAUDE.md                     ✅ Updated
├── PROJECT_PLAN.md              ✅ Updated
├── ARCHITECTURE.md              ✅ Updated
└── README.md                    ✅ Updated
```

### External Code (Dependencies)

**LibreChat** (Deployed on ubuntuserver)
- Location: `~/LibreChat/`
- MCP Server mounted: `~/LibreChat/mcp-server/` (our code)
- Config: `~/LibreChat/librechat.yaml`
- Status: ✅ Running

**Home Assistant** (Running on haos12)
- URL: https://192.168.88.14:8123
- Version: [Current stable]
- Status: ✅ Running

**hass-oidc-auth** (To be installed)
- Repository: https://github.com/ganhammar/hass-oidc-auth
- Purpose: OIDC authentication provider
- Status: 🚧 Not yet installed

---

## MCP Tools Available

Current tools exposed to Claude via MCP:

| Tool | Purpose | Status | Added |
|------|---------|--------|-------|
| `get_state` | Get current state of entity | ✅ Working | Phase 1 |
| `get_entities` | List entities by domain | ✅ Working | Phase 1 |
| `search_entities` | Search entities by name | ✅ Working | Phase 1 |
| `call_service` | Control devices | ✅ Working | Phase 1 |
| `get_history` | Query historical data | ✅ Working | Phase 2.2 |

---

## Memory System Status

**Implementation:** LibreChat's native memory system (MongoDB)

**Configuration:**
```yaml
# librechat.yaml
memory:
  disabled: false
  tokenLimit: 2000
  agent:
    provider: "anthropic"
    model: "claude-3-5-haiku-20241022"  # Must use Haiku, not Sonnet 4
```

**Validated Features:**
- ✅ Cross-session persistence
- ✅ Sensor baseline learning (NOx 100ppm example)
- ✅ User identity storage
- ✅ Anomaly detection with context
- ✅ Historical trend analysis with memory

**Known Limitations:**
- Token limit: 2000 tokens
- Must use Haiku (Sonnet 4 causes thinking mode errors)
- Memory is per-user (good for multi-user, requires OIDC)

---

## Development Environment

### Infrastructure

| Component | Host | IP | Status |
|-----------|------|-----|--------|
| LibreChat | ubuntuserver | 192.168.88.12 | ✅ Running |
| Home Assistant | haos12 | 192.168.88.14 | ✅ Running |
| Dev Workstation | omarchy | 192.168.88.29 | ✅ Active |

### Network
- **Tailscale VPN:** tailf9add.ts.net
- **Access:** All local, no internet exposure
- **Security:** Self-signed certs (HA_SKIP_TLS_VERIFY=true)

---

## Phase 2.5 Goals

### Week 1: OIDC Setup
- [ ] Install `hass-oidc-auth` in test HA instance
- [ ] Configure OIDC provider
- [ ] Test authentication flow
- [ ] Document setup steps

### Week 2: Conversation Agent
- [ ] Create custom component structure
- [ ] Implement conversation agent interface
- [ ] Integrate OIDC token handling
- [ ] Test text conversation via HA Assist

### Week 3: Voice Integration
- [ ] Wyoming protocol integration
- [ ] Voice satellite testing (ESP32)
- [ ] Multi-user voice sessions
- [ ] Performance optimization (<3s response)

---

## Critical Decisions Log

### January 17, 2026: Keep Our MCP Server

**Decision:** We will NOT use `hass-mcp-server`, we'll keep our own implementation.

**Rationale:**
- Our MCP server is working
- We've added memory + history features
- We control the roadmap
- Can still collaborate/contribute upstream later

**Alternative Considered:** Use `ganhammar/hass-mcp-server`
**Why Rejected:** Would lose control over memory features we've already built

---

### January 17, 2026: Use hass-oidc-auth for Authentication

**Decision:** We WILL use `hass-oidc-auth` for OIDC authentication.

**Rationale:**
- Proven, secure OIDC implementation
- Enables clean multi-user support
- Saves development time
- We can focus on core integration logic

**Alternative Considered:** Build our own OAuth/API key system
**Why Rejected:** Reinventing the wheel, security complexity

---

### January 16, 2026: Delay Beta for Voice Integration

**Decision:** Add voice integration (Phase 2.5) before v1.0 launch.

**Rationale:**
- Voice + memory is a killer feature combo
- Better to launch complete than piecemeal
- "BANG" launch strategy
- 3 weeks is acceptable delay

**Timeline Impact:** +3 weeks (now targeting early March 2026)

---

## Known Issues

### Current
- None (Phase 2 features working as expected)

### Anticipated (Phase 2.5)
- LibreChat API authentication method unclear
- Voice response time may need optimization
- Multi-user voice satellite identification TBD

---

## Success Metrics

### Phase 2 (Complete)
- ✅ Memory persistence validated
- ✅ Historical analysis working
- ✅ Anomaly detection with context
- ✅ Cross-session memory retention

### Phase 2.5 (Targets)
- [ ] OIDC authentication working
- [ ] Voice commands <3s response time
- [ ] Multi-user memory isolation
- [ ] Voice + web memory sync

### v1.0 Launch (Targets)
- [ ] 500+ GitHub stars in week 1
- [ ] 10+ successful installations
- [ ] Demo video: 5,000+ views
- [ ] Positive community feedback

---

## Quick Start for New Developers

**Read these files in order:**

1. **INTEGRATION_STATUS.md** (this file) - Current state
2. **CLAUDE.md** - Development guide
3. **PROJECT_PLAN.md** - Full roadmap
4. **docs/PHASE_2.5_ARCHITECTURE.md** - Current phase details
5. **ARCHITECTURE.md** - Technical architecture

**Then:**
- Check `src/mcp-server/` for working code
- Review `docs/MEMORY_EXAMPLES.md` for validated features
- See `PROJECT_PLAN.md` for what's next

---

## Contact & Links

- **Repository:** https://github.com/hoornet/librechat-homeassistant
- **License:** AGPL v3.0
- **Project Lead:** Jure (hoornet)

---

**Status Summary:**
- ✅ **Phase 2:** 70% complete, beta-ready features working
- 🚧 **Phase 2.5:** Planning complete, implementation starting
- 🎯 **Target:** Early March 2026 for v1.0 "BANG" launch