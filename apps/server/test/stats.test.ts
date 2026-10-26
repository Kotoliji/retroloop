import type { AdminStats } from "@retro/shared";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { ADMIN_TOKEN, analytics, buildTestApp, client, join, ok, startServer, store } from "./helpers";

const auth = { authorization: `Bearer ${ADMIN_TOKEN}` };

async function stats(): Promise<AdminStats> {
  const res = await buildTestApp().inject({ url: "/admin/stats", headers: auth });
  expect(res.statusCode).toBe(200);
  return res.json();
}

describe("GET /admin/stats", () => {
  it("does not exist without an operator token, and needs the right one", async () => {
    const { app } = buildApp({
      webOrigin: "http://localhost:3001",
      probes: { database: async () => true, redis: async () => true },
      store,
      analytics,
      logger: false,
    });
    expect((await app.inject({ url: "/admin/stats", headers: auth })).statusCode).toBe(404);
    await app.close();

    const res = await buildTestApp().inject({ url: "/admin/stats", headers: { authorization: "Bearer nope" } });
    expect(res.statusCode).toBe(401);
  });

  it("counts finished retros and shows quotable comments without names", async () => {
    const before = await stats();
    const retro = await store.createRetro("Stats team");
    const alice = await client(await startServer());
    await join(alice, retro.id, "Alice Secret", { hostKey: retro.hostKey });
    for (const stage of ["discuss", "done"] as const) ok(await alice.emitWithAck("retro:stage", { stage }));
    const comment = `Loved the follow-through ${Date.now()}`;
    ok(await alice.emitWithAck("survey:submit", { rating: 5, comment, quotable: true }));
    await new Promise((r) => setTimeout(r, 200)); // events are written in the background

    const after = await stats();
    expect(after.funnel.completed).toBeGreaterThanOrEqual(before.funnel.completed + 1);
    expect(after.funnel.reachedDiscussion).toBeGreaterThanOrEqual(before.funnel.reachedDiscussion + 1);
    expect(after.survey.distribution[4]).toBeGreaterThanOrEqual(before.survey.distribution[4] + 1);
    expect(after.survey.quotes.some((q) => q.comment === comment && q.rating === 5)).toBe(true);
    expect(JSON.stringify(after)).not.toContain("Alice Secret");
  });
});
