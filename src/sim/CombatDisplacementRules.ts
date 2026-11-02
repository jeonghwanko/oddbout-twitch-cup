import type { MansionLayout } from "./MansionLayout";
import { platformRects, solidRects } from "./MansionLayout";
import { clamp } from "./geom";

export type DisplacementBlock = "solid" | "world" | "ledge";

export interface HorizontalDisplacement {
  readonly x: number;
  readonly deltaX: number;
  readonly blockedBy: DisplacementBlock | null;
}

export interface HorizontalDisplacementInput {
  readonly fromX: number;
  readonly deltaX: number;
  /** 발바닥 기준 월드 Y. */
  readonly feetY: number;
  readonly halfWidth: number;
  readonly bodyHeight: number;
  readonly stayGrounded: boolean;
}

export interface ChainBody {
  readonly id: string;
  readonly x: number;
  readonly feetY: number;
}

export interface ChainCollision {
  readonly sourceId: string;
  readonly targetId: string;
  readonly at: { readonly x: number; readonly y: number };
}

export interface HorizontalChainDisplacement {
  readonly positions: ReadonlyMap<string, number>;
  readonly collisions: readonly ChainCollision[];
  readonly blockedBodyId: string | null;
  readonly blockedBy: DisplacementBlock | null;
}

/**
 * 전투의 순간 수평 이동을 연속 충돌로 푼다.
 *
 * 끝점만 겹치는지 보면 짧은 벽을 한 프레임에 건너뛸 수 있으므로, 출발점과 도착점
 * 사이에 처음 만나는 solid 면에서 멈춘다. 경비는 낙하 상태가 없어 현재 바닥의 연결된
 * 구간 안에 남기고, 플레이어는 밀려서 난간 밖으로 떨어질 수 있게 한다.
 */
export function displaceHorizontally(
  input: HorizontalDisplacementInput,
  layout: MansionLayout,
): HorizontalDisplacement {
  if (input.deltaX === 0) return { x: input.fromX, deltaX: 0, blockedBy: null };

  const direction = input.deltaX < 0 ? -1 : 1;
  const desiredX = input.fromX + input.deltaX;
  let x = clamp(desiredX, input.halfWidth, layout.widthPx - input.halfWidth);
  let blockedBy: DisplacementBlock | null = x === desiredX ? null : "world";
  const bodyTop = input.feetY - input.bodyHeight;

  for (const solid of solidRects(layout)) {
    const verticallyOverlaps = bodyTop < solid.y + solid.h && solid.y < input.feetY;
    if (!verticallyOverlaps) continue;

    if (direction > 0) {
      const fromEdge = input.fromX + input.halfWidth;
      const desiredEdge = x + input.halfWidth;
      if (solid.x < fromEdge || solid.x > desiredEdge) continue;
      const candidate = solid.x - input.halfWidth;
      if (candidate < x) {
        x = candidate;
        blockedBy = "solid";
      }
    } else {
      const fromEdge = input.fromX - input.halfWidth;
      const desiredEdge = x - input.halfWidth;
      const solidEdge = solid.x + solid.w;
      if (solidEdge > fromEdge || solidEdge < desiredEdge) continue;
      const candidate = solidEdge + input.halfWidth;
      if (candidate > x) {
        x = candidate;
        blockedBy = "solid";
      }
    }
  }

  if (input.stayGrounded) {
    const supportedX = clampToConnectedFloor(input.fromX, x, input.feetY, input.halfWidth, layout);
    if (supportedX !== x) {
      x = supportedX;
      blockedBy = "ledge";
    }
  }

  const deltaX = x - input.fromX;
  return { x, deltaX, blockedBy: Math.abs(deltaX - input.deltaX) <= 0.001 ? null : blockedBy };
}

/**
 * 붙어 있는 여러 몸에 밀치기 잔여 거리를 차례로 전달한다.
 * 앞 몸이 벽에서 6px만 움직였으면 뒤의 모든 몸도 최대 6px만 따라가므로 서로 겹치지 않는다.
 */
export function displaceHorizontalChain(
  primaryId: string,
  bodies: readonly ChainBody[],
  direction: -1 | 1,
  distancePx: number,
  halfWidth: number,
  bodyHeight: number,
  layout: MansionLayout,
): HorizontalChainDisplacement {
  const positions = new Map(bodies.map((body) => [body.id, body.x]));
  const bodyById = new Map(bodies.map((body) => [body.id, body]));
  const collisions: ChainCollision[] = [];
  const visited = new Set<string>();

  const push = (bodyId: string, distance: number): { movedPx: number; blockedBodyId: string | null; blockedBy: DisplacementBlock | null } => {
    const body = bodyById.get(bodyId);
    const fromX = positions.get(bodyId);
    if (body === undefined || fromX === undefined || distance <= 0) {
      return { movedPx: 0, blockedBodyId: null, blockedBy: null };
    }
    visited.add(bodyId);

    const staticMove = displaceHorizontally({
      fromX,
      deltaX: direction * distance,
      feetY: body.feetY,
      halfWidth,
      bodyHeight,
      stayGrounded: true,
    }, layout);
    const available = Math.abs(staticMove.deltaX);
    const next = nearestBodyAhead(bodyId, fromX, body.feetY, bodies, positions, visited, direction, halfWidth);
    if (next === null || next.gapPx > available + 0.001) {
      positions.set(bodyId, staticMove.x);
      return {
        movedPx: available,
        blockedBodyId: staticMove.blockedBy === null ? null : bodyId,
        blockedBy: staticMove.blockedBy,
      };
    }

    const remaining = Math.max(0, distance - next.gapPx);
    const downstream = push(next.body.id, remaining);
    const movedPx = next.gapPx + downstream.movedPx;
    const x = fromX + direction * movedPx;
    positions.set(bodyId, x);
    const targetX = positions.get(next.body.id) ?? next.body.x;
    collisions.unshift({
      sourceId: bodyId,
      targetId: next.body.id,
      at: { x: (x + targetX) / 2, y: body.feetY },
    });
    return { movedPx, blockedBodyId: downstream.blockedBodyId, blockedBy: downstream.blockedBy };
  };

  const result = push(primaryId, Math.max(0, distancePx));
  return {
    positions,
    collisions,
    blockedBodyId: result.blockedBodyId,
    blockedBy: result.blockedBy,
  };
}

function nearestBodyAhead(
  sourceId: string,
  sourceX: number,
  feetY: number,
  bodies: readonly ChainBody[],
  positions: ReadonlyMap<string, number>,
  visited: ReadonlySet<string>,
  direction: -1 | 1,
  halfWidth: number,
): { readonly body: ChainBody; readonly gapPx: number } | null {
  let best: { body: ChainBody; gapPx: number; forward: number } | null = null;
  for (const body of bodies) {
    if (body.id === sourceId || visited.has(body.id) || Math.abs(body.feetY - feetY) > 0.001) continue;
    const x = positions.get(body.id) ?? body.x;
    const forward = (x - sourceX) * direction;
    if (forward < -0.001) continue;
    const gapPx = Math.max(0, forward - halfWidth * 2);
    if (
      best === null
      || forward < best.forward - 0.001
      || (Math.abs(forward - best.forward) <= 0.001 && body.id < best.body.id)
    ) {
      best = { body, gapPx, forward };
    }
  }
  return best === null ? null : { body: best.body, gapPx: best.gapPx };
}

/** 현재 발판과 끊기지 않은 바닥 구간만 합쳐 경비가 구멍 위에 뜨지 않게 한다. */
function clampToConnectedFloor(
  fromX: number,
  desiredX: number,
  feetY: number,
  halfWidth: number,
  layout: MansionLayout,
): number {
  const intervals = [...solidRects(layout), ...platformRects(layout)]
    .filter((surface) => Math.abs(surface.y - feetY) <= 0.001)
    .map((surface) => ({ start: surface.x, end: surface.x + surface.w }))
    .sort((a, b) => a.start - b.start);
  if (intervals.length === 0) return fromX;

  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && interval.start <= previous.end + 0.001) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  const support = merged.find((interval) =>
    fromX - halfWidth >= interval.start - 0.001
    && fromX + halfWidth <= interval.end + 0.001
  );
  if (support === undefined) return fromX;
  return clamp(desiredX, support.start + halfWidth, support.end - halfWidth);
}
