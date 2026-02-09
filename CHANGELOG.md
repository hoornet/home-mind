# Changelog

All notable changes to Home Mind are documented here.

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
