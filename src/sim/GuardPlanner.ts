import type { Facing, SimEvent, SuspicionTier, Vec2 } from "./types";
import type { GuardSpawn, MansionLayout, VerticalLink } from "./MansionLayout";
import { floorOfY, floorSurfaceY, ladderFloors, sharesSnuffedLampDarkness } from "./MansionLayout";
import type { GuardArchetype, GuardArchetypeId } from "./GuardArchetypes";
import { archetypeOf, readablePatrolDwellMs } from "./GuardArchetypes";
import type { CombatState } from "./CombatRules";
import * as CombatRules from "./CombatRules";
import type { SuspicionState } from "./SuspicionRules";
import * as SuspicionRules from "./SuspicionRules";
import type { Observer } from "./VisionRules";
import * as VisionRules from "./VisionRules";
import type { GuardTargetSnapshot } from "./GuardTargetRules";
import * as GuardTargetRules from "./GuardTargetRules";
import type { NoiseEvent } from "./NoisePlanner";
import { listen } from "./NoisePlanner";
import type { Tuning } from "./tuning";
import type { LockdownPressure } from "./RunRules";
import { NO_LOCKDOWN_PRESSURE } from "./RunRules";
import { clamp, onSameFloor } from "./geom";
import { originY as lineOfFireOriginY, trace as traceLineOfFire } from "./LineOfFireRules";
import type { CrowdState } from "./CrowdRules";
import { sightBlockers as crowdSightBlockers } from "./CrowdRules";
import * as GuardStatusRules from "./GuardStatusRules";
import { foolsGuard as disguiseFoolsGuard } from "./DisguiseRules";
import { clampGuardXAtPlayerContact } from "./ActorContactRules";
import type { GuardMode } from "./GuardStateMachine";
import { guardModeAllowsTranslation, transitionGuardMode } from "./GuardStateMachine";
import { behaviorModifiersOf, type GuardBehaviorPolicy } from "./GuardBehaviorRules";
import { guaranteedOpeningActive as wardenGuaranteedOpeningActive } from "./WardenRules";
import { decayPoise, type GuardPoise } from "./StaggerResistanceRules";

/**
 * 경비 한 명의 전체 스텝: 지각 → 의심 → 의도 → 이동.
 *
 * 평시 순찰은 자기 층에 가두되, 발각 추격은 `guardUsable` 사다리로 인접 층을 따라간다.
 * 수직 이동도 이 상태가 소유해야 플레이어가 사다리를 탄 뒤 경비 좌표는 멈췄는데
 * 달리기 애니메이션만 도는 모순이 생기지 않는다.
 */

export type { GuardMode } from "./GuardStateMachine";

export interface GuardState {
  readonly id: string;
  readonly archetypeId: GuardArchetypeId;
  /** 다음 구간을 위한 사전 배치 배우. 렌더만 하며 현재 sim 판정에는 참여하지 않는다. */
  readonly previewOnly?: boolean;
  /** 초대 제작자의 자유 문장에서 검증된 값만 남긴 결정론 정책. */
  readonly behaviorPolicy?: GuardBehaviorPolicy;
  readonly floor: number;
  readonly x: number;
  readonly y: number;
  /** 추격 중 현재 타고 있는 경비 사용 가능 사다리. */
  readonly climbLinkId: string | null;
  /** 이번 고정 스텝에서 실제 좌표가 변했는가. 렌더가 AI mode를 이동으로 오해하지 않게 한다. */
  readonly moving: boolean;
  readonly facing: Facing;
  readonly mode: GuardMode;
  readonly susp: SuspicionState;
  /** 순찰 웨이포인트 인덱스. */
  readonly routeIndex: number;
  /** 웨이포인트 대기 잔여 시간. */
  readonly dwellMs: number;
  /** 현재 대기 끝에 실제 방향 반전이 예정되어 있는가. HUD의 회전 경고와 같은 사실을 소유한다. */
  readonly turnPending: boolean;
  /** 튜토리얼 반장의 읽을 수 있는 빈틈에서 안전 통과를 보장하는가. */
  readonly openingPassEnabled?: boolean;
  /** 유인구 착탄점 현장 확인. 순찰 dwellMs와 섞지 않는다. */
  readonly lureInspection: LureInspection;
  /** 제자리 스캔 주기 누산. */
  readonly sinceScanMs: number;
  readonly scanMs: number;
  /** 수색 지점 목록과 현재 확인 중인 지점의 잔여 시간. */
  readonly searchTargets: readonly number[];
  readonly searchDwellMs: number;
  /** 마지막 자극 위치 확인을 마쳤는가. 새 시야·소음 자극을 받으면 다시 false가 된다. */
  readonly investigationComplete: boolean;
  /** 각성 후 경계 순찰 잔여 시간. */
  readonly alertPatrolMs: number;
  /** 몸 접촉으로 시작된 제압 시도 누적 시간. captureHoldMs 를 넘기면 포박. */
  readonly contactMs: number;
  /** 소등 그림자의 포복 통과 정지. */
  readonly darkCrawl: DarkCrawlPause;
  /** 은신 진입을 목격했는가. 목격했다면 그 은신처를 열러 온다. */
  readonly sawHideSpotId: string | null;
  /** 일시 경직. knockout과 combat.defeated는 별도의 명시적 상태다. */
  readonly staggerMs: number;
  /** 왁스 계약의 실제 자동 전도로 생긴 경직 잔여 시간. 다른 경직과 성과 provenance를 분리한다. */
  readonly contractTripMs: number;
  /**
   * 무기 개조가 연 빈틈(`CombatOpportunity "tool"`)의 남은 시간. 경직과 함께만 유효하다
   * (`CombatRules.hasToolOpening`). 개조 없는 런에서는 0 으로 남는다.
   */
  readonly toolOpeningMs: number;
  /** 경직 저항. `StaggerResistanceRules` 가 소유한다. */
  readonly poise: GuardPoise;
  /** 무력화되어 쓰러져 있는가. 지각도 이동도 하지 않고, 몸이 증거로 남는다. */
  readonly knockedOut: boolean;
  /** 기상까지 남은 시간. knockedOut일 때만 양수다. */
  readonly knockoutMs: number;
  /** 기상했거나 쓰러진 동료를 발견해 alert 아래로는 내려가지 않는가. */
  readonly permanentAlert: boolean;
  /** 전투 가능한 상대만 갖는다. */
  readonly combat: CombatState | null;
}

/**
 * 유인구 착탄점 현장 확인. 세 값은 언제나 함께 정해지고 함께 비워진다 — 지각(새 자극), 조사 계획,
 * 추격 해제·기상·저택 경보가 모두 셋을 한 번에 쓴다.
 */
export interface LureInspection {
  /** 착탄점에서만 소비하는 현장 확인 시간. */
  readonly dwellMs: number;
  /** 유인구를 처음 들은 쪽에서 착탄점을 바라보는 방향. 확인 중이 아니면 null. */
  readonly facing: Facing | null;
  /** 착탄점 앞 정지 위치에 도착해 5초 확인 시계를 실제로 시작했는가. */
  readonly started: boolean;
}

/** 확인할 유인구가 없는 상태. */
function idleLureInspection(): LureInspection {
  return { dwellMs: 0, facing: null, started: false };
}

/** 포복 통과 정지. `step` 의 한 블록이 둘을 함께 계산해 함께 쓴다. */
export interface DarkCrawlPause {
  /** 소등 그림자에서 포복 플레이어를 지나가게 하며 제자리를 지키는 잔여 시간. */
  readonly pauseMs: number;
  /** 한 번의 근접 포복에서 정지 창을 이미 소비했는가. 겹침이 끝난 뒤에만 다시 무장한다. */
  readonly latched: boolean;
}

export interface GuardStepInput {
  readonly target: GuardTargetSnapshot;
  readonly noises: readonly NoiseEvent[];
  /** 다른 경비가 전파한 의심량. */
  readonly propagated: number;
  /** 현재 바닥에 남아 있는 유인구. undefined는 이전 직접 호출과 리플레이의 존재 검사 생략이다. */
  readonly activeLures?: readonly {
    readonly at: Vec2;
    readonly floor: number;
  }[];
  /** 플레이어가 꺼 버린 등. 그 반경이 어둠이 되어 노출도를 낮춘다. */
  readonly snuffedLamps?: readonly string[];
  /** 쓰러져 있는 동료들의 위치. 보이면 즉시 경계로 올라간다. */
  readonly bodies?: readonly Vec2[];
  /** 뒤에서 홀드 상호작용 중인 경비. 소매치기·무력화 도중 걷거나 돌아서지 않는다. */
  readonly heldInteractionId?: string | null;
  /** 이 경비가 현재 플레이어를 붙잡고 발버둥을 막고 있는가. */
  readonly holdingTarget?: boolean;
  /** 다수전 공격권. false여도 추격은 계속하고 ready에서 새 공격만 시작하지 않는다. */
  readonly canStartAttack?: boolean;
  /** 공격권 대기 중 추격할 포위 슬롯. 전투 판정의 실제 target과는 분리한다. */
  readonly combatPressureX?: number;
  /** 탐지는 하지 않지만 경비와 플레이어 사이에서 시야를 가리는 군중. */
  readonly crowds?: readonly CrowdState[];
  /** 연막처럼 이번 스텝에만 존재하는 실제 시야 차폐. */
  readonly dynamicSightBlockers?: readonly import("./VisionRules").SightBlocker[];
  /** 봉쇄가 주는 시야·속도 압박. 생략하면 평상시다. */
  readonly lockdownPressure?: LockdownPressure;
  /** 무도회 가면이 활성화되어 있다. 적용 여부는 경비의 현재 경계 단계가 결정한다. */
  readonly disguiseActive?: boolean;
  readonly receptionGuest?: boolean;
  /**
   * 경매장 무대 뒤 직원의 박자. `watch`는 무대를 보는 자리로, `check`는 창이 닫힌 직후 진열장을 확인하는
   * 자리로 서둘러 간다. `GuardSpawn.stageWatch`가 있는 평온한 직원만 반응한다.
   */
  readonly stageDuty?: "watch" | "check";
  /** 플레이어 몸이 이번 스텝에 처음 닿은 위치. 몸으로 확인한 순간은 즉시 발각으로 올린다. */
  readonly bodyContactAt?: Vec2;
  /** 물리 접촉과 같은 SSOT가 허용한 포박 접촉인가. 생략하면 일반 접촉으로 본다. */
  readonly bodyContactAllowed?: boolean;
  /**
   * 같은 스텝의 공격권 선점이 이 경비에 대해 이미 계산한 시각 지각(`perceiveVisual`). 시야 표본은 경비 스텝에서
   * 가장 비싼 일이라 두 번 하지 않는다. 지각은 포즈 감쇠(`decayPoise`)가 바꾸는 필드를 읽지 않으므로 스텝 시작
   * 경비로 계산한 값을 그대로 쓴다. 생략하면 여기서 계산한다.
   */
  readonly visualPerception?: GuardVisualPerception;
}

/**
 * 경비 한 명의 한 스텝 동안 바뀌지 않는 입력 묶음.
 *
 * 계획 단계의 함수들이 같은 여섯 값을 서로에게 손으로 넘기면 인자 순서 자체가 계약이 되어,
 * 한 자리만 밀려도 타입이 같은 다른 값이 조용히 들어간다. 스텝 내내 고정인 값은 이 컨텍스트가
 * 소유하고, 호출마다 달라지는 목표·모드·속도만 인자로 남긴다.
 */
export interface GuardStepContext {
  /** 이번 스텝에 이 경비가 받은 지각·전투·접촉 입력. */
  readonly input: GuardStepInput;
  /** 이 경비의 배치 정의. 순찰 경로와 대기 시간의 원본이다. */
  readonly spawn: GuardSpawn;
  /** `guard.archetypeId` 에서 한 번만 조회한 콘텐츠 표. */
  readonly archetype: GuardArchetype;
  readonly layout: MansionLayout;
  readonly tuning: Tuning;
  readonly dtMs: number;
}

/** 추격 계획 한 번의 호출마다 달라지는 값. 컨텍스트와 섞지 않는다. */
interface ChaseIntent {
  readonly trackedTarget: Vec2;
  readonly targetVisible: boolean;
  readonly speed: number;
  readonly mode: "chase" | "recapture-chase";
}

/** 사다리 한 구간의 목표. 어느 사다리를 어느 층까지 어떤 의도로 타는가. */
interface LadderRide {
  readonly ladder: VerticalLink;
  readonly targetFloor: number;
  readonly mode: GuardMode;
  readonly ladderX: number;
}

export type GuardVisionInput = Pick<
  GuardStepInput,
  "target" | "snuffedLamps" | "crowds" | "dynamicSightBlockers" | "lockdownPressure" | "disguiseActive" | "receptionGuest"
>;

export interface GuardVisualPerception {
  readonly pressure: LockdownPressure;
  readonly observer: Observer;
  readonly vision: VisionRules.VisionSample;
  readonly hideEntryVision: VisionRules.VisionSample | null;
  readonly visualTarget: VisionRules.VisionTarget;
  readonly visualExposure: number;
  readonly sightBlockers: readonly VisionRules.SightBlocker[];
}

export interface GuardStepResult {
  readonly guard: GuardState;
  readonly events: readonly SimEvent[];
  /** 이번 스텝의 노출도. 렌더와 전파 계산이 함께 쓴다. */
  readonly exposure: number;
  /** 포박이 성립했는가. */
  readonly captured: boolean;
  /** 곤봉이 플레이어를 맞췄는가. 피격은 포박과 같은 실패 사다리를 탄다. */
  readonly struckPlayer: boolean;
}

export function createGuard(spawn: GuardSpawn, tuning: Tuning): GuardState {
  const first = spawn.route[0] ?? 0;
  return {
    id: spawn.id,
    archetypeId: spawn.archetype,
    previewOnly: spawn.previewOnly ?? false,
    ...(spawn.behaviorPolicy === undefined ? {} : { behaviorPolicy: spawn.behaviorPolicy }),
    floor: spawn.floor,
    x: first,
    y: spawn.surfaceY
      ?? floorSurfaceY(spawn.floor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx),
    climbLinkId: null,
    moving: false,
    facing: spawn.facing,
    mode: "patrol",
    susp: SuspicionRules.createSuspicion(),
    routeIndex: 0,
    dwellMs: 0,
    turnPending: initialTurnPending(spawn, first, spawn.facing),
    lureInspection: idleLureInspection(),
    sinceScanMs: 0,
    scanMs: 0,
    searchTargets: [],
    searchDwellMs: 0,
    investigationComplete: false,
    alertPatrolMs: 0,
    contactMs: 0,
    darkCrawl: { pauseMs: 0, latched: false },
    sawHideSpotId: null,
    staggerMs: 0,
    contractTripMs: 0,
    toolOpeningMs: 0,
    poise: { hits: 0, windowMs: 0, brokenMs: 0 },
    knockedOut: false,
    knockoutMs: 0,
    permanentAlert: false,
    combat: archetypeOf(spawn.archetype).combat === undefined
      ? null
      : CombatRules.createCombat(archetypeOf(spawn.archetype).combat as NonNullable<GuardArchetype["combat"]>),
  };
}

/**
 * 개인 유물의 무음 경보를 받은 경비를 회수 지점으로 돌린다.
 *
 * 전 저택 방송이라 청각 반경과 벽을 무시하지만 즉시 발각으로 만들지는 않는다. 플레이어가
 * 미리 읽은 다른 퇴로를 실행할 시간을 남기고, 이미 추격 중인 경비의 더 정확한 판단도 덮지 않는다.
 */
export function respondToMansionAlarm(guard: GuardState, at: Vec2, tuning: Tuning): GuardState {
  if (GuardStatusRules.isInactive(guard)) return guard;

  const susp = SuspicionRules.bump(guard.susp, tuning.suspicion.curiousThreshold, at, tuning);
  if (guard.mode === "chase" || susp.tier === "spotted") return { ...guard, susp };

  return {
    ...guard,
    facing: at.x === guard.x ? guard.facing : at.x > guard.x ? 1 : -1,
    mode: transitionGuardMode(
      guard.mode,
      guard.staggerMs > 0
        ? { kind: "staggered" }
        : { kind: "planned", mode: "investigate" },
    ),
    susp,
    dwellMs: 0,
    searchTargets: [],
    searchDwellMs: 0,
    lureInspection: idleLureInspection(),
    investigationComplete: false,
    sawHideSpotId: null,
  };
}

/** 현재 의심 상태를 반영한 관측자 파라미터. 화면의 콘과 판정이 같은 값을 쓴다. */
/**
 * 이 경비가 지금 무엇을 볼 수 있는가.
 *
 * sim 의 탐지와 화면의 감시 콘이 같은 함수를 쓴다. 봉쇄 압박도 여기 한 곳에 곱해야
 * 넓어진 시야가 화면에도 그대로 보인다.
 */
export function observerOf(
  guard: GuardState,
  tuning: Tuning,
  pressure: LockdownPressure = NO_LOCKDOWN_PRESSURE,
): Observer {
  const archetype = archetypeOf(guard.archetypeId);
  const tier = guard.susp.tier;
  const basePitch = SuspicionRules.pitchLimitFor(tier, tuning);
  const inspectingLure = GuardStatusRules.isInspectingLure(guard);
  const canObserve = guard.previewOnly !== true && !inspectingLure;
  return {
    at: { x: guard.x, y: guard.y + (archetype.visionOriginOffsetY ?? 0) },
    facing: guard.facing,
    range: canObserve
      ? archetype.viewRange * behaviorModifiersOf(guard.behaviorPolicy).viewRangeMul
        * tuning.vision.rangeMul * SuspicionRules.rangeMultiplierFor(tier)
        * pressure.viewMul
      : 0,
    halfAngleDeg: archetype.halfAngleDeg,
    pitchLimitDeg: tier === "calm" ? basePitch + archetype.calmPitchBonusDeg : basePitch,
    peripheralRadius: !canObserve || archetype.peripheralVision === false ? 0 : tuning.vision.peripheralRadius,
  };
}

/** 초대 행동 배수의 단일 소비점. 렌더와 sim이 GuardState를 공유해 텔레그래프도 같다. */
function chaseSpeedOf(guard: GuardState, archetype: GuardArchetype): number {
  return archetype.chaseSpeed * behaviorModifiersOf(guard.behaviorPolicy).chaseSpeedMul;
}

/**
 * 몸 접촉 뒤 제압을 완전히 끊는 중심 간 거리.
 *
 * 물리 접촉 경계 한 픽셀만 벗어나도 경비가 헛손질하면, 이미 누르던 이동키 하나로
 * 포획을 자동 해제할 수 있다. 한 보폭인 captureRangePx를 한 번 더 벌려야 비로소
 * 제압을 끊도록 해, 0.6초 안에 같은 방향을 계속 밀어내는 의도적인 대응을 요구한다.
 */
export function captureEscapeDistancePx(tuning: Tuning): number {
  return tuning.guard.captureRangePx * 2;
}

function patrolSpeedOf(guard: GuardState, archetype: GuardArchetype): number {
  return archetype.walkSpeed * behaviorModifiersOf(guard.behaviorPolicy).patrolSpeedMul;
}

function searchDwellMsOf(guard: GuardState, tuning: Tuning): number {
  return Math.round(tuning.guard.searchDwellMs * behaviorModifiersOf(guard.behaviorPolicy).searchDwellMul);
}

/** 행동 성격이 빠른 경비도 유인구 자체는 플레이어가 읽을 수 있는 최소 시간 동안 확인한다. */
function lureInspectDwellMsOf(guard: GuardState, tuning: Tuning): number {
  return Math.max(tuning.guard.lureInspectMinMs, searchDwellMsOf(guard, tuning));
}

function pursuitModeCanDisengage(mode: GuardMode): boolean {
  return mode === "investigate"
    || mode === "search"
    || mode === "chase"
    || mode === "recapture-chase";
}

/** 추적이 시작된 직접 목격점을 중심으로 한 수색 반경 경계에 플레이어가 도달했는가. */
function outsidePursuitArea(guard: GuardState, targetAt: Vec2, tuning: Tuning): boolean {
  const origin = guard.susp.pursuitOrigin;
  if (origin === null) return false;
  return Math.hypot(targetAt.x - origin.x, targetAt.y - origin.y) >= tuning.guard.searchRadiusPx;
}

/** 포획 예고처럼 계획 단계 전에 끝나야 하는 추적 상태를 안전하게 순찰로 되돌린다. */
function releasePursuit(guard: GuardState, tuning: Tuning): GuardState {
  return {
    ...guard,
    mode: transitionGuardMode(guard.mode, { kind: "disengaged" }),
    susp: SuspicionRules.disengage(guard.susp, guard.permanentAlert, tuning),
    moving: false,
    climbLinkId: null,
    contactMs: 0,
    staggerMs: 0,
    searchTargets: [],
    searchDwellMs: 0,
    lureInspection: idleLureInspection(),
    investigationComplete: true,
    sawHideSpotId: null,
  };
}

export function step(
  current: GuardState,
  input: GuardStepInput,
  spawn: GuardSpawn,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
): GuardStepResult {
  // 경직 저항 시계는 모든 분기보다 먼저 돈다. 경직 분기가 early-return 하므로
  // 아래에서 감쇠시키면 정작 경직 중인 경비의 저항이 영원히 회복되지 않는다.
  const guard = decayPoise(current, dtMs);
  const archetype = archetypeOf(guard.archetypeId);
  // 이 스텝 동안 고정인 값을 한 번만 묶는다. 아래 계획 단계는 이 컨텍스트만 넘긴다.
  const ctx: GuardStepContext = { input, spawn, archetype, layout, tuning, dtMs };
  const events: SimEvent[] = [];
  const target = input.target;

  // 다음 장의 배우를 미리 보여 주는 동안에는 월드에 서 있기만 한다. 시야·청각·몸 충돌·
  // 전투·상호작용 어느 쪽으로도 현재 장의 해법을 가로막지 않는다.
  if (guard.previewOnly === true) {
    return {
      guard: { ...guard, moving: false, contactMs: 0 },
      events,
      exposure: 0,
      captured: false,
      struckPlayer: false,
    };
  }

  // 전투 패배는 일반 무력화와 달리 기상 타이머가 없다. 오래된 spotted 티어를
  // 그대로 보존하더라도 더는 보거나 전파하거나 공격하지 않는 영구 비활성 상태다.
  if (GuardStatusRules.conditionOf(guard) === "defeated") {
    const resting = GuardStatusRules.immobilize(settleClimberToFloor(guard, layout, tuning));
    return {
      guard: resting,
      events,
      exposure: 0,
      captured: false,
      struckPlayer: false,
    };
  }

  // 무력화된 경비는 아무것도 하지 않는다. 몸만 그 자리에 남는다.
  if (GuardStatusRules.conditionOf(guard) === "knocked-out") {
    const resting = GuardStatusRules.immobilize(settleClimberToFloor(guard, layout, tuning));
    const knockoutMs = Math.max(0, resting.knockoutMs - dtMs);
    if (knockoutMs > 0) {
      return {
        guard: { ...resting, knockoutMs },
        events,
        exposure: 0,
        captured: false,
        struckPlayer: false,
      };
    }

    const at = { x: resting.x, y: resting.y };
    const susp = SuspicionRules.bump(resting.susp, tuning.suspicion.alertThreshold, at, tuning);
    events.push({ kind: "GuardAwoke", guardId: resting.id, at });
    if (resting.susp.tier !== susp.tier) {
      events.push({ kind: "SuspicionTierChanged", guardId: resting.id, from: resting.susp.tier, to: susp.tier });
    }
    return {
      guard: {
        ...resting,
        knockedOut: false,
        knockoutMs: 0,
        permanentAlert: true,
        staggerMs: 0,
        moving: false,
        mode: transitionGuardMode(resting.mode, { kind: "awoke" }),
        susp,
        investigationComplete: false,
        searchTargets: [],
        searchDwellMs: searchDwellMsOf(resting, tuning),
        lureInspection: idleLureInspection(),
      },
      events,
      exposure: 0,
      captured: false,
      struckPlayer: false,
    };
  }

  // 제압 이탈·포박 탈출 뒤의 정지 예고 중에도 플레이어는 계속 달릴 수 있다.
  // 추적 시작점의 수색 반경 경계에 이미 도달했다면 예고가 끝난 뒤 추격을 되살리지 않는다.
  if (
    (guard.mode === "capture-recovery" || guard.mode === "recapture-windup")
    && outsidePursuitArea(guard, target.at, tuning)
  ) {
    const released = releasePursuit(guard, tuning);
    if (guard.susp.tier !== released.susp.tier) {
      events.push({
        kind: "SuspicionTierChanged",
        guardId: guard.id,
        from: guard.susp.tier,
        to: released.susp.tier,
      });
    }
    return {
      guard: released,
      events,
      exposure: 0,
      captured: false,
      struckPlayer: false,
    };
  }

  // 경직 중에는 아무것도 못 한다. 접촉 탈출의 헛손질은 넘어진 상태와 분리해
  // 제자리에서 방향·한 프레임 자세를 고정하고, 실제 넉백만 pratfall을 유지한다.
  if (guard.staggerMs > 0) {
    const resting = GuardStatusRules.immobilize(settleClimberToFloor(guard, layout, tuning));
    const susp = SuspicionRules.step(
      resting.susp,
      { exposure: 0, heard: 0, heardLure: false, stimulusAt: null, propagated: 0 },
      tuning,
      dtMs,
    );
    return {
      guard: {
        ...resting,
        staggerMs: Math.max(0, resting.staggerMs - dtMs),
        contractTripMs: Math.max(0, resting.contractTripMs - dtMs),
        toolOpeningMs: Math.max(0, resting.toolOpeningMs - dtMs),
        susp: susp.state,
        mode: transitionGuardMode(guard.mode, { kind: "staggered" }),
        moving: false,
      },
      events,
      exposure: 0,
      captured: false,
      struckPlayer: false,
    };
  }

  // --- 지각 ---
  const visual = input.visualPerception ?? perceiveVisual(guard, input, layout, tuning);
  const { pressure, observer, vision, hideEntryVision, visualTarget, visualExposure, sightBlockers } = visual;
  const inspectingLure = GuardStatusRules.isInspectingLure(guard);
  const heardNow = listen(
    input.noises,
    {
      at: { x: guard.x, y: guard.y },
      hearRange: archetype.hearRange * behaviorModifiersOf(guard.behaviorPolicy).hearRangeMul,
    },
    layout,
    tuning,
  );
  const guaranteedWardenOpening = wardenGuaranteedOpeningActive(guard, tuning);
  // 착탄점을 내려다보는 5초는 플레이어에게 약속한 통과 창이다. 그 사이의 발소리나
  // 유인구 재울림을 새 자극으로 받으면 조사 자세가 풀리고, 이미 등 뒤를 지난 플레이어를
  // 같은 프레임부터 다시 붙잡게 된다. 물체가 사라지는지는 activeLures가 별도로 판정하므로
  // 확인 중에는 청각 자극 전체를 보류한다.
  // 보장된 반장 빈틈도 같은 약속이다. 교습이 요구한 질주 발소리를 반장이 즉시 듣고
  // 자기 빈틈을 취소하면 물리 통과와 HUD가 한 프레임 뒤 거짓말이 되므로 창 동안 보류한다.
  const heard = inspectingLure || guaranteedWardenOpening
    ? { strength: 0, at: null, lure: false, inspectAtSource: false }
    : heardNow;

  // 보는 앞에서 숨으면 그 은신처를 기억한다. 은신을 버튼이 아니라 타이머로 만드는 규칙.
  let sawHideSpotId = guard.sawHideSpotId;
  const sawHide = target.transition === "entered-hide"
    && target.hideSpotId !== null
    && (hideEntryVision?.exposure ?? 0) > tuning.suspicion.sawYouHideExposure;
  if (sawHide) {
    sawHideSpotId = target.hideSpotId;
  }
  if (target.hideSpotId === null) sawHideSpotId = null;

  const stimulusAt: Vec2 | null =
    visualExposure > 0 ? visualTarget.at : heard.strength > 0 ? heard.at : null;

  const susp = SuspicionRules.step(
    guard.susp,
    {
      exposure: visualExposure,
      heard: heard.strength,
      heardLure: heard.lure,
      stimulusAt,
      propagated: input.propagated,
    },
    tuning,
    dtMs,
  );

  // 쓰러진 동료를 보면 즉시 영구 경계. 무력화의 값을 나중에 치르게 하는 규칙이다.
  const body = inspectingLure
    ? null
    : findVisibleBody(observer, ctx, sightBlockers);
  if (body !== null && !guard.permanentAlert) {
    events.push({ kind: "BodyFound", guardId: guard.id, at: body });
  }
  const permanentAlert = guard.permanentAlert || body !== null;
  // 눈앞에서 사라지는 순간은 단순한 한 프레임 노출이 아니라 명시적인 은신 목격이다.
  // 최소 alert로 올려 실제로 해당 은신처를 확인하러 가게 한다.
  const contactAware = input.bodyContactAt === undefined || inspectingLure
    ? susp.state
    : {
        ...SuspicionRules.bump(susp.state, tuning.suspicion.spottedThreshold, input.bodyContactAt, tuning),
        pursuitOrigin: input.bodyContactAt,
      };
  const hideAware = sawHide
    ? SuspicionRules.bump(contactAware, tuning.suspicion.alertThreshold, visualTarget.at, tuning)
    : contactAware;
  const bodyAware = body === null
    ? hideAware
    : SuspicionRules.bump(hideAware, tuning.suspicion.alertThreshold, body, tuning);
  const alertAware = permanentAlert
    ? SuspicionRules.holdAtLeast(bodyAware, tuning.suspicion.alertThreshold, tuning)
    : bodyAware;
  const pursuitDisengaged =
    body === null
    && pursuitModeCanDisengage(guard.mode)
    && outsidePursuitArea({ ...guard, susp: alertAware }, target.at, tuning);
  if (pursuitDisengaged) {
    const released = releasePursuit({ ...guard, susp: alertAware, permanentAlert }, tuning);
    if (guard.susp.tier !== released.susp.tier) {
      events.push({
        kind: "SuspicionTierChanged",
        guardId: guard.id,
        from: guard.susp.tier,
        to: released.susp.tier,
      });
    }
    return {
      guard: released,
      events,
      exposure: visualExposure,
      captured: false,
      struckPlayer: false,
    };
  }
  const perceived = alertAware;
  // --- 의도 ---
  const planningGuard: GuardState = {
    ...guard,
    mode: guard.mode,
    susp: perceived,
    permanentAlert,
    // 새 시야·소음 자극은 순찰 웨이포인트 대기를 끝낸다. 유인구의 현장 확인은
    // 아래 별도 필드가 소유하므로 휘파람 경비가 옷장 앞에서 순찰 대기를 재사용하지 않는다.
    dwellMs: visualExposure > 0 || heard.strength > 0 ? 0 : guard.dwellMs,
    // 새로 본 것은 유인구 확인을 끝내고, 새로 들은 것은 확인을 처음부터 다시 예약한다.
    lureInspection: visualExposure > 0
      ? idleLureInspection()
      : heard.strength > 0
        ? {
            // 같은 investigate 상태를 쓰더라도 유인구만 착탄점 확인 시간을 예약한다.
            // 휘파람은 옷장 앞으로 경비를 끌어 계속 지나가게 하는 별도 역할이므로
            // 현장 체류를 붙이면 첫 잠입의 안전 창과 두 도구의 역할이 함께 무너진다.
            dwellMs: heard.inspectAtSource ? lureInspectDwellMsOf(guard, tuning) : 0,
            // 접근 중 현재 위치로 매 프레임 방향을 다시 계산하면 정지점 부근에서 좌우가 뒤집힌다.
            // 최초 청취 방향을 고정해 같은 쪽에서 멈추고, 조사 내내 유인구를 바라보게 한다.
            facing: heard.inspectAtSource && heard.at !== null
              ? heard.at.x === guard.x ? guard.facing : heard.at.x > guard.x ? 1 : -1
              : null,
            started: false,
          }
        : guard.lureInspection,
    // 이전 조사를 마쳤더라도 새로 보거나 들은 자극은 다시 확인한다.
    // lastKnown 만 갱신하고 완료 플래그를 남기면 경비가 플레이어를 보고도 순찰한다.
    investigationComplete:
      visualExposure > 0 || heard.strength > 0 || body !== null ? false : guard.investigationComplete,
    searchTargets: guard.searchTargets,
    searchDwellMs: guard.searchDwellMs,
    sawHideSpotId,
  };
  const planned = plan(planningGuard, ctx, vision.exposure > 0);

  // --- 전투 ---
  // 전투 가능한 상대만, 추격 중일 때만 공격한다. 평온한 상대는 휘두르지 않는다.
  const traversing = planned.vertical !== undefined;
  const holdingTarget = input.holdingTarget === true;
  const targetHittable = GuardTargetRules.isHittable(target);
  const bodyContactEligible =
    !GuardStatusRules.isInspectingLure(guard) &&
    !archetype.stationary &&
    guard.climbLinkId === null &&
    GuardTargetRules.isCapturable(target) &&
    input.bodyContactAllowed !== false &&
    onSameFloor(target.at.y, guard.y, tuning.world.floorHeightPx);
  const bodyContactBeforeMove = bodyContactEligible &&
    Math.abs(target.at.x - guard.x) <= tuning.guard.captureRangePx + 0.001;
  // 접촉 경계에 도달한 바로 그 스텝부터 발을 고정한다. 이동 뒤에만 접촉을 확인하면
  // 경비가 매 프레임 플레이어 몸을 밀어 둘이 함께 미끄러지는 결과가 된다.
  let combat = guard.combat;
  let struckPlayer = false;
  let rooted = false;
  if (combat !== null && archetype.combat !== undefined && !combat.defeated) {
    const result = CombatRules.step(
      combat,
      {
        attackerId: guard.id,
        self: { x: guard.x, y: guard.y },
        facing: guard.facing,
        target: target.at,
        targetInvulnerable: target.invulnerable,
        engaged: perceived.tier === "spotted" && vision.exposure > 0 && targetHittable && !traversing && !holdingTarget,
        canStartAttack: traversing || holdingTarget ? false : input.canStartAttack,
        // 피격 무적은 이 스윙만 통과시킨다. 추격·공격권(engaged)은 그대로 둔다 —
        // 120ms 동안 경비가 물러서면 다수전 압박이 눈에 띄게 끊긴다.
        targetHittable: GuardTargetRules.isStrikeable(target),
        lineOfFireClear: traceLineOfFire(
          { x: guard.x, y: lineOfFireOriginY(guard.y, tuning) },
          GuardTargetRules.lineOfFireTarget(target),
          layout,
        ).clear,
      },
      archetype.combat,
      tuning,
      dtMs,
    );
    combat = result.state;
    struckPlayer = result.hitPlayer;
    rooted = result.rooted;
    events.push(...result.events);
    if (struckPlayer) {
      events.push({ kind: "PlayerStruck", guardId: guard.id, at: target.at });
    }
  }

  // --- 이동 ---
  // 공격 중에는 발이 묶인다. 그래야 선부를 보고 빠져나갈 수 있다.
  // 뒤에서 붙잡힌 동안에도 마찬가지다 — 잡은 상대가 걸어가 버리면 홀드가
  // 순찰 속도 따라가기 미니게임이 된다.
  const grabbed = input.heldInteractionId === guard.id;
  // 꺼진 등 아래의 포복 통과는 몸 충돌만 끄고 경비 추격은 그대로 두면 두 배우가 같은
  // 좌표를 따라 미끄러진다. 비전투 인간 경비는 가까운 그림자에서 잠깐 제자리를 지켜,
  // 플레이어가 실루엣 아래를 완전히 빠져나갈 수 있는 읽기 쉬운 통과 창을 만든다.
  const darkCrawlOverlap =
    guard.combat === null &&
    !archetype.stationary &&
    guard.climbLinkId === null &&
    planned.vertical === undefined &&
    input.bodyContactAllowed === false &&
    target.pose === "crouch" &&
    target.grounded &&
    onSameFloor(target.at.y, guard.y, tuning.world.floorHeightPx) &&
    Math.abs(target.at.x - guard.x) <= tuning.guard.captureRangePx * 2 &&
    sharesSnuffedLampDarkness(
      layout,
      { x: guard.x, y: guard.y },
      { x: target.at.x, y: target.at.y + target.halfHeight },
      input.snuffedLamps ?? [],
      tuning.mischief.snuffDarkMul,
    );
  // 정지 타이머가 돌고 있으면 래치도 서 있다(둘 다 이 함수만 쓴다). 래치가 없던 옛 저장은
  // `upgradeGuardState` 가 불러올 때 타이머로 복구한다.
  const wasDarkCrawlPauseLatched = guard.darkCrawl.latched;
  const startedDarkCrawlPause =
    darkCrawlOverlap &&
    target.motion === "walk" &&
    !wasDarkCrawlPauseLatched;
  const activeDarkCrawlPass = darkCrawlOverlap && target.motion === "walk";
  const darkCrawlPauseMs = startedDarkCrawlPause
    ? tuning.guard.darkCrawlPauseMs
    // 정지 시간이 끝났어도 플레이어가 같은 그림자 안에서 실제로 포복 이동 중이면
    // 최소 한 스텝을 계속 남긴다. 둘이 겹친 채 같은 방향으로 미끄러지는 추격 재개를 막되,
    // 플레이어가 멈추거나 빠져나오면 아래 일반 감소로 곧바로 해제한다.
    : activeDarkCrawlPass && wasDarkCrawlPauseLatched
      ? Math.max(dtMs, guard.darkCrawl.pauseMs - dtMs)
    : Math.max(0, guard.darkCrawl.pauseMs - dtMs);
  const darkCrawlPauseLatched = (wasDarkCrawlPauseLatched || startedDarkCrawlPause)
    && (darkCrawlOverlap || darkCrawlPauseMs > 0);
  // 봉쇄 배수는 모든 이동 모드가 지나는 이 한 곳에서만 곱한다.
  const canTranslate = !archetype.stationary
    && guardModeAllowsTranslation(planned.state.mode)
    && !rooted
    && !grabbed
    && !holdingTarget
    && !bodyContactBeforeMove
    && darkCrawlPauseMs <= 0;
  const speed = !canTranslate
    ? 0
    : planned.speed * pressure.speedMul;
  const proposedX = canTranslate
    ? clamp(planned.x ?? guard.x + planned.moveDir * speed * (dtMs / 1000), 0, layout.widthPx)
    : guard.x;
  // 충돌 뒤 플레이어를 사후 분리해 미는 대신, 움직인 경비를 접촉 경계에서 멈춘다.
  const x = canTranslate && bodyContactEligible
    ? clampGuardXAtPlayerContact(
        guard.x,
        proposedX,
        target.at.x,
        tuning.guard.captureRangePx,
      )
    : proposedX;
  let y = guard.y;
  let floor = guard.floor;
  let climbLinkId = planned.climbLinkId === undefined ? guard.climbLinkId : planned.climbLinkId;
  if (canTranslate && planned.vertical !== undefined) {
    const maxVerticalStep = planned.vertical.speed * pressure.speedMul * (dtMs / 1000);
    y = approach(guard.y, planned.vertical.targetY, maxVerticalStep);
    if (Math.abs(y - planned.vertical.targetY) <= 0.001) {
      y = planned.vertical.targetY;
      floor = planned.vertical.targetFloor;
      climbLinkId = null;
    }
  }
  const moving = Math.abs(x - guard.x) > 0.001 || Math.abs(y - guard.y) > 0.001;
  const beganLureInspection = planned.state.mode === "investigate"
    && planned.state.lureInspection?.started === true
    && !planningGuard.lureInspection.started;

  // --- 접촉 인지·포박 판정 ---
  const sameFloor = onSameFloor(target.at.y, y, tuning.world.floorHeightPx);
  const bodyContact =
    bodyContactEligible &&
    sameFloor &&
    Math.abs(target.at.x - x) <= tuning.guard.captureRangePx + 0.001;
  // 시야가 등 뒤였더라도 몸이 닿으면 그 순간 상대를 확실히 확인한다. 이 승격이
  // 발각 페널티·HUD·효과음·포박 게이지의 공통 시작점이다.
  const finalPerceived = bodyContact
    ? {
        ...SuspicionRules.bump(perceived, tuning.suspicion.spottedThreshold, target.at, tuning),
        // 현재 시야 콘의 방향과 무관해도 몸으로 상대 위치를 직접 확인한 프레임이다.
        // 전투 경비도 접촉 직후 "수색 중"으로 잘못 보이지 않게 직접 조우로 기록한다.
        wasExposed: true,
        pursuitOrigin: target.at,
      }
    : perceived;
  if (guard.susp.tier !== finalPerceived.tier) {
    events.push({
      kind: "SuspicionTierChanged",
      guardId: guard.id,
      from: guard.susp.tier,
      to: finalPerceived.tier,
    });
  }
  const captureEligible =
    finalPerceived.tier === "spotted" &&
    GuardStatusRules.canCapturePlayer(guard) &&
    GuardTargetRules.isCapturable(target) &&
    input.bodyContactAllowed !== false &&
    // 전투 상대는 붙잡지 않고 때린다. 두 경로가 겹치면 회피가 무의미해진다.
    guard.combat === null;
  const captureAttemptActive = guard.contactMs > 0;
  const withinCaptureEscapeDistance =
    sameFloor && Math.abs(target.at.x - x) <= captureEscapeDistancePx(tuning) + 0.001;
  const captureAttemptHeld = captureAttemptActive && withinCaptureEscapeDistance;
  const inContact = captureEligible && (bodyContact || captureAttemptHeld);
  // 발버둥으로 한 번 떼어낸 전용 재포획 추격까지 몸에 닿았다면 다시 0.6초 제압 예고를
  // 반복하지 않는다. 그 예고까지 주면 계속 걷던 입력만으로 경비가 멈춘 사이 또 빠져나와
  // 질주 코치가 거짓말이 된다. 최초 조우의 한 방향 탈출 학습은 일반 chase가 그대로 소유한다.
  const recaptured = guard.mode === "recapture-chase" && bodyContact;
  const contactMs = inContact
    ? recaptured ? tuning.guard.captureHoldMs : guard.contactMs + dtMs
    : 0;
  const escapedContact = captureAttemptActive && !inContact;
  const contactFacing: Facing = target.at.x === x
    ? planned.faceDir
    : target.at.x > x ? 1 : -1;

  return {
    guard: {
      ...guard,
      ...planned.state,
      x,
      y,
      floor,
      climbLinkId,
      // 접촉 경계까지 이동한 거리보다 "지금 포획 판정 자세로 멈췄다"가 이 프레임의
      // 표현 의미다. true를 남기면 좌표는 고정됐어도 보행 시트가 한 프레임 재생된다.
      moving: bodyContact || beganLureInspection ? false : moving,
      // 몸이 닿는 순간 경비가 플레이어를 바라봐야 "우연히 막힘"이 아니라
      // "발견되어 붙잡히는 중"이라는 판정 시작을 배우가 직접 보여 준다.
      // 전투 공격은 몸이 겹쳐도 선딜 시작 방향을 우선한다. 접촉 방향을 먼저 쓰면
      // 플레이어가 굴러 통과한 프레임에 곤봉병만 180도 돌아 텔레그래프가 거짓이 된다.
      facing: rooted && combat !== null && combat.attackFacing !== null
        ? combat.attackFacing
        : darkCrawlPauseMs > 0
          ? guard.facing
          : bodyContact
            ? contactFacing
            : grabbed
              ? guard.facing
              : planned.faceDir,
      mode: transitionGuardMode(
        guard.mode,
        escapedContact
          ? { kind: "contact-broken" }
          : bodyContact
            ? { kind: "body-contact" }
            : { kind: "planned", mode: planned.state.mode },
      ),
      susp: finalPerceived,
      sawHideSpotId: planned.state.sawHideSpotId === undefined
        ? sawHideSpotId
        : planned.state.sawHideSpotId,
      permanentAlert,
      dwellMs: planned.state.dwellMs ?? planningGuard.dwellMs,
      // 다른 상태로 전환되면 오래된 유인구 확인 예약을 버린다. 나중에 calm으로
      // 내려왔을 때 이미 끝난 유인으로 다시 멈추지 않게 한다.
      // 계획이 정하지 않은 값은 지각 단계의 값을 잇는다(셋 각각 — null 방향도 잇는다).
      lureInspection: planned.state.mode === "investigate"
        ? {
            dwellMs: planned.state.lureInspection?.dwellMs ?? planningGuard.lureInspection.dwellMs,
            facing: planned.state.lureInspection?.facing ?? planningGuard.lureInspection.facing,
            started: planned.state.lureInspection?.started ?? planningGuard.lureInspection.started,
          }
        : idleLureInspection(),
      searchTargets: planned.state.searchTargets ?? guard.searchTargets,
      searchDwellMs: planned.state.searchDwellMs ?? guard.searchDwellMs,
      contactMs,
      darkCrawl: { pauseMs: darkCrawlPauseMs, latched: darkCrawlPauseLatched },
      // 표시된 방향으로 빠져나온 보상. 경비가 같은 프레임에 다시 따라붙으면
      // 방향 안내가 거짓이 되므로 짧은 헛손질 회복을 실제 AI 상태로 남긴다.
      staggerMs: escapedContact
        ? Math.max(guard.staggerMs, tuning.guard.captureEscapeStaggerMs)
        : guard.staggerMs,
      combat,
    },
    events,
    exposure: visualExposure,
    captured: contactMs >= tuning.guard.captureHoldMs,
    struckPlayer,
  };
}

/** 공격권 선점과 실제 경비 스텝이 공유하는 현재 시각 노출도. */
export function visualExposureToTarget(
  guard: GuardState,
  input: GuardVisionInput,
  layout: MansionLayout,
  tuning: Tuning,
): number {
  return perceiveVisual(guard, input, layout, tuning).visualExposure;
}

/** 경비 한 명의 이번 스텝 시각 지각. 시뮬레이션은 한 번 계산해 공격권 선점과 경비 스텝(`visualPerception`)에 함께 넘긴다. */
export function perceiveVisual(
  guard: GuardState,
  input: GuardVisionInput,
  layout: MansionLayout,
  tuning: Tuning,
): GuardVisualPerception {
  const target = input.target;
  const pressure = input.lockdownPressure ?? NO_LOCKDOWN_PRESSURE;
  const observer = observerOf(guard, tuning, pressure);
  const sightBlockers = [
    ...crowdSightBlockers(input.crowds ?? [], tuning),
    ...(input.dynamicSightBlockers ?? []),
  ];
  const vision = VisionRules.sample(
    observer,
    target,
    layout,
    tuning,
    input.snuffedLamps ?? [],
    sightBlockers,
  );
  const hideEntryVision = target.transition === "entered-hide" && target.previousVisibleBody !== null
    ? VisionRules.sample(
        observer,
        target.previousVisibleBody,
        layout,
        tuning,
        input.snuffedLamps ?? [],
        sightBlockers,
      )
    : null;
  const inspectingLure = GuardStatusRules.isInspectingLure(guard);
  const guaranteedWardenOpening = wardenGuaranteedOpeningActive(guard, tuning);
  // 반장 바로 뒤의 주변시와 몸을 가로지른 직후의 정면 노출까지 모두 보류해야
  // 저자가 표시한 빈틈 시간이 실제 통과 시간으로 유지된다. 창이 끝나면 일반 시야가 즉시 복구된다.
  const perceptionPaused = inspectingLure || guaranteedWardenOpening;
  const effectiveVision = perceptionPaused ? { ...vision, exposure: 0 } : vision;
  const effectiveHideEntryVision = perceptionPaused && hideEntryVision !== null
    ? { ...hideEntryVision, exposure: 0 }
    : hideEntryVision;
  const visualTarget = effectiveHideEntryVision !== null && effectiveHideEntryVision.exposure > effectiveVision.exposure
    ? target.previousVisibleBody!
    : target;
  const rawVisualExposure = Math.max(effectiveVision.exposure, effectiveHideEntryVision?.exposure ?? 0);
  const visualExposure = disguiseFoolsGuard(input.disguiseActive === true || input.receptionGuest === true, guard.susp.tier)
    ? 0
    : rawVisualExposure;
  return {
    pressure,
    observer,
    vision: effectiveVision,
    hideEntryVision: effectiveHideEntryVision,
    visualTarget,
    visualExposure,
    sightBlockers,
  };
}

interface PlanResult {
  readonly moveDir: -1 | 0 | 1;
  readonly faceDir: Facing;
  readonly speed: number;
  /** 지정되면 이동 대신 이 x 로 확정한다 (수색 스윕 등). */
  readonly x?: number;
  /** 사다리에서 한 프레임 이동할 수직 목표. 실제 이동은 공격 경직을 확인한 뒤 적용한다. */
  readonly vertical?: {
    readonly targetY: number;
    readonly targetFloor: number;
    readonly speed: number;
  };
  /** undefined는 기존 값을 유지하고 null은 사다리를 놓는다. */
  readonly climbLinkId?: string | null;
  readonly state: Partial<GuardState> & { mode: GuardMode };
}

function plan(guard: GuardState, ctx: GuardStepContext, targetVisible: boolean): PlanResult {
  const { input, archetype, tuning } = ctx;
  const tier = guard.susp.tier;
  const trackedTarget = targetVisible ? input.target.at : guard.susp.lastKnown;
  const verticalTarget = tier === "spotted" ? trackedTarget : guard.susp.lastKnown;
  const verticalMode: GuardMode = tier === "spotted" && targetVisible
    ? "chase"
    : tier === "spotted" || tier === "alert"
      ? "search"
      : "investigate";

  if (guard.climbLinkId !== null) {
    return planLadderTraversal(guard, ctx, verticalTarget, verticalMode);
  }
  if (
    tier !== "calm"
    && verticalTarget !== null
    && floorOfY(verticalTarget.y, tuning.world.floorHeightPx) !== guard.floor
    && !archetype.stationary
  ) {
    return planVerticalApproach(guard, ctx, verticalTarget, verticalMode);
  }

  if (tier === "spotted") {
    if (trackedTarget === null) {
      return {
        moveDir: 0,
        faceDir: guard.facing,
        speed: 0,
        state: { mode: "scan", searchTargets: [], searchDwellMs: searchDwellMsOf(guard, tuning) },
      };
    }
    // 숨은 플레이어의 위치에 도착해 수색을 시작했다면 spotted 하한 잠금이
    // 남아 있어도 수색 상태를 이어 간다. 다시 추격 계획으로 들어가면 매 프레임
    // searchDwellMs가 초기화되어 은신처 앞에서 영원히 멈춘다.
    const recapturing = (
      guard.mode === "recapture-windup" || guard.mode === "recapture-chase"
    );
    return !targetVisible && guard.mode === "search"
      ? planSearch(guard, ctx)
      : planChase(guard, ctx, {
          trackedTarget,
          targetVisible,
          speed: recapturing
            ? tuning.movement.walkSpeed * tuning.guard.recaptureWalkSpeedMul
              * behaviorModifiersOf(guard.behaviorPolicy).chaseSpeedMul
            : chaseSpeedOf(guard, archetype),
          mode: recapturing ? "recapture-chase" : "chase",
        });
  }
  if (tier === "alert") {
    // 영구 경계 경비도 플레이어 추적 기억을 잃으면 경계 순찰로 돌아간다.
    // 새 시야·소음이 lastKnown을 다시 채우면 즉시 수색을 재개한다.
    return guard.investigationComplete || (guard.mode === "patrol" && guard.susp.lastKnown === null)
      ? planPatrol(guard, ctx)
      : planSearch(guard, ctx);
  }
  // 유인구를 듣고 시작한 조사는 의심 미터가 먼저 calm으로 내려가도 착탄점 확인까지
  // 마친다. 멀리서 들은 유인일수록 도착 직전에 포기하면 플레이어에게 보인 원인과
  // 경비 행동이 어긋나고, 경비를 착탄점에 묶어 두는 도구의 전술적 시간도 사라진다.
  if (guard.mode === "investigate" && !guard.investigationComplete) {
    return planInvestigate(guard, ctx);
  }
  if (tier === "curious") {
    return guard.investigationComplete
      ? planPatrol(guard, ctx)
      : planInvestigate(guard, ctx);
  }
  const duty = ctx.spawn.stageWatch;
  if (input.stageDuty !== undefined && duty !== undefined) {
    return input.stageDuty === "watch"
      ? planStageWatch(guard, ctx, duty.atX, duty.facing, duty.hurryMul)
      : planStageWatch(guard, ctx, duty.checkX, opposite(duty.facing), duty.hurryMul);
  }
  const patrol = planPatrol(guard, ctx);
  return { ...patrol, state: { ...patrol.state, investigationComplete: false } };
}

/**
 * 무대를 훔쳐보는 직원. 자리로 걸어가 무대 쪽을 본다. 순찰 경로 진행(routeIndex·대기)은 보존해
 * 시선이 풀리면 하던 순찰로 돌아간다.
 */
function planStageWatch(
  guard: GuardState,
  ctx: GuardStepContext,
  atX: number,
  facing: Facing,
  hurryMul: number,
): PlanResult {
  const { archetype, tuning } = ctx;
  const dx = atX - guard.x;
  if (Math.abs(dx) <= tuning.guard.arriveEpsilonPx) {
    return {
      moveDir: 0,
      faceDir: facing,
      speed: 0,
      state: { mode: "patrol", turnPending: false, searchTargets: [], investigationComplete: false },
    };
  }
  const dir: Facing = dx > 0 ? 1 : -1;
  return {
    moveDir: dir,
    faceDir: dir,
    speed: patrolSpeedOf(guard, archetype) * hurryMul,
    state: { mode: "patrol", turnPending: false, searchTargets: [], investigationComplete: false },
  };
}


const MELEE_STANDOFF_INSET_PX = 4;


function meleeStandoffX(guard: GuardState, ctx: GuardStepContext, target: Vec2): number | undefined {
  const combat = guard.combat;
  const profile = ctx.archetype.combat;
  if (combat === null || profile === undefined || profile.attackKind !== "melee" || combat.defeated
    || ctx.input.bodyContactAllowed === false
    || (combat.phase !== "ready" && combat.phase !== "cooldown")
    || !onSameFloor(target.y, guard.y, ctx.tuning.world.floorHeightPx)) return undefined;
  const holdPx = Math.max(ctx.tuning.guard.captureRangePx, profile.engageRangePx - MELEE_STANDOFF_INSET_PX);
  const offset = guard.x - target.x;
  if (Math.abs(offset) <= holdPx) return guard.x;
  return target.x + Math.sign(offset) * holdPx;
}

function planChase(guard: GuardState, ctx: GuardStepContext, chase: ChaseIntent): PlanResult {
  const { input, tuning, dtMs } = ctx;
  const { trackedTarget, targetVisible, speed: chaseSpeed, mode: chaseMode } = chase;
  const standoffX = targetVisible && input.combatPressureX === undefined
    ? meleeStandoffX(guard, ctx, trackedTarget)
    : undefined;
  const chaseX = targetVisible ? input.combatPressureX ?? standoffX ?? trackedTarget.x : trackedTarget.x;
  const dx = chaseX - guard.x;
  const targetDx = trackedTarget.x - guard.x;
  const maxStep = chaseSpeed * (dtMs / 1000);
  if (!targetVisible && Math.abs(targetDx) <= maxStep) {
    // 남은 거리보다 한 프레임 이동량이 크면 목표 좌우를 영원히 넘나들며 방향과
    // 스프라이트가 매 프레임 반전한다. 목표점에 고정하고, 숨어 버린 상대라면
    // 제자리 달리기 대신 은신처를 살피는 자세로 전환한다.
    return {
      moveDir: 0,
      faceDir: guard.facing,
      speed: 0,
      x: trackedTarget.x,
      state: {
        mode: "search",
        searchTargets: guard.searchTargets,
        searchDwellMs: searchDwellMsOf(guard, tuning),
        alertPatrolMs: tuning.guard.alertPatrolMs,
      },
    };
  }
  // 보이는 목표도 남은 거리보다 한 프레임 이동량이 크면 목표 좌우를 넘나들지 않고
  // 정확히 도착한다. 특히 소등 그림자에서 웅크린 플레이어와 몸이 겹칠 수 있을 때
  // 순찰병이 매 스텝 좌우로 뒤집히면 두 배우가 충돌하며 떨리는 것처럼 보인다.
  if (targetVisible && Math.abs(dx) <= maxStep) {
    const targetDx = input.target.at.x - guard.x;
    return {
      moveDir: 0,
      faceDir: Math.abs(targetDx) < 0.001 ? guard.facing : targetDx > 0 ? 1 : -1,
      speed: 0,
      x: chaseX,
      state: { mode: chaseMode, searchTargets: [], searchDwellMs: 0, alertPatrolMs: tuning.guard.alertPatrolMs },
    };
  }
  const dir = Math.abs(dx) < 1 ? 0 : dx > 0 ? 1 : -1;
  const faceDir = targetVisible && input.combatPressureX !== undefined
    ? input.target.at.x >= guard.x ? 1 : -1
    : dir === 0 ? guard.facing : (dir);
  return {
    moveDir: dir,
    // 후열 경비는 슬롯으로 물러나면서도 보던 상대에게 등을 돌리지 않는다. 이동 방향으로
    // 반전하면 다음 스텝에 시야를 잃어 실시간 슬롯과 마지막 목격점을 왕복한다.
    faceDir,
    speed: chaseSpeed,
    state: { mode: chaseMode, searchTargets: [], searchDwellMs: 0, alertPatrolMs: tuning.guard.alertPatrolMs },
  };
}

function planVerticalApproach(
  guard: GuardState,
  ctx: GuardStepContext,
  target: Vec2,
  mode: GuardMode,
): PlanResult {
  const { archetype, tuning, dtMs } = ctx;
  const targetFloor = floorOfY(target.y, tuning.world.floorHeightPx);
  const nextFloor = guard.floor + (targetFloor > guard.floor ? 1 : -1);
  const ladder = nearestGuardLadder(ctx, guard.floor, nextFloor, guard.x);
  if (ladder === null) {
    // 갈 수 없는 층을 향해 달리기 행만 반복하지 않는다. 마지막 층에서 수색 자세로
    // 전환하면 레이아웃 오류도 시각적으로 '제자리 달리기'처럼 보이지 않는다.
    return {
      moveDir: 0,
      faceDir: guard.facing,
      speed: 0,
      climbLinkId: null,
      state: { mode: "scan", searchTargets: [], searchDwellMs: searchDwellMsOf(guard, tuning) },
    };
  }
  const ladderX = ladder.rect.x + ladder.rect.w / 2;
  const dx = ladderX - guard.x;
  const chaseSpeed = chaseSpeedOf(guard, archetype);
  const maxStep = chaseSpeed * (dtMs / 1000);
  if (Math.abs(dx) <= maxStep) {
    return ladderPlan(guard, ctx, { ladder, targetFloor: nextFloor, mode, ladderX });
  }
  const dir: Facing = dx > 0 ? 1 : -1;
  return {
    moveDir: dir,
    faceDir: dir,
    speed: chaseSpeed,
    climbLinkId: null,
    state: { mode, searchTargets: [], searchDwellMs: 0, alertPatrolMs: tuning.guard.alertPatrolMs },
  };
}

function planLadderTraversal(
  guard: GuardState,
  ctx: GuardStepContext,
  target: Vec2 | null,
  mode: GuardMode,
): PlanResult {
  const { archetype, layout, tuning } = ctx;
  const ladder = layout.links.find((link) => link.id === guard.climbLinkId && link.kind === "ladder" && link.guardUsable);
  if (ladder === undefined || archetype.stationary) {
    return {
      moveDir: 0,
      faceDir: guard.facing,
      speed: 0,
      climbLinkId: null,
      state: { mode: mode === "chase" ? "scan" : "search" },
    };
  }

  const [upperFloor, lowerFloor] = ladderFloors(ladder, tuning.world.floorHeightPx);
  const targetFloor = target === null ? guard.floor : floorOfY(target.y, tuning.world.floorHeightPx);
  const destination = targetFloor > guard.floor
    ? lowerFloor
    : targetFloor < guard.floor
      ? upperFloor
      : Math.abs(guard.y - floorSurfaceY(upperFloor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx))
          <= Math.abs(guard.y - floorSurfaceY(lowerFloor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx))
        ? upperFloor
        : lowerFloor;
  return ladderPlan(guard, ctx, {
    ladder,
    targetFloor: destination,
    mode,
    ladderX: ladder.rect.x + ladder.rect.w / 2,
  });
}

function ladderPlan(guard: GuardState, ctx: GuardStepContext, ride: LadderRide): PlanResult {
  const { archetype, tuning } = ctx;
  const { ladder, targetFloor, mode, ladderX } = ride;
  const targetY = floorSurfaceY(targetFloor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx);
  const goingDown = targetY > guard.y;
  return {
    moveDir: 0,
    faceDir: guard.facing,
    speed: chaseSpeedOf(guard, archetype),
    x: ladderX,
    vertical: {
      targetY,
      targetFloor,
      speed: goingDown ? tuning.movement.climbDownSpeed : tuning.movement.climbUpSpeed,
    },
    climbLinkId: ladder.id,
    state: { mode, searchTargets: [], searchDwellMs: 0, alertPatrolMs: tuning.guard.alertPatrolMs },
  };
}

function nearestGuardLadder(
  ctx: GuardStepContext,
  fromFloor: number,
  toFloor: number,
  fromX: number,
): VerticalLink | null {
  const { layout, tuning } = ctx;
  let nearest: VerticalLink | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const link of layout.links) {
    if (link.kind !== "ladder" || !link.guardUsable) continue;
    const [upperFloor, lowerFloor] = ladderFloors(link, tuning.world.floorHeightPx);
    if (upperFloor !== Math.min(fromFloor, toFloor) || lowerFloor !== Math.max(fromFloor, toFloor)) continue;
    const distance = Math.abs(link.rect.x + link.rect.w / 2 - fromX);
    if (distance < nearestDistance) {
      nearest = link;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function approach(value: number, target: number, delta: number): number {
  if (value < target) return Math.min(value + delta, target);
  if (value > target) return Math.max(value - delta, target);
  return target;
}

/** 사다리에서 쓰러진 몸이 공중에 영구 고정되지 않도록 가까운 층 끝에 안착시킨다. */
export function settleClimberToFloor(guard: GuardState, layout: MansionLayout, tuning: Tuning): GuardState {
  if (guard.climbLinkId === null) return guard;
  const ladder = layout.links.find((link) => link.id === guard.climbLinkId && link.kind === "ladder");
  if (ladder === undefined) return { ...guard, climbLinkId: null };
  const [upperFloor, lowerFloor] = ladderFloors(ladder, tuning.world.floorHeightPx);
  const upperY = floorSurfaceY(upperFloor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx);
  const lowerY = floorSurfaceY(lowerFloor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx);
  const floor = Math.abs(guard.y - upperY) <= Math.abs(guard.y - lowerY) ? upperFloor : lowerFloor;
  return {
    ...guard,
    x: ladder.rect.x + ladder.rect.w / 2,
    y: floor === upperFloor ? upperY : lowerY,
    floor,
    climbLinkId: null,
  };
}

/**
 * 경계: 최종 목격 위치로 간 뒤 주변 은신처·문·수직 연결을 점수 순으로 확인한다.
 * 확인 동작이 코믹해야 하지만, 코미디와 무관하게 이것이 은신처를 타이머로 만드는 장치다.
 */
function planSearch(guard: GuardState, ctx: GuardStepContext): PlanResult {
  const { archetype, layout, tuning, dtMs } = ctx;
  // 목격 앞에서 숨는 것을 봤다면 그 은신처가 최우선 목표다.
  const seenSpot = guard.sawHideSpotId === null ? null : layout.hideSpots.find((s) => s.id === guard.sawHideSpotId);
  const forced = seenSpot === undefined || seenSpot === null ? null : seenSpot.rect.x + seenSpot.rect.w / 2;

  let targets = guard.searchTargets;
  if (targets.length === 0) {
    if (forced !== null) {
      // 실제 숨는 장면을 봤어도 지금은 옷장을 여는 별도 실패 판정이 없다. 그러므로 한 번
      // 확인한 뒤에는 접근 방향으로 계속 지나가 문 앞을 비운다. 플레이어에게는 숨기 선택의
      // 보상이 생기고, 경비에게는 수색을 포기하지 않은 자연스러운 다음 동선이 된다.
      const continuing = searchClearanceX(forced, guard.facing, layout, tuning);
      const nearby = rankSearchTargets(guard, layout, tuning)
        .filter((x) => Math.abs(x - forced) > tuning.guard.arriveEpsilonPx)
        .filter((x) => Math.abs(x - continuing) > tuning.guard.arriveEpsilonPx);
      targets = [forced, continuing, ...nearby];
    } else {
      targets = rankSearchTargets(guard, layout, tuning);
    }
  }

  const goal = targets[0];
  if (goal === undefined) {
    // 확인할 곳이 없으면 경계 순찰로 돌아간다.
    return {
      moveDir: 0,
      faceDir: guard.facing,
      speed: 0,
      state: { mode: "search", searchTargets: [], searchDwellMs: 0, alertPatrolMs: tuning.guard.alertPatrolMs },
    };
  }

  const dx = goal - guard.x;
  if (Math.abs(dx) > tuning.guard.arriveEpsilonPx) {
    const dir = dx > 0 ? 1 : -1;
    return {
      moveDir: dir,
      faceDir: dir,
      speed: chaseSpeedOf(guard, archetype) * tuning.guard.alertPatrolSpeedMul * 0.7,
      state: { mode: "search", searchTargets: targets, searchDwellMs: searchDwellMsOf(guard, tuning) },
    };
  }

  // 도착. 좌우로 훑으며 확인한다.
  const remaining = guard.searchDwellMs - dtMs;
  if (remaining <= 0) {
    const inspectedWitnessedHide = forced !== null
      && Math.abs(goal - forced) <= tuning.guard.arriveEpsilonPx;
    const remainingTargets = targets.slice(1);
    return {
      moveDir: 0,
      faceDir: guard.facing === 1 ? -1 : 1,
      speed: 0,
      state: {
        mode: "search",
        searchTargets: remainingTargets,
        searchDwellMs: searchDwellMsOf(guard, tuning),
        investigationComplete: remainingTargets.length === 0,
        // 같은 은신처를 강제 목표로 영원히 다시 만들지 않는다. 이후에는 일반 수색 노드와
        // 의심도 감쇠가 행동을 소유한다.
        sawHideSpotId: inspectedWitnessedHide ? null : guard.sawHideSpotId,
      },
    };
  }
  // 확인 중에는 제자리에서 좌우를 번갈아 본다.
  const half = searchDwellMsOf(guard, tuning) / 2;
  return {
    moveDir: 0,
    faceDir: remaining > half ? 1 : -1,
    speed: 0,
    state: { mode: "search", searchTargets: targets, searchDwellMs: remaining },
  };
}

/** 은신처·수직 연결을 거리 가중 점수로 정렬해 상위 N 곳을 고른다. */
function rankSearchTargets(guard: GuardState, layout: MansionLayout, tuning: Tuning): number[] {
  const origin = guard.susp.lastKnown?.x ?? guard.x;
  const continuing = searchClearanceX(origin, guard.facing, layout, tuning);
  const scored: { x: number; score: number }[] = [];

  for (const spot of layout.hideSpots) {
    const cx = spot.rect.x + spot.rect.w / 2;
    const distance = Math.abs(cx - origin);
    if (distance > tuning.guard.searchRadiusPx) continue;
    scored.push({ x: cx, score: (1 / (distance + 40)) * spot.searchWeight });
  }
  for (const link of layout.links) {
    const cx = link.rect.x + link.rect.w / 2;
    const distance = Math.abs(cx - origin);
    if (distance > tuning.guard.searchRadiusPx) continue;
    scored.push({ x: cx, score: (1 / (distance + 40)) * 0.6 });
  }

  scored.sort((a, b) => b.score - a.score);
  const picked = scored.map((s) => s.x)
    .filter((x) => Math.abs(x - origin) > tuning.guard.arriveEpsilonPx)
    .filter((x) => Math.abs(x - continuing) > tuning.guard.arriveEpsilonPx)
    .slice(0, Math.max(1, tuning.guard.searchNodeCount + behaviorModifiersOf(guard.behaviorPolicy).searchNodeBonus));
  // 최종 목격 위치를 확인한 뒤에는 현재 진행 방향으로 한 번 더 지나간다. 주변에 다른
  // 수색 노드가 없는 작은 방에서도 같은 점을 다시 만들어 영원히 문을 막지 않게 한다.
  return Math.abs(continuing - origin) <= tuning.guard.arriveEpsilonPx
    ? [origin, ...picked]
    : [origin, continuing, ...picked];
}

/** 벽 쪽으로 접근한 경우에도 수색자가 같은 점에 갇히지 않도록 반대쪽 복도를 예비로 쓴다. */
function searchClearanceX(
  origin: number,
  facing: Facing,
  layout: MansionLayout,
  tuning: Tuning,
): number {
  const forward = clamp(origin + facing * tuning.guard.hideSearchClearancePx, 0, layout.widthPx);
  if (Math.abs(forward - origin) > tuning.guard.arriveEpsilonPx) return forward;
  return clamp(origin - facing * tuning.guard.hideSearchClearancePx, 0, layout.widthPx);
}

function planInvestigate(guard: GuardState, ctx: GuardStepContext): PlanResult {
  const { archetype, layout, tuning, dtMs } = ctx;
  const activeLures = ctx.input.activeLures;
  const sourceX = guard.susp.lastKnown?.x ?? guard.x;
  const lureInspection = guard.lureInspection.dwellMs > 0 || guard.lureInspection.started;
  const inspectFacing: Facing | null = !lureInspection
    ? null
    : guard.lureInspection.facing
      ?? (sourceX === guard.x ? guard.facing : sourceX > guard.x ? 1 : -1);
  // 배우의 중심을 착탄점에 맞추면 작은 유인구를 밟고 반대편으로 넘어간다. 처음 들은 쪽에
  // 한 발짝 앞 정지점을 만들고 끝까지 같은 방향으로 유인구를 바라본다.
  const goal = inspectFacing === null
    ? sourceX
    : clamp(sourceX - inspectFacing * tuning.guard.lureInspectStandoffPx, 0, layout.widthPx);
  const sourceFloor = guard.susp.lastKnown === null
    ? guard.floor
    : floorOfY(guard.susp.lastKnown.y, tuning.world.floorHeightPx);
  const lureStillPresent = activeLures === undefined || activeLures.some((lure) => (
    lure.floor === sourceFloor
      && Math.abs(lure.at.x - sourceX) <= tuning.guard.arriveEpsilonPx
  ));
  // 유인구가 수명 만료로 사라지면 접근 중이든 확인 중이든 그 프레임에 관심을 끊는다.
  // 남은 5초 예약 때문에 빈 바닥을 계속 바라보지 않고 바로 다음 순찰점으로 복귀한다.
  if (lureInspection && !lureStillPresent) {
    return resumePatrolAfterInvestigation(guard, ctx);
  }
  const dx = goal - guard.x;
  const speed = patrolSpeedOf(guard, archetype) * tuning.guard.investigateSpeedMul;
  const maxStep = speed * (dtMs / 1000);
  if (Math.abs(dx) <= Math.max(tuning.guard.arriveEpsilonPx, maxStep)) {
    // 도착 프레임은 조사 자세가 처음 화면에 보이는 시점이다. 이 프레임에서 dt를 먼저 빼면
    // 설정이 5000ms여도 실제 표시 시간은 한 틱 짧아지므로 시계는 다음 스텝부터 소비한다.
    if (lureInspection && !guard.lureInspection.started) {
      return {
        moveDir: 0,
        faceDir: inspectFacing ?? guard.facing,
        speed: 0,
        x: goal,
        state: {
          mode: "investigate",
          lureInspection: { dwellMs: guard.lureInspection.dwellMs, facing: inspectFacing, started: true },
          investigationComplete: false,
        },
      };
    }
    // 착탄점에 도착하면 수색 성격에 맞는 시간만큼 멈춰 실제로 유인구를 확인한다.
    // 의심 수치가 전부 빠질 때까지 무기한 서는 대신 명시된 시간만 소유하므로,
    // 플레이어는 이 창을 읽고 경비를 지나간 뒤 복귀 시점도 예측할 수 있다.
    const remainingDwellMs = Math.max(0, guard.lureInspection.dwellMs - dtMs);
    if (remainingDwellMs > 0) {
      return {
        moveDir: 0,
        faceDir: inspectFacing ?? guard.facing,
        speed: 0,
        x: goal,
        state: {
          mode: "investigate",
          lureInspection: { dwellMs: remainingDwellMs, facing: inspectFacing, started: lureInspection },
          investigationComplete: false,
        },
      };
    }

    // 확인을 마친 뒤에는 현재 순찰점을 소비하고 다음 점으로 향해 유인 지점을
    // 다시 밟거나 그 앞에 영구 정지하지 않는다.
    return resumePatrolAfterInvestigation(guard, ctx);
  }
  const dir = dx > 0 ? 1 : -1;
  return {
    moveDir: dir,
    // 너무 가까운 곳에서 유인구가 울렸다면 등을 돌려 더 멀리 걸어가지 않고, 유인구를
    // 바라본 채 짧게 뒷걸음질해 읽기 좋은 조사 간격을 만든다.
    faceDir: inspectFacing ?? dir,
    speed,
    state: {
      mode: "investigate",
      lureInspection: { dwellMs: guard.lureInspection.dwellMs, facing: inspectFacing, started: false },
      investigationComplete: false,
    },
  };
}

function resumePatrolAfterInvestigation(guard: GuardState, ctx: GuardStepContext): PlanResult {
  const { spawn } = ctx;
  const routeIndex = spawn.route.length > 1
    ? (guard.routeIndex + 1) % spawn.route.length
    : guard.routeIndex;
  const resumed = planPatrol({ ...guard, routeIndex, dwellMs: 0, investigationComplete: true }, ctx);
  return {
    ...resumed,
    state: {
      ...resumed.state,
      routeIndex,
      dwellMs: 0,
      lureInspection: idleLureInspection(),
      investigationComplete: true,
    },
  };
}

/**
 * 순찰. 웨이포인트를 왕복하고 끝에서 dwellMs 만큼 멈춘다.
 *
 * 반전은 반드시 예고된다: 멈춰 선 뒤 turnWindupMs 를 남기고 고개가 먼저 돌고,
 * 그 다음에 몸이 움직인다. 플레이어가 "지금 건너면 된다"를 확신하고 커밋할 수 있어야 한다.
 */
function planPatrol(guard: GuardState, ctx: GuardStepContext): PlanResult {
  const { spawn, archetype, tuning, dtMs } = ctx;
  const alertPatrolMs = Math.max(0, guard.alertPatrolMs - dtMs);
  const speedMul = alertPatrolMs > 0 ? tuning.guard.alertPatrolSpeedMul : 1;
  const scan = spawn.periodicScanDisabled === true
    ? { plan: null, sinceScanMs: guard.sinceScanMs }
    : advancePeriodicScan(guard, archetype, dtMs, alertPatrolMs);
  if (scan.plan !== null) return scan.plan;
  const sinceScanMs = scan.sinceScanMs;

  // 고정형 또는 웨이포인트 1개는 스캔 사이에 제자리를 지킨다. 이동 반장·집사도
  // 위의 공용 주기계를 지나므로 콘텐츠 표의 scanIntervalMs가 실제 행동이 된다.
  if (archetype.stationary || spawn.route.length <= 1) {
    return {
      moveDir: 0,
      faceDir: guard.facing,
      speed: 0,
      state: { mode: "patrol", alertPatrolMs, sinceScanMs, turnPending: false },
    };
  }

  if (guard.dwellMs > 0) {
    const dwellMs = Math.max(0, guard.dwellMs - dtMs);
    // 대기가 끝나기 turnWindupMs 전에 고개가 먼저 돌아간다.
    const turnWindupMs = archetype.turnWindupMs ?? tuning.guard.turnWindupMs;
    const turning = guard.turnPending && dwellMs <= turnWindupMs;
    const nextIndex = (guard.routeIndex + 1) % spawn.route.length;
    const nextGoal = spawn.route[nextIndex] ?? guard.x;
    const faceDir: Facing = turning ? (nextGoal >= guard.x ? 1 : -1) : guard.facing;
    return {
      moveDir: 0,
      faceDir,
      speed: 0,
      state: {
        mode: "patrol",
        dwellMs,
        routeIndex: dwellMs > 0 ? guard.routeIndex : nextIndex,
        alertPatrolMs,
        sinceScanMs,
        turnPending: dwellMs > 0 && guard.turnPending,
        searchTargets: [],
      },
    };
  }

  const goal = spawn.route[guard.routeIndex] ?? guard.x;
  const dx = goal - guard.x;
  if (Math.abs(dx) <= tuning.guard.arriveEpsilonPx) {
    const nextIndex = (guard.routeIndex + 1) % spawn.route.length;
    const nextGoal = spawn.route[nextIndex] ?? guard.x;
    return {
      moveDir: 0,
      faceDir: guard.facing,
      speed: 0,
      state: {
        mode: "patrol",
        dwellMs: readablePatrolDwellMs(
          guard.archetypeId,
          Math.round(spawn.dwellMs * behaviorModifiersOf(guard.behaviorPolicy).patrolDwellMul),
          tuning.guard.turnWindupMs,
        ),
        alertPatrolMs,
        sinceScanMs,
        turnPending: directionTo(nextGoal, guard.x, guard.facing) !== guard.facing,
        searchTargets: [],
      },
    };
  }
  const dir = dx > 0 ? 1 : -1;
  return {
    moveDir: dir,
    faceDir: dir,
    speed: patrolSpeedOf(guard, archetype) * speedMul,
    state: { mode: "patrol", alertPatrolMs, sinceScanMs, turnPending: false, searchTargets: [] },
  };
}

/** 이동 여부와 무관한 주기 스캔. 활성화되면 현재 순찰 위치에서 잠깐 뿌리내린다. */
function advancePeriodicScan(
  guard: GuardState,
  archetype: GuardArchetype,
  dtMs: number,
  alertPatrolMs: number,
): { readonly plan: PlanResult | null; readonly sinceScanMs: number } {
  if (archetype.scanIntervalMs <= 0) {
    return { plan: null, sinceScanMs: guard.sinceScanMs };
  }

  let sinceScanMs = guard.sinceScanMs + dtMs;

  if (guard.scanMs > 0) {
    const scanMs = Math.max(0, guard.scanMs - dtMs);
    const scanComplete = scanMs <= 0;
    const faceDir = scanFacing(guard, archetype, scanMs, scanComplete);
    return {
      plan: {
        moveDir: 0,
        faceDir,
        speed: 0,
        state: {
          mode: scanComplete ? "patrol" : "scan",
          scanMs,
          sinceScanMs,
          alertPatrolMs,
          turnPending: guard.turnPending,
        },
      },
      sinceScanMs,
    };
  }

  if (sinceScanMs >= archetype.scanIntervalMs) {
    sinceScanMs = 0;
    return {
      plan: {
        moveDir: 0,
        // 고정 촛대는 완전히 주기적이라 즉시 반전한다. 이동 반장은 스캔 아이콘을
        // turnWindupMs 동안 먼저 보여 준 뒤 방향을 바꿔 갑작스러운 시야 역전을 막는다.
        faceDir: archetype.stationary ? opposite(guard.facing) : guard.facing,
        speed: 0,
        state: {
          mode: "scan",
          scanMs: archetype.scanDurationMs,
          sinceScanMs,
          alertPatrolMs,
          turnPending: guard.turnPending,
        },
      },
      sinceScanMs,
    };
  }
  return { plan: null, sinceScanMs };
}

function scanFacing(
  guard: GuardState,
  archetype: GuardArchetype,
  nextScanMs: number,
  scanComplete: boolean,
): Facing {
  if (archetype.stationary) return scanComplete ? opposite(guard.facing) : guard.facing;
  const warningMs = Math.min(archetype.scanDurationMs, archetype.turnWindupMs ?? 0);
  const turnAtRemainingMs = archetype.scanDurationMs - warningMs;
  const alreadyTurned = guard.scanMs <= turnAtRemainingMs;
  if (scanComplete) return alreadyTurned ? opposite(guard.facing) : guard.facing;
  const crossesTurn = !alreadyTurned && nextScanMs <= turnAtRemainingMs;
  return crossesTurn ? opposite(guard.facing) : guard.facing;
}

function opposite(facing: Facing): Facing {
  return facing === 1 ? -1 : 1;
}

function directionTo(goal: number, from: number, fallback: Facing): Facing {
  if (Math.abs(goal - from) < 0.001) return fallback;
  return goal > from ? 1 : -1;
}

function initialTurnPending(spawn: GuardSpawn, at: number, facing: Facing): boolean {
  const next = spawn.route[1];
  return next !== undefined && directionTo(next, at, facing) !== facing;
}

/**
 * 새 직접 자극으로 경계 이상이 된 경비가 짧은 경보 창 동안 같은 층 동료에게 전파한다.
 * 전파 자체는 그 창을 다시 열지 않는다. 한 명이 눈치챈 경보는 방 전체를 깨우되,
 * 시야·소음이 끊긴 뒤 경비끼리 경보를 되받아 수색을 영구 유지하지 않아야 한다.
 */
export function propagationFrom(guards: readonly GuardState[], tuning: Tuning): Map<string, number> {
  const out = new Map<string, number>();
  for (const source of guards) {
    if (GuardStatusRules.isInactive(source)) continue;
    if (SuspicionRules.rank(source.susp.tier) < 2) continue;
    if (source.susp.sinceStimulusMs >= tuning.suspicion.alertDecayDelayMs) continue;
    for (const other of guards) {
      if (other.id === source.id) continue;
      if (GuardStatusRules.isInactive(other)) continue;
      if (other.floor !== source.floor) continue;
      out.set(other.id, (out.get(other.id) ?? 0) + tuning.suspicion.propagation);
    }
  }
  return out;
}

export function tierOf(guard: GuardState): SuspicionTier {
  return guard.susp.tier;
}

/**
 * 쓰러진 동료가 보이는가.
 *
 * 플레이어와 같은 시야 규칙을 그대로 쓴다 — 어두우면 못 보고, 책장 뒤면 못 본다.
 * 그래야 "어두운 데로 끌고 가면 안 들킨다" 는 다음 단계가 자연스럽게 열린다.
 */
function findVisibleBody(
  observer: Observer,
  ctx: GuardStepContext,
  dynamicBlockers: readonly VisionRules.SightBlocker[],
): Vec2 | null {
  const { layout, tuning } = ctx;
  const snuffedLamps = ctx.input.snuffedLamps ?? [];
  for (const at of ctx.input.bodies ?? []) {
    const sample = VisionRules.sample(
      observer,
      { at: { x: at.x, y: at.y - tuning.movement.bodyHeightCrouch / 2 }, halfHeight: tuning.movement.bodyHeightCrouch / 2, pose: "crouch", motion: "still" },
      layout,
      tuning,
      snuffedLamps,
      dynamicBlockers,
    );
    if (sample.exposure >= tuning.guard.bodySeenExposure) return at;
  }
  return null;
}
