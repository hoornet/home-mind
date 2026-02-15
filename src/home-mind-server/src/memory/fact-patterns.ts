/**
 * Shared garbage-detection patterns for fact filtering.
 * Used both at extraction time (tool-handler.ts) and by the periodic cleanup job.
 */

// Patterns that indicate transient state — these should not be stored as long-term facts
export const TRANSIENT_PATTERNS =
  /\b(currently|right now|at the moment|is showing|was just|is displaying|just turned|just set|is now)\b/i;

// Device spec/capability dump patterns — LLM catalogs entity attributes instead of extracting user facts
export const DEVICE_SPEC_PATTERNS =
  /\b(supports?\s+\d+|supports?\s+(rgbw|rgb|color_temp|xy|hs|brightness|on_off)|color.?mode|effect.?list|\d+\+?\s+effects?|firmware|protocol|supported.?features?|supported.?color)\b/i;

// Command-echo patterns — assistant restating what it just did, not a user-stated fact
export const COMMAND_ECHO_PATTERNS =
  /\b(was set to|was changed to|was turned|has been set|has been turned|has been changed)\b/i;

/**
 * Check if a fact's content matches any garbage pattern.
 * Returns the reason string if it's garbage, or null if it's clean.
 */
export function matchesGarbagePattern(content: string, confidence?: number): string | null {
  if (content.length < 10) {
    return "too short (<10 chars)";
  }

  if (TRANSIENT_PATTERNS.test(content)) {
    return "transient state pattern";
  }

  if (DEVICE_SPEC_PATTERNS.test(content)) {
    return "device spec/capability dump";
  }

  if (COMMAND_ECHO_PATTERNS.test(content)) {
    return "command echo (restating action)";
  }

  if (typeof confidence === "number" && confidence < 0.5) {
    return `low confidence (${confidence})`;
  }

  return null;
}

/**
 * Filter out garbage facts. Works with any object that has content and optional confidence.
 * Returns kept facts and skipped facts with reasons.
 */
export function filterFacts<T extends { content: string; confidence?: number }>(
  facts: T[]
): { kept: T[]; skipped: { fact: T; reason: string }[] } {
  const kept: T[] = [];
  const skipped: { fact: T; reason: string }[] = [];

  for (const fact of facts) {
    const reason = matchesGarbagePattern(fact.content, fact.confidence);
    if (reason) {
      skipped.push({ fact, reason });
    } else {
      kept.push(fact);
    }
  }

  return { kept, skipped };
}
