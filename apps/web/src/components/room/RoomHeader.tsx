"use client";

import { useState } from "react";
import { useIsFacilitator, useRetroStore } from "@/lib/retro-store";
import type { RoomActions } from "@/lib/use-retro-room";

export function RoomHeader({ actions }: { actions: RoomActions }) {
  const retro = useRetroStore((s) => s.retro);
  const status = useRetroStore((s) => s.status);
  const participants = useRetroStore((s) => s.participants);
  const me = useRetroStore((s) => s.me);
  const facilitatorId = useRetroStore((s) => s.retro?.facilitatorId);
  const isFacilitator = useIsFacilitator();
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked; the address bar still has the link
    }
  }

  const online = participants.filter((p) => p.online);

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
      <h1 className="text-lg font-semibold">
        {retro?.teamName} <span className="font-normal text-zinc-500">· {retro?.title}</span>
      </h1>

      <ul className="flex flex-1 flex-wrap items-center gap-1.5" aria-label={`${online.length} online`}>
        {online.map((p) => (
          <li
            key={p.id}
            title={p.name}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              p.id === me?.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {p.id === facilitatorId && (
              <span title="Facilitator" aria-label="facilitator" className="mr-1">
                ★
              </span>
            )}
            {p.name}
            {p.id === me?.id && <span className="sr-only"> (you)</span>}
            {isFacilitator && p.id !== me?.id && (
              <button
                onClick={() => {
                  if (window.confirm(`Make ${p.name} the facilitator?`)) void actions.facilitator.handover(p.id);
                }}
                className="ml-1.5 underline-offset-2 hover:underline"
              >
                make facilitator
              </button>
            )}
          </li>
        ))}
      </ul>

      {status !== "joined" && (
        <p role="status" className="text-sm text-amber-600 dark:text-amber-400">
          Reconnecting…
        </p>
      )}

      <button
        onClick={copyLink}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {copied ? "Link copied" : "Copy invite link"}
      </button>
    </header>
  );
}
