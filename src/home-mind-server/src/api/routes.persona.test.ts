import { describe, it, expect } from "vitest";
import { describePersonaSource } from "./routes.js";

describe("describePersonaSource", () => {
  // A custom prompt that appears to do nothing is almost always the other
  // setting winning silently. The effective prompt is otherwise invisible from
  // outside the process, so it has to be stated.
  const HAL = "You are HAL 9000, the calm and precise computer from 2001: A Space Odyssey.";

  it("names the built-in default when nothing is set", () => {
    expect(describePersonaSource(undefined, undefined)).toMatch(/built-in default/i);
  });

  it("names the server config when only CUSTOM_PROMPT is set", () => {
    const line = describePersonaSource(undefined, HAL);
    expect(line).toMatch(/server configuration/i);
    expect(line).toContain("You are HAL 9000");
  });

  it("names the client when only the per-request prompt is set", () => {
    expect(describePersonaSource(HAL, undefined)).toMatch(/client\/integration/i);
  });

  it("WARNS that the server prompt is overridden when both are set", () => {
    const line = describePersonaSource("You are Ava.", HAL);
    expect(line).toMatch(/client\/integration/i);
    expect(line).toMatch(/overridden/i);
    expect(line).toContain("You are Ava.");
    expect(line).not.toContain("HAL 9000");
  });

  it("treats whitespace-only as unset", () => {
    expect(describePersonaSource("   ", undefined)).toMatch(/built-in default/i);
    expect(describePersonaSource("   ", HAL)).toMatch(/server configuration/i);
  });

  it("truncates a long prompt instead of dumping it", () => {
    const long = "You are a very thorough assistant. ".repeat(20);
    const line = describePersonaSource(long, undefined);
    expect(line.length).toBeLessThan(160);
  });
});
