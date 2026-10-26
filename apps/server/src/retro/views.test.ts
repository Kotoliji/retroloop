import { describe, expect, it } from "vitest";
import { viewCards, type CardRow, type VoteRow } from "./views";

const card = (id: string, authorId: string): CardRow => ({
  id,
  columnId: "went-well",
  text: `text of ${id}`,
  authorId,
  groupId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
});

const cards = [card("c1", "alice"), card("c2", "bob")];
const votes: VoteRow[] = [
  { cardId: "c2", participantId: "alice" },
  { cardId: "c2", participantId: "bob" },
  { cardId: "c2", participantId: "bob" },
];

describe("viewCards", () => {
  it("withholds other people's text while writing, but not your own", () => {
    const [own, other] = viewCards(cards, [], "alice", "write");
    expect(own.text).toBe("text of c1");
    expect(other.text).toBeNull();
  });

  it("never sends who wrote a card", () => {
    for (const stage of ["write", "group", "vote", "discuss"] as const) {
      const sent = JSON.stringify(viewCards(cards, votes, "carol", stage));
      expect(sent).not.toContain("alice");
      expect(sent).not.toContain("bob");
    }
  });

  it("shows only your own votes until the discuss stage", () => {
    const voting = viewCards(cards, votes, "bob", "vote")[1];
    expect(voting).toMatchObject({ myVotes: 2, votes: null });

    const discussing = viewCards(cards, votes, "bob", "discuss")[1];
    expect(discussing).toMatchObject({ myVotes: 2, votes: 3 });
  });
});
