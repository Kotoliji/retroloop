"use client";

import { LIMITS, STAGES } from "@retro/shared";
import { useTranslations } from "next-intl";
import { votesUsed } from "@/lib/board-state";
import { useIsFacilitator, useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { Timer } from "./Timer";

const TIMER_PRESETS = [3, 5, 10];

const button =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function StageBar({ actions }: { actions: RoomActions }) {
  const t = useTranslations("Stage");
  const tc = useTranslations("Common");
  const retro = useRetroStore((s) => s.retro);
  const used = useRetroStore((s) => votesUsed(s.cards));
  const isFacilitator = useIsFacilitator();
  if (!retro) return null;

  // The review stage exists only when earlier retros left open action items.
  const stages = STAGES.filter((stage) => stage !== "review" || retro.hasReview);
  const index = stages.indexOf(retro.stage);
  const next = stages[index + 1];
  const previous = stages[index - 1];
  const { facilitator } = actions;

  return (
    <section
      aria-label={t("progress")}
      className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ol className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 text-sm">
          {stages.map((stage, i) => (
            <li
              key={stage}
              aria-current={stage === retro.stage ? "step" : undefined}
              className={`rounded-full px-3 py-1 whitespace-nowrap ${
                stage === retro.stage
                  ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              {i < index && <span aria-label={t("done")}>✓ </span>}
              {t(`labels.${stage}`)}
            </li>
          ))}
        </ol>

        <Timer />

        {retro.stage === "vote" && (
          <p className="text-sm font-medium" aria-live="polite">
            {t("votesLeft", { left: retro.votesPerPerson - used, total: retro.votesPerPerson })}
          </p>
        )}

        {isFacilitator && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {previous && (
              <button className={button} onClick={() => void facilitator.setStage(previous)}>
                {tc("back")}
              </button>
            )}
            {next && (
              <button
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                onClick={() => void facilitator.setStage(next)}
              >
                {retro.stage !== "done" && t(`next.${retro.stage}`)}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>{t(`hints.${retro.stage}`)}</p>

        {isFacilitator && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="sr-only">{t("timer")}</span>
            {retro.timerEndsAt === null ? (
              TIMER_PRESETS.map((minutes) => (
                <button key={minutes} className={button} onClick={() => void facilitator.startTimer(minutes * 60)}>
                  {t("minutes", { count: minutes })}
                </button>
              ))
            ) : (
              <button className={button} onClick={() => void facilitator.stopTimer()}>
                {t("stopTimer")}
              </button>
            )}

            {(retro.stage === "review" || retro.stage === "write" || retro.stage === "group") && (
              <label className="flex items-center gap-2">
                {t("votesEach")}
                <select
                  value={retro.votesPerPerson}
                  onChange={(e) => void facilitator.setVotesPerPerson(Number(e.target.value))}
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  {Array.from({ length: LIMITS.maxVotesPerPerson }, (_, i) => i + 1).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
