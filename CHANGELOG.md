# Changelog

All notable changes to Home Mind are documented here.

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
