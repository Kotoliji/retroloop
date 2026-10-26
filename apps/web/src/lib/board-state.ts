import type { CardView, ColumnId } from "@retro/shared";

/** Inserts or replaces a card, keeping the list in creation order. */
export function upsertCard(cards: CardView[], card: CardView): CardView[] {
  const rest = cards.filter((c) => c.id !== card.id);
  const index = rest.findIndex((c) => c.createdAt > card.createdAt);
  return index === -1 ? [...rest, card] : [...rest.slice(0, index), card, ...rest.slice(index)];
}

export function removeCard(cards: CardView[], id: string): CardView[] {
  return cards.filter((c) => c.id !== id);
}

export function cardsIn(cards: CardView[], columnId: ColumnId): CardView[] {
  return cards.filter((c) => c.columnId === columnId);
}
