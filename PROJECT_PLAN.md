# LibreChat-HomeAssistant Integration
## Project Plan v1.3

**Repository:** https://github.com/hoornet/librechat-homeassistant
**License:** AGPL v3.0
**Status:** Phase 2.5 Complete - v0.2.0 Released (Voice + Text Working!)
**Started:** January 2026
**Last Updated:** January 18, 2026

---

## Executive Summary

### Vision
Create a bridge between LibreChat and Home Assistant that provides persistent conversational memory, learning capabilities, voice control, and advanced AI features for smart home control. This integration solves the critical limitation of current HA AI integrations: lack of persistent memory and context across conversations.

### The Problem
Current Home Assistant AI integrations (including native Anthropic, Extended OpenAI Conversation) suffer from:
- **No persistent memory** - Forgets corrections and preferences between sessions
- **No learning capability** - Can't remember sensor baselines, user preferences
- **Limited context** - No conversation history or document analysis
- **Stateless interactions** - Every conversation starts from zero
- **No voice integration with intelligence** - Voice assistants can't learn

**Real-world example:** User corrects AI that NOX sensor value of 96 is normal (not elevated). Next conversation, AI makes the same mistake again.

### The Solution
Integrate LibreChat with Home Assistant to provide:
- ✅ Persistent conversation memory across sessions **[VALIDATED - WORKING]**
- ✅ Learning from corrections and user preferences **[VALIDATED - WORKING]**
- ✅ Historical data analysis and trend detection **[VALIDATED - WORKING]**
- ✅ Document upload and analysis (floor plans, manuals, etc.)
- ✅ Searchable conversation history
- 🚧 Voice control via HA Assist (Phase 2.5 - in planning)
- ✅ Multiple AI model support (Claude, GPT, local via Ollama)
- ✅ Self-hosted and privacy-focused
- ✅ Better context understanding over time

---

## Project Goals

### Primary Goals
1. **Enable persistent memory** - AI remembers context across conversations ✅ **ACHIEVED**
2. **Device control** - Full Home Assistant device control from LibreChat ✅ **ACHIEVED**
3. **Learning capability** - AI learns user preferences and sensor baselines ✅ **ACHIEVED**
4. **Voice integration** - Voice control with same intelligence 🚧 **IN PROGRESS**
5. **Easy deployment** - One-command Docker setup for end users
6. **Community contribution** - Release as open-source for HA community

### Success Metrics
- ✅ AI remembers corrections across sessions **[VALIDATED]**
- ✅ Can control HA devices through natural language
- ✅ Can query device states and sensor values
- ✅ Historical data analysis with trend detection **[VALIDATED]**
- ✅ Users can upload documents for context
- 🚧 Voice commands work through HA Assist
- ✅ Installation takes <30 minutes
- ✅ Works with multiple AI providers (Claude, OpenAI, Ollama)

---

## Technology Stack

### Core Technologies

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Chat Interface | LibreChat | Proven, feature-rich, multi-model support |
| AI Model | Claude Sonnet 4 | Best quality, learning capability |
| Bridge Protocol | MCP (Model Context Protocol) | Native LibreChat support, extensible |
| MCP Server Language | Node.js/TypeScript | Official MCP SDK, LibreChat ecosystem |
| Voice Integration | HA Assist + Wyoming | Native HA, proven voice pipeline |
| Authentication | hass-oidc-auth (external) | Secure OIDC/SSO, multi-user support |
| Deployment | Docker Compose | Easy setup, portable |

### External Dependencies (New in Phase 2.5)

| Dependency | Repository | Purpose | Status |
|-----------|-----------|---------|--------|
| **hass-oidc-auth** | ganhammar/hass-oidc-auth | OIDC authentication provider | 🚧 To integrate |

### Projects for Reference (Not Dependencies)

| Project | Repository | Note |
|---------|-----------|------|
| **hass-mcp-server** | ganhammar/hass-mcp-server | Similar MCP implementation. We keep our own but may collaborate. |

**Why we're keeping our MCP server:**
- Already working with validated memory + history features
- Control over roadmap and customization
- Can contribute improvements upstream later

**Why we're using hass-oidc-auth:**
- Proven secure implementation
- Saves ~2 weeks development time
- Enables clean multi-user support
- Allows focus on core integration logic

---

## Development Phases

### Phase 0: Planning & Setup ✅
**Duration:** 1 week
**Status:** Complete

[Previous content unchanged]

---

### Phase 1: Proof of Concept (MVP) ✅
**Duration:** 2-3 weeks
**Goal:** Get basic LibreChat ↔ HA communication working
**Status:** Complete

[Previous content unchanged]

---

### Phase 2: Core Features ✅
**Duration:** 3-4 weeks
**Goal:** Add essential functionality for daily use
**Status:** Complete (~70% when paused for Phase 2.5)

[Previous content mostly unchanged, but add note:]

**Note:** Phase 2 paused at 70% completion to add voice integration (Phase 2.5). Memory and history features are fully validated and working. Remaining Phase 2 items (climate control, advanced error handling) moved to Phase 3 or future releases.

---

### Phase 2.5: HA Assist Integration ✅ COMPLETE
**Duration:** 3 weeks
**Goal:** Voice control with memory via HA's native Assist
**Status:** Complete - v0.2.0 Released (January 18, 2026)
**Added:** January 17, 2026

**Overview:**
Add voice control capabilities by integrating with Home Assistant's native Assist feature. This allows users to use voice commands (via Wyoming protocol satellites) while maintaining all the memory and contextual intelligence of LibreChat.

**Key Architectural Decisions:**

1. **Authentication: Use hass-oidc-auth (External)**
   - Repository: https://github.com/ganhammar/hass-oidc-auth
   - Provides OIDC/SSO authentication
   - Enables multi-user support
   - Saves development time

2. **MCP Server: Keep Our Implementation**
   - NOT using ganhammar/hass-mcp-server
   - Our server has memory + history features
   - We control the roadmap
   - Can collaborate upstream later

3. **Conversation Agent: Build Custom Component**
   - New: `src/ha-integration/custom_components/librechat_conversation/`
   - Bridges HA Assist ↔ LibreChat API
   - Handles user context from OIDC
   - Manages LibreChat sessions

**Milestone 2.5.1: HA Bridge API ✅ COMPLETE**
- [x] Create ha-bridge directory structure
- [x] Express HTTP API with routes
- [x] SQLite memory storage (better-sqlite3)
- [x] Fact extraction with Claude Haiku
- [x] LLM client with Claude + HA tools
- [x] Deploy to ubuntuserver
- [x] Verify end-to-end functionality

**Deliverables:**
- ✅ Working API at `http://ubuntuserver:3100`
- ✅ SQLite memory persistence
- ✅ Fact extraction and recall working
- ✅ HA tools (get_state, search_entities, call_service, get_history)

---

**Milestone 2.5.2: Custom Conversation Agent** ✅ COMPLETE
- [x] Create custom component structure
- [x] Implement `conversation.py` agent interface
- [x] Connect to ha-bridge API
- [x] Install on Home Assistant
- [x] Test via HA's text-based Assist interface

**Deliverables:**
- ✅ Working custom component in HA
- ✅ Text-based Assist working
- ✅ Configuration flow UI

---

**Milestone 2.5.3: Voice Integration** ✅ COMPLETE
- [x] Verify Wyoming protocol compatibility
- [x] Test with voice satellite
- [x] Measure and optimize response times (2-3s achieved with streaming)
- [x] Handle voice-specific edge cases
- [x] Implement streaming for performance

**Deliverables:**
- ✅ Voice integration working (v0.2.0)
- ✅ Performance benchmarks (2-3s simple, 8-9s with tools)
- ✅ Streaming responses implemented
- Pending: Demo video footage (Phase 3)

---

**Milestone 2.5.4: Multi-user & Polish** (Deferred)
- [ ] OIDC authentication (optional, for multi-user)
- [ ] Memory sync between web and voice
- [ ] Multi-user testing

---

**Phase 2.5 Success Criteria:**
- ✅ HA Bridge API deployed and working
- ✅ Memory persistence via SQLite
- ✅ Fact extraction and recall working
- ✅ Text conversation via HA Assist
- ✅ Voice conversation via Wyoming protocol
- ✅ Voice response time 2-3s (with streaming)
- ✅ Streaming implementation complete

**Our Components:**
- `src/ha-bridge/` - ✅ Complete and deployed (v0.2.0)
- `src/ha-integration/custom_components/librechat_ha/` - ✅ Complete (v0.2.0)

**Unchanged Components:**
- `src/mcp-server/` - No changes needed (web interface)

**Timeline:**
- Week 1: HA Bridge API + Memory ✅ COMPLETE
- Week 2: HA custom component + text Assist ✅ COMPLETE
- Week 3: Voice integration and streaming ✅ COMPLETE (v0.2.0)

**Detailed Architecture:** See `docs/PHASE_2.5_ARCHITECTURE.md`

---

### Phase 3: Polish & Launch Prep (UPDATED)
**Duration:** 3-4 weeks  
**Goal:** Make it production-ready with killer demo
**Status:** Not Started

**Milestone 3.1: Content Creation (NEW PRIORITY)**
- [ ] Demo video production (web + voice + memory)
- [ ] Professional screenshots and GIFs
- [ ] Blog post: "I Rebuilt HA's AI From Scratch"
- [ ] Reddit/HN announcement posts
- [ ] Comparison tables vs alternatives

**Milestone 3.2: Documentation Polish**
- [ ] Complete installation guide (one-page quick start)
- [ ] Configuration reference
- [ ] Troubleshooting guide with common issues
- [ ] Video walkthrough
- [ ] Example use cases and commands
- [ ] FAQ for common questions

**Milestone 3.3: Advanced Features (Nice-to-Have)**
- [ ] Scene activation
- [ ] Automation triggers
- [ ] Area/floor control ("turn off downstairs")
- [ ] Multi-step commands
- [ ] Climate control (thermostats)

**Milestone 3.4: Testing & Quality**
- [ ] Test on fresh HA install
- [ ] Test with different HA versions
- [ ] Test with different AI models (Claude, GPT, Ollama)
- [ ] Performance testing and optimization
- [ ] Security review
- [ ] Community beta testing (3-5 users)

**Success Criteria:**
- Installation guide is clear (tested with fresh user)
- Demo video is professional and compelling
- Documentation is comprehensive
- No critical bugs
- Beta testers report success
- Ready for "BANG" launch

---

### Phase 4: Launch (The BANG 💥)
**Duration:** 1-2 weeks  
**Goal:** Maximum impact public release
**Status:** Not Started

**Milestone 4.1: Pre-Launch**
- [ ] Final code review and cleanup
- [ ] Security hardening
- [ ] Performance optimization
- [ ] Polish all documentation
- [ ] Create demo video (3-minute showcase)
- [ ] Prepare announcement posts

**Milestone 4.2: Launch Day (Coordinated)**

**Monday Morning (6am PST):**
- [ ] Make repository public
- [ ] Create GitHub release (v1.0.0)
- [ ] Publish demo video to YouTube
- [ ] Post to /r/homeassistant (with video)
- [ ] "Show HN" on Hacker News
- [ ] Post to Home Assistant Community forums
- [ ] Tweet announcement thread
- [ ] Post to /r/selfhosted

**The Pitch:**
```
"Finally: An AI Assistant That Remembers Your Home

❌ Other HA AI: 'Temperature is 21°C'
✅ LibreChat-HA: 'Temperature is 21°C - right at your normal 20-21°C range'

Features:
- Persistent memory across sessions
- Voice control via HA Assist
- Historical trend analysis
- Multi-user support
- 100% self-hosted
- Works with Claude, GPT, or local Ollama

[Demo Video] [GitHub] [Get Started]"
```

**Milestone 4.3: Launch Week**
- [ ] Engage with every comment/question
- [ ] Monitor GitHub issues
- [ ] Quick bug fixes as needed
- [ ] Celebrate milestones (stars, installations)
- [ ] Update docs based on feedback

**Success Criteria:**
- 500+ GitHub stars in week 1
- 50+ upvotes on all platforms
- Demo video: 5,000+ views
- 10+ successful installations reported
- Positive community feedback
- No critical bugs reported

---

### Phase 5: Future Enhancements
**Duration:** Ongoing  
**Goal:** Advanced features based on community needs

**Potential Features:**
- [ ] Automation generation from natural language
- [ ] Advanced analytics dashboard
- [ ] Integration with other platforms (MQTT, Zigbee2MQTT)
- [ ] Mobile app optimization
- [ ] Enterprise features (audit logs, RBAC)
- [ ] Upstream contributions to hass-mcp-server
- [ ] Collaborative features with ganhammar projects

---

## Open Questions & Decisions

### Technical Decisions

**1. MCP Server Language:** ✅ **DECIDED: Node.js/TypeScript**
- Official MCP SDK support
- LibreChat ecosystem alignment
- Strong typing with TypeScript

**2. Authentication Method:** ✅ **DECIDED: hass-oidc-auth (External)**
- Use proven OIDC implementation
- Enables multi-user cleanly
- Saves development time
- Allows focus on core features

**3. Use hass-mcp-server?** ✅ **DECIDED: No, Keep Our Own**
- Our MCP server already working
- Has memory + history features
- We control roadmap
- May collaborate upstream later

**4. OIDC Provider Choice:** ❓ **PENDING (Week 1)**
- Options: Keycloak, HA native, Auth0, other
- Will research and decide in Week 1

**5. LibreChat API Authentication:** ❓ **PENDING (Week 2)**
- Need to research LibreChat's API
- Determine authentication method
- Document in Week 2

**6. Voice User Identification:** ❓ **PENDING (Week 3)**
- How to identify which user is speaking?
- Options: Voice recognition, device-based, ask user
- Will test Wyoming protocol capabilities

---

## Project Timeline (Updated)
```
Week 1-2:   Phase 0 - Planning & Setup ✅
Week 3-5:   Phase 1 - Proof of Concept ✅
Week 6-9:   Phase 2 - Core Features ✅ (70% - paused for voice)
Week 10-12: Phase 2.5 - HA Assist Integration 🚧 (CURRENT)
Week 13-16: Phase 3 - Polish & Documentation
Week 17-18: Phase 4 - Launch (The BANG)
Week 19+:   Phase 5 - Future Enhancements
```

**Total to v1.0:** ~18 weeks (4.5 months)
**Current Status:** Week 10 (Phase 2.5 start)
**Launch Target:** Early-Mid March 2026

---

## Success Metrics & KPIs

### Development Phase
- [x] MVP working in test environment ✅
- [x] Memory system validated ✅
- [x] Historical analysis working ✅
- [ ] Phase 2.5 milestones completed (0% done)
- [ ] Documentation 100% complete (60% done)
- [ ] Zero critical bugs

### Launch Phase (Targets)
- [ ] GitHub stars (target: 500+ in first week)
- [ ] Demo video views (target: 5,000+ views)
- [ ] Successful installations (target: 10+)
- [ ] Positive community feedback
- [ ] Featured in HA newsletter/podcast

### Long-term
- [ ] Active community contributions
- [ ] Integration with other HA projects
- [ ] Recognition in HA community
- [ ] Sustainable maintenance
- [ ] Collaboration with ganhammar projects

---

## External Project Collaboration

### hass-oidc-auth (Active Dependency)
- **Using:** Their OIDC provider for authentication
- **Status:** To be integrated in Phase 2.5
- **Collaboration:** May contribute docs/examples
- **Maintainer:** ganhammar

### hass-mcp-server (Reference Only)
- **Using:** Not using, but reference implementation
- **Status:** We keep our own MCP server
- **Collaboration:** May contribute memory/history features upstream later
- **Maintainer:** ganhammar

**Note:** Both projects by same author (ganhammar). Good relationship opportunity for future collaboration.

---

## Risk Management (Updated)

### Technical Risks

**Risk:** MCP protocol too complex or limiting  
**Status:** ✅ Mitigated - Already working well

**Risk:** LibreChat API incompatible or missing  
**Probability:** Medium  
**Impact:** High (blocks Phase 2.5)  
**Mitigation:** Research in Week 1, have fallback plan  
**Contingency:** Direct MCP integration from HA if needed

**Risk:** Voice response time too slow  
**Probability:** Medium  
**Impact:** Medium (voice less useful)  
**Mitigation:** Benchmark early, optimize critical path  
**Contingency:** Launch text-only Assist, add voice in v1.1

**Risk:** OIDC setup too complex for users  
**Probability:** Low  
**Impact:** Medium (adoption barrier)  
**Mitigation:** Clear docs, setup wizard, video tutorial  
**Contingency:** Offer managed OIDC or simple API key fallback

### Project Risks

**Risk:** Scope creep  
**Mitigation:** ✅ Strict phase definitions, clear milestones

**Risk:** Timeline slippage  
**Status:** On track (Phase 2.5 is planned 3-week addition)  
**Mitigation:** Weekly check-ins, adjust scope if needed

**Risk:** Lack of adoption  
**Mitigation:** Strong demo, clear value prop, community engagement  
**Backup:** "BANG" launch strategy with coordinated announcements

---

## Next Steps

### Completed Recently
1. ✅ Memory system validated (Jan 16)
2. ✅ Historical analysis validated (Jan 16)
3. ✅ Phase 2.5 architecture designed (Jan 17)
4. ✅ HA Bridge API built with Express + SQLite (Jan 17)
5. ✅ Memory storage and fact extraction working (Jan 17)
6. ✅ HA Bridge deployed to ubuntuserver:3100 (Jan 17)
7. ✅ End-to-end testing passed (Jan 17)

### This Week (Week 11 - HA Custom Component)
1. **Build HA Conversation Agent**
   - [ ] Implement conversation.py agent interface
   - [ ] Connect to ha-bridge API (http://ubuntuserver:3100)
   - [ ] Add proper error handling

2. **Install and Test**
   - [ ] Install custom component on haos12
   - [ ] Configure ha-bridge URL
   - [ ] Test via HA's text-based Assist interface
   - [ ] Verify memory persistence

3. **Documentation**
   - [ ] Update installation guide
   - [ ] Document configuration options

### Next Week (Week 12)
1. Voice integration via Wyoming protocol
2. Performance optimization (<3s response)
3. Documentation polish

### Weeks 13-16 (Phase 3)
1. Demo video production
2. Documentation polish
3. Beta testing

### Weeks 17-18 (Phase 4)
1. Final preparations
2. Launch coordination
3. Community engagement

---

## Appendices

### A. Reference Links (Updated)
- LibreChat: https://www.librechat.ai
- MCP Protocol: https://modelcontextprotocol.io
- Home Assistant API: https://developers.home-assistant.io/docs/api/rest
- AGPL v3.0: https://www.gnu.org/licenses/agpl-3.0.html
- **hass-oidc-auth:** https://github.com/ganhammar/hass-oidc-auth
- **hass-mcp-server:** https://github.com/ganhammar/hass-mcp-server (reference)

### B. Homelab Context
- Home Assistant: 192.168.88.14 (haos12 on pve-intel)
- Deployment target: 192.168.88.12 (ubuntuserver)
- Dev workstation: 192.168.88.29 (omarchy)
- Network: Tailscale (tailf9add.ts.net)

### C. Example Use Cases
See `docs/MEMORY_EXAMPLES.md` for detailed memory use cases and validated examples.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-12 | Jure + Claude | Initial project plan |
| 1.1 | 2026-01-16 | Jure + Claude | Memory milestone validated, Phase 2 ~60% complete |
| 1.2 | 2026-01-16 | Jure + Claude | Sensor history validated, Phase 2 ~70% complete, beta-ready |
| 1.3 | 2026-01-17 | Jure + Claude | Added Phase 2.5 (HA Assist), external dependencies, updated timeline |
| 1.4 | 2026-01-17 | Jure + Claude | HA Bridge deployed to ubuntuserver, Week 1 complete |
| 1.5 | 2026-01-18 | Jure + Claude | v0.2.0 release - Voice assistant working with streaming |

---

**Last Updated:** January 18, 2026
**Status:** Living document - evolves with project
**Current Phase:** Phase 2.5 Complete - v0.2.0 Released
**Next Milestone:** Phase 3 - Demo video, documentation polish, v1.0 prep
**Launch Target:** Early-Mid March 2026