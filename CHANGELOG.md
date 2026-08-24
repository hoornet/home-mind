# Changelog

All notable changes to Home Mind are documented here.

## [0.16.4] - 2026-08-24

### Fixed (api/routes.ts)
- **`conversation.process` without a `conversation_id` works now.** Home Assistant's integration serializes a missing conversation id as an explicit JSON `null`, and the request schema's `.optional()` covers an *absent* key but not a null one — so every such call was rejected with a 400 before the model was ever invoked. Voice and the Assist dialog always carry an id and were unaffected; service calls and automations were not. The schema now accepts `null` and treats it as "no conversation in flight" (`userId` had the same latent shape and is covered too), and any client that sends the key conditionally keeps working unchanged.

### Changed (llm/prompts.ts)
- **Repeat turns are cheaper: the unchanging parts of the prompt are now cacheable.** Prompt caching is a prefix match, and the per-request timestamp used to sit *ahead* of the home layout and device cheat sheet — the largest stable content in the prompt — so providers re-billed them on every turn. The prompt is now ordered least-volatile-first: identity and instructions, then the home description in its own cache block (Anthropic path) or ahead of the volatile tail (plain-text path for OpenAI-compatible endpoints), then timestamps and retrieved facts last. Same content, same answers; on providers with prompt caching the home description is now read from cache on repeat turns, and the saving grows with the size of your home.

276 tests, up from 266.

## [0.16.3] - 2026-08-19

### Fixed (llm/token-cap.ts, llm/openai-client.ts, memory/openai-extractor.ts)
- **OpenAI's newer models work again.** GPT-5-family and o-series models reject `max_tokens` outright — `400 Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.` — and both OpenAI-backed paths sent the old spelling: the chat engine and the fact extractor. Pointing `LLM_PROVIDER=openai` at any of those models failed before the model was ever invoked.

  Switching spellings globally was not an option: every other OpenAI-compatible endpoint Home Mind supports — Ollama, LM Studio, llama.cpp, Azure, gateways — still expects `max_tokens`, and being model-agnostic means never breaking the local path to fix the hosted one.

  Matching on model names would have been wrong rather than merely brittle. The accepted parameter belongs to *whoever serves the model*, not to the model: a normalising gateway will accept `max_tokens` for a model that rejects it upstream, so the same model id needs different parameters at different base URLs. A name list would also need editing on every OpenAI launch.

  So `withTokenCap()` negotiates instead. It sends `max_tokens`; if the endpoint objects, it sends the request again with `max_completion_tokens` and remembers the answer for that model for the life of the process. Endpoints that work today send byte-identical requests. Affected ones pay one rejected request per model per restart — no tokens are billed, since it fails before inference. Retrying is safe on the streaming path because the 400 arrives on the initial request, before any chunk reaches the caller. Detection is deliberately narrow (status 400 with `param: "max_tokens"` and `code: "unsupported_parameter"`, or a message naming `max_completion_tokens`), so an unrelated 400 — bad model id, malformed tool schema — still surfaces unchanged.

### Changed (llm/openai-client.ts)
- **A truncated reply on a reasoning model now says what actually happened.** On these models the output cap also covers hidden reasoning tokens, so a long deliberation can exhaust the budget before a single visible word is written. The `MAX_TOKENS_TRUNCATED` hint previously blamed prompt size in every case; when we know the endpoint wanted `max_completion_tokens`, it now points at reasoning effort instead. The cap itself is unchanged at 2048 (500 for voice).

266 tests, up from 254.

## [0.16.2] - 2026-08-09

### Fixed (memory/fact-patterns.ts, memory/extraction-prompt.ts)
- **Forgetting no longer leaves a tombstone behind.** Deleting a fact removed the content, but the turn that did it is itself extractable — "forget that my canary word is bumblebee" / "Forgotten." — so the extractor stored a *new* fact about the forgetting: `User no longer wants their test canary word remembered`, `User confirmed deletion of the bedroom cooling automation`. Observed live in a real memory store, where they had accumulated quietly and were being read back on recall. A memory asserting that something is not remembered is worse than no memory at all.

  Two layers, because the prompt alone is not enough on small local models. The extraction prompt now states the rule as NEVER, with three worked BAD examples; `MEMORY_META_PATTERNS` catches them deterministically regardless of the model.

  The pattern is deliberately narrow. `matchesGarbagePattern()` is also applied **retroactively** by `MemoryCleanupJob`, so anything it matches is deleted from every existing memory store on the next sweep — a loose pattern would silently destroy real facts. Positive verbs (remember/retain/store) only count when explicitly negated, and "asked … to" only counts alongside a delete verb, so `User asked me to remember that 100 ppm is normal` survives while `You previously asked me not to retain your canary word` does not. The test file pins a regression set of twelve real facts taken verbatim from a live store.

  Existing tombstones are cleared by the cleanup job, which runs 30s after start and every 6h thereafter — no user action needed.

254 tests, up from 233.

## [0.16.1] - 2026-08-08

### Added (api/routes.ts)
- **The server now logs which custom prompt is actually in effect.** A client can send `customPrompt` per request and it overrides the server-level `CUSTOM_PROMPT` (`parsed.data.customPrompt ?? defaultCustomPrompt`), but nothing said which one won and the effective prompt was never logged at any level — so a correct value in one place could sit doing nothing while the other silently took precedence, invisible from outside the process. `[persona] …` now names the source, previews the first 60 characters, and says explicitly when the server-level prompt is being overridden. Logged once and again only when it changes, so it doesn't repeat per message.

## [0.16.0] - 2026-08-08

### Added (llm/tool-definitions.ts, llm/tool-handler.ts, memory/fact-resolution.ts, llm/forget-confirmations.ts)
- **`forget_memory` — a sixth tool, so a memory can be removed by asking.** Until now deletion existed only as REST endpoints (`DELETE /api/memory/:userId/facts/:factId`), which nobody talking to Assist can reach, so "forget that I like 21°C" had nowhere to go. Now: *"forget that my canary word is bumblebee"* → the assistant quotes the exact stored fact back and waits → *"yes"* → deleted.

  The tool takes a **content query, never a fact id**: ids are not shown to the model, and tool results are never persisted to conversation history, so an id could not come back on the confirming call anyway. Resolution is deterministic and server-side (`memory/fact-resolution.ts`) — exact normalized match first, then Dice similarity over token sets; several close matches return candidates and delete nothing.

- **Server-enforced two-call confirmation (`llm/forget-confirmations.ts`).** The first call only previews; a later call in a *different* turn commits. This required threading conversation continuity into the tool layer for the first time: `handleToolCall` now takes a `ToolContext` carrying `conversationId`, a per-turn `turnId`, the `userId` and the memory store, and both engines create exactly one context per turn.

  The gate keys on the **resolved fact's normalized content**, not on the model's wording (which it changes freely between turns) and not on the fact id (the extractor can delete and re-add the same text under a new id in between, which an id-keyed gate would read as a mismatch and re-preview forever). Without conversation continuity — a one-shot API call, say — the tool **refuses** rather than deleting, because there is nobody to confirm with and a deleted memory does not come back.

### Fixed (llm/tool-handler.ts)
- **Post-turn extraction no longer re-learns what was just forgotten.** The extractor runs over each turn's transcript, and "forget that my name is Alex" is a transcript containing "my name is Alex" — so the fact reappeared moments later under a fresh id. Extraction now filters against the memories the turn touched.

  The filter asks *which words changed*, not *how similar are these*, because similarity cannot tell the two cases apart: a replacement ("…canary word is honeybee") and a restatement ("The user's canary word is bumblebee") score identically against the forgotten text. A replacement drops a meaningful word and puts another in its place; a restatement keeps them all. Digits count as meaningful however short, or swapping 21 for 23 reads as no change — and temperatures, times and thresholds are most of what this stores.

### Notes
- Ported deliberately from the sibling add-on rather than copied: the confirmation gate here is memory-scoped (there are no automations in this project), and the design carries the fixes that project learned in production — content-keyed identity, the numeric-aware filter, refusing without a conversation, and reporting "already forgotten" when the extractor removed the fact before the user confirmed.

## [0.15.9] - 2026-08-05

### Security
- **undici 7.28.0 → 7.29.0**, clearing five advisories published this week (one high: cross-user information disclosure and parse-time crash via degenerate private cache directives; four moderate: CRLF injection via blob-like body type, cookie attribute injection, cache-control whitespace disclosure, retry-interceptor response desynchronization). undici is the HTTP client used for Home Assistant API calls. Lockfile-only change — the `^7.28.0` range already covered it. `npm audit` reports 0 vulnerabilities.

## [0.15.8] - 2026-08-05

### Fixed (memory/extraction-prompt.ts)
- **Few-shot example names no longer leak into stored memory.** The extraction prompt's identity-category examples used real names ("my name is Jure", "I'm also called Hoornet"). Small local models sometimes copy a few-shot example verbatim into real output, so an Ollama-class extractor could store "User's name is Jure" as an actual fact — which then rides into every system prompt via memory injection and resists conversational correction, since nothing the user says outranks a "remembered" fact. Examples now use generic placeholders. Reported against the Nives fork (hoornet/nives#54); the same prompt text existed here.

## [0.15.7] - 2026-07-25

### Fixed (llm/client.ts, llm/openai-client.ts)
- **Tool-call loops are now bounded.** Both chat engines looped on `stop_reason === "tool_use"` / `finish_reason === "tool_calls"` with no iteration cap. A model that gets stuck — re-searching entities, retrying a tool whose result it misreads as a failure — would keep calling until the HA integration's 120-second client timeout, producing nothing and, on a metered API, spending real money to do it. Capped at 8 round-trips (`MAX_TOOL_ITERATIONS`); the final pass re-issues the request with tool calling disabled (`tool_choice: "none"` / `{type: "none"}`) so the model has to answer in words instead of timing out silently.

### Fixed (llm/openai-client.ts)
- **Malformed tool arguments no longer fail the whole request.** `JSON.parse(tc.function.arguments)` ran unguarded inside a `Promise.all`, so a single truncated or non-JSON argument blob rejected the entire chat request as a 500. Small local models (the common Ollama case) emit these routinely. The parse failure now comes back as a normal tool error the model can recover from on the next turn.

### Fixed (memory/conversation-sqlite.ts)
- **The periodic fact-cleanup job no longer skips everyone.** `getKnownUsers()` was `SELECT DISTINCT user_id FROM messages`, but `cleanupOldConversations()` prunes messages older than 24 hours — so any user who hadn't chatted that day disappeared from the list, and `MemoryCleanupJob` logged "No known users" and did nothing. Users are now tracked in their own durable `users` table, matching what `InMemoryConversationStore` already did correctly with its `knownUsers` set. Existing databases are backfilled from whatever messages remain on first start. Affects `CONVERSATION_STORAGE=sqlite` only.

### Security
- Ships the dependency fixes that landed after 0.15.6 but were never tagged: **vitest 4.0.18 → 4.1.8** (critical, GHSA-5xrq-8626-4rwp), **tsx → ^4.22.4** pulling esbuild 0.28.1 (high-severity advisory), plus `undici`, `multer`, `uuid`, `qs`/`express` bumps. Anyone installing from the 0.15.6 tag was still on the vulnerable versions.
- Additionally clears **postcss** path-traversal (high, GHSA-r28c-9q8g-f849) and **body-parser** DoS via silently-disabled size enforcement (GHSA-v422-hmwv-36x6). `npm audit` now reports 0 vulnerabilities.

### Changed (docs)
- Stale "HomeMind PRO" strings corrected to "Home Mind" (OpenRouter `X-Title`/referer, usage-limit notification), and the usage-limit copy reframed for OSS/BYOK rather than a paid service. Easy Install section now points at the Nives add-on instead of a dead repo URL.

## [0.15.6] - 2026-05-13

### Added (prompts.ts)
- **`localMidnightIso` field** on `formatDateTimeWithOffset()`'s return shape. The dynamic prompt block now includes a `Local midnight today (UTC)` line with an unambiguous ISO timestamp the LLM should use as `start_time` for "today's X" history queries. Previously the model would infer "today" from the date string and end up sending `2026-05-13T00:00:00Z` — which is midnight UTC, **not** midnight local. For CEST that meant skipping the first 2 hours of the local day; for EST it would pull 5 hours of *yesterday* into "today". The injected value is computed from the runtime's local TZ, so it works correctly for every offset (including half-hour ones like UTC+5:30).

### Changed (prompts.ts)
- **Tightened the "when did X start today?" rule** to a prescriptive universal principle. Previously the prompt said *"the first non-zero reading is usually pre-dawn sensor noise; pick when the value crosses a meaningful threshold OR describe the ramp"* — which models interpreted as advisory and often did both (correctly describing the ramp **and** still naming the first non-zero datapoint). The new wording is:
  > NEVER report the first non-zero datapoint as the start time. It is almost always idle current, sensor noise, or a recorder artifact — not real activity. Either find when the value first crossed ~10% of today's peak observed value, or describe the ramp shape without naming a specific start. The data's own shape — not absolute clock times — defines when something meaningfully started.
- This generalizes to any rate/power/flow sensor (solar inverters, water meters, motion-cumulative, miners, HVAC, etc.) and avoids latitude/season-specific clock-time hardcoding.

### Why
Two distinct bugs surfaced in the same real-HA query: (1) the model querying with midnight UTC instead of local midnight, and (2) reporting an inverter idle reading at 4:14 AM as "solar started at 4:14 AM" despite the previous "describe the ramp" advisory. Fix #1 is structural (the model can no longer get the local-day boundary wrong). Fix #2 is prescriptive (the model cannot interpret "describe the ramp" as additive to naming a pre-dawn timestamp).

## [0.15.5] - 2026-05-13

### Added (system prompt)
- **"Entity discovery — don't give up before searching"** section instructs the model to try `search_entities` with relevant keywords (system word, brand, domain, room name, device type) before declining to answer. Addresses a real-HA pattern observed during cheap-tier piloting where models would say "I don't have that tool" for things like solar production rather than searching for the entity first.
- **"Today's X / past-data queries"** section gives explicit guidance on two failure shapes:
  - For **daily totals**, use `get_history` over today's range — not the instantaneous current state of a `sensor.*_current_power` entity.
  - For **"when did X start today?"** on noisy sensors (solar inverters, motion-cumulative, water meters), the first non-zero reading is often pre-dawn sensor noise or idle current. Report when the value crosses a meaningful threshold, or describe the ramp in plain language.

Both new sections appear in `SYSTEM_INSTRUCTIONS` (full) and `VOICE_INSTRUCTIONS` (compact) in `src/llm/prompts.ts`. Total cost: ~250 extra tokens per conversation (cached via prompt caching where supported).

### Why
Observed failures during real-HA cheap-model piloting: (a) Mistral-Small declining solar production questions without trying `search_entities`; (b) cheap models reporting "0 produced today" because they read instantaneous power instead of daily history; (c) the "4:13 AM solar start" mistake (84W pre-dawn reading reported as the day's start). All three are addressable on the prompt side and lift any model running through Home Mind, not just one.

## [0.15.4] - 2026-05-13

### Added
- **`OPENAI_RESPONSE_FORMAT` env var** (closes [#21](https://github.com/hoornet/home-mind/issues/21)). When set to `json_object`, the OpenAI-compatible fact extractor sends `response_format: { type: "json_object" }` on every extraction call. Required by some OpenAI-compatible providers (notably `qwen3.6:27b` via Ollama, per @rgnyldz's report) that otherwise return empty content. Unset by default → behaviour unchanged for providers that don't need it.
- **`OPENAI_MAX_TOKENS` env var.** Override the fact extractor's `max_tokens` (default `1000`). Only affects the extractor — chat keeps its `isVoice`-based defaults (500/2048). Useful when a local model truncates JSON output at the default ceiling. Thanks to @rgnyldz for surfacing the underlying need.
- **Structured `error` field on `ChatResponse`** — when chat returns no text and no tool calls, the server now emits `{ code, hint }` instead of a silent empty response. Codes: `EMPTY_CONTENT`, `MAX_TOKENS_TRUNCATED`, `CONTENT_FILTERED`.
- **HA integration surfaces `error.hint` directly to the user** (`src/ha-integration/custom_components/home_mind/conversation.py`). The previous fallback string — "I received your request but got no response." — was indistinguishable across very different failure modes (model returned nothing, max_tokens truncation, content-filter block, shim/proxy returning non-streaming responses). Users now get a specific hint about what to check, surfaced directly in HA Assist.

### Why
The generic fallback string had been around since the first integration, and it hit at least two distinct failure modes we know of: @rgnyldz's qwen3.6:27b case (missing `response_format` hint) and our own FunctionGemma testing (shim returning non-streaming JSON instead of OpenAI SSE chunks). Both surfaced the same opaque message in HA Assist, making the problem far harder to diagnose than it needed to be. The shape now distinguishes failure modes and surfaces fixable hints to the user.

## [0.15.3] - 2026-05-11

### Fixed
- **`get_history` tool calls with explicit timezone offsets no longer 400.** When the LLM passed `start_time` / `end_time` containing a `+HH:MM` offset (e.g. `2026-05-11T09:46:47+02:00`), the `+` was interpolated raw into the request URL. HA's HTTP layer (aiohttp) decodes `+` as space in query strings, so the timestamp arrived as `2026-05-11T09:46:47 02:00` and HA rejected it with `400: Invalid end_time`. Any model smart enough to include its local TZ hit this — observed first with `mistralai/mistral-small-3.2-24b-instruct` retrying 8+ times before giving up. All interpolated values in `getHistory()` are now run through `encodeURIComponent`. Regression test added in `src/ha/client.test.ts`. Thanks @hoornet (real-HA pilot) for the smoking-gun log.

## [0.15.2] - 2026-05-11

### Security
- **Refreshed npm dependencies to pick up upstream security patches.** `npm audit fix` lifted `multer` (CVE: DoS via uncontrolled recursion / resource exhaustion / incomplete cleanup), `undici` (CVE: WebSocket parser overflow, CRLF injection, request smuggling, unbounded WebSocket/dedup memory consumption, server_max_window_bits validation), `path-to-regexp` (ReDoS, transitive via express), and `qs` (arrayLimit bypass, transitive via express) inside their existing semver ranges. Dev-only chains (`vite`, `postcss`, `rollup`, `picomatch` via vitest) were updated in the same pass. No `package.json` edits, no API or behaviour changes — pull this if you build the server locally and want a clean `npm audit`.

## [0.15.1] - 2026-04-29

### Fixed
- **More forgiving fact-extractor JSON parsing.** Some OpenAI-compatible models (notably `qwen3.6:27b`, but also a few Phi/Gemma variants and the occasional `gpt-4o-mini` response) emit either a single JSON object instead of a `[...]` array, or append trailing prose after the JSON. Strict `JSON.parse` + `Array.isArray` would drop every fact in those cases — silently, since extraction runs fire-and-forget. The extractor now (a) wraps a single object into a one-element array, and (b) falls back to a regex slice (`/\[[\s\S]*\]/`) when the raw response isn't pure JSON. Failures still log a one-line warning with the first 200 chars of the raw response so it's diagnosable from `LOG_LEVEL=debug`. All existing input shapes parse identically — the change is strictly additive. Thanks to @rgnyldz ([#20](https://github.com/hoornet/home-mind/issues/20)) for the diagnosis and the diff that motivated this fix.

## [0.15.0] - 2026-04-21

### Fixed
- **Recall now reliably retrieves stored facts.** The chat path previously used Shodh's `proactive_context` (graph-based spreading activation) as the sole retrieval source when a user message was present. When activation didn't fire — typos in the query, cold memories, weak semantic links — facts were omitted from the system prompt and the LLM replied "I don't know" even though the fact was visible under `GET /api/memory/{userId}`. Retrieval now always pulls the user's tagged fact set via `/api/recall/tags` and, when a query is provided, merges in `proactive_context` results at the front as a relevance boost. Deduplicated by id, trimmed to token budget. If `proactive_context` fails, tag recall still delivers facts.

### Changed
- **`MEMORY_TOKEN_LIMIT` default raised from 1500 → 3000.** The static part of the system prompt is already cached via Anthropic prompt caching, so a larger fact budget costs essentially nothing on the hot path. Users with many memories now get more of them into context by default.

### Added
- **`[recall]` debug log** — when `LOG_LEVEL=debug`, each chat turn logs `userId`, fact count, and approximate token usage. Useful for diagnosing recall issues (e.g. distinguishing "facts weren't retrieved" from "LLM ignored the facts").

## [0.14.0] - 2026-04-11

### Added
- **Auto-detect user language** — server detects the language of the user's message and responds in the same language without any configuration. Works across all LLM providers.
- **OpenRouter attribution headers** — when routing through OpenRouter, requests include `HTTP-Referer` and `X-Title` headers for proper attribution and usage tracking in the OpenRouter dashboard.

### Changed
- **Shodh Memory updated to v0.1.91** — switched to the official `varunshodh/shodh-memory:latest` Docker image (0.1.80 → 0.1.91). Includes SHA-256 content deduplication, improved graph memory, and stability fixes.
- **Official Shodh Docker image** — the custom Shodh Dockerfile is now a thin wrapper around the official image with a migration entrypoint for volume permissions. No more manual binary/library management.

### Fixed
- **Non-root container volume paths** — corrected volume mount paths so the server runs correctly as a non-root user inside Docker.
- **Docker security hardening** — containers run with restricted capabilities, read-only root filesystem where possible, and tightened auth token comparison.

## [0.13.0] - 2026-03-08

### Added
- **Home Layout Index** — server now queries the HA template API with Jinja2 functions (`floors()`, `floor_areas()`, `area_entities()`, etc.) at startup (and every 30 min) and injects a compact floor→room→entity map into every system prompt. The LLM knows which floor and room each device belongs to without tool calls or guessing. Fixes cases where the LLM incorrectly assumed spatial location of devices (e.g. radiators on the wrong floor). Gracefully degrades if template API is unavailable (older HA) or floors/areas aren't configured.
- **Server-side TTS** — `POST /api/tts` endpoint backed by OpenAI TTS API (or any compatible endpoint). Returns `audio/mpeg`. Configured via `TTS_PROVIDER`, `TTS_API_KEY`, `TTS_BASE_URL`, `TTS_MODEL`, `TTS_VOICE`. Returns 501 when disabled.
- **Admin conversations endpoint** — `GET /api/admin/conversations` returns all known users and their conversation summaries in one call. Useful for reviewing stored conversations without screenshots. Auth-protected via existing bearer token middleware.
- **Device Capability Index** — server scans all `light.*` entities at startup and builds a per-entity capability cheat sheet injected into every system prompt. The LLM reads exact color control params (e.g. `rgbw_color`, `color_temp_kelvin`, `xy_color`) directly from the cheat sheet rather than re-discovering them via tool calls on each request. This eliminates repeated `search_entities`/`get_entities` calls for known devices and prevents wrong color params on first attempt.
- **`DEVICE_OVERRIDES` env var** — JSON map of per-entity capability overrides for devices whose HA-reported modes don't match their actual wiring (e.g. Gledopto GL-C-008P wired as RGB-only but firmware always reports `color_temp+xy`). Example: `DEVICE_OVERRIDES={"light.gledopto_gl_c_008p": {"whiteMethod": "rgb_white"}}`. See README for details.

### Fixed
- **LLM tool narration** — LLM was outputting "Let me search...", "I found...", "Done!" text between tool calls which got concatenated into messy responses. Added explicit no-narration rule to both chat and voice prompt variants.
- **WLED RGBW white light** — scanner correctly detects `rgbw`/`rgbww` modes and tells the LLM to use `rgbw_color: [0,0,0,255]` (dedicated W channel) even when `color_temp` is also listed — WLED reports it but ignores it.

### App (home-mind-app)
- **Markdown rendering** — assistant messages now render bold, lists, code blocks, headings etc. via `react-markdown` + `@tailwindcss/typography`. User messages stay as plain text.
- **Persistent login** — app auto-configures on first install without showing the setup screen. Set `VITE_DEFAULT_SERVER_URL` (and optionally `VITE_DEFAULT_API_TOKEN`) in `.env.local` before building. Settings are still saved to `localStorage` after first load, so subsequent installs on the same device skip setup entirely.

---

## [0.12.0] - 2026-02-17

### Added
- **Persistent conversation history** — SQLite-backed conversation storage that survives server restarts. Set `CONVERSATION_STORAGE=sqlite` to enable. Max 20 messages per conversation with automatic trimming. In-memory mode remains the default.
- **Memory cleanup job** — runs every 6 hours, removes low-confidence facts and common LLM extraction artifacts (transient states, too-short facts). Pattern-based filtering in `fact-patterns.ts`.

### Removed
- `wiki-drafts/` directory — wiki is now published on GitHub

## [0.11.2] - 2026-02-15

### Fixed
- **Shodh forget endpoint** — `DELETE /api/forget/{memory_id}?user_id=...` instead of `POST /api/forget` which returned 404. Fixes fact deletion, bulk clear, and fact replacement during extraction. Workaround for [shodh-memory#33](https://github.com/varun29ankuS/shodh-memory/issues/33).

## [0.11.1] - 2026-02-14

### Fixed
- **Proactive context crash** — `/api/proactive_context` returns flat memory objects (no `experience` wrapper) unlike other Shodh endpoints. `toFact()` now handles both response shapes.
- **History token overflow** — `get_history` for sensors with frequent state changes (e.g. temperature over 2 days) could return thousands of entries exceeding the 200K token limit. Now strips attributes and downsamples to 200 entries max.

## [0.11.0] - 2026-02-14

### Improved
- **Fact extraction quality** — rewrote extraction prompt with explicit DO NOT rules and bad examples. LLMs previously stored garbage like transient device states ("light is currently red"), assistant actions, and single-event troubleshooting observations. New prompt includes confidence scoring and "if in doubt, return []" rule.
- **Post-extraction filtering** — code-level safety net rejects facts that are too short (<10 chars), contain transient-state patterns ("currently", "right now", "was just"), or have low confidence (<0.5). Skipped facts logged at debug level with `[filter]` prefix.
- **Batch fact storage** — extracted facts are now stored in a single Shodh batch call (`/api/remember/batch`) instead of N individual calls, reducing latency.
- **Proactive context retrieval** — uses Shodh's graph-based spreading activation (`/api/proactive_context`) instead of plain semantic search, so co-accessed memories activate each other.
- **Tag-based fact recall** — `getFacts()` now uses Shodh's `/api/recall/tags` endpoint (filtering by `home-mind` tag) instead of semantic-searching for the literal string "all memories".

### Added
- `confidence` field (0.0–1.0) on extracted facts
- `addFacts()` batch method on `IMemoryStore` interface
- `rememberBatch()`, `recallByTags()`, `getProactiveContext()` methods on `ShodhMemoryClient`

## [0.10.1] - 2026-02-14

### Fixed
- **Single fact deletion after restart** — `DELETE /api/memory/:userId/facts/:factId` returned 404 after server restart because `deleteFact()` relied on an in-memory map to look up userId. Now userId is passed directly from the route parameter, so deletes work reliably regardless of server restarts. Also fixes fact replacement during extraction (the `replaces` field in extracted facts).

## [0.10.0] - 2026-02-14

### Added
- **Ollama provider support** — run Home Mind with local LLMs, no API key needed
  - Set `LLM_PROVIDER=ollama` and `LLM_MODEL=<model>` (e.g., `llama3.1`, `qwen2.5`)
  - Optional `OLLAMA_BASE_URL` for non-default endpoints
  - Reuses the OpenAI-compatible chat engine (Ollama exposes an OpenAI API)
  - `OLLAMA_BASE_URL` passed through Docker Compose for containerized setups
- This completes multi-LLM provider support: Anthropic, OpenAI, and Ollama (GitHub issue #1)

### Fixed
- **White light on RGBW strips** — use `rgbw_color: [0,0,0,255]` (dedicated W channel) instead of `color_temp_kelvin` which WLED doesn't render correctly
- **White light on RGB-only lights** — use `rgb_color: [255,255,255]` for lights that lack a white channel (e.g., Gledopto GL-C-008P). `color_temp_kelvin` is accepted by HA but doesn't work on RGB-only controllers
- **Enriched light tool descriptions** — `call_service` tool now documents `brightness`, `rgb_color`, `color_temp_kelvin`, `hs_color`, and `rgbw_color` fields with usage guidance, so the LLM picks the right color mode (GitHub issue #13)
- **History timezone mismatch** — bare ISO timestamps from the LLM (no timezone suffix) are now normalized with `Z` before passing to HA, preventing empty history results

## [0.9.0] - 2026-02-09

### Added
- **Custom system prompt** — customize AI personality and behavior
  - Server-level default via `CUSTOM_PROMPT` env var
  - Per-request override via `customPrompt` field in chat API payload
  - HA integration options flow for configuring custom prompt in the UI
  - Request-level prompt takes precedence over server-level default

## [0.8.0] - 2026-02-09

### Added
- **CHANGELOG.md** — version history for users tracking updates
- **Auto-generated SHODH_API_KEY** — deploy script now generates the Shodh API key automatically if not set, removing a manual setup step

### Changed
- `SHODH_API_KEY` removed from required env vars in installation docs — users no longer need to generate it manually
- `.env.example` now ships with `SHODH_API_KEY` commented out

## [0.7.0] - 2026-02-08

### Added
- **Multi-LLM provider support** — use OpenAI as an alternative to Anthropic
  - Set `LLM_PROVIDER=openai` and `OPENAI_API_KEY` to switch providers
  - Optional `OPENAI_BASE_URL` for Azure or local proxy endpoints
- Provider-neutral tool system — HA tools work identically across providers

### Changed
- LLM interfaces extracted (`IChatEngine`, `IFactExtractor`) with per-provider implementations
- Factory pattern (`llm/factory.ts`) selects provider at startup based on `LLM_PROVIDER` env var
- Default model updated from Claude Haiku 3.5 to Claude Haiku 4.5

### Fixed
- Empty env vars (from Docker Compose) now correctly treated as undefined for optional config fields

## [0.6.2] - 2026-02-08

### Changed
- Extracted LLM interfaces in preparation for multi-provider support (Phase 1 refactor, no user-facing changes)

## [0.6.0] - 2026-01-31

### Added
- Public release with installation guide and HACS integration
- Docker Compose deployment with health checks
- Shodh port 3030 exposed for direct TUI access
- Comprehensive test suite
- Troubleshooting documentation

### Changed
- Renamed ha-bridge to home-mind-server
- Consolidated to single architecture with Shodh as the only memory backend (removed SQLite fallback)
- Dynamic version reading from package.json

### Fixed
- Shodh container now uses Ubuntu 24.04 (GLIBC 2.38+ requirement)
- ONNX runtime bundled with Shodh to avoid download failures
- Shodh client retry logic and increased timeouts
- Shodh updated to v0.1.75

## [0.5.0] - 2026-01-30

### Changed
- Architecture consolidation — single path through Shodh Memory, no fallback stores
- Renamed ha-bridge to home-mind-server

## [0.4.0] - 2026-01-26

### Added
- Shodh Memory integration for cognitive memory with semantic search
- Comprehensive memory store tests

## [0.3.2] - 2026-01-21

### Added
- Anthropic prompt caching for faster responses (static system prompt cached via `cache_control: ephemeral`)
- Smart fact replacement — new facts automatically supersede conflicting old ones via `replaces` field

## [0.3.1] - 2026-01-21

### Added
- Conversation history for multi-turn voice interactions (in-memory, max 20 messages per conversation)

## [0.3.0] - 2026-01-18

### Changed
- Project renamed to Home Mind

## [0.2.0] - 2026-01-18

### Added
- Voice assistant working via HA Assist (Wyoming protocol)
- Streaming responses (SSE) for faster perceived response times
- Text Assist with live sensor data

### Fixed
- Voice prompt tuned to match quality of web prompt

## [0.1.0] - 2026-01-16

### Added
- Initial HA Bridge API server and HA custom component
- Home Assistant tool calls (`get_state`, `get_entities`, `search_entities`, `call_service`, `get_history`)
- Memory extraction from conversations (fact categories: baseline, preference, identity, device, pattern, correction)
- Sensor history querying
