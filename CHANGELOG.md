# Changelog

All notable changes to Home Mind are documented here.

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
