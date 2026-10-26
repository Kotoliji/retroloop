import cors from "@fastify/cors";
import { createRetroSchema, retroIdSchema, type HealthStatus } from "@retro/shared";
import Fastify from "fastify";
import { Server } from "socket.io";
import { registerRealtime, type RealtimeServer } from "./realtime";
import type { RetroStore } from "./retro/store";

export interface HealthProbes {
  database(): Promise<boolean>;
  redis(): Promise<boolean>;
}

export interface AppOptions {
  webOrigin: string;
  probes: HealthProbes;
  store: RetroStore;
  logger?: boolean;
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

export function buildApp({ webOrigin, probes, store, logger = true, probeTimeoutMs = 1000 }: AppOptions) {
  const app = Fastify({ logger });
  app.register(cors, { origin: webOrigin });

  app.get("/health", async (_req, reply): Promise<HealthStatus> => {
    const [database, redis] = await Promise.all([
      probe(probes.database, probeTimeoutMs),
      probe(probes.redis, probeTimeoutMs),
    ]);
    const healthy = database === "ok" && redis === "ok";
    reply.code(healthy ? 200 : 503);
    return { status: healthy ? "ok" : "degraded", checks: { database, redis } };
  });

  app.post("/retros", async (req, reply) => {
    const body = createRetroSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid" });
    return reply.code(201).send(await store.createRetro(body.data.teamName));
  });

  app.get<{ Params: { id: string } }>("/retros/:id", async (req, reply) => {
    const id = retroIdSchema.safeParse(req.params.id);
    const retro = id.success ? await store.findRetro(id.data) : null;
    return retro ?? reply.code(404).send({ error: "not_found" });
  });

  const io: RealtimeServer = new Server(app.server, { cors: { origin: webOrigin } });
  registerRealtime(io, store, app.log);

  app.addHook("onClose", async () => {
    await io.close();
  });

  return { app, io };
}
