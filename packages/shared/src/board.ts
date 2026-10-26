import { z } from "zod";

/** The classic three-column retro. More templates come later. */
export const COLUMNS = [
  { id: "went-well", title: "Went well" },
  { id: "to-improve", title: "To improve" },
  { id: "try-next", title: "Try next" },
] as const;

export type ColumnId = (typeof COLUMNS)[number]["id"];
export const columnIdSchema = z.enum(COLUMNS.map((c) => c.id) as [ColumnId, ...ColumnId[]]);

/**
 * A retro moves through these stages in order; the facilitator can step back.
 * - write:   everyone adds cards; other people's cards stay hidden
 * - group:   cards are revealed and similar ones are grouped together
 * - vote:    everyone spends a limited number of votes on groups
 * - discuss: groups sorted by votes, the facilitator walks through them
 */
export const STAGES = ["write", "group", "vote", "discuss"] as const;
export type Stage = (typeof STAGES)[number];
export const stageSchema = z.enum(STAGES);

export const LIMITS = {
  titleLength: 80,
  nameLength: 40,
  cardLength: 500,
  maxVotesPerPerson: 10,
  maxTimerSeconds: 60 * 60,
} as const;

export const retroIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10}$/);
export const cardTextSchema = z.string().trim().min(1).max(LIMITS.cardLength);
export const nameSchema = z.string().trim().min(1).max(LIMITS.nameLength);

export const createRetroSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.titleLength),
});

export interface RetroSummary {
  id: string;
  title: string;
}

/** Returned once, to the person who created the retro. */
export interface CreatedRetro extends RetroSummary {
  /** Proves the holder is the facilitator; kept in the creator's browser. */
  hostKey: string;
}

export interface RetroMeta extends RetroSummary {
  stage: Stage;
  facilitatorId: string | null;
  votesPerPerson: number;
  /** Server-clock epoch milliseconds, or null when no timer is running. */
  timerEndsAt: number | null;
  /** The group being discussed right now. */
  focusCardId: string | null;
}

export interface ParticipantView {
  id: string;
  name: string;
  online: boolean;
}

/**
 * A card as one particular participant is allowed to see it. Authors are
 * never sent to other people, and while the retro is in the write stage the
 * text of other people's cards is withheld by the server, not just hidden.
 */
export interface CardView {
  id: string;
  columnId: ColumnId;
  /** null while the card is hidden from this viewer. */
  text: string | null;
  mine: boolean;
  /** Id of the card this one is grouped under, or null for a top-level card. */
  groupId: string | null;
  createdAt: string;
  /** Votes this viewer put on the card. */
  myVotes: number;
  /** Everyone's votes, revealed only in the discuss stage. */
  votes: number | null;
}

export interface RetroSnapshot {
  retro: RetroMeta;
  participants: ParticipantView[];
  cards: CardView[];
}
