import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BASE_ENV = {
  HA_URL: "http://localhost:8123",
  HA_TOKEN: "test-token",
  SHODH_URL: "http://localhost:3030",
  SHODH_API_KEY: "test-shodh-key",
  ANTHROPIC_API_KEY: "test-anthropic-key",
} as const;

describe("loadConfig", () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    // Clear all relevant env vars
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.HA_URL;
    delete process.env.HA_TOKEN;
    delete process.env.HA_SKIP_TLS_VERIFY;
    delete process.env.SHODH_URL;
    delete process.env.SHODH_API_KEY;
    delete process.env.MEMORY_TOKEN_LIMIT;

    vi.resetModules();
  });

  afterEach(() => {
    process.env = savedEnv;
    vi.restoreAllMocks();
  });

  async function loadConfigFresh() {
    const mod = await import("./config.js");
    return mod.loadConfig();
  }

  it("loads with valid base config and defaults", async () => {
    Object.assign(process.env, BASE_ENV);

    const config = await loadConfigFresh();

    expect(config.port).toBe(3100);
    expect(config.logLevel).toBe("info");
    expect(config.llmProvider).toBe("anthropic");
    expect(config.llmModel).toBe("claude-haiku-4-5-20251001");
    expect(config.haUrl).toBe("http://localhost:8123");
    expect(config.haToken).toBe("test-token");
    expect(config.shodhUrl).toBe("http://localhost:3030");
    expect(config.shodhApiKey).toBe("test-shodh-key");
    expect(config.memoryTokenLimit).toBe(1500);
  });

  it("requires ANTHROPIC_API_KEY when provider is anthropic", async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.ANTHROPIC_API_KEY;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => { throw new Error("exit"); });

    await expect(loadConfigFresh()).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("requires OPENAI_API_KEY when provider is openai", async () => {
    Object.assign(process.env, BASE_ENV);
    process.env.LLM_PROVIDER = "openai";
    delete process.env.ANTHROPIC_API_KEY;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => { throw new Error("exit"); });

    await expect(loadConfigFresh()).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("accepts openai provider with OPENAI_API_KEY", async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.ANTHROPIC_API_KEY;
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";

    const config = await loadConfigFresh();

    expect(config.llmProvider).toBe("openai");
    expect(config.openaiApiKey).toBe("test-openai-key");
  });

  it("treats empty strings as undefined for optional fields", async () => {
    Object.assign(process.env, BASE_ENV);
    process.env.LLM_PROVIDER = "";
    process.env.LLM_MODEL = "";
    process.env.OPENAI_API_KEY = "";
    process.env.OPENAI_BASE_URL = "";
    process.env.LOG_LEVEL = "";

    const config = await loadConfigFresh();

    // Empty LLM_PROVIDER falls back to default "anthropic"
    expect(config.llmProvider).toBe("anthropic");
    // Empty LLM_MODEL falls back to default
    expect(config.llmModel).toBe("claude-haiku-4-5-20251001");
    // Empty optional fields become undefined
    expect(config.openaiApiKey).toBeUndefined();
    expect(config.openaiBaseUrl).toBeUndefined();
    expect(config.logLevel).toBe("info");
  });

  it("exits when HA_URL is missing", async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.HA_URL;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => { throw new Error("exit"); });

    await expect(loadConfigFresh()).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when HA_TOKEN is missing", async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.HA_TOKEN;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => { throw new Error("exit"); });

    await expect(loadConfigFresh()).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when SHODH_URL is missing", async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.SHODH_URL;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => { throw new Error("exit"); });

    await expect(loadConfigFresh()).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("exits when SHODH_API_KEY is missing", async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.SHODH_API_KEY;

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => { throw new Error("exit"); });

    await expect(loadConfigFresh()).rejects.toThrow("exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("accepts custom port", async () => {
    Object.assign(process.env, BASE_ENV);
    process.env.PORT = "4000";

    const config = await loadConfigFresh();

    expect(config.port).toBe(4000);
  });

  it("accepts OPENAI_BASE_URL when valid", async () => {
    Object.assign(process.env, BASE_ENV);
    delete process.env.ANTHROPIC_API_KEY;
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_BASE_URL = "https://my-proxy.example.com/v1";

    const config = await loadConfigFresh();

    expect(config.openaiBaseUrl).toBe("https://my-proxy.example.com/v1");
  });
});
