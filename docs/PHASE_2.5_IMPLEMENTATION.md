# Phase 2.5 Implementation Plan: HA Bridge with Memory

**Created:** January 17, 2026
**Status:** Ready for Implementation
**Duration:** 2-3 weeks

---

## Executive Summary

### Key Decision: Build Our Own Memory Layer

After researching LibreChat's API, we discovered it **does not have an official public API** for programmatic message sending. The maintainer explicitly stated "that's not its intended usage" ([GitHub Discussion #4679](https://github.com/danny-avila/LibreChat/discussions/4679)).

**Decision:** Build our own lightweight API service with integrated memory, rather than depending on LibreChat's undocumented internal APIs.

### Benefits of This Approach

| Aspect | Our Approach | LibreChat Dependency |
|--------|--------------|---------------------|
| Reliability | We control it | Could break with updates |
| Maintenance | We maintain | Depends on their roadmap |
| Customization | Optimized for HA/voice | General purpose |
| Monetization | Full control | Limited options |
| Complexity | Simpler architecture | Extra hop through LibreChat |

---

## Architecture Overview

### New Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────────┐
│                    HA Bridge Service                             │
│                  (New - "ha-bridge")                            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   HTTP API   │  │    Memory    │  │    LLM Client        │  │
│  │   (Express)  │──│   (SQLite)   │──│  (Claude + Tools)    │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│         │                                       │               │
└─────────┼───────────────────────────────────────┼───────────────┘
          │                                       │
          ▼                                       ▼
┌──────────────────┐                    ┌──────────────────┐
│  HA Conversation │                    │  Home Assistant  │
│      Agent       │                    │    REST API      │
│  (Custom Component)                   │                  │
└──────────────────┘                    └──────────────────┘
```

### Complete Flow

```
User (Voice/Text)
       │
       ▼
┌─────────────────┐
│   HA Assist     │  (Wake word, STT, intent)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Our Conversation│  (Custom HA component)
│     Agent       │
└────────┬────────┘
         │ HTTP POST /api/chat
         ▼
┌─────────────────┐
│   HA Bridge     │  (Our new service)
│     API         │
│                 │
│  1. Load memory │
│  2. Build prompt│
│  3. Call Claude │
│  4. Handle tools│──────────────────┐
│  5. Extract facts                  │
│  6. Store memory│                  ▼
│  7. Return resp │         ┌─────────────────┐
└────────┬────────┘         │  Home Assistant │
         │                  │    REST API     │
         ▼                  └─────────────────┘
┌─────────────────┐
│   HA Assist     │  (TTS, response)
└─────────────────┘
         │
         ▼
      User hears response
```

---

## Component Details

### 1. HA Bridge Service (`src/ha-bridge/`)

**Purpose:** HTTP API with integrated memory and LLM capabilities

**Technology:**
- Node.js + TypeScript + Express
- SQLite for memory storage (simple, portable)
- Anthropic SDK for Claude
- Zod for validation

**Directory Structure:**
```
src/ha-bridge/
├── src/
│   ├── index.ts              # Entry point, Express server
│   ├── config.ts             # Environment configuration
│   │
│   ├── api/
│   │   ├── routes.ts         # HTTP routes
│   │   ├── handlers.ts       # Request handlers
│   │   └── middleware.ts     # Auth, rate limiting, logging
│   │
│   ├── memory/
│   │   ├── store.ts          # SQLite storage operations
│   │   ├── extractor.ts      # Fact extraction (Haiku)
│   │   └── types.ts          # TypeScript interfaces
│   │
│   ├── llm/
│   │   ├── client.ts         # Claude client with tool support
│   │   ├── prompts.ts        # System prompts
│   │   └── tools.ts          # HA tool definitions
│   │
│   └── ha/
│       └── client.ts         # Home Assistant API client
│
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

**API Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Send message, get response |
| `/api/memory/:userId` | GET | View user's stored facts |
| `/api/memory/:userId` | DELETE | Clear user's memory |
| `/api/memory/:userId/facts` | POST | Manually add a fact |
| `/api/health` | GET | Health check |

**Environment Variables:**
```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
HA_URL=https://192.168.88.14:8123
HA_TOKEN=eyJ...

# Optional
PORT=3100
LOG_LEVEL=info
HA_SKIP_TLS_VERIFY=true
DB_PATH=./data/memory.db
MAX_FACTS_PER_USER=1000
MEMORY_TOKEN_LIMIT=1500
```

---

### 2. HA Conversation Agent (`src/ha-integration/`)

**Purpose:** Custom Home Assistant component that routes Assist requests to our API

**Technology:**
- Python (HA standard)
- aiohttp for async HTTP
- HA conversation agent interface

**Directory Structure:**
```
src/ha-integration/
└── custom_components/
    └── librechat_ha/
        ├── __init__.py           # Component setup
        ├── manifest.json         # Component metadata
        ├── conversation.py       # Conversation agent
        ├── config_flow.py        # UI configuration
        ├── api.py               # HA Bridge API client
        ├── const.py             # Constants
        └── strings.json         # UI strings
```

**Configuration Flow:**
1. User adds integration in HA UI
2. Enters HA Bridge URL (e.g., `http://localhost:3100`)
3. Optionally configures user mapping
4. Selects as default conversation agent

---

### 3. Existing MCP Server (`src/mcp-server/`)

**Status:** Unchanged - Still used by LibreChat web interface

The existing MCP server continues to work with LibreChat for web-based chat. The new HA Bridge service has its own HA client and doesn't depend on the MCP server.

**Future Option:** Could refactor to share HA client code between MCP server and HA Bridge.

---

## Memory System Design

### Fact Schema

```typescript
interface Fact {
  id: string;           // UUID
  userId: string;       // HA user ID or "default"
  content: string;      // The fact itself
  category: FactCategory;
  confidence: number;   // 0.0 - 1.0
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
}

type FactCategory =
  | 'baseline'    // Sensor normal values ("NOx 100ppm is normal")
  | 'preference'  // User preferences ("prefers 22°C")
  | 'identity'    // User info ("name is Jure")
  | 'device'      // Device nicknames ("main light = light.wled_kitchen")
  | 'pattern'     // Routines ("usually home by 6pm")
  | 'correction'; // Corrections ("actually X, not Y")
```

### SQLite Schema

```sql
CREATE TABLE facts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  confidence REAL DEFAULT 0.8,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
  use_count INTEGER DEFAULT 0
);

CREATE INDEX idx_facts_user_id ON facts(user_id);
CREATE INDEX idx_facts_category ON facts(user_id, category);
```

### Memory Operations

**Loading Memory (per request):**
1. Query facts for user, ordered by relevance (use_count, last_used)
2. Format as bullet points
3. Inject into system prompt
4. Track token count, truncate if needed

**Extracting Facts (after response):**
1. Send conversation to Haiku with extraction prompt
2. Parse returned JSON array of facts
3. Deduplicate against existing facts
4. Store new facts

**Fact Deduplication:**
- Check semantic similarity (simple: exact match, advanced: embeddings)
- Update existing fact if similar (bump use_count, update last_used)
- Only add if genuinely new information

---

## Implementation Timeline

### Week 1: Core API + Memory

| Day | Focus | Deliverables |
|-----|-------|--------------|
| 1 | Project setup | package.json, tsconfig, directory structure |
| 2 | HTTP API skeleton | Express server, routes, health check |
| 3 | Memory storage | SQLite setup, CRUD operations |
| 4 | Fact extraction | Haiku integration, extraction prompts |
| 5 | LLM + Tools | Claude client, HA tools, prompt building |

**Week 1 Success Criteria:**
- [ ] `POST /api/chat` returns AI response
- [ ] Memory persists between requests
- [ ] HA tools work (get_state, call_service)
- [ ] Facts extracted from conversations

### Week 2: HA Integration + Testing

| Day | Focus | Deliverables |
|-----|-------|--------------|
| 6 | HA component skeleton | manifest.json, __init__.py, config_flow |
| 7 | Conversation agent | Full conversation.py implementation |
| 8 | Integration testing | End-to-end tests, bug fixes |
| 9 | Voice testing | Wyoming integration, response time |
| 10 | Documentation | Setup guides, README updates |

**Week 2 Success Criteria:**
- [ ] HA Assist routes to our agent
- [ ] Voice commands work end-to-end
- [ ] Memory persists across voice/text
- [ ] Response time <3s for voice

### Week 3: Polish + Beta Prep

| Day | Focus | Deliverables |
|-----|-------|--------------|
| 11-12 | Performance optimization | Caching, connection pooling |
| 13 | Multi-user testing | Isolation verification |
| 14 | Documentation | Installation guide, troubleshooting |
| 15 | Beta release prep | Docker images, release notes |

---

## Monetization Architecture

### Tiers

**Free (Self-Hosted):**
- User runs own instance
- User provides API keys
- Manual setup via docs
- Basic memory (100 facts/user)
- Community support

**Pro (Hosted) - $9.99/month:**
- We run infrastructure
- Fast servers (<2s voice response)
- Pre-configured HA addon
- Unlimited memory
- Priority support
- Analytics dashboard

**Enterprise - Custom pricing:**
- On-premise deployment
- SLA guarantees
- Custom integrations
- Dedicated support

### Implementation in Code

```typescript
// src/ha-bridge/src/config.ts
export interface Config {
  // Deployment mode
  mode: 'self-hosted' | 'cloud';

  // Self-hosted settings
  anthropicApiKey?: string;

  // Cloud settings
  subscriptionTier?: 'free' | 'pro' | 'enterprise';
  cloudApiKey?: string;

  // Limits (vary by tier)
  limits: {
    maxFactsPerUser: number;      // Free: 100, Pro: 10000
    maxRequestsPerDay: number;    // Free: 50, Pro: unlimited
    memoryTokenLimit: number;     // Free: 500, Pro: 2000
    voiceEnabled: boolean;        // Free: false, Pro: true
  };
}
```

### Future Cloud Infrastructure

```
┌─────────────────────────────────────────────────────┐
│                 Our Cloud Service                    │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   API GW    │  │  HA Bridge  │  │   Postgres  │ │
│  │  (Auth/Rate)│──│  (Scalable) │──│  (Memory)   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                      │
│  Users connect via: api.librechat-ha.com            │
└─────────────────────────────────────────────────────┘
```

---

## Risk Mitigation

### Risk 1: Performance (Voice Response Time)

**Concern:** Chain is long, might exceed 3s target

**Mitigations:**
- Connection pooling to HA
- Claude prompt optimization (concise)
- Consider streaming responses
- Async fact extraction (after response sent)

### Risk 2: Memory Quality

**Concern:** Fact extraction might be noisy

**Mitigations:**
- Confidence scoring
- Strict extraction prompt
- User can view/delete facts
- Automatic deduplication

### Risk 3: Multi-User Isolation

**Concern:** Facts leaking between users

**Mitigations:**
- User ID in all queries
- Database-level isolation
- Integration tests for isolation

---

## Success Metrics

### Technical

- [ ] API response time <2s (p95)
- [ ] Voice response time <3s (p95)
- [ ] Memory persistence 100% reliable
- [ ] Zero cross-user data leaks

### User Experience

- [ ] Memory "just works" (no manual management needed)
- [ ] Facts recalled accurately
- [ ] Natural conversation flow
- [ ] Clear setup documentation

### Business (Post-Launch)

- [ ] 50+ self-hosted installations (month 1)
- [ ] 10+ Pro subscribers (month 3)
- [ ] Positive community feedback

---

## Next Steps

1. **Create directory structure** for `src/ha-bridge/`
2. **Initialize npm project** with dependencies
3. **Build HTTP API skeleton** with health check
4. **Implement memory storage** with SQLite
5. **Add fact extraction** with Haiku
6. **Integrate LLM client** with tools
7. **Build HA component**
8. **Test end-to-end**
9. **Document and release**

---

## Appendix: Research Findings

### LibreChat API Status

- **Official Public API:** Does not exist
- **Internal API:** Exists but undocumented, not intended for external use
- **Maintainer Statement:** "No that's not its intended usage" (Discussion #4679)
- **Feature Request:** Open for "limited chat API" but no timeline

### Alternative Approaches Considered

1. **Use LibreChat Internal API** - Rejected (unstable, unsupported)
2. **Fork LibreChat** - Rejected (maintenance burden)
3. **Wait for LibreChat API** - Rejected (unknown timeline)
4. **Build Our Own** - Selected (full control, clean architecture)

---

**Document Status:** Complete
**Ready for:** Implementation
**Next Review:** After Week 1 completion
