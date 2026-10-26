import { randomUUID } from "node:crypto";
import type { ColumnId } from "@retro/shared";
import { describe, expect, it } from "vitest";
import { client, join, next, ok, prisma, startServer, store, until, type Client } from "./helpers";

/** A retro with Alice as facilitator (she created it) and Bob as a participant. */
async function setup() {
  const address = await startServer();
  const retro = await store.createRetro("Sprint 7");
  const [alice, bob] = await Promise.all([client(address), client(address)]);
  const aliceJoin = await join(alice, retro.id, "Alice", { hostKey: retro.hostKey });
  const bobJoin = await join(bob, retro.id, "Bob");
  return { address, retro, alice, bob, aliceId: aliceJoin.me.id, bobId: bobJoin.me.id, aliceToken: aliceJoin.token };
}

const addCard = async (socket: Client, text: string, columnId: ColumnId = "went-well") =>
  ok(await socket.emitWithAck("card:add", { id: randomUUID(), columnId, text }));

const setStage = async (socket: Client, stage: "write" | "group" | "vote" | "discuss") =>
  ok(await socket.emitWithAck("retro:stage", { stage }));

describe("joining a retro", () => {
  it("returns the board and tells others who came online", async () => {
    const address = await startServer();
    const retro = await store.createRetro("Sprint 7");
    const [alice, bob] = await Promise.all([client(address), client(address)]);
    await join(alice, retro.id, "Alice");

    const seenByAlice = next(alice, "participants:changed");
    const bobJoin = await join(bob, retro.id, "Bob");

    expect(bobJoin.snapshot.retro).toMatchObject({ id: retro.id, title: "Sprint 7", stage: "write" });
    expect(bobJoin.snapshot.participants.map((p) => [p.name, p.online])).toEqual([
      ["Alice", true],
      ["Bob", true],
    ]);
    expect((await seenByAlice).find((p) => p.name === "Bob")?.online).toBe(true);
  });

  it("brings a participant back as themselves with their token", async () => {
    const { address, retro, alice } = await setup();
    const first = await join(alice, retro.id, "Alice");
    alice.disconnect();

    const again = await join(await client(address), retro.id, "Alice B.", { token: first.token });
    expect(again.me.id).toBe(first.me.id);
    expect(again.me.name).toBe("Alice B.");
  });

  it("does not accept a token from another retro", async () => {
    const { retro, alice, bob } = await setup();
    const other = await store.createRetro("Other team");
    const elsewhere = await join(alice, other.id, "Alice");

    const here = await join(bob, retro.id, "Alice", { token: elsewhere.token });
    expect(here.me.id).not.toBe(elsewhere.me.id);
  });

  it("marks a participant offline when their last tab closes", async () => {
    const { address, retro, alice, bob } = await setup();
    const { token } = await join(alice, retro.id, "Alice");
    const secondTab = await client(address);
    await join(secondTab, retro.id, "Alice", { token });

    alice.disconnect();
    await expect(next(bob, "participants:changed", 300)).rejects.toThrow(); // still online in the other tab

    const update = next(bob, "participants:changed");
    secondTab.disconnect();
    expect((await update).find((p) => p.name === "Alice")?.online).toBe(false);
  });

  it("rejects an unknown retro", async () => {
    const { alice } = await setup();
    const result = await alice.emitWithAck("retro:join", { retroId: "missing000", name: "Alice" });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("facilitator", () => {
  it("is whoever joins with the host key, and only they can run the retro", async () => {
    const { retro, alice, bob, aliceId } = await setup();
    expect((await join(bob, retro.id, "Bob")).snapshot.retro.facilitatorId).toBe(aliceId);

    expect(await bob.emitWithAck("retro:stage", { stage: "group" })).toEqual({ ok: false, error: "forbidden" });
    expect(await bob.emitWithAck("timer:start", { seconds: 60 })).toEqual({ ok: false, error: "forbidden" });

    const seenByBob = until(bob, "retro:meta", (meta) => meta.stage === "group");
    await setStage(alice, "group");
    expect((await seenByBob).stage).toBe("group");
  });

  it("can hand the role over", async () => {
    const { alice, bob, bobId } = await setup();
    ok(await alice.emitWithAck("retro:handover", { participantId: bobId }));
    expect(await alice.emitWithAck("retro:stage", { stage: "group" })).toEqual({ ok: false, error: "forbidden" });
    ok(await bob.emitWithAck("retro:stage", { stage: "group" }));
  });

  it("runs a timer on server time", async () => {
    const { alice, bob } = await setup();
    const started = until(bob, "retro:meta", (meta) => meta.timerEndsAt !== null);
    ok(await alice.emitWithAck("timer:start", { seconds: 300 }));
    expect((await started).timerEndsAt! - Date.now()).toBeGreaterThan(299_000);

    const stopped = until(bob, "retro:meta", (meta) => meta.timerEndsAt === null);
    ok(await alice.emitWithAck("timer:stop", {}));
    expect((await stopped).timerEndsAt).toBeNull();
  });
});

describe("writing cards", () => {
  it("keeps the text from everyone but the author until the cards are revealed", async () => {
    const { alice, bob } = await setup();
    const seenByBob = next(bob, "card:upserted");
    const card = await addCard(alice, "The deploy broke twice");

    expect(card).toMatchObject({ text: "The deploy broke twice", mine: true });
    expect(await seenByBob).toMatchObject({ id: card.id, text: null, mine: false });
    expect(JSON.stringify(await seenByBob)).not.toContain("broke");

    const revealed = next(bob, "retro:cards");
    await setStage(alice, "group");
    expect((await revealed).find((c) => c.id === card.id)?.text).toBe("The deploy broke twice");
  });

  it("does not leak to other retros", async () => {
    const { address, alice } = await setup();
    const outsider = await client(address);
    await join(outsider, (await store.createRetro("Other")).id, "Eve");
    const leaked = next(outsider, "card:upserted", 300);
    await addCard(alice, "Fast reviews");
    await expect(leaked).rejects.toThrow();
  });

  it("are not duplicated when the same add is sent twice", async () => {
    const { retro, alice } = await setup();
    const request = { id: randomUUID(), columnId: "to-improve" as const, text: "Flaky tests" };
    const [first, retry] = await Promise.all([
      alice.emitWithAck("card:add", request),
      alice.emitWithAck("card:add", request),
    ]);
    expect(ok(first)).toEqual(ok(retry));
    expect((await store.board(retro.id))?.cards).toHaveLength(1);
  });

  it("can be edited and deleted only by their author", async () => {
    const { alice, bob } = await setup();
    const card = await addCard(alice, "Pairing");
    await setStage(alice, "group");

    expect(await bob.emitWithAck("card:edit", { id: card.id, text: "Hacked" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await bob.emitWithAck("card:delete", { id: card.id })).toEqual({ ok: false, error: "forbidden" });

    const edited = next(bob, "card:upserted");
    ok(await alice.emitWithAck("card:edit", { id: card.id, text: "Pair on hard tickets" }));
    expect((await edited).text).toBe("Pair on hard tickets");

    const deleted = next(bob, "card:deleted");
    ok(await alice.emitWithAck("card:delete", { id: card.id }));
    expect(await deleted).toEqual({ id: card.id });
  });

  it("are only added in the write stage", async () => {
    const { alice } = await setup();
    await setStage(alice, "group");
    const result = await alice.emitWithAck("card:add", { id: randomUUID(), columnId: "went-well", text: "Late" });
    expect(result).toEqual({ ok: false, error: "wrong_stage" });
  });

  it("validate input and require joining first", async () => {
    const { address, retro } = await setup();
    const stranger = await client(address);
    const card = { id: randomUUID(), columnId: "went-well" as const, text: "Hi" };
    expect(await stranger.emitWithAck("card:add", card)).toEqual({ ok: false, error: "not_joined" });

    await join(stranger, retro.id, "Sam");
    expect(await stranger.emitWithAck("card:add", { ...card, text: "x".repeat(501) })).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await stranger.emitWithAck("card:add", { ...card, columnId: "nope" as never })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});

describe("grouping", () => {
  it("lets anyone group similar cards once they are revealed", async () => {
    const { alice, bob } = await setup();
    const slowCi = await addCard(alice, "CI is slow", "to-improve");
    const waiting = await addCard(bob, "Waiting for builds", "went-well");

    expect(await bob.emitWithAck("card:group", { id: waiting.id, targetId: slowCi.id })).toEqual({
      ok: false,
      error: "wrong_stage",
    });

    await setStage(alice, "group");
    const regrouped = next(alice, "retro:cards");
    ok(await bob.emitWithAck("card:group", { id: waiting.id, targetId: slowCi.id }));
    const moved = (await regrouped).find((c) => c.id === waiting.id);
    expect(moved).toMatchObject({ groupId: slowCi.id, columnId: "to-improve" });
  });

  it("keeps groups one level deep and promotes a member when the lead is deleted", async () => {
    const { retro, alice, bob } = await setup();
    const a = await addCard(alice, "A");
    const b = await addCard(bob, "B");
    const c = await addCard(bob, "C");
    await setStage(alice, "group");

    ok(await bob.emitWithAck("card:group", { id: b.id, targetId: a.id }));
    ok(await bob.emitWithAck("card:group", { id: c.id, targetId: b.id })); // b is a member, so c joins a
    let cards = (await store.board(retro.id))!.cards;
    expect(cards.find((x) => x.id === c.id)?.groupId).toBe(a.id);

    ok(await alice.emitWithAck("card:delete", { id: a.id }));
    cards = (await store.board(retro.id))!.cards;
    expect(cards.find((x) => x.id === b.id)?.groupId).toBeNull();
    expect(cards.find((x) => x.id === c.id)?.groupId).toBe(b.id);
  });
});

describe("voting", () => {
  it("never lets a participant spend more votes than allowed, even in parallel", async () => {
    const { retro, alice, bob, bobId } = await setup();
    const card = await addCard(alice, "Too many meetings");
    await setStage(alice, "group");
    await setStage(alice, "vote");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => bob.emitWithAck("vote:add", { id: card.id })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.error === "no_votes_left")).toHaveLength(7);
    expect(await prisma.vote.count({ where: { retroId: retro.id, participantId: bobId } })).toBe(3);
  });

  it("keeps totals secret until the discuss stage", async () => {
    const { retro, alice, bob, aliceToken } = await setup();
    const card = await addCard(alice, "Unclear priorities");
    await setStage(alice, "group");
    await setStage(alice, "vote");

    expect(ok(await bob.emitWithAck("vote:add", { id: card.id }))).toEqual({ myVotes: 1 });
    expect(ok(await bob.emitWithAck("vote:add", { id: card.id }))).toEqual({ myVotes: 2 });
    expect(ok(await bob.emitWithAck("vote:remove", { id: card.id }))).toEqual({ myVotes: 1 });
    ok(await alice.emitWithAck("vote:add", { id: card.id }));

    const aliceView = (await join(alice, retro.id, "Alice", { token: aliceToken })).snapshot.cards[0];
    expect(aliceView).toMatchObject({ myVotes: 1, votes: null });

    const totals = next(bob, "retro:cards");
    await setStage(alice, "discuss");
    expect((await totals)[0]).toMatchObject({ myVotes: 1, votes: 2 });
  });

  it("only counts votes on the lead card of a group, during the vote stage", async () => {
    const { alice, bob } = await setup();
    const lead = await addCard(alice, "Lead");
    const member = await addCard(bob, "Member");
    expect(await bob.emitWithAck("vote:add", { id: lead.id })).toEqual({ ok: false, error: "wrong_stage" });

    await setStage(alice, "group");
    ok(await bob.emitWithAck("card:group", { id: member.id, targetId: lead.id }));
    await setStage(alice, "vote");
    expect(await bob.emitWithAck("vote:add", { id: member.id })).toEqual({ ok: false, error: "not_found" });
  });

  it("lets the facilitator set the number of votes and pick the topic in focus", async () => {
    const { alice, bob } = await setup();
    const card = await addCard(alice, "Focus me");
    ok(await alice.emitWithAck("retro:votes", { votesPerPerson: 5 }));
    await setStage(alice, "discuss");

    const focused = until(bob, "retro:meta", (meta) => meta.focusCardId !== null);
    ok(await alice.emitWithAck("retro:focus", { cardId: card.id }));
    expect(await focused).toMatchObject({ votesPerPerson: 5, focusCardId: card.id });
  });
});
