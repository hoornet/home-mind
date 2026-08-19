import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  withTokenCap,
  isMaxTokensUnsupported,
  resetTokenCapCache,
} from "./token-cap.js";

/** The shape the OpenAI SDK throws for GPT-5 / o-series when sent `max_tokens`. */
function unsupportedParamError() {
  return Object.assign(
    new Error(
      "400 Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."
    ),
    {
      status: 400,
      param: "max_tokens",
      code: "unsupported_parameter",
      type: "invalid_request_error",
    }
  );
}

describe("isMaxTokensUnsupported", () => {
  it("recognises the structured OpenAI rejection", () => {
    expect(isMaxTokensUnsupported(unsupportedParamError())).toBe(true);
  });

  it("recognises a proxy that keeps the message but drops the fields", () => {
    const err = Object.assign(new Error("Use 'max_completion_tokens' instead."), {
      status: 400,
    });
    expect(isMaxTokensUnsupported(err)).toBe(true);
  });

  it("ignores unrelated 400s so they surface to the user", () => {
    const err = Object.assign(new Error("model not found"), {
      status: 400,
      code: "model_not_found",
    });
    expect(isMaxTokensUnsupported(err)).toBe(false);
  });

  it("ignores non-400 failures", () => {
    const err = Object.assign(new Error("rate limited"), {
      status: 429,
      param: "max_tokens",
      code: "unsupported_parameter",
    });
    expect(isMaxTokensUnsupported(err)).toBe(false);
  });

  it("ignores non-objects", () => {
    expect(isMaxTokensUnsupported("boom")).toBe(false);
    expect(isMaxTokensUnsupported(null)).toBe(false);
  });
});

describe("withTokenCap", () => {
  beforeEach(() => {
    resetTokenCapCache();
  });

  it("sends max_tokens and does not retry when the endpoint accepts it", async () => {
    const send = vi.fn().mockResolvedValue("ok");

    await expect(withTokenCap("gpt-4o-mini", 2048, send)).resolves.toBe("ok");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ max_tokens: 2048 });
  });

  it("retries with max_completion_tokens when the model rejects max_tokens", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(unsupportedParamError())
      .mockResolvedValueOnce("ok");

    await expect(withTokenCap("gpt-5.6", 2048, send)).resolves.toBe("ok");

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, { max_tokens: 2048 });
    expect(send).toHaveBeenNthCalledWith(2, { max_completion_tokens: 2048 });
  });

  it("remembers the answer, so only the first call pays the extra round-trip", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(unsupportedParamError())
      .mockResolvedValue("ok");

    await withTokenCap("gpt-5.6", 500, send);
    send.mockClear();
    await withTokenCap("gpt-5.6", 500, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ max_completion_tokens: 500 });
  });

  it("learns per model, not globally", async () => {
    const rejecting = vi
      .fn()
      .mockRejectedValueOnce(unsupportedParamError())
      .mockResolvedValue("ok");
    await withTokenCap("gpt-5.6", 500, rejecting);

    const other = vi.fn().mockResolvedValue("ok");
    await withTokenCap("openai/gpt-5.6-luna", 500, other);

    expect(other).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledWith({ max_tokens: 500 });
  });

  it("propagates unrelated errors without a retry", async () => {
    const err = Object.assign(new Error("model not found"), { status: 400 });
    const send = vi.fn().mockRejectedValue(err);

    await expect(withTokenCap("nope", 500, send)).rejects.toThrow("model not found");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not loop when the retry itself fails", async () => {
    const send = vi.fn().mockRejectedValue(unsupportedParamError());

    await expect(withTokenCap("gpt-5.6", 500, send)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
