import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Tests run against a real PostgreSQL: a separate `<db>_test` database next to
 * the development one, migrated before the run. Each test creates its own
 * retro, so tests never see each other's data and nothing needs truncating.
 */
export default function setup(project: TestProject) {
  if (!process.env.DATABASE_URL && existsSync("../../.env")) process.loadEnvFile("../../.env");
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set — run `npm run db:up` and copy .env.example to .env");

  const url = new URL(base);
  url.pathname = `${url.pathname}_test`;
  const databaseUrl = url.toString();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "pipe",
  });
  project.provide("databaseUrl", databaseUrl);
}
