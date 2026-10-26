"use client";

import { LIMITS, type COLUMNS } from "@retro/shared";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cardsIn, groupCards } from "@/lib/board-state";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { CardGroupView } from "./CardGroupView";

export const ACCENTS = {
  "went-well": "border-t-emerald-500",
  "to-improve": "border-t-amber-500",
  "try-next": "border-t-sky-500",
} as const;

type ColumnDef = (typeof COLUMNS)[number];

export function Column({ column, actions }: { column: ColumnDef; actions: RoomActions }) {
  const cards = useRetroStore(useShallow((s) => cardsIn(s.cards, column.id)));
  const stage = useRetroStore((s) => s.retro?.stage);
  const joined = useRetroStore((s) => s.status === "joined");
  const [draft, setDraft] = useState("");
  const inputId = `add-${column.id}`;
  const groups = groupCards(cards);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const saved = await actions.addCard(column.id, text);
    if (!saved) setDraft(text);
  }

  return (
    <section
      aria-labelledby={`${column.id}-title`}
      className={`flex flex-col gap-3 rounded-xl border border-t-4 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50 ${ACCENTS[column.id]}`}
    >
      <h2 id={`${column.id}-title`} className="flex items-baseline justify-between px-1 font-semibold">
        {column.title}
        <span className="text-sm font-normal text-zinc-500">{cards.length}</span>
      </h2>

      {stage === "write" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Add a card to {column.title}
          </label>
          <textarea
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={!joined}
            maxLength={LIMITS.cardLength}
            rows={2}
            placeholder="Add a card — Enter to post"
            className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
          />
        </form>
      )}

      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <CardGroupView key={group.lead.id} group={group} actions={actions} />
        ))}
      </ul>
    </section>
  );
}
