import { describe, expect, it } from "vitest";
import { buildTestApp, client, startServer } from "./helpers";

describe("GET /health", () => {
  it("is ok when every dependency answers", async () => {
    const res = await buildTestApp().inject("/health");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", checks: { database: "ok", redis: "ok" } });
  });

  it("is 503 and names the failing dependency", async () => {
    const res = await buildTestApp({
      database: async () => true,
      redis: async () => {
        throw new Error("connection refused");
      },
    }).inject("/health");
    expect(res.statusCode).toBe(503);
    expect(res.json().checks).toEqual({ database: "ok", redis: "down" });
  });

  it("does not wait for a dependency that never answers", async () => {
    const res = await buildTestApp({
      database: () => new Promise<boolean>(() => {}),
      redis: async () => true,
    }).inject("/health");
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.database).toBe("down");
  });
});

describe("retros over HTTP", () => {
  it("creates a retro and finds it by id", async () => {
    const app = buildTestApp();
    const created = await app.inject({ method: "POST", url: "/retros", payload: { teamName: "Platform team" } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect(id).toMatch(/^[A-Za-z0-9_-]{10}$/);

    const found = await app.inject(`/retros/${id}`);
    expect(found.json()).toEqual({ id, title: "Retro 1" });
  });

  it("rejects an empty title and answers 404 for an unknown retro", async () => {
    const app = buildTestApp();
    expect((await app.inject({ method: "POST", url: "/retros", payload: { teamName: "  " } })).statusCode).toBe(400);
    expect((await app.inject("/retros/nope000000")).statusCode).toBe(404);
  });
});

describe("socket handshake", () => {
  it("greets on connect and answers ping with server time", async () => {
    const socket = await client(await startServer());
    const before = Date.now();
    const pong = await socket.timeout(2000).emitWithAck("client:ping");
    expect(pong.serverTime).toBeGreaterThanOrEqual(before);
  });
});
