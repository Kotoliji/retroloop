# Retroloop

Sprint retrospectives where the action items actually get done.

A real-time retrospective board for teams: everyone writes cards anonymously,
the cards are revealed, grouped and voted on, and the retro ends with a short
list of action items — each with an owner and a due date, carried into the next
retro until it is done. Participants join by link, no sign-up.

Why another retro tool: less than half of retrospective action items get
completed in most teams, and existing tools stop at the board. See
[docs/RESEARCH.md](docs/RESEARCH.md).

> Work in progress, built in small phases — see the commit history.

## Status

- [x] **Phase 0** — monorepo, realtime server with health checks, typed socket protocol, CI
- [ ] Phase 1 — live board: create a retro, share the link, cards appear for everyone instantly
- [ ] Phase 2 — retro flow: facilitator, anonymous writing → reveal → vote → discuss, timer
- [ ] Phase 3 — action items with owner and due date, carry-over, export
- [ ] Phase 4 — public launch: landing page, i18n, analytics, end-of-retro survey
- [ ] Phase 5+ — templates, reminders, scaling across instances, e2e tests, admin stats

## Stack

| Part | Tech |
|---|---|
| Web app | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Realtime server | Node.js 24, Fastify 5, Socket.IO 4 |
| Data | PostgreSQL 18 + Prisma 7, Redis 8 |
| Shared contract | `@retro/shared` — socket events and payload schemas (zod), used by both sides |
| Tooling | npm workspaces, Vitest, ESLint, tsup, Docker Compose, GitHub Actions |

```
apps/web         Next.js app (UI)
apps/server      Fastify + Socket.IO realtime server, Prisma schema and migrations
packages/shared  Wire protocol shared by web and server
docs/            Research and design notes
```

The web app and the realtime server are separate processes: Next.js serves the UI,
the server keeps the WebSocket connections and owns the board state. Every event
that crosses the wire is declared once in `packages/shared`, so a change to the
protocol fails type-checking on both sides instead of at runtime.

## Getting started

Requires Node.js 22.12+ (24 recommended) and Docker.

```bash
cp .env.example .env
npm install
npm run db:up        # PostgreSQL on :5433, Redis on :6380
npm run db:migrate
npm run dev          # web on http://localhost:3001, server on http://localhost:4000
```

The home page shows the live connection to the realtime server, its round-trip
time and the clock offset (retro timers run on server time).

`GET http://localhost:4000/health` reports each dependency and answers `503`
within a second if one of them is down.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same steps on every push, plus applying all migrations to a clean
PostgreSQL.
