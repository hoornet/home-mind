import { z } from "zod";

const configSchema = z.object({
  haUrl: z.string().url(),
  haToken: z.string().min(1),
  haSkipTlsVerify: z.boolean().default(false),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  const config = {
    haUrl: process.env.HA_URL,
    haToken: process.env.HA_TOKEN,
    haSkipTlsVerify: process.env.HA_SKIP_TLS_VERIFY === "true",
    logLevel: process.env.LOG_LEVEL ?? "info",
  };

  const result = configSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}
