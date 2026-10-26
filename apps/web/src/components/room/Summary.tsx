"use client";

import type { ActionItemView, RetroMeta } from "@retro/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { rankGroups } from "@/lib/board-state";
import { formatDay, today } from "@/lib/dates";
import { githubIssueUrl, isGithubRepo, retroName, toIcs, toJiraCsv, toMarkdown } from "@/lib/export";
import { useIsFacilitator, useRetroStore } from "@/lib/retro-store";
import { saveGithubRepo, saveHostKey, savedGithubRepo } from "@/lib/storage";
import type { RoomActions } from "@/lib/use-retro-room";
import { TeamScore } from "./TeamScore";

function download(filename: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (meta: RetroMeta) => `${meta.teamName}-${meta.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const button =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** The last stage: what was agreed, exports, and the way to the next retro. */
export function Summary({ actions }: { actions: RoomActions }) {
  const meta = useRetroStore((s) => s.retro)!;
  const cards = useRetroStore((s) => s.cards);
  const all = useRetroStore((s) => s.actions);
  const isFacilitator = useIsFacilitator();
  const router = useRouter();
  const topics = useMemo(() => rankGroups(cards), [cards]);
  const agreed = useMemo(() => all.filter((a) => a.fromThisRetro), [all]);
  const [copied, setCopied] = useState(false);
  const [repo, setRepo] = useState(savedGithubRepo);
  const [starting, setStarting] = useState(false);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(toMarkdown(meta, topics, all, today()));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      download(`${slug(meta)}.md`, "text/markdown", toMarkdown(meta, topics, all, today()));
    }
  }

  async function startNext() {
    setStarting(true);
    const next = await actions.facilitator.nextRetro();
    setStarting(false);
    if (!next) return;
    saveHostKey(next.id, next.hostKey);
    router.push(`/r/${next.id}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-6">
      <section aria-labelledby="agreed-title" className="flex flex-col gap-3">
        <h2 id="agreed-title" className="text-xl font-semibold">
          What {meta.teamName} agreed to do
        </h2>
        {agreed.length === 0 && <p className="text-zinc-500">No action items were agreed in this retro.</p>}
        <ul className="flex flex-col gap-3">
          {agreed.map((item) => (
            <AgreedItem key={item.id} item={item} meta={meta} repo={isGithubRepo(repo) ? repo : null} />
          ))}
        </ul>
      </section>

      <section aria-label="Export" className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => void copyMarkdown()}>
            {copied ? "Copied" : "Copy as Markdown"}
          </button>
          <button
            className={button}
            onClick={() => download(`${slug(meta)}-jira.csv`, "text/csv", toJiraCsv(meta, all))}
            disabled={agreed.length === 0}
          >
            Download CSV for Jira
          </button>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          GitHub repository for issue links
          <input
            value={repo}
            onChange={(e) => {
              setRepo(e.target.value.trim());
              saveGithubRepo(e.target.value.trim());
            }}
            placeholder="owner/repo"
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      </section>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <TeamScore />
      </section>

      <section className="flex flex-wrap items-center gap-3">
        {isFacilitator ? (
          <button
            onClick={() => void startNext()}
            disabled={starting}
            className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {meta.nextRetroId ? "Go to the next retro" : "Start the next retro"}
          </button>
        ) : meta.nextRetroId ? (
          <Link
            href={`/r/${meta.nextRetroId}`}
            className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Join the next retro
          </Link>
        ) : (
          <p className="text-sm text-zinc-500">
            The facilitator starts the next retro when it&apos;s time; it will open with these items.
          </p>
        )}
      </section>
    </main>
  );
}

function AgreedItem({ item, meta, repo }: { item: ActionItemView; meta: RetroMeta; repo: string | null }) {
  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="break-words">{item.text}</p>
      <p className="mt-1 text-sm text-zinc-500">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.ownerName}</span> · due{" "}
        {formatDay(item.dueDate)}
      </p>
      <div className="mt-2 flex gap-4 text-sm">
        <button
          onClick={() => download(`action-${item.dueDate}.ics`, "text/calendar", toIcs(meta, item))}
          className="font-medium text-sky-700 hover:underline dark:text-sky-400"
          aria-label={`Add "${item.text}" to calendar`}
        >
          Add to calendar
        </button>
        {repo && (
          <a
            href={githubIssueUrl(repo, meta, item)}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-700 hover:underline dark:text-sky-400"
            aria-label={`Open a GitHub issue for "${item.text}" in ${retroName(meta)}`}
          >
            Open GitHub issue
          </a>
        )}
      </div>
    </li>
  );
}
