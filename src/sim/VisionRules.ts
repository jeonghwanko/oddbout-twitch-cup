import type { Circle, Facing, Pose, Motion, Rect, Vec2 } from "./types";
import type { MansionLayout } from "./MansionLayout";
import { floorOfY, hasVerticalSight, isInDark, visionBlockers } from "./MansionLayout";
import type { Tuning } from "./tuning";
import { clamp, pitchFromFacing, segmentIntersectsCircle, segmentIntersectsRect } from "./geom";

export type SightBlocker = Rect | Circle;

/** 판정과 감시 VFX가 함께 소비하는 한 줄의 최초 차폐 결과. */
export interface SightRayTrace {
  readonly end: Vec2;
  /** null이면 최대 사거리까지 열려 있다. 값은 레이아웃 ID 또는 동적 차폐 인덱스다. */
  readonly blockedBy: string | null;
  readonly distanceRatio: number;
}

export interface SightConeRay extends SightRayTrace {
  /** 보는 방향을 0도로 둔 화면상 피치. 음수는 위쪽이다. */
  readonly pitchDeg: number;
}

export interface SightConeTrace {
  readonly eye: Vec2;
  readonly rays: readonly SightConeRay[];
}

/**
 * 측면뷰 시야 판정.
 *
 * 결과는 불리언이 아니라 0..1 노출도 스칼라다. 의심 미터가 부드럽게 차오르고
 * "거의 들킬 뻔했다" 가 만들어지는 이유가 전부 여기에 있다.
 *
 * 조기 반환 순서가 성능의 전부다. 층 컷이 다층 시야 계산량을 통째로 없앤다.
 */

export interface Observer {
  readonly at: Vec2;
  readonly facing: Facing;
  readonly range: number;
  readonly halfAngleDeg: number;
  /** 평온 상태에서는 위를 보지 않는다. 각성하면 시야가 위로 열린다. */
  readonly pitchLimitDeg: number;
  /** 생략하면 공용 주변시 반경. 고정식 감시 장치는 0으로 사람의 후방 감각을 제거한다. */
  readonly peripheralRadius?: number;
}

export interface VisionTarget {
  /** 몸통 중심. */
  readonly at: Vec2;
  /** 몸통 세로 반높이. 각도 판정은 이 범위 중 눈높이에 가장 가까운 점을 쓴다. */
  readonly halfHeight: number;
  readonly pose: Pose;
  readonly motion: Motion;
}

export interface VisionSample {
  /** 0 = 안 보임, 1 = 완전 노출. */
  readonly exposure: number;
  readonly distance: number;
  /** 주변시로만 감지된 경우. 등 뒤 완전 무적을 막는 장치. */
  readonly peripheral: boolean;
}

const NOT_SEEN: VisionSample = { exposure: 0, distance: Number.POSITIVE_INFINITY, peripheral: false };

function poseFactor(pose: Pose, tuning: Tuning): number {
  switch (pose) {
    case "hide":
    case "vent":
      return 0;
    case "crouch":
      return tuning.vision.poseCrouch;
    case "climb":
      return tuning.vision.poseClimb;
    case "hang":
      return tuning.vision.poseHang;
    default:
      return tuning.vision.poseStand;
  }
}

function motionFactor(motion: Motion, tuning: Tuning): number {
  switch (motion) {
    case "run":
      return tuning.vision.motionRun;
    case "walk":
      return tuning.vision.motionWalk;
    default:
      return tuning.vision.motionStill;
  }
}

export function sample(
  observer: Observer,
  target: VisionTarget,
  layout: MansionLayout,
  tuning: Tuning,
  snuffedLamps: readonly string[] = [],
  dynamicBlockers: readonly SightBlocker[] = [],
): VisionSample {
  // 은신 중이거나 환기구 안이면 어떤 계산도 필요 없다.
  const pose = poseFactor(target.pose, tuning);
  if (pose <= 0) return NOT_SEEN;

  const eye: Vec2 = { x: observer.at.x, y: observer.at.y + tuning.vision.eyeOffsetY };

  // 몸통 세로 범위 중 눈높이에 가장 가까운 점으로 판정한다. 중심점 하나로만 재면
  // 바로 앞에 서 있을 때 각도가 급해져 오히려 콘에서 벗어나는 역전이 생긴다.
  const aim: Vec2 = {
    x: target.at.x,
    y: clamp(eye.y, target.at.y - target.halfHeight, target.at.y + target.halfHeight),
  };
  const dx = aim.x - eye.x;
  const dy = aim.y - eye.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 1. 층 컷. 다른 층이면 명시된 시야 구멍을 통해서만 보인다.
  const observerFloor = floorOfY(observer.at.y, tuning.world.floorHeightPx);
  const targetFloor = floorOfY(target.at.y, tuning.world.floorHeightPx);
  if (observerFloor !== targetFloor && !hasVerticalSight(layout, eye.x, aim.x)) {
    return NOT_SEEN;
  }

  // 2. 차폐. 판정과 감시 VFX가 같은 최초 충돌 함수를 소비한다.
  // 주변시 분기 뒤에서 검사하면 코앞이라는 이유만으로 엄폐를 무시하게 된다.
  if (traceSightRay(eye, aim, layout, dynamicBlockers).blockedBy !== null) return NOT_SEEN;

  const light = isInDark(layout, aim, snuffedLamps, tuning.mischief.snuffDarkMul)
    ? tuning.vision.darkLightFactor
    : 1;

  // 몸 중심이 정확히 겹친 순간은 가장 가까운 접촉이지 미탐지 사각이 아니다.
  // 0거리에서 각도를 만들 수 없으므로 자세·움직임·어둠만 적용한 근접 노출을 반환한다.
  if (distance <= 0) {
    return {
      exposure: clamp(light * pose * motionFactor(target.motion, tuning), 0, 1),
      distance: 0,
      peripheral: false,
    };
  }

  // 3. 후방 주변시. 코앞이면 등 뒤라도 눈치채지만 엄폐와 어둠은 그대로 적용된다.
  const behind = Math.sign(dx) !== 0 && Math.sign(dx) !== observer.facing;
  if (behind) {
    const peripheralRadius = observer.peripheralRadius ?? tuning.vision.peripheralRadius;
    if (peripheralRadius <= 0 || distance > peripheralRadius) return NOT_SEEN;
    return {
      exposure: tuning.vision.peripheralExposure * pose * motionFactor(target.motion, tuning) * light,
      distance,
      peripheral: true,
    };
  }

  // 4. 거리와 각도.
  if (distance > observer.range) return NOT_SEEN;
  const pitch = pitchFromFacing(eye, aim, observer.facing);
  // 음수 pitch 가 위쪽. 평온한 경비는 위를 보지 않는다.
  if (-pitch > observer.pitchLimitDeg) return NOT_SEEN;
  const angle = Math.abs(pitch);
  if (angle > observer.halfAngleDeg) return NOT_SEEN;

  // 5. 노출도.
  const distFall = clamp(1 - Math.pow(distance / observer.range, tuning.vision.distFalloffExponent), 0, 1);
  const coneFall =
    observer.halfAngleDeg <= 0 ? 1 : 1 - tuning.vision.coneFalloff * (angle / observer.halfAngleDeg);
  const exposure = clamp(distFall * coneFall * light * pose * motionFactor(target.motion, tuning), 0, 1);

  return { exposure, distance, peripheral: false };
}

/**
 * 벽·가구·군중·연막 중 가장 가까운 차폐점을 반환한다.
 * 실제 탐지와 화면의 시야 경계가 교차 수학을 따로 구현하지 않게 하는 SSOT다.
 */
export function traceSightRay(
  from: Vec2,
  to: Vec2,
  layout: MansionLayout,
  dynamicBlockers: readonly SightBlocker[] = [],
): SightRayTrace {
  return traceSightRayAgainst(from, to, visionBlockers(layout), dynamicBlockers);
}

/**
 * 균일 광선에 장애물 모서리·원 접선의 양옆 광선을 더한 시야 경계.
 * 깊이가 급변하는 모서리에도 거의 같은 각도의 두 점이 생겨, 렌더가 가까운 차폐점과
 * 먼 사거리 끝을 긴 대각선으로 잘못 잇지 않는다.
 */
export function traceSightCone(
  observer: Observer,
  tuning: Tuning,
  layout: MansionLayout,
  dynamicBlockers: readonly SightBlocker[] = [],
  segments = 24,
): SightConeTrace {
  const eye: Vec2 = { x: observer.at.x, y: observer.at.y + tuning.vision.eyeOffsetY };
  const upLimit = Math.min(observer.halfAngleDeg, observer.pitchLimitDeg);
  const fromPitch = -upLimit;
  const toPitch = observer.halfAngleDeg;
  const staticBlockers = visionBlockers(layout);
  const pitches: number[] = [];
  const safeSegments = Math.max(1, Math.floor(segments));
  const addPitch = (pitchDeg: number): void => {
    if (!Number.isFinite(pitchDeg) || pitchDeg < fromPitch || pitchDeg > toPitch) return;
    pitches.push(pitchDeg);
  };
  const addBoundaryPitches = (pitchDeg: number): void => {
    addPitch(pitchDeg - CORNER_RAY_EPSILON_DEG);
    addPitch(pitchDeg);
    addPitch(pitchDeg + CORNER_RAY_EPSILON_DEG);
  };

  for (let index = 0; index <= safeSegments; index += 1) {
    addPitch(fromPitch + ((toPitch - fromPitch) * index) / safeSegments);
  }
  const observerFloor = floorOfY(observer.at.y, tuning.world.floorHeightPx);
  for (const boundaryY of [
    observerFloor * tuning.world.floorHeightPx,
    (observerFloor + 1) * tuning.world.floorHeightPx,
  ]) {
    const verticalRatio = (boundaryY - eye.y) / observer.range;
    if (Math.abs(verticalRatio) <= 1) {
      addBoundaryPitches(Math.asin(verticalRatio) * 180 / Math.PI);
    }
  }
  for (const blocker of staticBlockers) {
    const rect = blocker.rect;
    if (rectDistanceSquaredToPoint(eye, rect) > observer.range * observer.range) continue;
    for (const corner of [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.w, y: rect.y },
      { x: rect.x, y: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y + rect.h },
    ]) {
      addBoundaryPitches(pitchTo(observer.facing, eye, corner));
    }
  }
  dynamicBlockers.forEach((blocker) => {
    if ("radius" in blocker) {
      const localX = (blocker.at.x - eye.x) * observer.facing;
      const localY = blocker.at.y - eye.y;
      const distance = Math.hypot(localX, localY);
      if (distance - blocker.radius > observer.range) return;
      if (distance > blocker.radius) {
        const centrePitch = Math.atan2(localY, localX) * 180 / Math.PI;
        const tangentDeg = Math.asin(Math.min(1, blocker.radius / distance)) * 180 / Math.PI;
        addBoundaryPitches(centrePitch - tangentDeg);
        addBoundaryPitches(centrePitch + tangentDeg);
      }
      return;
    }
    if (rectDistanceSquaredToPoint(eye, blocker) > observer.range * observer.range) return;
    for (const corner of [
      { x: blocker.x, y: blocker.y },
      { x: blocker.x + blocker.w, y: blocker.y },
      { x: blocker.x, y: blocker.y + blocker.h },
      { x: blocker.x + blocker.w, y: blocker.y + blocker.h },
    ]) {
      addBoundaryPitches(pitchTo(observer.facing, eye, corner));
    }
  });

  pitches.sort((a, b) => a - b);
  const uniquePitches = pitches.filter((pitch, index) => (
    index === 0 || Math.abs(pitch - (pitches[index - 1] ?? pitch)) > 0.000_01
  ));
  const rays = uniquePitches.map((pitchDeg): SightConeRay => {
    const radians = pitchDeg * Math.PI / 180;
    const to = {
      x: eye.x + Math.cos(radians) * observer.range * observer.facing,
      y: eye.y + Math.sin(radians) * observer.range,
    };
    const occlusion = traceSightRayAgainst(eye, to, staticBlockers, dynamicBlockers);
    const floorCut = traceFloorBoundary(observer, eye, to, tuning, layout);
    return {
      pitchDeg,
      ...(floorCut !== null && floorCut.distanceRatio <= occlusion.distanceRatio ? floorCut : occlusion),
    };
  });
  return { eye, rays };
}

const CORNER_RAY_EPSILON_DEG = 0.035;

/** 실제 탐지가 거부하는 층간 광선을 부채도 같은 슬래브 경계에서 끝낸다. */
function traceFloorBoundary(
  observer: Observer,
  eye: Vec2,
  to: Vec2,
  tuning: Tuning,
  layout: MansionLayout,
): SightRayTrace | null {
  const observerFloor = floorOfY(observer.at.y, tuning.world.floorHeightPx);
  const targetFloor = floorOfY(to.y, tuning.world.floorHeightPx);
  if (observerFloor === targetFloor || hasVerticalSight(layout, eye.x, to.x)) return null;
  const dy = to.y - eye.y;
  if (Math.abs(dy) <= Number.EPSILON) return null;
  const boundaryY = dy > 0
    ? (observerFloor + 1) * tuning.world.floorHeightPx
    : observerFloor * tuning.world.floorHeightPx;
  const ratio = clamp((boundaryY - eye.y) / dy, 0, 1);
  return {
    end: {
      x: eye.x + (to.x - eye.x) * ratio,
      y: boundaryY,
    },
    blockedBy: `floor:${observerFloor}:${dy > 0 ? "down" : "up"}`,
    distanceRatio: ratio,
  };
}

function traceSightRayAgainst(
  from: Vec2,
  to: Vec2,
  staticBlockers: ReturnType<typeof visionBlockers>,
  dynamicBlockers: readonly SightBlocker[],
): SightRayTrace {
  let nearest = to;
  let nearestDistanceSq = distanceSquared(from, to);
  let blockedBy: string | null = null;
  for (const blocker of staticBlockers) {
    const hit = rectEntry(from, to, blocker.rect);
    if (hit === null) continue;
    const hitDistanceSq = distanceSquared(from, hit);
    if (hitDistanceSq <= nearestDistanceSq) {
      nearest = hit;
      nearestDistanceSq = hitDistanceSq;
      blockedBy = `layout:${blocker.id}`;
    }
  }
  dynamicBlockers.forEach((blocker, index) => {
    const hit = "radius" in blocker
      ? circleEntry(from, to, blocker)
      : rectEntry(from, to, blocker);
    if (hit === null) return;
    const hitDistanceSq = distanceSquared(from, hit);
    if (hitDistanceSq <= nearestDistanceSq) {
      nearest = hit;
      nearestDistanceSq = hitDistanceSq;
      blockedBy = `dynamic:${index}`;
    }
  });
  const fullDistanceSq = distanceSquared(from, to);
  return {
    end: nearest,
    blockedBy,
    distanceRatio: fullDistanceSq <= 0 ? 0 : Math.sqrt(nearestDistanceSq / fullDistanceSq),
  };
}

function rectEntry(from: Vec2, to: Vec2, rect: Rect): Vec2 | null {
  if (!segmentIntersectsRect(from, to, rect)) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let tMin = 0;
  let tMax = 1;
  const slab = (origin: number, delta: number, lo: number, hi: number): boolean => {
    if (delta === 0) return origin >= lo && origin <= hi;
    const inverse = 1 / delta;
    let near = (lo - origin) * inverse;
    let far = (hi - origin) * inverse;
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    return tMin <= tMax;
  };
  if (!slab(from.x, dx, rect.x, rect.x + rect.w)) return null;
  if (!slab(from.y, dy, rect.y, rect.y + rect.h)) return null;
  return { x: from.x + dx * tMin, y: from.y + dy * tMin };
}

function circleEntry(from: Vec2, to: Vec2, circle: Circle): Vec2 | null {
  if (!segmentIntersectsCircle(from, to, circle)) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const offsetX = from.x - circle.at.x;
  const offsetY = from.y - circle.at.y;
  const c = offsetX * offsetX + offsetY * offsetY - circle.radius * circle.radius;
  if (c <= 0) return from;
  const a = dx * dx + dy * dy;
  if (a <= 0) return null;
  const b = 2 * (offsetX * dx + offsetY * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  if (t < 0 || t > 1) return null;
  return { x: from.x + dx * t, y: from.y + dy * t };
}

function pitchTo(facing: Facing, from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, (to.x - from.x) * facing) * 180 / Math.PI;
}

function distanceSquared(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy;
}

function rectDistanceSquaredToPoint(point: Vec2, rect: Rect): number {
  const dx = point.x < rect.x
    ? rect.x - point.x
    : point.x > rect.x + rect.w ? point.x - (rect.x + rect.w) : 0;
  const dy = point.y < rect.y
    ? rect.y - point.y
    : point.y > rect.y + rect.h ? point.y - (rect.y + rect.h) : 0;
  return dx * dx + dy * dy;
}
