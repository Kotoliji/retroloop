"use client";

import type { ActionItemView } from "@retro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";

/** Opt-in: one e-mail the day before the due date, then the address is deleted. */
export function ReminderControl({ item, actions }: { item: ActionItemView; actions: RoomActions }) {
  const t = useTranslations("Reminder");
  const locale = useLocale();
  const enabled = useRetroStore((s) => s.features.reminders);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!enabled || item.status !== "open") return null;
  if (item.reminderSent) return <p className="mt-2 text-sm text-zinc-500">{t("sent")}</p>;

  if (item.reminder) {
    return (
      <p className="mt-2 flex items-center gap-3 text-sm text-emerald-700 dark:text-emerald-400">
        ✓ {t("set")}
        <button
          onClick={() => void actions.actionItems.remind({ id: item.id, email: null })}
          className="font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          {t("cancel")}
        </button>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-sm font-medium text-sky-700 hover:underline dark:text-sky-400"
      >
        {t("ask")}
      </button>
    );
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
        if (await actions.actionItems.remind({ id: item.id, email, locale })) setOpen(false);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">
          {t("label")}
        </label>
        <input
          id={id}
          name="email"
          type="email"
          required
          autoFocus
          placeholder="name@example.com"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("save")}
        </button>
      </div>
      <p className="text-xs text-zinc-500">{t("hint")}</p>
    </form>
  );
}
