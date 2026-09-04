/**
 * Token accounting for one model call.
 *
 * The output cap covers everything the model emits, and on a reasoning model
 * that includes the thinking nobody ever sees. A turn can therefore spend its
 * entire budget and return an empty string, which is indistinguishable from a
 * prompt being too large unless we look at the numbers.
 *
 * Streamed calls report no usage at all unless `stream_options.include_usage`
 * is set on the request, so this is only ever as good as that flag.
 */

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  /** Hidden reasoning tokens, when the provider reports them. */
  reasoningTokens?: number;
}

/** A number, or undefined for anything that is not one (providers vary). */
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Read a usage object into our shape. Deliberately tolerant: every
 * OpenAI-compatible endpoint spells this slightly differently, and a missing
 * field must degrade to "unknown" rather than to a confident zero. Reporting
 * zero reasoning tokens when the provider simply did not say would send the
 * diagnosis in exactly the wrong direction.
 */
export function readUsage(raw: unknown): TokenUsage | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const u = raw as Record<string, unknown>;

  const details = (
    typeof u.completion_tokens_details === "object" && u.completion_tokens_details !== null
      ? u.completion_tokens_details
      : {}
  ) as Record<string, unknown>;

  // OpenAI-compatible endpoints say prompt/completion; Anthropic says
  // input/output for the same two numbers. Anthropic reports no separate
  // reasoning count, so that field stays undefined there, which is correct:
  // "unreported" is a different fact from "zero".
  const usage: TokenUsage = {
    promptTokens: num(u.prompt_tokens) ?? num(u.input_tokens),
    completionTokens: num(u.completion_tokens) ?? num(u.output_tokens),
    reasoningTokens: num(details.reasoning_tokens),
  };

  const known = Object.values(usage).some((v) => v !== undefined);
  return known ? usage : undefined;
}

/** One log-line fragment. Says "unavailable" rather than inventing zeroes. */
export function describeUsage(usage: TokenUsage | undefined): string {
  if (!usage) return "usage=unavailable";
  const parts: string[] = [];
  if (usage.promptTokens !== undefined) parts.push(`prompt=${usage.promptTokens}`);
  if (usage.completionTokens !== undefined) parts.push(`completion=${usage.completionTokens}`);
  parts.push(
    usage.reasoningTokens !== undefined
      ? `reasoning=${usage.reasoningTokens}`
      : "reasoning=unreported"
  );
  return parts.join(" ");
}

/**
 * True when the model demonstrably spent this turn thinking rather than
 * writing. Requires a positive reported count: an unreported figure is not
 * evidence of absence, and guessing here produces advice the user cannot act on.
 */
export function spentBudgetOnReasoning(usage: TokenUsage | undefined): boolean {
  return usage?.reasoningTokens !== undefined && usage.reasoningTokens > 0;
}

/**
 * Default ceilings on one reply, shared by both engines.
 *
 * Spoken answers stay short because they are read out loud. Written answers
 * get 8192 because this budget is shared with reasoning nobody sees, and
 * reasoning grows with the prompt: measured on a real house, an analytical
 * question across a dozen sensors built an 81k-token prompt and the model then
 * spent its entire allowance thinking, writing not one visible word. A ceiling
 * is not a reservation, so a 300-token reply still costs 300; raising this only
 * changes what happens to the answers that would otherwise be cut off.
 */
export const WRITTEN_OUTPUT_CAP = 8192;
export const VOICE_OUTPUT_CAP = 500;

/**
 * Appended when a reply stopped because it ran out of room. A plain sentence,
 * not a code or a bracketed tag: it is read by whoever asked, part way through
 * an answer. The integration returns text whenever there is any, so a
 * structured error would never reach them in this case.
 */
export const TRUNCATION_NOTICE =
  "\n\n(I ran out of room before finishing that. Ask me about a shorter " +
  "period or fewer sensors at a time, or raise the maximum answer length " +
  "in the Home Mind settings.)";

/** The spoken version, kept to one short sentence because it is read aloud. */
export const VOICE_TRUNCATION_NOTICE = " Sorry, I ran out of room there.";
