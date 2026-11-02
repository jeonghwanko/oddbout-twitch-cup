import { NATIVE_CITY_MOVEMENT, type CityPoint, type CityPolygon, type NativeCityDefinition } from "../world/NativeCityDefinition";
import { citySegmentWalkable, cityWalkingPath } from "./NativeCityNavigation";

/**
 * 도시 배우 몸 충돌(순수). 건물·벽은 길찾기 정의(`NativeCityNavigation`)가 맡고, 여기서는 **사람끼리** 발 둘레 원으로 막는다.
 *
 * - 주인공·주민·거리 주민·KUMA 모두 평면 위 발 원(`NativeCityFootprint`) 하나. 반지름은 보 단위(`NATIVE_CITY_FOOTPRINT_STRIDES`)이고
 *   한 보 = `nativeCityStepUnits`(대화 자리 1.5보·KUMA 경계 2.5보와 같은 단위)다.
 * - 방향키(`slide`): 원 안으로 파고드는 성분만 지우고 접선 성분은 남긴다 — 스치며 지나가면 미끄러지고, 정면으로 밀면 선다.
 *   되돌아가는 성분은 만들지 않는다(뒤로 튕기지 않음).
 * - 길 따라 걷기(`steer`): 같은 걸음 길이로 원 둘레(접선)를 돌아간다. 목적지가 그 원 안이면 접촉 자리에서 멈춘다.
 *   걸음이 목표 쪽으로 거의 줄지 않는 막힘이 `blockedStopMs` 이어지면 씬은 다시 누른 것처럼 지금 서 있는 몸 둘레로 남은 길을
 *   다시 잡는다(`replan`, 걸음당 `maxReplans` 번). 걷기 시작할 때 걷던 배우(순찰하던 KUMA)가 길 위에 멈춰 서면 처음 길의 꺾임점이
 *   그 몸 안에 남아 둘레를 아무리 돌아도 닿지 못했다(2026-10-11 문전박대 E2E). 다시 잡아도 막히면 길을 끊는다(밀고 지나가지 않는다).
 * - 서 있는 배우는 클릭 길을 새로 잡을 때 장애물로 넣어 돌아간다(`nativeCityRouteAround`). 원래 길이 이미 비켜 가면 그대로 쓴다.
 * - 겹친 채 시작하면(스폰·불러오기·순간이동) 막지 않고 몇 프레임에 걸쳐 밀어낸다(`nativeCityPushOut`). 겹친 상태에서도
 *   바깥으로 나가는 걸음은 늘 허용한다 — 움직임이 잠기지 않는다.
 * - 연출 이동(포털·호위·장면 걷기·순간이동)은 씬이 이 모듈을 부르지 않는다.
 * - 배우 쪽: KUMA는 다음 걸음이 다른 몸 원에 파고들면 서서 기다린다(`nativeCityActorStepBlocked`). 거리 주민은 주인공 원
 *   둘레로 비켜 걷는다(`nativeCityDeflectAround`) — 길 위에 선 주인공 때문에 거리 장면 전체가 멈추지 않는다.
 */

/**
 * 발 원 반지름(보). 옆으로 맞닿았을 때 그림이 겹치지 않을 만큼 크고, 접촉 거리(두 반지름 합)는 대화 자리 1.5보보다 충분히 작다
 * (최대 1.05보 = 대화 거리의 70%).
 *
 * 실측(2026-10-08, 중경 실제 배율, 한 보 = 70.5px): 주인공(male-modern) 옆모습 앞쪽 반폭 31.2px(오른쪽 볼 때)·27.5px(왼쪽), 등쪽 39px.
 * 주민 반폭: 엘리어스(gent) 32.6, 시계공 20~21, 로잘린 14~25, 집사 17~18, 거리 주민 14~17.
 * 주인공+주민 0.9보 = 63.5px — 엘리어스와는 가장자리끼리 닿고(0px), 나머지는 12px 이상 뜬다.
 * KUMA는 옆모습이 좁고(반폭 25px) 앞·뒤(58·54px)와 대각(약 50px)이 넓다. 경계 중엔 늘 주인공 쪽으로 돌아서 옆으로 붙으면
 * 옆모습이라 1.05보 = 74px 에서 약 18px 뜬다. 대각 모습의 여유도 이 값으로 잡았다.
 */
export const NATIVE_CITY_FOOTPRINT_STRIDES = Object.freeze({
  player: 0.45,
  /** 정거장 주민(엘리어스·로잘린·시계공·집사 등). */
  resident: 0.45,
  /** 거리 주민(`NativeCityLifeView`). */
  citizen: 0.45,
  /** KUMA: 주인공 키의 1.1배이고 앞·대각 모습이 넓다. */
  kuma: 0.6,
});
export type NativeCityFootprintKind = keyof typeof NATIVE_CITY_FOOTPRINT_STRIDES;

/**
 * 좁은 길목·문간에 서 있어 몸을 빼는 주민의 정거장 id(늘). 지금은 없다 — `test/native-city-actor-collision.test.ts` 가 모든 뷰에서
 * 주민이 모두 몸을 가져도 정거장·대화 자리·포털·저택 문턱이 이어지는지 확인한다. 거기서 끊기는 주민이 생기면 여기에 넣는다.
 */
export const NATIVE_CITY_NON_SOLID_RESIDENTS: readonly string[] = Object.freeze([]);

/**
 * 지금 몸을 빼는 주민. 블랙손 대문이 열리면 집사는 저택 문간(`blackthorneAt(35.5, 16)`)에 서는데, 문턱
 * (`NATIVE_CITY_GUEST_DOOR.threshold`)이 그 발에서 0.69보라 주인공+주민 접촉 0.9보 안이다 — 몸이 있으면 문턱에 설 수 없다.
 * 그래서 대문이 열린 동안만 집사는 몸이 없다. 닫힌 대문 앞(문전박대 자리)에서는 몸이 있다.
 */
export function nativeCityNonSolidResidents(state: { readonly estateGateOpen: boolean }): readonly string[] {
  return state.estateGateOpen ? [...NATIVE_CITY_NON_SOLID_RESIDENTS, "blackthorne"] : NATIVE_CITY_NON_SOLID_RESIDENTS;
}

export const NATIVE_CITY_COLLISION = Object.freeze({
  /** 길 따라 걷다 이만큼 막혀 있으면 접촉 자리에서 멈춘다(ms). */
  blockedStopMs: 600,
  /** 이번 걸음 중 목표까지 거리가 이 몫보다 덜 줄면 막힌 걸음이다. */
  minProgress: 0.25,
  /** 겹친 채 시작했을 때 밀어내는 속도(보/초). 접촉 거리 0.9보를 약 0.25초에 푼다. */
  pushOutStridesPerSec: 3.5,
  /** 서 있는 배우를 돌아가는 클릭 길이 접촉 거리 바깥에 더 남기는 여유(보). */
  routeMarginStrides: 0.15,
  /** 한 번의 클릭 걸음에서 막혔을 때 길을 다시 잡는 최대 횟수. 서로 비켜 주다 오가는 배우와 끝없이 다시 잡지 않는다. */
  maxReplans: 2,
});

export interface NativeCityFootprint {
  readonly id: string;
  /** 발(평면 단위). */
  readonly point: CityPoint;
  /** 평면 단위 반지름. */
  readonly radius: number;
  /** 지금 걷는 중이면 true(KUMA 순찰·거리 주민). 서 있는 배우만 클릭 길 계획에 넣는다. */
  readonly moving?: boolean;
}

export function nativeCityFootprintRadius(kind: NativeCityFootprintKind, stepUnits: number): number {
  return Number.isFinite(stepUnits) && stepUnits > 0 ? NATIVE_CITY_FOOTPRINT_STRIDES[kind] * stepUnits : 0;
}

/** 가장 큰 접촉 거리(보): 주인공 + 가장 넓은 배우. */
export function nativeCityMaxContactStrides(): number {
  const { player, ...others } = NATIVE_CITY_FOOTPRINT_STRIDES;
  return player + Math.max(...Object.values(others));
}

const EPSILON = 1e-6;
const dot = (a: CityPoint, b: CityPoint): number => a[0] * b[0] + a[1] * b[1];
const distance = (a: CityPoint, b: CityPoint): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

interface Hit { readonly t: number; readonly blocker: NativeCityFootprint; readonly normal: CityPoint }

/** `point + rest·t` 가 처음 닿는 몸 원. 멀어지거나 스치는 걸음은 막지 않는다. 이미 닿았거나 겹쳤으면 안쪽으로 갈 때만 t=0. */
function firstHit(point: CityPoint, rest: CityPoint, radius: number, blockers: readonly NativeCityFootprint[]): Hit | null {
  const a = dot(rest, rest);
  if (a < 1e-18) return null;
  let best: Hit | null = null;
  for (const blocker of blockers) {
    const reach = radius + blocker.radius;
    if (!(reach > 0)) continue;
    const rel: CityPoint = [point[0] - blocker.point[0], point[1] - blocker.point[1]];
    const toward = dot(rel, rest);
    if (toward >= 0) continue;
    const gap = Math.hypot(rel[0], rel[1]);
    let t = 0;
    if (gap > reach + EPSILON) {
      const disc = toward * toward - a * (gap * gap - reach * reach);
      if (disc < 0) continue;
      t = (-toward - Math.sqrt(disc)) / a;
      if (t > 1) continue;
      t = Math.max(0, t);
    }
    if (best !== null && best.t <= t) continue;
    const at: CityPoint = [point[0] + rest[0] * t - blocker.point[0], point[1] + rest[1] * t - blocker.point[1]];
    const length = Math.hypot(at[0], at[1]);
    if (length < 1e-9) continue;
    best = { t, blocker, normal: [at[0] / length, at[1] / length] };
  }
  return best;
}

export interface NativeCityPlayerMove {
  readonly from: CityPoint;
  /** 벽 판정까지 끝난 이번 프레임 목적 자리. */
  readonly to: CityPoint;
  readonly radius: number;
  readonly blockers: readonly NativeCityFootprint[];
  /** `slide`(방향키): 접선 성분만 남긴다. `steer`(길 따라 걷기): 같은 걸음 길이로 원 둘레를 돌아간다. */
  readonly mode?: "slide" | "steer";
  /** steer: 길의 마지막 목적지. 막은 배우의 접촉 원 안이면 접촉 자리에서 멈춘다(`goalOccupied`). */
  readonly goal?: CityPoint;
  /** 벽 판정. 미끄러진 자리가 벽이면 처음 닿은 자리에 선다(원래 걸음 위라 늘 걸을 수 있다). */
  readonly walkable?: (from: CityPoint, to: CityPoint) => boolean;
}

export interface NativeCityPlayerMoveResult {
  readonly point: CityPoint;
  /** 이번 걸음을 바꾼 첫 배우 id. 없으면 null. */
  readonly contact: string | null;
  /** 목적지가 배우 몸 안이라 접촉 자리에서 멈췄다. */
  readonly goalOccupied: boolean;
}

/** 주인공 한 걸음을 배우 몸 원에 맞춘다. 뚫고 들어가지 않고, 뒤로 되돌리지 않으며, 접촉 자리에서 떨지 않는다. */
export function resolveNativeCityPlayerMove(move: NativeCityPlayerMove): NativeCityPlayerMoveResult {
  const { from, radius, blockers } = move, steer = move.mode === "steer";
  let point: CityPoint = from;
  let rest: CityPoint = [move.to[0] - from[0], move.to[1] - from[1]];
  let contact: string | null = null, firstContact: CityPoint | null = null, goalOccupied = false;
  for (let pass = 0; pass < 4 && Math.hypot(rest[0], rest[1]) > 1e-9; pass++) {
    const hit = firstHit(point, rest, radius, blockers);
    if (hit === null) { point = [point[0] + rest[0], point[1] + rest[1]]; rest = [0, 0]; break; }
    point = [point[0] + rest[0] * hit.t, point[1] + rest[1] * hit.t];
    firstContact ??= point;
    contact ??= hit.blocker.id;
    if (move.goal !== undefined && distance(move.goal, hit.blocker.point) <= radius + hit.blocker.radius + EPSILON) {
      goalOccupied = true; break;
    }
    const left: CityPoint = [rest[0] * (1 - hit.t), rest[1] * (1 - hit.t)];
    const inward = Math.min(0, dot(left, hit.normal));
    let slide: CityPoint = [left[0] - hit.normal[0] * inward, left[1] - hit.normal[1] * inward];
    if (steer) {
      const want = Math.hypot(left[0], left[1]), have = Math.hypot(slide[0], slide[1]);
      // 정면이면 한쪽(법선을 반시계로 돌린 쪽)으로 정해 돈다. 다음 프레임부터는 이미 그쪽에 있어 같은 쪽을 고른다.
      slide = have > 1e-9 ? [slide[0] * want / have, slide[1] * want / have] : [-hit.normal[1] * want, hit.normal[0] * want];
    }
    rest = slide;
  }
  if (contact !== null && move.walkable && !move.walkable(from, point)) point = firstContact ?? from;
  return { point, contact, goalOccupied };
}

/** 겹친 몸을 한 프레임에 `maxStep` 까지만 밀어낸다. 벽 쪽이면 옆으로 비껴 밀고, 그래도 막히면 그대로 둔다(움직임은 잠그지 않는다). */
export function nativeCityPushOut(point: CityPoint, radius: number, blockers: readonly NativeCityFootprint[], maxStep: number,
  walkable?: (from: CityPoint, to: CityPoint) => boolean): CityPoint {
  if (!(maxStep > 0)) return point;
  let push: CityPoint = [0, 0];
  for (const blocker of blockers) {
    const reach = radius + blocker.radius, gap = distance(point, blocker.point);
    if (!(reach > 0) || gap >= reach - EPSILON) continue;
    // 정확히 같은 자리면 방향이 없다 — 평면 +y 쪽으로 정해 민다.
    const direction: CityPoint = gap > 1e-9 ? [(point[0] - blocker.point[0]) / gap, (point[1] - blocker.point[1]) / gap] : [0, 1];
    push = [push[0] + direction[0] * (reach - gap), push[1] + direction[1] * (reach - gap)];
  }
  const length = Math.hypot(push[0], push[1]);
  if (length < EPSILON) return point;
  const step = Math.min(length, maxStep), angle = Math.atan2(push[1], push[0]);
  for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
    const next: CityPoint = [point[0] + Math.cos(angle + turn) * step, point[1] + Math.sin(angle + turn) * step];
    if (!walkable || walkable(point, next)) return next;
  }
  return point;
}

/** 배우의 다음 걸음이 다른 몸 원 안으로, 지금보다 더 가까이 들어가면 true — 그 배우는 서서 기다린다. 멀어지는 걸음은 막지 않는다. */
export function nativeCityActorStepBlocked(from: CityPoint, to: CityPoint, radius: number, others: readonly NativeCityFootprint[]): boolean {
  for (const other of others) {
    const after = distance(to, other.point);
    if (after < radius + other.radius - EPSILON && after < distance(from, other.point) - 1e-9) return true;
  }
  return false;
}

/**
 * 정해진 길을 걷는 배우(거리 주민)가 원(`center`, 반지름 `reach` = 두 반지름 합)을 지나는 자리를 옆으로 비킨다.
 * 길 방향(`direction`)으로 잰 위치는 그대로 두고 옆으로만 민다. 옆 간격은 부드러운 고개 모양(올린 코사인, 길 방향으로 2·reach
 * 앞에서 시작)이라 정면으로 다가와도 한 프레임에 튀지 않고(옆 속도 ≤ 앞 속도의 0.83배), 원 안(`reach` 미만)에는 들어가지 않는다.
 * 고개 밖에서는 원래 길 그대로다. 방향의 부호와 무관하게 점이 있는 쪽으로 돌고, 정확히 가운데면 왼쪽(반시계).
 */
export function nativeCityDeflectAround(point: CityPoint, direction: CityPoint, center: CityPoint, reach: number): CityPoint {
  if (!(reach > 0)) return point;
  const length = Math.hypot(direction[0], direction[1]);
  const d: CityPoint = length > 1e-9 ? [direction[0] / length, direction[1] / length] : [1, 0];
  const rel: CityPoint = [point[0] - center[0], point[1] - center[1]];
  const along = dot(rel, d);
  if (Math.abs(along) >= 2 * reach) return point;
  const lateral = d[0] * rel[1] - d[1] * rel[0];
  // 1.05·reach·(1+cos(π·a/2reach))/2 ≥ √(reach²−a²) for |a| ≤ reach: the bump never dips into the circle.
  const need = 1.05 * reach * (1 + Math.cos(Math.PI * along / (2 * reach))) / 2;
  if (Math.abs(lateral) >= need) return point;
  const side = lateral >= -1e-9 ? need : -need;
  return [center[0] + d[0] * along - d[1] * side, center[1] + d[1] * along + d[0] * side];
}

/** 길(점 목록)에서 그 자리에 가장 가까운 구간의 방향. */
export function nativeCityRouteDirection(points: readonly CityPoint[], at: CityPoint): CityPoint {
  let best: CityPoint = [1, 0], gap = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, g = segmentDistance(at, a, b);
    if (g < gap && distance(a, b) > 1e-9) { gap = g; best = [b[0] - a[0], b[1] - a[1]]; }
  }
  return best;
}

/** 그 자리에 서면 누군가와 몸이 겹치는가(대화 자리 고르기). */
export function nativeCityFootprintOccupied(point: CityPoint, radius: number, blockers: readonly NativeCityFootprint[]): boolean {
  return blockers.some(blocker => distance(point, blocker.point) < radius + blocker.radius - EPSILON);
}

/** 막힌 시간. 닿았고 목표 쪽으로 거의 못 갔으면 쌓이고, 아니면 0. */
export function nativeCityBlockedMs(blockedMs: number, dtMs: number, step: { readonly contact: boolean; readonly travel: number; readonly progress: number }): number {
  if (!step.contact || !(step.travel > 0) || step.progress >= step.travel * NATIVE_CITY_COLLISION.minProgress) return 0;
  return blockedMs + (Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0);
}

// ── 클릭 길: 서 있는 배우 돌아가기 ─────────────────────────────────────

/** 점과 선분 사이 거리. */
function segmentDistance(point: CityPoint, a: CityPoint, b: CityPoint): number {
  const ab: CityPoint = [b[0] - a[0], b[1] - a[1]], length = dot(ab, ab);
  const t = length < 1e-12 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * ab[0] + (point[1] - a[1]) * ab[1]) / length));
  return Math.hypot(a[0] + ab[0] * t - point[0], a[1] + ab[1] * t - point[1]);
}

/** 길(현재 자리부터)이 모든 몸 원의 접촉 거리 밖으로 지나가는가. */
export function nativeCityPathClear(from: CityPoint, path: readonly CityPoint[], radius: number, blockers: readonly NativeCityFootprint[]): boolean {
  let at = from;
  for (const next of path) {
    for (const blocker of blockers) if (segmentDistance(blocker.point, at, next) < radius + blocker.radius - EPSILON) return false;
    at = next;
  }
  return true;
}

/** 길찾기 다각형 반지름. 계획된 길(벽 여유 1.9)이 접촉 거리 + 여유 밖으로 지나가게 한다. 9점 표본이 놓치지 않게 1 단위보다 작게 하지 않는다. */
function routePolygonRadius(blocker: NativeCityFootprint, radius: number, stepUnits: number): number {
  return Math.max(1, radius + blocker.radius + NATIVE_CITY_COLLISION.routeMarginStrides * stepUnits
    - NATIVE_CITY_MOVEMENT.radius - NATIVE_CITY_MOVEMENT.pathMargin);
}

function circlePolygon(center: CityPoint, inner: number): CityPolygon {
  const sides = 12, outer = inner / Math.cos(Math.PI / sides);
  return Array.from({ length: sides }, (_, i): CityPoint =>
    [center[0] + Math.cos(i * 2 * Math.PI / sides) * outer, center[1] + Math.sin(i * 2 * Math.PI / sides) * outer]);
}

const routeCache = new WeakMap<NativeCityDefinition, Map<string, NativeCityDefinition>>();

/**
 * 서 있는 배우를 장애물로 더한 길찾기 정의. 덮어쓰기 구역(`navigationOverrides`)은 자기 장애물만 보므로 거기에도 더한다.
 * 같은 배치면 같은 객체를 돌려줘 길찾기 격자 캐시가 유지된다.
 */
export function nativeCityNavigationAround(navigation: NativeCityDefinition, standing: readonly NativeCityFootprint[], radius: number,
  stepUnits: number): NativeCityDefinition {
  if (standing.length === 0) return navigation;
  const key = standing.map(b => `${b.point[0].toFixed(2)},${b.point[1].toFixed(2)},${b.radius.toFixed(3)}`).sort().join(";") + `|${radius.toFixed(3)}|${stepUnits.toFixed(3)}`;
  let cache = routeCache.get(navigation);
  if (!cache) { cache = new Map(); routeCache.set(navigation, cache); }
  const known = cache.get(key);
  if (known) { cache.delete(key); cache.set(key, known); return known; }
  const polygons = standing.map(blocker => circlePolygon(blocker.point, routePolygonRadius(blocker, radius, stepUnits)));
  const around: NativeCityDefinition = { ...navigation, obstacles: [...navigation.obstacles, ...polygons],
    ...(navigation.navigationOverrides ? { navigationOverrides: navigation.navigationOverrides.map(area => ({ ...area, obstacles: [...area.obstacles, ...polygons] })) } : {}) };
  cache.set(key, around);
  while (cache.size > 8) cache.delete(cache.keys().next().value!);
  return around;
}

/** 벽 판정: 길찾기와 같은 여유(반지름 + 길 여유)로 먼저, 안 되면 몸 반지름으로. */
function segmentOpen(a: CityPoint, b: CityPoint, navigation: NativeCityDefinition): boolean {
  return citySegmentWalkable(a, b, navigation, NATIVE_CITY_MOVEMENT.radius + NATIVE_CITY_MOVEMENT.pathMargin)
    || citySegmentWalkable(a, b, navigation);
}

/**
 * 몸 원을 지나는 구간마다 그 배우 옆 한 점을 거쳐 가게 한다(싸다: 벽 판정 몇 번). 가까운 고리부터 짧은 순서로 고른다.
 * 모든 구간이 비켜 가면 그 길, 못 비키면 null.
 */
function detourAround(from: CityPoint, path: readonly CityPoint[], navigation: NativeCityDefinition,
  blockers: readonly NativeCityFootprint[], radius: number, stepUnits: number): CityPoint[] | null {
  const points: CityPoint[] = [from, ...path];
  const margin = NATIVE_CITY_COLLISION.routeMarginStrides * stepUnits;
  for (let pass = 0; pass < 6; pass++) {
    let index = -1, blocker: NativeCityFootprint | null = null;
    for (let i = 0; i + 1 < points.length && blocker === null; i++) {
      let closest = Infinity;
      for (const candidate of blockers) {
        const gap = segmentDistance(candidate.point, points[i]!, points[i + 1]!);
        if (gap < radius + candidate.radius - EPSILON && distance(points[i]!, candidate.point) < closest) {
          closest = distance(points[i]!, candidate.point); blocker = candidate; index = i;
        }
      }
    }
    if (blocker === null) return points.slice(1);
    const a = points[index]!, b = points[index + 1]!, reach = radius + blocker.radius + margin;
    const options: { readonly point: CityPoint; readonly cost: number }[] = [];
    for (const ring of [1.1, 1.5, 2.2]) for (let k = 0; k < 16; k++) {
      const angle = k * Math.PI / 8;
      const point: CityPoint = [blocker.point[0] + Math.cos(angle) * reach * ring, blocker.point[1] + Math.sin(angle) * reach * ring];
      options.push({ point, cost: distance(a, point) + distance(point, b) });
    }
    options.sort((x, y) => x.cost - y.cost);
    const pick = options.find(option => nativeCityPathClear(a, [option.point, b], radius, blockers)
      && segmentOpen(a, option.point, navigation) && segmentOpen(option.point, b, navigation));
    if (!pick) return null;
    points.splice(index + 1, 0, pick.point);
  }
  return null;
}

/**
 * 새로 받은 클릭 길을 서 있는 배우 둘레로 다시 잡는다. 원래 길이 이미 비켜 가면 그대로(같은 배열). 먼저 배우 옆 한 점을 거쳐
 * 가 보고(`detourAround`), 안 되면 배우를 장애물로 넣은 길찾기, 그래도 안 되면 원래 길 — 그때는 걷는 동안 `steer` 가 돌아간다.
 * `keepLast`: 포털 길의 마지막 점(문 건너편)은 손대지 않는다.
 * 지금 자리나 목적지가 이미 몸 원 안인 배우는 계획에서 빼고(그 배우 때문에 길이 아예 안 잡히지 않게) 걷는 중에 처리한다.
 * 접촉 거리에 맞닿은 배우(막혀 선 자리)는 겹침이 아니라 계획에 넣는다(`replan`).
 */
export function nativeCityRouteAround(from: CityPoint, path: readonly CityPoint[], navigation: NativeCityDefinition,
  standing: readonly NativeCityFootprint[], radius: number, stepUnits: number, keepLast = false): readonly CityPoint[] {
  const split = keepLast && path.length >= 2 ? path.length - 1 : path.length;
  const head = path.slice(0, split), tail = path.slice(split), goal = head.at(-1);
  if (goal === undefined) return path;
  // 겹침만 뺀다. 막혀 선 자리는 접촉 거리에 맞닿아 있다(걸음 맞춤 오차 1e-9) — 그 배우를 빼면 다시 잡은 길이 그를 지난다.
  const touching = (blocker: NativeCityFootprint, keep: number): boolean =>
    distance(blocker.point, from) < keep - EPSILON || distance(blocker.point, goal) < keep - EPSILON;
  const relevant = standing.filter(blocker => !touching(blocker, radius + blocker.radius));
  if (nativeCityPathClear(from, head, radius, relevant)) return path;
  const detoured = detourAround(from, head, navigation, relevant, radius, stepUnits);
  if (detoured !== null) return [...detoured, ...tail];
  const planned = relevant.filter(blocker => !touching(blocker,
    routePolygonRadius(blocker, radius, stepUnits) + NATIVE_CITY_MOVEMENT.radius + NATIVE_CITY_MOVEMENT.pathMargin));
  if (planned.length === 0) return path;
  const routed = cityWalkingPath(from, goal, nativeCityNavigationAround(navigation, planned, radius, stepUnits));
  return routed === null ? path : [...routed, ...tail];
}

// ── 씬이 프레임마다 쓰는 상태 ─────────────────────────────────────────

/**
 * 이번 프레임 주인공 걸음에 몸 충돌을 쓰는가. 연출 이동은 늘 통과한다 — 진행이 막히면 안 된다.
 * - `staging`: 귀빈 장면 무대·문턱 걷기(`NativeCityGuestListController.blocking`).
 * - `escorting`: 로잘린 호위 걷기.
 * - `scriptedGoal`: 장면 진행기가 잡은 길의 끝(그 길을 걷는 동안). 같은 점 객체일 때만 같은 길로 본다.
 * 포털 이동·대화·순간이동(`setPoint`)은 씬의 걷기 블록에 아예 들어오지 않는다.
 */
export function nativeCityPlayerCollides(state: { readonly staging: boolean; readonly escorting: boolean;
  readonly path: readonly CityPoint[]; readonly scriptedGoal: CityPoint | null }): boolean {
  if (state.staging || state.escorting) return false;
  return !nativeCityScriptedWalk(state);
}

/**
 * 지금 걷는 길이 장면 진행기가 잡은 길인가(충돌·달리기·조향이 함께 읽는다). 길의 끝이 진행기가 남긴 바로 그 점 객체일 때만이다 —
 * 그 길을 다 걸은 뒤 남은 목표는 낡은 값이라, 다음 클릭·안내 길(같은 자리라도 새 점)은 플레이어의 걸음이다.
 */
export function nativeCityScriptedWalk(state: { readonly path: readonly CityPoint[]; readonly scriptedGoal: CityPoint | null }): boolean {
  return state.scriptedGoal !== null && state.path.length > 0 && state.path.at(-1) === state.scriptedGoal;
}

export interface NativeCityCollisionWorld {
  /** 한 보(평면 단위). */
  readonly stepUnits: number;
  /** 주인공 반지름. */
  readonly radius: number;
  /** 몸이 있는 배우 전부. */
  readonly blockers: readonly NativeCityFootprint[];
}

/** 주민(발 자리)·KUMA·거리 주민 발 원을 한 목록으로. 몸을 빼는 주민(`nonSolid`, 기본은 늘 빼는 목록)은 뺀다. */
export function nativeCityCollisionWorld(stepUnits: number, residents: readonly { readonly id: string; readonly point: CityPoint }[],
  actors: readonly (NativeCityFootprint | null)[], nonSolid: readonly string[] = NATIVE_CITY_NON_SOLID_RESIDENTS): NativeCityCollisionWorld {
  const blockers: NativeCityFootprint[] = residents.filter(resident => !nonSolid.includes(resident.id))
    .map(resident => ({ id: resident.id, point: resident.point, radius: nativeCityFootprintRadius("resident", stepUnits) }));
  for (const actor of actors) if (actor !== null && actor.radius > 0) blockers.push(actor);
  return { stepUnits, radius: nativeCityFootprintRadius("player", stepUnits), blockers };
}

/**
 * 주인공 쪽 충돌 상태(막힌 시간·이미 손본 길). 씬은 연출 이동이 아닐 때만 부른다.
 * - `route`: 새로 받은 길(배열이 바뀌었으면 새 길)을 서 있는 배우 둘레로 다시 잡는다.
 * - `slide`: 방향키 걸음.
 * - `follow`: 길 따라 걸은 걸음. `stop` 이면 씬이 길을 끊는다.
 * - `pushOut`: 겹친 채 시작했을 때 천천히 떼어 낸다.
 */
export class NativeCityPlayerCollision {
  private blockedMs = 0;
  private known: readonly CityPoint[] | null = null;
  private replans = 0;

  get blockedTimeMs(): number { return this.blockedMs; }

  route(from: CityPoint, path: readonly CityPoint[], navigation: NativeCityDefinition, world: NativeCityCollisionWorld, keepLast = false): CityPoint[] {
    if (path === this.known) return path as CityPoint[];
    this.blockedMs = 0; this.replans = 0;
    const routed = nativeCityRouteAround(from, path, navigation, world.blockers.filter(blocker => !blocker.moving), world.radius, world.stepUnits, keepLast);
    const result = routed === path ? path as CityPoint[] : [...routed];
    this.known = result;
    return result;
  }

  slide(from: CityPoint, to: CityPoint, world: NativeCityCollisionWorld, walkable?: (from: CityPoint, to: CityPoint) => boolean): CityPoint {
    this.blockedMs = 0;
    return resolveNativeCityPlayerMove({ from, to, radius: world.radius, blockers: world.blockers, mode: "slide", walkable }).point;
  }

  /**
   * 길 따라 걸은 걸음을 맞춘다. `waypoint`: 걸음 시작 때 향하던 점, `path`: 걸은 뒤 남은 길.
   * `stop`: 여기서 멈춘다 — 목적지가 몸 안(`goalOccupied`)이거나 `blockedStopMs` 동안 막혔다. 막힘이면 씬은 먼저 `replan` 을 부른다.
   */
  follow(from: CityPoint, to: CityPoint, waypoint: CityPoint, goal: CityPoint, path: readonly CityPoint[], dtMs: number,
    world: NativeCityCollisionWorld, walkable?: (from: CityPoint, to: CityPoint) => boolean,
  ): { readonly point: CityPoint; readonly stop: boolean; readonly goalOccupied: boolean } {
    const move = resolveNativeCityPlayerMove({ from, to, radius: world.radius, blockers: world.blockers, mode: "steer", goal, walkable });
    this.known = path;
    if (move.goalOccupied) { this.blockedMs = 0; return { point: move.point, stop: true, goalOccupied: true }; }
    this.blockedMs = nativeCityBlockedMs(this.blockedMs, dtMs, { contact: move.contact !== null, travel: distance(from, to),
      progress: distance(from, waypoint) - distance(move.point, waypoint) });
    const stop = this.blockedMs >= NATIVE_CITY_COLLISION.blockedStopMs;
    if (stop) this.blockedMs = 0;
    return { point: move.point, stop, goalOccupied: false };
  }

  /**
   * 걷다 막혔을 때: 지금 자리에서 남은 길의 끝까지 길을 새로 찾고 지금 서 있는 몸 둘레로 돌린다(다시 누른 것과 같다).
   * 걸음당 `maxReplans` 번까지. 남은 길이 없거나, 길이 없거나, 횟수를 다 썼으면 null — 씬은 접촉 자리에서 멈춘다.
   * `keepLast`: 포털 길의 마지막 점(문 건너편)은 손대지 않는다.
   */
  replan(from: CityPoint, path: readonly CityPoint[], navigation: NativeCityDefinition, world: NativeCityCollisionWorld,
    keepLast = false): CityPoint[] | null {
    if (this.replans >= NATIVE_CITY_COLLISION.maxReplans || path.length === 0) return null;
    const split = keepLast && path.length >= 2 ? path.length - 1 : path.length;
    const fresh = cityWalkingPath(from, path[split - 1]!, navigation);
    if (fresh === null) return null;
    this.replans++; this.blockedMs = 0;
    const routed = [...nativeCityRouteAround(from, [...fresh, ...path.slice(split)], navigation,
      world.blockers.filter(blocker => !blocker.moving), world.radius, world.stepUnits, keepLast)];
    this.known = routed;
    return routed;
  }

  pushOut(point: CityPoint, dtMs: number, world: NativeCityCollisionWorld, walkable?: (from: CityPoint, to: CityPoint) => boolean): CityPoint {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(NATIVE_CITY_MOVEMENT.maxDtMs, dtMs)) : 0;
    return nativeCityPushOut(point, world.radius, world.blockers, NATIVE_CITY_COLLISION.pushOutStridesPerSec * world.stepUnits * dt / 1000, walkable);
  }
}
