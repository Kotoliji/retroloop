"use client";

import { LIMITS } from "@retro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";

const RATINGS = [1, 2, 3, 4, 5] as const;

/** "How useful was this retro?" — the source of the product's reviews. */
export function SurveyForm({ actions }: { actions: RoomActions }) {
  const t = useTranslations("Survey");
  const locale = useLocale();
  const saved = useRetroStore((s) => s.survey);
  const [rating, setRating] = useState<number | null>(saved?.rating ?? null);
  const [comment, setComment] = useState(saved?.comment ?? "");
  const [quotable, setQuotable] = useState(saved?.quotable ?? false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (rating === null) return;
    setBusy(true);
    const ok = await actions.submitSurvey({ rating, comment, quotable, locale });
    setBusy(false);
    setSent(ok);
  }

  return (
    <section
      aria-labelledby="survey-title"
      className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30"
    >
      <h2 id="survey-title" className="font-semibold">
        {t("title")}
      </h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">{t("title")}</legend>
          {RATINGS.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer flex-col items-center rounded-lg border px-3 py-2 text-sm transition has-focus-visible:ring-2 has-focus-visible:ring-emerald-500 ${
                rating === value
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              }`}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
              />
              <span className="text-lg font-semibold">{value}</span>
              <span className="text-xs">{t(`ratings.${value}`)}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          {t("commentLabel")}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={LIMITS.surveyCommentLength}
            rows={2}
            className="resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={quotable} onChange={(e) => setQuotable(e.target.checked)} />
          {t("quotable")}
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={rating === null || busy}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-40"
          >
            {saved ? t("update") : t("submit")}
          </button>
          {sent && (
            <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">
              {t("thanks")}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
