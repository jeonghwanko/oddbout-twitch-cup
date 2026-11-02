import type { MansionLayout } from "./MansionLayout";
import { visionBlockers } from "./MansionLayout";
import { segmentRectEntryT } from "./geom";
import type { Tuning } from "./tuning";
import type { Vec2 } from "./GeometryTypes";

/**
 * 사선의 원점이 되는 가슴 높이. 발끝 y 에서 이만큼 올린 곳에서 겨누고 쏜다.
 * 판정(GuardPlanner)과 조준선 연출(GuardView)이 같은 원점을 써야 화면의 선이
 * 실제 사선과 다른 곳을 가리키지 않는다.
 */
export function originY(footY: number, tuning: Tuning): number {
  return footY - tuning.movement.bodyHeightStand * 0.55;
}

export interface LineOfFire {
  readonly clear: boolean;
  /** 첫 차폐물 앞 또는 원래 목표점. 조준선 렌더와 판정이 공유한다. */
  readonly end: Vec2;
}

/** solid와 blocker가 시야뿐 아니라 석궁 사선도 끊는다. */
export function trace(from: Vec2, to: Vec2, layout: MansionLayout): LineOfFire {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0) return { clear: true, end: to };

  let nearestT = 1;
  for (const blocker of visionBlockers(layout)) {
    const entryT = segmentRectEntryT(from, to, blocker.rect);
    if (entryT !== null && entryT < nearestT) nearestT = entryT;
  }

  if (nearestT >= 1) return { clear: true, end: to };
  const safeT = Math.max(0, nearestT - 0.005);
  return {
    clear: false,
    end: { x: from.x + dx * safeT, y: from.y + dy * safeT },
  };
}
