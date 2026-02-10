import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, buildSystemPromptText } from "./prompts.js";

type TextBlock = Anthropic.TextBlockParam;

describe("buildSystemPrompt (Anthropic)", () => {
  it("returns 2 blocks with default identity when no custom prompt", () => {
    const blocks = buildSystemPrompt(["fact1"]) as TextBlock[];

    expect(blocks).toHaveLength(2);
    // Static block: default identity + instructions, cached
    expect(blocks[0]).toMatchObject({
      type: "text",
      cache_control: { type: "ephemeral" },
    });
    expect(blocks[0].text).toContain("You are a helpful smart home assistant");
    expect(blocks[0].text).toContain("## WHEN TO USE TOOLS");
    // Dynamic block has no cache_control
    expect(blocks[1]).toMatchObject({ type: "text" });
    expect(blocks[1]).not.toHaveProperty("cache_control");
    expect(blocks[1].text).toContain("fact1");
  });

  it("replaces default identity with custom prompt", () => {
    const blocks = buildSystemPrompt(["fact1"], false, "You are Ava.") as TextBlock[];

    expect(blocks).toHaveLength(2);
    // Custom prompt is the identity, followed by instructions
    expect(blocks[0].text).toMatch(/^You are Ava\./);
    expect(blocks[0].text).toContain("## WHEN TO USE TOOLS");
    expect(blocks[0].text).not.toContain("You are a helpful smart home assistant");
    expect(blocks[0]).toHaveProperty("cache_control", { type: "ephemeral" });
    // Dynamic block
    expect(blocks[1].text).toContain("fact1");
  });

  it("uses voice instructions when isVoice is true", () => {
    const blocks = buildSystemPrompt([], true) as TextBlock[];

    expect(blocks[0].text).toContain("You are a helpful smart home voice assistant");
    expect(blocks[0].text).toContain("Keep responses under 2-3 sentences");
  });

  it("uses voice instructions with custom prompt", () => {
    const blocks = buildSystemPrompt([], true, "You are Ava.") as TextBlock[];

    expect(blocks[0].text).toMatch(/^You are Ava\./);
    expect(blocks[0].text).toContain("Keep responses under 2-3 sentences");
    expect(blocks[0].text).not.toContain("You are a helpful smart home voice assistant");
  });

  it("shows 'No memories yet.' when facts are empty", () => {
    const blocks = buildSystemPrompt([]) as TextBlock[];

    const dynamicBlock = blocks[blocks.length - 1];
    expect(dynamicBlock.text).toContain("No memories yet.");
  });
});

describe("buildSystemPromptText (OpenAI)", () => {
  it("returns text with default identity when no custom prompt", () => {
    const text = buildSystemPromptText(["my fact"]);

    expect(text).toContain("You are a helpful smart home assistant");
    expect(text).toContain("## WHEN TO USE TOOLS");
    expect(text).toContain("my fact");
  });

  it("replaces default identity with custom prompt", () => {
    const text = buildSystemPromptText(["my fact"], false, "You are Ava, sarcastic and sharp.");

    expect(text).toMatch(/^You are Ava, sarcastic and sharp\./);
    expect(text).not.toContain("You are a helpful smart home assistant");
    expect(text).toContain("## WHEN TO USE TOOLS");
    expect(text).toContain("my fact");

    // Custom prompt should appear before instructions and dynamic context
    const customIdx = text.indexOf("You are Ava");
    const toolsIdx = text.indexOf("## WHEN TO USE TOOLS");
    const contextIdx = text.indexOf("## Current Context:");

    expect(customIdx).toBeLessThan(toolsIdx);
    expect(toolsIdx).toBeLessThan(contextIdx);
  });

  it("uses voice identity and instructions when isVoice is true", () => {
    const text = buildSystemPromptText([], true);

    expect(text).toContain("You are a helpful smart home voice assistant");
    expect(text).toContain("Keep responses under 2-3 sentences");
  });

  it("shows 'No memories yet.' when facts are empty", () => {
    const text = buildSystemPromptText([]);

    expect(text).toContain("No memories yet.");
  });
});
