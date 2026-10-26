import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildTestApp, client, join, next, ok, prisma, startServer, store, type Client } from "./helpers";

async function setup() {
  const address = await startServer();
  const retro = await store.createRetro("Feedback team");
  const [alice, bob] = await Promise.all([client(address), client(address)]);
  const aliceJoin = await join(alice, retro.id, "Alice", { hostKey: retro.hostKey });
  const bobJoin = await join(bob, retro.id, "Bob");
  return { address, retro, alice, bob, aliceJoin, bobJoin };
}

const wrapUp = async (facilitator: Client) => {
  for (const stage of ["discuss", "done"] as const) ok(await facilitator.emitWithAck("retro:stage", { stage }));
};

/** Analytics are written in the background; wait until the condition holds. */
async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() - started > timeoutMs) return value;
    await new Promise((r) => setTimeout(r, 25));
  }
}

const eventsOf = (retroId: string) =>
  prisma.productEvent.findMany({ where: { retroId }, orderBy: { createdAt: "asc" } });

describe("the end-of-retro survey", () => {
  it("is answered once the retro is wrapped up, and can be changed", async () => {
    const { retro, alice, bob, bobJoin } = await setup();
    const answer = { rating: 5, comment: "Best retro we had", quotable: true };
    expect(await bob.emitWithAck("survey:submit", answer)).toEqual({ ok: false, error: "wrong_stage" });

    await wrapUp(alice);
    expect(ok(await bob.emitWithAck("survey:submit", answer))).toEqual(answer);
    expect(ok(await bob.emitWithAck("survey:submit", { ...answer, rating: 4, comment: "  " }))).toEqual({
      rating: 4,
      comment: null,
      quotable: true,
    });
    expect(await prisma.surveyResponse.count({ where: { retroId: retro.id } })).toBe(1);

    const again = await join(bob, retro.id, "Bob", { token: bobJoin.token });
    expect(again.snapshot.survey).toEqual({ rating: 4, comment: null, quotable: true });
  });

  it("only accepts ratings from 1 to 5", async () => {
    const { alice, bob } = await setup();
    await wrapUp(alice);
    for (const rating of [0, 6, 2.5]) {
      expect(await bob.emitWithAck("survey:submit", { rating, comment: null, quotable: false })).toEqual({
        ok: false,
        error: "invalid",
      });
    }
  });
});

describe("product analytics", () => {
  it("records what happened, never who did it or what they wrote", async () => {
    const created = await buildTestApp().inject({ method: "POST", url: "/retros", payload: { teamName: "Secret Team" } });
    const retro = created.json();
    const address = await startServer();
    const alice = await client(address);
    const aliceJoin = await join(alice, retro.id, "Alice Liddell", { hostKey: retro.hostKey });
    ok(await alice.emitWithAck("card:add", { id: randomUUID(), columnId: "went-well", text: "Confidential text" }));
    await wrapUp(alice);
    ok(await alice.emitWithAck("survey:submit", { rating: 5, comment: "Private comment", quotable: false }));

    // Coming back with the token is not a new participant.
    await join(await client(address), retro.id, "Alice Liddell", { token: aliceJoin.token });

    const events = await eventually(
      () => eventsOf(retro.id),
      (e) => e.some((x) => x.name === "survey_answered"),
    );
    expect(events.map((e) => e.name)).toEqual([
      "team_created",
      "participant_joined",
      "card_added",
      "stage_entered",
      "stage_entered",
      "survey_answered",
    ]);
    const stored = JSON.stringify(events);
    for (const secret of ["Secret Team", "Alice", "Confidential", "Private comment"]) {
      expect(stored).not.toContain(secret);
    }
  });

  it("counts browser-only events from a fixed list", async () => {
    const { retro, alice } = await setup();
    alice.emit("analytics:track", { name: "export_csv" });
    alice.emit("analytics:track", { name: "anything_else" } as never);
    const events = await eventually(
      () => eventsOf(retro.id),
      (e) => e.some((x) => x.name === "export_csv"),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect((await eventsOf(retro.id)).map((e) => e.name)).not.toContain("anything_else");
    expect(events.some((x) => x.name === "export_csv")).toBe(true);
  });
});

describe("deleting data", () => {
  it("lets the facilitator delete a retro, telling everyone in it", async () => {
    const { retro, alice, bob } = await setup();
    ok(await bob.emitWithAck("card:add", { id: randomUUID(), columnId: "went-well", text: "Gone soon" }));
    expect(await bob.emitWithAck("retro:delete", {})).toEqual({ ok: false, error: "forbidden" });

    const told = next(bob, "retro:deleted");
    ok(await alice.emitWithAck("retro:delete", {}));
    await told;
    expect(await prisma.card.count({ where: { retroId: retro.id } })).toBe(0);
    expect(await prisma.participant.count({ where: { retroId: retro.id } })).toBe(0);
    expect(await prisma.team.count({ where: { retros: { none: {} }, name: "Feedback team" } })).toBe(0);
  });

  it("keeps the team when it still has other retros", async () => {
    const { alice } = await setup();
    await wrapUp(alice);
    const second = ok(await alice.emitWithAck("retro:next", {}));
    ok(await alice.emitWithAck("retro:delete", {}));
    const remaining = await prisma.retro.findUnique({ where: { id: second.id } });
    expect(remaining).not.toBeNull();
  });

  it("deletes teams that have had no retro for the retention period", async () => {
    const old = await store.createRetro("Old team");
    const recent = await store.createRetro("Recent team");
    const longAgo = new Date(Date.now() - 400 * 86_400_000);
    await prisma.retro.update({ where: { id: old.id }, data: { createdAt: longAgo } });

    await store.purgeInactiveTeams(365);
    expect(await prisma.retro.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.retro.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});
