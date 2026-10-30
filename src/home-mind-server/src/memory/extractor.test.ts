import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

import { FactExtractor } from "./extractor.js";

const factsJson = JSON.stringify([
  { content: "User prefers 22°C", category: "preference", replaces: [] },
]);

describe("FactExtractor", () => {
  let extractor: FactExtractor;

  beforeEach(() => {
    extractor = new FactExtractor("test-key", "claude-haiku-5-5");
    mockCreate.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a reply that is a single text block", async () => {
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: factsJson }] });

    const facts = await extractor.extract("I like 22°C", "Noted.");

    expect(facts).toHaveLength(1);
    expect(facts[0].content).toBe("User prefers 22°C");
  });

  it("reads past a leading thinking block", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: factsJson },
      ],
    });

    const facts = await extractor.extract("I like 22°C", "Noted.");

    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe("preference");
  });

  it("returns no facts when the reply holds no text", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mockCreate.mockResolvedValue({
      content: [{ type: "thinking", thinking: "", signature: "sig" }],
    });

    const facts = await extractor.extract("I like 22°C", "Noted.");

    expect(facts).toEqual([]);
    expect(logged).toHaveBeenCalled();
  });
});
