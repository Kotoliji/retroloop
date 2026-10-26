import type { CardView } from "@retro/shared";
import { describe, expect, it } from "vitest";
import { cardsIn, removeCard, upsertCard } from "./board-state";

const card = (id: string, createdAt: string, text = id): CardView => ({
  id,
  columnId: "went-well",
  text,
  authorId: "a",
  createdAt,
});

describe("upsertCard", () => {
  it("keeps cards in creation order even when they arrive out of order", () => {
    let cards = upsertCard([], card("b", "2026-01-01T00:00:02Z"));
    cards = upsertCard(cards, card("a", "2026-01-01T00:00:01Z"));
    cards = upsertCard(cards, card("c", "2026-01-01T00:00:03Z"));
    expect(cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("replaces a card with the same id instead of adding it twice", () => {
    const optimistic = card("a", "2026-01-01T00:00:01.500Z", "draft");
    const confirmed = card("a", "2026-01-01T00:00:01Z", "draft");
    const cards = upsertCard(upsertCard([optimistic], card("b", "2026-01-01T00:00:00Z")), confirmed);
    expect(cards.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("removeCard / cardsIn", () => {
  it("removes by id and filters by column", () => {
    const cards = [card("a", "1"), { ...card("b", "2"), columnId: "try-next" as const }];
    expect(removeCard(cards, "a").map((c) => c.id)).toEqual(["b"]);
    expect(cardsIn(cards, "try-next").map((c) => c.id)).toEqual(["b"]);
  });
});
