"use client";

import type { CardView, ColumnId, Result } from "@retro/shared";
import { useCallback, useEffect, useRef } from "react";
import { useRetroStore } from "./retro-store";
import { createSocket, type RetroSocket } from "./socket";
import { savedToken, saveToken } from "./storage";

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

    async function join() {
      store.setStatus("connecting");
      try {
        const result = await socket
          .timeout(ACK_TIMEOUT_MS)
          .emitWithAck("retro:join", { retroId, name, token: savedToken(retroId) });
        if (!result.ok) return store.setStatus(result.error === "not_found" ? "not_found" : "error");
        saveToken(retroId, result.data.token);
        store.joined(result.data);
      } catch {
        // timed out; the next reconnect tries again
      }
    }

    socket.on("connect", join);
    socket.on("disconnect", () => store.setStatus("offline"));
    socket.on("connect_error", () => store.setStatus("offline"));
    socket.on("card:upserted", store.upsert);
    socket.on("card:deleted", ({ id }) => store.remove(id));
    socket.on("participants:changed", store.setParticipants);

    return () => {
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

  const addCard = useCallback(
    (columnId: ColumnId, text: string) => {
      const { me, upsert, remove } = useRetroStore.getState();
      if (!me) return Promise.resolve(false);
      const card: CardView = {
        id: crypto.randomUUID(),
        columnId,
        text,
        authorId: me.id,
        createdAt: new Date().toISOString(),
      };
      return mutate(
        () => upsert(card),
        () => remove(card.id),
        async (socket) => {
          const result = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("card:add", { id: card.id, columnId, text });
          if (result.ok) upsert(result.data);
          return result;
        },
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

  return { addCard, editCard, deleteCard };
}

export type RoomActions = ReturnType<typeof useRetroRoom>;
