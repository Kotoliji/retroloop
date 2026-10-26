/**
 * Load test: many retros with many people writing cards at once.
 *
 *   npx tsx scripts/load-test.ts --url http://localhost:4000 --retros 50 --people 10 --cards 5
 *
 * Add --insecure for a local HTTPS setup with Caddy's self-signed certificates.
 *
 * Measures what a participant feels: the time from one person posting a card
 * to everyone else in the retro receiving it, plus join and reveal times.
 * The server needs CREATE_LIMIT_PER_MINUTE raised above --retros, because every
 * retro here is created from one address.
 */
import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { parseArgs } from "node:util";
import type { ClientToServerEvents, CreatedRetro, ServerToClientEvents } from "@retro/shared";
import { io, type Socket } from "socket.io-client";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:4000" },
    retros: { type: "string", default: "50" },
    people: { type: "string", default: "10" },
    cards: { type: "string", default: "5" },
    spread: { type: "string", default: "10" }, // seconds over which cards are posted
    insecure: { type: "boolean", default: false },
  },
});
const SERVER_URL = args.url!;
const RETROS = Number(args.retros);
const PEOPLE = Number(args.people);
const CARDS = Number(args.cards);
const SPREAD_MS = Number(args.spread) * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Browsers resolve *.localhost to this machine, but Node on Windows does not;
// the local production setup serves the API at api.localhost.
const target = new URL(SERVER_URL);
const lookup: LookupFunction | undefined = target.hostname.endsWith(".localhost")
  ? (_host, options, callback) =>
      options.all
        ? (callback as (err: null, addresses: { address: string; family: number }[]) => void)(null, [
            { address: "127.0.0.1", family: 4 },
          ])
        : callback(null, "127.0.0.1", 4)
  : undefined;
const rejectUnauthorized = !args.insecure;
const agent =
  target.protocol === "https:"
    ? new https.Agent({ keepAlive: true, lookup, rejectUnauthorized })
    : new http.Agent({ keepAlive: true, lookup });
// WebSocket upgrades need fresh connections, not ones kept alive after an HTTP request.
const socketAgent =
  target.protocol === "https:" ? new https.Agent({ lookup, rejectUnauthorized }) : new http.Agent({ lookup });

function postJson<T>(path: string, body: unknown): Promise<T> {
  const payload = JSON.stringify(body);
  const request = target.protocol === "https:" ? https.request : http.request;
  return new Promise((resolve, reject) => {
    const req = request(
      new URL(path, SERVER_URL),
      { method: "POST", agent, headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          res.statusCode && res.statusCode < 300 ? resolve(JSON.parse(data)) : reject(new Error(`HTTP ${res.statusCode}`)),
        );
      },
    );
    req.on("error", reject);
    req.end(payload);
  });
}

function percentiles(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;
  return { count: sorted.length, p50: at(50), p95: at(95), p99: at(99), max: sorted.at(-1) ?? NaN };
}

function connect(): Promise<Client> {
  const socket: Client = io(SERVER_URL, { transports: ["websocket"], forceNew: true, agent: socketAgent as never,
    rejectUnauthorized,
  });
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function createRetro(i: number): Promise<CreatedRetro> {
  return postJson("/retros", { teamName: `Load team ${i}` });
}

const joinTimes: number[] = [];
const deliveryTimes: number[] = [];
const revealTimes: number[] = [];
let errors = 0;

async function runRetro(index: number) {
  const retro = await createRetro(index);
  const sockets: Client[] = [];
  /** card id -> time it was sent, to measure delivery to everyone else */
  const sentAt = new Map<string, number>();

  for (let p = 0; p < PEOPLE; p++) {
    const socket = await connect();
    socket.on("card:upserted", (card) => {
      const started = sentAt.get(card.id);
      if (started !== undefined && !card.mine) deliveryTimes.push(performance.now() - started);
    });
    const started = performance.now();
    const joined = await socket.emitWithAck("retro:join", {
      retroId: retro.id,
      name: `Person ${p}`,
      hostKey: p === 0 ? retro.hostKey : undefined,
    });
    if (!joined.ok) throw new Error(`join: ${joined.error}`);
    joinTimes.push(performance.now() - started);
    sockets.push(socket);
  }

  await Promise.all(
    sockets.map(async (socket) => {
      for (let c = 0; c < CARDS; c++) {
        await sleep(Math.random() * (SPREAD_MS / CARDS));
        const id = randomUUID();
        sentAt.set(id, performance.now());
        const result = await socket.emitWithAck("card:add", { id, columnId: "went-well", text: `Card ${c}` });
        if (!result.ok) errors++;
      }
    }),
  );
  await sleep(500); // let the last broadcasts land

  // The facilitator reveals the board: every participant gets their own view of all cards.
  const started = performance.now();
  const received = sockets.slice(1).map(
    (socket) => new Promise<void>((resolve) => socket.once("retro:cards", () => resolve())),
  );
  const staged = await sockets[0].emitWithAck("retro:stage", { stage: "group" });
  if (!staged.ok) errors++;
  await Promise.all(received);
  revealTimes.push(performance.now() - started);

  for (const socket of sockets) socket.disconnect();
}

const total = RETROS * PEOPLE;
console.log(`${RETROS} retros × ${PEOPLE} people = ${total} sockets, ${total * CARDS} cards over ~${SPREAD_MS / 1000}s`);
const started = performance.now();
const results = await Promise.allSettled(Array.from({ length: RETROS }, (_, i) => runRetro(i)));
const failed = results.filter((r) => r.status === "rejected");
for (const f of failed.slice(0, 3)) console.error("retro failed:", (f as PromiseRejectedResult).reason);

const fmt = (ms: number) => `${ms.toFixed(1)} ms`;
const report = (name: string, samples: number[]) => {
  const p = percentiles(samples);
  console.log(
    `${name.padEnd(22)} n=${String(p.count).padStart(6)}  p50 ${fmt(p.p50).padStart(9)}  p95 ${fmt(p.p95).padStart(9)}  p99 ${fmt(p.p99).padStart(9)}  max ${fmt(p.max).padStart(9)}`,
  );
};
report("join", joinTimes);
report("card → everyone else", deliveryTimes);
report("reveal → everyone", revealTimes);
console.log(
  `rejected events: ${errors}, failed retros: ${failed.length}/${RETROS}, wall time ${((performance.now() - started) / 1000).toFixed(1)}s`,
);
process.exit(failed.length > 0 ? 1 : 0);
