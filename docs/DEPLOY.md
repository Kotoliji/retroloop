# Deploying Retroloop

Everything runs on one small server with Docker: PostgreSQL, Redis, the realtime
server, the web app and [Caddy](https://caddyserver.com), which gets and renews
HTTPS certificates on its own.

## What you need

- A Linux server with Docker and the Compose plugin. 2 GB of RAM is plenty for
  hundreds of people in retros at once. A small VPS (for example Hetzner CX22) or
  an Oracle Cloud "Always Free" ARM instance both work.
- A domain with two DNS **A records** pointing at the server's IP:
  `retroloop.example.com` and `api.retroloop.example.com`.
- Ports 80 and 443 open in the server's firewall (Caddy needs 80 to get certificates).

WebSockets need a long-running server, which is why this is not a serverless
(Vercel-style) deployment.

## First deploy

```bash
git clone https://github.com/<you>/retroloop.git && cd retroloop
cp .env.prod.example .env.prod
# Fill in .env.prod: both host names, both URLs, a strong POSTGRES_PASSWORD
# (openssl rand -base64 32) and the contact e-mail for the privacy page.
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

E-mail reminders for action items are optional: set `SMTP_URL` (for example
`smtp://user:password@smtp-relay.brevo.com:587`) and `SMTP_FROM` in `.env.prod`.
Without them the reminder button does not appear.

The server applies database migrations every time it starts, so there is no
separate migration step. Check that it is up:

```bash
curl https://api.retroloop.example.com/health
# {"status":"ok","checks":{"database":"ok","redis":"ok"}}
```

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Retros in progress reconnect by themselves after the restart; clients re-join and
get a fresh snapshot.

## Backups

A nightly dump, keeping two weeks (add with `crontab -e`):

```cron
0 3 * * * cd /home/deploy/retroloop && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres pg_dump -U retro retro | gzip > backups/retro-$(date +\%F).sql.gz && find backups -name '*.sql.gz' -mtime +14 -delete
```

Restore into an empty database:

```bash
gunzip -c backups/retro-2026-11-01.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres psql -U retro retro
```

## Monitoring

- Point an uptime checker (UptimeRobot, Better Stack, …) at
  `https://api.<domain>/health`; it answers `503` within a second when the
  database or Redis is down.
- Logs: `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f server`
  (structured JSON from Fastify).

## Data retention

Teams with no retro for 365 days are deleted automatically once a day, as the
privacy page says. Facilitators can delete a retro from its wrap-up screen.

## Trying the production setup locally

The same stack runs on a laptop with Caddy's local certificates:

```bash
cat > .env.prod <<'ENV'
WEB_ADDRESS=localhost:8443
API_ADDRESS=api.localhost:8443
WEB_URL=https://localhost:8443
API_URL=https://api.localhost:8443
POSTGRES_PASSWORD=local-test-only
HTTP_PORT=8081
HTTPS_PORT=8443
ENV
docker compose -p retroloop-prod -f docker-compose.prod.yml --env-file .env.prod up -d --build
# open https://localhost:8443 (accept the local certificate warning)
```
