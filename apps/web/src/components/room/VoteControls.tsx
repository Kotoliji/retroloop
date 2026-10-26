"use client";

import type { CardView } from "@retro/shared";
import { useTranslations } from "next-intl";
import { votesUsed } from "@/lib/board-state";
import { useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";

export function VoteControls({ card, actions }: { card: CardView; actions: RoomActions }) {
  const t = useTranslations("Board");
  const left = useRetroStore((s) => (s.retro?.votesPerPerson ?? 0) - votesUsed(s.cards));
  const topic = card.text ?? t("thisTopic");

  return (
    <div className="flex items-center justify-between border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: card.myVotes }, (_, i) => (
          <span key={i} className="size-2.5 rounded-full bg-sky-500" />
        ))}
      </span>
      <span className="sr-only">{t("yourVotes", { count: card.myVotes })}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => void actions.vote(card, -1)}
          disabled={card.myVotes === 0}
          aria-label={t("unvote", { topic })}
          className="size-8 rounded-lg border border-zinc-300 text-lg leading-none transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          −
        </button>
        <button
          onClick={() => void actions.vote(card, 1)}
          disabled={left <= 0}
          aria-label={t("voteFor", { topic })}
          className="size-8 rounded-lg bg-sky-600 text-lg leading-none text-white transition hover:bg-sky-500 disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}
