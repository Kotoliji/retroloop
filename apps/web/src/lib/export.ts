import type { ActionItemView, RetroMeta } from "@retro/shared";
import type { CardGroup } from "./board-state";

const STATUS_MARK = { open: "[ ]", done: "[x]", dropped: "[-]" } as const;

export function retroName(meta: Pick<RetroMeta, "teamName" | "title">) {
  return `${meta.teamName} · ${meta.title}`;
}

/** The whole retro as Markdown, ready to paste into a wiki, a ticket or chat. */
export function toMarkdown(meta: RetroMeta, topics: CardGroup[], actions: ActionItemView[], date: string) {
  const agreed = actions.filter((a) => a.fromThisRetro);
  const reviewed = actions.filter((a) => !a.fromThisRetro);
  const lines = [`# ${retroName(meta)} — ${date}`, "", "## Action items", ""];

  if (agreed.length === 0) lines.push("_None agreed._");
  for (const a of agreed) lines.push(`- [ ] ${a.text} — **${a.ownerName}**, due ${a.dueDate}`);

  lines.push("", "## Topics", "");
  if (topics.length === 0) lines.push("_No cards._");
  topics.forEach(({ lead, members }, i) => {
    lines.push(`${i + 1}. ${lead.text} — ${lead.votes ?? 0} votes`);
    for (const m of members) lines.push(`   - ${m.text}`);
  });

  if (reviewed.length > 0) {
    lines.push("", "## Earlier action items", "");
    for (const a of reviewed) lines.push(`- ${STATUS_MARK[a.status]} ${a.text} — ${a.ownerName}`);
  }
  return lines.join("\n") + "\n";
}

const csvField = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** CSV in the shape Jira's issue importer maps without extra setup. */
export function toJiraCsv(meta: RetroMeta, actions: ActionItemView[]) {
  const rows = [["Summary", "Description", "Due Date", "Labels"]];
  for (const a of actions.filter((x) => x.fromThisRetro)) {
    rows.push([a.text, `Owner: ${a.ownerName}. Agreed in ${retroName(meta)}.`, a.dueDate, "retro"]);
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
export function toIcs(meta: RetroMeta, action: ActionItemView, now = new Date()) {
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
    `SUMMARY:${icsText(`Due: ${action.text}`)}`,
    `DESCRIPTION:${icsText(`Owner: ${action.ownerName}. Agreed in ${retroName(meta)}.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export const isGithubRepo = (repo: string) => /^[\w.-]+\/[\w.-]+$/.test(repo);

/** A prefilled "new issue" page; nothing is created until the user submits it. */
export function githubIssueUrl(repo: string, meta: RetroMeta, action: ActionItemView) {
  const params = new URLSearchParams({
    title: action.text,
    body: `Owner: ${action.ownerName}\nDue: ${action.dueDate}\n\nAgreed in ${retroName(meta)}.`,
  });
  return `https://github.com/${repo}/issues/new?${params}`;
}
