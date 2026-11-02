import type { Facing, InputFrame, Motion, Pose, Rect, SimEvent, Vec2 } from "./types";
import type { MansionLayout, VerticalLink } from "./MansionLayout";
import { hideSpotAt, linkAtPreferred, platformRects, solidRects } from "./MansionLayout";
import type { Tuning } from "./tuning";
import { DEFAULT_TUNING } from "./tuning";
import { clamp, rectOverlaps } from "./geom";
import { interactionReachRect } from "./InteractionRangeRules";
import { routeForThrow, stepParkour, type ParkourState } from "./ParkourRules";
import { attachGrapple, stepGrapple, type GrappleState } from "./GrappleRules";

/** Feet contact shared by moving-platform carrying and route observation. */
export function standingOnSurface(player: PlayerSimState, rect: Rect, tuning: Tuning): boolean {
  const half = tuning.movement.bodyWidth / 2;
  return player.onGround && Math.abs(player.y - rect.y) < 1
    && player.x + half > rect.x && player.x - half < rect.x + rect.w;
}

/**
 * 이동·충돌 규칙. 순수 함수만 둔다.
 *
 * 물리를 Phaser Arcade 에 위임하지 않고 sim 이 소유하는 이유는 결정론적 리플레이다.
 * 엔진이 위치를 소유하면 시드 + 입력만으로 런을 재생할 수 없고, 이동 규칙을
 * 단위 테스트할 수도 없다. 축 정렬 사각형 대 정적 사각형 충돌은 스윕으로 풀면
 * 짧고, 터널링에도 면역이다.
 *
 * 좌표 규약: x 는 몸통 중심, y 는 발바닥. 웅크리면 머리 쪽만 낮아진다.
 */

export interface PlayerSimState {
  readonly hp: number;
  readonly maxHp: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly facing: Facing;
  readonly pose: Pose;
  readonly motion: Motion;
  readonly onGround: boolean;
  /** 남은 코요테 시간. 발판을 떠난 뒤에도 잠시 점프가 허용된다. */
  readonly coyoteMs: number;
  /** 남은 점프 버퍼. 착지 직전에 누른 점프를 기억한다. */
  readonly jumpBufferMs: number;
  /** 상승 중 키를 놓아 점프 높이를 줄였는가. 한 점프에 한 번만 속도를 자른다. */
  readonly jumpCutUsed: boolean;
  /** 착지 직전의 웅크리기 입력을 기억하는 구르기 버퍼. */
  readonly rollBufferMs: number;
  readonly climbLinkId: string | null;
  readonly ventLinkId: string | null;
  readonly ventProgressMs: number;
  readonly ventFrom: Vec2 | null;
  readonly hideSpotId: string | null;
  /** 낙하를 시작한 y. 착지 소음 계산에 쓴다. */
  readonly fallStartY: number;
  /** 착지 후 경과 시간. 롤 캔슬 판정 창. */
  readonly sinceLandMs: number;
  /** 이동·피격으로 자세가 무너져 조작할 수 없는 시간. 사망·무력화 상태와 분리한다. */
  readonly staggerMs: number;
  /** 회피 구르기 잔여 무적 시간. 잠입에서는 닫히는 콘 밑을 빠져나가는 데 쓴다. */
  readonly dodgeMs: number;
  readonly dodgeCooldownMs: number;
  /** Optional for snapshots and layouts created before authored parkour routes. */
  readonly parkour?: ParkourState;
  readonly grapple?: GrappleState;
  /** Once a chain is used, airborne idle frames cannot regenerate stamina. */
  readonly grappleAirborne?: boolean;
  /** 공중에서 아직 닿는 고리가 없을 때·비행 중에 누른 E 의 남은 기억(ms). 그 사이 고리가 닿으면 그 E 로 쏜다. 0 이면 없다. */
  readonly grappleBufferMs: number;
  /**
   * 지상에서 반대 방향을 눌렀지만 옛 방향 속도가 남아 제동 중인 틱. 방향(facing)은 속도가
   * 0을 지날 때까지 진행 방향 그대로다. 렌더의 스키드 자세 신호이며, 제동 틱에만 true로
   * 존재하고 그 밖에는 키 자체가 없다(옛 스냅샷·리플레이와 모양이 같다).
   */
  readonly skidding?: true;
  /**
   * ↓ 를 누른 채 사다리를 떠났다(아래 끝 도착·꼭대기 하차·점프 이탈). 그 ↓ 는 "내려가기" 였지 "웅크리기" 가
   * 아니므로, 키를 한 번 놓을 때까지 웅크리지 않는다(멋쟁이의 웅크리기는 엎드린 포복이라, 사다리를 내려올 때마다
   * 바닥에 엎드렸다 일어서는 글리치가 됐다). 걸려 있을 때만 true 로 존재하고 그 밖에는 키 자체가 없다
   * (옛 스냅샷·리플레이와 모양이 같다). 새로 누른 ↓(`crouchPressed`)는 언제나 웅크린다.
   */
  readonly ladderCrouchHold?: true;
  /**
   * 피격 직후의 짧은 무적. 다수전에서 같은 자세 붕괴 동안 두 번째 경비가 이어 때리는
   * "한 번 맞으면 끝" 을 막는다.
   *
   * `dodgeMs` 를 재사용하지 않는 이유가 있다: 회피 무적은 완벽 회피·전용 반격 창을
   * 여는 자격이라, 맞은 사람에게 그것까지 주면 피격이 공짜 반격 기회가 된다.
   * 이전 리플레이의 저장 상태는 undefined 일 수 있다.
   */
  readonly hitInvulnMs: number;
}

/**
 * 이동 입력을 독점하는 배타적 상태. 저장 필드는 리플레이 호환을 위해 유지하고,
 * 판정·입력 소비는 이 파생 FSM 하나를 통과시킨다.
 */
export type PlayerTraversalState = "free" | "staggered" | "venting" | "hidden" | "climbing";

type TraversalStateSnapshot = Pick<
  PlayerSimState,
  "staggerMs" | "ventLinkId" | "hideSpotId" | "climbLinkId" | "parkour" | "grapple"
>;

type TraversalInvariantSnapshot = TraversalStateSnapshot & Pick<
  PlayerSimState,
  "ventFrom" | "ventProgressMs" | "pose"
> & { readonly hitInvulnMs?: number };

export function traversalStateOf(player: TraversalStateSnapshot): PlayerTraversalState {
  if (player.staggerMs > 0) return "staggered";
  if (player.ventLinkId !== null) return "venting";
  if (player.hideSpotId !== null) return "hidden";
  if (player.climbLinkId !== null) return "climbing";
  return "free";
}

/** 저장·전환 결함을 장기 시뮬레이션에서 즉시 드러내는 이동 FSM 불변조건. */
export function invariantViolations(
  player: TraversalInvariantSnapshot,
  tuning: Tuning = DEFAULT_TUNING,
): string[] {
  const violations: string[] = [];
  // 감쇠를 건너뛴 분기가 무적을 얼려 두거나 재부여가 겹쳐 한도를 넘는 일이
  // 조용히 지나가지 않게 한다. 저장 호환을 위해 undefined 는 0으로 읽는다.
  const hitInvulnMs = player.hitInvulnMs ?? 0;
  if (hitInvulnMs < 0 || hitInvulnMs > tuning.combat.playerHitInvulnMs) {
    violations.push("hit invulnerability is outside its tuned range");
  }
  const anchors = [player.ventLinkId, player.hideSpotId, player.climbLinkId, player.parkour?.routeId ?? null, player.grapple?.anchorId ?? null].filter((id) => id !== null);
  if (anchors.length > 1) violations.push("multiple traversal states are active");
  if ((player.ventLinkId === null) !== (player.ventFrom === null)) {
    violations.push("vent link and origin must transition together");
  }
  if (player.ventLinkId === null && player.ventProgressMs !== 0) {
    violations.push("vent progress exists without an active vent");
  }
  if (player.ventLinkId !== null && player.pose !== "vent") violations.push("vent state requires vent pose");
  if (player.hideSpotId !== null && player.pose !== "hide") violations.push("hidden state requires hide pose");
  if (player.climbLinkId !== null && player.pose !== "climb") violations.push("climb state requires climb pose");
  if (player.parkour !== undefined && (player.parkour.phase === "reel" || player.parkour.phase === "swing" || player.parkour.phase === "mantle" || player.parkour.phase === "return") && player.pose !== "hang") {
    violations.push("attached parkour state requires hang pose");
  }
  if (player.grapple !== undefined && player.pose !== "hang") violations.push("attached grapple state requires hang pose");
  if (anchors.length === 0 && (player.pose === "vent" || player.pose === "hide" || player.pose === "climb")) {
    violations.push("special traversal pose exists without an active traversal state");
  }
  return violations;
}

/** 이전 저장이나 비정상 전환에 복수 링크가 남아도 한 상태만 계속하도록 복구한다. */
function normalizeTraversalState(player: PlayerSimState): PlayerSimState {
  if (player.ventLinkId !== null) {
    return { ...player, hideSpotId: null, climbLinkId: null, parkour: undefined, grapple: undefined, pose: "vent" };
  }
  if (player.hideSpotId !== null) {
    return { ...player, climbLinkId: null, ventLinkId: null, ventFrom: null, ventProgressMs: 0, parkour: undefined, grapple: undefined, pose: "hide" };
  }
  if (player.climbLinkId !== null) {
    return { ...player, ventLinkId: null, ventFrom: null, ventProgressMs: 0, hideSpotId: null, parkour: undefined, grapple: undefined, pose: "climb" };
  }
  return {
    ...player,
    ventFrom: null,
    ventProgressMs: 0,
    pose: player.pose === "vent" || player.pose === "hide" || player.pose === "climb" || (player.pose === "hang" && player.parkour === undefined && player.grapple === undefined) ? "stand" : player.pose,
  };
}

export interface MoveContext {
  readonly layout: MansionLayout;
  readonly tuning: Tuning;
  /** 0..1.4 적재율. 속도·점프·등반·소음에 곱해진다. */
  readonly loadRatio: number;
  /** 스태미나가 바닥나면 질주가 봉인된다. */
  readonly exhausted: boolean;
  /** 회피 즉발 비용 전액을 지불할 수 있는가. */
  readonly canDodge: boolean;
  readonly staminaValue?: number;
  readonly grappleInteractAnchorId?: string | null;
  /**
   * 이번 E 를 어떤 행동도 가져가지 않았다(또는 매달린 사슬이 E 를 소유한다). 공중이면 고리 입력
   * 버퍼로 남긴다. 필드가 없으면 중재기 없는 호출자라 `grappleInteractAnchorId` 가 undefined 일 때만 남긴다.
   */
  readonly grappleBufferable?: boolean;
  /** 안내원 소매치기로 서비스 통로를 열었는가. */
  readonly areaKey?: boolean;
  /** 입력 전에 표시된 은신처·사다리·환기구를 같은 종류 후보 사이에서 유지한다. */
  readonly preferredInteractionTargetId?: string | null;
  /**
   * 이번 프레임의 E 를 도하에 넘긴 상호작용 중재의 결과.
   * `null` 은 다른 행동이 E 를 가져갔다는 뜻이고, 필드 자체가 없으면 중재기 없는
   * 호출자라 위치 조건만으로 판정한다.
   */
  readonly parkourInteractRouteId?: string | null;
  /**
   * 이번 프레임의 E 가 향하는 통로(환기구) — 프롬프트 1순위가 통로일 때만 채워진다.
   * 그때는 ↑ 없이 E 만으로 들어간다. 옛 ↑+E 는 이 값과 상관없이 계속 통한다.
   */
  readonly ventInteractLinkId?: string | null;
  /** 군중 등 동적 방해물이 적용하는 수평 속도 배수. */
  readonly speedMul?: number;
}

export interface MoveResult {
  readonly player: PlayerSimState;
  readonly events: readonly SimEvent[];
}

/**
 * 피격 무적 시계. 이동 규칙을 건너뛰는 호출자(포박 중 몸 고정 등)도 이 함수를 써야 한다 —
 * `step` 안에서만 돌면 이동이 잠긴 동안 무적이 얼어붙어, 맞고 붙잡힌 플레이어가
 * 발버둥 내내, 그리고 풀려난 뒤까지 무적을 들고 다닌다.
 */
export function withDecayedHitInvuln(player: PlayerSimState, dtMs: number): PlayerSimState {
  const remaining = (player.hitInvulnMs ?? 0) - dtMs;
  // 부동소수 잔재(1e-15ms)가 남으면 무적이 영원히 "0보다 크다". 결정론을 지키면서
  // 실제로 0이 되도록 바닥을 자른다.
  const hitInvulnMs = remaining > 0.001 ? remaining : 0;
  return hitInvulnMs === player.hitInvulnMs ? player : { ...player, hitInvulnMs };
}

/** 출발보다 정지는 조금 또렷하고, 반전은 관성을 지우면서도 한 박자 보이게 한다. */
const GROUND_DECEL_MUL = 1.35;
const GROUND_TURN_ACCEL_MUL = 1.65;

export function createPlayer(spawn: Vec2, maxHp = DEFAULT_TUNING.combat.playerMaxHp): PlayerSimState {
  return {
    hp: maxHp,
    maxHp,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    facing: 1,
    pose: "stand",
    motion: "still",
    onGround: false,
    coyoteMs: 0,
    jumpBufferMs: 0,
    jumpCutUsed: true,
    rollBufferMs: 0,
    climbLinkId: null,
    ventLinkId: null,
    ventProgressMs: 0,
    ventFrom: null,
    hideSpotId: null,
    fallStartY: spawn.y,
    sinceLandMs: 9999,
    staggerMs: 0,
    dodgeMs: 0,
    dodgeCooldownMs: 0,
    hitInvulnMs: 0,
    grappleBufferMs: 0,
  };
}

/** 생성 직후와 첫 스텝에 바닥 접촉 기반 규칙이 즉시 적용되도록 착지 상태를 미리 판정한다. */
export function previewGroundedPlayer(
  player: PlayerSimState,
  tuning: Tuning,
  layout?: MansionLayout,
): PlayerSimState {
  if (player.onGround || player.vy < 0) return player;
  const geometrySurfaceY = layout === undefined
    ? null
    : [...solidRects(layout), ...platformRects(layout)]
        .filter((rect) => player.x >= rect.x && player.x <= rect.x + rect.w)
        .map((rect) => rect.y)
        .filter((surfaceY) => Math.abs(player.y - surfaceY) <= tuning.movement.bodyHeightStand)
        .sort((a, b) => Math.abs(player.y - a) - Math.abs(player.y - b))[0] ?? null;
  const floor = Math.floor(player.y / tuning.world.floorHeightPx);
  const surfaceY = geometrySurfaceY
    ?? (floor + 1) * tuning.world.floorHeightPx - tuning.world.slabThicknessPx;
  const onSurface = Math.abs(player.y - surfaceY) <= tuning.movement.bodyHeightStand;
  return onSurface ? { ...player, y: surfaceY, onGround: true } : player;
}

export function bodyHeight(pose: Pose, tuning: Tuning): number {
  return pose === "crouch" ? tuning.movement.bodyHeightCrouch : tuning.movement.bodyHeightStand;
}

export function bodyRect(player: PlayerSimState, tuning: Tuning): Rect {
  const w = tuning.movement.bodyWidth;
  const h = bodyHeight(player.pose, tuning);
  return { x: player.x - w / 2, y: player.y - h, w, h };
}

/** 적재율에 따른 이동 속도 배수. 만재 65%, 과적 51%. */
export function speedMultiplier(loadRatio: number, tuning: Tuning): number {
  return Math.max(0, 1 - tuning.carry.speedPenalty * loadRatio);
}

export function jumpMultiplier(loadRatio: number, tuning: Tuning): number {
  return Math.max(0, 1 - tuning.carry.jumpPenalty * loadRatio);
}

export function climbMultiplier(loadRatio: number, tuning: Tuning): number {
  return Math.max(0, 1 - tuning.carry.climbPenalty * loadRatio);
}

/** 적재율이 링크의 게이트를 넘었는가. 탐욕이 그래프에서 경로를 삭제하는 지점. */
export function isLinkBlockedByLoad(link: VerticalLink, loadRatio: number): boolean {
  return link.loadLimit !== undefined && loadRatio >= link.loadLimit;
}

export function isLinkLocked(link: VerticalLink, areaKey: boolean): boolean {
  return link.requiresAreaKey === true && !areaKey;
}

/**
 * 환기구 한 번 통과 시간. 링크의 `travelMs`(없으면 `ventTravelDefaultMs`)는 기본 `ventSpeed` 에서의
 * 시간이고, 예고장("환기구 이동 ×1.6")·메타 강화가 `ventSpeed` 를 올린 만큼 짧아진다.
 *
 * 2026-09-29 전까지 `ventSpeed` 는 패치만 되고 아무도 읽지 않아 두 효과가 빈 약속이었다.
 * 기본 속도에서는 곱셈 없이 링크 값을 그대로 돌려준다 — 기존 런·리플레이의 틱 궤적이 비트 단위로
 * 같아야 한다. 이동(stepVent)·상호작용 진행 표시·경로 모델이 이 함수 하나를 읽는다.
 */
export function ventTravelMs(link: VerticalLink, tuning: Tuning): number {
  const base = link.travelMs ?? tuning.movement.ventTravelDefaultMs;
  const speed = tuning.movement.ventSpeed;
  const reference = DEFAULT_TUNING.movement.ventSpeed;
  if (speed === reference || !(speed > 0)) return base;
  return base * (reference / speed);
}

/** 구르기 즉발 비용 전액을 낼 수 있는가. `step` 의 `ctx.canDodge` 와 레슨 준비 판정이 공유한다. */
export function dodgeStaminaReady(staminaValue: number, tuning: Tuning): boolean {
  return staminaValue >= tuning.combat.dodgeStaminaCost;
}

/**
 * 다음 스텝에 방향+질주+웅크리기 입력을 넣으면 실제로 구르기가 시작되는가.
 * `step` 의 회피 조건(접지·비용·재사용·진행 중 회피)을 입력 없이 미리 읽는다.
 */
export function dodgeReady(
  player: Pick<PlayerSimState, "onGround" | "dodgeMs" | "dodgeCooldownMs">,
  staminaValue: number,
  tuning: Tuning,
): boolean {
  return player.onGround && player.dodgeMs <= 0 && player.dodgeCooldownMs <= 0
    && dodgeStaminaReady(staminaValue, tuning);
}

export function step(player: PlayerSimState, input: InputFrame, ctx: MoveContext, dtMs: number): MoveResult {
  // 제동 신호는 매 틱 지상 이동이 새로 판정한다. 다른 이동 상태가 옛 값을 복사해 가지 않게 먼저 뗀다.
  const unskidded = player.skidding === undefined ? player : withoutSkid(player);
  const result = stepMovement(withDecayedHitInvuln(normalizeTraversalState(unskidded), dtMs), input, ctx, dtMs);
  const buffered = withLadderCrouchHold(player, withGrappleBuffer(player, result, input, ctx, dtMs), input);
  return buffered.player.onGround && buffered.player.grappleAirborne
    ? { ...buffered, player: { ...buffered.player, grappleAirborne: false } }
    : buffered;
}

/**
 * `ladderCrouchHold` 를 건다·푼다. 이번 틱에 사다리를 떠났는데 ↓ 가 눌린 채이고 웅크리지 않았으면 건다.
 * ↓ 를 놓거나 새로 누르면 푼다. 결정적이고 입력 프레임만 본다(리플레이 호환).
 */
function withLadderCrouchHold(before: PlayerSimState, result: MoveResult, input: InputFrame): MoveResult {
  const player = result.player;
  const leftLadder = before.climbLinkId !== null && player.climbLinkId === null;
  const hold = input.crouch && !input.crouchPressed && player.climbLinkId === null
    && (leftLadder ? player.pose !== "crouch" : player.ladderCrouchHold === true);
  if (hold) return player.ladderCrouchHold === true ? result : { ...result, player: { ...player, ladderCrouchHold: true } };
  if (player.ladderCrouchHold === undefined) return result;
  const { ladderCrouchHold: _released, ...rest } = player;
  return { ...result, player: rest };
}

/** 사다리를 떠나는 틱의 자세. 내려오며 누르고 있던 ↓ 는 웅크리기가 아니다 — 그 틱에 새로 누른 ↓ 만 웅크린다. */
function ladderExitPose(input: InputFrame): "crouch" | "stand" {
  return input.crouch && input.crouchPressed ? "crouch" : "stand";
}

/**
 * 고리 E 버퍼. 공중에서 쏠 고리가 아직 없을 때·비행 중·그 방향 고리가 잠깐 막혔을 때 누른 E 를
 * `tuning.grapple.inputBufferMs` 동안 기억한다. 착지하거나 줄을 쏘면 지운다.
 */
function withGrappleBuffer(before: PlayerSimState, result: MoveResult, input: InputFrame, ctx: MoveContext, dtMs: number): MoveResult {
  const player = result.player;
  const fired = result.events.some((event) => event.kind === "GrappleAttached");
  const bufferable = ctx.grappleBufferable ?? ctx.grappleInteractAnchorId === undefined;
  const airborne = !player.onGround && traversalStateOf(player) === "free";
  const remaining = fired || !airborne ? 0
    // 옛 리플레이 묶음의 튜닝에는 버퍼 값이 없을 수 있다 — 그때는 버퍼 없이 예전처럼 동작한다.
    : input.interactPressed && bufferable ? ctx.tuning.grapple?.inputBufferMs ?? 0
      : Math.max(0, before.grappleBufferMs - dtMs);
  return remaining === player.grappleBufferMs ? result : { ...result, player: { ...player, grappleBufferMs: remaining } };
}

function withoutSkid(player: PlayerSimState): PlayerSimState {
  const { skidding: _skidding, ...rest } = player;
  return rest;
}

/** Traversal may delegate to free movement, but per-tick timers decay only once. */
function stepMovement(current: PlayerSimState, input: InputFrame, ctx: MoveContext, dtMs: number): MoveResult {
  const events: SimEvent[] = [];
  const dt = dtMs / 1000;
  const { tuning, layout } = ctx;

  // 이동 FSM의 현재 상태가 입력 소유권을 한 번만 결정한다.
  const traversal = traversalStateOf(current);
  if (traversal === "free") {
    const attached = attachGrapple(current, input, ctx);
    if (attached !== null) return attached;
    if (current.grapple !== undefined) {
      return stepGrapple(current, input, ctx, dtMs,
        (falling, frame) => applyGravityAndCollide(falling, dt, ctx, frame));
    }
  }
  if (current.parkour !== undefined && traversal === "free") {
    return stepParkour(current, input, ctx, dtMs,
      (free, frame) => stepMovement({ ...free, parkour: undefined }, frame ?? input, ctx, dtMs),
      (falling, frame) => applyGravityAndCollide(falling, dt, ctx, frame));
  }
  if (traversal === "staggered") {
    const remaining = Math.max(0, current.staggerMs - dtMs);
    const falling = current.parkour === undefined && current.grapple === undefined ? current
      : { ...current, parkour: undefined, grapple: undefined, pose: "stand" as const };
    const grounded = applyGravityAndCollide(falling, dt, ctx);
    return {
      // 공중 경직은 넉백 궤적을 유지하지만, 바닥에 닿은 경직은 제자리다.
      player: { ...grounded.player, vx: grounded.player.onGround ? 0 : grounded.player.vx,
        staggerMs: remaining, motion: "still" },
      events: grounded.events,
    };
  }
  if (traversal === "venting") return stepVent(current, ctx, dtMs);
  if (traversal === "hidden") return stepHide(current, input, ctx, dtMs);
  if (traversal === "climbing") {
    // 사다리 꼭대기에서 곧장 고리로. 내려서서 방향을 맞추는 한 걸음을 요구하지 않는다.
    return attachGrapple(current, input, ctx) ?? stepClimb(current, input, ctx, dtMs);
  }

  // --- 지상/공중 이동 ---
  let next = { ...current };
  next.sinceLandMs = current.sinceLandMs + dtMs;
  next.dodgeMs = Math.max(0, current.dodgeMs - dtMs);
  next.dodgeCooldownMs = Math.max(0, current.dodgeCooldownMs - dtMs);
  next.jumpBufferMs = input.jump ? tuning.movement.jumpBufferMs : Math.max(0, current.jumpBufferMs - dtMs);
  next.rollBufferMs = input.crouchPressed
    ? tuning.movement.rollWindowMs
    : Math.max(0, current.rollBufferMs - dtMs);

  // 상승 중 키를 놓으면 속도를 한 번만 줄여 짧은 점프가 된다. 입력 판정은 즉시이고
  // 애니메이션이 게임 타이밍을 소유하지 않는다.
  if (!input.jumpHeld && next.vy < 0 && !next.jumpCutUsed) {
    next.vy *= tuning.movement.jumpReleaseVelocityMul;
    next.jumpCutUsed = true;
  }

  // 자세 결정. 천장이 낮으면 일어설 수 없다. 사다리를 내려오며 누르고 있던 ↓ 는 한 번 놓기 전까지 웅크리기가 아니다.
  const wantsCrouch = input.crouch && (current.ladderCrouchHold !== true || input.crouchPressed);
  if (wantsCrouch) {
    next.pose = "crouch";
  } else if (current.pose === "crouch" && canStandUp(current, ctx)) {
    next.pose = "stand";
  } else if (current.pose !== "crouch") {
    next.pose = "stand";
  }

  // 목표 수평 속도
  const canRun = input.run && !ctx.exhausted && next.pose !== "crouch";
  const baseSpeed =
    next.pose === "crouch"
      ? tuning.movement.crouchSpeed
      : canRun
        ? tuning.movement.runSpeed
        : tuning.movement.walkSpeed;
  const obstructionMul = ctx.speedMul ?? 1;
  const targetVx = input.moveX * baseSpeed * speedMultiplier(ctx.loadRatio, tuning) * obstructionMul;
  const reversing = targetVx !== 0 && current.vx !== 0 && Math.sign(targetVx) !== Math.sign(current.vx);
  const accel = current.onGround
    ? input.moveX === 0
      ? tuning.movement.groundAccelPerSec * GROUND_DECEL_MUL
      : reversing
        ? tuning.movement.groundAccelPerSec * GROUND_TURN_ACCEL_MUL
        : tuning.movement.groundAccelPerSec
    : tuning.movement.airAccelPerSec;
  // 구르는 동안은 속도를 유지한다. 감속하면 통과 판정이 안 나온다.
  next.vx = next.dodgeMs > 0 ? current.vx : approach(current.vx, targetVx, accel * dt);
  // 입력을 놓은 뒤에도 실제 속도가 남는 동안 발과 카메라가 함께 감속한다. 입력만 보고
  // 즉시 idle로 바꾸면 몸은 미끄러지는데 발은 멈추는 시각적 모순이 생긴다.
  const horizontalSpeed = Math.abs(next.vx);
  const moving = horizontalSpeed > 0.5;
  const running = next.pose !== "crouch" && moving
    && (canRun || horizontalSpeed > tuning.movement.walkSpeed * 1.08);
  const motion: Motion = !moving ? "still" : running ? "run" : "walk";
  next.motion = motion;
  // 방향은 입력이 아니라 실제 속도가 0을 지날 때 뒤집힌다. 반대 키를 누른 틱에 바로 돌면
  // 몸은 아직 옛 방향으로 미끄러지는데 얼굴만 돌아간 문워크가 된다. 지상에서 옛 방향 속도가
  // 남은 동안은 진행 방향을 본 채 제동(skidding)하고, 정지 상태에서 출발하거나 속도가 0을
  // 넘는 틱에 입력 쪽으로 돈다. 공중은 발이 바닥을 긋지 않으므로 예전처럼 입력이 소유하고,
  // 공격 입력은 돌아서 치기 의도라 제동을 건너뛴다(판정 방향이 예전과 같게 남는다).
  const inputFacing: Facing | null = input.moveX === 0 ? null : input.moveX > 0 ? 1 : -1;
  const skidding = inputFacing !== null && current.onGround && next.dodgeMs <= 0
    && next.vx !== 0 && Math.sign(next.vx) !== inputFacing && !input.attack && !input.heavy;
  if (inputFacing !== null) next.facing = skidding ? (next.vx > 0 ? 1 : -1) : inputFacing;
  if (skidding) next.skidding = true;

  // 회피 구르기: 질주 중 웅크리면 구른다.
  // 전용 키를 만들지 않은 이유는, 잠입 조작을 그대로 두고 같은 동사가
  // 전투에서 다르게 읽히게 하는 편이 배울 것이 적기 때문이다.
  // 경비 몸이나 벽에 막힌 직후에는 실제 vx가 0이어도 달리기 키를 계속 누르고 있다.
  // 그 입력 의도까지 인정해야 공격 예고를 보고 누른 회피가 충돌 경계에서 유실되지 않는다.
  const hasDodgeIntent = Math.abs(current.vx) > tuning.movement.walkSpeed * speedMultiplier(ctx.loadRatio, tuning)
    || input.run;
  const canDodge =
    current.onGround &&
    ctx.canDodge &&
    next.dodgeCooldownMs <= 0 &&
    next.dodgeMs <= 0 &&
    input.crouchPressed &&
    input.moveX !== 0 &&
    hasDodgeIntent;
  if (canDodge) {
    next.dodgeMs = tuning.combat.dodgeMs;
    next.dodgeCooldownMs = tuning.combat.dodgeCooldownMs;
    next.vx = input.moveX * tuning.combat.dodgeSpeed * speedMultiplier(ctx.loadRatio, tuning) * obstructionMul;
    // 제동 중에 누른 회피는 굴러가는 쪽을 본다. 구르기가 제동을 끊는다.
    next.facing = input.moveX > 0 ? 1 : -1;
    delete next.skidding;
    next.pose = "crouch";
    next.rollBufferMs = 0;
    events.push({ kind: "PlayerDodged", at: { x: next.x, y: next.y }, facing: next.facing });
  }

  // 상호작용 판정은 충돌 바디보다 넉넉해야 한다. 픽셀 단위로 정확히 서야 잡히는
  // 사다리는 조작 실패로만 읽히고, 잠입의 긴장과 아무 관계 없는 스트레스를 만든다.
  const reach = interactionReachRect(bodyRect(next, tuning), tuning.movement.bodyWidth, tuning);

  // 사다리 진입: 위/아래 입력 + 사다리 근접
  if (input.moveY !== 0) {
    const ladder = linkAtPreferred(layout, reach, "ladder", ctx.preferredInteractionTargetId ?? null);
    if (ladder !== null) {
      const feetTop = ladder.rect.y + bodyHeight("climb", tuning);
      const feetBottom = ladder.rect.y + ladder.rect.h;
      // 이미 진행 방향 끝에 서 있으면 같은 입력으로 사다리를 다시 잡지 않는다.
      // 특히 아래 끝에서 S를 유지할 때 climbing↔walking이 매 프레임 교대하는 것을 막는다.
      // 아래 끝에서 새로 누른 S 도 사다리를 잡지 않는다 — 잡자마자 다시 내려서며 웅크리기를 삼키던 경로였다.
      const pushingPastEnd = (input.moveY < 0 && next.y <= feetTop + 0.001)
        || (input.moveY > 0 && next.y >= feetBottom - 0.001);
      if (!pushingPastEnd) {
        return {
          player: {
            ...next,
            climbLinkId: ladder.id,
            pose: "climb",
            vx: 0,
            vy: 0,
            x: ladder.rect.x + ladder.rect.w / 2,
            onGround: false,
            rollBufferMs: 0,
          },
          events,
        };
      }
      // 끝 방향 입력은 재부착만 막고 지상 이동까지 소비하지 않는다. 여기서 반환하면
      // S+D를 유지한 플레이어가 바닥에 도착한 뒤 x가 갱신되지 않아 다시 멈춘다.
    }
  }

  // 환기구 진입: 프롬프트가 통로를 가리키면 E 하나로, 아니면 옛 ↑+E 로.
  const ventByPrompt = ctx.ventInteractLinkId !== undefined && ctx.ventInteractLinkId !== null;
  if (input.interactPressed && (input.moveY < 0 || ventByPrompt)) {
    const vent = linkAtPreferred(layout, reach, "vent", ctx.ventInteractLinkId ?? ctx.preferredInteractionTargetId ?? null);
    if (vent !== null && vent.exit !== undefined && isLinkLocked(vent, ctx.areaKey === true)) {
      events.push({
        kind: "ActionRejected",
        action: "vent",
        reason: "locked",
        at: { x: next.x, y: next.y },
        targetId: vent.id,
      });
    } else if (vent !== null && vent.exit !== undefined && isLinkBlockedByLoad(vent, ctx.loadRatio)) {
      events.push({
        kind: "ActionRejected",
        action: "vent",
        reason: "load-limit",
        at: { x: next.x, y: next.y },
        targetId: vent.id,
        current: ctx.loadRatio,
        required: vent.loadLimit,
      });
    } else if (vent !== null && vent.exit !== undefined) {
      const at = { x: vent.rect.x + vent.rect.w / 2, y: vent.rect.y + vent.rect.h / 2 };
      return {
        player: {
          ...next,
          ventLinkId: vent.id,
          ventProgressMs: 0,
          ventFrom: { x: next.x, y: next.y },
          pose: "vent",
          vx: 0,
          vy: 0,
          rollBufferMs: 0,
        },
        events: [...events, { kind: "PlayerEnteredVent", linkId: vent.id, at, facing: next.facing }],
      };
    }
  }

  // 은신처 진입
  if (input.hide) {
    const spot = hideSpotAt(layout, reach, ctx.preferredInteractionTargetId ?? null);
    if (spot !== null) {
      const at = { x: spot.rect.x + spot.rect.w / 2, y: spot.rect.y + spot.rect.h / 2 };
      return {
        player: {
          ...next,
          hideSpotId: spot.id,
          pose: "hide",
          motion: "still",
          vx: 0,
          vy: 0,
          x: spot.rect.x + spot.rect.w / 2,
          rollBufferMs: 0,
        },
        events: [...events, { kind: "PlayerHid", hideSpotId: spot.id, at }],
      };
    }
    events.push({
      kind: "ActionRejected",
      action: "hide",
      reason: "no-target",
      at: { x: next.x, y: next.y },
    });
  }

  // 점프: 코요테 + 버퍼
  const canJump = next.coyoteMs > 0 || current.onGround;
  const dropping = input.moveY > 0 && input.jump && current.onGround
    && platformRects(layout).some(rect => Math.abs(rect.y - current.y) < 0.01
      && current.x + tuning.movement.bodyWidth / 2 > rect.x
      && current.x - tuning.movement.bodyWidth / 2 < rect.x + rect.w);
  if (dropping) {
    next.jumpBufferMs = 0;
    next.coyoteMs = 0;
    next.onGround = false;
    next.jumpCutUsed = true;
    next.vy = Math.max(0, next.vy);
  }
  if (!dropping && next.jumpBufferMs > 0 && canJump) {
    next.vy = -tuning.movement.jumpVelocity * jumpMultiplier(ctx.loadRatio, tuning);
    next.jumpBufferMs = 0;
    next.coyoteMs = 0;
    next.jumpCutUsed = false;
    next.onGround = false;
    next.fallStartY = next.y;
    events.push({ kind: "PlayerJumped", at: { x: next.x, y: next.y } });
  }

  const collided = applyGravityAndCollide(next, dt, ctx, input);
  // Legacy replay bundles contain neither authored routes nor the new tuning section.
  const route = (layout.parkourRoutes?.length ?? 0) > 0
    ? routeForThrow(layout, current, input, tuning.parkour.departureReachPx, ctx.parkourInteractRouteId)
    : null;
  if (route === null) return { player: collided.player, events: [...events, ...collided.events] };
  // 던지기는 제자리 행동이다. 이번 스텝에 계산된 낙하·점프 결과 대신 발코니에 선
  // 몸을 그대로 두고, 같은 프레임에 우연히 겹친 점프는 E 가 가져간다.
  return {
    player: {
      ...next,
      vx: 0,
      vy: 0,
      motion: "still",
      pose: "stand",
      facing: route.to.x > route.from.x ? 1 : -1,
      coyoteMs: 0,
      jumpBufferMs: 0,
      rollBufferMs: 0,
      parkour: { routeId: route.id, phase: "throw", progressMs: 0, releaseBufferMs: 0 },
    },
    events: events.filter((event) => event.kind !== "PlayerJumped"),
  };
}

function stepClimb(player: PlayerSimState, input: InputFrame, ctx: MoveContext, dtMs: number): MoveResult {
  const { tuning, layout } = ctx;
  const dt = dtMs / 1000;
  const link = layout.links.find((l) => l.id === player.climbLinkId);
  if (link === undefined) {
    return { player: { ...player, climbLinkId: null, pose: "stand" }, events: [] };
  }

  // 점프로 사다리에서 이탈
  if (input.jump) {
    return {
      player: {
        ...player,
        climbLinkId: null,
        pose: "stand",
        vy: -tuning.movement.jumpVelocity * jumpMultiplier(ctx.loadRatio, tuning) * 0.8,
        jumpCutUsed: false,
        vx: input.moveX * tuning.movement.walkSpeed,
        fallStartY: player.y,
      },
      events: [{ kind: "PlayerJumped", at: { x: player.x, y: player.y } }],
    };
  }

  const feetTop = link.rect.y + bodyHeight("climb", tuning);
  // 오르던 손이 꼭대기 코앞(발에서 위 끝까지 선 키 두 개 이내 — 머리·어깨가 이미 위층 바닥 위, 렌더는 모서리를
  // 잡고 넘어가는 중)에서 위 입력을 놓으면 올라서기를 마저 끝낸다. 옆을 누르고 있었어도 아래층으로 떨어뜨리지
  // 않고, 위 끝에서 그쪽으로 내려선다. 위층 모서리에 등 돌려 웅크린 채 사다리 상태로 멈춰 서는 일도 없다.
  // 그보다 아래에서 놓으면 지금처럼 그 자리에 매달리고(옆 입력이면 중간 하차), 내려오던 중에는 적용하지 않는다.
  const mantleCommit = input.moveY === 0 && player.vy < 0
    && player.y <= feetTop + tuning.movement.bodyHeightStand * 2;

  // 수직 입력 중에는 등반을 우선한다. 아래+좌우를 함께 누를 때 중간 이탈→즉시 재부착을
  // 매 프레임 반복하면 캐릭터가 떨면서 멈춘다. 중간 하차는 위/아래를 놓은 뒤 좌우로 한다.
  if (input.moveX !== 0 && input.moveY === 0) {
    const dir: Facing = input.moveX > 0 ? 1 : -1;
    // 꼭대기에서는 옆 바닥으로 올라선다. 사다리 구멍은 몸통보다 조금 넓을 뿐이라
    // 자유낙하로는 한 스텝 안에 바닥 위로 이동할 수 없고, 그대로 다시 떨어진다.
    //
    // 허용치가 한 프레임 등반 이동량(80px/s ≒ 1.3px)보다 좁으면, 꼭대기에 닿은 바로 그
    // 프레임에 위 입력을 놓지 않는 한 이 분기에 들어올 수 없다. 질주로 오른쪽을 누른 채
    // 위만 놓는 자연스러운 조작이 꼭대기 코앞에서 매번 아래층까지 떨어지던 원인이 그
    // 한 픽셀 창이었다. 손가락이 놓는 시점은 프레임 단위로 맞출 수 있는 것이 아니다.
    //
    // 그래서 경계를 사람의 의도로 다시 잡는다. 오르던 손이 위 입력을 놓는 것은
    // "내려가겠다" 가 아니라 "다 올라왔다" 이므로, 머리가 위층 바닥면 위로 나와 있는
    // 동안에는 좌우 입력을 중간 하차가 아니라 올라서기로 읽는다. 반대로 내려오던
    // 중이라면 그 좌우 입력은 실제로 중간 하차 의도이므로 기존의 좁은 창을 유지한다.
    const descending = player.vy > 0;
    const topReachPx = descending
      ? tuning.movement.climbUpSpeed * dt + 1
      : tuning.movement.bodyHeightStand;
    // 지지면은 발을 위층 바닥면에 맞춘 뒤 찾는다. 사다리 규약상 feetTop 이 곧 위층
    // 바닥면이라, 남은 등반 높이를 그대로 두고 재면 findLedgeX 의 좁은 허용치가 이를
    // 바닥 없음으로 읽는다.
    const ledgeX = player.y <= feetTop + topReachPx
      ? findLedgeX({ ...player, y: feetTop }, ctx, dir)
      : null;
    if (ledgeX !== null) {
      return {
        player: {
          ...player,
          x: ledgeX,
          y: feetTop,
          climbLinkId: null,
          pose: ladderExitPose(input),
          vx: 0,
          vy: 0,
          facing: dir,
          onGround: true,
          sinceLandMs: 0,
          fallStartY: feetTop,
        },
        events: [],
      };
    }

    if (!mantleCommit) {
      const released: PlayerSimState = {
        ...player,
        climbLinkId: null,
        pose: ladderExitPose(input),
        vx: input.moveX * tuning.movement.walkSpeed,
        vy: 0,
        facing: dir,
        fallStartY: player.y,
      };
      return applyGravityAndCollide(released, dt, ctx, input);
    }
  }

  const mul = climbMultiplier(ctx.loadRatio, tuning);
  // 꼭대기 올라서기(모서리 잡기 → 무릎 당기기 → 웅크림)는 가로대 오르기보다 빠른 한 동작이다.
  const mountMul = player.y - feetTop < tuning.movement.ladderTopMountPx ? tuning.movement.ladderTopMountSpeedMul : 1;
  const speed = input.moveY < 0 || mantleCommit
    ? -tuning.movement.climbUpSpeed * mul * mountMul
    : input.moveY > 0 ? tuning.movement.climbDownSpeed * mul : 0;

  // 발 위치를 사다리 구간으로 클램프한다. 위 끝은 위층 바닥면, 아래 끝은 아래층 바닥면.
  const feetMax = link.rect.y + link.rect.h;
  // A forgiving catch can leave the feet hanging below the last rung. Climb from that
  // actual height instead of teleporting the actor up to the ladder's lower endpoint.
  const hangingBelow = link.catchPadding !== undefined && player.y > feetMax;
  if (hangingBelow && speed > 0) {
    return applyGravityAndCollide({ ...player, climbLinkId: null, pose: "stand",
      vx: 0, vy: 0, onGround: false, fallStartY: player.y }, dt, ctx, input);
  }
  const y = hangingBelow ? Math.max(feetTop, player.y + speed * dt)
    : clamp(player.y + speed * dt, feetTop, feetMax);
  // 끝점에서 같은 방향 입력을 유지해도 실제 이동은 없다. 표시 계층이 vy를
  // 등반 애니메이션 진행량으로 쓰므로 명목 속도를 남기면 제자리에서 팔다리가 돈다.
  const movedSpeed = Math.abs(y - player.y) <= 0.001 ? 0 : speed;

  const moved: PlayerSimState = {
    ...player,
    y,
    vx: 0,
    vy: movedSpeed,
    pose: "climb",
    motion: movedSpeed === 0 ? "still" : "walk",
    onGround: false,
  };

  // 꼭대기에 닿으면 별도 좌우 입력을 기다리지 않고 위층 바닥으로 올라선다. 사다리 중앙은
  // 슬래브 구멍이라 climb 상태만 해제하면 곧바로 다시 떨어진다. 진입 전 바라보던 쪽을 먼저
  // 고르고, 그쪽 바닥이 없을 때만 반대편을 사용해 항상 실제 지지면 위에서 지상 조작으로 넘긴다.
  if (y <= feetTop + 0.001 && speed < 0) {
    // 위+옆을 함께 누른 채 도착하면 누른 쪽으로 내려선다(곧장 걸어 나가는 의도).
    const preferredDirection: Facing = input.moveX > 0 ? 1 : input.moveX < 0 ? -1 : player.facing;
    const directions: readonly Facing[] = [preferredDirection, preferredDirection === 1 ? -1 : 1];
    for (const direction of directions) {
      const ledgeX = findLedgeX(moved, ctx, direction);
      if (ledgeX === null) continue;
      return {
        player: {
          ...moved,
          x: ledgeX,
          // The arrival tolerance can leave fractional feet inside the slab.
          // Snap before the next horizontal collision pass.
          y: feetTop,
          climbLinkId: null,
          pose: ladderExitPose(input),
          motion: "still",
          vx: 0,
          vy: 0,
          facing: direction,
          onGround: true,
          sinceLandMs: 0,
          fallStartY: feetTop,
        },
        events: [],
      };
    }
  }

  // 아래 끝에 닿으면 바닥에 선 것으로 처리해 사다리를 자동으로 놓는다.
  if (y >= feetMax - 0.001 && speed > 0) {
    return {
      // S를 누른 채 내려온 것은 "내려가기" 였지 웅크리기 의도가 아니다(2026-09-26: 멋쟁이의 웅크리기는
      // 엎드린 포복이라, 내려올 때마다 바닥에 엎드렸다 일어섰다). 서서 내려서고, 누르고 있던 S 는
      // `ladderCrouchHold` 가 한 번 놓을 때까지 웅크리기로 읽지 않는다. 이 틱에 새로 누른 S 만 웅크린다.
      player: {
        ...moved,
        climbLinkId: null,
        pose: ladderExitPose(input),
        motion: "still",
        vy: 0,
        onGround: true,
        sinceLandMs: 0,
        fallStartY: y,
      },
      events: [],
    };
  }

  // 데이터 오류로 사다리와 몸이 완전히 어긋난 경우의 안전망.
  const catchStillReachable = hangingBelow && linkAtPreferred(layout,
    interactionReachRect(bodyRect(moved, tuning), tuning.movement.bodyWidth, tuning), "ladder", link.id)?.id === link.id;
  if (!rectOverlaps(bodyRect(moved, tuning), link.rect) && !catchStillReachable) {
    const released: PlayerSimState = { ...moved, climbLinkId: null, pose: "stand", vy: 0, fallStartY: moved.y };
    return applyGravityAndCollide(released, dt, ctx);
  }

  return { player: moved, events: [] };
}

function stepVent(player: PlayerSimState, ctx: MoveContext, dtMs: number): MoveResult {
  const link = ctx.layout.links.find((l) => l.id === player.ventLinkId);
  const from = player.ventFrom;
  if (link === undefined || link.exit === undefined || from === null) {
    return { player: { ...player, ventLinkId: null, ventFrom: null, pose: "stand" }, events: [] };
  }
  const travelMs = ventTravelMs(link, ctx.tuning);
  const progress = player.ventProgressMs + dtMs;
  const t = clamp(progress / travelMs, 0, 1);
  const x = from.x + (link.exit.x - from.x) * t;
  const y = from.y + (link.exit.y - from.y) * t;

  if (t >= 1) {
    const at = { x: link.exit.x, y: link.exit.y - ctx.tuning.movement.bodyHeightCrouch / 2 };
    return {
      player: {
        ...player,
        x,
        y,
        vx: 0,
        vy: 0,
        motion: "still",
        ventLinkId: null,
        ventFrom: null,
        ventProgressMs: 0,
        pose: "stand",
        onGround: true,
      },
      events: [{ kind: "PlayerExitedVent", linkId: link.id, at, facing: player.facing }],
    };
  }
  return { player: { ...player, x, y, ventProgressMs: progress, pose: "vent", motion: "walk" }, events: [] };
}

function stepHide(player: PlayerSimState, input: InputFrame, ctx: MoveContext, dtMs: number): MoveResult {
  const hideSpotId = player.hideSpotId;
  if (hideSpotId === null) return applyGravityAndCollide({ ...player, pose: "stand" }, dtMs / 1000, ctx);
  // 은신 해제는 진입과 같은 hide 키를 다시 눌렀을 때만 한다. 옷장으로 접근하던
  // 좌우 입력이 한두 프레임 남아도 즉시 밖으로 튀어나오지 않아야, 화면의 은신과
  // 포박 면역 판정이 플레이어에게 같은 상태로 읽힌다.
  if (input.hide) {
    const spot = ctx.layout.hideSpots.find((candidate) => candidate.id === hideSpotId);
    const at = spot === undefined
      ? { x: player.x, y: player.y - ctx.tuning.movement.bodyHeightCrouch / 2 }
      : { x: spot.rect.x + spot.rect.w / 2, y: spot.rect.y + spot.rect.h / 2 };
    const released: PlayerSimState = { ...player, hideSpotId: null, pose: "stand" };
    const moved = applyGravityAndCollide(released, dtMs / 1000, ctx);
    return {
      player: moved.player,
      events: [
        { kind: "PlayerRevealed", hideSpotId, at },
        ...moved.events,
      ],
    };
  }
  return { player: { ...player, motion: "still", vx: 0, vy: 0 }, events: [] };
}

/**
 * 중력 적분 + 스윕 충돌.
 * 수직은 스윕으로 풀어 고속 낙하 시 얇은 슬래브를 통과하지 않게 한다.
 */
function applyGravityAndCollide(
  player: PlayerSimState,
  dt: number,
  ctx: MoveContext,
  input?: InputFrame,
): MoveResult {
  const { tuning } = ctx;
  const events: SimEvent[] = [];
  let next = { ...player };

  next.vy = Math.min(tuning.movement.maxFallSpeed, next.vy + tuning.movement.gravity * dt);

  // --- 수평 ---
  const dx = next.vx * dt;
  if (dx !== 0) {
    next.x += dx;
    const solids = solidRects(ctx.layout);
    const rect = bodyRect(next, tuning);
    for (const solid of solids) {
      if (!rectOverlaps(rect, solid)) continue;
      if (dx > 0) {
        next.x = solid.x - tuning.movement.bodyWidth / 2;
      } else {
        next.x = solid.x + solid.w + tuning.movement.bodyWidth / 2;
      }
      next.vx = 0;
      break;
    }
  }

  // --- 수직 (스윕) ---
  const dy = next.vy * dt;
  const wasOnGround = next.onGround;
  next.onGround = false;

  if (dy >= 0) {
    const feetFrom = next.y;
    const feetTo = next.y + dy;
    let landY: number | null = null;
    for (const surface of surfacesUnder(next, ctx, input)) {
      if (surface < feetFrom - 0.001 || surface > feetTo) continue;
      if (landY === null || surface < landY) landY = surface;
    }
    if (landY !== null) {
      next.y = landY;
      next.vy = 0;
      next.onGround = true;
      if (!wasOnGround) {
        const bufferedRoll =
          next.rollBufferMs > 0 &&
          ctx.canDodge &&
          Math.abs(next.vx) > tuning.movement.walkSpeed * 0.5 &&
          next.dodgeCooldownMs <= 0;
        if (bufferedRoll) {
          const direction: Facing = next.vx === 0 ? next.facing : next.vx > 0 ? 1 : -1;
          next.dodgeMs = tuning.combat.dodgeMs;
          next.dodgeCooldownMs = tuning.combat.dodgeCooldownMs;
          next.vx = direction * tuning.combat.dodgeSpeed * speedMultiplier(ctx.loadRatio, tuning);
          next.facing = direction;
          next.pose = "crouch";
          next.rollBufferMs = 0;
          events.push({ kind: "PlayerDodged", at: { x: next.x, y: next.y }, facing: direction });
        }
        events.push(...landingEvents(next, ctx, bufferedRoll));
        next.sinceLandMs = 0;
        const fallTiles = (next.y - next.fallStartY) / tuning.world.tilePx;
        if (!bufferedRoll && fallTiles > tuning.movement.pratfallTiles) {
          next.staggerMs = tuning.movement.fallStaggerMs;
          // 쓰러짐 클립은 짚은 앞발이 고정된 채 일어선다. 공중 속도가 남으면 경직 1초 내내 바닥을 미끄러진다.
          next.vx = 0;
        }
      }
      next.fallStartY = next.y;
      next.jumpCutUsed = true;
    } else {
      next.y = feetTo;
    }
  } else {
    const h = bodyHeight(next.pose, tuning);
    const headFrom = next.y - h;
    const headTo = headFrom + dy;
    let ceilY: number | null = null;
    const width = tuning.movement.bodyWidth;
    for (const solid of solidRects(ctx.layout)) {
      const bottom = solid.y + solid.h;
      if (bottom > headFrom + 0.001 || bottom < headTo) continue;
      if (next.x + width / 2 <= solid.x || next.x - width / 2 >= solid.x + solid.w) continue;
      if (ceilY === null || bottom > ceilY) ceilY = bottom;
    }
    if (ceilY !== null) {
      next.y = ceilY + h;
      next.vy = 0;
    } else {
      next.y += dy;
    }
  }

  // 코요테 타임
  if (next.onGround) {
    next.coyoteMs = tuning.movement.coyoteMs;
  } else {
    next.coyoteMs = Math.max(0, next.coyoteMs - dt * 1000);
    if (wasOnGround) next.fallStartY = next.y;
  }

  return { player: next, events };
}

/** 발밑에서 착지 가능한 표면의 y 목록. 원웨이 발판은 아래로 통과 입력이면 제외한다. */
function surfacesUnder(player: PlayerSimState, ctx: MoveContext, input?: InputFrame): number[] {
  const width = ctx.tuning.movement.bodyWidth;
  const left = player.x - width / 2;
  const right = player.x + width / 2;
  const out: number[] = [];

  for (const solid of solidRects(ctx.layout)) {
    if (right <= solid.x || left >= solid.x + solid.w) continue;
    out.push(solid.y);
  }

  // 아래 + 점프는 원웨이 발판 통과
  const dropThrough = input !== undefined && input.moveY > 0 && input.jump;
  if (!dropThrough) {
    for (const platform of platformRects(ctx.layout)) {
      if (right <= platform.x || left >= platform.x + platform.w) continue;
      out.push(platform.y);
    }
  }
  return out;
}

function landingEvents(player: PlayerSimState, ctx: MoveContext, rolled: boolean): SimEvent[] {
  const { tuning } = ctx;
  const fallTiles = Math.max(0, (player.y - player.fallStartY) / tuning.world.tilePx);
  const impact = rolled ? "roll" : fallTiles > tuning.movement.softLandingTiles ? "hard" : "soft";
  const radius = impact === "roll"
    ? tuning.noise.rolledLandingRadius
    : impact === "hard"
      ? tuning.noise.hardLandingRadius
      : tuning.noise.softLandingRadius;

  return [
    { kind: "PlayerLanded", at: { x: player.x, y: player.y }, fallTiles, rolled, impact, facing: player.facing },
    {
      kind: "NoiseEmitted",
      at: { x: player.x, y: player.y },
      floor: Math.floor(player.y / tuning.world.floorHeightPx),
      radius: radius + tuning.carry.noisePerLoad * ctx.loadRatio,
      source: "landing",
    },
  ];
}

/** 사다리 구멍 옆에서 발 높이가 같은 바닥을 찾아 올라설 x 를 돌려준다. 없으면 null. */
function findLedgeX(player: PlayerSimState, ctx: MoveContext, dir: Facing): number | null {
  const half = ctx.tuning.movement.bodyWidth / 2;
  const margin = 2;
  const maxReach = ctx.tuning.movement.bodyWidth * 4;
  let best: number | null = null;

  for (const solid of solidRects(ctx.layout)) {
    if (Math.abs(solid.y - player.y) > 2) continue;
    if (dir < 0) {
      const edge = solid.x + solid.w;
      if (edge > player.x || player.x - edge > maxReach) continue;
      const candidate = edge - half - margin;
      if (best === null || candidate > best) best = candidate;
    } else {
      const edge = solid.x;
      if (edge < player.x || edge - player.x > maxReach) continue;
      const candidate = edge + half + margin;
      if (best === null || candidate < best) best = candidate;
    }
  }
  return best;
}

function canStandUp(player: PlayerSimState, ctx: MoveContext): boolean {
  const standing: PlayerSimState = { ...player, pose: "stand" };
  const rect = bodyRect(standing, ctx.tuning);
  return !solidRects(ctx.layout).some((solid) => rectOverlaps(rect, solid));
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}
