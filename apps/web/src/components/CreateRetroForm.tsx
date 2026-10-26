"use client";

import { LIMITS, type CreatedRetro } from "@retro/shared";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { SERVER_URL } from "@/lib/socket";
import { saveHostKey } from "@/lib/storage";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * Starts a new team with its first retro and takes the creator into it as
 * facilitator. The input is uncontrolled and read on submit, so text typed
 * before the static page hydrates is not lost.
 */
export function CreateRetroForm({ inverted = false }: { inverted?: boolean }) {
  const t = useTranslations("CreateRetro");
  const router = useRouter();
  const id = useId();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const teamName = String(new FormData(event.currentTarget).get("teamName") ?? "").trim();
    if (!teamName) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`${SERVER_URL}/retros`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teamName }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const retro: CreatedRetro = await res.json();
      saveHostKey(retro.id, retro.hostKey);
      router.push(`/r/${retro.id}`);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:flex-wrap">
      <label htmlFor={id} className="sr-only">
        {t("teamName")}
      </label>
      <input
        id={id}
        name="teamName"
        pattern=".*\S.*"
        placeholder={t("placeholder")}
        maxLength={LIMITS.titleLength}
        required
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-300"
      />
      <button
        type="submit"
        disabled={busy || !hydrated}
        className={`rounded-lg px-5 py-3 font-medium transition disabled:opacity-50 ${
          inverted
            ? "bg-white text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-700"
            : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        }`}
      >
        {busy ? t("creating") : t("submit")}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full">
          {t("error")}
        </p>
      )}
    </form>
  );
}
