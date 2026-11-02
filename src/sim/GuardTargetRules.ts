import type { PlayerSimState } from "./MovementRules";
import { bodyHeight } from "./MovementRules";
import type { Tuning } from "./tuning";
import type { VisionTarget } from "./VisionRules";

export type GuardTargetTransition = "entered-hide" | null;

/** 경비의 지각·공격·포박이 함께 소비하는 한 프레임의 플레이어 표상. */
export interface GuardTargetSnapshot extends VisionTarget {
  /** 은신 진입 순간만 시야 판정에 쓰는 직전의 보이는 몸. */
  readonly previousVisibleBody: VisionTarget | null;
  readonly transition: GuardTargetTransition;
  readonly hideSpotId: string | null;
  readonly grounded: boolean;
  /** 회피 구르기 무적. 정확히 통과한 공격은 완벽 회피와 반격 창의 자격이 된다. */
  readonly invulnerable: boolean;
  /**
   * 피격 직후 무적. 같은 것처럼 보이지만 자격이 다르다 — 맞은 사람에게 완벽 회피의
   * 보상까지 주면 "맞으면 공짜 반격" 이 되어 회피를 배울 이유가 사라진다.
   * 그래서 이 무적은 공격을 통과시키기만 하고 반격 창을 열지 않는다.
   */
  readonly hitInvulnerable?: boolean;
}

export interface GuardTargetOptions {
  readonly previousVisibleBody?: VisionTarget | null;
  readonly transition?: GuardTargetTransition;
  readonly hideSpotId?: string | null;
  readonly grounded?: boolean;
  readonly invulnerable?: boolean;
  readonly hitInvulnerable?: boolean;
}

/** 단위 테스트·도구도 production과 같은 완전한 대상 계약을 만들게 하는 팩토리. */
export function snapshot(
  body: VisionTarget,
  options: GuardTargetOptions = {},
): GuardTargetSnapshot {
  return {
    ...body,
    previousVisibleBody: options.previousVisibleBody ?? null,
    transition: options.transition ?? null,
    hideSpotId: options.hideSpotId ?? null,
    grounded: options.grounded ?? true,
    invulnerable: options.invulnerable ?? false,
    hitInvulnerable: options.hitInvulnerable ?? false,
  };
}

export function fromPlayers(
  player: PlayerSimState,
  previous: PlayerSimState,
  tuning: Tuning,
): GuardTargetSnapshot {
  const currentBody = bodyOf(player, tuning);
  const enteredHide = player.hideSpotId !== null && previous.hideSpotId === null;
  return snapshot(currentBody, {
    previousVisibleBody: enteredHide ? bodyOf(previous, tuning) : null,
    transition: enteredHide ? "entered-hide" : null,
    hideSpotId: player.hideSpotId,
    grounded: player.onGround,
    invulnerable: player.dodgeMs > 0,
    hitInvulnerable: (player.hitInvulnMs ?? 0) > 0,
  });
}

export function isHittable(target: GuardTargetSnapshot): boolean {
  return target.pose !== "hide" && target.pose !== "vent";
}

/** 지금 이 몸에 실제로 타격이 들어갈 수 있는가. 피격 무적은 추격까지 끊지는 않는다. */
export function isStrikeable(target: GuardTargetSnapshot): boolean {
  return isHittable(target) && target.hitInvulnerable !== true;
}

export function isCapturable(target: GuardTargetSnapshot): boolean {
  return target.hideSpotId === null
    && target.grounded
    && (target.pose === "stand" || target.pose === "crouch")
    && !target.invulnerable;
}

/** 타격 뒤 포박 실패 사다리로 들어갈 수 있는 몸인가. 회피 여부는 이미 타격 판정이 처리한다. */
export function canStruggleAfterHit(target: GuardTargetSnapshot): boolean {
  return target.grounded && (target.pose === "stand" || target.pose === "crouch");
}

/** 석궁 사선 판정과 월드 조준선이 함께 쓰는 몸통 목표점. */
export function lineOfFireTarget(
  target: Pick<VisionTarget, "at" | "halfHeight">,
): { readonly x: number; readonly y: number } {
  return { x: target.at.x, y: target.at.y - target.halfHeight * 0.25 };
}

export function lineOfFireTargetForPlayer(
  player: PlayerSimState,
  tuning: Tuning,
): { readonly x: number; readonly y: number } {
  return lineOfFireTarget(bodyOf(player, tuning));
}

function bodyOf(player: PlayerSimState, tuning: Tuning): VisionTarget {
  const height = bodyHeight(player.pose, tuning);
  return {
    at: { x: player.x, y: player.y - height / 2 },
    halfHeight: height / 2,
    pose: player.pose,
    motion: player.motion,
  };
}
