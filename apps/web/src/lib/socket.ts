import type { ClientToServerEvents, ServerToClientEvents } from "@retro/shared";
import { io, type Socket } from "socket.io-client";

export type RetroSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

export function createSocket(): RetroSocket {
  return io(SERVER_URL, { transports: ["websocket"], autoConnect: false });
}
