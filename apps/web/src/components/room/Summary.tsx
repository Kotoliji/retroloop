"use client";

import type { ActionItemView, RetroMeta } from "@retro/shared";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { rankGroups } from "@/lib/board-state";
import { formatDay, today } from "@/lib/dates";
import {
  githubIssueUrl,
  isGithubRepo,
  toIcs,
  toJiraCsv,
  toMarkdown,
  type ExportLabels,
} from "@/lib/export";
import { useIsFacilitator, useRetroStore } from "@/lib/retro-store";
import { saveGithubRepo, saveHostKey, savedGithubRepo } from "@/lib/storage";
import type { RoomActions } from "@/lib/use-retro-room";
import { SurveyForm } from "./SurveyForm";
import { TeamScore } from "./TeamScore";

function download(filename: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (meta: RetroMeta) =>
  `${meta.teamName}-${meta.number}`.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-");

const button =
  "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

function useExportLabels(): ExportLabels {
  const t = useTranslations("Export");
  return {
    actionItems: t("actionItems"),
    noneAgreed: t("noneAgreed"),
    topics: t("topics"),
    noCards: t("noCards"),
    earlier: t("earlier"),
    due: (date) => t("due", { date }),
    votes: (count) => t("votes", { count }),
    owner: (name) => t("owner", { name }),
    agreedIn: (retro) => t("agreedIn", { retro }),
    calendarTitle: (text) => t("calendarTitle", { text }),
    retroTitle: (number) => t("retroTitle", { number }),
  };
}

/** The last stage: what was agreed, exports, and the way to the next retro. */
export function Summary({ actions }: { actions: RoomActions }) {
  const t = useTranslations("Summary");
  const labels = useExportLabels();
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
    const markdown = toMarkdown(meta, topics, all, today(), labels);
    actions.track("export_markdown");
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      download(`${slug(meta)}.md`, "text/markdown", markdown);
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
          {t("agreedTitle", { team: meta.teamName })}
        </h2>
        {agreed.length === 0 && <p className="text-zinc-500">{t("noneAgreed")}</p>}
        <ul className="flex flex-col gap-3">
          {agreed.map((item) => (
            <AgreedItem
              key={item.id}
              item={item}
              meta={meta}
              labels={labels}
              repo={isGithubRepo(repo) ? repo : null}
              onExport={actions.track}
            />
          ))}
        </ul>
      </section>

      <section
        aria-label={t("export")}
        className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <div className="flex flex-wrap gap-2">
          <button className={button} onClick={() => void copyMarkdown()}>
            {copied ? t("copied") : t("copyMarkdown")}
          </button>
          <button
            className={button}
            onClick={() => {
              actions.track("export_csv");
              download(`${slug(meta)}-jira.csv`, "text/csv", toJiraCsv(meta, all, labels));
            }}
            disabled={agreed.length === 0}
          >
            {t("jiraCsv")}
          </button>
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          {t("githubRepo")}
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

      <SurveyForm actions={actions} />

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
            {meta.nextRetroId ? t("goToNext") : t("startNext")}
          </button>
        ) : meta.nextRetroId ? (
          <Link
            href={`/r/${meta.nextRetroId}`}
            className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {t("joinNext")}
          </Link>
        ) : (
          <p className="text-sm text-zinc-500">{t("waitNext")}</p>
        )}
      </section>

      {isFacilitator && <DangerZone actions={actions} />}
    </main>
  );
}

function DangerZone({ actions }: { actions: RoomActions }) {
  const t = useTranslations("Danger");
  return (
    <section className="mt-6 flex flex-col gap-2 rounded-xl border border-red-200 p-4 dark:border-red-900">
      <h2 className="font-semibold text-red-700 dark:text-red-400">{t("title")}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("body")}</p>
      <button
        onClick={() => {
          if (window.confirm(t("confirm"))) void actions.facilitator.deleteRetro();
        }}
        className="self-start rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      >
        {t("button")}
      </button>
    </section>
  );
}

interface AgreedItemProps {
  item: ActionItemView;
  meta: RetroMeta;
  labels: ExportLabels;
  repo: string | null;
  onExport: RoomActions["track"];
}

function AgreedItem({ item, meta, labels, repo, onExport }: AgreedItemProps) {
  const t = useTranslations("Summary");
  const tc = useTranslations("Common");
  const locale = useLocale();

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="break-words">{item.text}</p>
      <p className="mt-1 text-sm text-zinc-500">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.ownerName}</span> ·{" "}
        {tc("due", { date: formatDay(item.dueDate, locale) })}
      </p>
      <div className="mt-2 flex gap-4 text-sm">
        <button
          onClick={() => {
            onExport("export_ics");
            download(`action-${item.dueDate}.ics`, "text/calendar", toIcs(meta, item, labels));
          }}
          className="font-medium text-sky-700 hover:underline dark:text-sky-400"
          aria-label={t("calendarLabel", { text: item.text })}
        >
          {t("calendar")}
        </button>
        {repo && (
          <a
            href={githubIssueUrl(repo, meta, item, labels)}
            target="_blank"
            rel="noreferrer"
            onClick={() => onExport("export_github")}
            className="font-medium text-sky-700 hover:underline dark:text-sky-400"
            aria-label={t("githubIssueLabel", { text: item.text })}
          >
            {t("githubIssue")}
          </a>
        )}
      </div>
    </li>
  );
}
