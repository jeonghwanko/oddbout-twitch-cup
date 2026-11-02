import { inflateRect, rectContains } from "./geom";
import type { Tuning } from "./tuning";
import type { Rect, Vec2 } from "./GeometryTypes";

/**
 * 모든 저택 상호작용에 공통으로 주는 입력 여유.
 * 화면 안내와 실제 판정이 이 배수를 함께 써서 해상도·카메라 표현과 무관하게 같은 시점에 반응한다.
 */
export function interactionReachPx(baseReachPx: number, tuning: Tuning): number {
  return baseReachPx * tuning.interaction.reachMul;
}

/**
 * 등 뒤 상호작용이 성립하는 수평 거리대.
 *
 * 위 경계만 보면 몸이 겹쳐 있는 순간도 "등 뒤"가 된다. 소등 그림자에서 몸을 낮춰
 * 경비를 통과하는 창처럼 몸 충돌이 꺼진 상태에서는 플레이어가 경비 좌표를 그대로
 * 지나가므로, 교차하는 프레임마다 손댈 곳도 없는 키캡이 번쩍인다. 실제로 붙어서
 * 시작할 수 있는 가장 가까운 자리는 몸 충돌 경계이니 아래 경계도 함께 쓴다.
 */
export function withinBackReachPx(dx: number, baseReachPx: number, tuning: Tuning): boolean {
  const distance = Math.abs(dx);
  return distance + 0.001 >= tuning.guard.captureRangePx
    && distance <= interactionReachPx(baseReachPx, tuning);
}

/** 플레이어 바디와 오브젝트가 겹치는 판정 면적 전체를 튜닝 배수만큼 넓힌다. */
export function interactionReachRect(body: Rect, basePaddingPx: number, tuning: Tuning): Rect {
  const base = inflateRect(body, basePaddingPx, 0);
  const extraX = base.w * (tuning.interaction.reachMul - 1) / 2;
  const extraY = base.h * (tuning.interaction.reachMul - 1) / 2;
  return inflateRect(base, extraX, extraY);
}

/** 출구처럼 자체 판정 면적을 가진 오브젝트는 중심을 유지한 채 튜닝 배수만큼 넓힌다. */
export function interactionRect(rect: Rect, tuning: Tuning): Rect {
  const extraX = rect.w * (tuning.interaction.reachMul - 1) / 2;
  const extraY = rect.h * (tuning.interaction.reachMul - 1) / 2;
  return inflateRect(rect, extraX, extraY);
}

export function pointInInteractionRect(point: Vec2, rect: Rect, tuning: Tuning): boolean {
  return rectContains(interactionRect(rect, tuning), point);
}
