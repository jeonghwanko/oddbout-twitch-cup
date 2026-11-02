import { cityPerspectiveWeight, type CityPerspective } from './NativeCityPerspective';

export type CityPoint = readonly [number, number];
export type CityPolygon = readonly CityPoint[];
export type CityViewId = "V1" | "V2" | "V3" | "V4" | "V5";
export type CityStopId = "rosaline" | "plaza" | "clockmaker" | "blackthorne" | "training"
  | "B143" | "B004" | "B141" | "B144" | "auction-service" | "pier-cargo" | "pier-passenger" | "trade-square" | "north"
  | "courier" | "guild-clerk" | "dock-foreman" | "customs-clerk" | "auction-appraiser" | "cathedral-archivist"
  /** 블랙손 대문 옆 원정 길(`NativeCityExpeditionDoor`). 주민이 없는 정거장이다. */
  | "expedition"
  /** 광장 신사(Drive C05)·분수대 고양이 자판기·주간 토너먼트 대진 게시판(`NativeCityPlazaStops`). 광장 정거장(`plaza`)은 배달원 엘리어스만의 자리다. */
  | "gentleman" | "vending" | "board";
export interface NativeCityPortal {
  readonly id: string; readonly a: CityViewId; readonly b: CityViewId;
  readonly at: CityPoint; readonly aAt: CityPoint; readonly bAt: CityPoint; readonly name: string;
  /** Authored street crossing width; legacy views keep the shared default. */
  readonly triggerHalfWidth?: number;
}
export interface NativeCityTransitionDefinition {
  readonly durationMs: number; readonly reducedDurationMs: number; readonly settleMs: number;
  readonly hysteresisPlanUnits: number; readonly triggerHalfWidth: number;
}
export interface NativeCityWorldDefinition {
  readonly views: Readonly<Record<CityViewId, NativeCityDefinition>>;
  readonly navigation: NativeCityDefinition;
  readonly portals: readonly NativeCityPortal[];
  readonly transition: NativeCityTransitionDefinition;
}
export interface NativeCityDefinition {
  readonly version: number;
  readonly presentation?: "registered-plate" | "midground-plate";
  readonly navigationOverrides?: readonly {
    readonly region: CityPolygon; readonly walkablePolygons: readonly CityPolygon[]; readonly obstacles: readonly CityPolygon[];
  }[];
  readonly name?: string;
  readonly focus?: CityPoint;
  readonly image: { readonly path: string; readonly width: number; readonly height: number };
  readonly projection: { readonly origin: CityPoint; readonly x: CityPoint; readonly y: CityPoint; readonly perspective?: CityPerspective };
  readonly playBounds: CityPolygon;
  readonly playRegions?: readonly CityPolygon[];
  readonly walkablePolygons: readonly CityPolygon[];
  readonly obstacles: readonly CityPolygon[];
  readonly stops: readonly { readonly id: CityStopId; readonly label: string; readonly point: CityPoint; readonly interactionRadius: number }[];
  readonly spawn: CityPoint;
  readonly actorHeightPx: number;
  readonly layers: readonly { readonly id: string; readonly path: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly sortY: number; readonly footprint: CityPolygon; readonly kind: "building" | "deco" }[];
}
export const NATIVE_CITY_MOVEMENT = Object.freeze({ radius: 1.4, pathMargin: 0.5, speed: 36, runSpeed: 72, grid: 2, maxDtMs: 50,
  midgroundWalkBodyHeightsPerSec: 1.1, sideRunSpeedScale: 2, sideRunCadenceScale: 0.7,
  diagonalWalkPlaybackRate: 2, runPlaybackRate: 2,
  // A click / guide walk runs past this many steps (`nativeCityStepUnits`) and walks its last steps in (`cityPathGait`).
  pathRunSteps: 6, pathWalkInSteps: 2 });

/** heightPx is an elevation measured at the lens target's base (unzoomed) scale. */
export function cityProject(point: CityPoint, city: NativeCityDefinition, heightPx = 0): CityPoint {
  const { origin, x, y, perspective } = city.projection;
  const pixel: CityPoint = [origin[0] + x[0] * point[0] + y[0] * point[1], origin[1] + x[1] * point[0] + y[1] * point[1] - heightPx];
  if (!perspective) return pixel;
  const center: CityPoint = [origin[0] + x[0] * perspective.target[0] + y[0] * perspective.target[1],
    origin[1] + x[1] * perspective.target[0] + y[1] * perspective.target[1]];
  const vertical = Math.sqrt(x[0] ** 2 + y[0] ** 2 - x[1] ** 2 - y[1] ** 2);
  const w = cityPerspectiveWeight(point, perspective, heightPx / vertical);
  return [center[0] + (pixel[0] - center[0]) / w, center[1] + (pixel[1] - center[1]) / w];
}
/**
 * 화면 변위 → 평면 변위: 투영 2×2(`x`·`y` 열)의 역행렬 하나(2026-10-17, 판정·카메라·HUD 의 사본 여섯을 모았다). 행렬식이
 * `epsilon` 보다 작으면(투영이 납작하면) null 이다. 문턱값은 부르는 쪽이 정한다 — 자리마다 달랐던 값을 그대로 넘겨 결과가 비트까지 같다.
 */
export function cityScreenToPlan(projection: { readonly x: readonly [number, number]; readonly y: readonly [number, number] },
  screen: readonly [number, number], epsilon = 1e-8): CityPoint | null {
  const { x, y } = projection, det = x[0] * y[1] - y[0] * x[1];
  if (Math.abs(det) < epsilon) return null;
  return [(screen[0] * y[1] - screen[1] * y[0]) / det, (screen[1] * x[0] - screen[0] * x[1]) / det];
}
export function cityUnproject(point: CityPoint, city: NativeCityDefinition): CityPoint {
  const { origin, perspective } = city.projection;
  const affine = cityScreenToPlan(city.projection, [point[0] - origin[0], point[1] - origin[1]]);
  if (affine === null) throw new Error("Native city camera projection is singular");
  if (!perspective) return affine;
  const dx = affine[0] - perspective.target[0], dy = affine[1] - perspective.target[1];
  const divisor = 1 + (perspective.direction[0] * dx + perspective.direction[1] * dy) / perspective.distance;
  return [perspective.target[0] + dx / divisor, perspective.target[1] + dy / divisor];
}
/**
 * The camera-relative ground axes (2026-10-16): unit plan directions drawn toward screen right and screen down (toward the camera).
 * At the lens target the lens only rescales a screen step (`cityUnproject(c + s) − cityUnproject(c)` is parallel to the affine
 * inverse of s), so the affine inverse gives both directions exactly, wherever the lens points.
 */
export function cityGroundAxes(city: NativeCityDefinition): { readonly right: CityPoint; readonly down: CityPoint } {
  const { x, y } = city.projection;
  const det = x[0] * y[1] - y[0] * x[1];
  if (Math.abs(det) < 1e-8) throw new Error("Native city camera projection is singular");
  // Columns of the inverse map: screen (1, 0) → (y1, −x1) / det, screen (0, 1) → (−y0, x0) / det.
  const unit = (a: number, b: number): CityPoint => { const s = Math.sign(det) / Math.hypot(a, b); return [a * s, b * s]; };
  return { right: unit(y[1], -x[1]), down: unit(-y[0], x[0]) };
}
/** A screen step at the lens target as camera-relative ground parts: [toward camera right, toward the camera]. */
export function cityGroundStep(screen: CityPoint, city: NativeCityDefinition): CityPoint {
  const plan = cityScreenToPlan(city.projection, screen);
  if (plan === null) throw new Error("Native city camera projection is singular");
  const { right, down } = cityGroundAxes(city);
  return [plan[0] * right[0] + plan[1] * right[1], plan[0] * down[0] + plan[1] * down[1]];
}

/** The front edge at the actor's column, rather than a distant wing's deepest corner. */
export function cityLocalFrontY(screenX: number, projectedFootprint: CityPolygon, fallback: number): number {
  let front = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < projectedFootprint.length; i++) {
    const a = projectedFootprint[i]!, b = projectedFootprint[(i + 1) % projectedFootprint.length]!;
    if (screenX < Math.min(a[0], b[0]) || screenX > Math.max(a[0], b[0])) continue;
    if (Math.abs(a[0] - b[0]) < 1e-8) front = Math.max(front, a[1], b[1]);
    else front = Math.max(front, a[1] + (b[1] - a[1]) * (screenX - a[0]) / (b[0] - a[0]));
  }
  return Number.isFinite(front) ? front : fallback;
}
