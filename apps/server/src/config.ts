import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WEB_ORIGIN: z.string().url(),
  /** Behind a reverse proxy, trust X-Forwarded-For so rate limits see real client IPs. */
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
