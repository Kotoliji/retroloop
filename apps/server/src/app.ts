import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { timingSafeEqual } from "node:crypto";
import { createRetroSchema, retroIdSchema, type HealthStatus } from "@retro/shared";
import Fastify from "fastify";
import { Server, type ServerOptions } from "socket.io";
import type { Analytics } from "./analytics";
import { registerRealtime, type RealtimeServer } from "./realtime";
import type { RetroStore } from "./retro/store";
import type { Prisma } from "./db";
import { collectStats } from "./stats";

export interface HealthProbes {
  database(): Promise<boolean>;
  /** Absent when Redis is not configured. */
  redis?: () => Promise<boolean>;
}

export interface AppOptions {
  webOrigin: string;
  probes: HealthProbes;
  store: RetroStore;
  analytics: Analytics;
  features?: { reminders: boolean };
  /** The Redis adapter when several server instances share the load; omit for one. */
  adapter?: ServerOptions["adapter"];
  logger?: boolean;
  trustProxy?: boolean;
  createLimitPerMinute?: number;
  /** With a token and a database, GET /admin/stats answers to `Bearer <token>`. */
  admin?: { token: string; prisma: Prisma };
  probeTimeoutMs?: number;
}

// A client that is reconnecting queues commands instead of failing them, so a
// probe without a deadline would hang the health check until the dependency returns.
async function probe(check: () => Promise<boolean>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return (await Promise.race([check(), timeout])) ? "ok" : "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

export function buildApp({
  webOrigin,
  probes,
  store,
  analytics,
  features = { reminders: false },
  adapter,
  logger = true,
  trustProxy = false,
  createLimitPerMinute = 10,
  admin,
  probeTimeoutMs = 1000,
}: AppOptions) {
  // Requests are small JSON bodies; anything bigger is not from our client.
  const app = Fastify({ logger, trustProxy, bodyLimit: 16 * 1024 });
  app.register(cors, { origin: webOrigin });
  app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  // Routes live in a plugin registered after rate-limit, so its hooks apply to them.
  app.register(async (api) => {
    api.get("/health", async (_req, reply): Promise<HealthStatus> => {
      const [database, redis] = await Promise.all([
        probe(probes.database, probeTimeoutMs),
        probes.redis ? probe(probes.redis, probeTimeoutMs) : ("off" as const),
      ]);
      const healthy = database === "ok" && redis !== "down";
      reply.code(healthy ? 200 : 503);
      return { status: healthy ? "ok" : "degraded", checks: { database, redis } };
    });

    // Creating a team is the one write anyone can do without joining anything.
    api.post("/retros", { config: { rateLimit: { max: createLimitPerMinute, timeWindow: "1 minute" } } }, async (req, reply) => {
      const body = createRetroSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "invalid" });
      const created = await store.createRetro(body.data.teamName);
      analytics.track("team_created", { retroId: created.id });
      return reply.code(201).send(created);
    });

    // Not there at all unless an operator token is configured.
    if (admin) {
      const expected = Buffer.from(`Bearer ${admin.token}`);
      api.get("/admin/stats", async (req, reply) => {
        const given = Buffer.from(req.headers.authorization ?? "");
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
          return reply.code(401).send({ error: "unauthorized" });
        }
        return collectStats(admin.prisma);
      });
    }

    api.get<{ Params: { id: string } }>("/retros/:id", async (req, reply) => {
      const id = retroIdSchema.safeParse(req.params.id);
      const retro = id.success ? await store.findRetro(id.data) : null;
      return retro ?? reply.code(404).send({ error: "not_found" });
    });
  });

  const io: RealtimeServer = new Server(app.server, {
    cors: { origin: webOrigin },
    maxHttpBufferSize: 16 * 1024,
    ...(adapter ? { adapter } : {}),
  });
  registerRealtime(io, store, analytics, features, app.log);

  app.addHook("onClose", async () => {
    await io.close();
  });

  return { app, io };
}
