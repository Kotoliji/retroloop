import { z } from "zod";
import {
  cardTextSchema,
  columnIdSchema,
  nameSchema,
  LIMITS,
  retroIdSchema,
  stageSchema,
  type CardView,
  type ParticipantView,
  type RetroMeta,
  type RetroSnapshot,
} from "./board";

/**
 * Wire contract between the web app and the realtime server.
 * Every socket event and its payload is declared here once, so both sides
 * are type-checked against the same definitions.
 */

export const PROTOCOL_VERSION = 1;

export const serverHelloSchema = z.object({
  protocolVersion: z.number().int(),
  serverTime: z.number().int(),
});
export type ServerHello = z.infer<typeof serverHelloSchema>;

export const pongSchema = z.object({
  serverTime: z.number().int(),
});
export type Pong = z.infer<typeof pongSchema>;

export const joinSchema = z.object({
  retroId: retroIdSchema,
  name: nameSchema,
  /** Returned by a previous join; lets a participant come back as themselves. */
  token: z.string().max(100).optional(),
  /** Given to the retro's creator; makes the joining participant the facilitator. */
  hostKey: z.string().max(100).optional(),
});
export type JoinRequest = z.infer<typeof joinSchema>;

export const addCardSchema = z.object({
  id: z.uuid(),
  columnId: columnIdSchema,
  text: cardTextSchema,
});
export type AddCardRequest = z.infer<typeof addCardSchema>;

export const editCardSchema = z.object({ id: z.uuid(), text: cardTextSchema });
export type EditCardRequest = z.infer<typeof editCardSchema>;

export const deleteCardSchema = z.object({ id: z.uuid() });
export type DeleteCardRequest = z.infer<typeof deleteCardSchema>;

const cardRef = z.object({ id: z.uuid() });

export const groupCardSchema = z.object({ id: z.uuid(), targetId: z.uuid() });
export type GroupCardRequest = z.infer<typeof groupCardSchema>;

export const ungroupCardSchema = cardRef;
export const voteSchema = cardRef;

export const setStageSchema = z.object({ stage: stageSchema });
export const setVotesSchema = z.object({
  votesPerPerson: z.number().int().min(1).max(LIMITS.maxVotesPerPerson),
});
export const startTimerSchema = z.object({
  seconds: z.number().int().min(10).max(LIMITS.maxTimerSeconds),
});
export const focusSchema = z.object({ cardId: z.uuid().nullable() });
export const handoverSchema = z.object({ participantId: z.uuid() });
export const emptySchema = z.object({}).optional();

export type ErrorCode =
  | "invalid"
  | "not_found"
  | "forbidden"
  | "not_joined"
  | "wrong_stage"
  | "no_votes_left"
  | "internal";

export type Result<T> = { ok: true; data: T } | { ok: false; error: ErrorCode };
export type Ack<T> = (result: Result<T>) => void;

export interface JoinResult {
  token: string;
  me: ParticipantView;
  snapshot: RetroSnapshot;
}

export interface ServerToClientEvents {
  "server:hello": (payload: ServerHello) => void;
  "card:upserted": (card: CardView) => void;
  "card:deleted": (payload: { id: string }) => void;
  "participants:changed": (participants: ParticipantView[]) => void;
  /** Stage, timer, focus or settings changed. */
  "retro:meta": (meta: RetroMeta) => void;
  /** Many cards changed at once (a stage change or a regroup): replace them all. */
  "retro:cards": (cards: CardView[]) => void;
}

export interface ClientToServerEvents {
  "client:ping": (ack: (pong: Pong) => void) => void;
  "retro:join": (request: JoinRequest, ack: Ack<JoinResult>) => void;
  "card:add": (request: AddCardRequest, ack: Ack<CardView>) => void;
  "card:edit": (request: EditCardRequest, ack: Ack<CardView>) => void;
  "card:delete": (request: DeleteCardRequest, ack: Ack<null>) => void;
  "card:group": (request: GroupCardRequest, ack: Ack<null>) => void;
  "card:ungroup": (request: { id: string }, ack: Ack<null>) => void;
  /** Answers with the viewer's own vote count on the card. */
  "vote:add": (request: { id: string }, ack: Ack<{ myVotes: number }>) => void;
  "vote:remove": (request: { id: string }, ack: Ack<{ myVotes: number }>) => void;
  // facilitator only
  "retro:stage": (request: { stage: RetroMeta["stage"] }, ack: Ack<null>) => void;
  "retro:votes": (request: { votesPerPerson: number }, ack: Ack<null>) => void;
  "retro:focus": (request: { cardId: string | null }, ack: Ack<null>) => void;
  "retro:handover": (request: { participantId: string }, ack: Ack<null>) => void;
  "timer:start": (request: { seconds: number }, ack: Ack<null>) => void;
  "timer:stop": (request: Record<string, never>, ack: Ack<null>) => void;
}

export type HealthCheck = "ok" | "down";

export interface HealthStatus {
  status: "ok" | "degraded";
  checks: { database: HealthCheck; redis: HealthCheck };
}

/**
 * Estimates the offset between the server clock and the local clock from one
 * ping round trip, assuming the request and the reply took equal time.
 * Retro timers run on server time, so every client needs this offset.
 */
export function estimateClockOffset(sentAt: number, receivedAt: number, serverTime: number) {
  const roundTrip = receivedAt - sentAt;
  return { roundTrip, offset: serverTime + roundTrip / 2 - receivedAt };
}
