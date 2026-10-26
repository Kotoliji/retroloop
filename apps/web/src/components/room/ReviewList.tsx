"use client";

import type { ActionItemView, ActionStatus } from "@retro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { addDays, formatDay, today } from "@/lib/dates";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { TeamScore } from "./TeamScore";

/** The review stage: what happened to the items agreed in earlier retros. */
export function ReviewList({ actions }: { actions: RoomActions }) {
  const all = useRetroStore((s) => s.actions);
  const items = useMemo(() => all.filter((a) => !a.fromThisRetro), [all]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <TeamScore />
      </div>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <ReviewItem key={item.id} item={item} actions={actions} />
        ))}
      </ul>
    </main>
  );
}

const CHOICES: { status: ActionStatus; label: "done" | "notYet" | "drop"; active: string }[] = [
  { status: "done", label: "done", active: "bg-emerald-600 text-white border-emerald-600" },
  { status: "open", label: "notYet", active: "bg-amber-500 text-white border-amber-500" },
  { status: "dropped", label: "drop", active: "bg-zinc-600 text-white border-zinc-600" },
];

function ReviewItem({ item, actions }: { item: ActionItemView; actions: RoomActions }) {
  const t = useTranslations("Review");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const overdue = item.status === "open" && item.dueDate < today();
  const [newDate, setNewDate] = useState(() => addDays(today(), 14));

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="break-words">{item.text}</p>
      <p className="mt-1 text-sm text-zinc-500">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.ownerName}</span> ·{" "}
        {tc("due", { date: formatDay(item.dueDate, locale) })}
        {overdue && <span className="ml-2 font-medium text-red-600">{t("overdue")}</span>}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label={t("outcome", { text: item.text })}>
        {CHOICES.map(({ status, label, active }) => (
          <button
            key={status}
            aria-pressed={item.reviewedHere && item.status === status}
            onClick={() =>
              void actions.actionItems.review({
                id: item.id,
                status,
                ...(status === "open" ? { dueDate: newDate } : {}),
              })
            }
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              item.reviewedHere && item.status === status ? active : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {t(label)}
          </button>
        ))}
        {item.reviewedHere && item.status === "open" && (
          <label className="ml-auto flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t("newDate")}
            <input
              type="date"
              value={newDate}
              min={today()}
              onChange={(e) => {
                setNewDate(e.target.value);
                void actions.actionItems.review({ id: item.id, status: "open", dueDate: e.target.value });
              }}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        )}
      </div>
    </li>
  );
}
