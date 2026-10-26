"use client";

import type { CardView } from "@retro/shared";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { rankGroups } from "@/lib/board-state";
import { useIsFacilitator, useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { ACCENTS } from "./Column";

/** Topics ranked by votes; the facilitator picks the one being discussed. */
interface Props {
  actions: RoomActions;
  onMakeAction(topic: CardView): void;
}

export function DiscussList({ actions, onMakeAction }: Props) {
  const t = useTranslations("Discuss");
  const tb = useTranslations("Board");
  // Select the stable cards array and derive groups from it; a selector that
  // built new group objects would look like a change on every render.
  const cards = useRetroStore((s) => s.cards);
  const groups = useMemo(() => rankGroups(cards), [cards]);
  const focusId = useRetroStore((s) => s.retro?.focusCardId ?? null);
  const isFacilitator = useIsFacilitator();
  const focusedRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    focusedRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [focusId]);

  return (
    <section aria-label={t("topics")} className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {groups.map(({ lead, members }, rank) => {
          const focused = lead.id === focusId;
          return (
            <li
              key={lead.id}
              ref={focused ? focusedRef : undefined}
              aria-current={focused ? "true" : undefined}
              className={`rounded-xl border border-t-4 bg-white p-4 shadow-sm transition dark:bg-zinc-900 ${ACCENTS[lead.columnId]} ${
                focused ? "border-sky-500 ring-2 ring-sky-500" : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start gap-4">
                <span className="w-6 pt-0.5 text-sm font-semibold text-zinc-400">{rank + 1}</span>
                <div className="flex-1">
                  {focused && (
                    <p className="mb-1 text-xs font-semibold tracking-wide text-sky-600 uppercase dark:text-sky-400">
                      {t("now")}
                    </p>
                  )}
                  <p className="break-words whitespace-pre-wrap">{lead.text}</p>
                  {members.length > 0 && (
                    <ul className="mt-2 flex flex-col gap-1 border-l-2 border-zinc-200 pl-3 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                      {members.map((m) => (
                        <li key={m.id} className="break-words whitespace-pre-wrap">
                          {m.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-xs text-zinc-500">{tb(`columns.${lead.columnId}`)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    <span aria-hidden>{lead.votes ?? 0}</span>
                    <span className="sr-only">{t("votes", { count: lead.votes ?? 0 })}</span>
                  </span>
                  <button
                    onClick={() => onMakeAction(lead)}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium whitespace-nowrap transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    {t("makeAction")}
                  </button>
                  {isFacilitator && (
                    <button
                      onClick={() => void actions.facilitator.focus(focused ? null : lead.id)}
                      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      {focused ? t("unfocus") : t("focus")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {groups.length === 0 && <p className="text-center text-zinc-500">{t("empty")}</p>}
    </section>
  );
}
