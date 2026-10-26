"use client";

import { useRetroStore } from "@/lib/retro-store";

/** How many action items from the team's earlier retros were actually done. */
export function TeamScore() {
  const { done, total } = useRetroStore((s) => s.stats);
  const number = useRetroStore((s) => s.retro?.number ?? 1);

  if (total === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {number === 1
          ? "This is the team's first retro — the follow-through score starts with the next one."
          : "No action items were agreed in earlier retros yet."}
      </p>
    );
  }

  const percent = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-4">
      <p className="text-3xl font-semibold tabular-nums">{percent}%</p>
      <div className="flex-1">
        <p className="text-sm font-medium">Follow-through</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {done} of {total} action items from earlier retros done
        </p>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Follow-through"
        >
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
