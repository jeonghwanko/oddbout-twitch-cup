import type { FighterRanking, ServerDuelMatch } from "../app/RankedDuel";
import { parseUtf8Json, readBoundedBody } from "./boundedResponse";
import { parseFighterNames } from "./fighterNames";
import { REGISTERED_DUEL_ENGINE } from "../app/RankedDuel";
import { fighterApiBase } from "./registeredFighters";
import { STORAGE_KEYS } from "./storageKeys";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const PENDING = STORAGE_KEYS.serverDuelRequest;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-duel-response");
  return value as Record<string, unknown>;
}
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
async function request(path: string, body?: unknown, base = fighterApiBase()): Promise<Record<string, unknown>> {
  if (body !== undefined) throw new Error("Ranked duel creation is unavailable in Twitch Cup");
  if (!base) throw new Error("duel-service-unavailable");
  const response = await fetch(`${base}/${path}`, { method: "GET", credentials: "omit", redirect: "error",
    signal: AbortSignal.timeout(25_000), ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = object(parseUtf8Json(await readBoundedBody(response, 32768, { missing: "invalid-duel-response", tooLong: "duel-response-limit" })));
  if (!response.ok || data.ok !== true) throw new Error(typeof data.code === "string" ? data.code : "duel-service-unavailable");
  return data;
}
export function parseServerDuel(value: unknown): ServerDuelMatch {
  const m = object(value), r = object(m.result);
  if (![m.id, m.a, m.b].every(x => typeof x === "string" && UUID.test(x)) || m.a === m.b
    || !count(m.seed) || m.seed > 0xffffffff || typeof m.engine !== "string"
    || !Array.isArray(m.hashes) || m.hashes.length !== 2 || !m.hashes.every(x => typeof x === "string" && HASH.test(x))
    || typeof m.createdAt !== "string" || !Number.isFinite(Date.parse(m.createdAt))
    || typeof m.completedAt !== "string" || !Number.isFinite(Date.parse(m.completedAt))
    || ![0, 1].includes(r.winner as number) || !["ko", "decision"].includes(r.how as string)
    || !count(r.ms) || r.ms < 1 || r.ms > 90000 || typeof r.digest !== "string" || !/^[a-f0-9]{8}$/.test(r.digest)
    || !Array.isArray(r.contacts) || r.contacts.length !== 2 || !r.contacts.every(count)
    || !Array.isArray(r.hp) || r.hp.length !== 2 || !r.hp.every(x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1))
    throw new Error("invalid-duel-response");
  // A match the server ran on another engine (one side deployed before the other): its own code, so the request key is let go — a retry
  // under the same key would get the same stored match forever (2026-10-20 review).
  if (m.engine !== REGISTERED_DUEL_ENGINE) throw new Error("duel-engine-mismatch");
  return m as unknown as ServerDuelMatch;
}
export async function fetchFighterRankings(base = fighterApiBase()): Promise<readonly FighterRanking[]> {
  const data = await request("rankings", undefined, base);
  if (!Array.isArray(data.rankings) || data.rankings.length > 20) throw new Error("invalid-rankings");
  const seen = new Set<string>();
  return data.rankings.map(value => {
    const r = object(value);
    if (typeof r.id !== "string" || !UUID.test(r.id) || seen.has(r.id) || typeof r.name !== "string" || r.name.length > 48
      || !count(r.won) || !count(r.lost) || !count(r.points) || r.points !== r.won * 3 || !count(r.rank) || r.rank < 1) throw new Error("invalid-rankings");
    seen.add(r.id); const names = parseFighterNames(r.names);
    return { id: r.id, name: r.name, ...(names ? { names } : {}), won: r.won, lost: r.lost, points: r.points, rank: r.rank };
  });
}
/**
 * A held request is asked at most this many times, then let go: a refusal the server repeats for that pair (an engine that fails on it)
 * would otherwise hold the key — and add to the day's failure brake — for good (2026-10-26 review).
 */
export const SERVER_DUEL_TRIES = 3;

interface HeldDuel { readonly a: string; readonly b: string; readonly idempotencyKey: string; readonly tries: number }

function heldDuel(): HeldDuel | null {
  try {
    const raw = globalThis.localStorage.getItem(PENDING);
    if (!raw) return null;
    const saved = object(JSON.parse(raw));
    if (typeof saved.a !== "string" || typeof saved.b !== "string" || typeof saved.idempotencyKey !== "string" || !UUID.test(saved.idempotencyKey)) return null;
    return { a: saved.a, b: saved.b, idempotencyKey: saved.idempotencyKey, tries: count(saved.tries) ? saved.tries : 0 };
  } catch { return null; }
}

/** The opponent of `a`'s request whose outcome is still unknown — asked again before a new opponent is drawn — or null. */
export function heldServerDuelOpponent(a: string): string | null {
  const held = heldDuel();
  return held?.a === a ? held.b : null;
}

/**
 * Persist the request key BEFORE sending. An unknown outcome retries the same server match, including after a page reload.
 * A request for another pair lets the held one go (2026-10-26): its outcome stays unknown here and nothing else is lost — the held key had
 * refused every other pair, and as the opponent is drawn at random, a pair no longer offered (a fighter removed, unapproved) held it for good.
 * The query names the engine this page replays with (2026-10-26): the server keeps earlier engines by name and plays the named one, so a
 * page published before or after the Edge still gets a match it can replay. A server that does not keep it plays its current engine and
 * the reply's engine check (`parseServerDuel`) lets the key go, as before. The body keeps its three keys — the server refuses any other;
 * the stored request adds how many times it was asked.
 */
export async function requestServerDuel(a: string, b: string): Promise<ServerDuelMatch> {
  const saved = heldDuel(), held = saved?.a === a && saved.b === b ? saved : null;
  const body = { a, b, idempotencyKey: held?.idempotencyKey ?? crypto.randomUUID() }, tries = (held?.tries ?? 0) + 1;
  globalThis.localStorage.setItem(PENDING, JSON.stringify({ ...body, tries }));
  try {
    const match = parseServerDuel((await request(`duels?engine=${encodeURIComponent(REGISTERED_DUEL_ENGINE)}`, body)).match);
    if (match.a !== a || match.b !== b) throw new Error("duel-pair-mismatch");
    globalThis.localStorage.removeItem(PENDING); return match;
  } catch (error) {
    // Final answers for this key: a retry would get the same refusal. The server's engine-mismatch (a match reserved on another engine — a
    // page from another release) and a changed package are final too (2026-10-26 — the key was kept and the browser asked the same row forever),
    // and a fighter gone (`not-found`). Any other answer is let go once it has been asked `SERVER_DUEL_TRIES` times.
    if (tries >= SERVER_DUEL_TRIES || error instanceof Error && ["duel-not-approved", "duel-budget", "invalid-duel", "idempotency-conflict",
      "duel-engine-mismatch", "engine-mismatch", "package-mismatch", "package-invalid", "not-found"].includes(error.message)) {
      globalThis.localStorage.removeItem(PENDING);
    }
    throw error;
  }
}
