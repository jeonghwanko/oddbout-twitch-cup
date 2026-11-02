import type { NativeCityKumaPhaseStep } from "./NativeCityCombatTuning";
import type { KumaTuning } from "./NativeCityKumaCombatState";

/**
 * KUMA의 3단계 근무(2026-10-15, `kuma.phases` — docs/Plan/2026-10-14-kuma-fight-fun-audit 3단계): HP 몫으로 정해지는 지금 근무.
 * 1 정상 근무(흰·금만), 2 야근(잡기, 짧은 선 시간), 3 곰탈에 금이 감(가드한 흰 연타 → 곧장 잡기). 근무가 없는 파이터(입힌 파이터들)는
 * 늘 0 이고 규칙도 그대로다. 근무 선을 넘는 한 방은 그를 넘어뜨린다(`kumaCombatHit` — 전환의 박자).
 */

type ShiftTuning = Pick<KumaTuning, "hp" | "phases">;

/** The shift (0-based) his HP is in: the last step whose `fromHpShare` × max HP his HP is at or under; 0 without shifts. */
export function kumaShift(hp: number, t: ShiftTuning): number {
  const steps = t.phases?.steps ?? [];
  let shift = 0;
  for (let i = 1; i < steps.length; i++) if (hp <= steps[i]!.fromHpShare * t.hp + 1e-9) shift = i;
  return shift;
}

/** The rules of the shift his HP is in, or null for a fighter without shifts. */
export function kumaShiftStep(hp: number, t: ShiftTuning): NativeCityKumaPhaseStep | null {
  return t.phases?.steps[kumaShift(hp, t)] ?? null;
}

/** The HP shares where his later shifts begin (the fight HP bar's lines); empty without shifts. */
export function kumaShiftLines(t: ShiftTuning): readonly number[] {
  return (t.phases?.steps ?? []).slice(1).map(step => step.fromHpShare);
}
