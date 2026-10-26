import type { CardView } from "@retro/shared";
import { describe, expect, it } from "vitest";
import { cardsIn, groupCards, rankGroups, removeCard, upsertCard, votesUsed } from "./board-state";

const card = (id: string, createdAt: string, extra: Partial<CardView> = {}): CardView => ({
  id,
  columnId: "went-well",
  text: id,
  mine: false,
  groupId: null,
  createdAt,
  myVotes: 0,
  votes: null,
  ...extra,
});

describe("upsertCard", () => {
  it("keeps cards in creation order even when they arrive out of order", () => {
    let cards = upsertCard([], card("b", "2026-01-01T00:00:02Z"));
    cards = upsertCard(cards, card("a", "2026-01-01T00:00:01Z"));
    cards = upsertCard(cards, card("c", "2026-01-01T00:00:03Z"));
    expect(cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("replaces a card with the same id instead of adding it twice", () => {
    const optimistic = card("a", "2026-01-01T00:00:01.500Z");
    const confirmed = card("a", "2026-01-01T00:00:01Z");
    const cards = upsertCard(upsertCard([optimistic], card("b", "2026-01-01T00:00:00Z")), confirmed);
    expect(cards.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("removeCard / cardsIn", () => {
  it("removes by id and filters by column", () => {
    const cards = [card("a", "1"), card("b", "2", { columnId: "try-next" })];
    expect(removeCard(cards, "a").map((c) => c.id)).toEqual(["b"]);
    expect(cardsIn(cards, "try-next").map((c) => c.id)).toEqual(["b"]);
  });
});

describe("groups", () => {
  const cards = [
    card("a", "1", { votes: 1, myVotes: 1 }),
    card("b", "2", { groupId: "a" }),
    card("c", "3", { votes: 4, myVotes: 2 }),
    card("d", "4", { votes: 1 }),
  ];

  it("nests members under their lead card", () => {
    expect(groupCards(cards).map((g) => [g.lead.id, g.members.map((m) => m.id)])).toEqual([
      ["a", ["b"]],
      ["c", []],
      ["d", []],
    ]);
  });

  it("ranks by votes, keeping creation order on ties", () => {
    expect(rankGroups(cards).map((g) => g.lead.id)).toEqual(["c", "a", "d"]);
  });

  it("counts the viewer's spent votes", () => {
    expect(votesUsed(cards)).toBe(3);
  });
});
