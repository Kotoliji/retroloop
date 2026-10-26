import cors from "@fastify/cors";
import {
  PROTOCOL_VERSION,
  type ClientToServerEvents,
  type HealthStatus,
  type ServerToClientEvents,
} from "@retro/shared";
import Fastify from "fastify";
import { Server } from "socket.io";

export interface HealthProbes {
  database(): Promise<boolean>;
  redis(): Promise<boolean>;
}

export interface AppOptions {
  webOrigin: string;
  probes: HealthProbes;
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

export function buildApp({ webOrigin, probes, logger = true, probeTimeoutMs = 1000 }: AppOptions) {
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

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: { origin: webOrigin },
  });

  io.on("connection", (socket) => {
    socket.emit("server:hello", { protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() });
    socket.on("client:ping", (ack) => ack({ serverTime: Date.now() }));
  });

  app.addHook("onClose", async () => {
    await io.close();
  });

  return { app, io };
}
