# Home Mind - Launch Roadmap

## Phase 1: Cleanup & Testing (Current)

### 1.1 Update ubuntuserver
- [x] Stop old ha-bridge container
- [x] Remove old ~/home-mind/ directory
- [x] Clone fresh repo (via scp)
- [x] Set up docker-compose (shodh + server)
- [x] Migrate existing Shodh data
- [x] Verify API works

### 1.2 Update Home Assistant
- [x] Check if custom component needs updates (v0.4.0 already installed)
- [x] Test voice commands via Assist
- [x] Test text commands via Assist

### 1.3 End-to-end testing
- [x] Memory persistence works
- [x] Conversation history works
- [x] HA entity queries work
- [x] Device control works

## Phase 2: Fresh Install Test

### 2.1 Simulate new user experience
- [x] Fresh VM or clean environment (Ubuntu Server 24.04 VM via KVM)
- [x] Follow README instructions exactly
- [x] Document any friction points
- [x] Note missing prerequisites
- [x] Time the installation process (~6 minutes after Docker installed)

**Friction points found:**
1. ~~GitHub repo is private~~ - Need to make public before launch
2. ~~Docker install instructions missing~~ - Fixed in README
3. ~~Version hardcoded as 0.5.0~~ - Fixed to read from package.json

### 2.2 Documentation polish
- [x] Update README based on fresh install findings
- [ ] Add troubleshooting section
- [ ] Create video walkthrough (optional)
- [x] Verify HACS installation works

### 2.3 Project support
- [x] Make GitHub repo public
- [x] Ko-fi page (ko-fi.com/hoornet)
- [ ] GitHub Sponsors
- [x] Add funding links to repo (FUNDING.yml with Ko-fi)
- [x] Add Support section to README
- [x] Blog post on swapper.si

## Phase 3: SaaS / Hosted Option

### 3.1 Architecture
- [ ] Design hosted API service
- [ ] User authentication (API keys or OAuth)
- [ ] Multi-tenant Shodh (user isolation)
- [ ] Usage tracking/limits

### 3.2 Infrastructure
- [ ] Cloud hosting (AWS/GCP/Hetzner)
- [ ] Domain setup
- [ ] SSL certificates
- [ ] Monitoring/alerting

### 3.3 Monetization
- [ ] Pricing tiers (free tier? paid only?)
- [ ] Payment integration (Stripe)
- [ ] User dashboard
- [ ] Usage analytics

### 3.4 Simplified user flow
```
User installs HA component → Enters API key → Done
(No Shodh, no server, no Docker needed)
```

## Phase 4: Public Launch

- [ ] GitHub release with changelog
- [ ] Reddit/HA community announcement
- [ ] Demo video
- [ ] Landing page (optional)

---

**Current Status:** Phase 2.2 in progress - Repo is public, HACS verified, Ko-fi set up. Adding more funding/support options.
