import { createRng, nextFloat, shuffled } from "../rng";
import type { MetaState } from "../MetaProgressRules";

/**
 * 주간 마을 토너먼트의 대진 규칙(2026-10-18, docs/Plan/2026-10-18-ai-fighter-tournament). 마을 1:1 대결을 감싸는 껍데기다.
 *
 * 경기 규칙(계획의 "경기 규칙" 절):
 * - 플레이어가 낀 경기는 플레이어가 직접 싸운다. 결과는 `recordCityTournamentMatch` 로 들어온다.
 * - 플레이어가 없는 경기는 시뮬레이션한다. 시뮬레이션 규칙이 아직 없는 짝은 출전자 평점과 경기 시드로 판정한다
 *   (`resolveRatedMatch`, how = "rated").
 * - 같은 라운드의 다른 경기는 플레이어 경기가 끝난 뒤 정해진다(`advanceCityTournament` 가 플레이어 경기 앞에서 멈춘다).
 * - 플레이어가 지면 남은 경기는 끝까지 정해 우승자까지 보인다.
 *
 * 같은 주(`weekId`)는 같은 시드라 모든 유저가 같은 대진을 받는다. 순수 규칙이다 — 시계·저장은 app 이 준다.
 *
 * 대진의 몸(`CityTournamentBracket` — 경기·진출·부전승·진행)은 무투장 16강 컵(2026-10-24, `ArenaCupRules`)도 함께 쓴다. 그래서 진행 함수는
 * 기다릴 출전자(`focus`)를 받는다: 주간 대진은 플레이어(`CITY_TOURNAMENT_PLAYER_ID`), 컵은 유저가 고른 대표 선수다.
 */
export const CITY_TOURNAMENT_PLAYER_ID = "player";

export type CityTournamentEntrantKind = "player" | "fighter" | "otto";
const ENTRANT_KINDS: readonly CityTournamentEntrantKind[] = Object.freeze(["player", "fighter", "otto"]);

export interface CityTournamentEntrant {
  readonly id: string;
  readonly kind: CityTournamentEntrantKind;
  /** 판정 경기의 세기(1~1000). 둘의 비율이 이길 확률이다. */
  readonly rating: number;
}

/** 경기가 정해진 방식. `bye`: 상대가 없어 올라감(둘 다 없으면 승자 없음). */
export type CityTournamentHow = "ko" | "decision" | "forfeit" | "bye" | "rated";
const HOWS: readonly CityTournamentHow[] = Object.freeze(["ko", "decision", "forfeit", "bye", "rated"]);

export interface CityTournamentMatch {
  readonly round: number;
  readonly slot: number;
  readonly a: string | null;
  readonly b: string | null;
  readonly winner: string | null;
  /** null 이면 아직 정해지지 않은 경기. */
  readonly how: CityTournamentHow | null;
}

/** 대진 크기: 4강·8강(주간 대진), 16강(무투장 컵, 2026-10-24). */
export type CityTournamentSize = 4 | 8 | 16;

/** 대진 하나의 몸. 주간 대진(`CityTournamentState`)과 무투장 컵(`ArenaCupState`)이 함께 쓴다. */
export interface CityTournamentBracket {
  /** 경기 시드의 뿌리(`cityTournamentMatchSeed`). */
  readonly seed: number;
  readonly size: CityTournamentSize;
  readonly entrants: readonly CityTournamentEntrant[];
  /** 라운드 순서, 라운드 안은 칸 순서. 크기 `size - 1`. */
  readonly matches: readonly CityTournamentMatch[];
}

export interface CityTournamentState extends CityTournamentBracket {
  /** payload 스키마 버전. 모르는 버전은 대회 없음으로 읽는다. */
  readonly version: 1;
  /** ISO 주(`2026-W42`). */
  readonly weekId: string;
  readonly size: 4 | 8;
  /** 경기 규칙의 판. 시뮬레이션 규칙이 바뀌어도 지난 결과를 다시 계산하지 않게 저장한다. */
  readonly rulesVersion: number;
  /** 상금을 받았는가. */
  readonly paid: boolean;

  readonly player?: string;
}

export interface CityTournamentRosterEntry extends CityTournamentEntrant {
  readonly enabled: boolean;
}

export interface CityTournamentSpec {
  readonly size: 4 | 8;
  readonly rulesVersion: number;
  readonly roster: readonly CityTournamentRosterEntry[];
}

export interface CityTournamentPrizeSpec {
  readonly champion: number;
  readonly runnerUp: number;
}

export type CityTournamentOutcome = "playing" | "eliminated" | "champion";


export const CITY_TOURNAMENT_ENTRANT_ID = /^[a-z][a-z0-9-]{0,31}$/;
const ENTRANT_ID = CITY_TOURNAMENT_ENTRANT_ID;
/**
 * A server-registered fighter's stable UUID (`af_fighters.id`): the weekly bracket's player, and since 2026-10-27 an arena cup entrant
 * (내 선수 출전 — docs/Plan/2026-10-27-oddbout-agent-world). NPC entrant IDs keep their existing restricted grammar.
 */
const REGISTERED_PLAYER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;


export function cityTournamentRegisteredId(id: string): boolean {
  return REGISTERED_PLAYER_ID.test(id);
}


export function cityTournamentEntrantId(value: unknown): value is string {
  return typeof value === "string" && (ENTRANT_ID.test(value) || REGISTERED_PLAYER_ID.test(value));
}
const WEEK_ID = /^\d{4}-W\d{2}$/;
const MAX_RATING = 1000;

/** `size` 대진의 라운드 수(4강 2, 8강 3, 16강 4). */
export function cityTournamentRounds(size: CityTournamentSize): number {
  return size === 16 ? 4 : size === 8 ? 3 : 2;
}

/** 주 이름에서 대진 시드(FNV-1a 32비트). 같은 주 = 같은 시드. */
export function cityTournamentSeed(weekId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < weekId.length; i += 1) {
    hash ^= weekId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 경기 한 판의 시드(판정·시뮬레이션의 변주). 대진 시드·라운드·칸에서만 나온다. */
export function cityTournamentMatchSeed(seed: number, round: number, slot: number): number {
  let h = (seed ^ Math.imul(round + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ Math.imul(slot + 1, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The match's place in `matches` (round by round, slot by slot); -1 for a round or slot outside the bracket (never another match's place). */
function matchIndex(size: CityTournamentSize, round: number, slot: number): number {
  if (!Number.isInteger(round) || !Number.isInteger(slot) || round < 0 || round >= cityTournamentRounds(size) || slot < 0
    || slot >= size >> (round + 1)) return -1;
  let index = 0;
  for (let r = 0; r < round; r += 1) index += size >> (r + 1);
  return index + slot;
}

/** 라운드 `round`·칸 `slot` 의 경기(대진 밖이면 undefined). */
export function cityTournamentMatchAt(state: CityTournamentBracket, round: number, slot: number): CityTournamentMatch | undefined {
  return state.matches[matchIndex(state.size, round, slot)];
}

function feedersDecided(state: CityTournamentBracket, match: CityTournamentMatch): boolean {
  if (match.round === 0) return true;
  return cityTournamentMatchAt(state, match.round - 1, match.slot * 2)?.how !== null
    && cityTournamentMatchAt(state, match.round - 1, match.slot * 2 + 1)?.how !== null;
}

/** 아래 라운드 승자를 위로 올리고, 상대 없는 경기를 부전승으로 닫는다(새로 짠 대진·결과를 적은 대진·읽은 저장의 마무리). */
export function settleCityTournament<S extends CityTournamentBracket>(state: S): S {
  const matches = state.matches.slice();
  const at = (round: number, slot: number) => matches[matchIndex(state.size, round, slot)]!;
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]!;
    if (match.how !== null) continue;
    let { a, b } = match;
    if (match.round > 0) {
      // A side whose match is decided shows at once (a bye's winner waits in the next round); the bye itself only once both are.
      const left = at(match.round - 1, match.slot * 2), right = at(match.round - 1, match.slot * 2 + 1);
      a = left.how === null ? null : left.winner; b = right.how === null ? null : right.winner;
      if (left.how === null || right.how === null) {
        if (a !== match.a || b !== match.b) matches[i] = Object.freeze({ ...match, a, b });
        continue;
      }
    }
    if (a !== null && b !== null) { if (a !== match.a || b !== match.b) matches[i] = Object.freeze({ ...match, a, b }); continue; }
    matches[i] = Object.freeze({ ...match, a, b, winner: a ?? b, how: "bye" as const });
  }
  return Object.freeze({ ...state, matches: Object.freeze(matches) });
}

/**
 * 이번 주 대진을 짠다. 켜진 출전자 중 플레이어는 반드시 넣고 나머지를 시드로 섞어 `size` 까지 채운다. 모자란 자리는 부전승이다
 * (앞쪽 경기부터 한쪽이 빈다 — 두 칸이 모두 빈 경기가 생기지 않게). 출전자가 `size` 의 절반 이하면 한 단계 작은 대진으로 짠다
 * (8강에 4명이면 첫 라운드가 모두 부전승이다 — 2026-10-19, 출전 캐릭터로 파이터가 빠질 때). `fighter`: 플레이어의 출전 캐릭터
 * (`CityTournamentState.player`) — 명단에 같은 id 의 출전자가 있으면 그 주에는 빠진다.
 */
export function createCityTournament(spec: CityTournamentSpec, weekId: string, seed: number, fighter?: string): CityTournamentState {
  const enabled = spec.roster.filter(entry => entry.enabled);
  const player = enabled.find(entry => entry.kind === "player");
  if (!player) throw new Error("city tournament: the roster has no player");
  const others = enabled.filter(entry => entry !== player && entry.id !== fighter);
  const picked = shuffled(createRng(seed), others);
  const field = [player, ...picked.value.slice(0, spec.size - 1)];
  const size: 4 | 8 = spec.size === 8 && field.length <= 4 ? 4 : spec.size;
  const order = shuffled(picked.state, field).value.map(({ id, kind, rating }) => Object.freeze({ id, kind, rating }));
  return settleCityTournament(Object.freeze({ version: 1, weekId, seed: seed >>> 0, size, rulesVersion: spec.rulesVersion,
    entrants: Object.freeze(order), matches: cityTournamentMatches(order.map(entrant => entrant.id), size), paid: false,
    ...(fighter !== undefined ? { player: fighter } : {}) }));
}

/**
 * `size` 대진의 빈 경기 표: 첫 라운드는 `ids` 를 차례로 둘씩 짝짓는다(모자란 자리는 앞쪽 경기부터 한쪽이 빈다 — 두 칸이 모두 빈 경기가
 * 생기지 않게), 그 위 라운드는 비어 있다. 부전승은 `settleCityTournament` 가 닫는다.
 */
export function cityTournamentMatches(ids: readonly string[], size: CityTournamentSize): readonly CityTournamentMatch[] {
  const pairs = size / 2, byes = size - ids.length;
  const matches: CityTournamentMatch[] = [];
  let next = 0;
  for (let slot = 0; slot < pairs; slot += 1) {
    const a = ids[next++] ?? null;
    const b = slot < byes ? null : ids[next++] ?? null;
    matches.push(Object.freeze({ round: 0, slot, a, b, winner: null, how: null }));
  }
  for (let round = 1; round < cityTournamentRounds(size); round += 1) {
    for (let slot = 0; slot < size >> (round + 1); slot += 1) {
      matches.push(Object.freeze({ round, slot, a: null, b: null, winner: null, how: null }));
    }
  }
  return Object.freeze(matches);
}


/** 두 출전자가 다 정해졌고 아직 결과가 없는 경기. */
export function cityTournamentReadyMatches(state: CityTournamentBracket): readonly CityTournamentMatch[] {
  return state.matches.filter(match => match.how === null && match.a !== null && match.b !== null && feedersDecided(state, match));
}

/** `focus`(기본 플레이어)가 지금 싸울 경기(없으면 null — 기다리는 중이거나 탈락·우승). */
export function cityTournamentPlayerMatch(state: CityTournamentBracket, focus: string = CITY_TOURNAMENT_PLAYER_ID): CityTournamentMatch | null {
  return cityTournamentReadyMatches(state).find(match => match.a === focus || match.b === focus) ?? null;
}

/** `focus`(기본 플레이어) 경기의 상대 출전자(없으면 null). */
export function cityTournamentPlayerOpponent(state: CityTournamentBracket, focus: string = CITY_TOURNAMENT_PLAYER_ID): CityTournamentEntrant | null {
  const match = cityTournamentPlayerMatch(state, focus);
  if (!match) return null;
  const id = match.a === focus ? match.b : match.a;
  return state.entrants.find(entrant => entrant.id === id) ?? null;
}

/** 경기 하나의 결과를 적는다. 승자는 그 경기의 두 출전자 중 하나여야 한다. */
export function recordCityTournamentMatch<S extends CityTournamentBracket>(state: S, round: number, slot: number, winner: string,
  how: CityTournamentHow): S {
  const index = matchIndex(state.size, round, slot), match = state.matches[index];
  if (!match || match.how !== null || match.a === null || match.b === null) return state;
  if (winner !== match.a && winner !== match.b) return state;
  const matches = state.matches.slice();
  matches[index] = Object.freeze({ ...match, winner, how });
  return settleCityTournament(Object.freeze({ ...state, matches: Object.freeze(matches) }));
}

/** 판정 경기: 평점 비율이 이길 확률, 경기 시드로 뽑는다. */
export function resolveRatedMatch(state: CityTournamentBracket, match: CityTournamentMatch): string {
  const rating = (id: string | null) => state.entrants.find(entrant => entrant.id === id)?.rating ?? 1;
  const ra = rating(match.a), rb = rating(match.b);
  const draw = nextFloat(createRng(cityTournamentMatchSeed(state.seed, match.round, match.slot))).value;
  return draw < ra / (ra + rb) ? match.a! : match.b!;
}

/** 플레이어가 없는 경기 하나의 결과(승자·결판 방식)를 주는 쪽: 수치 판정(`resolveRatedMatch`) 또는 화면 없는 시뮬레이션. */
export type CityTournamentResolver = (state: CityTournamentBracket, match: CityTournamentMatch)
  => { readonly winner: string; readonly how: CityTournamentHow };

/** 수치 판정으로 정하는 기본 결과(시뮬레이션이 없는 짝). */
export const resolveCityTournamentRated: CityTournamentResolver = (s, match) => ({ winner: resolveRatedMatch(s, match), how: "rated" });

/**
 * `focus`(기본 플레이어)가 없는 경기 중 다음에 정할 하나(없으면 null): 가장 낮은 라운드의 첫 경기. `focus` 가 싸울 경기가 있으면 그보다
 * 낮은 라운드의 경기만 정한다 — 같은 라운드의 다른 경기는 `focus` 의 경기 뒤에 공개된다. `focus` 가 탈락했으면 결승까지 모두 정한다.
 * 한 번에 한 경기라 화면이 프레임마다 하나씩 정할 수 있다(무투장 컵).
 */
export function cityTournamentNextMatch(state: CityTournamentBracket, focus: string = CITY_TOURNAMENT_PLAYER_ID): CityTournamentMatch | null {
  const ready = cityTournamentReadyMatches(state);
  const mine = ready.find(match => match.a === focus || match.b === focus);
  let next: CityTournamentMatch | null = null;
  for (const match of ready) {
    if (match === mine || mine !== undefined && match.round >= mine.round) continue;
    if (next === null || match.round < next.round) next = match;
  }
  return next;
}

/**
 * `focus`(기본 플레이어)가 없는 경기를 정해 대진을 진행한다(`cityTournamentNextMatch` 를 더 정할 것이 없을 때까지). `resolve` 는 그 경기의
 * 결과를 준다 — 판정 또는 화면 없는 시뮬레이션.
 */
export function advanceCityTournament<S extends CityTournamentBracket>(state: S,
  resolve: CityTournamentResolver = resolveCityTournamentRated, focus: string = CITY_TOURNAMENT_PLAYER_ID): S {
  let current = state;
  for (let guard = 0; guard < state.matches.length; guard += 1) {
    const match = cityTournamentNextMatch(current, focus);
    if (!match) return current;
    const result = resolve(current, match);
    current = recordCityTournamentMatch(current, match.round, match.slot, result.winner, result.how);
  }
  return current;
}

/** 결승이 정해졌는가. */
export function cityTournamentComplete(state: CityTournamentBracket): boolean {
  return state.matches[state.matches.length - 1]?.how !== null;
}

/** 우승자(결승 전이면 null). */
export function cityTournamentChampion(state: CityTournamentBracket): string | null {
  const final = state.matches[state.matches.length - 1];
  return final?.how === null ? null : final?.winner ?? null;
}

/** `focus`(기본 플레이어)의 처지: 아직 싸우는 중, 탈락, 우승. */
export function cityTournamentOutcome(state: CityTournamentBracket, focus: string = CITY_TOURNAMENT_PLAYER_ID): CityTournamentOutcome {
  if (cityTournamentChampion(state) === focus) return "champion";
  const lost = state.matches.some(match => match.how !== null && match.winner !== focus && (match.a === focus || match.b === focus));
  return lost ? "eliminated" : "playing";
}

/** 받을 상금: 우승 `champion`, 결승에서 졌으면 `runnerUp`, 그 밖은 0. 대회가 끝나기 전에는 0. */
export function cityTournamentPrize(state: CityTournamentState, prize: CityTournamentPrizeSpec): number {
  if (!cityTournamentComplete(state)) return 0;
  const final = state.matches[state.matches.length - 1]!;
  if (final.winner === CITY_TOURNAMENT_PLAYER_ID) return prize.champion;
  return final.a === CITY_TOURNAMENT_PLAYER_ID || final.b === CITY_TOURNAMENT_PLAYER_ID ? prize.runnerUp : 0;
}

/** 대회를 저장 슬롯에 넣는다. */
export function withCityTournament(meta: MetaState, state: CityTournamentState): MetaState {
  return { ...meta, cityTournament: state };
}

/** 끝난 대회의 상금을 한 번만 준다. `gold` 는 이번에 준 상금. */
export function payCityTournamentPrize(meta: MetaState, prize: CityTournamentPrizeSpec): { readonly meta: MetaState; readonly gold: number } {
  const state = meta.cityTournament;
  if (!state || state.paid || !cityTournamentComplete(state)) return { meta, gold: 0 };
  const gold = Math.max(0, Math.round(cityTournamentPrize(state, prize)));
  return { meta: { ...meta, gold: meta.gold + gold, cityTournament: Object.freeze({ ...state, paid: true }) }, gold };
}

function sanitizeEntrant(value: unknown): CityTournamentEntrant | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>, id = record["id"], kind = record["kind"], rating = record["rating"];
  if (!cityTournamentEntrantId(id)) return null;
  if (typeof kind !== "string" || !ENTRANT_KINDS.includes(kind as CityTournamentEntrantKind)) return null;
  if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 1 || rating > MAX_RATING) return null;
  return Object.freeze({ id, kind: kind as CityTournamentEntrantKind, rating });
}

/**
 * 저장된 대진 몸(시드·출전자·경기 표)을 검사한다. `size` 는 저장의 크기, `sizes` 는 받는 크기다. 손상·앞뒤가 맞지 않으면 undefined.
 * 주간 대진(`sanitizeCityTournament`)과 무투장 컵(`ArenaCupRules.sanitizeArenaCup`)이 함께 쓴다. 정리(`settleCityTournament`)는 부르는 쪽이 한다.
 */
export function sanitizeCityTournamentBracket(record: Readonly<Record<string, unknown>>, sizes: readonly CityTournamentSize[])
  : CityTournamentBracket | undefined {
  const { seed, size } = record;
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return undefined;
  if (!sizes.includes(size as CityTournamentSize)) return undefined;
  const bracketSize = size as CityTournamentSize;
  if (!Array.isArray(record["entrants"]) || !Array.isArray(record["matches"])) return undefined;
  const entrants = (record["entrants"] as unknown[]).map(sanitizeEntrant);
  if (entrants.length === 0 || entrants.length > bracketSize || entrants.some(entrant => entrant === null)) return undefined;
  const ids = new Set(entrants.map(entrant => entrant!.id));
  if (ids.size !== entrants.length) return undefined;
  const raw = record["matches"] as unknown[];
  if (raw.length !== bracketSize - 1) return undefined;
  const entrant = (id: unknown): id is string | null => id === null || (typeof id === "string" && ids.has(id));
  const matches: CityTournamentMatch[] = [];
  for (let round = 0, index = 0; round < cityTournamentRounds(bracketSize); round += 1) {
    for (let slot = 0; slot < bracketSize >> (round + 1); slot += 1, index += 1) {
      const m = raw[index];
      if (typeof m !== "object" || m === null) return undefined;
      const r = m as Record<string, unknown>;
      const { a, b, winner, how } = r;
      if (r["round"] !== round || r["slot"] !== slot || !entrant(a) || !entrant(b) || !entrant(winner)) return undefined;
      if (how !== null && !(typeof how === "string" && HOWS.includes(how as CityTournamentHow))) return undefined;
      if (how === null ? winner !== null : how !== "bye" && (winner === null || (winner !== a && winner !== b))) return undefined;
      matches.push(Object.freeze({ round, slot, a, b, winner, how: how as CityTournamentHow | null }));
    }
  }
  return Object.freeze({ seed, size: bracketSize, entrants: Object.freeze(entrants as CityTournamentEntrant[]), matches: Object.freeze(matches) });
}

/** 손상·모르는 버전·앞뒤가 맞지 않는 대진은 대회 없음(새 대진을 짠다). */
export function sanitizeCityTournament(value: unknown): CityTournamentState | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const { version, weekId, rulesVersion, paid } = record;
  if (version !== 1 || typeof weekId !== "string" || !WEEK_ID.test(weekId)) return undefined;
  if (typeof rulesVersion !== "number" || !Number.isInteger(rulesVersion) || rulesVersion < 1) return undefined;
  if (typeof paid !== "boolean") return undefined;
  const bracket = sanitizeCityTournamentBracket(record, [4, 8]);
  if (!bracket || !bracket.entrants.some(entrant => entrant.id === CITY_TOURNAMENT_PLAYER_ID)) return undefined;
  const { seed, entrants, matches } = bracket, size = bracket.size as 4 | 8;
  const fighter = record["player"];
  const player = cityTournamentEntrantId(fighter) && !entrants.some(entrant => entrant.id === fighter) ? { player: fighter } : {};
  // Settled again on load: a save from before a settle rule change shows the same bracket a fresh one would.
  return settleCityTournament(Object.freeze({ version: 1, weekId, seed, size, rulesVersion, entrants, matches, paid, ...player }));
}
