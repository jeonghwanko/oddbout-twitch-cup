import type { Circle, InputFrame, SimEvent, Vec2 } from "./types";
import type { MansionLayout } from "./MansionLayout";
import { environmentHazardAt, floorSurfaceY, snuffableLampAt, solidRects } from "./MansionLayout";
import type { Tuning } from "./tuning";
import { rectContains, segmentIntersectsCircle } from "./geom";
import { displaceHorizontally } from "./CombatDisplacementRules";
import type { ToolId, ToolLoadout } from "./ToolRules";
import { DEFAULT_TOOL_LOADOUT, normalizeToolLoadout, TOOL_START_CHARGES } from "./ToolRules";
import type { DisguiseBreakReason } from "./DisguiseRules";
import { DISGUISE_BREAK_NOISE_RADIUS_PX, DISGUISE_DURATION_MS } from "./DisguiseRules";
import type { GuardState } from "./GuardPlanner";
import { transitionGuardMode } from "./GuardStateMachine";
import * as GuardStatusRules from "./GuardStatusRules";
import * as LineOfFireRules from "./LineOfFireRules";
import { interactionReachPx } from "./InteractionRangeRules";
import {
  FIRECRACKER_NOISE_RADIUS_PX,
  FIRECRACKER_STAGGER_MS,
  FIRECRACKER_TRIGGER_PX,
  hasWeaponMod,
  MOUSE_MAX_AMMO,
  RINGING_BLADE_NOISE_RADIUS_PX,
  RUNAWAY_CHIRP_MS,
  RUNAWAY_SPEED_PX_PER_SEC,
  SNARE_CHAIN_REACH_PX,
  SNARE_THROW_RANGE_PX,
  TEAR_GAS_STAGGER_MS,
  WIRE_PULL_GAP_PX,
  type WeaponModId,
} from "./WeaponModRules";
import { hookPropTarget } from "./PhysicsTargetRules";
import * as CombatRules from "./CombatRules";
import { isEncounterBoss } from "./BlackthorneBossRules";

export const SMOKE_RADIUS_PX = 118;
export const SMOKE_DURATION_MS = 5_000;
/** 바닥에 착탄한 뒤 경비가 접근하고 확인할 수 있는 유인구의 실제 존속 시간. */
export const MOUSE_DURATION_MS = 7_000;
/** 저장·이벤트 이름은 호환을 위해 mouse를 유지하지만, 런타임 도구는 정지형 태엽 유인구다. */
export const MOUSE_CHIRP_MS = 0;
export const MOUSE_SPEED_PX_PER_SEC = 0;
export const MOUSE_NOISE_RADIUS_PX = 360;
export const LURE_RESPONSE_MOUSE_NOISE_RADIUS_PX = 260;

/** 판정과 조준 UI가 같은 유인구 소음 반경을 소비한다. */
export function mouseNoiseRadius(layout: Pick<MansionLayout, "tacticResponse">): number {
  return layout.tacticResponse?.tactic === "lure"
    ? LURE_RESPONSE_MOUSE_NOISE_RADIUS_PX
    : MOUSE_NOISE_RADIUS_PX;
}
export const WIRE_MAX_RANGE_PX = 240;
export const WIRE_MIN_TRAVEL_PX = 64;
// 사람 경비의 26px 몸 접촉 경계 바로 바깥까지 닿아, 발밑 설치가 경비 앞에서 헛돌지 않는다.
export const RIBBON_SNARE_RADIUS_PX = 28;
export const RIBBON_SNARE_DURATION_MS = 20_000;
export const RIBBON_SNARE_STAGGER_MS = 1_600;
export const RIBBON_SNARE_NOISE_RADIUS_PX = 240;

/**
 * 장난 동사: 휘파람 · 투척 · 등 끄기 · 괴도의 눈.
 *
 * 셋의 공통점은 "소음과 빛을 내가 만든다"는 것이다. 잠입에서 유일하게
 * 플레이어가 경비의 지각에 능동적으로 개입하는 수단이고, 이게 없으면
 * 게임이 통째로 회피 게임이 된다.
 *
 *   휘파람 — 무료·무제한이지만 소음이 **내 위치**에 난다. 옷장 안에서 불어
 *            경비를 지나가게 만드는 것이 정석. 위치를 내주는 것이 곧 대가다.
 *   투척   — 소음이 **던진 곳**에 난다. 탄수가 유한해서 아껴야 한다.
 *            공격이 아니다. 사거리가 소음 반경보다 짧으면 내가 그 반경 안에
 *            들어가 유인이 자해가 되므로, 그 부등식이 이 동사의 존재 조건이다.
 *   등 끄기 — 지금 어둠을 사고 나중에 지불한다(경비가 알아챈다).
 *   괴도의 눈 — 시간을 늦춰 순찰을 읽는다. 횡스크롤 잠입의 정보 부족을 메운다.
 */

export interface Projectile {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly floor: number;
  readonly tool: "dagger" | "smoke" | "mouse";
  /** 새 단도는 이 경비에게만 맞는다. 발사 뒤 위치를 추적하지 않으며 초기 직선만 고정한다. */
  readonly targetGuardId?: string;
  readonly targetLampId?: string;
  /** 반격 단도(`dagger-counter-throw`): 완벽 반격 창에서 던져 `counter` 빈틈으로 맞는다. */
  readonly counter?: true;
}

export interface SmokeCloud {
  readonly id: number;
  readonly at: Vec2;
  readonly floor: number;
  readonly radius: number;
  readonly remainingMs: number;
}

/** 연막 원화의 외곽선과 VisionRules가 함께 쓰는 실제 차폐 원. */
export function smokeSightCircle(cloud: Pick<SmokeCloud, "at" | "radius">): Circle {
  return {
    at: { x: cloud.at.x, y: cloud.at.y - cloud.radius * 0.35 },
    radius: cloud.radius * 0.92,
  };
}

export interface ClockworkMouse {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly floor: number;
  readonly facing: -1 | 1;
  readonly remainingMs: number;
  readonly chirpMs: number;
}

export interface RibbonSnare {
  readonly id: number;
  readonly at: Vec2;
  readonly floor: number;
  readonly radius: number;
  readonly remainingMs: number;
}

export interface MischiefState {
  readonly toolLoadout: ToolLoadout;
  readonly selectedToolIndex: 0 | 1;
  readonly throwAmmo: number;
  readonly smokeAmmo: number;
  readonly mouseAmmo: number;
  readonly wireAmmo: number;
  readonly maskAmmo: number;
  readonly snareAmmo: number;
  /** 무도회 가면 위장이 유지되는 남은 시간. 0이면 평상복이다. */
  readonly disguiseMs: number;
  /** 모으고 있는 시간. 놓는 순간의 이 값이 사거리를 정한다. */
  readonly throwChargeMs: number;
  /** 직전 스텝에 누르고 있었는가. 놓는 순간을 잡는다. */
  readonly throwHeld: boolean;
  /**
   * 즉시 투척(반격 단도)에 쓴 Q를 아직 놓지 않았다. 놓기 전까지 충전을 시작하지 않아
   * 누르고 있다 떼는 순간 두 번째 단도가 나가지 않는다. 개조 없는 런에는 생기지 않는다.
   */
  readonly throwLatched?: true;
  readonly projectiles: readonly Projectile[];
  readonly nextProjectileId: number;
  readonly smokeClouds: readonly SmokeCloud[];
  readonly nextSmokeId: number;
  readonly mice: readonly ClockworkMouse[];
  readonly nextMouseId: number;
  readonly snares: readonly RibbonSnare[];
  readonly nextSnareId: number;
  /** 꺼 버린 등. 이 목록이 실제로 지도에 어둠을 만든다. */
  readonly snuffedLamps: readonly string[];
  /** 등을 끄는 중인 대상과 진행 시간. */
  readonly snuffingLampId: string | null;
  readonly snuffMs: number;
  /** 이미 사용한 일회성 환경 장치와 현재 당기고 있는 줄. */
  readonly triggeredHazards: readonly string[];
  readonly triggeringHazardId: string | null;
  readonly hazardMs: number;
  readonly whistleCooldownMs: number;
  /** 괴도의 눈 잔여 집중. */
  readonly eyeMs: number;
  readonly eyeActive: boolean;
}

/** 손을 점유하는 장난 행동. 괴도의 눈·휘파람은 의도적으로 병행 가능한 별도 상태다. */
export type MischiefHandAction = "idle" | "throwing" | "snuffing" | "hazard";

type HandActionSnapshot = Pick<
  MischiefState,
  "throwHeld" | "snuffingLampId" | "triggeringHazardId"
>;

type HandActionInvariantSnapshot = HandActionSnapshot & Pick<
  MischiefState,
  "throwChargeMs" | "snuffMs" | "hazardMs"
>;

export function handActionOf(state: HandActionSnapshot): MischiefHandAction {
  if (state.snuffingLampId !== null) return "snuffing";
  if (state.triggeringHazardId !== null) return "hazard";
  if (state.throwHeld) return "throwing";
  return "idle";
}

export function invariantViolations(state: HandActionInvariantSnapshot): string[] {
  const violations: string[] = [];
  const activeCount = Number(state.throwHeld)
    + Number(state.snuffingLampId !== null)
    + Number(state.triggeringHazardId !== null);
  if (activeCount > 1) violations.push("multiple hand actions are active");
  if (!state.throwHeld && state.throwChargeMs !== 0) violations.push("throw charge exists without throwing");
  if (state.snuffingLampId === null && state.snuffMs !== 0) violations.push("snuff progress exists without a lamp");
  if (state.triggeringHazardId === null && state.hazardMs !== 0) {
    violations.push("hazard progress exists without a hazard");
  }
  return violations;
}

/** 손상된 이전 상태도 기존 행동 우선순위에 따라 하나의 손 행동으로 수렴시킨다. */
function normalizeHandAction(state: MischiefState): MischiefState {
  const action = handActionOf(state);
  return {
    ...state,
    throwHeld: action === "throwing",
    throwChargeMs: action === "throwing" ? Math.max(0, state.throwChargeMs) : 0,
    snuffingLampId: action === "snuffing" ? state.snuffingLampId : null,
    snuffMs: action === "snuffing" ? Math.max(0, state.snuffMs) : 0,
    triggeringHazardId: action === "hazard" ? state.triggeringHazardId : null,
    hazardMs: action === "hazard" ? Math.max(0, state.hazardMs) : 0,
  };
}

export function createMischief(tuning: Tuning, loadout: readonly ToolId[] = DEFAULT_TOOL_LOADOUT): MischiefState {
  return {
    toolLoadout: normalizeToolLoadout(loadout),
    selectedToolIndex: 0,
    throwAmmo: tuning.mischief.throwAmmo,
    smokeAmmo: TOOL_START_CHARGES,
    mouseAmmo: TOOL_START_CHARGES,
    wireAmmo: TOOL_START_CHARGES,
    maskAmmo: TOOL_START_CHARGES,
    snareAmmo: TOOL_START_CHARGES,
    disguiseMs: 0,
    throwChargeMs: 0,
    throwHeld: false,
    projectiles: [],
    nextProjectileId: 1,
    smokeClouds: [],
    nextSmokeId: 1,
    mice: [],
    nextMouseId: 1,
    snares: [],
    nextSnareId: 1,
    snuffedLamps: [],
    snuffingLampId: null,
    snuffMs: 0,
    triggeredHazards: [],
    triggeringHazardId: null,
    hazardMs: 0,
    whistleCooldownMs: 0,
    eyeMs: tuning.mischief.eyeMaxMs,
    eyeActive: false,
  };
}

/** 포박처럼 다른 행동을 전부 소유하는 상태에 들어갈 때 진행 중인 손동작만 취소한다. */
export function cancelActions(state: MischiefState): MischiefState {
  return {
    ...state,
    throwChargeMs: 0,
    throwHeld: false,
    snuffingLampId: null,
    snuffMs: 0,
    triggeringHazardId: null,
    hazardMs: 0,
    eyeActive: false,
  };
}

export interface MischiefContext {
  readonly at: Vec2;
  readonly facing: -1 | 1;
  readonly floor: number;
  /** 은신 중에는 던질 수 없지만 휘파람은 불 수 있다 — 그게 은신처의 쓸모다. */
  readonly hidden: boolean;
  /** 획득 뒤 활성화되는 환경 장치 판정에 쓰는 앵커 ID. */
  readonly collectedAnchorIds?: readonly string[];
  /** 입력 전 화면에 고정된 R 대상. 진행 중 대상 ID가 있으면 그 값이 더 우선한다. */
  readonly preferredInteractionTargetId?: string | null;
  /** 걷거나 가만히 선 손님처럼 보이는가. 위장 판정과 화면이 같은 규칙에서 계산한다. */
  readonly sociallyComposed?: boolean;
  /**
   * 달리기만 빼고 본 차분함(선 자세·바닥·사다리·은신 아님). 군중 속 가면은 달리기만 눈감아 준다 — `sociallyComposed` 는
   * 달리면 늘 거짓이라, 이것 없이는 손님 사이를 달리는 순간 "자리를 벗어남" 으로 가면이 벗겨졌다(2026-09-29 재검토).
   */
  readonly composedIgnoringRun?: boolean;
  readonly running?: boolean;
  /** 단도 자동 조준에 쓰는 현재 경비 스냅샷. */
  readonly guards?: readonly GuardState[];
  /** 지금 열린 완벽 반격 창의 대상. 반격 단도 개조가 이 대상을 즉시 겨눈다. */
  readonly counterGuardId?: string | null;
  /** 손님과 겹쳐 비집고 지나가는 중인가(`CrowdRules.playerSpeedMultiplier`). 군중 속 가면이 읽는다. */
  readonly inCrowd?: boolean;
}

export interface ProjectileImpact {
  readonly at: Vec2;
  readonly facing: -1 | 1;
  readonly tool: "dagger" | "smoke" | "mouse";
}

export interface MischiefResult {
  readonly state: MischiefState;
  readonly events: readonly SimEvent[];
  /** 이번 스텝에 착탄한 투척물. 전투 구간에서는 단검으로 읽혀 피해를 준다. */
  readonly impacts: readonly ProjectileImpact[];
  /** 실크 와이어가 확정한 같은 층의 안전한 착지점. simulation이 플레이어 위치에 한 번 적용한다. */
  readonly relocation: Vec2 | null;
  /** 반격 단도가 이번 스텝 반격 창을 소비했는가. simulation이 근접 반격권을 함께 닫는다. */
  readonly counterConsumed: boolean;

  readonly wireGuard: { readonly guardId: string; readonly mode: "pull" | "kick" } | null;
}

export function step(
  state: MischiefState,
  input: InputFrame,
  ctx: MischiefContext,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
): MischiefResult {
  const events: SimEvent[] = [];
  let relocation: Vec2 | null = null;
  let wireGuard: MischiefResult["wireGuard"] = null;
  const m = tuning.mischief;
  let next = { ...normalizeHandAction(state) };

  if (next.disguiseMs > 0) {
    next.disguiseMs = Math.max(0, next.disguiseMs - dtMs);
    if (next.disguiseMs === 0) events.push({ kind: "DisguiseExpired", at: ctx.at });
  }

  const smokeStep = advanceSmoke(next.smokeClouds, dtMs);
  next.smokeClouds = smokeStep.clouds;
  events.push(...smokeStep.events);
  const mouseStep = advanceMice(next.mice, dtMs, layout, tuning);
  next.mice = mouseStep.mice;
  events.push(...mouseStep.events);
  const snareStep = advanceSnares(next.snares, dtMs);
  next.snares = snareStep.snares;
  events.push(...snareStep.events);

  // 숫자 1·2는 장착 슬롯을 직접 고른다. 같은 슬롯을 다시 눌러도 진행 중인 행동이나
  // 변장을 취소하지 않으며, 실제로 슬롯이 바뀐 프레임만 ToolSelected를 낸다.
  const requestedToolIndex: 0 | 1 | null = input.toolSlot1 ? 0 : input.toolSlot2 ? 1 : null;
  const selectingTool = requestedToolIndex !== null && requestedToolIndex !== next.selectedToolIndex;
  if (next.disguiseMs > 0) {
    const crowdCover = ctx.inCrowd === true && hasWeaponMod(layout, "mask-crowd");
    const breakReason = disguiseBreakReason(input, ctx, selectingTool, crowdCover);
    if (breakReason !== null) {
      const broken = breakDisguise(next, breakReason, ctx.at, ctx.floor);
      next = broken.state;
      events.push(...broken.events);
    }
  }
  if (requestedToolIndex !== null && selectingTool) {
    next.selectedToolIndex = requestedToolIndex;
    next.throwHeld = false;
    next.throwChargeMs = 0;
    events.push({ kind: "ToolSelected", tool: next.toolLoadout[requestedToolIndex], at: ctx.at });
  }

  // --- 휘파람: 내 위치에 소음 ---
  next.whistleCooldownMs = Math.max(0, next.whistleCooldownMs - dtMs);
  if (input.whistle && next.whistleCooldownMs <= 0) {
    next.whistleCooldownMs = m.whistleCooldownMs;
    events.push({
      kind: "NoiseEmitted",
      at: ctx.at,
      floor: ctx.floor,
      radius: tuning.noise.whistleRadius,
      source: "whistle",
    });
  } else if (input.whistle) {
    events.push({
      kind: "ActionRejected",
      action: "whistle",
      reason: "cooldown",
      at: ctx.at,
      current: next.whistleCooldownMs,
      required: 0,
    });
  }

  // --- 투척: 누르고 있는 동안 세기가 차고, 놓는 순간 날아간다 ---
  // R은 근접 맥락 행동이므로 같은 프레임에 Q와 함께 눌리면 손 소유권을 먼저 가진다.
  // 이미 시작한 행동은 완료/취소 프레임까지 소유권을 유지해 투척과 소등이 겹치지 않는다.
  const initialHandAction = handActionOf(next);
  const environmentClaimsHand = initialHandAction === "snuffing"
    || initialHandAction === "hazard"
    || initialHandAction === "idle" && input.snuffPressed;
  const throwClaimsHand = initialHandAction === "throwing"
    || initialHandAction === "idle" && !environmentClaimsHand && (input.throw || input.throwPressed);
  const throwPressed = !environmentClaimsHand && input.throwPressed;
  const throwHeldInput = !environmentClaimsHand && input.throw;
  const selectedTool = next.toolLoadout[next.selectedToolIndex];
  const selectedAmmo = ammoOf(next, selectedTool);
  const canThrow = selectedAmmo > 0 && !ctx.hidden && !selectingTool;
  // 반격 단도: 완벽 반격 창 안의 Q는 충전을 건너뛰고 잠긴 공격자에게 바로 던진다.
  const counterTarget = selectedTool === "dagger" && throwPressed && canThrow
    && hasWeaponMod(layout, "dagger-counter-throw")
    && ctx.counterGuardId !== undefined && ctx.counterGuardId !== null
    ? (ctx.guards ?? []).find((guard) => guard.id === ctx.counterGuardId && GuardStatusRules.canBeCombatTarget(guard)) ?? null
    : null;
  const counterConsumed = counterTarget !== null;
  if (counterTarget !== null) {
    const projectileId = next.nextProjectileId;
    const facing: -1 | 1 = counterTarget.x >= ctx.at.x ? 1 : -1;
    const projectile: Projectile = {
      id: projectileId,
      ...launchDagger({ ...ctx, facing }, counterTarget, tuning, 1),
      counter: true,
    };
    next = {
      ...spendAmmo(next, "dagger"),
      nextProjectileId: projectileId + 1,
      projectiles: [...next.projectiles, projectile],
      throwHeld: false,
      throwChargeMs: 0,
      throwLatched: true,
    };
    events.push(
      { kind: "ProjectileThrown", projectileId, at: { x: projectile.x, y: projectile.y }, facing, power: 1, tool: "dagger" },
      { kind: "WeaponModTriggered", mod: "dagger-counter-throw", at: { ...ctx.at }, guardId: counterTarget.id, facing },
    );
  }
  if (selectedTool === "mask" && throwPressed && !selectingTool) {
    if (next.disguiseMs > 0) {
      events.push({ kind: "ActionRejected", action: "throw", reason: "already-done", at: ctx.at });
    } else if (!canThrow) {
      events.push({
        kind: "ActionRejected",
        action: "throw",
        reason: ctx.hidden ? "hidden" : "no-ammo",
        at: ctx.at,
      });
    } else {
      next = spendAmmo(next, "mask");
      next.disguiseMs = DISGUISE_DURATION_MS;
      next.throwHeld = false;
      next.throwChargeMs = 0;
      events.push({ kind: "DisguiseActivated", at: ctx.at, durationMs: DISGUISE_DURATION_MS });
    }
  }
  if (selectedTool === "snare" && throwPressed && !selectingTool) {
    if (!canThrow) {
      events.push({
        kind: "ActionRejected",
        action: "throw",
        reason: ctx.hidden ? "hidden" : "no-ammo",
        at: ctx.at,
      });
    } else {
      const snareId = next.nextSnareId;
      // 올가미 투척: 앞의 경비에게 던지면 그 발밑에 걸린다. 같은 스텝의 발동 판정이
      // 기존 설치형과 똑같이 넘어뜨리므로 경직·소음 규칙이 한 곳에 남는다.
      const thrownAt = hasWeaponMod(layout, "snare-throw")
        ? snareThrowTarget(ctx, ctx.guards ?? [], layout, tuning)
        : null;
      const at = thrownAt === null ? { ...ctx.at } : { x: thrownAt.x, y: thrownAt.y };
      next = {
        ...spendAmmo(next, "snare"),
        nextSnareId: snareId + 1,
        snares: [...next.snares, {
          id: snareId,
          at,
          floor: thrownAt?.floor ?? ctx.floor,
          radius: RIBBON_SNARE_RADIUS_PX,
          remainingMs: RIBBON_SNARE_DURATION_MS,
        }],
        throwHeld: false,
        throwChargeMs: 0,
      };
      events.push({ kind: "RibbonSnarePlaced", snareId, at, radius: RIBBON_SNARE_RADIUS_PX });
      if (thrownAt !== null) {
        events.push({ kind: "WeaponModTriggered", mod: "snare-throw", at, guardId: thrownAt.id, facing: ctx.facing });
      }
    }
  }
  if (selectedTool !== "mask" && selectedTool !== "snare" && throwPressed && !selectingTool && !canThrow && !counterConsumed) {
    events.push({
      kind: "ActionRejected",
      action: "throw",
      reason: ctx.hidden ? "hidden" : "no-ammo",
      at: ctx.at,
    });
  }
  if (next.throwLatched === true) {
    // 즉시 투척한 입력은 키를 놓을 때까지 충전을 시작하지 않는다.
    if (!input.throw) {
      const { throwLatched: _released, ...unlatched } = next;
      next = unlatched;
    }
  } else if (selectedTool !== "mask" && selectedTool !== "snare" && throwHeldInput && canThrow) {
    next.throwHeld = true;
    next.throwChargeMs = Math.min(m.throwChargeMs, next.throwChargeMs + dtMs);
  } else if (next.throwHeld) {
    // 손을 떠난다. 옷장에 들어가거나 탄이 떨어졌으면 그냥 취소된다.
    if (canThrow) {
      const power = powerOf(next.throwChargeMs, tuning);
      const wireGuardTarget = selectedTool === "wire" && hasWeaponMod(layout, "wire-pull")
        ? forwardGuardTarget(ctx, ctx.guards ?? [], layout, tuning, WIRE_MAX_RANGE_PX)
        : null;
      const wireProp = selectedTool === "wire" && wireGuardTarget === null && hasWeaponMod(layout, "wire-cart-hook")
        ? hookPropTarget(ctx.at, ctx.facing, layout, tuning, WIRE_MAX_RANGE_PX)
        : null;
      if (wireGuardTarget !== null) {
        next = spendAmmo(next, "wire");
        if (hasWeaponMod(layout, "wire-kick")) {
          const landing = displaceHorizontally({
            fromX: ctx.at.x,
            deltaX: wireGuardTarget.x - ctx.facing * WIRE_PULL_GAP_PX - ctx.at.x,
            feetY: ctx.at.y,
            halfWidth: tuning.movement.bodyWidth / 2,
            bodyHeight: tuning.movement.bodyHeightStand,
            stayGrounded: true,
          }, layout);
          relocation = { x: landing.x, y: ctx.at.y };
          wireGuard = { guardId: wireGuardTarget.id, mode: "kick" };
          events.push(
            { kind: "SilkWireVaulted", from: ctx.at, at: relocation, facing: ctx.facing },
            { kind: "WeaponModTriggered", mod: "wire-kick", at: relocation, guardId: wireGuardTarget.id, facing: ctx.facing },
          );
        } else {
          wireGuard = { guardId: wireGuardTarget.id, mode: "pull" };
          events.push({ kind: "WeaponModTriggered", mod: "wire-pull", at: { x: ctx.at.x + ctx.facing * WIRE_PULL_GAP_PX, y: ctx.at.y }, guardId: wireGuardTarget.id, facing: ctx.facing,
            from: { x: wireGuardTarget.x, y: wireGuardTarget.y } });
        }
      } else if (wireProp !== null) {
        next = spendAmmo(next, "wire");
        events.push({ kind: "WeaponModTriggered", mod: "wire-cart-hook", at: { ...ctx.at }, propId: wireProp.id, facing: ctx.facing });
      } else if (selectedTool === "wire") {
        const target = wireTarget(ctx, layout, tuning, power);
        if (Math.abs(target.x - ctx.at.x) < WIRE_MIN_TRAVEL_PX) {
          events.push({ kind: "ActionRejected", action: "throw", reason: "no-target", at: ctx.at });
        } else {
          next = spendAmmo(next, selectedTool);
          relocation = target;
          events.push({ kind: "SilkWireVaulted", from: ctx.at, at: target, facing: ctx.facing });
        }
      } else if (selectedTool === "dagger") {
        // Releasing focus and throw together commits the preview seen while charging.
        const focused = state.eyeActive || input.thiefEye && next.eyeMs > 0;
        const lamp = focused ? daggerLampTarget(ctx, next.snuffedLamps, layout, tuning) : null;
        const target = lamp === null ? daggerTarget(ctx, ctx.guards ?? [], layout, tuning) : null;
        const projectileId = next.nextProjectileId;
        // 유효 표적은 발사 순간의 방향만 고정하고 이후 추적하지 않는다. 표적이 없어도
        // 유인구의 포물선을 재사용하지 않고 바라보는 방향으로 수평 직선 투척한다.
        const projectile = {
          id: projectileId,
          ...launchDagger(ctx, target, tuning, power, lamp),
        };
        next = {
          ...spendAmmo(next, selectedTool),
          nextProjectileId: projectileId + 1,
          projectiles: [...next.projectiles, projectile],
        };
        events.push({
          kind: "ProjectileThrown",
          projectileId,
          at: { x: projectile.x, y: projectile.y },
          facing: ctx.facing,
          power,
          tool: selectedTool,
        });
      } else if (selectedTool === "smoke" || selectedTool === "mouse") {
        const projectileId = next.nextProjectileId;
        const projectile = { id: projectileId, ...launch(ctx, tuning, power, selectedTool) };
        next = {
          ...spendAmmo(next, selectedTool),
          nextProjectileId: projectileId + 1,
          projectiles: [...next.projectiles, projectile],
        };
        events.push({
          kind: "ProjectileThrown",
          projectileId,
          at: { x: projectile.x, y: projectile.y },
          facing: ctx.facing,
          power,
          tool: selectedTool,
        });
      }
    }
    next.throwHeld = false;
    next.throwChargeMs = 0;
  }
  const flown = stepProjectiles(next.projectiles, layout, tuning, dtMs, next.snuffedLamps);
  next.projectiles = flown.projectiles;
  events.push(...flown.events);
  for (const event of flown.events) {
    if (event.kind === "LampSnuffed" && !next.snuffedLamps.includes(event.lampId)) {
      next.snuffedLamps = [...next.snuffedLamps, event.lampId];
    }
  }
  for (const impact of flown.impacts) {
    if (impact.tool === "smoke") {
      const deployed = deploySmoke(next, impact.at, Math.floor(impact.at.y / tuning.world.floorHeightPx));
      next = { ...deployed.state };
      events.push(...deployed.events);
    }
    if (impact.tool === "mouse") {
      const mouseId = next.nextMouseId;
      const floor = Math.floor(impact.at.y / tuning.world.floorHeightPx);
      const radius = mouseNoiseRadius(layout);
      next.nextMouseId = mouseId + 1;
      next.mice = [...next.mice, {
        id: mouseId,
        x: impact.at.x,
        y: impact.at.y,
        floor,
        facing: impact.facing,
        remainingMs: MOUSE_DURATION_MS,
        chirpMs: hasWeaponMod(layout, "mouse-runaway") ? RUNAWAY_CHIRP_MS : 0,
      }];
      events.push(
        { kind: "ClockworkMouseReleased", mouseId, at: impact.at, facing: impact.facing },
        { kind: "ClockworkMouseChirped", mouseId, at: impact.at },
        { kind: "NoiseEmitted", at: impact.at, floor, radius, source: "mouse" },
      );
    }
  }

  // --- 유인구 회수(개조): 멈춰 있는 내 유인구 옆에서 R을 새로 누르면 주워 한 발 되찾는다 ---
  const recoverable = !throwClaimsHand && input.snuffPressed && initialHandAction === "idle"
    && hasWeaponMod(layout, "mouse-recover") && next.mouseAmmo < MOUSE_MAX_AMMO
    ? next.mice.find((mouse) => mouse.floor === ctx.floor
      && Math.abs(mouse.x - ctx.at.x) <= interactionReachPx(m.reachPx, tuning)) ?? null
    : null;
  if (recoverable !== null) {
    next.mice = next.mice.filter((mouse) => mouse.id !== recoverable.id);
    next.mouseAmmo = Math.min(MOUSE_MAX_AMMO, next.mouseAmmo + 1);
    events.push(
      { kind: "ClockworkMouseStopped", mouseId: recoverable.id, at: { x: recoverable.x, y: recoverable.y } },
      { kind: "WeaponModTriggered", mod: "mouse-recover", at: { x: recoverable.x, y: recoverable.y } },
    );
  }

  // --- 환경 공격: 같은 R 홀드지만 가까운 당김줄이 전등보다 우선한다 ---
  const snuffPressed = !throwClaimsHand && recoverable === null && input.snuffPressed;
  const snuffHold = !throwClaimsHand && recoverable === null && input.snuffHold;
  // 이미 소등을 시작했다면 새로 범위에 들어온 당김줄이 R 홀드를 가로채지 않는다.
  // 새 입력에서는 환경 장치가 우선하지만, 진행 중 행동은 종류와 대상 모두 고정한다.
  const hazard = initialHandAction === "snuffing"
    ? null
    : environmentHazardAt(
        layout,
        ctx.at,
        interactionReachPx(m.reachPx, tuning),
        ctx.collectedAnchorIds ?? [],
        next.triggeringHazardId ?? ctx.preferredInteractionTargetId ?? null,
      );
  const hazardDone = hazard !== null && next.triggeredHazards.includes(hazard.id);
  if (snuffPressed && hazard !== null && hazardDone) {
    events.push({
      kind: "ActionRejected",
      action: "environment",
      reason: "already-done",
      at: ctx.at,
      targetId: hazard.id,
    });
  }
  const continuingHazard = hazard !== null && next.triggeringHazardId === hazard.id;
  if (snuffHold && hazard !== null && !hazardDone && (snuffPressed || continuingHazard)) {
    const progress = continuingHazard ? next.hazardMs + dtMs : dtMs;
    if (progress >= m.chandelierHoldMs) {
      next.triggeredHazards = [...next.triggeredHazards, hazard.id];
      next.triggeringHazardId = null;
      next.hazardMs = 0;
      events.push({
        kind: "ChandelierDropped",
        hazardId: hazard.id,
        from: hazard.visualAt,
        at: hazard.impactAt,
      });
    } else {
      next.triggeringHazardId = hazard.id;
      next.hazardMs = progress;
    }
  } else {
    next.triggeringHazardId = null;
    next.hazardMs = 0;
  }

  // --- 등 끄기: 홀드로 진행, 완료 시 그 자리에 어둠이 생긴다 ---
  // 당김줄 근처에서는 R의 의미가 하나여야 하므로 전등 판정을 함께 시작하지 않는다.
  const lamp = hazard === null
    ? snuffableLampAt(
        layout,
        ctx.at,
        interactionReachPx(m.reachPx, tuning),
        next.snuffingLampId ?? ctx.preferredInteractionTargetId ?? null,
      )
    : null;
  const canSnuff = lamp !== null && !next.snuffedLamps.includes(lamp.id);
  if (snuffPressed && !canSnuff) {
    events.push({
      kind: "ActionRejected",
      action: "snuff",
      reason: lamp !== null ? "already-done" : "no-target",
      at: ctx.at,
      targetId: lamp?.id,
    });
  }
  const continuingSnuff = lamp !== null && next.snuffingLampId === lamp.id;
  if (snuffHold && canSnuff && lamp !== null && (snuffPressed || continuingSnuff)) {
    const progress = next.snuffingLampId === lamp.id ? next.snuffMs + dtMs : dtMs;
    if (progress >= m.snuffMs) {
      next.snuffedLamps = [...next.snuffedLamps, lamp.id];
      next.snuffingLampId = null;
      next.snuffMs = 0;
      events.push({ kind: "LampSnuffed", lampId: lamp.id, at: lamp.at });
    } else {
      next.snuffingLampId = lamp.id;
      next.snuffMs = progress;
    }
  } else {
    next.snuffingLampId = null;
    next.snuffMs = 0;
  }

  // --- 괴도의 눈: 집중을 소모하며 시간을 늦춘다 ---
  const wantsEye = input.thiefEye && next.eyeMs > 0;
  if (input.thiefEyePressed && next.eyeMs <= 0) {
    events.push({ kind: "ActionRejected", action: "thief-eye", reason: "depleted", at: ctx.at });
  }
  next.eyeActive = wantsEye;
  if (wantsEye) {
    next.eyeMs = Math.max(0, next.eyeMs - dtMs);
  } else if (!input.thiefEye) {
    // 전부 소진한 채 Tab을 계속 누르면 재생분을 다음 프레임에 즉시 다시 쓰는
    // ON/OFF 진동이 생긴다. 카메라 줌과 시선 선행점도 함께 진동하므로,
    // 키를 한 번 놓아야만 집중이 회복되게 한다.
    next.eyeMs = Math.min(m.eyeMaxMs, next.eyeMs + m.eyeRegenPerSec * (dtMs / 1000));
  }

  return { state: next, events, impacts: flown.impacts, relocation, counterConsumed, wireGuard };
}

/** 벽을 통과하지 않고 현재 층의 발판 위에서만 확정되는 실크 와이어 착지점. */
export function wireTarget(
  ctx: Pick<MischiefContext, "at" | "facing">,
  layout: MansionLayout,
  tuning: Tuning,
  power = 1,
): Vec2 {
  const distance = WIRE_MIN_TRAVEL_PX + (WIRE_MAX_RANGE_PX - WIRE_MIN_TRAVEL_PX) * Math.max(0, Math.min(1, power));
  const movement = displaceHorizontally({
    fromX: ctx.at.x,
    deltaX: ctx.facing * distance,
    feetY: ctx.at.y,
    halfWidth: tuning.movement.bodyWidth / 2,
    bodyHeight: tuning.movement.bodyHeightStand,
    stayGrounded: true,
  }, layout);
  return { x: movement.x, y: ctx.at.y };
}

/**
 * 모은 시간 → 세기 0..1.
 * 톡 누르면 throwMinPower, 끝까지 누르면 1. 사거리는 대략 세기의 제곱이다.
 */
export function powerOf(chargeMs: number, tuning: Tuning): number {
  const m = tuning.mischief;
  if (m.throwChargeMs <= 0) return 1;
  const t = Math.min(1, Math.max(0, chargeMs / m.throwChargeMs));
  return m.throwMinPower + (1 - m.throwMinPower) * t;
}

/** 손을 떠나는 순간의 상태. 시뮬레이션과 궤적 예고가 같은 값을 쓰게 한다. */
function launch(
  ctx: MischiefContext,
  tuning: Tuning,
  power: number,
  tool: "dagger" | "smoke" | "mouse" = "mouse",
): Omit<Projectile, "id"> {
  return {
    x: ctx.at.x,
    y: ctx.at.y - tuning.movement.bodyHeightStand * 0.6,
    vx: tuning.mischief.throwSpeed * power * ctx.facing,
    vy: tuning.mischief.throwArc * power,
    floor: ctx.floor,
    tool,
  };
}

/** 단도는 바닥이 아니라 바라보는 방향의 가장 가까운 유효 경비를 고른다. */
export function daggerTarget(
  ctx: Pick<MischiefContext, "at" | "facing" | "floor">,
  guards: readonly GuardState[],
  layout: MansionLayout,
  tuning: Tuning,
): GuardState | null {
  const origin = { x: ctx.at.x, y: LineOfFireRules.originY(ctx.at.y, tuning) };
  return guards
    .filter((guard) => {
      if (!GuardStatusRules.canBeCombatTarget(guard) || guard.staggerMs > 0 || guard.floor !== ctx.floor) return false;
      const forward = (guard.x - ctx.at.x) * ctx.facing;
      if (forward <= 0 || forward > tuning.mischief.throwSpeed) return false;
      const target = { x: guard.x, y: LineOfFireRules.originY(guard.y, tuning) };
      return LineOfFireRules.trace(origin, target, layout).clear;
    })
    .sort((a, b) => Math.abs(a.x - ctx.at.x) - Math.abs(b.x - ctx.at.x))[0] ?? null;
}

/**
 * 단도 등불 사격이 켜진 런인가. 블랙손은 레이아웃이 켜고, 다른 저택은 `dagger-lamp-shot`
 * 개조가 켠다. 조준 미리보기·발사·착탄이 모두 이 판정 하나를 읽는다.
 */
export function daggerLightsEnabled(layout: Pick<MansionLayout, "manor" | "toolMods">): boolean {
  return layout.manor?.daggerLights === true || hasWeaponMod(layout, "dagger-lamp-shot");
}

/** 이 저택이 개조 없이 이미 주는 쓰임 — 그 개조는 여기서 아무것도 더하지 않는다(장비창이 블랙손 칸에 알린다). */
export function weaponModsBuiltInto(layout: Pick<MansionLayout, "manor">): readonly WeaponModId[] {
  return layout.manor?.daggerLights === true ? ["dagger-lamp-shot"] : [];
}

/** 올가미 투척 대상. 단도 자동 조준과 같은 전방·같은 층·사선 규칙에 더 짧은 사거리를 쓴다. */
export function snareThrowTarget(
  ctx: Pick<MischiefContext, "at" | "facing" | "floor">,
  guards: readonly GuardState[],
  layout: MansionLayout,
  tuning: Tuning,
): GuardState | null {
  return forwardGuardTarget(ctx, guards, layout, tuning, SNARE_THROW_RANGE_PX);
}

/** 와이어 당기기·킥 대상. 실크 와이어 사거리 안의 전방 경비. 조준 미리보기도 이 함수를 쓴다. */
export function wireGuardTarget(
  ctx: Pick<MischiefContext, "at" | "facing" | "floor">,
  guards: readonly GuardState[],
  layout: MansionLayout,
  tuning: Tuning,
): GuardState | null {
  return forwardGuardTarget(ctx, guards, layout, tuning, WIRE_MAX_RANGE_PX);
}

/** 전방·같은 층·사선이 트인 가장 가까운 활동 경비. 개조 투척 조준이 공유한다. */
function forwardGuardTarget(
  ctx: Pick<MischiefContext, "at" | "facing" | "floor">,
  guards: readonly GuardState[],
  layout: MansionLayout,
  tuning: Tuning,
  rangePx: number,
): GuardState | null {
  const origin = { x: ctx.at.x, y: LineOfFireRules.originY(ctx.at.y, tuning) };
  return guards
    .filter((guard) => {
      if (!weaponModTargetable(guard) || guard.staggerMs > 0 || guard.floor !== ctx.floor) return false;
      const forward = (guard.x - ctx.at.x) * ctx.facing;
      if (forward <= 0 || forward > rangePx) return false;
      return LineOfFireRules.trace(origin, { x: guard.x, y: LineOfFireRules.originY(guard.y, tuning) }, layout).clear;
    })
    .sort((a, b) => Math.abs(a.x - ctx.at.x) - Math.abs(b.x - ctx.at.x))[0] ?? null;
}

/**
 * 무기 개조가 직접 움직이거나 넘어뜨리거나 빈틈을 열 수 있는 경비인가. 공개 결투의 보스는 제외한다 —
 * 개조가 보스 페이즈·열쇠 탈취를 건너뛰지 않는다는 계획 계약이다(반격 단도는 완벽 회피의 반격이라 예외).
 */
export function weaponModTargetable(guard: GuardState): boolean {
  return GuardStatusRules.canBeCombatTarget(guard) && !isEncounterBoss(guard.id);
}

/** 연막 한 개를 그 자리에 편다. 투척 착탄과 연막 탈출이 같은 구름·사건을 쓴다. */
export function deploySmoke(
  state: MischiefState,
  at: Vec2,
  floor: number,
): { readonly state: MischiefState; readonly events: readonly SimEvent[] } {
  const smokeId = state.nextSmokeId;
  return {
    state: {
      ...state,
      nextSmokeId: smokeId + 1,
      smokeClouds: [...state.smokeClouds, { id: smokeId, at: { ...at }, floor, radius: SMOKE_RADIUS_PX, remainingMs: SMOKE_DURATION_MS }],
    },
    events: [{ kind: "SmokeDeployed", smokeId, at: { ...at }, radius: SMOKE_RADIUS_PX }],
  };
}

/** 이 점이 내가 편 연막 구름 안인가. 장막 걸음·눈물 연막이 같은 원을 쓴다. */
export function insideSmoke(state: Pick<MischiefState, "smokeClouds">, at: Vec2, floor: number): boolean {
  return state.smokeClouds.some((cloud) => cloud.floor === floor
    && Math.hypot(cloud.at.x - at.x, cloud.at.y - at.y) <= cloud.radius);
}

/**
 * 눈물 연막: 구름 안에서 공격을 준비하던 경비는 준비가 끊기고 짧게 휘청이며 무기 빈틈을 연다.
 * 판정 원은 `insideSmoke`(몸통 높이 기준)다.
 */
export function applyTearGas(
  state: MischiefState,
  guards: readonly GuardState[],
  layout: Pick<MansionLayout, "toolMods">,
  tuning: Tuning,
): { readonly guards: readonly GuardState[]; readonly events: readonly SimEvent[] } {
  if (!hasWeaponMod(layout, "smoke-tear-gas") || state.smokeClouds.length === 0) return { guards, events: [] };
  const events: SimEvent[] = [];
  const next = guards.map((guard) => {
    if (guard.combat === null || guard.combat.phase !== "windup" || !weaponModTargetable(guard)) return guard;
    const torso = { x: guard.x, y: guard.y - tuning.movement.bodyHeightStand / 2 };
    if (!insideSmoke(state, torso, guard.floor)) return guard;
    events.push({ kind: "WeaponModTriggered", mod: "smoke-tear-gas", at: { x: guard.x, y: guard.y }, guardId: guard.id });
    return GuardStatusRules.haltGuardMovement({
      ...guard,
      combat: CombatRules.enterCombatPhase(guard.combat, "cooldown", { attackFacing: null }),
      mode: transitionGuardMode(guard.mode, { kind: "staggered" }),
      staggerMs: Math.max(guard.staggerMs, TEAR_GAS_STAGGER_MS),
      toolOpeningMs: TEAR_GAS_STAGGER_MS,
    });
  });
  return events.length === 0 ? { guards, events } : { guards: next, events };
}

/**
 * 딱총 유인구: 유인구를 확인하러 멈춰 선 경비 발밑에서 터져 휘청이게 하고 무기 빈틈을 연다.
 * 터진 유인구는 사라진다.
 */
export function triggerFirecrackers(
  state: MischiefState,
  guards: readonly GuardState[],
  layout: Pick<MansionLayout, "toolMods">,
): { readonly state: MischiefState; readonly guards: readonly GuardState[]; readonly events: readonly SimEvent[] } {
  if (!hasWeaponMod(layout, "mouse-firecracker") || state.mice.length === 0) return { state, guards, events: [] };
  const popped = new Set<number>();
  const events: SimEvent[] = [];
  const next = guards.map((guard) => {
    if (!guard.lureInspection.started || guard.staggerMs > 0 || !weaponModTargetable(guard)) return guard;
    const mouse = state.mice.find((candidate) => !popped.has(candidate.id)
      && candidate.floor === guard.floor && Math.abs(candidate.x - guard.x) <= FIRECRACKER_TRIGGER_PX);
    if (mouse === undefined) return guard;
    popped.add(mouse.id);
    const at = { x: mouse.x, y: mouse.y };
    events.push(
      { kind: "ClockworkMouseStopped", mouseId: mouse.id, at },
      { kind: "WeaponModTriggered", mod: "mouse-firecracker", at, guardId: guard.id },
      { kind: "NoiseEmitted", at, floor: mouse.floor, radius: FIRECRACKER_NOISE_RADIUS_PX, source: "prop" },
    );
    return GuardStatusRules.haltGuardMovement({
      ...guard,
      mode: transitionGuardMode(guard.mode, { kind: "staggered" }),
      staggerMs: Math.max(guard.staggerMs, FIRECRACKER_STAGGER_MS),
      toolOpeningMs: FIRECRACKER_STAGGER_MS,
      contactMs: 0,
    });
  });
  if (popped.size === 0) return { state, guards, events };
  return { state: { ...state, mice: state.mice.filter((mouse) => !popped.has(mouse.id)) }, guards: next, events };
}

/** Opt-in keeps legacy maps/replays unchanged. The displayed target is the fired target — 미리보기(괴도의 눈)와 발사가 이 함수 하나를 쓴다. */
export function daggerLampTarget(
  ctx: Pick<MischiefContext, "at" | "facing" | "floor">,
  snuffedLamps: readonly string[],
  layout: MansionLayout,
  tuning: Tuning,
) {
  if (!daggerLightsEnabled(layout)) return null;
  const origin = { x: ctx.at.x, y: LineOfFireRules.originY(ctx.at.y, tuning) };
  return layout.lamps.filter(lamp => lamp.snuffable && !snuffedLamps.includes(lamp.id)
    && Math.floor(lamp.at.y / tuning.world.floorHeightPx) === ctx.floor
    && (lamp.at.x - ctx.at.x) * ctx.facing > 0
    && Math.hypot(lamp.at.x - origin.x, lamp.at.y - origin.y) <= tuning.mischief.throwSpeed
    && LineOfFireRules.trace(origin, lamp.at, layout).clear)
    .sort((a, b) => Math.hypot(a.at.x - origin.x, a.at.y - origin.y) - Math.hypot(b.at.x - origin.x, b.at.y - origin.y))[0] ?? null;
}

function launchDagger(
  ctx: MischiefContext,
  target: GuardState | null,
  tuning: Tuning,
  power: number,
  lamp: MansionLayout["lamps"][number] | null = null,
): Omit<Projectile, "id"> {
  const from = { x: ctx.at.x, y: LineOfFireRules.originY(ctx.at.y, tuning) };
  const to = lamp?.at ?? (target === null
    ? { x: from.x + ctx.facing, y: from.y }
    : { x: target.x, y: LineOfFireRules.originY(target.y, tuning) });
  const length = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
  const speed = tuning.mischief.throwSpeed * (1.25 + power * 0.25);
  return {
    ...from,
    vx: (to.x - from.x) / length * speed,
    vy: (to.y - from.y) / length * speed,
    floor: ctx.floor,
    tool: "dagger",
    ...(target === null ? {} : { targetGuardId: target.id }),
    ...(lamp === null ? {} : { targetLampId: lamp.id }),
  };
}

/** 한 스텝 전진. 반드시 예고와 실제가 같은 함수를 통과해야 한다. */
function advance(p: Projectile, tuning: Tuning, dtMs: number): Projectile {
  const dt = dtMs / 1000;
  if (p.tool === "dagger") {
    return { ...p, x: p.x + p.vx * dt, y: p.y + p.vy * dt };
  }
  const vy = p.vy + tuning.mischief.throwGravity * dt;
  return { ...p, x: p.x + p.vx * dt, y: p.y + vy * dt, vy };
}

/**
 * 지금 던지면 어디에 떨어지는가.
 *
 * 투척은 유인 동사고, 유인은 소음이 **어디에** 나는지 보이지 않으면 도박이다.
 * Q 를 누르고 있는 동안 이 궤적이 자라는 것을 보고 놓을 때를 정한다 —
 * 세기 조절은 숫자가 아니라 이 그림으로 가르친다.
 */
export function predictThrow(
  ctx: MischiefContext,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
  power = 1,
): { path: readonly Vec2[]; landing: Vec2 | null } {
  const solids = solidRects(layout);
  const path: Vec2[] = [];
  let p: Projectile = { id: 0, ...launch(ctx, tuning, power) };

  for (let i = 0; i < 240; i += 1) {
    path.push({ x: p.x, y: p.y });
    p = advance(p, tuning, dtMs);
    if (p.x < 0 || p.x > layout.widthPx || solids.some((rect) => rectContains(rect, { x: p.x, y: p.y }))) {
      return { path, landing: { x: p.x, y: p.y } };
    }
  }
  return { path, landing: null };
}

/** 수동 단도도 실제 발사와 같은 무중력 수평 직선으로 벽·경계까지 예고한다. */
export function predictDaggerThrow(
  ctx: MischiefContext,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
  power = 1,
): { path: readonly Vec2[]; landing: Vec2 | null } {
  const solids = solidRects(layout);
  const path: Vec2[] = [];
  let p: Projectile = { id: 0, ...launchDagger(ctx, null, tuning, power) };

  for (let i = 0; i < 240; i += 1) {
    path.push({ x: p.x, y: p.y });
    p = advance(p, tuning, dtMs);
    if (p.x < 0 || p.x > layout.widthPx || solids.some((rect) => rectContains(rect, { x: p.x, y: p.y }))) {
      return { path, landing: { x: p.x, y: p.y } };
    }
  }
  return { path, landing: null };
}

/** 투척물 비행과 착탄. 단도는 직선, 연막·유인구는 포물선이며 벽·경계에 닿으면 사라진다. */
function stepProjectiles(
  projectiles: readonly Projectile[],
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
  snuffedLamps: readonly string[],
): { projectiles: Projectile[]; events: SimEvent[]; impacts: ProjectileImpact[] } {
  if (projectiles.length === 0) return { projectiles: [], events: [], impacts: [] };

  const solids = solidRects(layout);
  const alive: Projectile[] = [];
  const events: SimEvent[] = [];
  const impacts: ProjectileImpact[] = [];

  for (const p of projectiles) {
    const moved = advance(p, tuning, dtMs);
    const lamp = daggerLightsEnabled(layout) && p.targetLampId !== undefined
      ? layout.lamps.find(entry => entry.id === p.targetLampId && entry.snuffable) : undefined;
    if (lamp !== undefined && segmentIntersectsCircle(p, moved, { at: lamp.at, radius: 5 })
      && LineOfFireRules.trace(p, lamp.at, layout).clear) {
      if (!snuffedLamps.includes(lamp.id) && !events.some(event => event.kind === "LampSnuffed" && event.lampId === lamp.id)) {
        events.push({ kind: "LampSnuffed", lampId: lamp.id, at: lamp.at },
          { kind: "NoiseEmitted", at: lamp.at, floor: p.floor, radius: tuning.noise.throwRadius, source: "throw" });
        // 블랙손 레이아웃이 켠 소등은 개조가 아니다 — 개조로 연 저택에서만 개조 서명을 낸다.
        if (layout.manor?.daggerLights !== true && hasWeaponMod(layout, "dagger-lamp-shot")) {
          events.push({ kind: "WeaponModTriggered", mod: "dagger-lamp-shot", at: lamp.at });
        }
      }
      continue;
    }
    const focusedProjectile = p.targetLampId !== undefined;
    const flightLayout = focusedProjectile ? layout : { ...layout, geometry: layout.geometry.filter(g => g.kind === "solid") };
    const sweptDaggerHit = (focusedProjectile || Boolean(layout.physicsProps?.length))
      && p.tool === "dagger" && !LineOfFireRules.trace(p, moved, flightLayout).clear;
    const hit =
      moved.x < 0 ||
      moved.x > layout.widthPx ||
      solids.some((rect) => rectContains(rect, { x: moved.x, y: moved.y }))
      || sweptDaggerHit;

    if (hit) {
      const at = { x: moved.x, y: moved.y };
      const tool = p.tool;
      // 단도가 바닥 유인으로 오해되지 않게 한다. 연막만 기존의 작은 착탄음을 유지하고,
      // 유인구는 착탄 처리에서 전용 mouse 소음을 한 번 낸다.
      if (tool === "smoke") {
        events.push({
          kind: "NoiseEmitted",
          at,
          floor: Math.floor(at.y / tuning.world.floorHeightPx),
          radius: tuning.noise.throwRadius,
          source: "throw",
        });
      }
      // 울림 날: 빗나가 떨어진 단도가 작은 유인이 된다. 경비에게 맞은 단도는 여기 오지 않는다.
      if (tool === "dagger" && hasWeaponMod(layout, "dagger-ringing-blade")) {
        events.push(
          {
            kind: "NoiseEmitted",
            at,
            floor: Math.floor(at.y / tuning.world.floorHeightPx),
            radius: RINGING_BLADE_NOISE_RADIUS_PX,
            source: "throw",
            lure: true,
          },
          { kind: "WeaponModTriggered", mod: "dagger-ringing-blade", at },
        );
      }
      impacts.push({ at, facing: p.vx >= 0 ? 1 : -1, tool });
      continue;
    }
    alive.push(moved);
  }
  return { projectiles: alive, events, impacts };
}

export function selectedToolOf(state: MischiefState): ToolId {
  return state.toolLoadout[state.selectedToolIndex];
}

export function ammoOf(state: MischiefState, tool: ToolId): number {
  if (tool === "dagger") return state.throwAmmo;
  if (tool === "smoke") return state.smokeAmmo;
  if (tool === "mouse") return state.mouseAmmo;
  if (tool === "wire") return state.wireAmmo;
  if (tool === "mask") return state.maskAmmo;
  return state.snareAmmo;
}

/** 쇼타임 완성 보상. 선택한 도구만 가득 채워 브리핑 선택의 의미를 보존한다. */
export function refillEquippedTools(state: MischiefState, tuning: Tuning): MischiefState {
  const equipped = new Set<ToolId>(state.toolLoadout);
  return {
    ...state,
    throwAmmo: equipped.has("dagger") ? tuning.mischief.throwAmmo : state.throwAmmo,
    smokeAmmo: equipped.has("smoke") ? TOOL_START_CHARGES : state.smokeAmmo,
    mouseAmmo: equipped.has("mouse") ? TOOL_START_CHARGES : state.mouseAmmo,
    wireAmmo: equipped.has("wire") ? TOOL_START_CHARGES : state.wireAmmo,
    maskAmmo: equipped.has("mask") ? TOOL_START_CHARGES : state.maskAmmo,
    snareAmmo: equipped.has("snare") ? TOOL_START_CHARGES : state.snareAmmo,
    eyeMs: tuning.mischief.eyeMaxMs,
  };
}

function spendAmmo(state: MischiefState, tool: ToolId): MischiefState {
  if (tool === "dagger") return { ...state, throwAmmo: Math.max(0, state.throwAmmo - 1) };
  if (tool === "smoke") return { ...state, smokeAmmo: Math.max(0, state.smokeAmmo - 1) };
  if (tool === "mouse") return { ...state, mouseAmmo: Math.max(0, state.mouseAmmo - 1) };
  if (tool === "wire") return { ...state, wireAmmo: Math.max(0, state.wireAmmo - 1) };
  if (tool === "mask") return { ...state, maskAmmo: Math.max(0, state.maskAmmo - 1) };
  return { ...state, snareAmmo: Math.max(0, state.snareAmmo - 1) };
}

/**
 * 경비 이동이 끝난 좌표로 올가미를 한 번만 발동한다. 판정 반경과 화면은 snare.radius를 공유한다.
 *
 * 개조: `snare-throw`가 있으면 넘어진 경비에게 `tool` 빈틈(`GuardState.toolOpeningMs`)이 열리고,
 * `snare-chain`은 넘어진 경비 옆의 경비를 차례로 함께 넘어뜨린다. `snare-alarm`은 발동 위치를
 * 사건으로 알려 괴도의 눈 핑이 소비한다.
 */
export function triggerRibbonSnares(
  state: MischiefState,
  guards: readonly GuardState[],
  layout: Pick<MansionLayout, "toolMods"> = {},
): { readonly state: MischiefState; readonly guards: readonly GuardState[]; readonly events: readonly SimEvent[] } {
  const consumed = new Set<number>();
  const events: SimEvent[] = [];
  const opening = hasWeaponMod(layout, "snare-throw");
  const knockDown = (guard: GuardState): GuardState => GuardStatusRules.haltGuardMovement({
    ...guard,
    mode: transitionGuardMode(guard.mode, { kind: "staggered" }),
    staggerMs: Math.max(guard.staggerMs, RIBBON_SNARE_STAGGER_MS),
    contactMs: 0,
    ...(opening && !isEncounterBoss(guard.id) ? { toolOpeningMs: RIBBON_SNARE_STAGGER_MS } : {}),
  });
  const downedIds: string[] = [];
  let nextGuards = guards.map((guard) => {
    if (guard.knockedOut || guard.combat?.defeated === true || guard.staggerMs > 0) return guard;
    const snare = state.snares.find((candidate) =>
      !consumed.has(candidate.id)
      && candidate.floor === guard.floor
      && Math.abs(candidate.at.x - guard.x) <= candidate.radius
      && Math.abs(candidate.at.y - guard.y) <= candidate.radius,
    );
    if (snare === undefined) return guard;
    consumed.add(snare.id);
    downedIds.push(guard.id);
    events.push(
      { kind: "RibbonSnareTriggered", snareId: snare.id, guardId: guard.id, at: snare.at },
      {
        kind: "NoiseEmitted",
        at: snare.at,
        floor: snare.floor,
        radius: RIBBON_SNARE_NOISE_RADIUS_PX,
        source: "prop",
      },
    );
    if (hasWeaponMod(layout, "snare-alarm")) {
      events.push({ kind: "WeaponModTriggered", mod: "snare-alarm", at: snare.at, guardId: guard.id });
    }
    return knockDown(guard);
  });
  if (consumed.size === 0) return { state, guards, events };
  if (hasWeaponMod(layout, "snare-chain")) {
    // 넘어진 순서대로 옆 경비를 넘어뜨린다. 한 경비는 한 번만 넘어지고 연쇄는 계속 번진다.
    const queue = [...downedIds];
    while (queue.length > 0) {
      const sourceId = queue.shift();
      const source = nextGuards.find((guard) => guard.id === sourceId);
      if (source === undefined) continue;
      nextGuards = nextGuards.map((guard) => {
        if (downedIds.includes(guard.id) || guard.floor !== source.floor || guard.staggerMs > 0) return guard;
        if (!weaponModTargetable(guard) || Math.abs(guard.x - source.x) > SNARE_CHAIN_REACH_PX) return guard;
        downedIds.push(guard.id);
        queue.push(guard.id);
        events.push({ kind: "WeaponModTriggered", mod: "snare-chain", at: { x: guard.x, y: guard.y }, guardId: guard.id, facing: guard.x >= source.x ? 1 : -1 });
        return knockDown(guard);
      });
    }
  }
  return {
    state: { ...state, snares: state.snares.filter((snare) => !consumed.has(snare.id)) },
    guards: nextGuards,
    events,
  };
}

/** 발각 같은 후속 판정도 같은 파기·소음 계약을 사용한다. */
export function breakDisguise(
  state: MischiefState,
  reason: DisguiseBreakReason,
  at: Vec2,
  floor: number,
): { readonly state: MischiefState; readonly events: readonly SimEvent[] } {
  if (state.disguiseMs <= 0) return { state, events: [] };
  return {
    state: { ...state, disguiseMs: 0 },
    events: [
      { kind: "DisguiseBroken", at, reason },
      {
        kind: "NoiseEmitted",
        at,
        floor,
        radius: DISGUISE_BREAK_NOISE_RADIUS_PX,
        source: "disguise",
      },
    ],
  };
}

function disguiseBreakReason(
  input: InputFrame,
  ctx: MischiefContext,
  selectingTool: boolean,
  crowdCover = false,
): DisguiseBreakReason | null {
  if (selectingTool) return "changed-tool";
  if (input.attack || input.heavy || input.snuffHold || input.whistle) {
    return "suspicious-action";
  }
  // 군중 속 가면: 손님 사이를 비집는 동안에는 달려도 손님 무리의 움직임으로 읽힌다.
  if (ctx.running === true && !crowdCover) return "ran";
  const composed = crowdCover && ctx.running === true ? ctx.composedIgnoringRun ?? ctx.sociallyComposed : ctx.sociallyComposed;
  if (composed === false) return "left-floor";
  return null;
}

function advanceSmoke(
  clouds: readonly SmokeCloud[],
  dtMs: number,
): { readonly clouds: readonly SmokeCloud[]; readonly events: readonly SimEvent[] } {
  const alive: SmokeCloud[] = [];
  const events: SimEvent[] = [];
  for (const cloud of clouds) {
    const remainingMs = Math.max(0, cloud.remainingMs - dtMs);
    if (remainingMs === 0) events.push({ kind: "SmokeCleared", smokeId: cloud.id, at: cloud.at });
    else alive.push({ ...cloud, remainingMs });
  }
  return { clouds: alive, events };
}

function advanceSnares(
  snares: readonly RibbonSnare[],
  dtMs: number,
): { readonly snares: readonly RibbonSnare[]; readonly events: readonly SimEvent[] } {
  const alive: RibbonSnare[] = [];
  const events: SimEvent[] = [];
  for (const snare of snares) {
    const remainingMs = Math.max(0, snare.remainingMs - dtMs);
    if (remainingMs === 0) events.push({ kind: "RibbonSnareExpired", snareId: snare.id, at: snare.at });
    else alive.push({ ...snare, remainingMs });
  }
  return { snares: alive, events };
}

function advanceMice(
  mice: readonly ClockworkMouse[],
  dtMs: number,
  layout: MansionLayout,
  tuning: Tuning,
): { readonly mice: readonly ClockworkMouse[]; readonly events: readonly SimEvent[] } {
  const alive: ClockworkMouse[] = [];
  const events: SimEvent[] = [];
  const runaway = hasWeaponMod(layout, "mouse-runaway");
  for (const mouse of mice) {
    const remainingMs = Math.max(0, mouse.remainingMs - dtMs);
    if (remainingMs === 0) {
      events.push({ kind: "ClockworkMouseStopped", mouseId: mouse.id, at: { x: mouse.x, y: mouse.y } });
      continue;
    }
    if (!runaway) {
      alive.push({ ...mouse, remainingMs });
      continue;
    }
    // 도망 태엽: 바닥을 따라 굴러가다 벽에 막히면 되돌아오고, 일정 간격으로 다시 울어 경비를 끌고 간다.
    // 착탄 좌표는 바닥판 안쪽일 수 있다. 구르기는 그 층의 걷는 바닥면을 따라간다.
    const floorY = floorSurfaceY(mouse.floor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx);
    const intended = mouse.facing * RUNAWAY_SPEED_PX_PER_SEC * dtMs / 1000;
    const moved = displaceHorizontally({
      fromX: mouse.x, deltaX: intended, feetY: floorY, halfWidth: 6, bodyHeight: 10, stayGrounded: true,
    }, layout);
    const blocked = Math.abs(moved.x - mouse.x) + 0.001 < Math.abs(intended);
    const facing: -1 | 1 = blocked ? (mouse.facing === 1 ? -1 : 1) : mouse.facing;
    let chirpMs = mouse.chirpMs - dtMs;
    const rolled = { ...mouse, x: moved.x, facing, remainingMs };
    if (chirpMs <= 0) {
      chirpMs += RUNAWAY_CHIRP_MS;
      const at = { x: rolled.x, y: rolled.y };
      events.push(
        { kind: "ClockworkMouseChirped", mouseId: mouse.id, at },
        { kind: "NoiseEmitted", at, floor: mouse.floor, radius: mouseNoiseRadius(layout), source: "mouse" },
        { kind: "WeaponModTriggered", mod: "mouse-runaway", at, facing },
      );
    }
    alive.push({ ...rolled, chirpMs });
  }
  return { mice: alive, events };
}
