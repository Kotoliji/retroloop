import type {
  ClientToServerEvents,
  JoinResult,
  Result,
  ServerToClientEvents,
} from "@retro/shared";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, afterEach, inject } from "vitest";
import { createAnalytics } from "../src/analytics";
import { buildApp, type HealthProbes } from "../src/app";
import { createPrisma } from "../src/db";
import { createRetroStore } from "../src/retro/store";

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export const prisma = createPrisma(inject("databaseUrl"));
export const store = createRetroStore(prisma);
export const analytics = createAnalytics(prisma);
afterAll(() => prisma.$disconnect());

const up: HealthProbes = { database: async () => true, redis: async () => true };
const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((fn) => fn()));
});

export function buildTestApp(probes: HealthProbes = up) {
  const { app } = buildApp({
    webOrigin: "http://localhost:3001",
    probes,
    store,
    analytics,
    logger: false,
    probeTimeoutMs: 50,
  });
  cleanups.push(() => app.close());
  return app;
}

/** Starts a server on a random port and returns its address. */
export async function startServer() {
  return buildTestApp().listen({ port: 0, host: "127.0.0.1" });
}

export async function client(address: string): Promise<Client> {
  const socket: Client = connect(address, { transports: ["websocket"], forceNew: true });
  cleanups.push(async () => socket.disconnect());
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return socket;
}

export function ok<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.data;
}

export async function join(
  socket: Client,
  retroId: string,
  name: string,
  { token, hostKey }: { token?: string; hostKey?: string } = {},
): Promise<JoinResult> {
  return ok(await socket.emitWithAck("retro:join", { retroId, name, token, hostKey }));
}

/** Resolves with the first payload of an event that matches, or rejects after a timeout. */
export function until<E extends keyof ServerToClientEvents>(
  socket: Client,
  event: E,
  matches: (payload: Parameters<ServerToClientEvents[E]>[0]) => boolean,
  timeoutMs = 2000,
) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const listener = ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!matches(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener as never);
      resolve(payload);
    }) as never;
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`no matching "${event}" within ${timeoutMs} ms`));
    }, timeoutMs);
    socket.on(event, listener);
  });
}

/** Resolves with the next payload of an event, or rejects after a timeout. */
export function next<E extends keyof ServerToClientEvents>(socket: Client, event: E, timeoutMs = 2000) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no "${event}" within ${timeoutMs} ms`)), timeoutMs);
    socket.once(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) => {
      clearTimeout(timer);
      resolve(payload);
    }) as never);
  });
}
