"use client";

import {
  estimateClockOffset,
  type AddActionRequest,
  type CardView,
  type ColumnId,
  type EditActionRequest,
  type Result,
  type RemindRequest,
  type ReviewActionRequest,
  type Stage,
  type SurveyRequest,
  type TemplateId,
  type CLIENT_EVENTS,
} from "@retro/shared";
import { useCallback, useEffect, useRef } from "react";
import { useRetroStore } from "./retro-store";
import { createSocket, type RetroSocket } from "./socket";
import { savedHostKey, savedToken, saveToken } from "./storage";

const ACK_TIMEOUT_MS = 5000;

/**
 * Connects to a retro and keeps the store in sync with the server. Changes are
 * applied optimistically and rolled back if the server rejects them; every
 * (re)connect re-joins and replaces local state with the server snapshot.
 */
export function useRetroRoom(retroId: string, name: string) {
  const socketRef = useRef<RetroSocket | null>(null);

  useEffect(() => {
    const store = useRetroStore.getState();
    store.reset();
    const socket = createSocket();
    socketRef.current = socket;

    async function measureClock() {
      const sentAt = Date.now();
      try {
        const { serverTime } = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("client:ping");
        store.setClockOffset(estimateClockOffset(sentAt, Date.now(), serverTime).offset);
      } catch {
        // keep the previous estimate
      }
    }

    async function join() {
      store.setStatus("connecting");
      try {
        const result = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:join", {
          retroId,
          name,
          token: savedToken(retroId),
          hostKey: savedHostKey(retroId),
        });
        if (!result.ok) return store.setStatus(result.error === "not_found" ? "not_found" : "error");
        saveToken(retroId, result.data.token);
        store.joined(result.data);
        void measureClock();
      } catch {
        // timed out; the next reconnect tries again
      }
    }

    socket.on("connect", join);
    // A deleted retro stays deleted: closing the socket afterwards is not "offline".
    const offline = () => useRetroStore.getState().status !== "deleted" && store.setStatus("offline");
    socket.on("disconnect", offline);
    socket.on("connect_error", offline);
    socket.on("card:upserted", store.upsert);
    socket.on("card:deleted", ({ id }) => store.remove(id));
    socket.on("retro:cards", store.setCards);
    socket.on("retro:meta", store.setMeta);
    socket.on("participants:changed", store.setParticipants);
    socket.on("actions:changed", store.setActions);
    socket.on("retro:deleted", () => {
      store.setStatus("deleted");
      socket.disconnect();
    });

    // Connect on the next tick: React's development double-mount cleans up the
    // first mount immediately, and this way it never opens a socket.
    const connecting = setTimeout(() => socket.connect(), 0);

    return () => {
      clearTimeout(connecting);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [retroId, name]);

  /** Applies a change locally, sends it, and undoes it if the server says no. */
  const mutate = useCallback(
    async <T>(apply: () => void, undo: () => void, send: (socket: RetroSocket) => Promise<Result<T>>) => {
      const socket = socketRef.current;
      if (!socket) return false;
      apply();
      try {
        const result = await send(socket);
        if (result.ok) return true;
      } catch {
        // no answer in time; the snapshot on the next join settles the real state
      }
      undo();
      return false;
    },
    [],
  );

  /** Sends a request whose effect arrives as a broadcast, with nothing to apply locally. */
  const send = useCallback(
    (fn: (socket: RetroSocket) => Promise<Result<unknown>>) =>
      mutate(
        () => {},
        () => {},
        fn,
      ),
    [mutate],
  );

  const addCard = useCallback(
    (columnId: ColumnId, text: string) => {
      const { upsert, remove } = useRetroStore.getState();
      const card: CardView = {
        id: crypto.randomUUID(),
        columnId,
        text,
        mine: true,
        groupId: null,
        createdAt: new Date().toISOString(),
        myVotes: 0,
        votes: null,
      };
      return mutate(
        () => upsert(card),
        () => remove(card.id),
        (socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("card:add", { id: card.id, columnId, text }),
      );
    },
    [mutate],
  );

  const editCard = useCallback(
    (card: CardView, text: string) => {
      const { upsert } = useRetroStore.getState();
      return mutate(
        () => upsert({ ...card, text }),
        () => upsert(card),
        (socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("card:edit", { id: card.id, text }),
      );
    },
    [mutate],
  );

  const deleteCard = useCallback(
    (card: CardView) => {
      const { upsert, remove } = useRetroStore.getState();
      return mutate(
        () => remove(card.id),
        () => upsert(card),
        (socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("card:delete", { id: card.id }),
      );
    },
    [mutate],
  );

  const groupCard = useCallback(
    (id: string, targetId: string) =>
      send((socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("card:group", { id, targetId })),
    [send],
  );

  const ungroupCard = useCallback(
    (id: string) => send((socket) => socket.timeout(ACK_TIMEOUT_MS).emitWithAck("card:ungroup", { id })),
    [send],
  );

  const vote = useCallback(
    (card: CardView, change: 1 | -1) => {
      const { setMyVotes } = useRetroStore.getState();
      return mutate(
        () => setMyVotes(card.id, card.myVotes + change),
        () => setMyVotes(card.id, card.myVotes),
        async (socket) => {
          const event = change === 1 ? "vote:add" : "vote:remove";
          const result = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, { id: card.id });
          if (result.ok) setMyVotes(card.id, result.data.myVotes);
          return result;
        },
      );
    },
    [mutate],
  );

  // Facilitator commands: the server broadcasts the new meta to everyone.
  const facilitator = {
    setStage: useCallback(
      (stage: Stage) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:stage", { stage })),
      [send],
    ),
    setTemplate: useCallback(
      (template: TemplateId) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:template", { template })),
      [send],
    ),
    setVotesPerPerson: useCallback(
      (votesPerPerson: number) =>
        send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:votes", { votesPerPerson })),
      [send],
    ),
    focus: useCallback(
      (cardId: string | null) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:focus", { cardId })),
      [send],
    ),
    handover: useCallback(
      (participantId: string) =>
        send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:handover", { participantId })),
      [send],
    ),
    startTimer: useCallback(
      (seconds: number) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("timer:start", { seconds })),
      [send],
    ),
    stopTimer: useCallback(() => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("timer:stop", {})), [send]),
    deleteRetro: useCallback(async () => {
      const deleted = await send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:delete", {}));
      if (deleted) {
        useRetroStore.getState().setStatus("deleted");
        socketRef.current?.disconnect();
      }
      return deleted;
    }, [send]),
    /** Creates the team's next retro; resolves with it, or null if that failed. */
    nextRetro: useCallback(async () => {
      try {
        const result = await socketRef.current?.timeout(ACK_TIMEOUT_MS).emitWithAck("retro:next", {});
        return result?.ok ? result.data : null;
      } catch {
        return null;
      }
    }, []),
  };

  // Action items: the server answers with the full list, so nothing to apply locally.
  const actionItems = {
    add: useCallback(
      (request: AddActionRequest) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("action:add", request)),
      [send],
    ),
    edit: useCallback(
      (request: EditActionRequest) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("action:edit", request)),
      [send],
    ),
    remove: useCallback(
      (id: string) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("action:delete", { id })),
      [send],
    ),
    remind: useCallback(
      (request: RemindRequest) => send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("action:remind", request)),
      [send],
    ),
    review: useCallback(
      (request: ReviewActionRequest) =>
        send((s) => s.timeout(ACK_TIMEOUT_MS).emitWithAck("action:review", request)),
      [send],
    ),
  };

  const submitSurvey = useCallback(async (request: SurveyRequest) => {
    try {
      const result = await socketRef.current?.timeout(ACK_TIMEOUT_MS).emitWithAck("survey:submit", request);
      if (result?.ok) useRetroStore.getState().setSurvey(result.data);
      return Boolean(result?.ok);
    } catch {
      return false;
    }
  }, []);

  /** Counts something that happens only in the browser, such as an export. */
  const track = useCallback((name: (typeof CLIENT_EVENTS)[number]) => {
    socketRef.current?.emit("analytics:track", { name });
  }, []);

  return {
    addCard,
    editCard,
    deleteCard,
    groupCard,
    ungroupCard,
    vote,
    facilitator,
    actionItems,
    submitSurvey,
    track,
  };
}

export type RoomActions = ReturnType<typeof useRetroRoom>;
