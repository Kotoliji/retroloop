import type { ClientToServerEvents, ServerHello, ServerToClientEvents } from "@retro/shared";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type HealthProbes } from "../src/app";

const up: HealthProbes = { database: async () => true, redis: async () => true };

let close: (() => Promise<unknown>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

function start(probes: HealthProbes = up) {
  const { app } = buildApp({
    webOrigin: "http://localhost:3001",
    probes,
    logger: false,
    probeTimeoutMs: 50,
  });
  close = () => app.close();
  return app;
}

describe("GET /health", () => {
  it("is ok when every dependency answers", async () => {
    const res = await start().inject("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", checks: { database: "ok", redis: "ok" } });
  });

  it("is 503 and names the failing dependency", async () => {
    const res = await start({
      ...up,
      redis: async () => {
        throw new Error("connection refused");
      },
    }).inject("/health");
    expect(res.statusCode).toBe(503);
    expect(res.json().checks).toEqual({ database: "ok", redis: "down" });
  });

  it("does not wait for a dependency that never answers", async () => {
    const res = await start({ ...up, database: () => new Promise<boolean>(() => {}) }).inject("/health");
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.database).toBe("down");
  });
});

describe("socket", () => {
  it("greets on connect and answers ping with server time", async () => {
    const app = start();
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connect(address, {
      transports: ["websocket"],
    });

    try {
      const hello = await new Promise<ServerHello>((resolve) => socket.once("server:hello", resolve));
      expect(hello.protocolVersion).toBe(1);

      const before = Date.now();
      const pong = await socket.timeout(2000).emitWithAck("client:ping");
      expect(pong.serverTime).toBeGreaterThanOrEqual(before);
    } finally {
      socket.disconnect();
    }
  });
});
