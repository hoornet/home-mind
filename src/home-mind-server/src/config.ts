import { z } from "zod";

const ConfigSchema = z
  .object({
    // Server
    port: z.coerce.number().default(3100),
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // LLM
    llmProvider: z.enum(["anthropic", "openai"]).default("anthropic"),
    llmModel: z.string().default("claude-haiku-4-5-20251001"),
    anthropicApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
    openaiBaseUrl: z.string().url().optional(),

    // Home Assistant
    haUrl: z.string().url("HA_URL must be a valid URL"),
    haToken: z.string().min(1, "HA_TOKEN is required"),
    haSkipTlsVerify: z
      .string()
      .transform((v) => v === "true")
      .default("false"),

    // Memory - Shodh (required)
    shodhUrl: z.string().url("SHODH_URL is required"),
    shodhApiKey: z.string().min(1, "SHODH_API_KEY is required"),

    // Memory settings
    memoryTokenLimit: z.coerce.number().default(1500),
  })
  .superRefine((data, ctx) => {
    if (data.llmProvider === "anthropic" && !data.anthropicApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER is anthropic",
        path: ["anthropicApiKey"],
      });
    }
    if (data.llmProvider === "openai" && !data.openaiApiKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY is required when LLM_PROVIDER is openai",
        path: ["openaiApiKey"],
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  // Treat empty strings as undefined for optional fields
  const emptyToUndefined = (v: string | undefined) =>
    v === "" ? undefined : v;

  const result = ConfigSchema.safeParse({
    port: process.env.PORT,
    logLevel: emptyToUndefined(process.env.LOG_LEVEL),
    llmProvider: emptyToUndefined(process.env.LLM_PROVIDER),
    llmModel: emptyToUndefined(process.env.LLM_MODEL),
    anthropicApiKey: emptyToUndefined(process.env.ANTHROPIC_API_KEY),
    openaiApiKey: emptyToUndefined(process.env.OPENAI_API_KEY),
    openaiBaseUrl: emptyToUndefined(process.env.OPENAI_BASE_URL),
    haUrl: process.env.HA_URL,
    haToken: process.env.HA_TOKEN,
    haSkipTlsVerify: process.env.HA_SKIP_TLS_VERIFY,
    shodhUrl: process.env.SHODH_URL,
    shodhApiKey: process.env.SHODH_API_KEY,
    memoryTokenLimit: process.env.MEMORY_TOKEN_LIMIT,
  });

  if (!result.success) {
    console.error("Configuration errors:");
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join(".")}: ${error.message}`);
    }
    process.exit(1);
  }

  return result.data;
}
