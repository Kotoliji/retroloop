import { randomUUID } from "node:crypto";
import type { CreatedRetro } from "@retro/shared";
import { describe, expect, it } from "vitest";
import { client, join, ok, startServer, store, until, type Client } from "./helpers";

const nextWeek = () => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const address = await startServer();
  const retro = await store.createRetro("Platform team");
  const [alice, bob] = await Promise.all([client(address), client(address)]);
  await join(alice, retro.id, "Alice", { hostKey: retro.hostKey });
  await join(bob, retro.id, "Bob");
  return { address, retro, alice, bob };
}

const stage = async (socket: Client, to: "review" | "write" | "group" | "vote" | "discuss" | "done") =>
  ok(await socket.emitWithAck("retro:stage", { stage: to }));

const action = (text: string, ownerName = "Bob") => ({ id: randomUUID(), text, ownerName, dueDate: nextWeek() });

describe("action items", () => {
  it("are agreed in the discuss stage and reach everyone", async () => {
    const { alice, bob } = await setup();
    expect(await bob.emitWithAck("action:add", action("Fix flaky tests"))).toEqual({
      ok: false,
      error: "wrong_stage",
    });

    await stage(alice, "discuss");
    const seen = until(alice, "actions:changed", ({ actions }) => actions.length === 1);
    const item = action("Fix flaky tests");
    ok(await bob.emitWithAck("action:add", item));
    expect((await seen).actions[0]).toMatchObject({
      id: item.id,
      text: "Fix flaky tests",
      ownerName: "Bob",
      dueDate: item.dueDate,
      status: "open",
      fromThisRetro: true,
    });
  });

  it("need an owner and a real due date", async () => {
    const { alice, bob } = await setup();
    await stage(alice, "discuss");
    for (const bad of [
      { ...action("No owner"), ownerName: "  " },
      { ...action("No date"), dueDate: "" },
      { ...action("Bad date"), dueDate: "2026-02-31" },
    ]) {
      expect(await bob.emitWithAck("action:add", bad)).toEqual({ ok: false, error: "invalid" });
    }
  });

  it("are capped at three per retro, even when added in parallel", async () => {
    const { retro, alice, bob } = await setup();
    await stage(alice, "discuss");
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => (i % 2 ? alice : bob).emitWithAck("action:add", action(`Item ${i}`))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.error === "too_many_actions")).toHaveLength(3);
    const full = (await store.getRetro(retro.id))!;
    expect(await store.actions(full)).toHaveLength(3);
  });

  it("are not stored twice when the same add is resent", async () => {
    const { retro, alice } = await setup();
    await stage(alice, "discuss");
    const item = action("Once");
    await Promise.all([alice.emitWithAck("action:add", item), alice.emitWithAck("action:add", item)]);
    expect(await store.actions((await store.getRetro(retro.id))!)).toHaveLength(1);
  });

  it("can be edited and removed while the retro is open", async () => {
    const { retro, alice, bob } = await setup();
    await stage(alice, "discuss");
    const item = action("Draft");
    ok(await bob.emitWithAck("action:add", item));
    ok(await alice.emitWithAck("action:edit", { ...item, text: "Final", ownerName: "Alice" }));
    expect((await store.actions((await store.getRetro(retro.id))!))[0]).toMatchObject({
      text: "Final",
      ownerName: "Alice",
    });
    ok(await alice.emitWithAck("action:delete", { id: item.id }));
    expect(await store.actions((await store.getRetro(retro.id))!)).toHaveLength(0);
  });
});

describe("a team's next retro", () => {
  async function finishWith(alice: Client, ...texts: string[]) {
    await stage(alice, "discuss");
    for (const text of texts) ok(await alice.emitWithAck("action:add", action(text)));
    await stage(alice, "done");
    return ok(await alice.emitWithAck("retro:next", {}));
  }

  it("is started by the facilitator and announced to everyone", async () => {
    const { alice, bob } = await setup();
    expect(await bob.emitWithAck("retro:next", {})).toEqual({ ok: false, error: "forbidden" });

    const announced = until(bob, "retro:meta", (meta) => meta.nextRetroId !== null);
    const next = await finishWith(alice);
    expect((await announced).nextRetroId).toBe(next.id);
    expect(next.title).toBe("Retro 2");
  });

  it("opens with a review of open items, and skips it when there are none", async () => {
    const { address, alice } = await setup();
    const next = await finishWith(alice, "Fix flaky tests", "Write the on-call runbook");

    const facilitator = await client(address);
    const joined = await join(facilitator, next.id, "Alice", { hostKey: next.hostKey });
    expect(joined.snapshot.retro).toMatchObject({ number: 2, stage: "review", hasReview: true });
    expect(joined.snapshot.actions.map((a) => [a.text, a.fromThisRetro])).toEqual([
      ["Fix flaky tests", false],
      ["Write the on-call runbook", false],
    ]);

    const empty = await finishWith(await joinedFacilitatorOf(address, await store.createRetro("Other")));
    const other = await client(address);
    expect((await join(other, empty.id, "Sam", { hostKey: empty.hostKey })).snapshot.retro).toMatchObject({
      stage: "write",
      hasReview: false,
    });
    expect(await other.emitWithAck("retro:stage", { stage: "review" })).toEqual({
      ok: false,
      error: "wrong_stage",
    });
  });

  it("tracks what got done and keeps unfinished items coming back", async () => {
    const { address, alice } = await setup();
    const second = await finishWith(alice, "Done thing", "Carried thing", "Dropped thing");
    const facilitator = await client(address);
    const { snapshot } = await join(facilitator, second.id, "Alice", { hostKey: second.hostKey });
    const [done, carried, dropped] = snapshot.actions;
    const newDate = nextWeek();

    expect(snapshot.actions.every((a) => !a.reviewedHere)).toBe(true);
    ok(await facilitator.emitWithAck("action:review", { id: done.id, status: "done" }));
    ok(await facilitator.emitWithAck("action:review", { id: carried.id, status: "open", dueDate: newDate }));
    ok(await facilitator.emitWithAck("action:review", { id: dropped.id, status: "dropped" }));

    // Reviewed items stay listed in the retro that reviewed them.
    const secondRow = (await store.getRetro(second.id))!;
    expect((await store.actions(secondRow)).map((a) => a.status)).toEqual(["done", "open", "dropped"]);
    expect(await store.stats(secondRow)).toEqual({ done: 1, total: 3 });

    await stage(facilitator, "write");
    expect(await facilitator.emitWithAck("action:review", { id: done.id, status: "open" })).toEqual({
      ok: false,
      error: "wrong_stage",
    });

    // Only the still-open item comes back in the third retro.
    const third = await finishWith(facilitator);
    const thirdRow = (await store.getRetro(third.id))!;
    const back = await store.actions(thirdRow);
    expect(back.map((a) => a.text)).toEqual(["Carried thing"]);
    expect(back[0].dueDate.toISOString().slice(0, 10)).toBe(newDate);
    expect(thirdRow).toMatchObject({ number: 3, stage: "review" });
  });

  it("is the same retro when asked for twice, with a fresh host key", async () => {
    const { alice } = await setup();
    const first = await finishWith(alice);
    const again = ok(await alice.emitWithAck("retro:next", {}));
    expect(again.id).toBe(first.id);
    expect(again.hostKey).not.toBe(first.hostKey);
  });
});

async function joinedFacilitatorOf(address: string, retro: CreatedRetro) {
  const socket = await client(address);
  await join(socket, retro.id, "Sam", { hostKey: retro.hostKey });
  return socket;
}
