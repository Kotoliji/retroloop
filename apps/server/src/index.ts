import { createClient } from "redis";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPrisma } from "./db";
import { createRetroStore } from "./retro/store";

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const redis = createClient({ url: config.REDIS_URL });
redis.on("error", (err) => app.log.error({ err }, "redis error"));

const { app } = buildApp({
  webOrigin: config.WEB_ORIGIN,
  store: createRetroStore(prisma),
  probes: {
    database: async () => (await prisma.$queryRaw`SELECT 1`) !== null,
    redis: async () => (await redis.ping()) === "PONG",
  },
});

app.addHook("onClose", async () => {
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await redis.connect();
await app.listen({ port: config.PORT, host: "0.0.0.0" });
