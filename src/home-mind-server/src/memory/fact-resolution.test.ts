import { describe, it, expect } from "vitest";
import {
  normalizeFactContent,
  resolveForgetQuery,
  contentSimilarity,
  looksLikeRelearn,
  MATCH_THRESHOLD,
  SUGGESTION_THRESHOLD,
  FORGET_FILTER_THRESHOLD,
} from "./fact-resolution.js";
import type { Fact } from "./types.js";

function makeFact(id: string, content: string, createdAt = "2026-01-01T00:00:00Z"): Fact {
  return {
    id,
    userId: "user-1",
    content,
    category: "preference",
    confidence: 1,
    createdAt: new Date(createdAt),
    lastUsed: new Date(createdAt),
    useCount: 0,
  };
}

describe("normalizeFactContent", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeFactContent("  User's  name is —  Alex!  ")).toBe("user s name is alex");
  });

  it("preserves Unicode letters and diacritics", () => {
    expect(normalizeFactContent("Otroška soba je Živina soba")).toBe("otroška soba je živina soba");
  });

  it("keeps numbers", () => {
    expect(normalizeFactContent("prefers 21°C at night")).toBe("prefers 21 c at night");
  });
});

describe("resolveForgetQuery", () => {
  const canary = makeFact("f-word", "User's test canary word is bumblebee");
  const temperature = makeFact("f-temp", "User prefers bedroom temperature at 20°C");

  it("matches on exact content", () => {
    const result = resolveForgetQuery("User's test canary word is bumblebee", [canary, temperature]);
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids).toEqual(["f-word"]);
  });

  it("matches despite case, punctuation and whitespace differences", () => {
    const result = resolveForgetQuery("users  test CANARY word is bumblebee!!", [canary]);
    expect(result.status).toBe("match");
  });

  it("matches a paraphrase above the threshold", () => {
    const name = makeFact("f-name", "User's name is Alex");
    const result = resolveForgetQuery("my name is Alex", [name, temperature]);
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids).toEqual(["f-name"]);
  });

  it("returns ambiguous when two facts score close and above threshold", () => {
    const bedroom = makeFact("f-bed", "User prefers the bedroom at 20 degrees");
    const bathroom = makeFact("f-bath", "User prefers the bathroom at 20 degrees");
    const result = resolveForgetQuery("user prefers at 20 degrees", [bedroom, bathroom]);
    expect(result.status).toBe("ambiguous");
  });

  it("an exact match wins even against an equal-scoring reordered rival", () => {
    // Same token set, different word order, and NEWER — so it would win the
    // tie-break and drag a verbatim confirmation into disambiguation, which
    // never resolves because the model keeps sending the same exact text.
    const exact = makeFact("f-exact", "User likes tea and coffee", "2026-01-01T00:00:00Z");
    const reordered = makeFact("f-reorder", "User likes coffee and tea", "2026-02-01T00:00:00Z");
    const result = resolveForgetQuery("User likes tea and coffee", [reordered, exact]);
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids).toEqual(["f-exact"]);
  });

  it("returns none with suggestions in the near-miss band", () => {
    const result = resolveForgetQuery("my test canary word thing", [canary, temperature]);
    expect(result.status).toBe("none");
    if (result.status === "none") {
      expect(result.suggestions).toContain("User's test canary word is bumblebee");
    }
  });

  it("returns none without suggestions when nothing comes close", () => {
    const result = resolveForgetQuery("the weather in Ljubljana", [canary, temperature]);
    expect(result.status).toBe("none");
    if (result.status === "none") expect(result.suggestions).toEqual([]);
  });

  it("groups duplicate contents into one candidate carrying all ids", () => {
    const dupe1 = makeFact("f-1", "User's name is Alex");
    const dupe2 = makeFact("f-2", "user's name is alex  ");
    const result = resolveForgetQuery("User's name is Alex", [dupe1, dupe2]);
    expect(result.status).toBe("match");
    if (result.status === "match") expect(result.group.ids.sort()).toEqual(["f-1", "f-2"]);
  });

  it("returns none for an empty query or empty fact list", () => {
    expect(resolveForgetQuery("", [canary]).status).toBe("none");
    expect(resolveForgetQuery("anything", []).status).toBe("none");
  });

  it("exports sane threshold constants", () => {
    expect(MATCH_THRESHOLD).toBeGreaterThan(SUGGESTION_THRESHOLD);
    expect(FORGET_FILTER_THRESHOLD).toBeGreaterThan(MATCH_THRESHOLD);
  });
});

describe("looksLikeRelearn — what the extraction filter actually asks", () => {
  const CANARY = "User's test canary word is bumblebee";

  it("flags a verbatim re-learn", () => {
    expect(looksLikeRelearn(CANARY, CANARY)).toBe(true);
  });

  it("flags a reworded restatement", () => {
    expect(looksLikeRelearn("The user's canary word is bumblebee", CANARY)).toBe(true);
  });

  it("flags a restatement that only drops a word", () => {
    expect(looksLikeRelearn("User's canary word is bumblebee", CANARY)).toBe(true);
  });

  it("does NOT flag a one-word value swap — these score identically to a restatement", () => {
    // Both this and the reworded restatement above score ~0.857, which is why
    // similarity alone can never separate them.
    expect(looksLikeRelearn("User's test canary word is honeybee", CANARY)).toBe(false);
  });

  it("does NOT flag a multi-token replacement", () => {
    expect(looksLikeRelearn("User's name is HAL 9000", "User's name is Alex")).toBe(false);
  });

  it("does NOT flag numeric value swaps — the values a home assistant actually stores", () => {
    const swaps: [string, string][] = [
      ["User prefers the bedroom temperature at night to be 23", "User prefers the bedroom temperature at night to be 21"],
      ["User usually goes to bed at 23 00 on weeknights", "User usually goes to bed at 22 00 on weeknights"],
      ["User considers NOx above 150 ppm high for their home", "User considers NOx above 100 ppm high for their home"],
    ];
    for (const [replacement, forgotten] of swaps) {
      expect(contentSimilarity(replacement, forgotten)).toBeGreaterThanOrEqual(FORGET_FILTER_THRESHOLD);
      expect(looksLikeRelearn(replacement, forgotten)).toBe(false);
    }
  });

  it("still flags a restatement carrying the SAME number", () => {
    expect(
      looksLikeRelearn(
        "The user prefers the bedroom temperature at night to be 21",
        "User prefers the bedroom temperature at night to be 21"
      )
    ).toBe(true);
  });

  it("does NOT flag an unrelated fact", () => {
    expect(looksLikeRelearn("User prefers the bedroom at 20 degrees", CANARY)).toBe(false);
  });
});
