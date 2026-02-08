import { describe, it, expect } from "vitest";
import {
  TOOL_DEFINITIONS,
  toAnthropicTools,
  toOpenAITools,
} from "./tool-definitions.js";

describe("TOOL_DEFINITIONS", () => {
  it("has 5 tools", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(5);
  });

  it("has the expected tool names", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toEqual([
      "get_state",
      "get_entities",
      "search_entities",
      "call_service",
      "get_history",
    ]);
  });

  it("each tool has name, description, and parameters", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.properties).toBeDefined();
      expect(Array.isArray(tool.parameters.required)).toBe(true);
    }
  });
});

describe("toAnthropicTools", () => {
  it("converts to Anthropic format with input_schema", () => {
    const result = toAnthropicTools(TOOL_DEFINITIONS);

    expect(result).toHaveLength(5);
    for (const tool of result) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool.input_schema).toMatchObject({
        type: "object",
      });
      expect(tool.input_schema).toHaveProperty("properties");
      expect(tool.input_schema).toHaveProperty("required");
    }
  });

  it("preserves tool properties and required fields", () => {
    const result = toAnthropicTools(TOOL_DEFINITIONS);
    const getState = result.find((t) => t.name === "get_state")!;

    expect(getState.input_schema.properties).toHaveProperty("entity_id");
    expect(getState.input_schema.required).toEqual(["entity_id"]);
  });
});

describe("toOpenAITools", () => {
  it("wraps in function type", () => {
    const result = toOpenAITools(TOOL_DEFINITIONS);

    expect(result).toHaveLength(5);
    for (const tool of result) {
      expect(tool.type).toBe("function");
      const fn = (tool as any).function;
      expect(fn).toHaveProperty("name");
      expect(fn).toHaveProperty("description");
      expect(fn.parameters).toMatchObject({
        type: "object",
      });
    }
  });

  it("preserves tool parameters structure", () => {
    const result = toOpenAITools(TOOL_DEFINITIONS);
    const callService = result.find(
      (t) => (t as any).function.name === "call_service"
    )!;
    const fn = (callService as any).function;

    expect(fn.parameters).toHaveProperty("properties");
    expect(fn.parameters).toHaveProperty("required");
    expect(fn.parameters.required).toEqual(["domain", "service"]);
  });
});
