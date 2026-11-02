import type { FighterRanking } from "../app/RankedDuel";
import { parseUtf8Json, readBoundedBody } from "./boundedResponse";
import { parseFighterNames, type FighterNames } from "./fighterNames";
import { fighterApiBase } from "./registeredFighters";

/**
 * 기본 캐릭터의 공개 누적 순위(2026-10-26). 경기 결과는 브라우저가 보내지 않는다 — 서버가 표를 준 컵(`arenaCupTickets`)의 15경기를 직접 돌려
 * 센다. 여기서는 순위를 읽기만 한다.
 */
export const arenaRankingBase = (base = fighterApiBase()): string => base?.replace(/\/ai-fighter$/, "/oddbout-arena") ?? "";

export async function fetchArenaRankings(base = arenaRankingBase()): Promise<readonly FighterRanking[]> {
  if (!base) throw new Error("rankings-unavailable");
  const response = await fetch(`${base}/rankings`, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15_000) });
  const data = parseUtf8Json(await readBoundedBody(response, 32768, { missing: "invalid-rankings", tooLong: "invalid-rankings" })) as { ok?: unknown; rankings?: unknown } | null;
  if (!response.ok || data?.ok !== true || !Array.isArray(data.rankings) || data.rankings.length > 20) throw new Error("invalid-rankings");
  const seen = new Set<string>();
  return data.rankings.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("invalid-rankings");
    const row = value as FighterRanking;
    if (typeof row.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(row.id) || seen.has(row.id)
      || typeof row.name !== "string" || !row.name || row.name.length > 100
      || ![row.won, row.lost, row.points, row.rank].every(n => Number.isSafeInteger(n) && n >= 0)
      || row.rank < 1 || row.points !== row.won * 3) throw new Error("invalid-rankings");
    seen.add(row.id); const names = parseFighterNames(row.names);
    return { id: row.id, name: row.name, ...(names ? { names } : {}), won: row.won, lost: row.lost, points: row.points, rank: row.rank };
  });
}

/** One of a fighter's cup bouts (공용 무대, 2026-10-27): its corners and winner corner, its cup's seed and rules, the cup's pinned packages. */
export interface ArenaRecordBout {
  readonly round: number; readonly slot: number; readonly a: string; readonly b: string; readonly winner: 0 | 1; readonly digest: string;
  /** How it ended (the relay's own result); null for a bout recorded before it told. */
  readonly how: "ko" | "decision" | null;
  readonly cupSeed: number; readonly rules: number; readonly registered: Readonly<Record<string, string>>; readonly at: string;
}
/** Rivalries a fighter's results made with one opponent (4단계, 2026-10-27): 재대결 · 설욕 · 천적 · 우세 (`chronicle.mjs` `rivalryLabels`). */
export type ArenaRivalryLabel = "rematch" | "revenge" | "nemesis" | "dominant";
const RIVALRY_LABELS: readonly ArenaRivalryLabel[] = ["rematch", "revenge", "nemesis", "dominant"];
/** A bout review (경기평, 4단계 2026-10-27): ODDBOUT's caster's title and body in both languages. */
export interface ArenaReviewText { readonly ko: { readonly title: string; readonly body: string }; readonly en: { readonly title: string; readonly body: string } }
/** A reviewed bout of a fighter: its cup's week, corners, winner corner, and what replays it (the cup's seed and rules, the result's digest). */
export interface ArenaBoutReview {
  readonly cup: string; readonly round: number; readonly slot: number; readonly week: string | null; readonly a: string; readonly b: string;
  readonly winner: 0 | 1; readonly digest: string; readonly cupSeed: number; readonly rules: number; readonly review: ArenaReviewText;
  /** Who wrote it: `provider:model` (`claude:claude-sonnet-5-5`), null when not told. */
  readonly by: string | null;
}
/** A fighter's public cup record: totals, latest bouts (newest first), the fighters met most, and the registered fighters on it, named. */
export interface ArenaFighterRecord {
  readonly id: string; readonly won: number; readonly lost: number; readonly recent: readonly ArenaRecordBout[];
  readonly rivals: readonly { readonly id: string; readonly won: number; readonly lost: number; readonly labels: readonly ArenaRivalryLabel[] }[];
  /** The latest reviews of his bouts (none before the relay wrote any). */
  readonly reviews: readonly ArenaBoutReview[];
  readonly fighters: Readonly<Record<string, { readonly name: string; readonly names?: FighterNames }>>;
}
const FIGHTER_ID = /^(?:[a-z][a-z0-9-]{0,63}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
const whole = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const shortText = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && [...value].length <= max;
/** A review's text: both languages, each a title and a body (bounded — the relay checks them before it keeps them). */
export function parseReviewText(value: unknown): ArenaReviewText | null {
  const v = value as Record<string, Record<string, unknown> | undefined> | null;
  const part = (lang: "ko" | "en") => v?.[lang] && shortText(v[lang].title, 80) && shortText(v[lang].body, 700)
    ? { title: v[lang].title, body: v[lang].body } : null;
  const ko = part("ko"), en = part("en");
  return ko && en ? { ko, en } : null;
}
const UUID_TEXT = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
/** A reviewed bout as the relay serves it (a fighter's record, a world's chronicle); null when malformed. */
export function parseBoutReview(value: unknown): ArenaBoutReview | null {
  const r = value as Record<string, unknown> | null;
  const review = parseReviewText(r?.review);
  if (!r || !review || typeof r.cup !== "string" || !UUID_TEXT.test(r.cup) || !whole(r.round) || r.round > 3 || !whole(r.slot) || r.slot > 7
    || typeof r.a !== "string" || !FIGHTER_ID.test(r.a) || typeof r.b !== "string" || !FIGHTER_ID.test(r.b) || (r.winner !== 0 && r.winner !== 1)
    || typeof r.digest !== "string" || !/^[a-f0-9]{8}$/.test(r.digest) || !whole(r.cupSeed) || r.cupSeed > 0xffffffff || !whole(r.rules)
    || !(r.week === null || r.week === undefined || typeof r.week === "string" && /^\d{4}-W\d{2}$/.test(r.week))) return null;
  return { cup: r.cup, round: r.round, slot: r.slot, week: r.week ?? null, a: r.a, b: r.b, winner: r.winner,
    digest: r.digest, cupSeed: r.cupSeed, rules: r.rules, review,
    by: typeof r.by === "string" && /^(?:claude|openai|grok|gemini):[\w.:-]{1,48}$/.test(r.by) ? r.by : null };
}
const wayToEnd = (how: unknown): how is "ko" | "decision" | null | undefined => how === "ko" || how === "decision" || how === null || how === undefined;
const fighterNamesOf = (value: unknown): Readonly<Record<string, { readonly name: string; readonly names?: FighterNames }>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid-record");
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([other, entry]) => {
    const row = entry as Record<string, unknown> | null;
    if (!FIGHTER_ID.test(other) || !row || typeof row.name !== "string" || row.name.length > 100) throw new Error("invalid-record");
    const names = parseFighterNames(row.names);
    return [other, { name: row.name, ...(names ? { names } : {}) }];
  }));
};

/**
 * 선수 공개 기록(2026-10-27, 2단계 공용 무대): 서버가 센 16강 컵 전적과 최근 경기·자주 만난 상대. 기본 선수는 이름으로, 등록 선수는 AI 대결이
 * 승인된 동안만 있다(아니면 null).
 */
export async function fetchArenaFighterRecord(id: string, base = arenaRankingBase(), signal?: AbortSignal): Promise<ArenaFighterRecord | null> {
  if (!base) throw new Error("record-unavailable");
  if (!FIGHTER_ID.test(id)) return null;
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`${base}/fighter?${new URLSearchParams({ id })}`, { credentials: "omit", redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (response.status === 404) return null;
  const data = parseUtf8Json(await readBoundedBody(response, 65536, { missing: "invalid-record", tooLong: "invalid-record" })) as Record<string, unknown> | null;
  if (!response.ok || data?.ok !== true || data.id !== id || !whole(data.won) || !whole(data.lost) || !Array.isArray(data.recent) || data.recent.length > 20
    || !Array.isArray(data.rivals) || data.rivals.length > 5 || !data.fighters || typeof data.fighters !== "object") throw new Error("invalid-record");
  const recent = data.recent.map((value: unknown): ArenaRecordBout => {
    const bout = value as Record<string, unknown>;
    const registered = bout?.registered as Record<string, unknown> | undefined;
    if (!bout || !whole(bout.round) || bout.round > 3 || !whole(bout.slot) || bout.slot > 7 || typeof bout.a !== "string" || !FIGHTER_ID.test(bout.a)
      || typeof bout.b !== "string" || !FIGHTER_ID.test(bout.b) || (bout.winner !== 0 && bout.winner !== 1) || typeof bout.digest !== "string"
      || !/^[a-f0-9]{8}$/.test(bout.digest) || !wayToEnd(bout.how) || !whole(bout.cupSeed) || bout.cupSeed > 0xffffffff || !whole(bout.rules) || typeof bout.at !== "string"
      || !registered || typeof registered !== "object" || !Object.values(registered).every(sha => typeof sha === "string" && /^[a-f0-9]{64}$/.test(sha)))
      throw new Error("invalid-record");
    return { round: bout.round, slot: bout.slot, a: bout.a, b: bout.b, winner: bout.winner, digest: bout.digest, how: bout.how ?? null, cupSeed: bout.cupSeed, rules: bout.rules,
      registered: registered as Record<string, string>, at: bout.at };
  });
  const rivals = data.rivals.map((value: unknown) => {
    const rival = value as Record<string, unknown>;
    if (!rival || typeof rival.id !== "string" || !FIGHTER_ID.test(rival.id) || !whole(rival.won) || !whole(rival.lost)) throw new Error("invalid-record");
    const labels = Array.isArray(rival.labels) ? rival.labels.filter((label): label is ArenaRivalryLabel => RIVALRY_LABELS.includes(label as ArenaRivalryLabel)) : [];
    return { id: rival.id, won: rival.won, lost: rival.lost, labels };
  });
  // Reviews (4단계): a malformed one is left out, never the record.
  const reviews = Array.isArray(data.reviews) ? data.reviews.slice(0, 5).map(parseBoutReview).filter((r): r is ArenaBoutReview => r !== null) : [];
  return { id, won: data.won, lost: data.lost, recent, rivals, reviews, fighters: fighterNamesOf(data.fighters) };
}

/** A decided bout of the weekly public cup: its corners, the winner corner, its digest and how it ended. */
export interface ArenaPublicCupBout {
  readonly round: number; readonly slot: number; readonly a: string; readonly b: string; readonly winner: 0 | 1; readonly digest: string;
  readonly how: "ko" | "decision" | null;
}
/** The weekly public cup (공용 무대, 2026-10-27): its week, bracket in slot order, seed, rules, pinned packages, state and decided bouts. */
export interface ArenaPublicCup {
  readonly id: string; readonly week: string; readonly bracket: readonly string[]; readonly seed: number; readonly rules: number;
  readonly registered: Readonly<Record<string, string>>; readonly state: "open" | "done" | "void"; readonly createdAt: string;
  readonly bouts: readonly ArenaPublicCupBout[];
  readonly fighters: Readonly<Record<string, { readonly name: string; readonly names?: FighterNames }>>;
}

/**
 * 주간 공용 컵(2026-10-27, 2단계 공용 무대): 서버가 주마다 스스로 낸 컵 — `week`(예: 2026-W44)의 것, null 이면 가장 최근 것. 아직 없으면 null.
 */
export async function fetchArenaPublicCup(week: string | null, base = arenaRankingBase(), signal?: AbortSignal): Promise<ArenaPublicCup | null> {
  if (!base) throw new Error("public-cup-unavailable");
  if (week !== null && !/^\d{4}-W\d{2}$/.test(week)) return null;
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`${base}/public-cup${week ? `?${new URLSearchParams({ week })}` : ""}`, { credentials: "omit", redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const data = parseUtf8Json(await readBoundedBody(response, 65536, { missing: "invalid-public-cup", tooLong: "invalid-public-cup" })) as
    { ok?: unknown; cup?: unknown } | null;
  if (!response.ok || data?.ok !== true) throw new Error("invalid-public-cup");
  if (data.cup === null) return null;
  const cup = data.cup as Record<string, unknown> | undefined, bracket = cup?.bracket, registered = cup?.registered as Record<string, unknown> | undefined;
  if (!cup || typeof cup.id !== "string" || typeof cup.week !== "string" || !/^\d{4}-W\d{2}$/.test(cup.week) || !Array.isArray(bracket) || bracket.length !== 16
    || new Set(bracket).size !== 16 || !bracket.every(id => typeof id === "string" && FIGHTER_ID.test(id)) || !whole(cup.seed) || cup.seed > 0xffffffff
    || !whole(cup.rules) || !registered || typeof registered !== "object"
    || !Object.entries(registered).every(([id, sha]) => bracket.includes(id) && typeof sha === "string" && /^[a-f0-9]{64}$/.test(sha))
    || (cup.state !== "open" && cup.state !== "done" && cup.state !== "void") || typeof cup.createdAt !== "string" || !Array.isArray(cup.bouts) || cup.bouts.length > 15)
    throw new Error("invalid-public-cup");
  const bouts = cup.bouts.map((value: unknown): ArenaPublicCupBout => {
    const bout = value as Record<string, unknown> | null;
    if (!bout || !whole(bout.round) || bout.round > 3 || !whole(bout.slot) || bout.slot >= 8 >> bout.round || typeof bout.a !== "string" || !bracket.includes(bout.a)
      || typeof bout.b !== "string" || !bracket.includes(bout.b) || (bout.winner !== 0 && bout.winner !== 1) || typeof bout.digest !== "string"
      || !/^[a-f0-9]{8}$/.test(bout.digest) || !wayToEnd(bout.how)) throw new Error("invalid-public-cup");
    return { round: bout.round, slot: bout.slot, a: bout.a, b: bout.b, winner: bout.winner, digest: bout.digest, how: bout.how ?? null };
  });
  return { id: cup.id, week: cup.week, bracket: [...bracket as string[]], seed: cup.seed, rules: cup.rules, registered: registered as Record<string, string>,
    state: cup.state, createdAt: cup.createdAt, bouts, fighters: fighterNamesOf(cup.fighters ?? {}) };
}

/** A registered fighter's cup record (내 선수 출전, 2026-10-27): his UUID, names, wins and losses, win rate (0..1) and rank. */
export interface RegisteredCupRanking extends FighterRanking {
  readonly rate: number;
}

/**
 * 내 선수 출전의 순위(2026-10-27): 등록 선수가 대표로 나간 컵의 경기를 서버가 센 승률 순(최소 경기 수 이상). 서버가 승인 중인 선수만 이름과
 * 함께 준다. `points` 는 이 순위에 없다 — 승리 3점(`won * 3`)으로 채워 표가 같은 모양을 쓴다.
 */
export async function fetchRegisteredCupRankings(base = arenaRankingBase()): Promise<{ readonly minBouts: number; readonly rankings: readonly RegisteredCupRanking[] }> {
  if (!base) throw new Error("rankings-unavailable");
  const response = await fetch(`${base}/rankings?scope=registered`, { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15_000) });
  const data = parseUtf8Json(await readBoundedBody(response, 32768, { missing: "invalid-rankings", tooLong: "invalid-rankings" })) as
    { ok?: unknown; scope?: unknown; minBouts?: unknown; rankings?: unknown } | null;
  if (!response.ok || data?.ok !== true || data.scope !== "registered" || !Number.isSafeInteger(data.minBouts) || !Array.isArray(data.rankings)
    || data.rankings.length > 20) throw new Error("invalid-rankings");
  const seen = new Set<string>();
  const rankings = data.rankings.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("invalid-rankings");
    const row = value as RegisteredCupRanking & { rate: unknown };
    if (typeof row.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(row.id) || seen.has(row.id)
      || typeof row.name !== "string" || !row.name || row.name.length > 100
      || ![row.won, row.lost, row.rank].every(n => Number.isSafeInteger(n) && n >= 0) || row.rank < 1
      || typeof row.rate !== "number" || !(row.rate >= 0 && row.rate <= 1)) throw new Error("invalid-rankings");
    seen.add(row.id); const names = parseFighterNames(row.names);
    return { id: row.id, name: row.name, ...(names ? { names } : {}), won: row.won, lost: row.lost, points: row.won * 3, rank: row.rank, rate: row.rate };
  });
  return { minBouts: data.minBouts as number, rankings };
}
