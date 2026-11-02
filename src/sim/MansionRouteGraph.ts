import type { MansionLayout, VerticalLink } from "./MansionLayout";
import { floorOfY, floorSurfaceY, ladderFloors } from "./MansionLayout";
import type { WorldMetrics } from "./MansionValidator";
import {
  bodyHeight,
  climbMultiplier,
  isLinkBlockedByLoad,
  isLinkLocked,
  jumpMultiplier,
  speedMultiplier,
  ventTravelMs,
} from "./MovementRules";
import type { Tuning } from "./tuning";
import type { Rect } from "./GeometryTypes";

/**
 * 저택의 실제 이동 그래프.
 *
 * 예전 `MansionRoutes.travelMs` 는 "층 사이에는 사다리가 하나뿐" 이라고 보고 층 번호만 따라
 * 내려갔다. 그래서 (1) 한 층 쌍에 사다리가 둘인 블랙손 저택에서는 마지막 사다리만 보였고,
 * (2) 환기구·낙하 구멍 같은 지름길을 몰랐고, (3) 층 안의 벽을 몰라 봉인된 수장고 벽도
 * 걸어서 통과했다. 여기서는 레이아웃이 가진 것만으로 그래프를 세우고 최단 경로를 찾는다.
 *
 * - 노드: 사다리 위·아래 끝, 환기구 입구·출구, 낙하 구멍의 위·아래, 파쿠르 루트의 출발·도착.
 * - 걷기 간선: 같은 층의 같은 **구간** 안에서만. 구간은 점프로 못 넘고 기어서도 못 지나는
 *   solid, 그리고 점프로 못 건너는 슬래브 틈(블랙손 아트리움처럼 뚜껑 없는 구멍)이 층을 자른
 *   조각이다. 적재가 무거우면 점프가 낮고 짧아져 상자도 벽이 되고 좁은 틈도 끊긴다.
 * - 수직 간선: 사다리(위·아래 속도, 꼭대기 올라서기 배속), 환기구(적재·열쇠 게이트), 낙하
 *   구멍(원웨이 발판을 차례로 밟는 낙하 시간), 슬래브 틈 가장자리에서 걸어 떨어지기,
 *   파쿠르(던지기→감기→흔들기→날기 박자).
 *
 * 층 밴드의 바닥면(`floorSurfaceY`)에 슬래브가 하나도 없는 층은 틈을 판정하지 않는다 —
 * 경매장처럼 바닥 높이를 따로 정한 단일 화면 세트는 예전처럼 이어진 층으로 본다.
 *
 * 속도·게이트 공식은 전부 `MovementRules` 와 튜닝을 그대로 읽는다. 경비는 세지 않으므로
 * 결과는 여전히 "가장 잘 풀렸을 때" 의 시간이다.
 *
 * 모델링하지 않는 것: 고리 사슬(grappleAnchors)의 자유 연결, 층 밴드 사이 중간 발판 위 걷기,
 * 가속 구간. 고리로만 이어지는 곳(블랙손 heist 수장고 → 처마 회랑)은 경로 없음으로 나온다 —
 * 그 구간에는 애초에 출구가 열려 있지 않다(`ExhibitionRules.exhibitionLayout`).
 */

export interface RouteSpot {
  readonly floor: number;
  readonly x: number;
}

export interface RouteGraphOptions {
  /** 질주 속도로 걷는가. */
  readonly sprint: boolean;
  /** 안내원 구역 열쇠를 가졌는가. 없으면 잠긴 서비스 통로를 쓰지 않는다. */
  readonly areaKey: boolean;
  readonly loadRatio: number;
}

export interface RouteResult {
  readonly ms: number;
  /** 거친 사다리·환기구·낙하·파쿠르의 id 순서. 같은 층 걷기만이면 비어 있다. */
  readonly via: readonly string[];
}

type Span = readonly [number, number];

interface WallCandidate {
  readonly span: Span;
  /** 바닥면에서 꼭대기까지. 점프 정점이 이보다 낮으면 벽이다. */
  readonly heightPx: number;
}

/** 적재와 무관한 뼈대. 레이아웃·튜닝·월드가 같으면 한 번만 세운다. */
interface Skeleton {
  readonly world: WorldMetrics;
  readonly tuning: Tuning;
  readonly nodes: readonly RouteSpot[];
  readonly ladders: readonly { readonly id: string; readonly upper: number; readonly lower: number; readonly climbPx: number }[];
  readonly vents: readonly { readonly link: VerticalLink; readonly entry: number; readonly exit: number; readonly ms: number }[];
  /** 낙하·파쿠르처럼 적재가 시간을 바꾸지 않는 한 방향 간선. */
  readonly fixed: readonly { readonly id: string; readonly from: number; readonly to: number; readonly ms: number }[];
  readonly solids: readonly Rect[];
  /** 층별 벽 후보. 처음 묻는 층이면 그때 채운다. */
  readonly wallCandidates: Map<number, readonly WallCandidate[]>;
  /** 노드가 있는 층들의 벽 후보 높이, 오름차순. 점프 정점이 몇 개를 넘는지가 벽 조합을 정한다. */
  readonly wallHeights: readonly number[];
  /** 층별 슬래브 틈(슬래브 사이의 빈 구간). 처음 묻는 층이면 그때 채운다. */
  readonly gaps: Map<number, readonly Span[]>;
  /** 노드가 있는 층들의 틈 폭, 오름차순. 점프 거리가 몇 개를 건너는지가 틈 조합을 정한다. */
  readonly gapWidths: readonly number[];
  readonly layout: MansionLayout;
  /** 적재 게이트가 걸린 환기구들의 한계, 오름차순. 적재가 몇 개를 넘는지가 열린 환기구 조합을 정한다. */
  readonly ventLimits: readonly number[];
}

const WALK = 0;
const CLIMB_UP = 1;
const CLIMB_DOWN = 2;
const FIXED = 3;

/** `amount` 는 걷기·사다리면 px, 나머지는 ms 다. 시간은 적재별 속도로 그때 바꾼다. */
interface Edge {
  readonly to: number;
  readonly kind: typeof WALK | typeof CLIMB_UP | typeof CLIMB_DOWN | typeof FIXED;
  readonly amount: number;
  /** 수직 이동 간선이면 그 id. 걷기는 null. */
  readonly via: string | null;
}

interface Segment {
  readonly from: number;
  readonly to: number;
}

/**
 * 벽 조합과 열린 환기구 조합이 같으면 연결 모양이 같다. 적재가 바꾸는 것은 속도뿐이므로
 * 이 모양은 여러 적재가 나눠 쓴다.
 */
interface Topology {
  readonly segments: readonly Segment[];
  readonly segmentsByFloor: ReadonlyMap<number, readonly number[]>;
  readonly nodeSegment: Int32Array;
  readonly nodesBySegment: ReadonlyMap<number, readonly number[]>;
  readonly edges: readonly (readonly Edge[])[];
}

/** Dijkstra 한 줄. 출발 노드 하나에서 모든 노드까지. */
interface Row {
  readonly dist: Float64Array;
  readonly prev: Int32Array;
  readonly via: readonly (string | null)[];
}

export interface RouteGraph {
  readonly skeleton: Skeleton;
  readonly topology: Topology;
  readonly walkPxPerMs: number;
  /** 이 적재의 점프 정점과 거리. 연결 모양은 같은 벽·틈 조합의 다른 적재와 나눠 쓴다. */
  readonly clearancePx: number;
  readonly jumpDistancePx: number;
  readonly upPxPerSec: number;
  readonly downPxPerSec: number;
  /** 노드가 없는 층의 구간. 번호는 음수라 노드 구간과 섞이지 않는다. */
  readonly strayFloors: Map<number, readonly { readonly id: number; readonly segment: Segment }[]>;
  readonly rows: (Row | undefined)[];
}

/** 선 채로 이 높이까지는 점프로 넘는다. h = v²/2g, 적재가 이륙 속도를 깎는다. */
function jumpClearancePx(tuning: Tuning, loadRatio: number): number {
  const v = tuning.movement.jumpVelocity * jumpMultiplier(loadRatio, tuning);
  return tuning.movement.gravity > 0 ? (v * v) / (2 * tuning.movement.gravity) : 0;
}

/**
 * 같은 높이로 뛰어 건너는 수평 거리. 체공 2v/g 동안 걷기(질주면 달리기) 속도로 간다.
 * 가속·점프 끊기는 세지 않으므로 조금 너그럽다.
 */
function jumpDistancePx(tuning: Tuning, loadRatio: number, sprint: boolean): number {
  if (tuning.movement.gravity <= 0) return 0;
  const airtimeSec = (2 * tuning.movement.jumpVelocity * jumpMultiplier(loadRatio, tuning)) / tuning.movement.gravity;
  const speed = (sprint ? tuning.movement.runSpeed : tuning.movement.walkSpeed) * speedMultiplier(loadRatio, tuning);
  return airtimeSec * speed;
}

/** 정지 상태에서 h 만큼 떨어지는 시간(ms). 최대 낙하 속도에 닿으면 그 뒤는 등속이다. */
function fallMs(heightPx: number, tuning: Tuning): number {
  const g = tuning.movement.gravity;
  if (heightPx <= 0 || g <= 0) return 0;
  const vMax = tuning.movement.maxFallSpeed;
  const hAtMax = (vMax * vMax) / (2 * g);
  if (heightPx <= hAtMax) return Math.sqrt((2 * heightPx) / g) * 1000;
  return (vMax / g + (heightPx - hAtMax) / vMax) * 1000;
}

/** 사다리를 끝에서 끝까지 오르는 시간. 꼭대기 `ladderTopMountPx` 는 올라서기 배속이다. */
function climbUpMs(distancePx: number, pxPerSec: number, tuning: Tuning): number {
  const mountPx = Math.min(distancePx, Math.max(0, tuning.movement.ladderTopMountPx));
  const mountMul = tuning.movement.ladderTopMountSpeedMul > 0 ? tuning.movement.ladderTopMountSpeedMul : 1;
  return ((distancePx - mountPx) / pxPerSec + mountPx / (pxPerSec * mountMul)) * 1000;
}

function isLadderHatch(hatch: Rect, links: readonly VerticalLink[]): boolean {
  return links.some((link) => link.kind === "ladder"
    && link.rect.x < hatch.x + hatch.w && link.rect.x + link.rect.w > hatch.x
    && link.rect.y <= hatch.y && link.rect.y + link.rect.h >= hatch.y);
}

interface DropEdge {
  readonly id: string;
  /** 떨어지기 시작하는 곳과 내려앉는 곳의 x. 뚜껑 낙하는 같고, 틈 가장자리는 몸 반 폭 어긋난다. */
  readonly x: number;
  readonly x2: number;
  readonly fromFloor: number;
  readonly toFloor: number;
  readonly ms: number;
}

/**
 * (x, y) 에서 떨어지기 시작해 어느 층에 서는가. 원웨이 발판에 걸리면 ↓+Space 로 다시 떨어지고,
 * solid 나 아래층 바닥면에 닿으면 멈춘다. 한 번에 `pratfallTiles` 를 넘게 떨어지면 쓰러짐 경직을
 * 더한다(구르기로 받을 수도 있지만 하한을 낙관하지 않는다). 받아 줄 것이 없으면 null.
 */
function fallFrom(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  x: number,
  startY: number,
  startFloor: number,
  ignore: object | null,
): { readonly floor: number; readonly ms: number } | null {
  const half = tuning.movement.bodyWidth / 2;
  const catchers = layout.geometry
    .filter((g) => g !== ignore && (g.kind === "platform" || g.kind === "solid")
      && g.rect.y > startY + 0.5 && x + half > g.rect.x && x - half < g.rect.x + g.rect.w)
    .sort((a, b) => a.rect.y - b.rect.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let y = startY;
  let ms = 0;
  for (const catcher of catchers) {
    const height = catcher.rect.y - y;
    ms += fallMs(height, tuning);
    if (height / tuning.world.tilePx > tuning.movement.pratfallTiles) ms += tuning.movement.fallStaggerMs;
    y = catcher.rect.y;
    const floor = floorOfY(y, world.floorHeightPx);
    const onSurface = Math.abs(y - floorSurfaceY(floor, world.floorHeightPx, world.slabThicknessPx)) <= 0.5;
    if (catcher.kind === "solid" || (floor > startFloor && onSurface)) return floor > startFloor ? { floor, ms } : null;
  }
  return null;
}

/**
 * 사다리가 없는 슬래브 구멍 뚜껑(원웨이 발판)으로 ↓+Space 낙하. 사다리 구멍 뚜껑은 ↓ 가 사다리를
 * 먼저 잡으므로(`MovementRules` 사다리 진입이 낙하보다 앞선다) 낙하 경로가 아니다.
 */
function dropEdges(layout: MansionLayout, world: WorldMetrics, tuning: Tuning): DropEdge[] {
  const out: DropEdge[] = [];
  for (const hatch of layout.geometry) {
    if (hatch.kind !== "platform") continue;
    const floor = floorOfY(hatch.rect.y, world.floorHeightPx);
    if (Math.abs(hatch.rect.y - floorSurfaceY(floor, world.floorHeightPx, world.slabThicknessPx)) > 0.5) continue;
    if (isLadderHatch(hatch.rect, layout.links)) continue;
    const x = hatch.rect.x + hatch.rect.w / 2;
    const landing = fallFrom(layout, world, tuning, x, hatch.rect.y, floor, hatch);
    if (landing !== null) out.push({ id: hatch.id, x, x2: x, fromFloor: floor, toFloor: landing.floor, ms: landing.ms });
  }
  return out;
}

/**
 * 층 밴드 바닥면에 놓인 슬래브(solid·원웨이 발판)가 덮지 못한 안쪽 구간. 바닥면에 슬래브가
 * 하나도 없는 층은 바닥 높이를 따로 정한 세트로 보고 틈을 만들지 않는다.
 */
function slabGapsOf(skeleton: Skeleton, floor: number): readonly Span[] {
  const known = skeleton.gaps.get(floor);
  if (known !== undefined) return known;
  const { world } = skeleton;
  const surface = floorSurfaceY(floor, world.floorHeightPx, world.slabThicknessPx);
  const spans = skeleton.layout.geometry
    .filter((g) => (g.kind === "solid" || g.kind === "platform") && Math.abs(g.rect.y - surface) <= 0.5)
    .map((g) => [g.rect.x, g.rect.x + g.rect.w] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const gaps: Span[] = [];
  let cursor: number | null = null;
  for (const [from, to] of spans) {
    if (cursor !== null && from > cursor) gaps.push([cursor, from]);
    cursor = cursor === null ? to : Math.max(cursor, to);
  }
  skeleton.gaps.set(floor, gaps);
  return gaps;
}

/**
 * 틈 가장자리에서 걸어 떨어지기. 가장자리 바로 바깥(몸 반 폭 + 1px)에서 떨어뜨려 받아 주는
 * 곳을 찾는다. 점프로 건널 수 있는 틈도 떨어지는 길은 따로 있다.
 */
function gapFallEdges(skeleton: Skeleton, floors: readonly number[]): DropEdge[] {
  const { layout, world, tuning } = skeleton;
  const out: DropEdge[] = [];
  const edgeOffset = tuning.movement.bodyWidth / 2 + 1;
  for (const floor of floors) {
    const surface = floorSurfaceY(floor, world.floorHeightPx, world.slabThicknessPx);
    for (const [from, to] of slabGapsOf(skeleton, floor)) {
      // 몸보다 좁은 틈으로는 빠지지 않는다.
      if (to - from < tuning.movement.bodyWidth) continue;
      for (const [edge, x] of [[from, from + edgeOffset], [to, to - edgeOffset]] as const) {
        const landing = fallFrom(layout, world, tuning, x, surface, floor, null);
        if (landing === null) continue;
        out.push({ id: `gap-${floor}-${Math.round(edge)}`, x: edge, x2: x, fromFloor: floor, toFloor: landing.floor, ms: landing.ms });
      }
    }
  }
  return out;
}

/**
 * 이 층에서 벽이 될 수 있는 solid. 아래 끝이 웅크린 키보다 바닥에 가까워 밑으로 못 지나가는
 * 것만 남기고, 넘으려면 필요한 점프 높이를 붙인다. 바닥 슬래브·천장은 여기서 빠진다.
 */
function wallCandidatesOf(skeleton: Skeleton, floor: number): readonly WallCandidate[] {
  const known = skeleton.wallCandidates.get(floor);
  if (known !== undefined) return known;
  const { world, tuning } = skeleton;
  const surface = floorSurfaceY(floor, world.floorHeightPx, world.slabThicknessPx);
  const crawl = bodyHeight("crouch", tuning);
  const list = skeleton.solids
    .filter((rect) => rect.y < surface && rect.y + rect.h > surface - crawl)
    .map((rect) => ({ span: [rect.x, rect.x + rect.w] as const, heightPx: surface - rect.y }));
  skeleton.wallCandidates.set(floor, list);
  return list;
}

/** 벽과 못 건너는 틈으로 자른 구간들. 막는 곳끼리 딱 붙거나 겹치면 구간을 만들지 않는다. */
function cutSegments(skeleton: Skeleton, floor: number, clearancePx: number, jumpPx: number): Segment[] {
  const spans = [
    ...wallCandidatesOf(skeleton, floor).filter((candidate) => candidate.heightPx > clearancePx).map((candidate) => candidate.span),
    ...slabGapsOf(skeleton, floor).filter(([from, to]) => to - from > jumpPx),
  ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Segment[] = [];
  let cursor = Number.NEGATIVE_INFINITY;
  for (const [from, to] of spans) {
    if (from > cursor) out.push({ from: cursor, to: from });
    cursor = Math.max(cursor, to);
  }
  out.push({ from: cursor, to: Number.POSITIVE_INFINITY });
  return out;
}

/** x 를 담은 구간. 벽 속이라면 가장 가까운 구간(같으면 앞쪽)으로 본다. */
function nearestSegment<T>(candidates: readonly T[], segmentOfCandidate: (candidate: T) => Segment, x: number): T {
  let best: T = candidates[0] as T;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const segment = segmentOfCandidate(candidate);
    const gap = x < segment.from ? segment.from - x : x > segment.to ? x - segment.to : 0;
    if (gap < bestGap) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

function buildSkeleton(layout: MansionLayout, world: WorldMetrics, tuning: Tuning): Skeleton {
  const nodes: RouteSpot[] = [];
  const addNode = (floor: number, x: number): number => {
    nodes.push({ floor, x });
    return nodes.length - 1;
  };
  const ladders: { id: string; upper: number; lower: number; climbPx: number }[] = [];
  const vents: { link: VerticalLink; entry: number; exit: number; ms: number }[] = [];
  const fixed: { id: string; from: number; to: number; ms: number }[] = [];

  for (const link of layout.links) {
    if (link.kind === "ladder") {
      const [upperFloor, lowerFloor] = ladderFloors(link, world.floorHeightPx);
      const x = link.rect.x + link.rect.w / 2;
      ladders.push({
        id: link.id,
        upper: addNode(upperFloor, x),
        lower: addNode(lowerFloor, x),
        // 발은 rect.y + 선 키(위층 바닥면)와 rect 아래 끝(아래층 바닥면) 사이를 오간다.
        climbPx: Math.max(0, link.rect.h - bodyHeight("climb", tuning)),
      });
      continue;
    }
    if (link.kind !== "vent" || link.exit === undefined) continue;
    vents.push({
      link,
      entry: addNode(floorOfY(link.rect.y + link.rect.h / 2, world.floorHeightPx), link.rect.x + link.rect.w / 2),
      exit: addNode(floorOfY(link.exit.y, world.floorHeightPx), link.exit.x),
      ms: ventTravelMs(link, tuning),
    });
  }

  const base: Skeleton = {
    world,
    tuning,
    layout,
    nodes,
    ladders,
    vents,
    fixed,
    solids: layout.geometry.filter((g) => g.kind === "solid").map((g) => g.rect),
    wallCandidates: new Map(),
    wallHeights: [],
    gaps: new Map(),
    gapWidths: [],
    ventLimits: vents.flatMap((vent) => vent.link.loadLimit === undefined ? [] : [vent.link.loadLimit]).sort((a, b) => a - b),
  };
  const bandFloors = layout.bands.map((band) => band.index);
  for (const drop of [...dropEdges(layout, world, tuning), ...gapFallEdges(base, bandFloors)]) {
    fixed.push({ id: drop.id, from: addNode(drop.fromFloor, drop.x), to: addNode(drop.toFloor, drop.x2), ms: drop.ms });
  }

  // 파쿠르 루트는 저작된 한 방향 도하다. 박자는 던지기→감기→흔들기→날기 튜닝의 합이다.
  const parkourMs = tuning.parkour.throwMs + tuning.parkour.reelMs + tuning.parkour.swingTravelMs
    + tuning.parkour.releaseFlightMs;
  for (const route of layout.parkourRoutes ?? []) {
    fixed.push({
      id: route.id,
      from: addNode(floorOfY(route.from.y, world.floorHeightPx), route.from.x),
      to: addNode(floorOfY(route.to.y, world.floorHeightPx), route.to.x),
      ms: parkourMs,
    });
  }

  const floors = [...new Set(nodes.map((node) => node.floor))];
  const heights = floors.flatMap((floor) => wallCandidatesOf(base, floor).map((candidate) => candidate.heightPx));
  const widths = floors.flatMap((floor) => slabGapsOf(base, floor).map(([from, to]) => to - from));
  return { ...base, wallHeights: heights.sort((a, b) => a - b), gapWidths: widths.sort((a, b) => a - b) };
}

function buildTopology(skeleton: Skeleton, clearancePx: number, jumpPx: number, loadRatio: number, areaKey: boolean): Topology {
  const segments: Segment[] = [];
  const segmentsByFloor = new Map<number, readonly number[]>();
  const segmentIdsOf = (floor: number): readonly number[] => {
    const known = segmentsByFloor.get(floor);
    if (known !== undefined) return known;
    const ids = cutSegments(skeleton, floor, clearancePx, jumpPx).map((segment) => {
      segments.push(segment);
      return segments.length - 1;
    });
    segmentsByFloor.set(floor, ids);
    return ids;
  };

  const n = skeleton.nodes.length;
  const nodeSegment = new Int32Array(n);
  const bySegment = new Map<number, number[]>();
  skeleton.nodes.forEach((node, index) => {
    const segment = nearestSegment(segmentIdsOf(node.floor), (id) => segments[id]!, node.x);
    nodeSegment[index] = segment;
    const list = bySegment.get(segment) ?? [];
    list.push(index);
    bySegment.set(segment, list);
  });

  const edges: Edge[][] = Array.from({ length: n }, () => []);
  // 같은 구간 안에서는 x 로 이웃한 노드끼리만 잇는다. 걷기는 |dx| 라 이웃 사슬이 모든 쌍을 대신한다.
  for (const list of bySegment.values()) {
    const sorted = [...list].sort((a, b) => skeleton.nodes[a]!.x - skeleton.nodes[b]!.x || a - b);
    for (let i = 1; i < sorted.length; i += 1) {
      const a = sorted[i - 1]!;
      const b = sorted[i]!;
      const px = Math.abs(skeleton.nodes[b]!.x - skeleton.nodes[a]!.x);
      edges[a]!.push({ to: b, kind: WALK, amount: px, via: null });
      edges[b]!.push({ to: a, kind: WALK, amount: px, via: null });
    }
  }
  for (const ladder of skeleton.ladders) {
    edges[ladder.lower]!.push({ to: ladder.upper, kind: CLIMB_UP, amount: ladder.climbPx, via: ladder.id });
    edges[ladder.upper]!.push({ to: ladder.lower, kind: CLIMB_DOWN, amount: ladder.climbPx, via: ladder.id });
  }
  for (const vent of skeleton.vents) {
    if (isLinkBlockedByLoad(vent.link, loadRatio) || isLinkLocked(vent.link, areaKey)) continue;
    edges[vent.entry]!.push({ to: vent.exit, kind: FIXED, amount: vent.ms, via: vent.link.id });
  }
  for (const edge of skeleton.fixed) edges[edge.from]!.push({ to: edge.to, kind: FIXED, amount: edge.ms, via: edge.id });

  return { segments, segmentsByFloor, nodeSegment, nodesBySegment: bySegment, edges };
}

function edgeMs(graph: RouteGraph, edge: Edge): number {
  switch (edge.kind) {
    case WALK: return edge.amount / graph.walkPxPerMs;
    case CLIMB_UP: return graph.upPxPerSec > 0 ? climbUpMs(edge.amount, graph.upPxPerSec, graph.skeleton.tuning) : Number.POSITIVE_INFINITY;
    case CLIMB_DOWN: return graph.downPxPerSec > 0 ? (edge.amount / graph.downPxPerSec) * 1000 : Number.POSITIVE_INFINITY;
    default: return edge.amount;
  }
}

/**
 * 출발 노드 하나의 Dijkstra. 노드가 수십 개뿐이라 힙 없이 선형 선택한다. 같은 시간이면 번호가
 * 작은 노드가 먼저 확정되고(엄격한 < 비교), 먼저 찾은 선행자를 유지한다 — 레이아웃 배열 순서만으로
 * 경로가 정해진다. 필요한 출발점만 계산해 둔다.
 */
function rowOf(graph: RouteGraph, source: number): Row {
  const cached = graph.rows[source];
  if (cached !== undefined) return cached;
  const n = graph.skeleton.nodes.length;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(n).fill(-1);
  const via = new Array<string | null>(n).fill(null);
  const done = new Uint8Array(n);
  dist[source] = 0;
  for (;;) {
    let current = -1;
    for (let i = 0; i < n; i += 1) {
      if (done[i] === 1 || dist[i] === Number.POSITIVE_INFINITY) continue;
      if (current < 0 || dist[i]! < dist[current]!) current = i;
    }
    if (current < 0) break;
    done[current] = 1;
    for (const edge of graph.topology.edges[current]!) {
      const candidate = dist[current]! + edgeMs(graph, edge);
      if (candidate < dist[edge.to]!) {
        dist[edge.to] = candidate;
        prev[edge.to] = current;
        via[edge.to] = edge.via;
      }
    }
  }
  const row = { dist, prev, via };
  graph.rows[source] = row;
  return row;
}

const GRAPH_CACHE_LIMIT = 256;

interface CacheEntry {
  readonly skeleton: Skeleton;
  /** "열쇠|막힌 환기구 수|넘는 벽 수|건너는 틈 수" → 연결 모양. */
  readonly topologies: Map<string, Topology>;
  /** 질주·열쇠 조합(0..3) → 적재율 → 그래프. */
  readonly graphs: readonly Map<number, RouteGraph | null>[];
}

/**
 * 최근에 물은 레이아웃 몇 개만 강하게 쥔다. WeakMap 으로 레이아웃마다 항목을 걸면, HUD 처럼
 * 매 프레임 새 레이아웃 객체(전시 투영 등)로 묻는 곳에서 약한 참조 정리가 GC 를 무겁게 만든다
 * (블랙손 한 번에 1.6ms 를 쟀다). 같은 객체로 거듭 묻는 탐욕 모델·테스트는 여기서 적중한다.
 */
const RECENT_LAYOUTS = 8;
const recent: { readonly layout: MansionLayout; readonly tuning: Tuning; readonly world: WorldMetrics; readonly entry: CacheEntry }[] = [];

function cacheEntry(layout: MansionLayout, world: WorldMetrics, tuning: Tuning): CacheEntry {
  for (let i = 0; i < recent.length; i += 1) {
    const hit = recent[i]!;
    if (hit.layout !== layout || hit.tuning !== tuning || hit.world !== world) continue;
    if (i > 0) {
      recent.splice(i, 1);
      recent.unshift(hit);
    }
    return hit.entry;
  }
  const entry: CacheEntry = {
    skeleton: buildSkeleton(layout, world, tuning),
    topologies: new Map(),
    graphs: [new Map(), new Map(), new Map(), new Map()],
  };
  recent.unshift({ layout, tuning, world, entry });
  if (recent.length > RECENT_LAYOUTS) recent.pop();
  return entry;
}

/** 오름차순 목록에서 value 이하인 것의 수. */
function countBelow(sorted: readonly number[], value: number): number {
  let count = 0;
  while (count < sorted.length && sorted[count]! <= value) count += 1;
  return count;
}

/**
 * 레이아웃·튜닝·월드·적재·질주·열쇠가 같으면 같은 그래프다. 탐욕 모델과 HUD 가 매 틱 여러 번
 * 물으므로 세운 것을 재사용한다. 레이아웃이 새 객체면(전시 투영 등) 자연히 새로 세운다.
 */
export function routeGraph(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  options: RouteGraphOptions,
): RouteGraph | null {
  const entry = cacheEntry(layout, world, tuning);
  const byLoad = entry.graphs[(options.sprint ? 1 : 0) + (options.areaKey ? 2 : 0)]!;
  const known = byLoad.get(options.loadRatio);
  if (known !== undefined || byLoad.has(options.loadRatio)) return known ?? null;
  if (byLoad.size >= GRAPH_CACHE_LIMIT) byLoad.clear();

  const { skeleton } = entry;
  const base = options.sprint ? tuning.movement.runSpeed : tuning.movement.walkSpeed;
  const walkPxPerMs = (base * speedMultiplier(options.loadRatio, tuning)) / 1000;
  if (!(walkPxPerMs > 0)) {
    byLoad.set(options.loadRatio, null);
    return null;
  }
  const clearancePx = jumpClearancePx(tuning, options.loadRatio);
  const jumpPx = jumpDistancePx(tuning, options.loadRatio, options.sprint);
  // 환기구는 적재 >= 한계에서 막힌다(`isLinkBlockedByLoad`). 벽은 높이 > 정점, 틈은 폭 > 점프 거리일 때 막힌다.
  const topologyKey = [
    options.areaKey ? 1 : 0,
    countBelow(skeleton.ventLimits, options.loadRatio),
    countBelow(skeleton.wallHeights, clearancePx),
    countBelow(skeleton.gapWidths, jumpPx),
  ].join("|");
  let topology = entry.topologies.get(topologyKey);
  if (topology === undefined) {
    topology = buildTopology(skeleton, clearancePx, jumpPx, options.loadRatio, options.areaKey);
    entry.topologies.set(topologyKey, topology);
  }
  const climbMul = climbMultiplier(options.loadRatio, tuning);
  const graph: RouteGraph = {
    skeleton,
    topology,
    walkPxPerMs,
    clearancePx,
    jumpDistancePx: jumpPx,
    upPxPerSec: tuning.movement.climbUpSpeed * climbMul,
    downPxPerSec: tuning.movement.climbDownSpeed * climbMul,
    strayFloors: new Map(),
    rows: new Array<Row | undefined>(skeleton.nodes.length),
  };
  byLoad.set(options.loadRatio, graph);
  return graph;
}

/**
 * 지점이 속한 구간. 노드가 있는 층은 공유 연결 모양의 구간을 쓴다. 노드가 없는 층은 이 적재의
 * 점프 높이로 따로 잘라 음수 번호를 준다 — 그 층에서는 같은 구간 걷기만 가능하다.
 */
function segmentOf(graph: RouteGraph, spot: RouteSpot): number {
  const shared = graph.topology.segmentsByFloor.get(spot.floor);
  if (shared !== undefined) return nearestSegment(shared, (id) => graph.topology.segments[id]!, spot.x);
  let stray = graph.strayFloors.get(spot.floor);
  if (stray === undefined) {
    const offset = [...graph.strayFloors.values()].reduce((sum, list) => sum + list.length, 0);
    stray = cutSegments(graph.skeleton, spot.floor, graph.clearancePx, graph.jumpDistancePx)
      .map((segment, index) => ({ id: -1 - offset - index, segment }));
    graph.strayFloors.set(spot.floor, stray);
  }
  return nearestSegment(stray, (entry) => entry.segment, spot.x).id;
}

/** 두 지점 사이 최단 경로. 이어지지 않으면 null. */
export function shortestRoute(graph: RouteGraph, from: RouteSpot, to: RouteSpot): RouteResult | null {
  const fromSegment = segmentOf(graph, from);
  const toSegment = segmentOf(graph, to);
  const walk = graph.walkPxPerMs;
  const nodes = graph.skeleton.nodes;
  let best = fromSegment === toSegment ? Math.abs(to.x - from.x) / walk : Number.POSITIVE_INFINITY;
  let bestStart = -1;
  let bestEnd = -1;
  const ends = graph.topology.nodesBySegment.get(toSegment) ?? [];
  if (ends.length > 0) {
    for (const start of graph.topology.nodesBySegment.get(fromSegment) ?? []) {
      const head = Math.abs(nodes[start]!.x - from.x) / walk;
      if (head >= best) continue;
      const row = rowOf(graph, start);
      for (const end of ends) {
        const middle = row.dist[end]!;
        if (middle === Number.POSITIVE_INFINITY) continue;
        const total = head + middle + Math.abs(to.x - nodes[end]!.x) / walk;
        if (total < best) {
          best = total;
          bestStart = start;
          bestEnd = end;
        }
      }
    }
  }
  if (best === Number.POSITIVE_INFINITY) return null;
  if (bestStart < 0) return { ms: best, via: [] };

  const row = rowOf(graph, bestStart);
  const via: string[] = [];
  for (let node = bestEnd; node !== bestStart && node >= 0; node = row.prev[node]!) {
    const label = row.via[node];
    if (label !== null && label !== undefined) via.push(label);
  }
  via.reverse();
  return { ms: best, via };
}
