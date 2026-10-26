import { z } from "zod";
import {
  cardTextSchema,
  columnIdSchema,
  nameSchema,
  retroIdSchema,
  type CardView,
  type ParticipantView,
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

export type ErrorCode = "invalid" | "not_found" | "forbidden" | "not_joined" | "internal";

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
}

export interface ClientToServerEvents {
  "client:ping": (ack: (pong: Pong) => void) => void;
  "retro:join": (request: JoinRequest, ack: Ack<JoinResult>) => void;
  "card:add": (request: AddCardRequest, ack: Ack<CardView>) => void;
  "card:edit": (request: EditCardRequest, ack: Ack<CardView>) => void;
  "card:delete": (request: DeleteCardRequest, ack: Ack<null>) => void;
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
