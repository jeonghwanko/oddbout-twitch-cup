import type { CityFightBoutResult } from "../sim/cityFight/bout/CityFightFighterBout";
import type { FighterNames } from "../platform/fighterNames";
/**
 * The registered duel engine's name: the fingerprint of its results (2026-10-22, `tools/ai-fighter/duel-engine-fingerprint.mjs`). A rule
 * change that moves a result changes it — `test/registered-duel-engine.test.ts` names the new value.
 */
export const REGISTERED_DUEL_ENGINE = "standard-duel-1fcae2bbc99e";
export interface ServerDuelMatch {
  readonly id: string; readonly a: string; readonly b: string; readonly hashes: readonly [string, string];
  readonly seed: number; readonly engine: string; readonly createdAt: string; readonly completedAt: string;
  readonly result: CityFightBoutResult;
}
export interface FighterRanking { readonly id: string; readonly name: string; readonly names?: FighterNames; readonly won: number; readonly lost: number; readonly points: number; readonly rank: number }
export function sameDuelResult(a: CityFightBoutResult, b: CityFightBoutResult): boolean {
  return a.winner === b.winner && a.how === b.how && a.ms === b.ms && a.digest === b.digest
    && a.contacts.every((n, i) => n === b.contacts[i]) && a.hp.every((hp, i) => Math.abs(hp - b.hp[i]!) < 1e-9);
}
