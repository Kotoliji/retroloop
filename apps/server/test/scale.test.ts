import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { client, join, next, ok, startScaledServer, store, until } from "./helpers";

describe("several server instances behind one Redis", () => {
  it("share rooms: cards, stages and presence cross instances", async () => {
    const [first, second] = await Promise.all([startScaledServer(), startScaledServer()]);
    const retro = await store.createRetro("Scaled team");
    const alice = await client(first);
    const bob = await client(second);
    await join(alice, retro.id, "Alice", { hostKey: retro.hostKey });

    const bobOnline = until(alice, "participants:changed", (list) => list.some((p) => p.name === "Bob" && p.online));
    const bobJoin = await join(bob, retro.id, "Bob");
    await bobOnline;
    expect(bobJoin.snapshot.participants.find((p) => p.name === "Alice")?.online).toBe(true);

    const card = next(bob, "card:upserted");
    ok(await alice.emitWithAck("card:add", { id: randomUUID(), columnId: "went-well", text: "Fast CI" }));
    expect(await card).toMatchObject({ text: null, mine: false }); // still anonymous across instances

    const revealed = next(bob, "retro:cards");
    ok(await alice.emitWithAck("retro:stage", { stage: "group" }));
    expect((await revealed)[0].text).toBe("Fast CI");

    const bobOffline = until(alice, "participants:changed", (list) =>
      list.some((p) => p.name === "Bob" && !p.online),
    );
    bob.disconnect();
    await bobOffline;
  });
});
