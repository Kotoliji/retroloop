"use client";

import { LIMITS } from "@retro/shared";
import { useTranslations } from "next-intl";
import { saveName } from "@/lib/storage";

/**
 * The input is uncontrolled and read on submit: on a slow phone people start
 * typing before the page hydrates, and controlled state would not see that text.
 */
export function NameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const t = useTranslations("Join");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    saveName(name);
    onSubmit(name);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <label className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t("nameLabel")}
          <input
            name="name"
            autoFocus
            maxLength={LIMITS.nameLength}
            required
            pattern=".*\S.*"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("submit")}
        </button>
      </form>
    </main>
  );
}
