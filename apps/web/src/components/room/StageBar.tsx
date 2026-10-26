"use client";

import { LIMITS, STAGES, type Stage } from "@retro/shared";
import { votesUsed } from "@/lib/board-state";
import { useIsFacilitator, useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";
import { Timer } from "./Timer";

const LABELS: Record<Stage, string> = {
  review: "Review",
  write: "Write",
  group: "Group",
  vote: "Vote",
  discuss: "Discuss",
  done: "Wrap up",
};

const HINTS: Record<Stage, string> = {
  review: "First, the action items from last time: done, not yet, or drop it?",
  write: "Write your cards. Nobody sees what you write until the facilitator reveals the board.",
  group: "Drag a card onto a similar one to group them.",
  vote: "Spend your votes on the topics you most want to talk about.",
  discuss: "Talk the topics through, most votes first, and agree on up to three action items.",
  done: "Here is what the team agreed. Export it, and start the next retro when it's time.",
};

const NEXT_LABEL: Partial<Record<Stage, string>> = {
  review: "Start writing",
  write: "Reveal cards",
  group: "Start voting",
  vote: "Show results",
  discuss: "Wrap up",
};

const TIMER_PRESETS = [3, 5, 10];

const button =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

export function StageBar({ actions }: { actions: RoomActions }) {
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
      aria-label="Retro progress"
      className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <ol className="flex items-center gap-1 text-sm">
          {stages.map((stage, i) => (
            <li
              key={stage}
              aria-current={stage === retro.stage ? "step" : undefined}
              className={`rounded-full px-3 py-1 ${
                stage === retro.stage
                  ? "bg-zinc-900 font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              {i < index && <span aria-label="done">✓ </span>}
              {LABELS[stage]}
            </li>
          ))}
        </ol>

        <Timer />

        {retro.stage === "vote" && (
          <p className="text-sm font-medium" aria-live="polite">
            {retro.votesPerPerson - used} of {retro.votesPerPerson} votes left
          </p>
        )}

        {isFacilitator && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {previous && (
              <button className={button} onClick={() => void facilitator.setStage(previous)}>
                Back
              </button>
            )}
            {next && (
              <button
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                onClick={() => void facilitator.setStage(next)}
              >
                {NEXT_LABEL[retro.stage]}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <p>{HINTS[retro.stage]}</p>

        {isFacilitator && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="sr-only">Timer</span>
            {retro.timerEndsAt === null ? (
              TIMER_PRESETS.map((minutes) => (
                <button key={minutes} className={button} onClick={() => void facilitator.startTimer(minutes * 60)}>
                  {minutes} min
                </button>
              ))
            ) : (
              <button className={button} onClick={() => void facilitator.stopTimer()}>
                Stop timer
              </button>
            )}

            {(retro.stage === "review" || retro.stage === "write" || retro.stage === "group") && (
              <label className="flex items-center gap-2">
                Votes each
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
