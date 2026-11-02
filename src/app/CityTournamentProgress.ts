import spec from "../world/city-tournament.json";
import {
  advanceCityTournament, CITY_TOURNAMENT_PLAYER_ID, cityTournamentOutcome, cityTournamentPlayerMatch, cityTournamentPlayerOpponent, cityTournamentSeed,
  createCityTournament, payCityTournamentPrize, recordCityTournamentMatch, withCityTournament,
  type CityTournamentEntrant, type CityTournamentEntrantKind, type CityTournamentPrizeSpec, type CityTournamentResolver, type CityTournamentSpec, type CityTournamentState,
} from "../sim/tournament/CityTournamentRules";
import type { CityPoint } from "../world/NativeCityDefinition";
import type { NativeCityKumaAirTuning } from "../sim/cityFight/NativeCityCombatTuning";
import type { CityFightBoutTraceTuning } from "../sim/cityFight/bout/CityFightBoutTraces";
import type { CityFightBoutClashTuning } from "../sim/cityFight/bout/CityFightFighterBout";
import type { KumaBoutAiTuning } from "../sim/cityFight/NativeCityKumaCombatState";
import { CITY_FIGHT_EXCHANGE_KINDS, type CityFightExchangeKind } from "../sim/cityFight/bout/CityFightExchangeKinds";
import { commitProgress, currentProgress } from "./ProgressStore";

/**
 * 주간 마을 토너먼트의 저장 슬롯 쪽(2026-10-18). 규칙은 `sim/tournament/CityTournamentRules`, 출전자·상금은
 * `world/city-tournament.json` 이 소유한다. 여기서는 이번 주를 정하고, 대진을 열고, 플레이어 경기 결과를 적어 대진을 진행한다.
 */
export interface CityTournamentConfig extends CityTournamentSpec {
  readonly prize: CityTournamentPrizeSpec;
  readonly boutTimeLimitMs: number;
  /** 플레이어가 없는 파이터 대 파이터 경기의 시뮬레이션 규칙(`CityTournamentBouts`). */
  readonly bout: CityTournamentBoutConfig;
}

export interface CityTournamentBoutConfig {
  readonly dtMs: number;
  readonly startStrides: number;
  readonly startDelayMs: number;
  readonly damageScale: number;
  readonly poise: { readonly light: number; readonly heavy: number };
  readonly arena: { readonly origin: CityPoint; readonly halfStrides: number };
  /** 파이터별 보정(같은 rating 에서 반쯤 이기게 잰 값). 없으면 1. */
  readonly power: Readonly<Record<string, number>>;
  /** 띄우는 기술이 던진 몸의 높이·중력(2026-10-22 공중 콤보 — `CityFightBoutRules.air`). */
  readonly air: NativeCityKumaAirTuning;

  readonly traces: CityFightBoutTraceTuning;
  /** 두 공격의 맞부딪힘(2026-10-22 5차 — 사용자: "맞부딪힘을 모든 공격에 적용", `CityFightBoutRules.clash`). */
  readonly clash: CityFightBoutClashTuning;
  /** 줄 끝 튕김(2026-10-22 5차 — 추천 3번, `CityFightBoutRules.wallBounce`). */
  readonly wallBounce: { readonly strides: number; readonly liftBodies: number };
  /** KO 로프 반동(2026-10-24 — 관전 감사, `CityFightBoutRules.koRebound`). 결과 뒤의 일이라 결과는 같다. */
  readonly koRebound: { readonly strides: number; readonly liftBodies: number; readonly minMs: number; readonly minStrides: number;
    readonly marginStrides: number; readonly popBodies: number };
  /** 연타 중간 접촉의 밀림 배율(2026-10-22 경쟁 엔진 7단계, `CityFightBoutRules.stringPushScale`). */
  readonly stringPushScale: number;
  /** AI 리듬(2026-10-23 관전 감사 — 간 보기·뒷걸음·반응 막기/백스텝·필살기 잠금, `CityFightBoutRules.ai`). */
  readonly ai: KumaBoutAiTuning;
  /** 긴 연타의 뒤 타격 피해 감소(2026-10-23 관전 감사, `CityFightBoutRules.proration`). */
  readonly proration: { readonly fromHit: number; readonly scale: number; readonly gapMs: number };
  /** 교전 패턴(2026-10-25 — 교차 돌파, `CityFightBoutRules.exchanges`). 없으면 패턴 없음. */
  readonly exchanges?: { readonly kinds: readonly CityFightExchangeKind[] };
}

const KINDS: readonly CityTournamentEntrantKind[] = ["player", "fighter", "otto"];

const pair = (range: readonly number[], name: string): readonly [number, number] => {
  const [a, b] = range;
  if (range.length !== 2 || a === undefined || b === undefined || !(a <= b)) throw new Error(`city-tournament.json: bout.ai ${name} is not [min, max]`);
  return Object.freeze([a, b] as const);
};

/** 경기 AI 리듬 표(`bout.ai`)를 검사해 굳힌다. */
function readBoutAi(ai: typeof spec.bout.ai): KumaBoutAiTuning {
  const share = (x: number, name: string) => { if (!(x >= 0 && x <= 1)) throw new Error(`city-tournament.json: bout.ai ${name} ${x} is not a share`); return x; };
  if (ai.react.guardShare + ai.react.backstepShare > 1) throw new Error("city-tournament.json: bout.ai react shares add past 1");
  return Object.freeze({
    measure: Object.freeze({ share: share(ai.measure.share, "measure.share"), holdMs: pair(ai.measure.holdMs, "measure.holdMs"), marginStrides: ai.measure.marginStrides }),
    retreat: Object.freeze({ share: share(ai.retreat.share, "retreat.share"), strides: pair(ai.retreat.strides, "retreat.strides"),
      afterDownStrides: ai.retreat.afterDownStrides }),
    react: Object.freeze({ fromMs: ai.react.fromMs, toMs: ai.react.toMs, guardShare: share(ai.react.guardShare, "react.guardShare"),
      backstepShare: share(ai.react.backstepShare, "react.backstepShare"), backstepStrides: ai.react.backstepStrides, backstepPaceScale: ai.react.backstepPaceScale,
      vaultShare: share(ai.react.vaultShare, "react.vaultShare"), cornerStrides: ai.react.cornerStrides, passStrides: ai.react.passStrides,
      yieldShare: share(ai.react.yieldShare, "react.yieldShare") }),
    standMs: pair(ai.standMs, "standMs"),
    standBack: Object.freeze({ ...ai.standBack }),
    superLockTailMs: ai.superLockTailMs, meterTakenBonus: ai.meterTakenBonus,
    superDamageScale: ai.superDamageScale, windupSpeed: ai.windupSpeed, winnerHoldMs: ai.winnerHoldMs, grabWaits: ai.grabWaits === true });
}

/** 교전 패턴 종류(`bout.exchanges.kinds`)를 검사해 굳힌다. */
function readExchanges(kinds: readonly string[]): { readonly kinds: readonly CityFightExchangeKind[] } {
  for (const kind of kinds) {
    if (!CITY_FIGHT_EXCHANGE_KINDS.includes(kind as CityFightExchangeKind)) throw new Error(`city-tournament.json: bout.exchanges kind ${kind}`);
  }
  return Object.freeze({ kinds: Object.freeze([...kinds] as CityFightExchangeKind[]) });
}

/** 표를 한 번 검사해 굳힌다(잘못된 항목은 실행 전에 알 수 있게 던진다). */
function readConfig(raw: typeof spec): CityTournamentConfig {
  const size = raw.size === 8 ? 8 : raw.size === 4 ? 4 : null;
  if (size === null) throw new Error(`city-tournament.json: size ${raw.size} is not 4 or 8`);
  const roster = raw.roster.map(entry => {
    if (!KINDS.includes(entry.kind as CityTournamentEntrantKind)) throw new Error(`city-tournament.json: unknown kind ${entry.kind}`);
    return Object.freeze({ id: entry.id, kind: entry.kind as CityTournamentEntrantKind, rating: entry.rating, enabled: entry.enabled });
  });
  const b = raw.bout;
  const bout: CityTournamentBoutConfig = Object.freeze({ dtMs: b.dtMs, startStrides: b.startStrides, startDelayMs: b.startDelayMs,
    damageScale: b.damageScale, poise: Object.freeze({ ...b.poise }),
    arena: Object.freeze({ origin: [b.arena.origin[0]!, b.arena.origin[1]!] as CityPoint, halfStrides: b.arena.halfStrides }),
    power: Object.freeze({ ...(b.power as Readonly<Record<string, number>>) }),
    air: Object.freeze({ ...Object.fromEntries(Object.entries(b.air).filter(([key]) => key !== "note")) }) as unknown as NativeCityKumaAirTuning,
    traces: Object.freeze({ ice: Object.freeze({ ...b.traces.ice }), hole: Object.freeze({ ...b.traces.hole }) }),
    clash: Object.freeze({ windowMs: b.clash.windowMs, recoilMs: b.clash.recoilMs, jitterMs: b.clash.jitterMs, pushStrides: b.clash.pushStrides }),
    wallBounce: Object.freeze({ strides: b.wallBounce.strides, liftBodies: b.wallBounce.liftBodies }), stringPushScale: b.stringPushScale,
    koRebound: Object.freeze({ strides: b.koRebound.strides, liftBodies: b.koRebound.liftBodies, minMs: b.koRebound.minMs, minStrides: b.koRebound.minStrides,
      marginStrides: b.koRebound.marginStrides, popBodies: b.koRebound.popBodies }),
    ai: readBoutAi(b.ai),
    proration: Object.freeze({ fromHit: b.proration.fromHit, scale: b.proration.scale, gapMs: b.proration.gapMs }),
    ...(b.exchanges ? { exchanges: readExchanges(b.exchanges.kinds) } : {}) });
  return Object.freeze({ size, rulesVersion: raw.rulesVersion, roster: Object.freeze(roster),
    prize: Object.freeze({ ...raw.prize }), boutTimeLimitMs: raw.boutTimeLimitMs, bout });
}

export const CITY_TOURNAMENT: CityTournamentConfig = readConfig(spec);


export function cityTournamentEntrant(id: string, config: CityTournamentConfig = CITY_TOURNAMENT): CityTournamentEntrant {
  const listed = config.roster.find(entry => entry.id === id);
  return Object.freeze(listed ? { id, kind: listed.kind, rating: listed.rating } : { id, kind: "fighter" as const, rating: 100 });
}

/** ISO-8601 주(UTC 기준 — 모든 유저가 같은 주를 받는다). 예: `2026-W42`. */
export function cityTournamentWeekId(now: Date): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}


export function ensureWeeklyTournament(now: Date = new Date(), config: CityTournamentConfig = CITY_TOURNAMENT,
  resolve?: CityTournamentResolver, fighter?: string): CityTournamentState {
  const weekId = cityTournamentWeekId(now);
  const commit = commitProgress(meta => {
    const existing = meta.cityTournament;
    // This week's bracket made by an older roster (`rulesVersion`, e.g. the 2026-10-18 guests) or for another fighter is drawn again
    // while the player has not fought in it yet; once he has, it is played out as drawn.
    const repick = fighter !== undefined && existing?.player !== fighter;
    const redraw = existing !== undefined && existing.weekId === weekId && (existing.rulesVersion !== config.rulesVersion || repick)
      && !cityTournamentPlayerFought(existing);
    if (existing && !redraw && (existing.weekId === weekId || cityTournamentOutcome(existing) === "playing")) return meta;
    const drawFor = fighter ?? (redraw ? existing?.player : undefined);
    return withCityTournament(meta, advanceCityTournament(createCityTournament(config, weekId, cityTournamentSeed(weekId), drawFor), resolve));
  });
  return commit.meta.cityTournament ?? currentProgress().cityTournament!;
}

/**
 * The saved bracket is the one `ensureWeeklyTournament` keeps (2026-10-19): this week's, or last week's still being played out. Last
 * week's finished bracket is not — the next open draws this week's.
 */
export function cityTournamentBracketInPlay(state: CityTournamentState, now: Date = new Date()): boolean {
  return state.weekId === cityTournamentWeekId(now) || cityTournamentOutcome(state) === "playing";
}

/**
 * The bracket's fighter can no longer change (2026-10-19): this week's bracket the player has fought in, or last week's still being played
 * out. `ensureWeeklyTournament` keeps it as drawn then. Last week's finished bracket is not locked (a new one is drawn).
 */
export function cityTournamentFighterLocked(state: CityTournamentState, now: Date = new Date()): boolean {
  return state.weekId === cityTournamentWeekId(now) ? cityTournamentPlayerFought(state) : cityTournamentOutcome(state) === "playing";
}

/** The player has a decided match of his own (not a bye): his bracket is in play. */
export function cityTournamentPlayerFought(state: CityTournamentState): boolean {
  return state.matches.some(match => match.how !== null && match.how !== "bye"
    && (match.a === CITY_TOURNAMENT_PLAYER_ID || match.b === CITY_TOURNAMENT_PLAYER_ID));
}

/** One match of one week's bracket (the arena's entry, `ArenaSceneData`). */
export interface CityTournamentMatchKey {
  readonly weekId: string;
  readonly round: number;
  readonly slot: number;
}

/** The player's next bout as the arena enters it (`ArenaSceneData`): his match and the fighter he meets there. */
export interface CityTournamentEntry extends CityTournamentMatchKey {
  readonly opponentId: string;

  readonly player?: string;
}

/**
 * The bout "입장" enters (2026-10-18, one rule for the board and the arena): the player's undecided match against a fighter — null when
 * there is none (no bracket, he is out or done, his opponent is not a fighter yet). The arena fights only an entry still equal to this
 * (`sameCityTournamentEntry` — a new week or a decided match sends it back unfought).
 */
export function cityTournamentPlayerEntry(state: CityTournamentState | null | undefined): CityTournamentEntry | null {
  const match = state ? cityTournamentPlayerMatch(state) : null, opponent = state ? cityTournamentPlayerOpponent(state) : null;
  if (!state || !match || !opponent || opponent.kind !== "fighter") return null;
  return Object.freeze({ weekId: state.weekId, round: match.round, slot: match.slot, opponentId: opponent.id,
    ...(state.player !== undefined ? { player: state.player } : {}) });
}

/** The same bout of the same week, played as the same fighter. */
export function sameCityTournamentEntry(a: CityTournamentEntry | null, b: CityTournamentEntry | null): boolean {
  return a !== null && b !== null && a.weekId === b.weekId && a.round === b.round && a.slot === b.slot && a.opponentId === b.opponentId
    && a.player === b.player;
}

export interface CityTournamentBoutRecord {
  readonly state: CityTournamentState | null;
  /** 이번 결과로 대회가 끝나 받은 상금(없으면 0). */
  readonly gold: number;
  /** 결과를 대진에 적었다(지금 싸울 경기가 그 경기였다). false 면 대진은 그대로다. */
  readonly recorded: boolean;
}

/**
 * 플레이어 경기 하나의 결과를 적고 대진을 진행한다(같은 라운드의 다른 경기, 탈락했으면 끝까지 — `resolve` 가 그 결과를 준다).
 * 대회가 끝났으면 상금을 준다. 지금 싸울 경기가 없으면 아무것도 바꾸지 않는다.
 */
export function recordPlayerBout(won: boolean, how: "ko" | "decision" | "forfeit", config: CityTournamentConfig = CITY_TOURNAMENT,
  resolve?: CityTournamentResolver, key?: CityTournamentMatchKey | CityTournamentEntry): CityTournamentBoutRecord {
  let gold = 0, taken = false;
  const commit = commitProgress(meta => {
    const state = meta.cityTournament, match = state ? cityTournamentPlayerMatch(state) : null;
    if (!state || !match) return meta;
    // The arena fought this match (`key`): a bracket that moved on meanwhile (a new week) records nothing. The arena's entry
    // (2026-10-19) also names the opponent and the week's fighter: a bracket drawn again mid-bout for another fighter (fighter.html in a
    // second tab, before the player's first result) can put a different bout in the same round and slot — that records nothing either.
    const stale = key === undefined ? false : "opponentId" in key ? !sameCityTournamentEntry(cityTournamentPlayerEntry(state), key)
      : state.weekId !== key.weekId || match.round !== key.round || match.slot !== key.slot;
    if (stale) return meta;
    taken = true;
    const opponent = match.a === CITY_TOURNAMENT_PLAYER_ID ? match.b! : match.a!;
    const recorded = recordCityTournamentMatch(state, match.round, match.slot, won ? CITY_TOURNAMENT_PLAYER_ID : opponent, how);
    const paid = payCityTournamentPrize(withCityTournament(meta, advanceCityTournament(recorded, resolve)), config.prize);
    gold = paid.gold;
    return paid.meta;
  }, { atomic: true });
  return { state: commit.meta.cityTournament ?? null, gold: commit.changed ? gold : 0, recorded: taken && commit.changed };
}
