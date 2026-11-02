import type { FighterDuelStats } from "../../../../contracts/ai-fighter/validate.mjs";
import { NATIVE_CITY_COMBAT } from "../NativeCityCombatTuning";
import type { KumaTuning } from "../NativeCityKumaCombatState";

/**
 * A registered fighter's duel grades → the server's own numbers (2026-10-23). The creator allocates grades 1..5 (`combat.stats`, the
 * contract's `combatStats` budget); grade 3 everywhere is the engine before stats, exactly. Tables only, so the browser replay and the Edge
 * verifier compute the same bits. `tools/ai-fighter/stat-sweep.mjs` measures every allocation against the default.
 * - power / toughness: the striker's damage × `POWER[power]` / `TOUGHNESS[target toughness]`, folded into the corner's `power` (a target's
 *   `tuning.hp` cancels out of a bout — its bar is a share — so toughness cuts the damage taken instead).
 * - speed: his stand after a swing (`cooldownMs` [min, max]) × `SPEED[speed]`, rounded to whole ms.
 * A guard grade (`guard.raiseMs` / `guard.every`) was swept and dropped the same day: more guard only ever lost (71 % at grade 1, 41 % at 5).
 */
const POWER = [0.86, 0.93, 1, 1.07, 1.14] as const;
const TOUGHNESS = [0.86, 0.93, 1, 1.07, 1.14] as const;
const SPEED = [1.16, 1.08, 1, 0.92, 0.84] as const;

export const REGISTERED_DUEL_DEFAULT_STATS: FighterDuelStats = Object.freeze({ power: 3, toughness: 3, speed: 3 });

const grade = (value: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error(`duel grade out of range: ${value}`);
  return value - 1;
};

/** The striker's `power` against this target: his grade over the target's toughness. */
export function registeredDuelPower(striker: FighterDuelStats, target: FighterDuelStats): number {
  return POWER[grade(striker.power)]! / TOUGHNESS[grade(target.toughness)]!;
}

/** His tuning with his speed grade applied; grade 3 returns the base itself. */
export function registeredDuelTuning(base: KumaTuning, stats: FighterDuelStats): KumaTuning {
  const speed = grade(stats.speed);
  if (speed === 2) return base;
  const [min, max] = base.cooldownMs ?? NATIVE_CITY_COMBAT.tempo.kuma.cooldownMs;
  return { ...base, cooldownMs: [Math.round(min * SPEED[speed]!), Math.round(max * SPEED[speed]!)] as const };
}
