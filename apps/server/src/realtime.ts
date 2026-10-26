import {
  addCardSchema,
  deleteCardSchema,
  editCardSchema,
  joinSchema,
  PROTOCOL_VERSION,
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type ParticipantView,
  type ServerToClientEvents,
} from "@retro/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Server, Socket } from "socket.io";
import type { z } from "zod";
import { Presence } from "./retro/presence";
import type { CardFailure, RetroStore } from "./retro/store";

interface SocketData {
  retroId?: string;
  participantId?: string;
}

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const room = (retroId: string) => `retro:${retroId}`;

class Failure extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

function unwrap<T>(result: T | CardFailure): T {
  if (result === "not_found" || result === "forbidden") throw new Failure(result as CardFailure);
  return result as T;
}

export function registerRealtime(io: RealtimeServer, store: RetroStore, log: FastifyBaseLogger) {
  const presence = new Presence();

  async function participantsOf(retroId: string): Promise<ParticipantView[]> {
    const online = presence.online(retroId);
    const all = await store.participants(retroId);
    return all.map((p) => ({ ...p, online: online.has(p.id) }));
  }

  /** Validates the payload, runs the handler and always answers the ack. */
  function handle<S extends z.ZodType, T>(
    socket: RealtimeSocket,
    schema: S,
    run: (input: z.infer<S>) => Promise<T>,
  ) {
    return async (payload: unknown, ack: Ack<T>) => {
      if (typeof ack !== "function") return;
      const parsed = schema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid" });
      try {
        ack({ ok: true, data: await run(parsed.data) });
      } catch (err) {
        if (err instanceof Failure) return ack({ ok: false, error: err.code });
        log.error({ err, socket: socket.id }, "socket handler failed");
        ack({ ok: false, error: "internal" });
      }
    };
  }

  function session(socket: RealtimeSocket) {
    const { retroId, participantId } = socket.data;
    if (!retroId || !participantId) throw new Failure("not_joined");
    return { retroId, participantId };
  }

  async function leave(socket: RealtimeSocket) {
    const { retroId, participantId } = socket.data;
    if (!retroId || !participantId) return;
    socket.data = {};
    await socket.leave(room(retroId));
    if (presence.remove(retroId, participantId)) {
      io.to(room(retroId)).emit("participants:changed", await participantsOf(retroId));
    }
  }

  io.on("connection", (socket) => {
    socket.emit("server:hello", { protocolVersion: PROTOCOL_VERSION, serverTime: Date.now() });
    socket.on("client:ping", (ack) => typeof ack === "function" && ack({ serverTime: Date.now() }));

    socket.on(
      "retro:join",
      handle(socket, joinSchema, async ({ retroId, name, token }) => {
        const joined = await store.join(retroId, name, token);
        if (!joined) throw new Failure("not_found");
        await leave(socket);

        const { participant } = joined;
        socket.data = { retroId, participantId: participant.id };
        await socket.join(room(retroId));
        presence.add(retroId, participant.id);

        const [snapshot, participants] = await Promise.all([store.snapshot(retroId), participantsOf(retroId)]);
        if (!snapshot) throw new Failure("not_found");
        socket.to(room(retroId)).emit("participants:changed", participants);
        return {
          token: joined.token,
          me: { id: participant.id, name: participant.name, online: true },
          snapshot: { ...snapshot, participants },
        };
      }),
    );

    socket.on(
      "card:add",
      handle(socket, addCardSchema, async (req) => {
        const { retroId, participantId } = session(socket);
        const card = unwrap(await store.addCard(retroId, participantId, req));
        socket.to(room(retroId)).emit("card:upserted", card);
        return card;
      }),
    );

    socket.on(
      "card:edit",
      handle(socket, editCardSchema, async (req) => {
        const { retroId, participantId } = session(socket);
        const card = unwrap(await store.editCard(retroId, participantId, req));
        socket.to(room(retroId)).emit("card:upserted", card);
        return card;
      }),
    );

    socket.on(
      "card:delete",
      handle(socket, deleteCardSchema, async ({ id }) => {
        const { retroId, participantId } = session(socket);
        unwrap(await store.deleteCard(retroId, participantId, id));
        socket.to(room(retroId)).emit("card:deleted", { id });
        return null;
      }),
    );

    socket.on("disconnect", () => {
      leave(socket).catch((err) => log.error({ err }, "leave failed"));
    });
  });
}
