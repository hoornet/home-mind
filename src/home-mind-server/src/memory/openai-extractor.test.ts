import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

import { OpenAIFactExtractor } from "./openai-extractor.js";
import type { Fact } from "./types.js";

describe("OpenAIFactExtractor", () => {
  let extractor: OpenAIFactExtractor;

  beforeEach(() => {
    extractor = new OpenAIFactExtractor("test-key", "gpt-4o-mini");
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses valid JSON response into ExtractedFact[]", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                content: "User prefers 22°C",
                category: "preference",
                replaces: [],
              },
            ]),
          },
        },
      ],
    });

    const result = await extractor.extract("I prefer 22", "Got it!", []);

    expect(result).toEqual([
      { content: "User prefers 22°C", category: "preference", replaces: [] },
    ]);
  });

  it("filters out facts with invalid categories", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              { content: "Valid", category: "preference", replaces: [] },
              { content: "Invalid", category: "unknown_cat", replaces: [] },
            ]),
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("preference");
  });

  it("accepts all 6 valid categories", async () => {
    const categories = [
      "baseline",
      "preference",
      "identity",
      "device",
      "pattern",
      "correction",
    ];
    const facts = categories.map((c) => ({
      content: `Fact for ${c}`,
      category: c,
      replaces: [],
    }));

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(facts) } }],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toHaveLength(6);
  });

  it("handles replaces field correctly", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                content: "New pref",
                category: "preference",
                replaces: ["old-1", "old-2"],
              },
            ]),
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result[0].replaces).toEqual(["old-1", "old-2"]);
  });

  it("defaults replaces to empty array when not an array", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                content: "A fact",
                category: "preference",
                replaces: "not-an-array",
              },
            ]),
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result[0].replaces).toEqual([]);
  });

  it("passes existing facts to the prompt", async () => {
    const existingFacts: Fact[] = [
      {
        id: "fact-1",
        userId: "user-1",
        content: "Old preference",
        category: "preference",
        confidence: 0.8,
        createdAt: new Date(),
        lastUsed: new Date(),
        useCount: 1,
      },
    ];

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "[]" } }],
    });

    await extractor.extract("msg", "resp", existingFacts);

    const callArgs = mockCreate.mock.calls[0][0];
    const promptContent = callArgs.messages[0].content;
    expect(promptContent).toContain("fact-1");
    expect(promptContent).toContain("Old preference");
  });

  it("returns empty array when API throws", async () => {
    mockCreate.mockRejectedValue(new Error("API error"));

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([]);
  });

  it("strips <think>...</think> reasoning blocks before parsing", async () => {
    const json = JSON.stringify([
      { content: "User has a dog named Rex", category: "identity", replaces: [] },
    ]);
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              "<think>\nThe user mentioned a pet. I should extract that.\n</think>\n" +
              json,
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([
      { content: "User has a dog named Rex", category: "identity", replaces: [] },
    ]);
  });

  it("strips both <think> blocks and markdown fences in the same response", async () => {
    const json = JSON.stringify([
      { content: "Prefers tea", category: "preference", replaces: [] },
    ]);
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              "<think>reasoning here</think>\n```json\n" + json + "\n```",
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([
      { content: "Prefers tea", category: "preference", replaces: [] },
    ]);
  });

  it("returns empty array when content is only whitespace", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "   \n  " } }],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([]);
  });

  it("returns empty array when content is only a <think> block (token cap)", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: "<think>Reasoning got truncated before emitting JSON</think>",
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([]);
  });

  it("strips markdown code fences from JSON response", async () => {
    const json = JSON.stringify([
      { content: "Daughter name is TOTO", category: "identity", replaces: [] },
    ]);
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "```json\n" + json + "\n```" } }],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([
      { content: "Daughter name is TOTO", category: "identity", replaces: [] },
    ]);
  });

  it("returns empty array when response is invalid JSON", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not json at all" } }],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([]);
  });

  it("drops single objects that are not fact-shaped", async () => {
    // {not: "array"} now wraps to [{not: "array"}] but fails the
    // content/category filter — net result is still [].
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"not": "array"}' } }],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([]);
  });

  it("wraps a single fact object in an array (qwen3-style output)", async () => {
    // Some models (e.g. qwen3.6:27b, certain Phi/Gemma variants) emit a single
    // JSON object instead of an array. Strict Array.isArray would drop it.
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: "User's LEGO Bubble passkey is 998877",
              category: "identity",
              replaces: [],
            }),
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([
      {
        content: "User's LEGO Bubble passkey is 998877",
        category: "identity",
        replaces: [],
      },
    ]);
  });

  it("recovers a JSON array even when the model adds trailing text", async () => {
    // Some models append a sentence or a closing bracket after the JSON.
    // Regex fallback grabs the first [ ... ] slice and parses that.
    const json = JSON.stringify([
      { content: "Cat name is Mik", category: "identity", replaces: [] },
    ]);
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: json + "\n\nThat's all I extracted.",
          },
        },
      ],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([
      { content: "Cat name is Mik", category: "identity", replaces: [] },
    ]);
  });

  it("returns empty array when content is null", async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([]);
  });

  it("returns empty array when choices is empty", async () => {
    mockCreate.mockResolvedValue({ choices: [] });

    const result = await extractor.extract("msg", "resp", []);

    expect(result).toEqual([]);
  });

  it("passes baseUrl to OpenAI constructor", () => {
    // Just verifying construction doesn't throw
    const ext = new OpenAIFactExtractor(
      "key",
      "model",
      "https://proxy.example.com"
    );
    expect(ext).toBeDefined();
  });
});
