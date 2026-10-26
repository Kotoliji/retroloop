import type { CardView, JoinResult, ParticipantView, RetroMeta } from "@retro/shared";
import { create } from "zustand";
import { removeCard, setMyVotes, upsertCard } from "./board-state";

export type RoomStatus = "connecting" | "joined" | "offline" | "not_found" | "error";

interface RetroState {
  status: RoomStatus;
  retro?: RetroMeta;
  me?: ParticipantView;
  participants: ParticipantView[];
  cards: CardView[];
  /** Server clock minus local clock, in milliseconds. */
  clockOffset: number;

  reset(): void;
  setStatus(status: RoomStatus): void;
  joined(result: JoinResult): void;
  setMeta(retro: RetroMeta): void;
  setCards(cards: CardView[]): void;
  upsert(card: CardView): void;
  remove(id: string): void;
  setMyVotes(id: string, myVotes: number): void;
  setParticipants(participants: ParticipantView[]): void;
  setClockOffset(offset: number): void;
}

export const useRetroStore = create<RetroState>()((set) => ({
  status: "connecting",
  participants: [],
  cards: [],
  clockOffset: 0,

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
  setMeta: (retro) => set({ retro }),
  setCards: (cards) => set({ cards }),
  upsert: (card) => set((s) => ({ cards: upsertCard(s.cards, card) })),
  remove: (id) => set((s) => ({ cards: removeCard(s.cards, id) })),
  setMyVotes: (id, myVotes) => set((s) => ({ cards: setMyVotes(s.cards, id, myVotes) })),
  setParticipants: (participants) => set({ participants }),
  setClockOffset: (clockOffset) => set({ clockOffset }),
}));

export const useIsFacilitator = () =>
  useRetroStore((s) => s.me !== undefined && s.retro?.facilitatorId === s.me.id);
