"use client";

import { LIMITS, type RetroSummary } from "@retro/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SERVER_URL } from "@/lib/socket";

export function CreateRetroForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/retros`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const retro: RetroSummary = await res.json();
      router.push(`/r/${retro.id}`);
    } catch {
      setError("Could not create the retro. Is the server running?");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-3 sm:flex-row">
      <label htmlFor="retro-title" className="sr-only">
        Retro name
      </label>
      <input
        id="retro-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Sprint 42 retro"
        maxLength={LIMITS.titleLength}
        required
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
      />
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="rounded-lg bg-zinc-900 px-5 py-3 font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {busy ? "Creating…" : "Start a retro"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}
