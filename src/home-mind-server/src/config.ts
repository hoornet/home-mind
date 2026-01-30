import { z } from "zod";

const ConfigSchema = z.object({
  // Server
  port: z.coerce.number().default(3100),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Anthropic
  anthropicApiKey: z.string().min(1, "ANTHROPIC_API_KEY is required"),

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
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
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
