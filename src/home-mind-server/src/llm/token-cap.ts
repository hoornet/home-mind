/**
 * Output-token cap, negotiated rather than guessed.
 *
 * OpenAI's newer models (GPT-5 family, o-series) reject `max_tokens` outright:
 *
 *   400 Unsupported parameter: 'max_tokens' is not supported with this model.
 *       Use 'max_completion_tokens' instead.
 *
 * Home Mind is deliberately model-agnostic, and every other OpenAI-compatible
 * endpoint it supports still wants `max_tokens` — Ollama, LM Studio, llama.cpp,
 * Azure, and the various gateways people put in front of them. So we cannot
 * simply switch spellings, and we deliberately do NOT sniff the model name: the
 * same model takes different parameters depending on who is serving it (a
 * gateway that normalises requests will happily accept `max_tokens` for a model
 * that rejects it upstream), and a name list would need editing every time
 * OpenAI ships a model.
 *
 * Instead: send `max_tokens`, and if the endpoint tells us it wants the other
 * spelling, send it again the other way and remember the answer for the rest of
 * the process. The probe costs one round-trip per model, only ever on the first
 * call, and it is a 400 — no tokens are billed for it. Endpoints that work today
 * see no change at all, which matters most for local models, where we cannot
 * test every server people run.
 *
 * Retrying is safe for streaming calls because the 400 arrives on the initial
 * request, before any chunk has been produced or forwarded to the caller.
 */

/** Models known — from their own error response — to need `max_completion_tokens`. */
const needsMaxCompletionTokens = new Set<string>();

export type TokenCapParam =
  | { max_tokens: number }
  | { max_completion_tokens: number };

/**
 * True when the error is an endpoint telling us `max_tokens` is the wrong
 * spelling. Kept narrow on purpose: a generic 400 (bad model name, malformed
 * tool schema) must fall through and surface to the user unchanged.
 */
export function isMaxTokensUnsupported(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const err = error as { status?: number; param?: string; code?: string; message?: string };
  if (err.status !== 400) return false;
  if (err.param === "max_tokens" && err.code === "unsupported_parameter") return true;
  // Servers that proxy OpenAI often keep the message but drop the structured
  // fields, so fall back to the one phrase that is unambiguous.
  return typeof err.message === "string" && err.message.includes("max_completion_tokens");
}

/**
 * Run `send` with whichever output-cap parameter this model accepts, learning
 * the answer from the endpoint on first use.
 */
export async function withTokenCap<T>(
  model: string,
  maxTokens: number,
  send: (cap: TokenCapParam) => Promise<T>
): Promise<T> {
  if (needsMaxCompletionTokens.has(model)) {
    return send({ max_completion_tokens: maxTokens });
  }

  try {
    return await send({ max_tokens: maxTokens });
  } catch (error) {
    if (!isMaxTokensUnsupported(error)) throw error;
    needsMaxCompletionTokens.add(model);
    console.info(
      `[llm] ${model} rejects max_tokens; using max_completion_tokens for this model from now on.`
    );
    return send({ max_completion_tokens: maxTokens });
  }
}

/** Test seam — the learned set is process-global by design. */
export function resetTokenCapCache(): void {
  needsMaxCompletionTokens.clear();
}
