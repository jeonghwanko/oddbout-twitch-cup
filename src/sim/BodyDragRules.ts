import type { GuardState } from "./GuardPlanner";
import type { MansionLayout } from "./MansionLayout";
import { platformRects, solidRects } from "./MansionLayout";
import type { PlayerSimState } from "./MovementRules";
import { clamp, onSameFloor, rectOverlaps } from "./geom";
import type { InputFrame, SimEvent } from "./types";
import type { Tuning } from "./tuning";
import { canBeDragged } from "./GuardStatusRules";
import { interactionReachPx } from "./InteractionRangeRules";

/** 쓰러진 경비를 끌고 있는 상태. 몸은 별도 엔티티가 아니라 GuardState의 위치를 옮긴다. */
export interface BodyDragState {
  readonly targetId: string | null;
  /** 잡은 순간의 플레이어-몸 간격. 방향을 바꿔도 몸이 순간이동하지 않게 보존한다. */
  readonly offsetX: number;
}

export function createBodyDrag(): BodyDragState {
  return { targetId: null, offsetX: 0 };
}

export function candidate(
  guards: readonly GuardState[],
  player: PlayerSimState,
  tuning: Tuning,
  preferredTargetId: string | null = null,
): GuardState | null {
  if (!canActorDrag(player)) return null;
  const preferred = preferredTargetId === null
    ? null
    : guards.find((guard) => guard.id === preferredTargetId) ?? null;
  if (preferred !== null && canBeDragged(preferred) && sameFloorAndReach(preferred, player, tuning)) {
    return preferred;
  }
  return guards
    .filter((guard) => guard.id !== preferredTargetId && canBeDragged(guard) && sameFloorAndReach(guard, player, tuning))
    .sort((a, b) => Math.abs(player.x - a.x) - Math.abs(player.x - b.x))[0] ?? null;
}

/** 이동 계산 전에 이번 스텝이 몸 끌기인지 판정한다. */
export function targetForInput(
  state: BodyDragState,
  guards: readonly GuardState[],
  player: PlayerSimState,
  input: InputFrame,
  stamina: number,
  tuning: Tuning,
  preferredTargetId: string | null = null,
): GuardState | null {
  if (!input.interact || stamina <= 0 || !canActorDrag(player)) return null;
  if (state.targetId !== null) {
    const latched = guards.find((guard) => guard.id === state.targetId) ?? null;
    return latched !== null
      && canBeDragged(latched)
      && sameFloorAndReach(latched, player, tuning)
      ? latched
      : null;
  }
  return input.interactPressed ? candidate(guards, player, tuning, preferredTargetId) : null;
}

export interface BodyDragResult {
  readonly state: BodyDragState;
  readonly player: PlayerSimState;
  readonly guards: readonly GuardState[];
  readonly events: readonly SimEvent[];
  readonly dragging: boolean;
}

/**
 * 플레이어가 실제로 이동한 뒤 몸을 같은 delta만큼 옮긴다.
 * 몸이 벽에 걸리면 플레이어도 같은 지점에서 멈춰 둘이 늘어나거나 벽을 관통하지 않는다.
 */
export function step(
  state: BodyDragState,
  targetId: string | null,
  before: PlayerSimState,
  moved: PlayerSimState,
  guards: readonly GuardState[],
  layout: MansionLayout,
  tuning: Tuning,
): BodyDragResult {
  if (targetId === null) return released(state, moved, guards);
  const target = guards.find((guard) => guard.id === targetId);
  if (target === undefined || !canBeDragged(target) || !canActorDrag(moved)) {
    return released(state, moved, guards);
  }

  const offsetX = state.targetId === target.id ? state.offsetX : target.x - before.x;
  const desiredX = moved.x + offsetX;
  const bodyX = collideBodyX(target.x, desiredX, target.y, layout, tuning);
  const actualDelta = bodyX - target.x;
  const player = Math.abs(actualDelta - (moved.x - before.x)) <= 0.001
    ? moved
    : { ...moved, x: before.x + actualDelta, vx: 0, motion: "still" as const };
  const nextGuards = guards.map((guard) => guard.id === target.id ? { ...guard, x: bodyX } : guard);
  const events: SimEvent[] = state.targetId === target.id
    ? []
    : [{ kind: "BodyDragStarted", guardId: target.id, at: { x: bodyX, y: target.y } }];
  return {
    state: { targetId: target.id, offsetX },
    player,
    guards: nextGuards,
    events,
    dragging: true,
  };
}

function released(
  state: BodyDragState,
  player: PlayerSimState,
  guards: readonly GuardState[],
): BodyDragResult {
  const target = state.targetId === null ? null : guards.find((guard) => guard.id === state.targetId);
  const events: SimEvent[] = target === undefined || target === null
    ? []
    : [{ kind: "BodyDragReleased", guardId: target.id, at: { x: target.x, y: target.y } }];
  return { state: createBodyDrag(), player, guards, events, dragging: false };
}

function canActorDrag(player: PlayerSimState): boolean {
  return player.onGround
    && player.hideSpotId === null
    && player.ventLinkId === null
    && player.climbLinkId === null
    && player.staggerMs <= 0;
}

function sameFloorAndReach(guard: GuardState, player: PlayerSimState, tuning: Tuning): boolean {
  return onSameFloor(guard.y, player.y, tuning.world.floorHeightPx)
    && Math.abs(guard.x - player.x) <= interactionReachPx(tuning.guard.bodyDragReachPx, tuning);
}

function collideBodyX(
  fromX: number,
  desiredX: number,
  y: number,
  layout: MansionLayout,
  tuning: Tuning,
): number {
  const halfWidth = tuning.guard.bodyDragHalfWidthPx;
  let x = clamp(desiredX, halfWidth, layout.widthPx - halfWidth);
  const body = (): { x: number; y: number; w: number; h: number } => ({
    x: x - halfWidth,
    y: y - tuning.movement.bodyHeightCrouch / 2,
    w: halfWidth * 2,
    h: tuning.movement.bodyHeightCrouch / 2,
  });
  for (const solid of solidRects(layout)) {
    if (!rectOverlaps(body(), solid)) continue;
    x = desiredX >= fromX ? solid.x - halfWidth : solid.x + solid.w + halfWidth;
  }
  if (!bodyHasFloorSupport(x, y, halfWidth, layout)) return fromX;
  return clamp(x, halfWidth, layout.widthPx - halfWidth);
}

/** 몸 전체 폭이 같은 바닥에 걸쳐 있어야 한다. 중심만 보면 구멍 가장자리에서 반쯤 뜬다. */
function bodyHasFloorSupport(
  x: number,
  y: number,
  halfWidth: number,
  layout: MansionLayout,
): boolean {
  const surfaces = [...solidRects(layout), ...platformRects(layout)];
  return [x - halfWidth, x, x + halfWidth].every((sampleX) =>
    surfaces.some((surface) =>
      Math.abs(surface.y - y) <= 0.001
      && sampleX >= surface.x
      && sampleX <= surface.x + surface.w
    )
  );
}
