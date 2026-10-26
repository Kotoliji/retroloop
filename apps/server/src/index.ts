import { createClient } from "redis";
import { createAnalytics } from "./analytics";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPrisma } from "./db";
import { createRetroStore } from "./retro/store";

/** Teams with no retro in this many days are deleted, as the privacy page promises. */
const RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const redis = createClient({ url: config.REDIS_URL });
const store = createRetroStore(prisma);
const analytics = createAnalytics(prisma, (err, name) => app.log.warn({ err, name }, "analytics event dropped"));

const { app } = buildApp({
  webOrigin: config.WEB_ORIGIN,
  store,
  analytics,
  probes: {
    database: async () => (await prisma.$queryRaw`SELECT 1`) !== null,
    redis: async () => (await redis.ping()) === "PONG",
  },
});
redis.on("error", (err) => app.log.error({ err }, "redis error"));

async function purge() {
  try {
    const teams = await store.purgeInactiveTeams(RETENTION_DAYS);
    if (teams > 0) app.log.info({ teams }, "deleted inactive teams");
  } catch (err) {
    app.log.error({ err }, "retention purge failed");
  }
}
const retention = setInterval(purge, DAY_MS);

app.addHook("onClose", async () => {
  clearInterval(retention);
  await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await redis.connect();
await app.listen({ port: config.PORT, host: "0.0.0.0" });
void purge();
