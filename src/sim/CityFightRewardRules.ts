import type { MetaState } from "./MetaProgressRules";

/**
 * 마을 1:1 대결의 승리 보상(2026-10-15, docs/Plan/2026-10-14-kuma-fight-fun-audit 3단계 "승리 보상을 정한다"): 상대마다 첫 승리는
 * `CITY_FIGHT_PRIZE.firstWinGold`, 그 뒤 승리는 `winGold`. 상대별 승수는 저장 슬롯의 `MetaState.cityFightWins` 에 남는다. 진 싸움은 아무것도
 * 잃지 않는다(패배 카드의 "다시"). 판 수로 돈을 버는 길은 열어 두되 작게 — 원정의 몫을 넘지 않는다.
 */
export const CITY_FIGHT_PRIZE = Object.freeze({ firstWinGold: 120, winGold: 20 });

export interface CityFightWinsState {
  /** payload 스키마 버전. 모르는 버전은 기록 없음으로 읽는다. */
  readonly version: 1;
  /** 상대(파이터 actor id)마다 이긴 횟수. */
  readonly byFighter: Readonly<Record<string, number>>;
}

/** 이긴 횟수의 상한(저장이 끝없이 크지 않게). */
const MAX_WINS = 9999;
const FIGHTER_ID = /^[a-z][a-z0-9-]{0,31}$/;

/** 손상·모르는 버전은 기록 없음, 이상한 항목은 버린다. */
export function sanitizeCityFightWins(value: unknown): CityFightWinsState | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>, raw = record["byFighter"];
  if (record["version"] !== 1 || typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const byFighter: Record<string, number> = {};
  for (const [id, wins] of Object.entries(raw as Record<string, unknown>)) {
    if (FIGHTER_ID.test(id) && typeof wins === "number" && Number.isInteger(wins) && wins > 0) byFighter[id] = Math.min(MAX_WINS, wins);
  }
  return Object.freeze({ version: 1, byFighter: Object.freeze(byFighter) });
}

/** `fighterId` 를 이긴 횟수(기록 없으면 0). */
export function cityFightWins(meta: MetaState, fighterId: string): number {
  return meta.cityFightWins?.byFighter[fighterId] ?? 0;
}

/** 다음에 `fighterId` 를 이기면 받을 골드. */
export function cityFightPrize(meta: MetaState, fighterId: string): number {
  return cityFightWins(meta, fighterId) === 0 ? CITY_FIGHT_PRIZE.firstWinGold : CITY_FIGHT_PRIZE.winGold;
}

/** 승리 한 번: 승수를 올리고 상금을 더한다. `gold` 는 이번 상금, `first` 는 그 상대의 첫 승리였는가. */
export function recordCityFightWin(meta: MetaState, fighterId: string): { readonly meta: MetaState; readonly gold: number; readonly first: boolean } {
  if (!FIGHTER_ID.test(fighterId)) return { meta, gold: 0, first: false };
  const wins = cityFightWins(meta, fighterId), gold = cityFightPrize(meta, fighterId);
  const byFighter = Object.freeze({ ...(meta.cityFightWins?.byFighter ?? {}), [fighterId]: Math.min(MAX_WINS, wins + 1) });
  return { meta: { ...meta, gold: meta.gold + gold, cityFightWins: Object.freeze({ version: 1, byFighter }) }, gold, first: wins === 0 };
}
