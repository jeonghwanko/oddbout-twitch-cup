/**
 * 근접 판정의 사거리.
 *
 * 전투 코어 설계 문서의 계약: "선딜의 실제 사거리 레일과 명중 판정이 같은 조건을
 * 사용한다." 전방·높이 경계가 세 곳에 각자 숫자로 흩어져 있으면 그 계약은 주석으로만
 * 참이고, 실제로는 화면이 거짓말을 한다. 그래서 사거리는 값 타입 하나이고, 판정도
 * 텔레그래프도 이 함수만 부른다.
 */

import type { Facing, Vec2 } from "./GeometryTypes";

export interface Reach {
  /** 바라보는 방향으로의 도달 거리. */
  readonly forwardPx: number;
  /** 같은 층으로 칠 수 있는 높이 차. */
  readonly verticalPx: number;
}

/**
 * 몸 중심이 거의 겹친 프레임은 허용한다.
 * 완전히 뒤로 통과한 상대만 전방 휘두르기에서 빠진다.
 */
export const FORWARD_OVERLAP_PX = 8;

/** 공격자 기준 전방 거리. 음수면 등 뒤다. */
export function forwardDistance(from: Vec2, facing: Facing, to: Vec2): number {
  return (to.x - from.x) * facing;
}

export function withinReach(from: Vec2, facing: Facing, to: Vec2, reach: Reach): boolean {
  const forward = forwardDistance(from, facing, to);
  return Math.abs(to.y - from.y) < reach.verticalPx
    && forward >= -FORWARD_OVERLAP_PX
    && forward <= reach.forwardPx;
}
