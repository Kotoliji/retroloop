"use client";

import { columnsOf, LIMITS, type ColumnId, type TemplateId } from "@retro/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { cardsIn, groupCards } from "@/lib/board-state";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { CardGroupView } from "./CardGroupView";

const ACCENTS = ["border-t-emerald-500", "border-t-amber-500", "border-t-sky-500", "border-t-violet-500"];

/** Columns are colored by position, so every format gets the same palette. */
export function accentFor(template: TemplateId, columnId: ColumnId) {
  return ACCENTS[Math.max(0, columnsOf(template).indexOf(columnId))];
}

export function Column({ columnId, actions }: { columnId: ColumnId; actions: RoomActions }) {
  const t = useTranslations("Board");
  const title = t(`columns.${columnId}`);
  const template = useRetroStore((s) => s.retro?.template ?? "classic");
  const cards = useRetroStore(useShallow((s) => cardsIn(s.cards, columnId)));
  const stage = useRetroStore((s) => s.retro?.stage);
  const joined = useRetroStore((s) => s.status === "joined");
  const [draft, setDraft] = useState("");
  const inputId = `add-${columnId}`;
  const groups = groupCards(cards);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const saved = await actions.addCard(columnId, text);
    if (!saved) setDraft(text);
  }

  return (
    <section
      aria-labelledby={`${columnId}-title`}
      className={`flex flex-col gap-3 rounded-xl border border-t-4 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50 ${accentFor(template, columnId)}`}
    >
      <h2 id={`${columnId}-title`} className="flex items-baseline justify-between px-1 font-semibold">
        {title}
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
            {t("addCard", { column: title })}
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
            placeholder={t("addPlaceholder")}
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
