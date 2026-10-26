import type { CardView, JoinResult, ParticipantView, RetroSummary } from "@retro/shared";
import { create } from "zustand";
import { removeCard, upsertCard } from "./board-state";

export type RoomStatus = "connecting" | "joined" | "offline" | "not_found" | "error";

interface RetroState {
  status: RoomStatus;
  retro?: RetroSummary;
  me?: ParticipantView;
  participants: ParticipantView[];
  cards: CardView[];

  reset(): void;
  setStatus(status: RoomStatus): void;
  joined(result: JoinResult): void;
  upsert(card: CardView): void;
  remove(id: string): void;
  setParticipants(participants: ParticipantView[]): void;
}

export const useRetroStore = create<RetroState>()((set) => ({
  status: "connecting",
  participants: [],
  cards: [],

  reset: () => set({ status: "connecting", retro: undefined, me: undefined, participants: [], cards: [] }),
  setStatus: (status) => set({ status }),
  // A join (first or after a reconnect) replaces everything: the server snapshot
  // is the source of truth for whatever happened while this tab was away.
  joined: ({ me, snapshot }) =>
    set({
      status: "joined",
      me,
      retro: snapshot.retro,
      participants: snapshot.participants,
      cards: snapshot.cards,
    }),
  upsert: (card) => set((s) => ({ cards: upsertCard(s.cards, card) })),
  remove: (id) => set((s) => ({ cards: removeCard(s.cards, id) })),
  setParticipants: (participants) => set({ participants }),
}));
