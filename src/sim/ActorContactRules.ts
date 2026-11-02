import { archetypeOf } from "./GuardArchetypes";
import type { GuardState } from "./GuardPlanner";
import * as GuardStatusRules from "./GuardStatusRules";
import type { MansionLayout } from "./MansionLayout";
import { isInDark } from "./MansionLayout";
import { bodyHeight, type PlayerSimState } from "./MovementRules";
import type { Tuning } from "./tuning";
import type { Facing, Vec2 } from "./GeometryTypes";
import { onSameFloor } from "./geom";
import { bodyPassActive as wardenBodyPassActive } from "./WardenRules";
import { foolsGuard, isSociallyComposed } from "./DisguiseRules";

export interface GuardBodyContact {
  readonly guardId: string;
  readonly at: Vec2;
  /** 경비 기준으로 플레이어가 밀려난 쪽. */
  readonly side: Facing;
  /** 직전 상태에서는 떨어져 있었고 이번 스텝에 처음 닿았는가. */
  readonly entered: boolean;
}

export interface ActorContactResult {
  readonly player: PlayerSimState;
  readonly contacts: readonly GuardBodyContact[];
}

/**
 * 지상 사람 액터의 몸 중심이 서로 관통하지 않게 플레이어를 접촉 경계로 되돌린다.
 *
 * 경비를 지형 solid로 넣지 않는 이유는 구르기 통과·사다리·쓰러진 몸과 같은 상태 규칙이
 * 있기 때문이다. 접촉 거리는 기존 포박 사거리 하나를 써, 몸은 떨어졌는데 포박만 닿거나
 * 몸이 겹쳐야 포박되는 모순을 만들지 않는다.
 */
export function resolvePlayerGuardContacts(
  player: PlayerSimState,
  previousPlayer: Pick<PlayerSimState, "x">,
  guards: readonly GuardState[],
  layout: MansionLayout,
  tuning: Tuning,
  snuffedLamps: readonly string[] = [],
  disguised = false,
): ActorContactResult {
  if (!playerGuardBodyContactAllowed(player, layout, tuning, snuffedLamps)) {
    return { player, contacts: [] };
  }

  const contactDistance = tuning.guard.captureRangePx;
  let resolved = player;
  const contacts: GuardBodyContact[] = [];

  for (const guard of guards) {
    if (
      !playerGuardBodyContactAllowedFor(resolved, guard, layout, tuning, snuffedLamps, disguised)
      || !guardHasSolidBody(guard)
      || !onSameFloor(resolved.y, guard.y, tuning.world.floorHeightPx)
    ) continue;
    const delta = resolved.x - guard.x;
    // 경계와 정확히 맞닿은 상태도 접촉이다. 여기서 제외하면 다음 경비 스텝이 다시
    // 플레이어 쪽으로 전진하고, 마지막 분리 단계가 정지 플레이어를 밀어내게 된다.
    if (Math.abs(delta) > contactDistance + 0.001) continue;

    const previousDelta = previousPlayer.x - guard.x;
    const side: Facing = Math.abs(previousDelta) >= contactDistance
      ? previousDelta < 0 ? -1 : 1
      : delta < 0 ? -1 : delta > 0 ? 1 : resolved.facing === 1 ? -1 : 1;
    const entered = Math.abs(previousDelta) > contactDistance + 0.001;
    resolved = {
      ...resolved,
      x: guard.x + side * contactDistance,
      vx: resolved.vx * side < 0 ? 0 : resolved.vx,
      motion: resolved.vx * side < 0 ? "still" : resolved.motion,
    };
    contacts.push({
      guardId: guard.id,
      at: { x: guard.x, y: guard.y },
      side,
      entered,
    });
  }

  return { player: resolved, contacts };
}

/**
 * 경비가 플레이어에게 접근할 때 한 스텝의 이동을 몸 접촉 경계에서 자른다.
 *
 * 플레이어를 사후에 밀어내는 대신 움직인 경비가 충돌 지점에서 멈춰야 한다. 이미 접촉 중이면
 * 판정이 끝날 때까지 현재 경비 좌표를 유지한다.
 */
export function clampGuardXAtPlayerContact(
  guardX: number,
  proposedX: number,
  playerX: number,
  contactDistance: number,
): number {
  const delta = playerX - guardX;
  if (Math.abs(delta) <= contactDistance + 0.001) return guardX;

  if (delta > 0) {
    const boundary = playerX - contactDistance;
    return proposedX >= boundary ? boundary : proposedX;
  }
  if (delta < 0) {
    const boundary = playerX + contactDistance;
    return proposedX <= boundary ? boundary : proposedX;
  }
  return guardX;
}

/**
 * 플레이어와 사람 경비가 실제 몸 접촉·포박을 만들 수 있는가.
 *
 * 소등 그림자에서 몸을 낮춘 이동은 경비를 밀거나 경비에게 되밀리는 충돌이 아니다.
 * 낮은 실루엣으로 스쳐 지나가되 시야·의심은 VisionRules가 계속 계산한다. 물리 분리와
 * 포박 게이지가 반드시 이 값을 함께 써야, 좌표는 통과하는데 화면만 붙잡히는 모순이 없다.
 */
export function playerGuardBodyContactAllowed(
  player: PlayerSimState,
  layout: MansionLayout,
  tuning: Tuning,
  snuffedLamps: readonly string[] = [],
): boolean {
  if (!hasSolidBody(player)) return false;
  return player.pose !== "crouch" || !isInDark(
    layout,
    { x: player.x, y: player.y },
    snuffedLamps,
    tuning.mischief.snuffDarkMul,
  );
}

/** 특정 경비의 읽을 수 있는 통과 창까지 반영한 실제 몸 접촉 계약. */
export function playerGuardBodyContactAllowedFor(
  player: PlayerSimState,
  guard: GuardState,
  layout: MansionLayout,
  tuning: Tuning,
  snuffedLamps: readonly string[] = [],
  disguised = false,
): boolean {
  return playerGuardBodyContactAllowed(player, layout, tuning, snuffedLamps)
    && player.y > guard.y - tuning.movement.bodyHeightStand
    && guard.y > player.y - bodyHeight(player.pose, tuning)
    && !(isSociallyComposed(player) && foolsGuard(disguised, guard.susp.tier))
    && !wardenBodyPassActive(guard, tuning);
}

/** 몸을 막는 접촉 중 실제 발각·포획까지 시작해도 되는가. */
export function playerGuardCaptureContactAllowedFor(
  player: PlayerSimState,
  guard: GuardState,
  layout: MansionLayout,
  tuning: Tuning,
  snuffedLamps: readonly string[] = [],
  disguised = false,
): boolean {
  return playerGuardBodyContactAllowedFor(player, guard, layout, tuning, snuffedLamps, disguised);
}

function hasSolidBody(player: PlayerSimState): boolean {
  return player.onGround
    && (player.pose === "stand" || player.pose === "crouch")
    && player.hideSpotId === null
    && player.ventLinkId === null
    && player.climbLinkId === null
    // 구르기는 전투와 잠입 양쪽에서 상대 뒤로 통과하는 명시적 회피 동작이다.
    && player.dodgeMs <= 0;
}

function guardHasSolidBody(guard: GuardState): boolean {
  return archetypeOf(guard.archetypeId).stationary === false
    && guard.climbLinkId === null
    && GuardStatusRules.canAct(guard)
    // 착탄점을 내려다보는 동안은 플레이어가 경비 뒤를 스쳐 지나가는 유인 창이다.
    && !GuardStatusRules.isInspectingLure(guard);
}
