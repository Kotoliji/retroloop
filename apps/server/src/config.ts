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
  /** Enables GET /admin/stats for whoever sends it as a bearer token. */
  ADMIN_TOKEN: z.preprocess((v) => v || undefined, z.string().min(24).optional()),
  /** New teams per minute from one address; raised only for load tests. */
  CREATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** e.g. smtp://user:pass@smtp.example.com:587 — without it, e-mail reminders are off. */
  SMTP_URL: z.preprocess((v) => v || undefined, z.string().url().optional()),
  SMTP_FROM: z.preprocess((v) => v || undefined, z.string().default("Retroloop <no-reply@localhost>")),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
