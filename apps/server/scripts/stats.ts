/**
 * Prints the product numbers as Markdown, ready for the README:
 *
 *   ADMIN_TOKEN=... npx tsx scripts/stats.ts --url https://api.retroloop.example.com
 */
import { parseArgs } from "node:util";
import type { AdminStats } from "@retro/shared";

const { values: args } = parseArgs({ options: { url: { type: "string", default: "http://localhost:4000" } } });
const token = process.env.ADMIN_TOKEN;
if (!token) throw new Error("Set ADMIN_TOKEN to the server's admin token.");

const res = await fetch(`${args.url}/admin/stats`, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`GET /admin/stats: HTTP ${res.status}`);
const { funnel, activity, survey, followThrough } = (await res.json()) as AdminStats;

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const reviewed = followThrough.done + followThrough.notYet + followThrough.dropped;

console.log(`| | |
|---|---|
| Teams that started a retro | ${funnel.teams} |
| People who joined | ${activity.participants} |
| Retros finished | ${funnel.completed} (${pct(funnel.completed, funnel.teams)} of teams) |
| Teams that came back for another retro | ${funnel.nextRetros} |
| Cards written | ${activity.cards} |
| Action items agreed | ${activity.actionItems} |
| Action items done when reviewed | ${followThrough.done} of ${reviewed} (${pct(followThrough.done, reviewed)}) |
| "How useful was this retro?" | ${survey.average === null ? "—" : `${survey.average.toFixed(1)} / 5`} from ${survey.answers} answers |
`);
for (const q of survey.quotes.slice(0, 5)) console.log(`> ${q.comment} — ${q.rating}/5\n`);
