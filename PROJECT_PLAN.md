# LibreChat-HomeAssistant Integration
## Project Plan v1.2

**Repository:** https://github.com/hoornet/librechat-homeassistant
**License:** AGPL v3.0
**Status:** Phase 2 - Core Features (~70% Complete, Beta-Ready)
**Started:** January 2026  
**Last Updated:** January 16, 2026

---

## Executive Summary

### Vision
Create a bridge between LibreChat and Home Assistant that provides persistent conversational memory, learning capabilities, and advanced AI features for smart home control. This integration solves the critical limitation of current HA AI integrations: lack of persistent memory and context across conversations.

### The Problem
Current Home Assistant AI integrations (including native Anthropic, Extended OpenAI Conversation) suffer from:
- **No persistent memory** - Forgets corrections and preferences between sessions
- **No learning capability** - Can't remember sensor baselines, user preferences
- **Limited context** - No conversation history or document analysis
- **Stateless interactions** - Every conversation starts from zero

**Real-world example:** User corrects AI that NOX sensor value of 96 is normal (not elevated). Next conversation, AI makes the same mistake again.

### The Solution
Integrate LibreChat with Home Assistant to provide:
- ✅ Persistent conversation memory across sessions **[VALIDATED - WORKING]**
- ✅ Learning from corrections and user preferences **[VALIDATED - WORKING]**
- ✅ Document upload and analysis (floor plans, manuals, etc.)
- ✅ Searchable conversation history
- ✅ Multiple AI model support (Claude, GPT, local via Ollama)
- ✅ Self-hosted and privacy-focused
- ✅ Better context understanding over time

---

## Project Goals

### Primary Goals
1. **Enable persistent memory** - AI remembers context across conversations ✅ **ACHIEVED**
2. **Device control** - Full Home Assistant device control from LibreChat ✅ **ACHIEVED**
3. **Learning capability** - AI learns user preferences and sensor baselines ✅ **ACHIEVED**
4. **Easy deployment** - One-command Docker setup for end users
5. **Community contribution** - Release as open-source for HA community

### Success Metrics
- ✅ AI remembers corrections across sessions **[VALIDATED]**
- ✅ Can control HA devices through natural language
- ✅ Can query device states and sensor values
- ✅ Users can upload documents for context
- ✅ Installation takes <30 minutes
- ✅ Works with multiple AI providers (Claude, OpenAI, Ollama)

---

## Target Audience

### Primary Users
- **Home Assistant power users** seeking better AI integration
- **Self-hosters** who want privacy-focused AI
- **Homelab enthusiasts** comfortable with Docker
- **Users frustrated** with stateless AI assistants

### Use Cases
1. **Smart home control with context**
   - "Turn on bedroom lights" (remembers which lights user prefers)
   - "Set the temperature like yesterday evening"
   
2. **Learning and preferences**
   - AI learns sensor baselines (NOX 96 = normal in user's home)
   - Remembers user's preferred automation patterns
   
3. **Documentation and planning**
   - Upload floor plan, ask "Where should I put motion sensor?"
   - Upload device manual, ask setup questions
   
4. **Troubleshooting with history**
   - "Why did the automation fail last Tuesday?"
   - AI has conversation history to reference

---

## Technical Architecture

### High-Level Overview

```
┌─────────────────┐         ┌──────────────────┐
│   LibreChat     │◄───────►│   MCP Server     │
│   (Frontend)    │         │  (HA Bridge)     │
└─────────────────┘         └──────────────────┘
        │                            │
        │                            │
        ▼                            ▼
┌─────────────────┐         ┌──────────────────┐
│  Anthropic API  │         │ Home Assistant   │
│  (or OpenAI)    │         │   REST API       │
└─────────────────┘         └──────────────────┘
```

### Components

#### 1. LibreChat (Chat Interface)
- **Purpose:** User-facing chat interface with memory
- **Features:** Conversation history, document upload, multi-model support
- **Deployment:** Docker container on user's server
- **Config:** Custom endpoint pointing to MCP server

#### 2. MCP Server (Model Context Protocol)
- **Purpose:** Bridge between LibreChat and Home Assistant
- **Responsibilities:**
  - Authenticate with HA
  - Translate natural language to HA API calls
  - Query device states
  - Execute services (turn on/off, set values)
  - Provide context to LLM
- **Technology:** Node.js/TypeScript
- **API:** Implements MCP protocol for LibreChat

#### 3. Home Assistant Integration (Optional)
- **Purpose:** Enhanced HA-side features
- **Features:**
  - Quick setup wizard
  - Entity exposure controls
  - Usage statistics
- **Distribution:** HACS (Home Assistant Community Store)

### Data Flow

**User Command → Response:**
```
1. User: "Turn on kitchen lights"
   ↓
2. LibreChat receives message
   ↓
3. Claude (via Anthropic API) processes with context
   ↓
4. Claude decides to use MCP tool "control_device"
   ↓
5. MCP Server receives: {action: "turn_on", entity: "light.kitchen"}
   ↓
6. MCP calls HA API: POST /api/services/light/turn_on
   ↓
7. HA executes command
   ↓
8. MCP returns success to Claude
   ↓
9. Claude responds: "Kitchen lights turned on"
   ↓
10. LibreChat displays response + stores in memory
```

### Authentication & Security

**Home Assistant API Token:**
- Long-lived access token
- Stored securely in MCP server config
- Scoped to necessary permissions only

**LibreChat Access:**
- User authentication via LibreChat
- Optional: HA SSO integration

**Network Security:**
- HTTPS only (via Tailscale recommended)
- No internet exposure required
- Local network or VPN access

---

## Technology Stack

### Core Technologies

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Chat Interface | LibreChat | Proven, feature-rich, multi-model support |
| AI Model | Claude Sonnet 4 | Best quality, learning capability |
| Bridge Protocol | MCP (Model Context Protocol) | Native LibreChat support, extensible |
| MCP Server Language | Node.js/TypeScript | Official MCP SDK, LibreChat ecosystem |
| Deployment | Docker Compose | Easy setup, portable |
| HA Integration | Python (if needed) | HA standard |

### Alternative Approaches Considered

#### 1. OpenAPI Actions (LibreChat native)
**Pros:** Native LibreChat feature  
**Cons:** Limited flexibility, harder to customize  
**Decision:** Not chosen - MCP provides better control

#### 2. Custom HA Integration Only
**Pros:** Simple, stays in HA  
**Cons:** Can't use LibreChat's memory features  
**Decision:** Not sufficient - need LibreChat's capabilities

#### 3. Webhook-Based
**Pros:** Simple HTTP calls  
**Cons:** No native tool integration, polling needed  
**Decision:** Not chosen - MCP is cleaner

---

## Development Phases

### Phase 0: Planning & Setup ✅
**Duration:** 1 week
**Status:** Complete

**Tasks:**
- [x] Create GitHub repository
- [x] Define project scope and goals
- [x] Create project plan
- [x] Create architecture documentation
- [x] Set up development environment on omarchy
- [x] Choose: Node.js vs Python for MCP server (chose Node.js/TypeScript)

**Deliverables:**
- PROJECT_PLAN.md (this document)
- ARCHITECTURE.md (detailed technical design)
- README.md (project overview)
- LICENSE (AGPL v3.0)

---

### Phase 1: Proof of Concept (MVP) ✅
**Duration:** 2-3 weeks
**Goal:** Get basic LibreChat ↔ HA communication working
**Status:** Complete

**Milestone 1.1: Deploy LibreChat**
- [x] Deploy LibreChat on ubuntuserver (192.168.88.12)
- [x] Configure with Anthropic API key
- [x] Test basic chat functionality
- [x] Document deployment process

**Milestone 1.2: Basic MCP Server**
- [x] Create minimal MCP server
- [x] Implement HA authentication
- [x] Add single test function: "get_state"
- [x] Test querying HA entity state

**Milestone 1.3: Device Control**
- [x] Implement "turn_on" action
- [x] Implement "turn_off" action
- [x] Test with real HA devices (e.g., wled-kitchen)
- [x] Handle errors gracefully

**Milestone 1.4: Integration Testing**
- [x] Connect LibreChat to MCP server
- [x] Test end-to-end: "Turn on kitchen lights"
- [x] Verify response in LibreChat
- [x] Document what works/what doesn't

**Success Criteria:**
- [x] User can ask Claude in LibreChat to control at least 1 HA device
- [x] State queries work
- [x] Errors are handled gracefully

---

### Phase 2: Core Features (Current)
**Duration:** 3-4 weeks
**Goal:** Add essential functionality for daily use
**Status:** In Progress (~70% Complete, Beta-Ready)

**Milestone 2.1: Full Device Control ✅**
- [x] Support all HA service calls (via generic call_service tool)
- [ ] Support climate controls (thermostats)
- [ ] Support media players
- [ ] Support covers (blinds, garage doors)
- [x] Add parameter validation (Zod schemas)

**Milestone 2.2: State Queries & Context ✅**
- [ ] Get all entity states in an area
- [x] Get sensor history (get_history tool deployed and validated)
- [ ] Provide context to LLM (current state of home)
- [x] Handle multiple entities in single command (get_entities, search_entities)

**Milestone 2.3: Memory & Learning ✅ VALIDATED**
**Status:** Core features validated and working (January 16, 2026)

**Completed:**
- [x] Configure LibreChat memory for HA context
- [x] Test memory persistence across sessions
- [x] Validate sensor baseline system (NOx example)
- [x] Validate user identity/preference storage
- [x] Verify memory update notifications work
- [x] Document memory examples and best practices

**Validation Results:**

*Tested Scenarios:*
1. ✅ **Sensor Baselines** - Claude remembers that NOx 100 = normal
2. ✅ **User Identity** - Claude remembers name (Jure) and alias (Hoornet)
3. ✅ **Memory Updates** - "Updated saved memory" notifications work
4. ✅ **Cross-Session Persistence** - Facts available in new conversations
5. ✅ **Anomaly Detection** - Claude identifies 25°C as unusual (4-5°C above baseline)
6. ✅ **Historical Analysis** - 7-day trend analysis with comparison tables
7. ✅ **Memory + History Combined** - Contextual intelligence working

*Evidence:*
- See `docs/MEMORY_EXAMPLES.md` for detailed examples and test results
- Screenshot evidence shows memory system working correctly
- Memory agent (Haiku) functioning without errors
- Sensor history (get_history) deployed and validated

**Remaining Tasks:**
- [ ] Add "learned preferences" storage for complex patterns
- [ ] Test device nickname persistence
- [ ] Test automation pattern learning
- [ ] Test memory behavior at token limits
- [ ] Long-term memory retention testing

**Success Criteria: ✅ MET**
- [x] AI remembers corrections across sessions
- [x] Sensor baselines work (NOx example validated)
- [x] User-friendly memory update notifications
- [x] Multiple facts can be stored simultaneously

**Key Learnings:**

1. **Memory Configuration Working:**
   - Haiku model avoids Sonnet 4's thinking mode issues
   - tokenLimit: 2000 is sufficient for basic use
   - Memory updates are transparent to users

2. **Memory Best Practices:**
   - Users should be explicit when teaching ("Remember that...")
   - Corrections work well ("Actually, X is normal")
   - Memory is factual information, not complex logic

3. **Known Limitations:**
   - Token budget limits total stored information
   - Must use Haiku (not Sonnet 4)
   - Complex automation patterns need further testing

**Milestone 2.4: Error Handling & UX**
- [x] Better error messages
- [ ] Confirmation for destructive actions
- [ ] Usage logging
- [ ] Rate limiting

**Phase 2 Success Criteria:**
- [x] Control all common device types (basic)
- [x] AI remembers preferences across sessions **[VALIDATED]**
- [x] Sensor baselines work (NOX example) **[VALIDATED]**
- [x] Sensor history queries work **[VALIDATED]**
- [x] Memory + History combined analysis **[VALIDATED]**
- [ ] User-friendly error handling (partial)

---

### Phase 3: Polish & Features
**Duration:** 2-3 weeks  
**Goal:** Make it production-ready and user-friendly

**Milestone 3.1: Advanced Features**
- [ ] Scene activation
- [ ] Automation triggers
- [ ] Area/floor control ("turn off downstairs")
- [ ] Multi-step commands
- [ ] Document upload support (floor plans, manuals)

**Milestone 3.2: Installation & Setup**
- [ ] One-command Docker Compose setup
- [ ] Setup wizard
- [ ] Configuration validation
- [ ] Health checks
- [ ] Backup/restore

**Milestone 3.3: Documentation**
- [x] Memory examples and best practices (MEMORY_EXAMPLES.md)
- [ ] Complete installation guide
- [ ] Configuration reference
- [ ] Troubleshooting guide
- [ ] Video walkthrough
- [ ] Example use cases

**Milestone 3.4: Testing**
- [ ] Test on different HA versions
- [ ] Test with different AI models (Claude, GPT, Ollama)
- [ ] Performance testing
- [ ] Security audit
- [ ] Beta testing with 3-5 users

**Success Criteria:**
- Installation takes <30 minutes
- Documentation is comprehensive
- Tested on multiple setups
- No major bugs

---

### Phase 4: Community Release
**Duration:** 1-2 weeks  
**Goal:** Release to public and gather feedback

**Milestone 4.1: Pre-Release**
- [ ] Final code review
- [ ] Security hardening
- [ ] Performance optimization
- [ ] Clean up documentation
- [ ] Create demo video

**Milestone 4.2: Release**
- [ ] Make repository public
- [ ] Create GitHub release (v1.0.0)
- [ ] Post on Home Assistant Community forums
- [ ] Post on /r/homeassistant
- [ ] Write blog post
- [ ] Submit to HACS (if applicable)

**Milestone 4.3: Support & Iteration**
- [ ] Monitor GitHub issues
- [ ] Respond to community feedback
- [ ] Fix critical bugs
- [ ] Plan v1.1 features based on feedback

**Success Criteria:**
- Public release complete
- Community awareness
- Initial user adoption
- Feedback loop established

---

### Phase 5: Future Enhancements
**Duration:** Ongoing  
**Goal:** Advanced features based on community needs

**Potential Features:**
- [ ] Voice integration (Wyoming protocol)
- [ ] Mobile app support
- [ ] Automation generation from natural language
- [ ] Multi-user support with individual memories
- [ ] Integration with other platforms (MQTT, Zigbee2MQTT)
- [ ] Advanced analytics and insights
- [ ] Hosted version (SaaS model)
- [ ] Enterprise features (audit logs, RBAC)

---

## Project Timeline

```
Week 1-2:   Phase 0 - Planning & Setup ✅
Week 3-5:   Phase 1 - Proof of Concept ✅
Week 6-9:   Phase 2 - Core Features (In Progress ~60%)
Week 10-12: Phase 3 - Polish & Documentation
Week 13-14: Phase 4 - Community Release
Week 15+:   Phase 5 - Future Enhancements
```

**Total to v1.0:** ~14 weeks (3.5 months)

---

## Open Questions & Decisions Needed

### Technical Decisions

**1. MCP Server Language:** ✅ **DECIDED: Node.js/TypeScript**
- Official MCP SDK support
- LibreChat ecosystem alignment
- Strong typing with TypeScript

**2. State Management:**
- How often to sync HA state?
- Cache state in MCP server or query on-demand?
- **Decision:** On-demand queries for MVP, add caching if needed

**3. Memory Storage:** ✅ **DECIDED: LibreChat Built-in Memory**
- Using LibreChat's native memory system
- Working well with Haiku agent
- May extend with custom storage for HA-specific context later

**4. Multi-User:**
- Single shared memory or per-user?
- How to handle in shared households?
- **Decision:** Start single-user, add multi-user in Phase 5

### Deployment Questions

**1. Where to run MCP server?** ✅ **DECIDED**
- Same Docker Compose stack as LibreChat
- Mounted as volume in LibreChat container

**2. Network setup:**
- Require Tailscale?
- Support local network only?
- Reverse proxy needed?
- **Decision:** Support both, document Tailscale for remote access

### Community Questions

**1. Licensing:** ✅ **DECIDED**
- AGPL v3.0 for protection
- Consider dual licensing later if needed

**2. Branding:** ✅ **DECIDED**
- Name: LibreChat-HomeAssistant
- GitHub + docs for now
- Logo/website can come later

---

## Development Environment Setup

### Requirements

**Hardware:**
- Omarchy workstation (Arch Linux)
- Access to Home Assistant instance (192.168.88.14)
- Access to ubuntuserver for deployment (192.168.88.12)

**Software:**
- Git
- Docker & Docker Compose
- Node.js 18+
- Claude Code (for development)

**Accounts:**
- GitHub (hoornet) ✅
- Anthropic API key ✅
- Home Assistant API token ✅

### Initial Setup Commands

```bash
# On omarchy
cd ~/projects
git clone https://github.com/hoornet/librechat-homeassistant.git
cd librechat-homeassistant

# Create directory structure
mkdir -p {src,docs,docker,examples,tests}
mkdir -p src/{mcp-server,ha-integration,librechat-config}

# Add AGPL license
curl -o LICENSE https://www.gnu.org/licenses/agpl-3.0.txt

# Initial commit
git add .
git commit -m "Initial project structure"
git push origin main
```

---

## Testing Strategy

### Development Testing
- **Unit tests** for MCP server functions
- **Integration tests** for HA API calls
- **E2E tests** for full conversation flows
- **Manual testing** on real homelab
- **Memory validation** - Cross-session persistence ✅

### Beta Testing
- Deploy on test HA instance first
- Test with 3-5 community volunteers
- Gather feedback before v1.0

### Continuous Testing
- Test with multiple HA versions
- Test with different AI models
- Performance benchmarks
- Security scans

---

## Documentation Plan

### User Documentation
- **README.md** - Project overview, quick start ✅
- **MEMORY_EXAMPLES.md** - Memory features and examples ✅
- **INSTALLATION.md** - Detailed setup guide
- **CONFIGURATION.md** - Configuration reference
- **TROUBLESHOOTING.md** - Common issues & solutions
- **EXAMPLES.md** - Example use cases and commands

### Developer Documentation
- **ARCHITECTURE.md** - Technical design ✅
- **CLAUDE.md** - Development guide ✅
- **DEVELOPMENT.md** - How to contribute
- **API.md** - MCP server API reference
- **TESTING.md** - Testing guide

### Community Resources
- GitHub Wiki for FAQs
- Discussions for support
- Issues for bug reports
- Video tutorials

---

## Risk Management

### Technical Risks

**Risk:** MCP protocol too complex or limiting  
**Mitigation:** ✅ Prototyped successfully, working well

**Risk:** Performance issues with large HA instances  
**Mitigation:** Implement caching, query optimization

**Risk:** HA API changes break integration  
**Mitigation:** Version compatibility checks, regression tests

### Project Risks

**Risk:** Scope creep  
**Mitigation:** Strict MVP definition, Phase-based approach

**Risk:** Lack of adoption  
**Mitigation:** Strong documentation, demo videos, community engagement

**Risk:** Maintenance burden  
**Mitigation:** Clean code, good tests, community contributions

---

## Success Metrics & KPIs

### Development Phase
- [x] MVP working in test environment ✅
- [x] Memory system validated ✅
- [ ] All Phase 2 milestones completed (60% done)
- [ ] Documentation 100% complete (50% done)
- [ ] Zero critical bugs

### Release Phase
- [ ] GitHub stars (target: 100+ in first month)
- [ ] GitHub issues/PRs from community
- [ ] Forum posts and discussions
- [ ] 10+ successful installations reported

### Long-term
- [ ] Active community contributions
- [ ] Integration with other HA projects
- [ ] Recognition in HA community
- [ ] Sustainable maintenance

---

## Monetization Strategy (Optional)

While keeping core open-source (AGPL v3.0):

### Potential Revenue Streams
1. **Hosted version** - SaaS for non-technical users
2. **Enterprise support** - Support contracts for businesses
3. **Premium features** - Advanced analytics, multi-home support
4. **Consulting** - Setup and customization services
5. **Donations** - GitHub Sponsors, Patreon

### Dual Licensing
- AGPL v3.0 for open-source use
- Commercial license for companies wanting proprietary modifications

**Decision:** Focus on adoption first, monetization later (Phase 5+)

---

## Team & Contributors

### Core Team
- **Jure (hoornet)** - Project lead, primary developer
- **Claude (AI assistant)** - Architecture, code review, documentation

### Future Contributors
- Welcome community contributions
- CONTRIBUTING.md will define process
- Maintain high code quality standards

---

## Communication Plan

### During Development
- GitHub Issues for tracking work
- Commit messages following Conventional Commits
- Project board for task management

### Community Engagement
- GitHub Discussions for support
- Home Assistant Community forum thread
- Reddit posts for major milestones
- Blog posts for technical deep-dives

---

## Next Steps

### Completed Recently
1. ✅ Memory system validated with real-world testing
2. ✅ Created comprehensive memory documentation
3. ✅ Sensor history (get_history) deployed and validated
4. ✅ Memory + History combined testing - exceeded expectations
5. ✅ Anomaly detection with learned baselines validated
6. ✅ Advanced historical analysis (7-day trends, comparison tables)

### Current Focus (Beta Release Preparation)
1. **Beta testing program** - Ready to recruit 3-5 testers
2. **Documentation polish** - Quick installation guide (1 page)
3. **Climate control testing** - Nice to have
4. **Error handling improvements** - Nice to have

### Upcoming (Community Release)
1. Post on /r/homeassistant for beta testers
2. Gather feedback for 1-2 weeks
3. Iterate based on feedback
4. Official v1.0 release

### Beta Release Strategy
**Title:** "Beta testers wanted: AI that learns your home"
**Demo points:**
- Temperature baseline learning
- Historical analysis with comparison tables
- Anomaly detection with context
- Cross-session memory persistence

---

## Appendices

### A. Reference Links
- LibreChat: https://www.librechat.ai
- MCP Protocol: https://modelcontextprotocol.io
- Home Assistant API: https://developers.home-assistant.io/docs/api/rest
- AGPL v3.0: https://www.gnu.org/licenses/agpl-3.0.html

### B. Homelab Context
- Home Assistant: 192.168.88.14 (haos12 on pve-intel)
- Deployment target: 192.168.88.12 (ubuntuserver)
- Dev workstation: 192.168.88.29 (omarchy)
- Network: Tailscale (tailf9add.ts.net)

### C. Example Use Cases
See MEMORY_EXAMPLES.md for detailed memory use cases and examples.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-12 | Jure + Claude | Initial project plan |
| 1.1 | 2026-01-16 | Jure + Claude | Memory milestone validated, Phase 2 ~60% complete |
| 1.2 | 2026-01-16 | Jure + Claude | Sensor history validated, Phase 2 ~70% complete, beta-ready |

---

**Last Updated:** January 16, 2026
**Status:** Living document - will evolve as project progresses
**Current Phase:** Phase 2 - Core Features (~70% Complete, Beta-Ready)
**Next Milestone:** Beta testing program + community release preparation
