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
 * Memory meta-facts — facts about the conversation rather than about the user's home.
 *
 * Most of these are tombstones left by a forget: the content is deleted, then the
 * extractor reads the same turn ("forget that my canary word is bumblebee" / "Forgotten.")
 * and stores a memory *about* the forgetting — "User no longer wants their canary word
 * remembered", "User confirmed deletion of the bedroom cooling automation". Harmless
 * individually, but they accumulate, they are recalled and read back to the user, and
 * a memory asserting that something is not remembered is its own small absurdity.
 *
 * Deliberately narrow, for two reasons: this list is also applied retroactively by
 * MemoryCleanupJob, so a loose pattern deletes real memories on every install; and a
 * legitimate fact can be phrased in the same shape. "User asked me to remember that
 * 100 ppm is normal" must survive — hence the positive verbs (remember/retain/store)
 * only count when explicitly negated, and "asked … to" only counts with a delete verb.
 */
export const MEMORY_META_PATTERNS = new RegExp(
  [
    // "asked me to forget X", "requested deletion of Y", "told the assistant to remove Z"
    String.raw`\b(?:asked|told|requested|instructed)\b[^.]{0,60}\b(?:forget|delete|remove|erase)\b`,
    // "…not to retain…", "no longer wants X remembered", "stop remembering…"
    String.raw`\b(?:not|never|no longer|stop)\b[^.]{0,60}\b(?:remember(?:ed|ing|s)?|retain(?:ed|ing|s)?|forgotten)\b`,
    // "confirmed deletion of…", "confirms the removal of…"
    String.raw`\bconfirm(?:ed|s)?\b[^.]{0,20}\b(?:deletion|removal)\b`,
    // "deleted the memory…", "forgot the fact…"
    String.raw`\b(?:deleted|removed|forgot|erased)\b[^.]{0,20}\b(?:memor(?:y|ies)|facts?)\b`,
  ].join("|"),
  "i"
);

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

  if (MEMORY_META_PATTERNS.test(content)) {
    return "memory meta-fact (about forgetting, not about the home)";
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
