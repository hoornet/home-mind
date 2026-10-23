/**
 * Options for the JSON parser in front of the whole API.
 *
 * The parser runs before the token check (index.ts), and the add-on publishes
 * port 3100 on the host, so whatever the parser does to a body, anyone on the
 * network can make it do. Left at its default, body-parser decompresses gzip,
 * deflate and Brotli bodies, which put Node's decoders in front of the token:
 * CVE-2026-111497, a Brotli decoder flaw fixed in Node 22.23.4, was reachable
 * that way with no token at all. The Home Assistant integration posts plain
 * JSON, so `inflate: false` refuses a compressed body with 415 before any
 * decoder sees it.
 */
export const JSON_BODY_OPTIONS = { inflate: false } as const;
