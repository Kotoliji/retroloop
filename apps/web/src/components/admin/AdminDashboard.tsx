"use client";

import type { AdminStats } from "@retro/shared";
import { useState, useSyncExternalStore } from "react";
import { SERVER_URL } from "@/lib/socket";

const TOKEN_KEY = "retroloop:admin-token";
const noSubscribe = () => () => {};

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // kept only for this page view
  }
}

type State = { kind: "idle" } | { kind: "loading" } | { kind: "denied" } | { kind: "error" } | { kind: "ready"; stats: AdminStats };

export function AdminDashboard() {
  // A token saved earlier in this tab; sessionStorage exists only in the browser.
  const saved = useSyncExternalStore(noSubscribe, readToken, () => null);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function load(token: string) {
    try {
      const res = await fetch(`${SERVER_URL}/admin/stats`, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 404) {
        saveToken(null);
        return setState({ kind: "denied" });
      }
      if (!res.ok) return setState({ kind: "error" });
      saveToken(token);
      setState({ kind: "ready", stats: await res.json() });
    } catch {
      setState({ kind: "error" });
    }
  }

  if (state.kind !== "ready") {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Retroloop stats</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const token = String(new FormData(e.currentTarget).get("token") ?? "").trim();
            if (!token) return;
            setState({ kind: "loading" });
            void load(token);
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            Admin token
            <input
              name="token"
              type="password"
              defaultValue={saved ?? ""}
              autoComplete="off"
              required
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>
          <button className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            {state.kind === "loading" ? "Loading…" : "Show stats"}
          </button>
          {state.kind === "denied" && (
            <p role="alert" className="text-sm text-red-600">
              That token was not accepted.
            </p>
          )}
          {state.kind === "error" && (
            <p role="alert" className="text-sm text-red-600">
              Could not reach the server.
            </p>
          )}
        </form>
      </main>
    );
  }

  return (
    <Dashboard
      stats={state.stats}
      onSignOut={() => {
        saveToken(null);
        setState({ kind: "idle" });
      }}
    />
  );
}

const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function Dashboard({ stats, onSignOut }: { stats: AdminStats; onSignOut: () => void }) {
  const { funnel, activity, survey, followThrough, weekly } = stats;
  const reviewed = followThrough.done + followThrough.notYet + followThrough.dropped;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Retroloop stats</h1>
        <button onClick={onSignOut} className="text-sm text-zinc-500 hover:underline">
          Sign out
        </button>
      </header>

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Teams" value={funnel.teams} />
        <Tile label="People joined" value={activity.participants} />
        <Tile
          label="Survey"
          value={survey.average === null ? "—" : `${survey.average.toFixed(1)} / 5`}
          note={`${survey.answers} answers`}
        />
        <Tile
          label="Follow-through"
          value={reviewed ? `${percent(followThrough.done, reviewed)}%` : "—"}
          note={`${followThrough.done} of ${reviewed} reviewed items done`}
        />
      </section>

      <Panel title="How far teams get" description="Teams created → retros reaching each point">
        <Bars
          rows={[
            { label: "Teams created", value: funnel.teams },
            { label: "Reached the discussion", value: funnel.reachedDiscussion },
            { label: "Finished (wrap-up)", value: funnel.completed },
            { label: "Came back for a next retro", value: funnel.nextRetros },
          ]}
          total={funnel.teams}
        />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="How useful was the retro?" description={`${survey.answers} survey answers`}>
          <Bars
            rows={survey.distribution.map((value, i) => ({ label: `${i + 1} ★`, value }))}
            total={survey.answers}
          />
        </Panel>
        <Panel title="Activity" description="All time">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Cards written", activity.cards],
              ["Action items agreed", activity.actionItems],
              ["Exports", activity.exports],
              ["Items dropped at review", followThrough.dropped],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-zinc-500">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel title="New teams per week" description="Last 12 weeks; hover a week for details">
        <Weekly weeks={weekly} />
      </Panel>

      <Panel title="What people said" description="Only comments people agreed to have quoted, never with names">
        {survey.quotes.length === 0 ? (
          <p className="text-sm text-zinc-500">No quotable comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {survey.quotes.map((q, i) => (
              <li key={i} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p>“{q.comment}”</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {q.rating} ★ · {q.date}
                  {q.locale && ` · ${q.locale}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </main>
  );
}

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-zinc-500">{note}</p>}
    </div>
  );
}

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Horizontal bars against a shared total, value and share labelled in text ink. */
function Bars({ rows, total }: { rows: { label: string; value: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <table className="w-full border-separate border-spacing-y-1.5 text-sm">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} title={`${row.label}: ${row.value} (${percent(row.value, total)}%)`}>
            <th scope="row" className="w-px pr-3 text-left font-normal whitespace-nowrap text-zinc-600 dark:text-zinc-400">
              {row.label}
            </th>
            <td className="w-full">
              <div className="h-5 rounded bg-zinc-100 dark:bg-zinc-800/60">
                <div
                  className="h-5 rounded-r bg-emerald-600 dark:bg-emerald-400"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
            </td>
            <td className="pl-3 text-right whitespace-nowrap tabular-nums">
              {row.value}
              <span className="ml-1 text-zinc-500">{percent(row.value, total)}%</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Weekly({ weeks }: { weeks: AdminStats["weekly"] }) {
  if (weeks.every((w) => w.teams === 0)) {
    return <p className="text-sm text-zinc-500">No new teams in the last 12 weeks.</p>;
  }
  const max = Math.max(1, ...weeks.map((w) => w.teams));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 border-b border-zinc-200 dark:border-zinc-800" role="list" aria-label="New teams per week">
        {weeks.map((w) => (
          <div key={w.week} role="listitem" className="group relative flex h-full flex-1 flex-col justify-end">
            <div
              className={`rounded-t bg-emerald-600 dark:bg-emerald-400 ${w.teams > 0 ? "min-h-1" : ""}`}
              style={{ height: `${(w.teams / max) * 100}%` }}
            />
            <span className="sr-only">
              Week of {w.week}: {w.teams} new teams, {w.nextRetros} next retros, {w.participants} people joined
            </span>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block dark:bg-zinc-100 dark:text-zinc-900">
              Week of {w.week}
              <br />
              {w.teams} new teams · {w.nextRetros} next retros · {w.participants} people
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-zinc-500" aria-hidden>
        <span>{weeks[0].week}</span>
        <span>{weeks.at(-1)!.week}</span>
      </div>
    </div>
  );
}
