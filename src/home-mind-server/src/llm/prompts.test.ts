import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  buildSystemPromptText,
  STATIC_SYSTEM_PROMPT,
  STATIC_VOICE_PROMPT,
} from "./prompts.js";

type TextBlock = Anthropic.TextBlockParam;

describe("buildSystemPrompt (Anthropic)", () => {
  it("returns 2 blocks without custom prompt", () => {
    const blocks = buildSystemPrompt(["fact1"]) as TextBlock[];

    expect(blocks).toHaveLength(2);
    // Static block has cache_control
    expect(blocks[0]).toMatchObject({
      type: "text",
      text: STATIC_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" },
    });
    // Dynamic block has no cache_control
    expect(blocks[1]).toMatchObject({ type: "text" });
    expect(blocks[1]).not.toHaveProperty("cache_control");
    expect(blocks[1].text).toContain("fact1");
  });

  it("returns 3 blocks with custom prompt", () => {
    const blocks = buildSystemPrompt(["fact1"], false, "You are Ava.") as TextBlock[];

    expect(blocks).toHaveLength(3);
    // Static block (cached)
    expect(blocks[0]).toHaveProperty("cache_control");
    // Custom block (not cached)
    expect(blocks[1].text).toContain("## Custom Instructions:");
    expect(blocks[1].text).toContain("You are Ava.");
    expect(blocks[1]).not.toHaveProperty("cache_control");
    // Dynamic block
    expect(blocks[2].text).toContain("fact1");
  });

  it("uses voice prompt when isVoice is true", () => {
    const blocks = buildSystemPrompt([], true) as TextBlock[];

    expect(blocks[0].text).toBe(STATIC_VOICE_PROMPT);
  });

  it("shows 'No memories yet.' when facts are empty", () => {
    const blocks = buildSystemPrompt([]) as TextBlock[];

    const dynamicBlock = blocks[blocks.length - 1];
    expect(dynamicBlock.text).toContain("No memories yet.");
  });
});

describe("buildSystemPromptText (OpenAI)", () => {
  it("returns text without custom prompt section when not provided", () => {
    const text = buildSystemPromptText(["my fact"]);

    expect(text).toContain(STATIC_SYSTEM_PROMPT);
    expect(text).toContain("my fact");
    expect(text).not.toContain("## Custom Instructions:");
  });

  it("includes custom prompt section between static and dynamic", () => {
    const text = buildSystemPromptText(["my fact"], false, "Be sarcastic.");

    expect(text).toContain("## Custom Instructions:\nBe sarcastic.");
    expect(text).toContain("my fact");

    // Custom instructions should appear after static prompt, before dynamic context
    const customIdx = text.indexOf("## Custom Instructions:");
    const contextIdx = text.indexOf("## Current Context:");
    const staticEnd = text.indexOf(STATIC_SYSTEM_PROMPT) + STATIC_SYSTEM_PROMPT.length;

    expect(customIdx).toBeGreaterThan(staticEnd - 1);
    expect(customIdx).toBeLessThan(contextIdx);
  });

  it("uses voice prompt when isVoice is true", () => {
    const text = buildSystemPromptText([], true);

    expect(text).toContain(STATIC_VOICE_PROMPT);
    expect(text).not.toContain(STATIC_SYSTEM_PROMPT);
  });

  it("shows 'No memories yet.' when facts are empty", () => {
    const text = buildSystemPromptText([]);

    expect(text).toContain("No memories yet.");
  });
});
