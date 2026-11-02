import type { PlayerSimState } from "./MovementRules";
import type { Tuning } from "./tuning";

/**
 * 전투 피해는 위치·애니메이션과 분리된 체력에만 반영한다.
 * 피해 경감 어시스트(`combat.playerDamageTakenMul`)는 여기 한 곳에서만 곱한다.
 */
export function damage(player: PlayerSimState, amount: number, tuning: Tuning): PlayerSimState {
  if (amount <= 0 || player.hp <= 0 || player.hitInvulnMs > 0) return player;
  return { ...player, hp: damagedHp(player.hp, amount, tuning), hitInvulnMs: tuning.combat.playerHitInvulnMs };
}

/** HP after a blow of `amount` (the assist multiplier applied, never below 0) — the heist's `damage` and the village fight's blow. */
export function damagedHp(hp: number, amount: number, tuning: Tuning): number {
  if (amount <= 0 || hp <= 0) return hp;
  const taken = amount * (tuning.combat.playerDamageTakenMul ?? 1);
  return Math.max(0, Math.round((hp - taken) * 1000) / 1000);
}

export function heal(player: PlayerSimState, amount: number): PlayerSimState {
  if (amount <= 0 || player.hp <= 0) return player;
  return { ...player, hp: Math.min(player.maxHp, Math.round((player.hp + amount) * 1000) / 1000) };
}
