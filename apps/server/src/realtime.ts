import {
  addCardSchema,
  deleteCardSchema,
  editCardSchema,
  emptySchema,
  focusSchema,
  groupCardSchema,
  handoverSchema,
  joinSchema,
  PROTOCOL_VERSION,
  setStageSchema,
  setVotesSchema,
  startTimerSchema,
  ungroupCardSchema,
  voteSchema,
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type ParticipantView,
  type ServerToClientEvents,
  type Stage,
} from "@retro/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Server, Socket } from "socket.io";
import type { z } from "zod";
import { Presence } from "./retro/presence";
import { STORE_FAILURES, type RetroStore, type StoreFailure } from "./retro/store";
import { viewCards, viewMeta, type CardRow } from "./retro/views";

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

function unwrap<T>(result: T | StoreFailure): T {
  if (typeof result === "string" && STORE_FAILURES.has(result)) throw new Failure(result as StoreFailure);
  return result as T;
}

export function registerRealtime(io: RealtimeServer, store: RetroStore, log: FastifyBaseLogger) {
  const presence = new Presence();

  async function participantsOf(retroId: string): Promise<ParticipantView[]> {
    const online = presence.online(retroId);
    const all = await store.participants(retroId);
    return all.map((p) => ({ ...p, online: online.has(p.id) }));
  }

  /** Every socket in the room, with the participant it belongs to. */
  async function viewers(retroId: string) {
    const sockets = await io.in(room(retroId)).fetchSockets();
    return sockets.flatMap((s) => (s.data.participantId ? [{ socket: s, viewerId: s.data.participantId }] : []));
  }

  /** Sends one changed card to each viewer, as that viewer may see it. */
  async function broadcastCard(retroId: string, card: CardRow) {
    const [retro, votes, targets] = await Promise.all([
      store.getRetro(retroId),
      store.votesOn(card.id),
      viewers(retroId),
    ]);
    if (!retro) return;
    for (const { socket, viewerId } of targets) {
      socket.emit("card:upserted", viewCards([card], votes, viewerId, retro.stage as Stage)[0]);
    }
  }

  /** Re-sends the whole board to each viewer: after a stage change or a regroup. */
  async function broadcastCards(retroId: string) {
    const [board, targets] = await Promise.all([store.board(retroId), viewers(retroId)]);
    if (!board) return;
    const stage = board.retro.stage as Stage;
    for (const { socket, viewerId } of targets) {
      socket.emit("retro:cards", viewCards(board.cards, board.votes, viewerId, stage));
    }
  }

  async function broadcastMeta(retroId: string) {
    const retro = await store.getRetro(retroId);
    if (retro) io.to(room(retroId)).emit("retro:meta", viewMeta(retro));
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

  async function facilitatorSession(socket: RealtimeSocket) {
    const current = session(socket);
    const retro = await store.getRetro(current.retroId);
    if (retro?.facilitatorId !== current.participantId) throw new Failure("forbidden");
    return current;
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

    /** Registers a facilitator-only command; everyone gets the new meta afterwards. */
    function command<S extends z.ZodType>(
      event: keyof ClientToServerEvents,
      schema: S,
      run: (retroId: string, input: z.infer<S>) => Promise<{ cards?: boolean } | void>,
    ) {
      socket.on(
        event,
        handle(socket, schema, async (input) => {
          const { retroId } = await facilitatorSession(socket);
          const effect = await run(retroId, input);
          // Cards first: a client that switches to the new stage already has
          // the cards that stage shows (revealed text, vote totals).
          if (effect?.cards) await broadcastCards(retroId);
          await broadcastMeta(retroId);
          return null;
        }) as never,
      );
    }

    socket.on(
      "retro:join",
      handle(socket, joinSchema, async ({ retroId, name, token, hostKey }) => {
        const joined = await store.join(retroId, name, token, hostKey);
        if (!joined) throw new Failure("not_found");
        await leave(socket);

        const { participant } = joined;
        socket.data = { retroId, participantId: participant.id };
        await socket.join(room(retroId));
        presence.add(retroId, participant.id);

        const [board, participants] = await Promise.all([store.board(retroId), participantsOf(retroId)]);
        if (!board) throw new Failure("not_found");
        const meta = viewMeta(board.retro);
        socket.to(room(retroId)).emit("participants:changed", participants);
        // Claiming the facilitator role with the host key changes the meta for everyone.
        if (meta.facilitatorId === participant.id) socket.to(room(retroId)).emit("retro:meta", meta);
        return {
          token: joined.token,
          me: { id: participant.id, name: participant.name, online: true },
          snapshot: {
            retro: meta,
            participants,
            cards: viewCards(board.cards, board.votes, participant.id, meta.stage),
          },
        };
      }),
    );

    socket.on(
      "card:add",
      handle(socket, addCardSchema, async (req) => {
        const { retroId, participantId } = session(socket);
        const card = unwrap(await store.addCard(retroId, participantId, req));
        await broadcastCard(retroId, card);
        return viewCards([card], [], participantId, "write")[0];
      }),
    );

    socket.on(
      "card:edit",
      handle(socket, editCardSchema, async (req) => {
        const { retroId, participantId } = session(socket);
        const card = unwrap(await store.editCard(retroId, participantId, req));
        await broadcastCard(retroId, card);
        return viewCards([card], [], participantId, "group")[0];
      }),
    );

    socket.on(
      "card:delete",
      handle(socket, deleteCardSchema, async ({ id }) => {
        const { retroId, participantId } = session(socket);
        unwrap(await store.deleteCard(retroId, participantId, id));
        io.to(room(retroId)).emit("card:deleted", { id });
        await broadcastCards(retroId); // a deleted group lead promotes another card
        return null;
      }),
    );

    socket.on(
      "card:group",
      handle(socket, groupCardSchema, async ({ id, targetId }) => {
        const { retroId } = session(socket);
        unwrap(await store.groupCard(retroId, id, targetId));
        await broadcastCards(retroId);
        return null;
      }),
    );

    socket.on(
      "card:ungroup",
      handle(socket, ungroupCardSchema, async ({ id }) => {
        const { retroId } = session(socket);
        unwrap(await store.ungroupCard(retroId, id));
        await broadcastCards(retroId);
        return null;
      }),
    );

    // Votes stay private until the discuss stage, so only the voter hears back.
    socket.on(
      "vote:add",
      handle(socket, voteSchema, async ({ id }) => {
        const { retroId, participantId } = session(socket);
        return { myVotes: unwrap(await store.addVote(retroId, participantId, id)) };
      }),
    );

    socket.on(
      "vote:remove",
      handle(socket, voteSchema, async ({ id }) => {
        const { retroId, participantId } = session(socket);
        return { myVotes: unwrap(await store.removeVote(retroId, participantId, id)) };
      }),
    );

    command("retro:stage", setStageSchema, async (retroId, { stage }) => {
      await store.setStage(retroId, stage);
      return { cards: true }; // visibility and vote totals depend on the stage
    });
    command("retro:votes", setVotesSchema, (retroId, { votesPerPerson }) =>
      store.setVotesPerPerson(retroId, votesPerPerson),
    );
    command("retro:focus", focusSchema, async (retroId, { cardId }) => {
      unwrap(await store.setFocus(retroId, cardId));
    });
    command("retro:handover", handoverSchema, async (retroId, { participantId }) => {
      unwrap(await store.handover(retroId, participantId));
    });
    command("timer:start", startTimerSchema, (retroId, { seconds }) =>
      store.setTimer(retroId, new Date(Date.now() + seconds * 1000)),
    );
    command("timer:stop", emptySchema, (retroId) => store.setTimer(retroId, null));

    socket.on("disconnect", () => {
      leave(socket).catch((err) => log.error({ err }, "leave failed"));
    });
  });
}
