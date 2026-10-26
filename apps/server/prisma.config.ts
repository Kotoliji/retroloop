import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // generate does not need a database, so a placeholder keeps install working without .env
    url: process.env.DATABASE_URL ?? "postgresql://retro:retro@localhost:5433/retro",
  },
});
