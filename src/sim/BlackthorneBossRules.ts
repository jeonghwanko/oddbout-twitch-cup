import { archetypeOf, type CombatProfile } from "./GuardArchetypes";
import * as CombatRules from "./CombatRules";
import { displaceHorizontally } from "./CombatDisplacementRules";
import * as GuardPlanner from "./GuardPlanner";
import type { GuardSpawn, MansionLayout } from "./MansionLayout";
import { isCapturable, isStrikeable } from "./GuardTargetRules";
import { clampGuardXAtPlayerContact } from "./ActorContactRules";
import { onSameFloor } from "./geom";
import { haltGuardMovement } from "./GuardStatusRules";
import { bodyHeight, type PlayerSimState } from "./MovementRules";
import { createRng, nextFloat } from "./rng";
import type { Tuning } from "./tuning";
import type { Facing, RngState, SimEvent, Vec2 } from "./types";
import { BLACKTHORNE_BOSS_ID, isEncounterBoss } from "./BlackthorneBossId";

// 금고지기 ID 는 `BlackthorneBossId`가 소유한다. 이 모듈을 쓰던 곳이 그대로 쓰도록 다시 내보낸다.
export { BLACKTHORNE_BOSS_ID, isEncounterBoss };

export const BLACKTHORNE_BOSS_HP = 12;
export const BLACKTHORNE_BOSS_INTRO_MS = 900;
export const BLACKTHORNE_BOSS_ARENA = Object.freeze({
  left: 1640, right: 2420, entryX: 1602, keeperWallX: 2430, floor: 0,
});

/**
 * 돌진이 멈추는 아레나 경계의 벽 면(월드 x). 오른쪽은 금고지기 철문(`keeperWallX`)이 경계보다
 * 한 뼘 바깥에 선다 — 왼쪽 기둥도 같은 간격으로 세워 돌진이 빈 바닥이 아니라 벽에 부딪히게 한다.
 * 기둥은 렌더(`BlackthorneHeistView`)가 그리고, 벽 금 연출(`ActionEffectCues`)도 같은 면을 쓴다.
 */
export function blackthorneArenaWallFaces(): { readonly left: number; readonly right: number } {
  const gap = BLACKTHORNE_BOSS_ARENA.keeperWallX - BLACKTHORNE_BOSS_ARENA.right;
  return { left: BLACKTHORNE_BOSS_ARENA.left - gap, right: BLACKTHORNE_BOSS_ARENA.keeperWallX };
}

type Pattern = "sweep" | "charge";

/**
 * 결투의 긴장 곡선 — 2막·무방비·열쇠 빼앗기 — 의 수치 SSOT(`docs/Plan/2026-09-27-keeper-fight-tension`).
 *
 * 1막은 휩쓸기↔돌진을 번갈아 가르친다. 체력이 `phase2Hp` 이하가 되면 포효(무적 `phaseShiftMs`)로 박자를
 * 끊고, 2막은 선딜을 줄이고 시드 난수로 다음 공격을 고른다(돌진 두 번 연속은 없다). 마지막 한 칸은 평타로
 * 못 깎는다(`nonPunishHpFloor`) — 대신 그 한 방이 쥔 열쇠를 풀어 `exposedMs` 동안 무엇이든 결정타가 된다.
 */
export const BLACKTHORNE_BOSS_FIGHT = Object.freeze({
  /** 이 체력 이하로 내려가면 2막이다. */
  phase2Hp: 6,
  /** 2막 전환 박자 전체(웅크림 → 포효 → 내려치기 → 낮은 자세). 이 동안 보스는 무적이다. */
  phaseShiftMs: 1200,
  /**
   * 문턱을 넘긴 타격 뒤 전환이 시작되기까지. 그 타격의 피격 자세(hurt-heavy)가 끝나도록 무적으로 서서 기다린다 —
   * 곧장 포효하면 맞은 몸이 한 프레임에 웅크림으로 튀었다(2026-09-27 보스 필름 리뷰).
   */
  phaseShiftLeadMs: 200,
  /**
   * 전환 시작부터 열쇠로 바닥을 내려치는 순간(충격파)까지. 예비 → 절정 순서다: 웅크림(0–200) → 포효(200–650) →
   * 내려치기. 350 은 내려친 뒤에 포효해 절정이 먼저 오고 예비가 뒤따랐다.
   */
  phaseShiftSlamMs: 650,

  shockwaveRadiusPx: 260,
  shockwavePushPx: 90,
  shockwaveStaggerMs: 240,
  /** 2막 선딜. 텔레그래프 모양은 그대로, 박자만 줄어든다(1막 900 / 1150). */
  phase2SweepWindupMs: 650,
  phase2ChargeWindupMs: 800,
  /** 휩쓸기 후딜이 끝나자마자 이어지는 돌진의 선딜. */
  chainChargeWindupMs: 600,
  /** 2막 휩쓸기가 돌진으로 이어질 확률(휩쓸기 시작 때 굴린다). */
  chainChance: 0.4,
  /** 늦게 내려치는 휩쓸기: 치켜든 자세에서 한 박을 더 붙든다. 리듬만으로 구르지 못하게 한다. */
  feintHoldMs: 250,
  feintChance: 1 / 3,
  /** 이어지지 않은 휩쓸기가 끝난 뒤 다음이 돌진일 확률. 돌진 뒤는 언제나 휩쓸기다. */
  chargeAfterSweepChance: 0.5,
  /** 2막 돌진의 피해(휩쓸기는 곤봉 기본 1). */
  phase2ChargeDamage: 2,
  /** 마지막 한 칸에서 평타를 맞으면 열리는 무방비 창. */
  exposedMs: 1400,
  /** 무방비를 놓치면 곧장 내려치는 분노 휩쓸기의 선딜. */
  enragedSweepWindupMs: 500,

  exposedPushbackPx: 28,

  keyCatchMs: 520,
  /** 보스 전용 난수 시드를 런 시드와 섞는 소금. 다른 RNG 소비 순서를 건드리지 않는다. */
  rngSalt: 0x6b33d00d,
});

const F = BLACKTHORNE_BOSS_FIGHT;

/** Stored with the exterior chapter so a retreat does not heal or reroll the boss. */
export interface BlackthorneBossState {
  readonly introduced: boolean;
  readonly introMs: number;
  readonly nextPattern: Pattern;
  readonly pattern: Pattern | null;
  readonly wallCrash: boolean;
  readonly defeated: boolean;
  /**
   * 돌진이 플레이어를 맞힌 순간의 판정 경과(ms). 그 뒤 짧게 미끄러져 멈추고 후딜로 넘어간다.
   * 맞은 사람을 계속 끌고 가지 않게 하는 상태이며, 돌진 판정 밖에서는 비어 있다.
   */
  readonly chargeHitAtMs?: number;
  /** 2막에 들어섰는가(`phase2Hp`). 없으면 1막이다. */
  readonly stage?: 1 | 2;
  /** 2막 전환 포효의 남은 시간(ms). 0 보다 크면 무적이고 공격하지 않는다. */
  readonly shiftMs?: number;
  /** 문턱을 넘긴 뒤 포효가 시작되기까지 남은 시간(ms, `phaseShiftLeadMs`). 이 동안도 무적으로 선다. */
  readonly shiftLeadMs?: number;
  /** 무방비 창의 남은 시간(ms). 0 보다 크면 어떤 타격이든 결정타다. */
  readonly exposedMs?: number;
  /** 지금(또는 다음) 휩쓸기가 무방비를 놓친 뒤의 분노 휩쓸기인가(짧은 선딜). */
  readonly enraged?: boolean;
  /** 이번 휩쓸기가 치켜든 자세에서 한 박 더 붙드는 늦은 내려치기인가. */
  readonly feint?: boolean;
  /** `pending`: 이번 휩쓸기가 후딜 끝에서 돌진으로 이어진다. `charging`: 이번 돌진이 그 이어진 돌진이다. */
  readonly chain?: "pending" | "charging";
  /** 2막 패턴을 고르는 보스 전용 시드 난수. 2막에 들어설 때 런 시드에서 만든다. */
  readonly rng?: RngState;
  /**
   * 결정타로 열쇠를 빼앗긴 순간. `atMs` 는 sim 시각(`SimState.timeMs`) — 연출이 열쇠의 비행을 여기서부터
   * sim 시간으로 센다(히트스톱에 멈추고 슬로모에 늦어진다). `exposed` 는 무방비 자세에서 빼앗겼는가.
   */
  readonly keyStolen?: {
    readonly atMs: number;
    readonly at: Vec2;
    readonly to: Vec2;
    readonly facing: Facing;
    readonly towardPlayer: Facing;
    readonly exposed: boolean;

    readonly caught?: boolean;
  };
}

/** 지금 2막 전환 포효 중인가. */
export function blackthorneBossShifting(state: BlackthorneBossState | undefined): boolean {
  return (state?.shiftMs ?? 0) > 0;
}

/** 지금 무방비(쥔 열쇠가 풀린) 창인가. */
export function blackthorneBossExposed(state: BlackthorneBossState | undefined): boolean {
  return (state?.exposedMs ?? 0) > 0;
}

export interface BlackthorneBossStep {
  readonly state: BlackthorneBossState;
  readonly guardStep: GuardPlanner.GuardStepResult;
}

const BRUISER = archetypeOf("bruiser").combat!;
const SWEEP: CombatProfile = { ...BRUISER,
  engageRangePx: 76, attackRangePx: 82, windupMs: 900, strikeMs: 180,
  recoveryMs: 780, cooldownMs: 340,
};
/** 순항 속도. 판정 520ms 중 첫 80ms 에 0→780 으로 붙어 전체 레인은 약 374px 이다. */
const CHARGE_SPEED_PX_PER_SEC = 780;
const CHARGE_RAMP_MS = 80;
const CHARGE: CombatProfile = { ...BRUISER,
  engageRangePx: 300, attackRangePx: 62, windupMs: 1150, strikeMs: 520,
  recoveryMs: 760, cooldownMs: 450,
  strikeTravelSpeedPxPerSec: CHARGE_SPEED_PX_PER_SEC, strikeTravelRampMs: CHARGE_RAMP_MS,
};
const CRASH_RECOVERY: CombatProfile = { ...CHARGE, recoveryMs: 1800 };

export const CHARGE_SKID_MS = 40;
const CHARGE_HALF_WIDTH = 20;
const CHARGE_HEIGHT = 62;
/** 밀쳐져 경계 밖에 선 몸이 순간이동 없이 제자리로 돌아오는 속도. */
const ARENA_RETURN_PX_PER_SEC = 240;
const ARENA_MIN_X = BLACKTHORNE_BOSS_ARENA.left + CHARGE_HALF_WIDTH;
const ARENA_MAX_X = BLACKTHORNE_BOSS_ARENA.right - CHARGE_HALF_WIDTH;

/**
 * 플레이어 타격의 밀림은 보스 스텝 뒤(`PlayerCombatRules`)에 적용된다. 그 밀림도 전장 경계에서
 * 끊어 경계 밖에 선 몸이 다음 프레임에 되돌아오는 일이 없게 한다. 경계에는 기둥이 그려져 있으므로
 * 끊긴 밀림은 벽꿍(`wallHit`)으로 읽히고, 넉백 거리도 실제로 밀린 만큼으로 줄여 렌더의 따라잡기가
 * sim 과 어긋나지 않게 한다.
 */
export function confineBlackthorneBossKnockback(
  before: readonly GuardPlanner.GuardState[],
  after: readonly GuardPlanner.GuardState[],
  events: readonly SimEvent[],
): { readonly guards: readonly GuardPlanner.GuardState[]; readonly events: readonly SimEvent[] } {
  const boss = after.find(guard => guard.id === BLACKTHORNE_BOSS_ID);
  if (boss === undefined || boss.floor !== BLACKTHORNE_BOSS_ARENA.floor) return { guards: after, events };
  const previous = before.find(guard => guard.id === BLACKTHORNE_BOSS_ID);
  const fromX = previous?.x ?? boss.x;
  // 이미 밖에 서 있던 몸(스텝이 걸어 들이는 중)은 더 밖으로만 못 밀리게 한다.
  const minX = Math.min(ARENA_MIN_X, fromX);
  const maxX = Math.max(ARENA_MAX_X, fromX);
  const x = Math.max(minX, Math.min(maxX, boss.x));
  const overflowPx = Math.abs(boss.x - x);
  if (overflowPx === 0) return { guards: after, events };
  return {
    guards: after.map(guard => guard.id === BLACKTHORNE_BOSS_ID ? { ...guard, x } : guard),
    events: events.map((event): SimEvent => {
      if (event.kind === "CombatHit" && event.guardId === BLACKTHORNE_BOSS_ID) {
        return { ...event, wallHit: true,
          ...(event.knockbackPx === undefined ? {} : { knockbackPx: Math.max(0, event.knockbackPx - overflowPx) }) };
      }
      if (event.kind === "GuardShoved" && event.guardId === BLACKTHORNE_BOSS_ID) {
        return { ...event, at: { ...event.at, x } };
      }
      return event;
    }),
  };
}

/** Shared timing/reach source for combat cues and the encounter step. */
export function blackthorneAttackProfile(state: BlackthorneBossState): CombatProfile {
  // 포효는 모든 타격을 막고, 무방비는 평타 바닥을 치운다. 둘 다 공격 사이클 밖이라 모양은 휩쓸기 그대로다.
  if (blackthorneBossShifting(state) || (state.shiftLeadMs ?? 0) > 0) return SHIFT_PROFILE;
  if (blackthorneBossExposed(state)) return EXPOSED_PROFILE;
  const pattern = state.pattern ?? state.nextPattern;
  const phase2 = state.stage === 2;
  if (pattern === "sweep") {
    const windupMs = state.enraged === true ? F.enragedSweepWindupMs
      : phase2 ? F.phase2SweepWindupMs + (state.feint === true ? F.feintHoldMs : 0)
        : SWEEP.windupMs;
    return windupMs === SWEEP.windupMs ? SWEEP : { ...SWEEP, windupMs };
  }
  const base = state.wallCrash ? CRASH_RECOVERY : CHARGE;
  const windupMs = state.chain === "charging" ? F.chainChargeWindupMs
    : phase2 ? F.phase2ChargeWindupMs : CHARGE.windupMs;
  return windupMs === base.windupMs ? base : { ...base, windupMs };
}

const SHIFT_PROFILE: CombatProfile = Object.freeze({ ...SWEEP, invulnerable: true });
const EXPOSED_PROFILE: CombatProfile = Object.freeze({ ...SWEEP, nonPunishHpFloor: 0 });
/** 평타가 멈추는 마지막 칸. 무방비는 이 칸에서만 열린다. */
const HP_FLOOR = BRUISER.nonPunishHpFloor ?? 1;

const towardTarget = (fromX: number, targetX: number, fallback: Facing): Facing =>
  targetX === fromX ? fallback : targetX < fromX ? -1 : 1;

/** 보스 전용 시드 난수 한 번. 상태가 없으면(1막에서 불렸다면) 소금만으로 만든다. */
function roll(rng: RngState | undefined, chance: number): { readonly rng: RngState; readonly hit: boolean } {
  const draw = nextFloat(rng ?? createRng(F.rngSalt));
  return { rng: draw.state, hit: draw.value < chance };
}

/** 1막에서 마지막으로 시작한(끊긴 것 포함) 공격. 2막 첫 공격이 같은 돌진을 두 번 잇지 않게 한다. */
function lastPatternOf(state: BlackthorneBossState): Pattern {
  return state.pattern ?? (state.nextPattern === "sweep" ? "charge" : "sweep");
}

export function initialBlackthorneBossState(): BlackthorneBossState {
  return { introduced: false, introMs: BLACKTHORNE_BOSS_INTRO_MS,
    nextPattern: "sweep", pattern: null, wallCrash: false, defeated: false };
}

/** Apply once when the authored guard is created; all later damage uses the common combat path. */
export function initializeBlackthorneGuard(guard: GuardPlanner.GuardState): GuardPlanner.GuardState {
  if (guard.id !== BLACKTHORNE_BOSS_ID || guard.combat === null) return guard;
  return { ...guard, combat: { ...guard.combat, hp: BLACKTHORNE_BOSS_HP } };
}

/** The key appears where the boss actually fell, inside reachable arena bounds, on the given floor surface. */
export function blackthorneKeyAt(guard: Pick<GuardPlanner.GuardState, "x">, surfaceY: number): Vec2 {
  return { x: Math.max(1700, Math.min(2380, guard.x)), y: surfaceY };
}

function inArena(guard: GuardPlanner.GuardState, input: GuardPlanner.GuardStepInput): boolean {
  return guard.floor === BLACKTHORNE_BOSS_ARENA.floor
    && input.target.at.x >= BLACKTHORNE_BOSS_ARENA.entryX
    && input.target.at.x <= BLACKTHORNE_BOSS_ARENA.keeperWallX;
}

/**
 * 아레나 경계 안의 발 위치. 보스 자신의 이동(추격·돌진)은 경계에서 바로 멈추고, 외부 밀치기로
 * 이미 밖에 선 몸은 한 프레임에 되돌리지 않고 `ARENA_RETURN_PX_PER_SEC` 로 걸어 들어온다.
 * 경직·기절 프레임도 같은 규칙을 거쳐, 경직이 끝나는 순간 수십 px 순간이동하지 않는다.
 */
function settleInArena(fromX: number, desiredX: number, dtMs: number): number {
  if (desiredX >= ARENA_MIN_X && desiredX <= ARENA_MAX_X) return desiredX;
  if (fromX >= ARENA_MIN_X && fromX <= ARENA_MAX_X) {
    return Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, desiredX));
  }
  const stepPx = ARENA_RETURN_PX_PER_SEC * Math.max(0, dtMs) / 1000;
  return fromX < ARENA_MIN_X
    ? Math.min(ARENA_MIN_X, Math.max(desiredX, fromX + stepPx))
    : Math.max(ARENA_MAX_X, Math.min(desiredX, fromX - stepPx));
}

function stillGuard(base: GuardPlanner.GuardStepResult, original: GuardPlanner.GuardState,
  combat: CombatRules.CombatState | null, dtMs: number): GuardPlanner.GuardStepResult {
  const x = original.floor === BLACKTHORNE_BOSS_ARENA.floor
    ? settleInArena(original.x, original.x, dtMs) : original.x;
  return { ...base, guard: haltGuardMovement({ ...base.guard, x, y: original.y,
    facing: original.facing, combat }), struckPlayer: false };
}

/** 맞힌 뒤 미끄러짐: 맞힌 순간 속도에서 `CHARGE_SKID_MS` 동안 선형으로 멈춘다. */
function chargeSkidPx(speedPxPerSec: number, elapsedMs: number): number {
  const t = Math.max(0, Math.min(CHARGE_SKID_MS, elapsedMs));
  return speedPxPerSec / 1000 * (t - t * t / (2 * CHARGE_SKID_MS));
}

/**
 * 이번 공격에서 몸이 공격 방향으로 더 나아갈 거리. 벽·아레나 경계에서 잘라, 텔레그래프 레인이
 * 보스가 실제로 부딪힐 자리에서 끝나게 한다. 돌진이 아니거나 이미 멈춘 뒤에는 undefined.
 */
function chargeLanePx(
  combat: CombatRules.CombatState,
  state: BlackthorneBossState,
  at: Vec2,
  facing: Facing,
  layout: MansionLayout,
): number | undefined {
  if ((state.pattern ?? state.nextPattern) !== "charge") return undefined;
  let remainingPx: number;
  if (combat.phase === "ready" || combat.phase === "windup") {
    remainingPx = CombatRules.strikeTravelCurvePx(CHARGE, CHARGE.strikeMs);
  } else if (combat.phase === "strike") {
    remainingPx = state.chargeHitAtMs === undefined
      ? CombatRules.strikeTravelCurvePx(CHARGE, CHARGE.strikeMs)
        - CombatRules.strikeTravelCurvePx(CHARGE, combat.phaseMs)
      : 0;
  } else {
    return undefined;
  }
  if (remainingPx <= 0) return 0;
  const probe = displaceHorizontally({ fromX: at.x, deltaX: facing * remainingPx,
    feetY: at.y, halfWidth: CHARGE_HALF_WIDTH, bodyHeight: CHARGE_HEIGHT,
    stayGrounded: true }, layout);
  const stopX = Math.max(ARENA_MIN_X, Math.min(ARENA_MAX_X, probe.x));
  return Math.max(0, Math.min(remainingPx, (stopX - at.x) * facing));
}

/**
 * 보스 몸이 플레이어 몸 접촉 경계(`captureRangePx`)를 넘어 들어가지 않게 자른다. 추격은 일반 경비와 같은
 * 규칙(이미 닿아 있으면 제자리)이고, 돌진(`chargeFacing`)은 앞에 선 몸 앞에서만 멈춘다 — 구르기로 몸 안에
 * 들어온 뒤 돌진이 얼어붙지 않게, 이미 겹쳤거나 등 뒤인 몸은 막지 않는다.
 */
function clampBossAtPlayerBody(
  guard: GuardPlanner.GuardState,
  proposedX: number,
  input: GuardPlanner.GuardStepInput,
  tuning: Tuning,
  chargeFacing: Facing | null,
): number {
  const target = input.target;
  if (input.bodyContactAllowed === false || !isCapturable(target)
    || !onSameFloor(target.at.y, guard.y, tuning.world.floorHeightPx)) return proposedX;
  const contactPx = tuning.guard.captureRangePx;
  if (chargeFacing === null) return clampGuardXAtPlayerContact(guard.x, proposedX, target.at.x, contactPx);
  const aheadPx = (target.at.x - guard.x) * chargeFacing;
  // 경계에 정확히 선 몸은 이미 멈춘 돌진이다(겹침이 아니다) — 여기서 풀면 다음 스텝에 파고든다.
  if (aheadPx < contactPx - 0.001) return proposedX;
  const boundary = target.at.x - chargeFacing * contactPx;
  return (proposedX - boundary) * chargeFacing > 0 ? boundary : proposedX;
}


/**
 * 플레이어 타격이 끝난 뒤(같은 스텝) 금고지기의 결투 상태를 갱신한다. 보스 스텝은 플레이어 타격보다 먼저
 * 돌아 이번 스텝의 적중을 모른다 — 무방비는 "마지막 칸에서 맞았다" 는 사건으로만 열 수 있고, 결정타의
 * 열쇠 빼앗기도 쓰러진 바로 그 스텝에 기록해야 연출이 히트스톱 첫 프레임에 맞는다.
 */
export function observeBlackthorneBossHits(
  previous: BlackthorneBossState | undefined,
  guards: readonly GuardPlanner.GuardState[],
  events: readonly SimEvent[],
  playerAt: Vec2,
  timeMs: number,
  /** 결투장 바닥면 y. 쓰러진 몸이 바닥에 서 있지 않으면(사다리 위) 열쇠는 이 면에 떨어진다. */
  arenaSurfaceY: number,

  playerFacing?: Facing,
): { readonly state: BlackthorneBossState | undefined; readonly events: readonly SimEvent[] } {
  const unchanged = { state: previous, events: [] as readonly SimEvent[] };
  if (previous === undefined) return unchanged;
  const guard = guards.find(candidate => candidate.id === BLACKTHORNE_BOSS_ID);
  const combat = guard?.combat ?? null;
  if (guard === undefined || combat === null) return unchanged;
  const at = { x: guard.x, y: guard.y };
  if (combat.defeated) {
    const stolen = previous.keyStolen;
    if (stolen !== undefined) {
      if (stolen.caught === true || timeMs - stolen.atMs < F.keyCatchMs) return unchanged;
      return {
        state: { ...previous, keyStolen: { ...stolen, caught: true } },
        events: [{ kind: "KeeperKeyCaught", guardId: guard.id, at: playerAt,
          facing: playerFacing ?? towardTarget(playerAt.x, guard.x, 1) }],
      };
    }
    const keyAt = blackthorneKeyAt(guard, guard.climbLinkId === null ? guard.y : arenaSurfaceY);
    const towardPlayer = towardTarget(guard.x, playerAt.x, guard.facing);
    return {
      state: { ...previous, defeated: true, exposedMs: 0, pattern: null, chargeHitAtMs: undefined,
        keyStolen: { atMs: timeMs, at, to: keyAt, facing: guard.facing, towardPlayer,
          exposed: blackthorneBossExposed(previous) } },
      events: [{ kind: "KeeperKeyStolen", guardId: guard.id, at, keyAt, facing: guard.facing, towardPlayer }],
    };
  }
  const hit = events.some(event => event.kind === "CombatHit" && event.guardId === guard.id);
  if (!hit || previous.stage !== 2 || blackthorneBossShifting(previous) || blackthorneBossExposed(previous)
    || combat.hp > HP_FLOOR) return unchanged;
  return {
    state: { ...previous, exposedMs: F.exposedMs, pattern: null, chain: undefined, feint: false,
      enraged: false, wallCrash: false, chargeHitAtMs: undefined },
    events: [{ kind: "KeeperExposed", guardId: guard.id, at, facing: guard.facing, windowMs: F.exposedMs }],
  };
}


export function shoveFromKeeperShockwave(
  player: PlayerSimState,
  shockwave: { readonly at: Vec2; readonly radiusPx: number },
  layout: MansionLayout,
  tuning: Tuning,
): { readonly player: PlayerSimState; readonly pushedPx: number; readonly facing: Facing } {
  return shovePlayerFromKeeper(player, shockwave.at, shockwave.radiusPx, F.shockwavePushPx, F.shockwaveStaggerMs,
    layout, tuning);
}


export function shoveFromKeeperExposed(
  player: PlayerSimState,
  keeperAt: Vec2,
  layout: MansionLayout,
  tuning: Tuning,
): { readonly player: PlayerSimState; readonly pushedPx: number; readonly facing: Facing } {
  return shovePlayerFromKeeper(player, keeperAt, Number.POSITIVE_INFINITY, F.exposedPushbackPx, 0, layout, tuning);
}

function shovePlayerFromKeeper(
  player: PlayerSimState,
  from: Vec2,
  radiusPx: number,
  pushPx: number,
  staggerMs: number,
  layout: MansionLayout,
  tuning: Tuning,
): { readonly player: PlayerSimState; readonly pushedPx: number; readonly facing: Facing } {
  const dx = player.x - from.x;
  const facing: Facing = dx < 0 ? -1 : 1;
  if (Math.abs(dx) > radiusPx
    || !onSameFloor(player.y, from.y, tuning.world.floorHeightPx)) return { player, pushedPx: 0, facing };
  const halfWidth = tuning.movement.bodyWidth / 2;
  const moved = displaceHorizontally({ fromX: player.x, deltaX: facing * pushPx,
    feetY: player.y, halfWidth, bodyHeight: bodyHeight(player.pose, tuning), stayGrounded: false }, layout);
  const minX = Math.min(player.x, BLACKTHORNE_BOSS_ARENA.left + halfWidth);
  const maxX = Math.max(player.x, BLACKTHORNE_BOSS_ARENA.keeperWallX - halfWidth);
  const x = Math.max(minX, Math.min(maxX, moved.x));
  const pushedPx = Math.abs(x - player.x);
  if (pushedPx === 0) return { player, pushedPx, facing };
  return {
    player: { ...player, x, vx: 0, motion: "still",
      staggerMs: Math.max(player.staggerMs, staggerMs) },
    pushedPx,
    facing,
  };
}

/**
 * Preserve GuardPlanner's detection, pursuit and poise while replacing only the authored
 * guard's attack cycle. CombatRules remains the sole strike/dodge/recovery judge.
 *
 * 2막 전환(포효)과 무방비 창은 공격 사이클 밖의 저작 박자다. 둘 다 몸을 세우고, 피해 계약(무적·평타 바닥 0)은
 * 프로필 덮어쓰기로 PlayerCombatRules 에 넘긴다. `seed` 는 2막 패턴 난수의 씨앗(런 RNG 상태)이다.
 */
export function stepBlackthorneBoss(
  previous: BlackthorneBossState | undefined,
  guardBefore: GuardPlanner.GuardState,
  input: GuardPlanner.GuardStepInput,
  spawn: GuardSpawn,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
  encounterEntered: boolean,
  seed = 0,
): BlackthorneBossStep {
  let state = previous ?? initialBlackthorneBossState();
  let guard = guardBefore;
  // A ready dummy keeps standard patrol/perception alive without starting a second club attack.
  const planningGuard = guard.combat === null ? guard : {
    ...guard,
    combat: CombatRules.resetAttackCycle(guard.combat),
  };
  const base = GuardPlanner.step(planningGuard, {
    ...input, canStartAttack: false, bodyContactAt: undefined,
    bodyContactAllowed: false, holdingTarget: false,
  }, spawn, layout, tuning, dtMs);
  let combat = guard.combat;
  if (guard.id !== BLACKTHORNE_BOSS_ID || combat === null) {
    return { state, guardStep: base };
  }
  if (combat.defeated || state.defeated) {
    return { state: { ...state, defeated: true, pattern: null, chargeHitAtMs: undefined, exposedMs: 0 },
      guardStep: { ...base, guard: { ...base.guard, combat }, struckPlayer: false } };
  }
  if (!encounterEntered || !inArena(guard, input)) {
    // Leaving cancels the current windup, but keeps HP and the next attack choice.
    const resting = { ...CombatRules.resetAttackCycle(combat), profileOverride: undefined };
    return { state: { ...state, pattern: null, wallCrash: false, chargeHitAtMs: undefined },
      guardStep: stillGuard(base, guard, resting, dtMs) };
  }
  if (!state.introduced) {
    const introMs = Math.max(0, state.introMs - dtMs);
    return { state: { ...state, introduced: introMs === 0, introMs },
      guardStep: stillGuard(base, guard, { ...CombatRules.resetAttackCycle(combat), profileOverride: undefined }, dtMs) };
  }

  const at = { x: guard.x, y: guard.y };
  const towardPlayer = towardTarget(guard.x, input.target.at.x, guard.facing);
  // ── 2막 전환: 체력이 문턱을 넘은 첫 스텝에 하던 공격을 버리고, 그 타격의 피격 자세가 끝나도록
  // `phaseShiftLeadMs` 동안 무적으로 선 뒤 발을 박는다. 경직도 이 박자가 이긴다.
  const shiftEvents: SimEvent[] = [];
  if ((state.stage ?? 1) === 1 && combat.hp <= F.phase2Hp) {
    const leadMs = (state.shiftLeadMs ?? F.phaseShiftLeadMs) - dtMs;
    if (leadMs > 0) {
      const resting = { ...CombatRules.resetAttackCycle(combat), profileOverride: SHIFT_PROFILE };
      return { state: { ...state, shiftLeadMs: leadMs, chargeHitAtMs: undefined },
        guardStep: stillGuard(base, guard, resting, dtMs) };
    }
    state = { ...state, shiftLeadMs: undefined, stage: 2, shiftMs: F.phaseShiftMs, exposedMs: 0, pattern: null,
      nextPattern: lastPatternOf(state) === "charge" ? "sweep" : "charge",
      wallCrash: false, chargeHitAtMs: undefined, enraged: false, feint: false, chain: undefined,
      rng: createRng((seed ^ F.rngSalt) >>> 0) };
    shiftEvents.push({ kind: "KeeperPhaseShifted", guardId: guard.id, at, facing: towardPlayer });
  }
  if (blackthorneBossShifting(state)) {
    const fromMs = F.phaseShiftMs - state.shiftMs!;
    const shiftMs = Math.max(0, state.shiftMs! - dtMs);
    const toMs = F.phaseShiftMs - shiftMs;
    const next: BlackthorneBossState = { ...state, shiftMs };
    const events: SimEvent[] = [...base.events, ...shiftEvents];
    if (fromMs < F.phaseShiftSlamMs && toMs >= F.phaseShiftSlamMs) {
      events.push({ kind: "KeeperRoarShockwave", guardId: guard.id, at, radiusPx: F.shockwaveRadiusPx });
    }
    const resting = { ...CombatRules.resetAttackCycle(combat), profileOverride: blackthorneAttackProfile(next) };
    const still = stillGuard(base, { ...guard, facing: towardPlayer }, resting, dtMs);
    return { state: next, guardStep: { ...still, events } };
  }

  // ── 무방비: 쥔 열쇠가 풀려 휘청인다. 창을 놓치면 열쇠를 다시 움켜쥐고 짧은 분노 휩쓸기로 되받는다.
  if (blackthorneBossExposed(state)) {
    const exposedMs = Math.max(0, state.exposedMs! - dtMs);
    const resting = CombatRules.resetAttackCycle(combat);
    if (exposedMs > 0) {
      return { state: { ...state, exposedMs },
        guardStep: stillGuard(base, guard, { ...resting, profileOverride: EXPOSED_PROFILE }, dtMs) };
    }
    state = { ...state, exposedMs: 0, enraged: true, pattern: null, nextPattern: "sweep",
      feint: false, chain: undefined };
    if (input.canStartAttack !== false) {
      const next: BlackthorneBossState = { ...state, pattern: "sweep" };
      const windup = CombatRules.enterCombatPhase(resting, "windup", { struck: false, attackFacing: towardPlayer });
      const still = stillGuard(base, { ...guard, facing: towardPlayer },
        { ...windup, profileOverride: blackthorneAttackProfile(next) }, dtMs);
      return { state: next, guardStep: { ...still, events: [...base.events, {
        kind: "GuardAttackTelegraphed", guardId: guard.id, attackKind: "melee", at, facing: towardPlayer,
      }] } };
    }
    combat = { ...resting, profileOverride: blackthorneAttackProfile(state) };
    guard = { ...guard, combat };
  }

  if (guard.staggerMs > 0 || guard.knockedOut) {
    return { state, guardStep: stillGuard(base, guard, combat, dtMs) };
  }

  const pattern = state.pattern ?? state.nextPattern;
  const profile = blackthorneAttackProfile(state);
  const attacking = combat.phase !== "ready" && combat.phase !== "cooldown";
  // Telegraph and strike both keep their initial heading, even if the target rolls behind.
  const facing: Facing = attacking ? combat.attackFacing ?? guard.facing
    : input.target.at.x < guard.x ? -1 : 1;
  const activeGuard = attacking ? guard : { ...guard, facing };
  // Patrol/chase closes distance while ready; only committed attacks hold their origin.
  let x = settleInArena(guard.x,
    combat.phase === "ready" || combat.phase === "cooldown" ? base.guard.x : activeGuard.x, dtMs);
  let wallCrash = state.wallCrash;
  let collision = false;
  const charging = pattern === "charge" && combat.phase === "strike";
  const hitAtMs = charging ? state.chargeHitAtMs : undefined;
  if (charging) {
    // 순항 곡선(판정 경과 기준)을 스텝 간 차분으로 적용해 프레임 길이와 무관하게 같은 거리를 간다.
    const fromMs = combat.phaseMs;
    const toMs = Math.min(CHARGE.strikeMs, fromMs + dtMs);
    let advancePx: number;
    if (hitAtMs === undefined) {
      advancePx = CombatRules.strikeTravelCurvePx(CHARGE, toMs) - CombatRules.strikeTravelCurvePx(CHARGE, fromMs);
    } else {
      const hitSpeed = CombatRules.strikeTravelSpeedAt(CHARGE, hitAtMs);
      advancePx = chargeSkidPx(hitSpeed, fromMs + dtMs - hitAtMs) - chargeSkidPx(hitSpeed, fromMs - hitAtMs);
    }
    const moved = displaceHorizontally({ fromX: guard.x,
      deltaX: facing * advancePx,
      feetY: guard.y, halfWidth: CHARGE_HALF_WIDTH, bodyHeight: CHARGE_HEIGHT,
      stayGrounded: true }, layout);
    x = settleInArena(guard.x, moved.x, dtMs);
    // 경계 밖으로 나가려던 전진만 충돌이다. 밀쳐진 뒤 안쪽으로 걸어 들어오는 보정은 아니다.
    const pastBound = facing < 0 ? moved.x < ARENA_MIN_X && x > moved.x
      : moved.x > ARENA_MAX_X && x < moved.x;
    collision = moved.blockedBy !== null || pastBound;
    wallCrash ||= collision;
  }
  // 보스는 포박을 끄려고 GuardPlanner 에 bodyContactAllowed:false 를 넘기므로 일반 경비의 접촉 클램프가
  // 입력 없이 미끄러지는 몸이 된다(2026-09-26 사용자 보고).
  x = clampBossAtPlayerBody(guard, x, input, tuning, charging ? facing : null);
  const result = CombatRules.step(combat, {
    attackerId: guard.id, self: { x, y: guard.y }, facing,
    target: input.target.at, targetInvulnerable: input.target.invulnerable,
    targetHittable: isStrikeable(input.target), engaged: base.exposure > 0
      && Math.abs(input.target.at.x - guard.x) <= profile.engageRangePx,
    canStartAttack: input.canStartAttack !== false,
    lineOfFireClear: true,
  }, profile, tuning, dtMs);
  const events: SimEvent[] = [...base.events, ...result.events];
  let nextCombat = result.state;
  let chargeHitAtMs = hitAtMs;
  if (collision) {
    nextCombat = CombatRules.enterCombatPhase(nextCombat, "recovery", { struck: true });
    events.push({ kind: "GuardRecoveryOpened", guardId: guard.id, at: { x, y: guard.y } });
    // 부딪힌 프레임 한 번만. 다음 스텝부터는 후딜이라 돌진 이동 자체가 없다.
    events.push({ kind: "GuardChargeCrashed", guardId: guard.id, at: { x, y: guard.y }, facing });
  } else if (charging && result.hitPlayer) {
    // 맞힌 사람을 벽까지 끌고 가지 않는다. 이 스텝 끝의 판정 경과부터 짧게 미끄러져 멈춘다.
    chargeHitAtMs = nextCombat.phaseMs;
  } else if (hitAtMs !== undefined && nextCombat.phase === "strike"
    && nextCombat.phaseMs - hitAtMs >= CHARGE_SKID_MS) {
    nextCombat = CombatRules.enterCombatPhase(nextCombat, "recovery", { struck: true });
    events.push({ kind: "GuardRecoveryOpened", guardId: guard.id, at: { x, y: guard.y } });
  }
  if (nextCombat.phase !== "strike") chargeHitAtMs = undefined;
  const phase2 = state.stage === 2;
  if (result.hitPlayer) {
    events.push({ kind: "PlayerStruck", guardId: guard.id, at: input.target.at,
      tier: pattern === "sweep" ? "heavy" : "dash", facing,
      ...(phase2 && pattern === "charge" ? { damage: F.phase2ChargeDamage } : {}) });
  }
  const started = combat.phase === "ready" && nextCombat.phase === "windup";
  const completed = combat.phase === "cooldown" && nextCombat.phase === "ready";
  const recoveryDone = combat.phase === "recovery" && nextCombat.phase === "cooldown";
  let currentPattern: Pattern | null = completed ? null : started ? pattern : state.pattern;
  let nextPattern: Pattern = state.nextPattern;
  let { rng, feint, chain, enraged } = state;
  if (started && phase2 && pattern === "sweep" && enraged !== true) {
    // 2막 휩쓸기: 늦은 내려치기와 돌진 잇기를 시작할 때 정한다(선딜 길이·예고가 첫 프레임부터 참이다).
    const hold = roll(rng, F.feintChance);
    const link = roll(hold.rng, F.chainChance);
    rng = link.rng;
    feint = hold.hit;
    chain = link.hit ? "pending" : undefined;
  }
  if (recoveryDone && pattern === "sweep" && chain === "pending") {
    chain = undefined;
    if (input.canStartAttack !== false) {
      // 휩쓸기 후딜의 반격 창은 그대로 준 뒤, 쉬지 않고 돌진을 예고한다.
      const chargeFacing = towardTarget(x, input.target.at.x, facing);
      nextCombat = CombatRules.enterCombatPhase(nextCombat, "windup", { struck: false, attackFacing: chargeFacing });
      events.push({ kind: "GuardAttackTelegraphed", guardId: guard.id, attackKind: "melee",
        at: { x, y: guard.y }, facing: chargeFacing });
      currentPattern = "charge";
      chain = "charging";
      feint = false;
    }
  }
  if (completed) {
    if (!phase2) nextPattern = pattern === "sweep" ? "charge" : "sweep";
    else if (pattern === "charge") nextPattern = "sweep";
    else {
      const next = roll(rng, F.chargeAfterSweepChance);
      rng = next.rng;
      nextPattern = next.hit ? "charge" : "sweep";
    }
    chain = undefined;
    feint = false;
    enraged = false;
  }
  const nextState: BlackthorneBossState = {
      ...state,
      pattern: currentPattern,
      nextPattern,
      wallCrash: completed ? false : wallCrash,
      chargeHitAtMs,
      ...(phase2 ? { rng, feint, chain, enraged } : {}),
    };
  const nextProfile = blackthorneAttackProfile(nextState);
  const nextFacing: Facing = nextCombat.attackFacing ?? facing;
  const lanePx = chargeLanePx(nextCombat, nextState, { x, y: guard.y }, nextFacing, layout);
  return {
    state: nextState,
    guardStep: {
      ...base,
      guard: { ...base.guard, x, y: guard.y, facing,
        moving: x !== guard.x, combat: {
          ...nextCombat,
          profileOverride: lanePx === undefined ? nextProfile : { ...nextProfile, strikeTravelPx: lanePx },
        } },
      events,
      struckPlayer: result.hitPlayer,
    },
  };
}
