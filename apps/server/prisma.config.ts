import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// The CLI does not read .env by itself; the app keeps one at the repo root.
if (!process.env.DATABASE_URL && existsSync("../../.env")) process.loadEnvFile("../../.env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // generate does not need a database, so a placeholder keeps install working without .env
    url: process.env.DATABASE_URL ?? "postgresql://retro:retro@127.0.0.1:5433/retro",
  },
});
