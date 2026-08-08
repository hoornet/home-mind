/**
 * Deterministic resolution of a "forget this memory" request to stored facts.
 *
 * The chat model is told to pass the fact's content VERBATIM (it can see the
 * bullets in its own system prompt), so exact matching is the common path.
 * Fuzzy matching exists for the first call in a conversation, where the model
 * may only have the user's paraphrase to work from.
 *
 * Pure functions, no I/O — the tool handler owns fetching and deletion.
 */

import type { Fact } from "./types.js";

/** Best group must score at least this to count as a match at all. */
export const MATCH_THRESHOLD = 0.6;
/** A runner-up within this gap of the best (and above threshold) forces disambiguation. */
export const AMBIGUITY_GAP = 0.15;
/** Below MATCH_THRESHOLD but at/above this, near-misses are offered as suggestions. */
export const SUGGESTION_THRESHOLD = 0.35;
/** Cap on candidates/suggestions returned — more than this overwhelms a spoken reply. */
export const MAX_CANDIDATES = 4;

/**
 * Similarity at which post-turn extraction treats a newly extracted fact as
 * re-learning a memory the user just forgot, and drops it.
 *
 * Deliberately much stricter than MATCH_THRESHOLD. A REPLACEMENT keeps the
 * sentence frame and changes the value — "name is Jure" → "name is HAL 9000"
 * scores 0.73 — and must survive, because forgetting something in order to
 * replace it is the most likely way this feature gets used. A RE-LEARN restates
 * the same claim — "The user's name is Jure" scores 0.91 — and must not.
 */
export const FORGET_FILTER_THRESHOLD = 0.85;

/** Tokens this short carry grammar, not meaning ("the", "is", "my", "a"). */
const FILLER_MAX_LEN = 3;

/** A set of stored facts sharing identical normalized content (duplicates are one memory). */
export interface FactGroup {
  /** Original content of the first fact in the group (display form). */
  content: string;
  /** Normalized content — the confirmation gate's identity for this memory. */
  normalized: string;
  /** Every fact id carrying this content; a commit deletes them all. */
  ids: string[];
}

export type ResolutionResult =
  | { status: "match"; group: FactGroup }
  | { status: "ambiguous"; candidates: FactGroup[] }
  | { status: "none"; suggestions: string[] };

/**
 * Lowercase, strip everything that isn't a letter or number (Unicode-aware, so
 * accented characters survive), collapse runs of whitespace.
 */
export function normalizeFactContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter((t) => t.length > 0));
}

/** Dice coefficient over token sets: 2·|A∩B| / (|A|+|B|). */
function diceScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return (2 * overlap) / (a.size + b.size);
}

/** How alike two fact contents are, 0..1 — the measure resolution uses. */
export function contentSimilarity(a: string, b: string): number {
  const normA = normalizeFactContent(a);
  const normB = normalizeFactContent(b);
  if (normA.length === 0 || normB.length === 0) return 0;
  if (normA === normB) return 1;
  return diceScore(tokenSet(normA), tokenSet(normB));
}

/**
 * Would storing `candidate` re-teach the memory `forgotten` that was just deleted?
 *
 * Similarity alone cannot answer this. "User's canary word is honeybee" scores
 * 0.857 against a forgotten "…is bumblebee", and so does a reworded restatement
 * like "The user's canary word is bumblebee" — the same score, opposite correct
 * answers. What separates them is WHICH words changed: a replacement drops a
 * meaningful word and puts another meaningful word in its place, while a
 * re-learn drops nothing meaningful and at most adds filler.
 *
 * Digits count as meaningful however short, or a swap between "21" and "23"
 * looks like no change at all — and temperatures, times and thresholds are
 * exactly what a home assistant remembers.
 */
export function looksLikeRelearn(candidate: string, forgotten: string): boolean {
  if (contentSimilarity(candidate, forgotten) < FORGET_FILTER_THRESHOLD) return false;
  const cand = tokenSet(normalizeFactContent(candidate));
  const gone = tokenSet(normalizeFactContent(forgotten));
  const meaningful = (t: string) => t.length > FILLER_MAX_LEN || /\d/.test(t);
  const dropped = [...gone].filter((t) => !cand.has(t) && meaningful(t));
  const added = [...cand].filter((t) => !gone.has(t) && meaningful(t));
  if (dropped.length > 0 && added.length > 0) return false; // swapped a value → replacement
  return true;
}

interface ScoredGroup extends FactGroup {
  score: number;
  exact: boolean;
  /** Newest createdAt in the group — deterministic tie-break, newest first. */
  newestCreatedAt: number;
}

/**
 * Resolve a forget request against ALL of a user's facts.
 *
 * Facts with identical normalized content form one group — deleting "the"
 * memory has to delete every duplicate, or the user watches it survive.
 */
export function resolveForgetQuery(query: string, facts: Fact[]): ResolutionResult {
  const normalizedQuery = normalizeFactContent(query);
  if (normalizedQuery.length === 0 || facts.length === 0) {
    return { status: "none", suggestions: [] };
  }
  const queryTokens = tokenSet(normalizedQuery);

  const groups = new Map<string, ScoredGroup>();
  for (const fact of facts) {
    const normalized = normalizeFactContent(fact.content);
    if (normalized.length === 0) continue;
    const createdAt =
      fact.createdAt instanceof Date ? fact.createdAt.getTime() : new Date(fact.createdAt).getTime();
    const existing = groups.get(normalized);
    if (existing) {
      existing.ids.push(fact.id);
      existing.newestCreatedAt = Math.max(existing.newestCreatedAt, createdAt || 0);
    } else {
      const exact = normalized === normalizedQuery;
      groups.set(normalized, {
        content: fact.content,
        normalized,
        ids: [fact.id],
        score: exact ? 1 : diceScore(queryTokens, tokenSet(normalized)),
        exact,
        newestCreatedAt: createdAt || 0,
      });
    }
  }

  const ranked = [...groups.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.newestCreatedAt - a.newestCreatedAt ||
      (a.ids[0] < b.ids[0] ? -1 : a.ids[0] > b.ids[0] ? 1 : 0)
  );
  if (ranked.length === 0) return { status: "none", suggestions: [] };

  const strip = ({ content, normalized, ids }: ScoredGroup): FactGroup => ({ content, normalized, ids });

  // An exact normalized match wins outright, wherever it landed in the ranking.
  // Another group with the same token set (different word order) also scores
  // 1.0, and if it happens to be newer it would otherwise win the tie-break and
  // drag a verbatim confirmation into disambiguation — which never resolves,
  // because the model keeps sending the same exact text.
  const exactGroup = ranked.find((g) => g.exact);
  if (exactGroup) return { status: "match", group: strip(exactGroup) };

  const best = ranked[0];
  if (best.score >= MATCH_THRESHOLD) {
    const rivals = ranked
      .slice(1)
      .filter((g) => g.score >= MATCH_THRESHOLD && best.score - g.score < AMBIGUITY_GAP);
    if (rivals.length > 0) {
      return {
        status: "ambiguous",
        candidates: [best, ...rivals].slice(0, MAX_CANDIDATES).map(strip),
      };
    }
    return { status: "match", group: strip(best) };
  }

  return {
    status: "none",
    suggestions: ranked
      .filter((g) => g.score >= SUGGESTION_THRESHOLD)
      .slice(0, MAX_CANDIDATES)
      .map((g) => g.content),
  };
}
