import { z } from "zod";

/** The classic three-column retro. More templates come later. */
export const COLUMNS = [
  { id: "went-well", title: "Went well" },
  { id: "to-improve", title: "To improve" },
  { id: "try-next", title: "Try next" },
] as const;

export type ColumnId = (typeof COLUMNS)[number]["id"];
export const columnIdSchema = z.enum(COLUMNS.map((c) => c.id) as [ColumnId, ...ColumnId[]]);

export const LIMITS = {
  titleLength: 80,
  nameLength: 40,
  cardLength: 500,
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

export interface ParticipantView {
  id: string;
  name: string;
  online: boolean;
}

export interface CardView {
  id: string;
  columnId: ColumnId;
  text: string;
  authorId: string;
  createdAt: string;
}

export interface RetroSnapshot {
  retro: RetroSummary;
  participants: ParticipantView[];
  cards: CardView[];
}
