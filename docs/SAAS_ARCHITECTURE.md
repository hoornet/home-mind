# Home Mind SaaS Architecture

## Overview

Three-tier offering:

| Tier | Hosting | API Key | Memory | Price |
|------|---------|---------|--------|-------|
| **Self-hosted** | User | User's | SQLite | Free |
| **BYOK Hosted** | Us | User's | Shodh | $5/mo |
| **Fully Managed** | Us | Ours | Shodh | $12/mo |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Home Mind Cloud                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Web App   │    │   API       │    │   Shodh     │         │
│  │  (Next.js)  │───▶│  (ha-bridge)│───▶│   Memory    │         │
│  │  Dashboard  │    │  + Auth     │    │             │         │
│  └─────────────┘    └──────┬──────┘    └─────────────┘         │
│                            │                                    │
│                     ┌──────┴──────┐                            │
│                     │  PostgreSQL │                            │
│                     │  - Users    │                            │
│                     │  - API Keys │                            │
│                     │  - Subs     │                            │
│                     └─────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         │                    ▲
         │                    │
         ▼                    │
┌─────────────────┐    ┌─────────────────┐
│  User's Home    │    │    Stripe       │
│  Assistant      │    │    Billing      │
└─────────────────┘    └─────────────────┘
```

## Implementation Phases

### Phase 1: Multi-User Foundation (MVP)
**Goal:** Support multiple users with their own API keys

1. **User accounts**
   - Email + password auth (or magic link)
   - JWT tokens for API authentication
   - User profile (name, email, tier)

2. **Installation tokens**
   - Each user gets an "installation token"
   - HA component uses this token instead of raw userId
   - Token links HA instance to Home Mind account

3. **API key storage**
   - Encrypted storage for user's Anthropic API key
   - AES-256 encryption with per-user salt

4. **Database migration**
   - Add `users` table
   - Add `installations` table (links HA to user)
   - Modify memory to be per-user

**Deliverables:**
- [ ] User registration/login endpoints
- [ ] Installation token generation
- [ ] Encrypted API key storage
- [ ] Update HA component to use installation token
- [ ] User dashboard (basic)

### Phase 2: Stripe Integration
**Goal:** Accept payments, manage subscriptions

1. **Stripe setup**
   - Products: BYOK Hosted ($5/mo), Fully Managed ($12/mo)
   - Webhook handling for subscription events
   - Customer portal for self-service

2. **Tier enforcement**
   - Check subscription status on each request
   - Graceful degradation (not hard cutoff)
   - Usage tracking for analytics

3. **Managed API key**
   - System Anthropic key for Fully Managed tier
   - Usage tracking per user
   - Rate limiting to prevent abuse

**Deliverables:**
- [ ] Stripe checkout integration
- [ ] Webhook handlers
- [ ] Subscription status checks
- [ ] Usage dashboard

### Phase 3: Cloud Deployment
**Goal:** Production-ready hosted service

1. **Infrastructure**
   - Fly.io or Railway for API
   - Managed PostgreSQL (Neon/Supabase)
   - Shodh Memory instance

2. **Operations**
   - Monitoring (uptime, errors)
   - Logging (structured, searchable)
   - Backups

3. **Security**
   - Rate limiting
   - DDoS protection
   - Security audit

**Deliverables:**
- [ ] Production deployment
- [ ] Monitoring dashboard
- [ ] Runbooks for operations

---

## Database Schema (Phase 1)

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- null if magic link only
  name VARCHAR(255),
  tier VARCHAR(50) DEFAULT 'free', -- free, byok, managed
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Installations (links HA instance to user)
CREATE TABLE installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL, -- installation token
  name VARCHAR(255), -- "Home", "Office", etc.
  anthropic_key_encrypted TEXT, -- user's API key (encrypted)
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API key encryption
-- Key: ENCRYPTION_KEY env var (32 bytes)
-- Algorithm: AES-256-GCM
-- Format: base64(iv + ciphertext + authTag)
```

---

## HA Component Changes

Current flow:
```
HA Assist → home_mind component → POST /api/chat {userId: "ha_user_id"}
```

New flow:
```
HA Assist → home_mind component → POST /api/chat
  Header: Authorization: Bearer <installation_token>
  Body: {message: "..."}
```

The installation token:
- Generated when user adds HA integration in dashboard
- Stored in HA integration config
- Identifies the user + installation

---

## API Endpoints (Phase 1)

### Auth
```
POST /api/auth/register    - Create account
POST /api/auth/login       - Get JWT token
POST /api/auth/refresh     - Refresh JWT
GET  /api/auth/me          - Get current user
```

### Installations
```
GET    /api/installations           - List user's installations
POST   /api/installations           - Create new installation (get token)
DELETE /api/installations/:id       - Remove installation
PUT    /api/installations/:id/key   - Set/update Anthropic API key
```

### Chat (modified)
```
POST /api/chat              - Requires Authorization header
POST /api/chat/stream       - Requires Authorization header
```

### Dashboard
```
GET /api/usage              - Usage stats for current billing period
GET /api/subscription       - Current subscription status
```

---

## Security Considerations

1. **API Key Encryption**
   - Never store Anthropic keys in plaintext
   - Use AES-256-GCM with unique IV per encryption
   - Encryption key from environment (never in code/DB)

2. **Installation Tokens**
   - Long, random tokens (64 chars)
   - Rate limited per token
   - Can be revoked instantly

3. **JWT Tokens**
   - Short expiry (15 min access, 7 day refresh)
   - Secure httpOnly cookies for web
   - Bearer tokens for API

---

## Pricing Rationale

| Tier | Our Cost | Price | Margin |
|------|----------|-------|--------|
| BYOK Hosted | ~$2/user (infra) | $5/mo | $3/user |
| Fully Managed | ~$2 infra + $1-3 API | $12/mo | $7-9/user |

At 100 users: $700-900/mo revenue
At 1000 users: $7,000-9,000/mo revenue

---

## Timeline Estimate

| Phase | Scope | Duration |
|-------|-------|----------|
| Phase 1 | Multi-user MVP | 2-3 weeks |
| Phase 2 | Stripe + tiers | 1-2 weeks |
| Phase 3 | Cloud deploy | 1 week |

**Total to revenue-ready: ~4-6 weeks**

---

## Open Questions

1. **Self-hosted still free?**
   - Yes, keeps AGPL spirit, drives awareness

2. **What about LibreChat users?**
   - Future: MCP server could also use installation tokens
   - Or separate pricing for web interface

3. **Usage limits?**
   - BYOK: Unlimited (their key, their cost)
   - Managed: Soft limit? 1000 messages/mo included, then $0.01/msg?

4. **Trial period?**
   - 14-day free trial of Managed tier?
   - Or just generous free tier?
