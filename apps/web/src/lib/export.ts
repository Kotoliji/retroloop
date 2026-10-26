import type { ActionItemView, RetroMeta } from "@retro/shared";
import type { CardGroup } from "./board-state";

/** Wording for exported files, in the language of the person exporting. */
export interface ExportLabels {
  actionItems: string;
  noneAgreed: string;
  topics: string;
  noCards: string;
  earlier: string;
  due(date: string): string;
  votes(count: number): string;
  owner(name: string): string;
  agreedIn(retro: string): string;
  calendarTitle(text: string): string;
  retroTitle(number: number): string;
}

const STATUS_MARK = { open: "[ ]", done: "[x]", dropped: "[-]" } as const;

export function retroName(meta: Pick<RetroMeta, "teamName" | "number">, l: ExportLabels) {
  return `${meta.teamName} · ${l.retroTitle(meta.number)}`;
}

/** The whole retro as Markdown, ready to paste into a wiki, a ticket or chat. */
export function toMarkdown(
  meta: RetroMeta,
  topics: CardGroup[],
  actions: ActionItemView[],
  date: string,
  l: ExportLabels,
) {
  const agreed = actions.filter((a) => a.fromThisRetro);
  const reviewed = actions.filter((a) => !a.fromThisRetro);
  const lines = [`# ${retroName(meta, l)} — ${date}`, "", `## ${l.actionItems}`, ""];

  if (agreed.length === 0) lines.push(`_${l.noneAgreed}_`);
  for (const a of agreed) lines.push(`- [ ] ${a.text} — **${a.ownerName}**, ${l.due(a.dueDate)}`);

  lines.push("", `## ${l.topics}`, "");
  if (topics.length === 0) lines.push(`_${l.noCards}_`);
  topics.forEach(({ lead, members }, i) => {
    lines.push(`${i + 1}. ${lead.text} — ${l.votes(lead.votes ?? 0)}`);
    for (const m of members) lines.push(`   - ${m.text}`);
  });

  if (reviewed.length > 0) {
    lines.push("", `## ${l.earlier}`, "");
    for (const a of reviewed) lines.push(`- ${STATUS_MARK[a.status]} ${a.text} — ${a.ownerName}`);
  }
  return lines.join("\n") + "\n";
}

const csvField = (value: string) => `"${value.replaceAll('"', '""')}"`;

/**
 * CSV in the shape Jira's issue importer maps without extra setup. The header
 * stays in English because Jira matches columns by these names.
 */
export function toJiraCsv(meta: RetroMeta, actions: ActionItemView[], l: ExportLabels) {
  const rows = [["Summary", "Description", "Due Date", "Labels"]];
  for (const a of actions.filter((x) => x.fromThisRetro)) {
    rows.push([a.text, `${l.owner(a.ownerName)}. ${l.agreedIn(retroName(meta, l))}`, a.dueDate, "retro"]);
  }
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

const icsText = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");

const icsDate = (day: string) => day.replaceAll("-", "");

function nextDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** An all-day calendar event on the due date, for the owner's calendar. */
export function toIcs(meta: RetroMeta, action: ActionItemView, l: ExportLabels, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Retroloop//Action items//EN",
    "BEGIN:VEVENT",
    `UID:${action.id}@retroloop`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(action.dueDate)}`,
    `DTEND;VALUE=DATE:${icsDate(nextDay(action.dueDate))}`,
    `SUMMARY:${icsText(l.calendarTitle(action.text))}`,
    `DESCRIPTION:${icsText(`${l.owner(action.ownerName)}. ${l.agreedIn(retroName(meta, l))}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export const isGithubRepo = (repo: string) => /^[\w.-]+\/[\w.-]+$/.test(repo);

/** A prefilled "new issue" page; nothing is created until the user submits it. */
export function githubIssueUrl(repo: string, meta: RetroMeta, action: ActionItemView, l: ExportLabels) {
  const params = new URLSearchParams({
    title: action.text,
    body: `${l.owner(action.ownerName)}\n${l.due(action.dueDate)}\n\n${l.agreedIn(retroName(meta, l))}`,
  });
  return `https://github.com/${repo}/issues/new?${params}`;
}
