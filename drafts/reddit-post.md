**TL;DR:** Built a memory-enabled HA conversation agent that remembers context across conversations using semantic search + embeddings. Self-hosted, HACS-ready, AGPL-3.0. Daily driving for 2 weeks.

---

Hello!

My name is Jure.

Like a lot of you, I've been running voice assistants through HA Assist. And if you have a few different sensors around a house you've likely experienced something like this:

**Me:** "Hey, is the NOx sensor reading normal?"
**Assist:** "The sensor shows 100 ppm. Typical indoor levels are 20-40 ppm, so this appears elevated."
**Me:** "Actually, 100 is normal for my home. Remember that."
**Assist:** "Got it!"

*Next day:*

**Me:** "How's the air quality in my bedroom?"
**Assist:** "The NOx sensor shows 98 ppm. This appears elevated..."

...hmmm.

This "forgetfulness" gets pretty annoying very quickly. The built-in AI integrations are stateless — every conversation starts from zero. There are community workarounds (blueprints using todo lists as memory, template sensors that survive reboots), but they're keyword-based and fragile.

My attempt at solving this is called **[Home Mind](https://github.com/hoornet/home-mind)**.

It's a conversation agent for Home Assistant with persistent cognitive memory.

**What makes it different:**

- **Semantic memory, not keyword matching.** It uses embeddings to understand meaning. Ask about "air quality" and it recalls the NOx baseline — even though you never said "air quality" when you stored it.
- **Memories strengthen with use.** The more you reference a fact, the stronger it becomes (Hebbian learning).
- **Unused memories naturally decay.** One-time notes fade, daily preferences stay strong.
- **Smart replacement.** Say your bedtime is 11pm, later correct to 10:30pm — it replaces the old fact, not stores both.
- **Learns passively.** No need to say "remember this." It extracts facts from natural conversation in the background.

**How it works:**

Docker stack (two containers) alongside HA. Registers as a conversation agent, so it works with Assist, voice satellites, companion app — everything. Claude Haiku handles conversation + device control, a second model silently extracts and stores facts, and relevant memories are recalled via semantic search on each new message.

**What it costs:**

It requires an Anthropic API key (Claude Haiku). In my usage over 2 weeks, the cost has been negligible — we're talking cents per day for a household. The memory backend (Shodh) and the server itself are fully self-hosted; the only external call is to Claude's API for the LLM.

**Privacy note:**

Your conversation text and entity names are sent to Claude's API for processing. Device states are fetched locally via HA's REST API and only included in the prompt when relevant. Memory storage and semantic search happen entirely on your hardware.

**Current state:**

v0.6.0, daily-driving for the last 2 weeks. Once configured, I rarely see a problem — at least in my case it works really well.

Self-hosted, AGPL-3.0, HACS installable.

This is my first public project. Looking for feedback and early testers — especially if you have voice satellites or a multi-room setup. Would love to hear what breaks.

**Repo + installation guide:** https://github.com/hoornet/home-mind
