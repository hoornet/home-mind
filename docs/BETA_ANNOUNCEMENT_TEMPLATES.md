# Beta Testing Announcement Template

## For /r/homeassistant

### Title Options:
1. "I built an AI assistant for Home Assistant that actually remembers things"
2. "LibreChat + Home Assistant: AI with persistent memory and learning"
3. "[Beta] Home Assistant AI that learns your sensor baselines and remembers preferences"

### Post Body:

---

## What I Built

I've been working on integrating LibreChat with Home Assistant to solve a problem that's frustrated me for years: **AI assistants that forget everything between conversations.**

This integration adds:
- ✅ **Persistent memory** - Remembers corrections and preferences across sessions
- ✅ **Historical data analysis** - Queries sensor history and analyzes trends
- ✅ **Learning capability** - Learns sensor baselines and patterns
- ✅ **Contextual intelligence** - Provides answers based on what it knows about YOUR home

## Real Examples

**Teaching baselines:**
```
You: Remember that 20-21°C is normal for my living room in the morning
AI: [🔖 Updated saved memory] Got it!

[Next day, new conversation]
You: Is the living room temperature normal?
AI: Yes! It's 21.1°C, which is right at your normal 20-21°C range.
```

**Historical analysis:**
```
You: How has the living room temperature changed since this morning?
AI: [Queries last 6 hours of data]
    Temperature progression:
    • 06:00 AM: 19.9°C
    • 07:00 AM: 20.1°C  
    • 08:00 AM: 20.7°C
    
    Steady 0.8°C increase - typical morning warm-up pattern.
```

**Anomaly detection:**
```
You: If temperature jumped to 25°C, would that be unusual?
AI: Yes, very unusual! That's 4-5°C above your normal 20-21°C baseline.
    I'd recommend checking:
    - Radiator valve positions
    - Climate control settings
    - For sensor errors
```

## Technical Details

- **Stack:** LibreChat (frontend) + MCP Server (bridge) + Home Assistant (backend)
- **Memory:** LibreChat's native memory system (MongoDB)
- **AI Models:** Claude Sonnet 4 (or GPT-4, or local Ollama)
- **Deployment:** Docker Compose
- **License:** AGPL v3.0

## What I'm Looking For

I'm looking for **5 beta testers** who:
- Have Home Assistant running (any version)
- Are comfortable with Docker
- Have an Anthropic API key (or OpenAI)
- Want an AI that actually remembers things

**Time commitment:** ~2 hours setup, 1 week testing

## What You Get

- Early access to something genuinely unique
- Your feedback will shape the v1.0 release
- A smart home AI that learns and improves over time
- Support during setup and testing

## Current Status

**Working features:**
- ✅ Device control (lights, switches, sensors)
- ✅ Persistent memory across sessions
- ✅ Historical data queries (hours/days/weeks)
- ✅ Learning from corrections
- ✅ Contextual analysis

**Known limitations:**
- Setup requires some technical knowledge
- Currently tested primarily with temperature/air quality sensors
- Some advanced features still in development

## Get Involved

GitHub: [your-repo-link]
Documentation: [link to README]

Comment below or DM if interested!

---

## For Home Assistant Community Forums

### Title:
"LibreChat-HomeAssistant: AI Assistant with Persistent Memory (Beta Testers Wanted)"

### Post:
[Similar content to above, but with more technical detail]

**Additional sections for forum post:**

### Architecture
```
LibreChat (UI) → MCP Server → Home Assistant REST API
     ↓
 Memory System (MongoDB)
```

### Installation Preview
```bash
# Quick setup (detailed guide in repo)
git clone https://github.com/your-username/librechat-homeassistant
cd librechat-homeassistant
# [Follow setup guide]
```

### Comparison to Other Solutions

| Feature | This Project | Extended OpenAI | Native Claude | Wyoming |
|---------|-------------|-----------------|---------------|---------|
| Persistent Memory | ✅ | ❌ | ❌ | ❌ |
| Historical Analysis | ✅ | ❌ | ❌ | ❌ |
| Learning Capability | ✅ | ❌ | ❌ | ❌ |
| Multi-Model Support | ✅ | ❌ | ❌ | ✅ |
| Document Upload | ✅ | ❌ | ❌ | ❌ |

### FAQ

**Q: Why not just use the native Home Assistant Anthropic integration?**
A: Native integration has no persistent memory. It forgets everything between conversations.

**Q: Can I use local models (Ollama)?**
A: Yes! LibreChat supports Ollama, so you can run this entirely locally.

**Q: Does this replace Home Assistant's built-in AI?**
A: No, it complements it. You can use both.

**Q: What's the performance like?**
A: Response times are similar to native integration (~2-3 seconds). Memory adds negligible overhead.

**Q: Can I use this with Home Assistant Cloud?**
A: Yes, as long as you can reach your HA instance via local network or VPN.

---

## For Hacker News (If you want wider tech audience)

### Title:
"Show HN: Home Assistant AI with persistent memory and learning"

### Post:
```
I got frustrated with AI assistants that forget sensor baselines and preferences 
between conversations, so I built this integration between LibreChat and Home 
Assistant.

Key features:
- Persistent memory: "Remember 100ppm NOx is normal" → it actually remembers
- Historical analysis: "How has temperature changed?" → queries HA's history API
- Learning: Corrects itself and stores baselines
- Multi-model: Claude, GPT-4, or local Ollama

Example: After teaching it that "20-21°C is normal morning temp", it can 
answer "Is temperature normal?" with context instead of just "21.1°C".

Looking for beta testers. Technical stack is LibreChat + Model Context 
Protocol + HA REST API.

GitHub: [link]
```

---

## DM Template for Interested Beta Testers

### Subject: LibreChat-HomeAssistant Beta Testing

Hi [name],

Thanks for your interest in beta testing!

**What I need from you:**

1. **Home Assistant details:**
   - Version: ?
   - Installation type: (Docker/HAOS/Core/Supervised)
   - Network access: (Local/VPN/Cloud)

2. **Setup:**
   - Comfortable with Docker? (Yes/No)
   - Have API key for: (Anthropic/OpenAI/Using Ollama)
   - Time to dedicate: ~2 hours setup + testing over 1 week

3. **What you're interested in testing:**
   - Temperature monitoring?
   - Air quality tracking?
   - Device automation?
   - Other sensors?

**What I'll provide:**

- Installation guide
- Setup support (via GitHub Discussions or Discord)
- Documentation access
- Direct line to me for issues

**Timeline:**
- Week 1: Setup and initial testing
- Week 2: Feature testing and feedback
- Week 3: Wrap-up and v1.0 prep

Reply with your HA details and I'll send you the beta access info!

Best,
[Your name]

---

**Last Updated:** January 16, 2026
**Status:** Ready for beta announcement
