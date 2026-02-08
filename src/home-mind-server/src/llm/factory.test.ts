import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Config } from "../config.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IFactExtractor } from "./interface.js";
import type { HomeAssistantClient } from "../ha/client.js";

const LLMClientSpy = vi.fn();
const OpenAIChatEngineSpy = vi.fn();
const FactExtractorSpy = vi.fn();
const OpenAIFactExtractorSpy = vi.fn();

vi.mock("./client.js", () => ({
  LLMClient: class {
    constructor(...args: unknown[]) {
      LLMClientSpy(...args);
    }
  },
}));

vi.mock("./openai-client.js", () => ({
  OpenAIChatEngine: class {
    constructor(...args: unknown[]) {
      OpenAIChatEngineSpy(...args);
    }
  },
}));

vi.mock("../memory/extractor.js", () => ({
  FactExtractor: class {
    constructor(...args: unknown[]) {
      FactExtractorSpy(...args);
    }
  },
}));

vi.mock("../memory/openai-extractor.js", () => ({
  OpenAIFactExtractor: class {
    constructor(...args: unknown[]) {
      OpenAIFactExtractorSpy(...args);
    }
  },
}));

import { createChatEngine, createFactExtractor } from "./factory.js";
import { LLMClient } from "./client.js";
import { OpenAIChatEngine } from "./openai-client.js";
import { FactExtractor } from "../memory/extractor.js";
import { OpenAIFactExtractor } from "../memory/openai-extractor.js";

describe("createChatEngine", () => {
  const mockMemory = {} as IMemoryStore;
  const mockExtractor = {} as IFactExtractor;
  const mockHa = {} as HomeAssistantClient;

  beforeEach(() => {
    LLMClientSpy.mockClear();
    OpenAIChatEngineSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns LLMClient for anthropic provider", () => {
    const config = { llmProvider: "anthropic" } as Config;

    const engine = createChatEngine(config, mockMemory, mockExtractor, mockHa);

    expect(engine).toBeInstanceOf(LLMClient);
    expect(LLMClientSpy).toHaveBeenCalledWith(
      config,
      mockMemory,
      mockExtractor,
      mockHa
    );
  });

  it("returns OpenAIChatEngine for openai provider", () => {
    const config = { llmProvider: "openai" } as Config;

    const engine = createChatEngine(config, mockMemory, mockExtractor, mockHa);

    expect(engine).toBeInstanceOf(OpenAIChatEngine);
    expect(OpenAIChatEngineSpy).toHaveBeenCalledWith(
      config,
      mockMemory,
      mockExtractor,
      mockHa
    );
  });
});

describe("createFactExtractor", () => {
  beforeEach(() => {
    FactExtractorSpy.mockClear();
    OpenAIFactExtractorSpy.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns FactExtractor for anthropic provider", () => {
    const config = {
      llmProvider: "anthropic",
      anthropicApiKey: "ant-key",
      llmModel: "claude-haiku-4-5-20251001",
    } as Config;

    const extractor = createFactExtractor(config);

    expect(extractor).toBeInstanceOf(FactExtractor);
    expect(FactExtractorSpy).toHaveBeenCalledWith(
      "ant-key",
      "claude-haiku-4-5-20251001"
    );
  });

  it("returns OpenAIFactExtractor for openai provider", () => {
    const config = {
      llmProvider: "openai",
      openaiApiKey: "oai-key",
      llmModel: "gpt-4o-mini",
      openaiBaseUrl: "https://proxy.example.com",
    } as Config;

    const extractor = createFactExtractor(config);

    expect(extractor).toBeInstanceOf(OpenAIFactExtractor);
    expect(OpenAIFactExtractorSpy).toHaveBeenCalledWith(
      "oai-key",
      "gpt-4o-mini",
      "https://proxy.example.com"
    );
  });

  it("passes undefined baseUrl when not set", () => {
    const config = {
      llmProvider: "openai",
      openaiApiKey: "oai-key",
      llmModel: "gpt-4o-mini",
    } as Config;

    createFactExtractor(config);

    expect(OpenAIFactExtractorSpy).toHaveBeenCalledWith(
      "oai-key",
      "gpt-4o-mini",
      undefined
    );
  });
});
