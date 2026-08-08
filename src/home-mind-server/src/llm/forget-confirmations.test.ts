import { describe, it, expect, beforeEach } from "vitest";
import {
  isConfirmed,
  recordPreview,
  pendingIdentities,
  clearIdentity,
  clearConversation,
} from "./forget-confirmations.js";

describe("forget confirmations", () => {
  const conv = "conv-1";
  const other = "conv-2";
  const FACT = "user s test canary word is bumblebee";

  beforeEach(() => {
    clearConversation(conv);
    clearConversation(other);
  });

  it("confirms in a LATER turn after a recorded preview", () => {
    recordPreview(conv, FACT, "turn-1");
    expect(isConfirmed(conv, FACT, "turn-2")).toBe(true);
  });

  it("does NOT confirm in the same turn the preview was recorded", () => {
    recordPreview(conv, FACT, "turn-1");
    expect(isConfirmed(conv, FACT, "turn-1")).toBe(false);
  });

  it("does NOT confirm without a prior preview", () => {
    expect(isConfirmed(conv, FACT, "turn-2")).toBe(false);
  });

  it("is single-use — confirming consumes the preview", () => {
    recordPreview(conv, FACT, "turn-1");
    expect(isConfirmed(conv, FACT, "turn-2")).toBe(true);
    expect(isConfirmed(conv, FACT, "turn-3")).toBe(false);
  });

  it("does NOT confirm a DIFFERENT memory than the one previewed", () => {
    recordPreview(conv, FACT, "turn-1");
    expect(isConfirmed(conv, "user s name is alex", "turn-2")).toBe(false);
  });

  it("keeps several memories pending at once, each independently confirmable", () => {
    recordPreview(conv, "fact one", "turn-1");
    recordPreview(conv, "fact two", "turn-1");
    expect(isConfirmed(conv, "fact one", "turn-2")).toBe(true);
    expect(isConfirmed(conv, "fact two", "turn-2")).toBe(true);
  });

  it("does not leak across conversations", () => {
    recordPreview(conv, FACT, "turn-1");
    expect(isConfirmed(other, FACT, "turn-2")).toBe(false);
  });

  it("reports pending identities and lets one be cleared", () => {
    recordPreview(conv, "fact one", "turn-1");
    recordPreview(conv, "fact two", "turn-1");
    expect(pendingIdentities(conv).sort()).toEqual(["fact one", "fact two"]);

    clearIdentity(conv, "fact one");
    expect(pendingIdentities(conv)).toEqual(["fact two"]);
    expect(isConfirmed(conv, "fact one", "turn-2")).toBe(false);
  });

  it("reports no pending identities for an untouched conversation", () => {
    expect(pendingIdentities(other)).toEqual([]);
  });
});
