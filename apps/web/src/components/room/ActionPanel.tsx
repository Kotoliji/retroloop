"use client";

import { LIMITS, type ActionItemView, type CardView } from "@retro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatDay } from "@/lib/dates";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { ActionForm } from "./ActionForm";

interface Props {
  actions: RoomActions;
  source: CardView | null;
  onClearSource(): void;
}

/** The action items agreed in this retro, next to the discussion. */
export function ActionPanel({ actions, source, onClearSource }: Props) {
  const t = useTranslations("Actions");
  const all = useRetroStore((s) => s.actions);
  const items = useMemo(() => all.filter((a) => a.fromThisRetro), [all]);
  const full = items.length >= LIMITS.maxActionsPerRetro;

  return (
    <aside
      aria-labelledby="actions-title"
      className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <div>
        <h2 id="actions-title" className="flex items-baseline justify-between font-semibold">
          {t("title")}
          <span className="text-sm font-normal text-zinc-500">
            {t("count", { count: items.length, max: LIMITS.maxActionsPerRetro })}
          </span>
        </h2>
        <p className="mt-1 text-xs text-zinc-500">{t("rule")}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <ActionRow key={item.id} item={item} actions={actions} />
        ))}
      </ul>

      {full ? (
        <p className="text-sm text-zinc-500">{t("full")}</p>
      ) : (
        <ActionForm
          submitLabel={t("add")}
          source={source?.text ? { text: source.text, onClear: onClearSource } : undefined}
          onSubmit={async (draft) => {
            const saved = await actions.actionItems.add({
              id: crypto.randomUUID(),
              ...draft,
              sourceCardId: source?.id ?? null,
            });
            if (saved) onClearSource();
            return saved;
          }}
        />
      )}
    </aside>
  );
}

function ActionRow({ item, actions }: { item: ActionItemView; actions: RoomActions }) {
  const tc = useTranslations("Common");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="rounded-lg border border-zinc-900 bg-white p-3 dark:border-zinc-300 dark:bg-zinc-900">
        <ActionForm
          initial={item}
          submitLabel={tc("save")}
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            const saved = await actions.actionItems.edit({ id: item.id, ...draft });
            if (saved) setEditing(false);
            return saved;
          }}
        />
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="break-words">{item.text}</p>
      <p className="mt-1 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.ownerName}</span> ·{" "}
        {tc("due", { date: formatDay(item.dueDate, locale) })}
      </p>
      <div className="mt-2 flex gap-3 text-xs text-zinc-500">
        <button onClick={() => setEditing(true)} className="font-medium hover:text-zinc-900 dark:hover:text-zinc-100">
          {tc("edit")}
        </button>
        <button onClick={() => void actions.actionItems.remove(item.id)} className="font-medium hover:text-red-600">
          {tc("remove")}
        </button>
      </div>
    </li>
  );
}
