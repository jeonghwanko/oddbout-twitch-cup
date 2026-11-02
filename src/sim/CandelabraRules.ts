import type { GuardState } from "./GuardPlanner";
import type { PlayerSimState } from "./MovementRules";
import type { Facing } from "./GeometryTypes";

/** 중심을 건너기 전, 촛대가 처음 접근한 쪽을 보고 있을 때만 기다린다. */
export function shouldWait(
  player: PlayerSimState,
  approach: { readonly guard: GuardState; readonly side: Facing },
): boolean {
  const currentSide: Facing = player.x < approach.guard.x ? -1 : 1;
  return (
    approach.guard.susp.tier === "calm" &&
    currentSide === approach.side &&
    approach.guard.facing === approach.side
  );
}
