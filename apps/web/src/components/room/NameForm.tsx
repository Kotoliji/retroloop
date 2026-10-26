"use client";

import { LIMITS } from "@retro/shared";
import { useState } from "react";
import { saveName } from "@/lib/storage";

export function NameForm({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    saveName(trimmed);
    onSubmit(trimmed);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Join the retro</h1>
        <label className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          Your name, as the team will see it
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.nameLength}
            required
            className="rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <button
          type="submit"
          disabled={!name.trim()}
          className="rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Join
        </button>
      </form>
    </main>
  );
}
