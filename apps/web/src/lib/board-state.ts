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

export interface CardGroup {
  lead: CardView;
  members: CardView[];
}

/** Top-level cards with the cards grouped under them, in creation order. */
export function groupCards(cards: CardView[]): CardGroup[] {
  const members = new Map<string, CardView[]>();
  for (const card of cards) {
    if (card.groupId) members.set(card.groupId, [...(members.get(card.groupId) ?? []), card]);
  }
  return cards.filter((c) => !c.groupId).map((lead) => ({ lead, members: members.get(lead.id) ?? [] }));
}

/** Groups for the discuss stage: most votes first, ties in creation order. */
export function rankGroups(cards: CardView[]): CardGroup[] {
  return groupCards(cards)
    .map((group, index) => ({ group, index }))
    .sort((a, b) => (b.group.lead.votes ?? 0) - (a.group.lead.votes ?? 0) || a.index - b.index)
    .map(({ group }) => group);
}

export function votesUsed(cards: CardView[]): number {
  return cards.reduce((sum, c) => sum + c.myVotes, 0);
}

export function setMyVotes(cards: CardView[], id: string, myVotes: number): CardView[] {
  return cards.map((c) => (c.id === id ? { ...c, myVotes } : c));
}
