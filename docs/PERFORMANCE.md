# Performance

## Setup

The production stack from `docker-compose.prod.yml`, run locally: **two server
instances** behind Caddy over HTTPS, with PostgreSQL 18 and Redis 8 in Docker
Desktop on a Windows laptop. The load generator
([`apps/server/scripts/load-test.ts`](../apps/server/scripts/load-test.ts)) runs
on the same laptop, so these numbers include its own CPU use and are a
conservative picture, not a benchmark of a dedicated server.

```bash
# in .env.prod: SERVER_REPLICAS=2 and CREATE_LIMIT_PER_MINUTE=1000
docker compose -p retroloop-prod -f docker-compose.prod.yml --env-file .env.prod up -d --build
npm run load-test -w @retro/server -- --url https://api.localhost:8443 --retros 50 --people 10 --cards 5 --spread 10 --insecure
```

Scenario: **50 retros × 10 people = 500 WebSocket connections**, everyone writing
5 cards over 10 seconds (2,500 cards, 22,500 deliveries to other participants),
then each facilitator reveals the board.

"Card → everyone else" is what a participant feels: from one person posting a
card to each other person in the retro receiving it.

## Results

| | p50 | p95 | p99 | errors |
|---|---|---|---|---|
| Card → everyone else, **before** | 370 ms | 692 ms | 715 ms | 0 |
| Card → everyone else, **after** | 21 ms | 130 ms | 161 ms | 0 |
| Join a retro | 70 ms | 202 ms | 248 ms | 0 |
| Reveal → everyone | 15 ms | 37 ms | 45 ms | 0 |

(After: second of two consecutive runs; the first, with cold connection pools,
measured 103 / 263 / 288 ms.)

Requests were spread evenly by Caddy: each instance handled 25 of the 50 retro
creations, and participants of one retro were connected to both instances.

## What changed between "before" and "after"

Every participant must see a card *as they are allowed to see it*: other
people's text is withheld while writing, and the author is never sent. The
first version did this the straightforward way for every card:

1. ask all instances, through Redis, which sockets are in the retro (`fetchSockets`),
2. build a view for each viewer,
3. send each view separately — one Redis publish per participant.

With 10 people that is a cross-instance round trip plus 10 publishes per card,
and under load those queue up.

But until a card has votes, everyone except its author sees exactly the same
thing. So the common case now sends **two broadcasts**: one to the retro's room
excluding the author's sockets, and one to a per-participant room that holds all
of the author's tabs. No questions to other instances, two publishes instead of
ten. The per-viewer path is kept for the rare case where it matters — a card
that already has votes is edited after the facilitator steps back from voting —
and a test covers it.

## Limits, as tested

- One socket is limited to bursts of 40 events and 10 a second sustained; in the
  scenario above no event was rejected.
- Presence (who is online) is computed from the live sockets across instances,
  so it costs one `fetchSockets` per join and leave — which is why joining is
  the slowest operation here.
