import type { Circle, Rect, Vec2 } from "./GeometryTypes";

/** 순수 기하 헬퍼. 시야 차폐 판정의 성능이 여기에 달려 있다. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * 0~1 로 자르는 정규화 헬퍼.
 *
 * `clamp(value, 0, 1)` 과 달리 `Math` 판을 쓰는 이유는 통합 전 16곳의 지역 정의가
 * 전부 `Math.min`/`Math.max` 조합이었기 때문이다. 두 조합은 `-0`·`NaN` 을 포함해
 * 결과가 완전히 같지만(`easing.test.ts` 가 격자로 확인한다), 삼항 `clamp` 는 `-0` 을
 * 그대로 돌려주므로 여기서 구현을 바꾸면 부동소수 결과가 달라질 수 있다.
 *
 * 비유한값은 `NaN` 그대로 통과한다 — 걸러야 하는 호출부는 스스로 막는다.
 */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * 양끝이 평평한 3차 에르미트(smoothstep) `u²(3 − 2u)`. 0→0, 1→1, 구간 밖은 `clamp01` 로 자른다.
 * 연출 이징의 소유자는 `render/art/easing.ts` 지만 `app` 계층은 `render` 를 import 할 수 없다(architecture.test) —
 * 그래서 `app` 의 시간표(귀빈 변장 계단·집사 인사)가 쓰는 판은 수학 헬퍼 소유자인 여기에 둔다. 판정에는 쓰지 않는다.
 */
export function smoothstep(value: number): number {
  const u = clamp01(value);
  return u * u * (3 - 2 * u);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * "같은 층" 판정에 쓰는 높이 차 경계. 층 높이의 절반이면 위·아래층의 발밑 y 와는
 * 절대 겹치지 않는다. 근접 사거리의 수직 경계(CombatRules.meleeReach)도 이 값이다.
 */
export function sameFloorVerticalPx(floorHeightPx: number): number {
  return floorHeightPx * 0.5;
}

/**
 * 두 발밑 y 가 같은 층인가. 포박·소매치기·제압·전투 접근이 전부 이 판정을 쓴다 —
 * 하나라도 자기 숫자를 가지면 "위층에서는 안 잡히는데 소매치기는 된다" 류의
 * 비대칭이 조용히 생긴다.
 */
export function onSameFloor(aY: number, bY: number, floorHeightPx: number): boolean {
  return Math.abs(aY - bY) < sameFloorVerticalPx(floorHeightPx);
}

export function rectContains(rect: Rect, point: Vec2): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

/** 사각형을 사방으로 넓힌다. 상호작용 판정에 여유를 주는 용도. */
export function inflateRect(rect: Rect, dx: number, dy: number): Rect {
  return { x: rect.x - dx, y: rect.y - dy, w: rect.w + dx * 2, h: rect.h + dy * 2 };
}

export function rectOverlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 두 x 구간이 겹치는지. 층간 시야 구멍 판정에 쓴다. */
export function spansOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin <= bMax && bMin <= aMax;
}

/**
 * 선분 대 AABB 교차 (Liang-Barsky slab).
 *
 * 경비 1명당 사각형 수십 개를 60Hz로 훑으므로 할당 없이 스칼라만 쓴다.
 */
export function segmentIntersectsRect(from: Vec2, to: Vec2, rect: Rect): boolean {
  return segmentRectEntryT(from, to, rect) !== null;
}

/** 선분 대 원 교차. 연막의 원형 화면과 실제 시야 차폐가 이 함수를 공유한다. */
export function segmentIntersectsCircle(from: Vec2, to: Vec2, circle: Circle): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const projected = lengthSquared <= 0
    ? 0
    : clamp(((circle.at.x - from.x) * dx + (circle.at.y - from.y) * dy) / lengthSquared, 0, 1);
  const closestX = from.x + dx * projected;
  const closestY = from.y + dy * projected;
  const offsetX = closestX - circle.at.x;
  const offsetY = closestY - circle.at.y;
  return offsetX * offsetX + offsetY * offsetY <= circle.radius * circle.radius;
}

/** 선분이 사각형에 처음 들어가는 0..1 비율. 조준선이 실제 차폐 지점에서 끝나게 한다. */
export function segmentRectEntryT(from: Vec2, to: Vec2, rect: Rect): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  let tMin = 0;
  let tMax = 1;

  // x 슬랩
  if (dx === 0) {
    if (from.x < rect.x || from.x > rect.x + rect.w) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (rect.x - from.x) * inv;
    let t2 = (rect.x + rect.w - from.x) * inv;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  // y 슬랩
  if (dy === 0) {
    if (from.y < rect.y || from.y > rect.y + rect.h) return null;
  } else {
    const inv = 1 / dy;
    let t1 = (rect.y - from.y) * inv;
    let t2 = (rect.y + rect.h - from.y) * inv;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return null;
  }

  return tMin;
}

/**
 * from 이 facing 방향을 볼 때 to 까지의 시선이 수평축과 이루는 각도(도).
 * 항상 0 이상이며, 정면 수평이 0, 정확히 위/아래가 90 이다.
 */
export function angleFromFacing(from: Vec2, to: Vec2, facing: -1 | 1): number {
  const dx = (to.x - from.x) * facing;
  const dy = to.y - from.y;
  return Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
}

/**
 * 부호 있는 상하 각도(도). 음수가 위쪽(월드 Y 하방 증가 기준).
 * "경비는 평온할 때 위를 보지 않는다" 규칙의 판정에 쓴다.
 */
export function pitchFromFacing(from: Vec2, to: Vec2, facing: -1 | 1): number {
  const dx = (to.x - from.x) * facing;
  const dy = to.y - from.y;
  return (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
}
