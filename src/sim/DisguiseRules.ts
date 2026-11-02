import type { PlayerSimState } from "./MovementRules";
import type { SuspicionTier } from "./types";

/** 무도회 가면은 짧지만, 평온한 경비의 시야를 완전히 다른 통로로 바꾼다. */
export const DISGUISE_DURATION_MS = 8_000;
export const DISGUISE_BREAK_NOISE_RADIUS_PX = 190;

export type DisguiseBreakReason =
  | "ran"
  | "left-floor"
  | "suspicious-action"
  | "changed-tool"
  | "spotted";

/** 이미 경계 태세에 들어간 경비는 얼굴이 아니라 행동과 인상착의를 찾는다. */
export function foolsGuard(active: boolean, tier: SuspicionTier): boolean {
  return active && (tier === "calm" || tier === "curious");
}

/** 판정과 화면이 함께 쓰는 '손님처럼 보이는' 자세 계약. */
export function isSociallyComposed(
  player: Pick<PlayerSimState, "motion" | "pose" | "onGround" | "climbLinkId" | "hideSpotId">,
): boolean {
  return player.motion !== "run"
    && player.pose === "stand"
    && player.onGround
    && player.climbLinkId === null
    && player.hideSpotId === null;
}

export function breakReasonLabel(reason: DisguiseBreakReason): string {
  switch (reason) {
    case "ran": return "달려서 정체가 드러남";
    case "left-floor": return "괴도 동작으로 정체가 드러남";
    case "suspicious-action": return "수상한 행동으로 정체가 드러남";
    case "changed-tool": return "다른 도구를 꺼내 정체가 드러남";
    case "spotted": return "경계 중인 경비가 가면을 간파함";
  }
}
