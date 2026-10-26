import {
  addActionSchema,
  addCardSchema,
  deleteActionSchema,
  deleteCardSchema,
  editActionSchema,
  editCardSchema,
  emptySchema,
  remindSchema,
  reviewActionSchema,
  surveySchema,
  trackSchema,
  focusSchema,
  groupCardSchema,
  handoverSchema,
  joinSchema,
  PROTOCOL_VERSION,
  setStageSchema,
  setTemplateSchema,
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
import type { Analytics } from "./analytics";
import { TokenBucket } from "./rate-limit";
import { STORE_FAILURES, type RetroStore, type StoreFailure } from "./retro/store";
import { viewAction, viewCards, viewMeta, type CardRow, type RetroRow } from "./retro/views";

interface SocketData {
  retroId?: string;
  participantId?: string;
}

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const room = (retroId: string) => `retro:${retroId}`;
/** Every socket of one participant in one retro (several tabs, devices). */
const own = (retroId: string, participantId: string) => `retro:${retroId}:p:${participantId}`;

/** Per socket: bursts of 40 events, 10 a second sustained — far above what a person clicks. */
const SOCKET_BURST = 40;
const SOCKET_PER_SECOND = 10;

class Failure extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}

function unwrap<T>(result: T | StoreFailure): T {
  if (typeof result === "string" && STORE_FAILURES.has(result)) throw new Failure(result as StoreFailure);
  return result as T;
}

export function registerRealtime(
  io: RealtimeServer,
  store: RetroStore,
  analytics: Analytics,
  features: { reminders: boolean },
  log: FastifyBaseLogger,
) {
  const buckets = new WeakMap<RealtimeSocket, TokenBucket>();
  const allowed = (socket: RealtimeSocket) => {
    let bucket = buckets.get(socket);
    if (!bucket) buckets.set(socket, (bucket = new TokenBucket(SOCKET_BURST, SOCKET_PER_SECOND)));
    return bucket.take();
  };

  /**
   * Every socket in the room, with the participant it belongs to. With the Redis
   * adapter this asks every server instance, so it is also the presence list:
   * a participant is online while at least one of their sockets is in the room,
   * and the sockets of an instance that dies simply stop being counted.
   */
  async function viewers(retroId: string) {
    const sockets = await io.in(room(retroId)).fetchSockets();
    return sockets.flatMap((s) => (s.data.participantId ? [{ socket: s, viewerId: s.data.participantId }] : []));
  }

  async function participantsOf(retroId: string): Promise<ParticipantView[]> {
    const [all, here] = await Promise.all([store.participants(retroId), viewers(retroId)]);
    const online = new Set(here.map((v) => v.viewerId));
    return all.map((p) => ({ ...p, online: online.has(p.id) }));
  }

  /** Sends one changed card to each viewer, as that viewer may see it. */
  async function broadcastCard(retroId: string, card: CardRow) {
    const [retro, votes] = await Promise.all([store.getRetro(retroId), store.votesOn(card.id)]);
    if (!retro) return;
    const stage = retro.stage as Stage;

    // Fast path: without votes, everyone but the author sees the same view, so
    // two broadcasts reach every instance without asking who is connected.
    if (votes.length === 0) {
      const authorRoom = own(retroId, card.authorId);
      const othersView = viewCards([card], votes, "", stage)[0];
      io.to(room(retroId)).except(authorRoom).emit("card:upserted", othersView);
      io.to(authorRoom).emit("card:upserted", viewCards([card], votes, card.authorId, stage)[0]);
      return;
    }

    // With votes (after stepping back from voting), each viewer's own vote count differs.
    for (const { socket, viewerId } of await viewers(retroId)) {
      socket.emit("card:upserted", viewCards([card], votes, viewerId, stage)[0]);
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

  async function actionsOf(retro: RetroRow) {
    const [actions, stats] = await Promise.all([store.actions(retro), store.stats(retro)]);
    return { actions: actions.map((a) => viewAction(a, retro.id)), stats };
  }

  async function broadcastActions(retroId: string) {
    const retro = await store.getRetro(retroId);
    if (retro) io.to(room(retroId)).emit("actions:changed", await actionsOf(retro));
  }

  /** Validates the payload, runs the handler and always answers the ack. */
  function handle<S extends z.ZodType, T>(
    socket: RealtimeSocket,
    schema: S,
    run: (input: z.infer<S>) => Promise<T>,
  ) {
    return async (payload: unknown, ack: Ack<T>) => {
      if (typeof ack !== "function") return;
      if (!allowed(socket)) return ack({ ok: false, error: "rate_limited" });
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
    await Promise.all([socket.leave(room(retroId)), socket.leave(own(retroId, participantId))]);
    const participants = await participantsOf(retroId);
    // Another tab of the same participant keeps them online: nothing changed.
    if (!participants.find((p) => p.id === participantId)?.online) {
      io.to(room(retroId)).emit("participants:changed", participants);
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
        await socket.join([room(retroId), own(retroId, participant.id)]);

        const [board, participants] = await Promise.all([store.board(retroId), participantsOf(retroId)]);
        if (!board) throw new Failure("not_found");
        const meta = viewMeta(board.retro);
        const [{ actions, stats }, survey] = await Promise.all([
          actionsOf(board.retro),
          store.surveyOf(participant.id),
        ]);
        if (joined.created) analytics.track("participant_joined", { teamId: meta.teamId, retroId });
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
            actions,
            stats,
            survey,
            features,
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
        analytics.track("card_added", { retroId });
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
      const retro = await store.getRetro(retroId);
      if (stage === "review" && !retro?.hasReview) throw new Failure("wrong_stage");
      await store.setStage(retroId, stage);
      analytics.track("stage_entered", { teamId: retro?.teamId, retroId }, { stage });
      return { cards: true }; // visibility and vote totals depend on the stage
    });
    command("retro:votes", setVotesSchema, (retroId, { votesPerPerson }) =>
      store.setVotesPerPerson(retroId, votesPerPerson),
    );
    command("retro:focus", focusSchema, async (retroId, { cardId }) => {
      unwrap(await store.setFocus(retroId, cardId));
    });
    command("retro:template", setTemplateSchema, async (retroId, { template }) => {
      unwrap(await store.setTemplate(retroId, template));
    });
    command("retro:handover", handoverSchema, async (retroId, { participantId }) => {
      unwrap(await store.handover(retroId, participantId));
    });
    command("timer:start", startTimerSchema, (retroId, { seconds }) =>
      store.setTimer(retroId, new Date(Date.now() + seconds * 1000)),
    );
    command("timer:stop", emptySchema, (retroId) => store.setTimer(retroId, null));

    socket.on(
      "retro:next",
      handle(socket, emptySchema, async () => {
        const { retroId } = await facilitatorSession(socket);
        const next = unwrap(await store.createNextRetro(retroId));
        await broadcastMeta(retroId); // everyone gets the link to the next retro
        analytics.track("next_retro_started", { retroId: next.id });
        return next;
      }),
    );

    /** Registers an action-item change that anyone in the retro may make. */
    function actionEvent<S extends z.ZodType>(
      event: keyof ClientToServerEvents,
      schema: S,
      run: (retroId: string, input: z.infer<S>) => Promise<true | StoreFailure>,
    ) {
      socket.on(
        event,
        handle(socket, schema, async (input) => {
          const { retroId } = session(socket);
          unwrap(await run(retroId, input));
          await broadcastActions(retroId);
          const { status } = input as { status?: string }; // reviews report their outcome
          analytics.track(event.replace(":", "_"), { retroId }, status ? { status } : undefined);
          return null;
        }) as never,
      );
    }

    actionEvent("action:add", addActionSchema, (retroId, req) => store.addAction(retroId, req));
    actionEvent("action:edit", editActionSchema, (retroId, req) => store.editAction(retroId, req));
    actionEvent("action:delete", deleteActionSchema, (retroId, { id }) => store.deleteAction(retroId, id));
    actionEvent("action:review", reviewActionSchema, (retroId, req) => store.reviewAction(retroId, req));
    actionEvent("action:remind", remindSchema, (retroId, req) =>
      features.reminders ? store.setReminder(retroId, req) : Promise.resolve("forbidden" as const),
    );

    socket.on(
      "survey:submit",
      handle(socket, surveySchema, async ({ locale, ...answer }) => {
        const { retroId, participantId } = session(socket);
        const saved = unwrap(await store.answerSurvey(retroId, participantId, { ...answer, locale }));
        analytics.track("survey_answered", { retroId }, { rating: saved.rating, quotable: saved.quotable });
        return saved;
      }),
    );

    socket.on(
      "retro:delete",
      handle(socket, emptySchema, async () => {
        const { retroId } = await facilitatorSession(socket);
        socket.to(room(retroId)).emit("retro:deleted");
        await store.deleteRetro(retroId);
        analytics.track("retro_deleted");
        io.in(room(retroId)).socketsLeave(room(retroId));
        return null;
      }),
    );

    // Browser-only events (exports). No ack: counting must never slow the page down.
    socket.on("analytics:track", (payload) => {
      const parsed = trackSchema.safeParse(payload);
      const retroId = socket.data.retroId;
      if (parsed.success && retroId && allowed(socket)) analytics.track(parsed.data.name, { retroId });
    });

    socket.on("disconnect", () => {
      leave(socket).catch((err) => log.error({ err }, "leave failed"));
    });
  });
}
