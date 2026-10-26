import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import { createAnalytics } from "./analytics";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPrisma } from "./db";
import { createSmtpMailer, sendDueReminders } from "./reminders";
import { createRetroStore } from "./retro/store";

/** Teams with no retro in this many days are deleted, as the privacy page promises. */
const RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;
const REMINDER_CHECK_MS = 10 * 60_000;

const config = loadConfig();
const prisma = createPrisma(config.DATABASE_URL);
const redis = createClient({ url: config.REDIS_URL });
// Socket.IO needs a second connection: a subscribed Redis client can do nothing else.
const subscriber = redis.duplicate();
await Promise.all([redis.connect(), subscriber.connect()]);
const store = createRetroStore(prisma);
const mailer = config.SMTP_URL ? createSmtpMailer(config.SMTP_URL, config.SMTP_FROM) : null;
const analytics = createAnalytics(prisma, (err, name) => app.log.warn({ err, name }, "analytics event dropped"));

const { app } = buildApp({
  webOrigin: config.WEB_ORIGIN,
  trustProxy: config.TRUST_PROXY,
  createLimitPerMinute: config.CREATE_LIMIT_PER_MINUTE,
  admin: config.ADMIN_TOKEN ? { token: config.ADMIN_TOKEN, prisma } : undefined,
  store,
  analytics,
  features: { reminders: mailer !== null },
  // Broadcasts and presence work across every instance connected to this Redis.
  adapter: createAdapter(redis, subscriber),
  probes: {
    database: async () => (await prisma.$queryRaw`SELECT 1`) !== null,
    redis: async () => (await redis.ping()) === "PONG",
  },
});
for (const client of [redis, subscriber]) client.on("error", (err) => app.log.error({ err }, "redis error"));

async function purge() {
  try {
    const teams = await store.purgeInactiveTeams(RETENTION_DAYS);
    if (teams > 0) app.log.info({ teams }, "deleted inactive teams");
  } catch (err) {
    app.log.error({ err }, "retention purge failed");
  }
}
const retention = setInterval(purge, DAY_MS);

async function remind() {
  if (!mailer) return;
  try {
    const sent = await sendDueReminders(prisma, mailer, config.WEB_ORIGIN, new Date(), (err) =>
      app.log.warn({ err }, "reminder not sent; will retry"),
    );
    if (sent > 0) app.log.info({ sent }, "sent action item reminders");
  } catch (err) {
    app.log.error({ err }, "reminder run failed");
  }
}
const reminders = setInterval(remind, REMINDER_CHECK_MS);

app.addHook("onClose", async () => {
  clearInterval(retention);
  clearInterval(reminders);
  await Promise.allSettled([prisma.$disconnect(), redis.quit(), subscriber.quit()]);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close().then(() => process.exit(0)));
}

await app.listen({ port: config.PORT, host: "0.0.0.0" });
void purge();
void remind();
