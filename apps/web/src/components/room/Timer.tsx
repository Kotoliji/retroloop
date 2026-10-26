"use client";

import { useEffect, useState } from "react";
import { useRetroStore } from "@/lib/retro-store";

function format(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Counts down to the server's timer end, corrected for this browser's clock. */
export function Timer() {
  const endsAt = useRetroStore((s) => s.retro?.timerEndsAt ?? null);
  const offset = useRetroStore((s) => s.clockOffset);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (endsAt === null) return null;
  const left = endsAt - (now + offset);

  return (
    <p
      role="timer"
      aria-label="Time left"
      className={`rounded-lg px-3 py-1 font-mono text-lg font-semibold tabular-nums ${
        left <= 0
          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
          : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
      }`}
    >
      {left <= 0 ? "Time's up" : format(left)}
    </p>
  );
}
