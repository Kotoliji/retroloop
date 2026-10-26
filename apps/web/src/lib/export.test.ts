import type { ActionItemView, CardView, RetroMeta } from "@retro/shared";
import { describe, expect, it } from "vitest";
import { githubIssueUrl, isGithubRepo, toIcs, toJiraCsv, toMarkdown, type ExportLabels } from "./export";

const en: ExportLabels = {
  actionItems: "Action items",
  noneAgreed: "None agreed.",
  topics: "Topics",
  noCards: "No cards.",
  earlier: "Earlier action items",
  due: (date) => `due ${date}`,
  votes: (count) => `${count} ${count === 1 ? "vote" : "votes"}`,
  owner: (name) => `Owner: ${name}`,
  agreedIn: (retro) => `Agreed in ${retro}.`,
  calendarTitle: (text) => `Due: ${text}`,
  retroTitle: (number) => `Retro ${number}`,
};

const meta = { teamName: "Platform", number: 4 } as RetroMeta;

const action = (text: string, extra: Partial<ActionItemView> = {}): ActionItemView => ({
  id: "6f1c0b1e-0000-4000-8000-000000000001",
  text,
  ownerName: "Bob",
  dueDate: "2026-11-09",
  status: "open",
  sourceCardId: null,
  fromThisRetro: true,
  reviewedHere: false,
  reminder: false,
  reminderSent: false,
  createdAt: "2026-10-26T10:00:00Z",
  ...extra,
});

const card = (text: string, votes: number): CardView => ({
  id: text,
  columnId: "to-improve",
  text,
  mine: false,
  groupId: null,
  createdAt: "",
  myVotes: 0,
  votes,
});

describe("toMarkdown", () => {
  it("lists agreed items, ranked topics and reviewed items", () => {
    const md = toMarkdown(
      meta,
      [{ lead: card("CI is slow", 3), members: [card("Builds queue", 0)] }],
      [action("Cache dependencies"), action("Old item", { fromThisRetro: false, status: "done" })],
      "2026-10-26",
      en,
    );
    expect(md).toBe(
      [
        "# Platform · Retro 4 — 2026-10-26",
        "",
        "## Action items",
        "",
        "- [ ] Cache dependencies — **Bob**, due 2026-11-09",
        "",
        "## Topics",
        "",
        "1. CI is slow — 3 votes",
        "   - Builds queue",
        "",
        "## Earlier action items",
        "",
        "- [x] Old item — Bob",
        "",
      ].join("\n"),
    );
  });
});

describe("toJiraCsv", () => {
  it("quotes every field and escapes quotes", () => {
    const csv = toJiraCsv(meta, [action('Rename the "deploy" job, finally')], en);
    expect(csv.split("\r\n")[1]).toBe(
      '"Rename the ""deploy"" job, finally","Owner: Bob. Agreed in Platform · Retro 4.","2026-11-09","retro"',
    );
  });

  it("leaves out items carried over from earlier retros", () => {
    expect(toJiraCsv(meta, [action("Old", { fromThisRetro: false })], en).trim().split("\r\n")).toHaveLength(1);
  });
});

describe("toIcs", () => {
  it("makes an all-day event on the due date with escaped text", () => {
    const ics = toIcs(meta, action("Write runbook; then, review it"), en, new Date("2026-10-26T12:00:00.000Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261109\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261110\r\n");
    expect(ics).toContain("SUMMARY:Due: Write runbook\\; then\\, review it\r\n");
    expect(ics).toContain("DTSTAMP:20261026T120000Z\r\n");
  });

  it("rolls the end date over month boundaries", () => {
    expect(toIcs(meta, action("x", { dueDate: "2026-12-31" }), en)).toContain("DTEND;VALUE=DATE:20270101");
  });
});

describe("github", () => {
  it("accepts owner/repo only", () => {
    expect(isGithubRepo("acme/platform")).toBe(true);
    expect(isGithubRepo("https://github.com/acme/platform")).toBe(false);
  });

  it("prefills a new issue", () => {
    const url = new URL(githubIssueUrl("acme/platform", meta, action("Cache deps"), en));
    expect(url.pathname).toBe("/acme/platform/issues/new");
    expect(url.searchParams.get("title")).toBe("Cache deps");
    expect(url.searchParams.get("body")).toContain("Owner: Bob");
  });
});
