import { z } from "zod";

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

export interface ServerToClientEvents {
  "server:hello": (payload: ServerHello) => void;
}

export interface ClientToServerEvents {
  "client:ping": (ack: (pong: Pong) => void) => void;
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
