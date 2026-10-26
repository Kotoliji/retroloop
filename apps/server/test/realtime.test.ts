import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { client, join, next, ok, startServer, store } from "./helpers";

async function setup() {
  const address = await startServer();
  const retro = await store.createRetro("Sprint 7");
  const [alice, bob] = await Promise.all([client(address), client(address)]);
  return { address, retro, alice, bob };
}

describe("joining a retro", () => {
  it("returns the board and tells others who came online", async () => {
    const { retro, alice, bob } = await setup();
    await join(alice, retro.id, "Alice");

    const seenByAlice = next(alice, "participants:changed");
    const bobJoin = await join(bob, retro.id, "Bob");

    expect(bobJoin.snapshot.retro).toEqual(retro);
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

    const again = await join(await client(address), retro.id, "Alice B.", first.token);
    expect(again.me.id).toBe(first.me.id);
    expect(again.me.name).toBe("Alice B.");
  });

  it("does not accept a token from another retro", async () => {
    const { retro, alice, bob } = await setup();
    const other = await store.createRetro("Other team");
    const elsewhere = await join(alice, other.id, "Alice");

    const here = await join(bob, retro.id, "Alice", elsewhere.token);
    expect(here.me.id).not.toBe(elsewhere.me.id);
  });

  it("marks a participant offline when their last tab closes", async () => {
    const { address, retro, alice, bob } = await setup();
    const { token } = await join(alice, retro.id, "Alice");
    const secondTab = await client(address);
    await join(secondTab, retro.id, "Alice", token);
    await join(bob, retro.id, "Bob");

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

describe("cards", () => {
  it("appear for everyone else in the retro, not in other retros", async () => {
    const { address, retro, alice, bob } = await setup();
    const outsider = await client(address);
    await join(outsider, (await store.createRetro("Other")).id, "Eve");
    await join(alice, retro.id, "Alice");
    await join(bob, retro.id, "Bob");

    const received = next(bob, "card:upserted");
    const leaked = next(outsider, "card:upserted", 300);
    const card = ok(
      await alice.emitWithAck("card:add", { id: randomUUID(), columnId: "went-well", text: "Fast reviews" }),
    );

    expect(await received).toEqual(card);
    await expect(leaked).rejects.toThrow();
  });

  it("are not duplicated when the same add is sent twice", async () => {
    const { retro, alice } = await setup();
    await join(alice, retro.id, "Alice");
    const request = { id: randomUUID(), columnId: "to-improve" as const, text: "Flaky tests" };

    const [first, retry] = await Promise.all([
      alice.emitWithAck("card:add", request),
      alice.emitWithAck("card:add", request),
    ]);
    expect(ok(first)).toEqual(ok(retry));
    expect((await store.snapshot(retro.id))?.cards).toHaveLength(1);
  });

  it("can be edited and deleted only by their author", async () => {
    const { retro, alice, bob } = await setup();
    await join(alice, retro.id, "Alice");
    await join(bob, retro.id, "Bob");
    const card = ok(await alice.emitWithAck("card:add", { id: randomUUID(), columnId: "try-next", text: "Pairing" }));

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

  it("validate input and require joining first", async () => {
    const { retro, alice } = await setup();
    const card = { id: randomUUID(), columnId: "went-well" as const, text: "Hi" };
    expect(await alice.emitWithAck("card:add", card)).toEqual({ ok: false, error: "not_joined" });

    await join(alice, retro.id, "Alice");
    const tooLong = { ...card, text: "x".repeat(501) };
    expect(await alice.emitWithAck("card:add", tooLong)).toEqual({ ok: false, error: "invalid" });
    expect(await alice.emitWithAck("card:add", { ...card, columnId: "nope" as never })).toEqual({
      ok: false,
      error: "invalid",
    });
  });
});
