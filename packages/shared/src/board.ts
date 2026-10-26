import { z } from "zod";

/** Retro formats and their columns, in display order. Column titles live in the UI translations. */
export const TEMPLATES = {
  classic: ["went-well", "to-improve", "try-next"],
  "start-stop-continue": ["start", "stop", "continue"],
  "mad-sad-glad": ["mad", "sad", "glad"],
  "four-ls": ["liked", "learned", "lacked", "longed-for"],
  sailboat: ["wind", "anchors", "rocks", "island"],
} as const;

export type TemplateId = keyof typeof TEMPLATES;
export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];
export const templateIdSchema = z.enum(TEMPLATE_IDS as [TemplateId, ...TemplateId[]]);

export type ColumnId = (typeof TEMPLATES)[TemplateId][number];
const ALL_COLUMNS = [...new Set(Object.values(TEMPLATES).flat())] as ColumnId[];
export const columnIdSchema = z.enum(ALL_COLUMNS as [ColumnId, ...ColumnId[]]);

export function columnsOf(template: TemplateId): readonly ColumnId[] {
  return TEMPLATES[template];
}

/**
 * A retro moves through these stages in order; the facilitator can step back.
 * - review:  what happened to the action items from earlier retros (skipped
 *            when the team has none open)
 * - write:   everyone adds cards; other people's cards stay hidden
 * - group:   cards are revealed and similar ones are grouped together
 * - vote:    everyone spends a limited number of votes on groups
 * - discuss: groups sorted by votes; action items are agreed here
 * - done:    summary, export and the link to the team's next retro
 */
export const STAGES = ["review", "write", "group", "vote", "discuss", "done"] as const;
export type Stage = (typeof STAGES)[number];
export const stageSchema = z.enum(STAGES);

export const LIMITS = {
  titleLength: 80,
  nameLength: 40,
  cardLength: 500,
  maxVotesPerPerson: 10,
  maxTimerSeconds: 60 * 60,
  actionLength: 200,
  /** Few, owned, dated items get done; long lists don't. */
  maxActionsPerRetro: 3,
  surveyCommentLength: 1000,
} as const;

export const retroIdSchema = z.string().regex(/^[A-Za-z0-9_-]{10}$/);
export const cardTextSchema = z.string().trim().min(1).max(LIMITS.cardLength);
export const nameSchema = z.string().trim().min(1).max(LIMITS.nameLength);

export const createRetroSchema = z.object({
  teamName: z.string().trim().min(1).max(LIMITS.titleLength),
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
  template: TemplateId;
  teamId: string;
  teamName: string;
  /** 1 for a team's first retro, 2 for the next one, and so on. */
  number: number;
  /** Whether this retro opened with a review of earlier action items. */
  hasReview: boolean;
  /** Set once the facilitator starts the team's next retro. */
  nextRetroId: string | null;
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

export const ACTION_STATUSES = ["open", "done", "dropped"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** A YYYY-MM-DD calendar date, as picked in a date input. */
export const dueDateSchema = z.iso.date();

export interface ActionItemView {
  id: string;
  text: string;
  ownerName: string;
  dueDate: string;
  status: ActionStatus;
  /** The discussed topic this item came from, if any. */
  sourceCardId: string | null;
  /** False for items carried over from an earlier retro of the team. */
  fromThisRetro: boolean;
  /** An earlier item whose outcome was already decided in this retro's review. */
  reviewedHere: boolean;
  /** Someone asked for an e-mail reminder; the address itself is never sent to browsers. */
  reminder: boolean;
  reminderSent: boolean;
  createdAt: string;
}

/** How the team did on items agreed in its earlier retros. */
export interface TeamStats {
  done: number;
  total: number;
}

/** One participant's answer to "how useful was this retro?". */
export interface SurveyAnswer {
  rating: number;
  comment: string | null;
  quotable: boolean;
}

export interface RetroSnapshot {
  retro: RetroMeta;
  participants: ParticipantView[];
  cards: CardView[];
  actions: ActionItemView[];
  stats: TeamStats;
  /** This viewer's own survey answer, if they gave one. */
  survey: SurveyAnswer | null;
  /** What this server can do; e-mail reminders need SMTP to be configured. */
  features: { reminders: boolean };
}
