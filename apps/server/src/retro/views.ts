import type { CardView, ColumnId, RetroMeta, Stage } from "@retro/shared";

export interface RetroRow {
  id: string;
  title: string;
  stage: string;
  facilitatorId: string | null;
  votesPerPerson: number;
  timerEndsAt: Date | null;
  focusCardId: string | null;
}

export interface CardRow {
  id: string;
  columnId: string;
  text: string;
  authorId: string;
  groupId: string | null;
  createdAt: Date;
}

export interface VoteRow {
  cardId: string;
  participantId: string;
}

export function viewMeta(retro: RetroRow): RetroMeta {
  return {
    id: retro.id,
    title: retro.title,
    stage: retro.stage as Stage,
    facilitatorId: retro.facilitatorId,
    votesPerPerson: retro.votesPerPerson,
    timerEndsAt: retro.timerEndsAt?.getTime() ?? null,
    focusCardId: retro.focusCardId,
  };
}

/**
 * The single place that decides what a participant may see. The author id is
 * never copied into the view; other people's text is dropped during the write
 * stage; vote totals appear only once the retro reaches the discuss stage.
 */
export function viewCards(cards: CardRow[], votes: VoteRow[], viewerId: string, stage: Stage): CardView[] {
  const totals = new Map<string, number>();
  const mine = new Map<string, number>();
  for (const vote of votes) {
    totals.set(vote.cardId, (totals.get(vote.cardId) ?? 0) + 1);
    if (vote.participantId === viewerId) mine.set(vote.cardId, (mine.get(vote.cardId) ?? 0) + 1);
  }

  return cards.map((card) => {
    const isMine = card.authorId === viewerId;
    return {
      id: card.id,
      columnId: card.columnId as ColumnId,
      text: stage === "write" && !isMine ? null : card.text,
      mine: isMine,
      groupId: card.groupId,
      createdAt: card.createdAt.toISOString(),
      myVotes: mine.get(card.id) ?? 0,
      votes: stage === "discuss" ? (totals.get(card.id) ?? 0) : null,
    };
  });
}
