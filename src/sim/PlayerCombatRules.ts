import type { GuardState } from "./GuardPlanner";
import { archetypeOf } from "./GuardArchetypes";
import type { MansionLayout } from "./MansionLayout";
import type { PlayerSimState } from "./MovementRules";
import * as CombatRules from "./CombatRules";
import type { Facing, InputFrame, SimEvent } from "./types";
import type { Tuning } from "./tuning";
import { canBeCombatTarget, immobilize } from "./GuardStatusRules";
import type { AttackMove, AttackMoveId } from "./AttackMoves";
import { moveOf, moveReachPx, movesBody, playerMove, rootMotionPxAt } from "./AttackMoves";
import { absorbedImpulse, alertGuard, applyCombatImpulse, impulseFor, impulseForHit } from "./CombatImpulse";
import { absorbsStun, breakPoise, registerStun } from "./StaggerResistanceRules";
import type { Reach } from "./CombatReach";
import { forwardDistance, withinReach } from "./CombatReach";

/**
 * 평타가 닿는 높이 차.
 *
 * 적의 근접 판정(층 높이의 절반)보다 좁다. 플레이어 쪽을 넓히면 공격이 관대해져
 * 밸런스가 움직이므로, 통일이 아니라 각자의 값을 명시하는 쪽을 택했다.
 * 전방 판정과 같은 1.2배로 함께 넓힌다 — 한쪽만 넓히면 "닿았는데 안 맞는" 구간이 이동한다.
 */
const PLAYER_MELEE_VERTICAL_PX = 84;

/**
 * 몸이 소유한 공격의 종류.
 *
 * 밀치기(피해 없는 탈출기)를 지우고 그 입력에 강공격을 앉혔다. 세 값 모두 공격이므로
 * 커밋 판정은 `attackMoveId` 하나가 소유하고, 여기는 어느 원화·연출을 쓸지만 가른다.
 */
export type PlayerCombatAction = "attack" | "heavy" | "dash";

export interface PlayerCombatState {
  readonly action: PlayerCombatAction | null;
  readonly actionMs: number;
  readonly attackCooldownMs: number;
  /** 0보다 크면 공격 준비 중이다. 0으로 교차하는 고정 sim 스텝에서 한 번만 판정한다. */
  readonly attackContactMs: number;
  /** 준비 동작을 시작할 때 잠근 무브·타수·방향·반격 대상. 접촉 전에 바뀌지 않는다. */
  readonly attackMoveId: AttackMoveId | null;
  readonly attackCombo: 0 | 1 | 2 | 3;
  readonly attackFacing: -1 | 1;
  readonly attackCounterGuardId: string | null;
  /** 가면 기습(무기 개조): 가면을 쓴 채 시작한 공격. 접촉 판정이 등 뒤로 읽는다. simulation이 소유한다. */
  readonly attackAmbush?: true;
  /**
   * 행동 전체(예비 → 접촉 → 회수) 동안 유지되는 무브. `attackMoveId` 는 접촉에서 풀리지만
   * 회수 중 몸의 걸음(`followStepPx`)은 여전히 어떤 무브인지 알아야 한다.
   */
  readonly actionMoveId: AttackMoveId | null;
  /**
   * 마지막으로 **유효타**를 낸 사슬 타수와 그 창. 발밑 타수 UI·콤보 붕괴 연출·반격 규칙이 읽는
   * 명중 확인형 값이다. 사슬이 몇 번째 타를 낼지는 `chainCombo` 가 정한다.
   */
  readonly combo: 0 | 1 | 2 | 3;
  readonly comboWindowMs: number;
  /**
   * 마지막으로 **휘두른** 사슬 타수와 그 창. 헛쳐도 진행한다(2026-09-24 사용자 결정:
   * C 세 번 = 잽 → 스트레이트 → 피니셔). 강공격·대시·완벽 반격·피격 취소가 끊는다.
   */
  readonly chainCombo: 0 | 1 | 2 | 3;
  readonly chainWindowMs: number;
  /**
   * 공격 중 눌린 점프·회피. 버리지 않고 회수 취소 창이 열리는 틱에 발동한다.
   * 공격 예약(`attackBufferMs`)과 한 칸을 나눠 쓴다 — 나중에 누른 쪽이 이긴다.
   */
  readonly bufferedVerb: BufferedVerb | null;
  readonly verbBufferMs: number;
  /** 다음 공격 예약. 렌더 프레임이 아니라 고정 sim 시간으로 감소한다. */
  readonly attackBufferMs: number;
  /**
   * 예약된 무브. null 은 "사슬의 다음 타" 라는 뜻이고, 값이 있으면 그 단발 무브다.
   * 회수 중 눌린 V 가 콤보 엔더로 살아남는 자리다.
   */
  readonly bufferedMoveId: AttackMoveId | null;
  /** 완벽 회피를 유발한 상대만 전용 반격의 대상이 된다. */
  readonly counterGuardId: string | null;
  readonly counterWindowMs: number;
  /** 근접 회피 때 이미 누르고 있던 이동축을 중립 입력 전까지 무시하는가. */
  readonly counterMovementLocked: boolean;
}

/** 공격 중 예약할 수 있는 이동 동사. 회피는 누른 순간의 방향을 잠근다. */
export type BufferedVerb =
  | { readonly kind: "jump" }
  | { readonly kind: "dodge"; readonly direction: -1 | 1 };

export type PlayerCombatActivity = "idle" | "attacking";

export function activityOf(state: Pick<PlayerCombatState, "action" | "actionMs">): PlayerCombatActivity {
  return state.actionMs <= 0 || state.action === null ? "idle" : "attacking";
}

/** 강공격·대시는 회수 중 평타 예약을 받지 않는다. 무게 있는 한 방이 연타에 묻히면 안 된다. */
function isCommittedHeavyAction(action: PlayerCombatAction | null): boolean {
  return action === "heavy" || action === "dash";
}

export function invariantViolations(state: PlayerCombatState): string[] {
  const violations: string[] = [];
  if ((state.action === null) !== (state.actionMs === 0)) violations.push("combat action and timer disagree");
  if (state.action === null && (
    state.attackContactMs > 0
    || state.attackMoveId !== null
    || state.attackCounterGuardId !== null
  )) {
    violations.push("attack commitment exists outside attack action");
  }
  if ((state.attackContactMs > 0) !== (state.attackMoveId !== null)) {
    violations.push("attack contact timer and committed move disagree");
  }
  if (state.attackMoveId === null && state.attackCombo > 0) {
    violations.push("committed combo exists without a committed move");
  }
  if (state.bufferedMoveId !== null && state.attackBufferMs <= 0) {
    violations.push("buffered move exists outside the input buffer window");
  }
  if ((state.action === null) !== (state.actionMoveId === null)) {
    violations.push("combat action and action move disagree");
  }
  if (state.bufferedVerb !== null && state.verbBufferMs <= 0) {
    violations.push("buffered verb exists outside the input buffer window");
  }
  if ((state.combo === 0) !== (state.comboWindowMs === 0)) violations.push("combo and window disagree");
  if ((state.chainCombo === 0) !== (state.chainWindowMs === 0)) violations.push("chain and window disagree");
  if ((state.counterGuardId === null) !== (state.counterWindowMs === 0)) {
    violations.push("counter target and window disagree");
  }
  if (state.counterMovementLocked && (state.counterGuardId === null || state.counterWindowMs <= 0)) {
    violations.push("counter movement lock exists outside counter window");
  }
  return violations;
}

function normalizeActionState(state: PlayerCombatState): PlayerCombatState {
  const activity = activityOf(state);
  const attackCommitted = activity === "attacking" && state.attackContactMs > 0 && state.attackMoveId !== null;
  const actionState: PlayerCombatState = activity === "idle"
    ? {
        ...state,
        action: null,
        actionMs: 0,
        actionMoveId: null,
        attackContactMs: 0,
        attackMoveId: null,
        attackCombo: 0,
        attackCounterGuardId: null,
      }
    : {
        ...state,
        // 예전 상태(필드 추가 전 스냅샷)에는 행동 무브가 없다. 잠긴 무브가 있으면 그것을 쓴다.
        actionMoveId: state.actionMoveId ?? state.attackMoveId ?? null,
        attackContactMs: attackCommitted ? state.attackContactMs : 0,
        attackMoveId: attackCommitted ? state.attackMoveId : null,
        attackCombo: attackCommitted ? state.attackCombo : 0,
        attackCounterGuardId: attackCommitted ? state.attackCounterGuardId : null,
      };
  const comboActive = actionState.combo > 0 && actionState.comboWindowMs > 0;
  // 필드 추가 전 스냅샷은 사슬 값이 없다. 그때는 명중 확인형 콤보가 곧 사슬이었다.
  const chainCombo = actionState.chainCombo ?? actionState.combo;
  const chainWindowMs = actionState.chainWindowMs ?? actionState.comboWindowMs;
  const chainActive = chainCombo > 0 && chainWindowMs > 0;
  const verbBufferMs = actionState.verbBufferMs ?? 0;
  const counterActive = actionState.counterGuardId !== null && actionState.counterWindowMs > 0;
  return {
    ...actionState,
    bufferedMoveId: actionState.attackBufferMs > 0 ? actionState.bufferedMoveId : null,
    bufferedVerb: verbBufferMs > 0 ? actionState.bufferedVerb ?? null : null,
    verbBufferMs: verbBufferMs > 0 && actionState.bufferedVerb != null ? verbBufferMs : 0,
    combo: comboActive ? actionState.combo : 0,
    comboWindowMs: comboActive ? actionState.comboWindowMs : 0,
    chainCombo: chainActive ? chainCombo : 0,
    chainWindowMs: chainActive ? chainWindowMs : 0,
    counterGuardId: counterActive ? actionState.counterGuardId : null,
    counterWindowMs: counterActive ? actionState.counterWindowMs : 0,
    counterMovementLocked: counterActive && actionState.counterMovementLocked,
  };
}

export function createPlayerCombat(): PlayerCombatState {
  return {
    action: null,
    actionMs: 0,
    attackCooldownMs: 0,
    attackContactMs: 0,
    attackMoveId: null,
    attackCombo: 0,
    attackFacing: 1,
    attackCounterGuardId: null,
    actionMoveId: null,
    combo: 0,
    comboWindowMs: 0,
    chainCombo: 0,
    chainWindowMs: 0,
    bufferedVerb: null,
    verbBufferMs: 0,
    attackBufferMs: 0,
    bufferedMoveId: null,
    counterGuardId: null,
    counterWindowMs: 0,
    counterMovementLocked: false,
  };
}

/**
 * 몸이 공격을 계속 붙잡을 수 있는 자세인가. 은신·사다리·환기구·경직 중에는 판정도 걸음도 없다.
 * `step` 의 취소 판정과 `rootMotionStepPx` 의 걸음 판정이 같은 조건을 봐야 취소된 공격이
 * 몸만 앞으로 끌고 가는 틱이 안 생긴다.
 */
function canHoldAttack(player: PlayerSimState): boolean {
  return player.hideSpotId === null
    && player.climbLinkId === null
    && player.ventLinkId === null
    && player.staggerMs <= 0;
}

/** 공격 시작부터 흐른 시간. 접촉 전에는 접촉 타이머가 소유해 접촉 틱에 정확히 `contactMs` 가 된다. */
function attackElapsedMs(move: AttackMove, contactRemainingMs: number, actionRemainingMs: number): number {
  return contactRemainingMs > 0
    ? move.contactMs - contactRemainingMs
    : Math.max(move.contactMs, move.actionMs - actionRemainingMs);
}

/**
 * 이번 고정 스텝에 공격이 몸을 옮길 부호 있는 계획 거리(벽·몸은 아직 모름).
 *
 * `step` 보다 먼저 불러야 한다: 접촉 틱의 걸음까지 끝낸 자리에서 사거리를 재야 앞발이
 * 닿는 순간과 판정 순간이 같다. 지상에서만 딛는다 — 공중에서 누른 공격은 착지 틱까지 예약될 뿐이다.
 */
export function rootMotionStepPx(state: PlayerCombatState, player: PlayerSimState, dtMs: number): number {
  const moveId = state.actionMoveId ?? state.attackMoveId ?? null;
  if (state.action === null || state.actionMs <= 0 || moveId === null || dtMs <= 0) return 0;
  if (!player.onGround || !canHoldAttack(player)) return 0;
  const move = moveOf(moveId);
  if (!movesBody(move)) return 0;
  const before = attackElapsedMs(move, state.attackContactMs, state.actionMs);
  const after = attackElapsedMs(
    move,
    Math.max(0, state.attackContactMs - dtMs),
    Math.max(0, state.actionMs - dtMs),
  );
  const delta = rootMotionPxAt(move, after) - rootMotionPxAt(move, before);
  return delta === 0 ? 0 : state.attackFacing * delta;
}

/**
 * 공격 중 눌린 점프·회피가 지금 발동해도 되는가.
 *
 * 접촉 전에는 절대 안 된다 — 판정을 버리고 도망치는 캔슬은 무게를 없앤다. 접촉 뒤에는
 * 다음 평타를 받는 회수 취소 창(`cooldownMs < actionMs`)과 같은 틱에 열리고, 강공격·대시처럼
 * 쿨다운이 행동보다 긴 무브는 행동이 끝나는 틱에 열린다. 이 스텝 안에 0이 되는 타이머도
 * 열린 것으로 본다 — 공격 예약이 발동하는 틱과 같다.
 */
export function verbCancelReady(state: PlayerCombatState, dtMs: number): boolean {
  if (state.action === null || state.actionMs <= dtMs) return true;
  return state.attackMoveId === null && state.attackContactMs <= 0 && state.attackCooldownMs <= dtMs;
}

/** 공격 중 누른 점프·회피를 예약한다. 먼저 있던 공격 예약은 지운다 — 나중에 누른 쪽이 이긴다. */
export function bufferVerb(state: PlayerCombatState, verb: BufferedVerb, tuning: Tuning): PlayerCombatState {
  return {
    ...state,
    bufferedVerb: verb,
    verbBufferMs: tuning.combat.attackInputBufferMs,
    attackBufferMs: 0,
    bufferedMoveId: null,
  };
}

/**
 * 예약된(또는 방금 누른) 이동 동사를 발동하며 남은 회수를 끊는다.
 *
 * 쿨다운은 그대로 둔다. 강공격 뒤 점프가 강공격의 재사용 대기까지 지워 주면 안 된다.
 */
export function releaseForVerb(state: PlayerCombatState): PlayerCombatState {
  return {
    ...state,
    action: null,
    actionMs: 0,
    actionMoveId: null,
    attackContactMs: 0,
    attackMoveId: null,
    attackCombo: 0,
    attackCounterGuardId: null,
    bufferedVerb: null,
    verbBufferMs: 0,
  };
}

/** 한 번의 완벽 회피는 실제 공격자 한 명에게만 반격 권리를 연다. */
export function openCounterWindow(
  state: PlayerCombatState,
  guardId: string,
  durationMs: number,
  lockHeldMovement = false,
): PlayerCombatState {
  return {
    ...state,
    counterGuardId: guardId,
    counterWindowMs: durationMs,
    counterMovementLocked: lockHeldMovement,
  };
}

export interface PlayerCombatResult {
  readonly state: PlayerCombatState;
  readonly guards: readonly GuardState[];
  readonly events: readonly SimEvent[];
  readonly staminaCost: number;
  readonly engaged: boolean;
  /**
   * 접촉 정산과 함께 공격자 자신이 전진해야 하는 부호 있는 거리.
   *
   * 몸을 옮기는 것은 `simulation` 의 일이다 — 기하 충돌을 아는 쪽이 한 곳뿐이어야
   * 대시 공격만 벽을 통과하는 사고가 안 난다.
   */
  readonly lungePx: number;
  /** 이번 스텝에 새로 시작한 무브. 몸을 스스로 옮기는 무브는 `simulation` 이 관성을 끊는다. */
  readonly startedMoveId: AttackMoveId | null;
}

export function step(
  state: PlayerCombatState,
  input: InputFrame,
  player: PlayerSimState,
  guards: readonly GuardState[],
  stamina: number,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
): PlayerCombatResult {
  const normalized = normalizeActionState(state);
  const cooled = tick(normalized, dtMs, input.moveX === 0);
  if (player.hideSpotId !== null && (input.heavy || input.attack)) {
    const cancelled = cancelPendingAttack(cooled, player);
    return {
      ...idle({ ...cancelled.state, attackBufferMs: 0, bufferedMoveId: null, bufferedVerb: null, verbBufferMs: 0 }, guards),
      events: [...cancelled.events, {
        kind: "ActionRejected",
        action: input.heavy ? "heavy" : "attack",
        reason: "hidden",
        at: atOf(player),
      }],
    };
  }
  const canQueueAttack = canHoldAttack(player);
  const canAct = canQueueAttack && player.dodgeMs <= 0;

  if (!canQueueAttack) {
    const cancelled = cancelPendingAttack(cooled, player);
    // 맞거나 매달린 몸은 공격 중 눌러 둔 점프·회피도 잃는다. 경직이 풀린 순간 저절로
    // 튀어 나가면 조작이 아니라 버그로 읽힌다.
    return {
      ...idle({ ...cancelled.state, attackBufferMs: 0, bufferedMoveId: null, bufferedVerb: null, verbBufferMs: 0 }, guards),
      events: cancelled.events,
    };
  }

  // 입력 순간이 아니라 원화의 완전 신장 키프레임에서 사거리와 피해를 샘플링한다.
  // 한 스텝이 접촉 시점을 넘어가도 커밋한 무브를 지우기 전에 정확히 한 번 정산한다.
  // 같은 고정 스텝에 후속 입력도 들어왔다면 먼저 현재 타격의 예약으로 묶는다. 접촉 정산 뒤에
  // 처리하면 헛친 타격이 콤보를 끊은 뒤 이 입력이 새 1타 예약으로 바뀌어 늦게 튀어나온다.
  const crossedAttackContact = normalized.attackContactMs > 0 && cooled.attackContactMs <= 0;
  const bufferRequest = bufferedRequestOf(input, cooled.action);
  const queuedAtContact = crossedAttackContact && bufferRequest !== undefined;
  const contactState = queuedAtContact
    ? { ...cooled, attackBufferMs: tuning.combat.attackInputBufferMs, bufferedMoveId: bufferRequest ?? null,
        bufferedVerb: null, verbBufferMs: 0 }
    : cooled;
  let current = crossedAttackContact
    ? attackContact(contactState, player, guards, layout, tuning)
    : idle(cooled, guards);
  if (queuedAtContact && bufferRequest === null) {
    current = {
      ...current,
      events: [
        { kind: "AttackQueued", at: atOf(player), facing: player.facing, combo: nextCombo(normalized) },
        ...current.events,
      ],
    };
  }

  // 공격 동작·구르기가 끝나는 프레임보다 먼저 들어온 입력을 예약한다. 눌렀다는 사실도
  // 이벤트로 즉시 보여 줘, 자동으로 이어지는 다음 타가 버그처럼 느껴지지 않게 한다.
  // 공중에서 누른 C/V 도 같은 한 칸 예약이다(2026-09-25): 그려진 공중 공격이 없어 공격 상태가
  // 공중 제어만 얼렸다. 이제 공중에는 공격 상태가 없고, 예약은 첫 지상 틱에 발동한다.
  if (!queuedAtContact
    && (input.attack || input.heavy)
    && (current.state.attackCooldownMs > 0 || player.dodgeMs > 0 || !player.onGround)
  ) {
    const request = bufferedRequestOf(input, current.state.action);
    if (request === undefined) return current;
    const queued = {
      ...current.state,
      attackBufferMs: tuning.combat.attackInputBufferMs,
      bufferedMoveId: request,
      // 한 칸짜리 행동 예약: 공격 중 눌러 둔 점프·회피보다 나중에 누른 C/V가 이긴다.
      bufferedVerb: null,
      verbBufferMs: 0,
    };
    return {
      ...current,
      state: queued,
      events: request === null
        ? [
            ...current.events,
            { kind: "AttackQueued", at: atOf(player), facing: player.facing, combo: nextCombo(queued) },
          ]
        : current.events,
    };
  }

  if (!canAct) return current;
  if ((input.attack || input.heavy || current.state.attackBufferMs > 0)
    && current.state.attackCooldownMs <= 0
    && player.onGround
  ) {
    const moveId = requestedMoveId(current.state, input, player, stamina, tuning);
    if (moveId === "heavy" && stamina < tuning.combat.heavyStaminaCost) {
      // 실패한 강공격이 이미 커밋한 평타 판정까지 지우지는 않는다. 다음 예약만 지워
      // 거절 뒤 자동 공격이 나가는 것을 막는다.
      return {
        ...current,
        state: { ...current.state, attackBufferMs: 0, bufferedMoveId: null },
        events: [
          ...current.events,
          { kind: "ActionRejected", action: "heavy", reason: "depleted", at: atOf(player) },
        ],
      };
    }
    return append(current, beginAttack(current.state, moveId, player, current.guards, tuning));
  }
  return current;
}

/**
 * 이번 입력이 회수 중에 예약할 무브.
 *
 * `undefined` 는 예약 자체가 성립하지 않는다는 뜻이고, `null` 은 사슬의 다음 타다.
 * V(강공격)는 평타 회수 중에도 예약돼 콤보 엔더가 되지만, 반대로 C는 강공격·대시의
 * 회수를 잘라먹지 못한다 — 무게 있는 한 방이 연타에 묻히면 티어를 나눈 이유가 사라진다.
 */
function bufferedRequestOf(
  input: InputFrame,
  action: PlayerCombatAction | null,
): AttackMoveId | null | undefined {
  if (input.heavy) return "heavy";
  if (!input.attack) return undefined;
  return isCommittedHeavyAction(action) ? undefined : null;
}

/** 지금 시작할 무브. `null` 은 사슬의 다음 타를 뜻한다. */
function requestedMoveId(
  state: PlayerCombatState,
  input: InputFrame,
  player: PlayerSimState,
  stamina: number,
  tuning: Tuning,
): AttackMoveId | null {
  if (input.heavy || state.bufferedMoveId === "heavy") return "heavy";
  if (state.bufferedMoveId !== null) return state.bufferedMoveId;
  // 달리는 중 C 는 대시 공격이다. 사슬 중에는 절대 나가지 않는다 — 콤보 2타가
  // 이동 입력 하나로 다른 기술이 되면 플레이어가 자기 입력을 예측할 수 없다.
  //
  // `motion` 만 보면 안 된다: 질주 키를 놓은 뒤에도 실제 속도가 남아 있는 동안
  // `MovementRules` 는 `motion === "run"` 을 유지한다. 그 구간의 C 까지 대시가 되면
  // 손을 뗐는데 돌진이 나간다. 지금 질주를 누르고 있다는 사실까지 요구한다.
  //
  // 대가를 못 내면 거절이 아니라 평타로 내려앉는다. 달리다 누른 C 가 "아무 일도
  // 안 일어남" 이 되면 스태미나가 빈 순간 공격 자체가 잠긴다.
  if (input.run
    && player.motion === "run"
    && player.onGround
    && input.moveX !== 0
    && state.chainCombo === 0
    && stamina >= tuning.combat.dashStaminaCost
  ) {
    return "dashSlash";
  }
  return null;
}

function actionOfMove(move: AttackMove): PlayerCombatAction {
  if (move.tier === "heavy") return "heavy";
  return move.tier === "dash" ? "dash" : "attack";
}

function beginAttack(
  state: PlayerCombatState,
  moveId: AttackMoveId | null,
  player: PlayerSimState,
  guards: readonly GuardState[],
  tuning: Tuning,
): PlayerCombatResult {
  const combo: 0 | 1 | 2 | 3 = moveId === null ? nextCombo(state) : 0;
  const move = combo === 0 ? moveOf(moveId!) : playerMove(combo);
  const counterGuardId = state.counterWindowMs > 0 ? state.counterGuardId : null;
  const counterTarget = lockedMeleeCounterTarget(player, guards, counterGuardId, tuning);
  const attackFacing = counterTarget === null
    ? player.facing
    : facingToward(player.x, counterTarget.x, player.facing);
  // 무거운 스윙은 몸 앞의 사물도 민다. 카트 밀기는 접촉 판정이 아니라 입력 프레임의
  // 동작이므로, 240ms 뒤가 아니라 지금 낸다 — 한 틱짜리 밀기 조작이 그대로 살아 있다.
  const events: SimEvent[] = [
    { kind: "PlayerAttackStarted", at: atOf(player), facing: attackFacing, moveId: move.id,
      tier: move.tier, contactMs: move.contactMs },
    ...(move.tier === "heavy" || move.tier === "dash"
      ? [{ kind: "PlayerShoved", at: atOf(player), facing: attackFacing } as const]
      : []),
  ];
  return {
    state: {
      ...state,
      action: actionOfMove(move),
      actionMs: move.actionMs,
      actionMoveId: move.id,
      attackCooldownMs: move.cooldownMs,
      attackContactMs: move.contactMs,
      attackMoveId: move.id,
      attackCombo: combo,
      // 반격 대상 ID와 방향을 함께 잠근다. 구르기 방향을 아직 누르고 있어도 빈 공간을
      // 향해 공격하지 않고, 화면의 `C 한 번 반격`이 가리킨 공격자를 돌아본다.
      attackFacing,
      attackCounterGuardId: counterGuardId,
      attackBufferMs: 0,
      bufferedMoveId: null,
      bufferedVerb: null,
      verbBufferMs: 0,
      // 반격 자격은 입력 시 잠근 뒤 소비한다. 예비 동작 때문에 유효 창이 몰래 짧아지지 않는다.
      counterGuardId: null,
      counterWindowMs: 0,
      counterMovementLocked: false,
    },
    guards,
    events,
    staminaCost: move.tier === "heavy"
      ? tuning.combat.heavyStaminaCost
      : move.tier === "dash" ? tuning.combat.dashStaminaCost : 0,
    engaged: false,
    lungePx: 0,
    startedMoveId: move.id,
  };
}

function attackContact(
  state: PlayerCombatState,
  player: PlayerSimState,
  guards: readonly GuardState[],
  layout: MansionLayout,
  tuning: Tuning,
): PlayerCombatResult {
  const moveId = state.attackMoveId;
  if (moveId === null) return idle(state, guards);
  const move = moveOf(moveId);
  const combo = state.attackCombo;
  const inCombo = combo > 0;
  const facing = state.attackFacing;
  const committedPlayer = { ...player, facing };
  const playerAt = atOf(player);
  const target = attackTarget(
    committedPlayer,
    guards,
    state.attackCounterGuardId,
    move,
    tuning,
  );
  const events: SimEvent[] = [{
    kind: "PlayerAttacked",
    at: playerAt,
    facing,
    // 사슬 밖 무브도 표현층의 타수 계약을 깨지 않도록 1타로 보고하고, 실제 성격은 tier가 말한다.
    combo: combo === 0 ? 1 : combo,
    tier: move.tier,
    moveId: move.id,
  }];
  let next = guards;
  let comboContinues = false;
  let comboSettledBySpecial = false;
  let landedOnCombatant = false;
  let dropReason: Extract<SimEvent, { readonly kind: "ComboDropped" }>["reason"] = "miss";
  // 대시 돌진이 밀려난 상대를 뚫고 지나가면 몸 접촉 규칙이 상대를 플레이어 코앞으로
  // 되돌려 넉백이 화면에서 사라진다. 상대가 있으면 그 앞에서 멈추도록 돌진을 자른다.
  let lungeStopX: number | null = null;

  if (target !== null) {
    const at = { x: target.x, y: target.y };
    lungeStopX = at.x;
    // 저작된 조우(금고지기)는 프로필 덮어쓰기로 피해 계약(무방비 창의 바닥 0·포효의 무적)을 싣는다.
    // 덮어쓰기가 없는 일반 경비는 원형 표 그대로다.
    const profile = CombatRules.effectiveCombatProfile(target);
    const alerted = alertGuard(target, playerAt, tuning);
    if (target.susp.tier !== alerted.susp.tier) {
      events.push({ kind: "SuspicionTierChanged", guardId: target.id, from: target.susp.tier, to: alerted.susp.tier });
    }
    if (target.combat === null || profile === undefined) {
      dropReason = "invalid-target";
      next = guards.map((guard) => guard.id === target.id
        ? { ...alerted, staggerMs: Math.max(alerted.staggerMs, move.grazeStaggerMs) }
        : guard);
      events.push({ kind: "GuardGrazed", guardId: target.id, at });
    } else {
      const fromBehind = CombatRules.isBehind(playerAt, at, target.facing) || state.attackAmbush === true;
      const punishable = CombatRules.isPunishable(target.combat);
      // 반격권은 공격 시작 순간 이미 소비·잠금했다. 예비 동작 사이 적의 recovery가
      // 끝나더라도 플레이어가 창 안에 누른 입력의 보상은 사라지지 않는다.
      const perfectCounter = state.attackCounterGuardId === target.id;
      const toolOpening = CombatRules.hasToolOpening(target);
      const result = CombatRules.damage(target.combat, {
        fromBehind,
        profile,
        tuning,
        damage: move.damage,
        weaponId: move.weaponId,
        tier: move.tier,
        forcePunish: perfectCounter,
        toolOpening,
        invulnerable: profile.invulnerable === true,
      });
      if (!result.landed) {
        dropReason = "blocked";
        next = guards.map((guard) => guard.id === target.id ? alerted : guard);
        events.push({ kind: "CombatBlocked", guardId: target.id, at, ...(profile.invulnerable === true ? { invulnerable: true } : {}) });
      } else {
        landedOnCombatant = true;
        comboContinues = inCombo && !perfectCounter;
        comboSettledBySpecial = perfectCounter;
        // 경직 저항은 피해 판정과 충격 사이에 결정된다. 흡수되면 피해와 넉백은 그대로
        // 들어가고 경직·페이즈 되감기만 사라진다.
        //
        // 사슬 3타(피니셔)는 저항을 지우지 않는다. 실제 콤보가 평타-평타-피니셔라서,
        // 피니셔가 `breakPoise` 를 하면 세 번째 타마다 카운터가 0으로 돌아가 저항이
        // 영원히 성립하지 않는다 — C만 두드리는 것이 다시 모든 적의 정답이 된다.
        // 대신 자기 경직은 언제나 남긴다: 사슬을 끝까지 넣은 보상까지 흘리면
        // "버틴다" 가 아니라 "마무리가 씹혔다" 로 읽힌다.
        // 저항을 실제로 지우는 것은 무게를 바꾼 입력, 즉 강공격·대시뿐이다.
        const absorbed = move.tier === "light" && absorbsStun(target);
        const damaged = result.defeated
          ? immobilize({ ...alerted, combat: result.state, staggerMs: 0 })
          : { ...alerted, combat: result.state };
        const resisted = move.tier === "heavy" || move.tier === "dash"
          ? breakPoise(damaged)
          : absorbed ? damaged : registerStun(damaged, tuning);
        next = guards.map((guard) => guard.id === target.id ? resisted : guard);

        // 완벽 반격은 회피 성공의 독립 보상이다. 공간 피니셔와 겹쳐 한 입력이 두 기술처럼
        // 보이지 않게 하고, 쓰러진 상대는 이미 그 자리에 눕는다.
        const impulses = perfectCounter || result.defeated
          ? null
          : applyCombatImpulse(
              target.id,
              next,
              facing,
              playerAt,
              absorbed ? absorbedImpulse(impulseForHit(move.tier, combo, tuning)) : impulseForHit(move.tier, combo, tuning),
              layout,
              tuning,
            );
        if (impulses !== null) next = impulses.guards;
        // 완벽 반격은 밀지 않지만(그 자리에 박힌다) 몸은 받는다. 경직이 없으면 가장 큰 보상타를 맞은 경비가
        // 곧장 걸어 들어와 630ms 만에 다시 휘둘렀다(2026-09-26 경비 필름 perfect-dodge-counter +43~+71).
        if (perfectCounter && !result.defeated) {
          const counterStaggerMs = impulseFor("finisher", tuning).staggerMs;
          next = next.map((guard) => guard.id === target.id
            ? { ...guard, staggerMs: Math.max(guard.staggerMs, counterStaggerMs) }
            : guard);
        }
        const landedAt = impulses?.at ?? at;
        lungeStopX = landedAt.x;
        const wallHit = impulses?.wallSlamGuardId === target.id;
        events.push({
          kind: "CombatHit",
          guardId: target.id,
          at: landedAt,
          contactAt: at,
          damage: result.damage,
          weaponId: move.weaponId,
          punish: move.tier !== "light" || perfectCounter || toolOpening || punishable || fromBehind,
          tier: move.tier,
          facing,
          knockbackPx: impulses === null ? 0 : Math.abs(landedAt.x - at.x),
          wallHit,
          absorbed,
          ...(toolOpening && !perfectCounter ? { toolOpening: true } : {}),
        });
        if (perfectCounter) events.push({ kind: "PerfectCounter", guardId: target.id, at, contactAt: at, weaponId: move.weaponId });
        if (result.defeated) events.push({ kind: "CombatDefeated", guardId: target.id, at, contactAt: at, weaponId: move.weaponId });
        if (impulses !== null) {
          // 같은 충격이라도 무게마다 다른 동사로 읽힌다: 사슬의 마지막 타는 "날려보냄",
          // 강공격·대시는 "밀어냄". 평타는 자기 CombatHit 만으로 충분하다.
          if (move.tier === "finisher") {
            events.push({
              kind: "ComboFinisherLaunched",
              guardId: target.id,
              from: at,
              at: landedAt,
              contactAt: at,
              weaponId: move.weaponId,
              facing,
            });
          } else if (move.tier === "heavy" || move.tier === "dash") {
            events.push({ kind: "GuardShoved", guardId: target.id, from: at, at: landedAt, tier: move.tier, facing });
          }
          events.push(...impulses.events);
        }
      }
    }
    events.push(combatNoise(playerAt, player, tuning));
  }

  // 두 개의 수를 따로 센다.
  // - 사슬(`chainCombo`)은 휘두른 순서다. 헛치거나 막혀도 다음 C는 다음 타다(2026-09-24
  //   사용자 결정). 완벽 반격만 자체 결말이라 사슬을 닫는다.
  // - 콤보(`combo`)는 지정 전투 적에게 유효타를 낸 횟수다. 발밑 타수 UI·붕괴 연출·경직 저항이
  //   읽는 명중 확인형 값이라 헛침에서 여전히 끊긴다. 붕괴 연출은 실제로 쌓인 유효타가
  //   있었을 때만 낸다 — 허공에 C C C 를 치는 것은 실패가 아니다.
  const chainContinues = inCombo && !comboSettledBySpecial;
  const hadConfirmedStreak = state.combo > 0 && state.comboWindowMs > 0 && state.combo === combo - 1;
  if (comboContinues && target !== null && (combo === 1 || combo === 2)) {
    // 발밑 타수 UI가 움직이는 실제 대상을 계속 따라갈 수 있도록 유효타 대상 ID를
    // 확정 사건에 보존한다. 좌표는 공간 음향용 플레이어 위치 계약을 그대로 유지한다.
    events.push({ kind: "ComboConfirmed", guardId: target.id, at: playerAt, facing, combo: combo });
  } else if (inCombo && !comboContinues && !comboSettledBySpecial && hadConfirmedStreak) {
    events.push({
      kind: "ComboDropped",
      at: playerAt,
      facing,
      combo: (combo - 1) as 1 | 2,
      reason: dropReason,
    });
  }

  // 선딜 중 넣은 후속 C는 사슬을 따라 살아남는다 — 헛쳐도 C C C 는 1→2→3 이다. 강공격 예약은
  // 콤보와 무관한 단발이라 언제나 살아남고, 완벽 반격은 자체 결말이라 사슬 예약을 소비한다.
  const keepsBuffer = state.bufferedMoveId !== null
    ? true
    : inCombo ? chainContinues : landedOnCombatant;
  return {
    state: {
      ...state,
      attackContactMs: 0,
      attackMoveId: null,
      attackCombo: 0,
      attackCounterGuardId: null,
      combo: comboContinues ? combo : 0,
      comboWindowMs: comboContinues ? tuning.combat.comboWindowMs : 0,
      chainCombo: chainContinues ? combo : 0,
      chainWindowMs: chainContinues ? tuning.combat.comboWindowMs : 0,
      attackBufferMs: keepsBuffer ? state.attackBufferMs : 0,
      bufferedMoveId: keepsBuffer ? state.bufferedMoveId : null,
    },
    guards: next,
    events,
    staminaCost: 0,
    engaged: target !== null,
    // 대시는 접촉이 끝난 뒤 몸을 앞으로 던진다. 넉백과 같은 프레임이라 화면에서는
    // 한 동작으로 읽히고, 판정은 이미 끝났으므로 사거리를 두 번 얻지 않는다.
    lungePx: facing * cappedLungePx(move.lungePx, playerAt.x, facing, lungeStopX, tuning),
    startedMoveId: null,
  };
}

/** 돌진 뒤 상대와 남겨 둘 틈. 0이면 같은 프레임의 몸 접촉 정산이 다시 밀어낸다. */
const LUNGE_STOP_GAP_PX = 6;

/** 상대가 있으면 그 몸 앞에서 멈추는 돌진 거리. 헛친 돌진은 표의 거리를 다 쓴다. */
function cappedLungePx(
  lungePx: number,
  fromX: number,
  facing: Facing,
  stopX: number | null,
  tuning: Tuning,
): number {
  if (lungePx <= 0 || stopX === null) return lungePx;
  const room = facing * (stopX - fromX) - tuning.movement.bodyWidth - LUNGE_STOP_GAP_PX;
  return Math.max(0, Math.min(lungePx, room));
}

function targetInFront(
  player: PlayerSimState,
  guards: readonly GuardState[],
  reach: number,
): GuardState | null {
  let best: GuardState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const swing: Reach = { forwardPx: reach, verticalPx: PLAYER_MELEE_VERTICAL_PX };
  for (const guard of guards) {
    if (!canBeCombatTarget(guard)) continue;
    const at = { x: guard.x, y: guard.y };
    if (!withinReach(player, player.facing, at, swing)) continue;
    const forward = forwardDistance(player, player.facing, at);
    if (forward >= bestDistance) continue;
    best = guard;
    bestDistance = forward;
  }
  return best;
}

/**
 * 완벽 반격은 회피를 만든 근접 공격자를 입력 순간에 잠근다.
 *
 * 근접 완벽 회피가 성립한 위치는 적 무기의 실제 위협 범위 안이므로, 일반 평타보다
 * 조금 멀더라도 같은 공격자의 사거리까지 한 번만 받아 준다. 잠긴 대상을 다시 최근접
 * 경비로 바꾸면 다수전에서 안내한 반격이 옆 경비의 스침으로 소모된다. 원거리 공격자는
 * 근접 반격 거리를 늘리지 않고 기존 평타 사거리를 그대로 사용한다.
 */
function attackTarget(
  player: PlayerSimState,
  guards: readonly GuardState[],
  counterGuardId: string | null,
  move: AttackMove,
  tuning: Tuning,
): GuardState | null {
  const counterTarget = lockedMeleeCounterTarget(player, guards, counterGuardId, tuning);
  if (counterTarget !== null) return counterTarget;
  return targetInFront(player, guards, moveReachPx(move, tuning.combat.attackReachPx));
}

function lockedMeleeCounterTarget(
  player: PlayerSimState,
  guards: readonly GuardState[],
  counterGuardId: string | null,
  tuning: Tuning,
): GuardState | null {
  if (counterGuardId === null) return null;
  const counterTarget = guards.find((guard) => guard.id === counterGuardId);
  const profile = counterTarget === undefined
    ? undefined
    : archetypeOf(counterTarget.archetypeId).combat;
  if (counterTarget === undefined || !canBeCombatTarget(counterTarget) || profile?.attackKind !== "melee") {
    return null;
  }
  const facing = facingToward(player.x, counterTarget.x, player.facing);
  return withinReach(player, facing, counterTarget, {
    forwardPx: Math.max(tuning.combat.attackReachPx, profile.attackRangePx),
    verticalPx: PLAYER_MELEE_VERTICAL_PX,
  }) ? counterTarget : null;
}

/**
 * 반격 창의 상대가 지금 근접(C) 사거리 안인가. 안내 표기가 읽는다 — 후열 석궁병처럼 닿지 않는 상대에게 `C/Q` 를
 * 보이면 C 가 헛친다. 근접 반격 잠금과 같은 사거리 규칙이다.
 */
export function counterMeleeReachable(
  player: PlayerSimState,
  guards: readonly GuardState[],
  counterGuardId: string | null,
  tuning: Tuning,
): boolean {
  if (counterGuardId === null) return false;
  const target = guards.find((guard) => guard.id === counterGuardId);
  if (target === undefined || !canBeCombatTarget(target)) return false;
  const profile = archetypeOf(target.archetypeId).combat;
  const melee = profile?.attackKind === "melee";
  const forwardPx = melee ? Math.max(tuning.combat.attackReachPx, profile.attackRangePx) : tuning.combat.attackReachPx;
  // 근접 잠금 상대에게만 몸을 돌려 친다(`lockedMeleeCounterTarget`). 원거리 상대(석궁병)는 지금 보는 쪽으로 치므로
  // 그 방향으로 잰다 — 등 뒤의 석궁병에게 `C/Q` 를 보이면 C 가 반대쪽으로 헛쳤다(재검토).
  const facing = melee ? facingToward(player.x, target.x, player.facing) : player.facing;
  return withinReach(player, facing, target, { forwardPx, verticalPx: PLAYER_MELEE_VERTICAL_PX });
}

function facingToward(fromX: number, targetX: number, fallback: -1 | 1): -1 | 1 {
  return fromX === targetX ? fallback : targetX > fromX ? 1 : -1;
}

function combatNoise(at: { readonly x: number; readonly y: number }, player: PlayerSimState, tuning: Tuning): SimEvent {
  return {
    kind: "NoiseEmitted",
    at,
    floor: Math.floor(player.y / tuning.world.floorHeightPx),
    radius: tuning.combat.engageNoiseRadius,
    source: "combat",
  };
}

function tick(state: PlayerCombatState, dtMs: number, movementNeutral: boolean): PlayerCombatState {
  const comboWindowMs = Math.max(0, state.comboWindowMs - dtMs);
  const chainWindowMs = Math.max(0, state.chainWindowMs - dtMs);
  const counterWindowMs = Math.max(0, state.counterWindowMs - dtMs);
  return {
    ...state,
    action: state.actionMs > dtMs ? state.action : null,
    actionMs: Math.max(0, state.actionMs - dtMs),
    actionMoveId: state.actionMs > dtMs ? state.actionMoveId : null,
    chainCombo: chainWindowMs > 0 ? state.chainCombo : 0,
    chainWindowMs,
    verbBufferMs: Math.max(0, state.verbBufferMs - dtMs),
    bufferedVerb: state.verbBufferMs > dtMs ? state.bufferedVerb : null,
    attackCooldownMs: Math.max(0, state.attackCooldownMs - dtMs),
    attackContactMs: Math.max(0, state.attackContactMs - dtMs),
    combo: comboWindowMs > 0 ? state.combo : 0,
    comboWindowMs,
    attackBufferMs: Math.max(0, state.attackBufferMs - dtMs),
    bufferedMoveId: state.attackBufferMs > dtMs ? state.bufferedMoveId : null,
    counterGuardId: counterWindowMs > 0 ? state.counterGuardId : null,
    counterWindowMs,
    counterMovementLocked: counterWindowMs > 0 && !movementNeutral && state.counterMovementLocked,
  };
}

function cancelPendingAttack(
  state: PlayerCombatState,
  player: PlayerSimState,
): { readonly state: PlayerCombatState; readonly events: readonly SimEvent[] } {
  if (state.attackMoveId === null) return { state, events: [] };
  // 붕괴 연출은 실제로 쌓인 유효타가 끊길 때만 낸다. 헛친 잽 뒤의 스트레이트가 끊긴 것은
  // 잃은 것이 없다.
  const previousCombo = state.attackCombo > 1 && state.combo === state.attackCombo - 1 && state.comboWindowMs > 0
    ? (state.attackCombo - 1) as 1 | 2
    : 0;
  return {
    state: {
      ...state,
      action: null,
      actionMs: 0,
      actionMoveId: null,
      attackContactMs: 0,
      attackMoveId: null,
      attackCombo: 0,
      attackCounterGuardId: null,
      combo: 0,
      comboWindowMs: 0,
      chainCombo: 0,
      chainWindowMs: 0,
    },
    events: previousCombo === 0
      ? []
      : [{
          kind: "ComboDropped",
          at: atOf(player),
          facing: state.attackFacing,
          combo: previousCombo,
          reason: "interrupted",
        }],
  };
}

function append(first: PlayerCombatResult, second: PlayerCombatResult): PlayerCombatResult {
  return {
    state: second.state,
    guards: second.guards,
    events: [...first.events, ...second.events],
    staminaCost: first.staminaCost + second.staminaCost,
    engaged: first.engaged || second.engaged,
    lungePx: first.lungePx + second.lungePx,
    startedMoveId: second.startedMoveId ?? first.startedMoveId,
  };
}

/** 사슬의 다음 타. 명중 여부가 아니라 휘두른 순서를 따른다 — 헛친 잽 뒤에도 스트레이트가 나간다. */
function nextCombo(state: PlayerCombatState): 1 | 2 | 3 {
  if (state.attackCombo > 0) return (state.attackCombo % 3 + 1) as 1 | 2 | 3;
  return (state.chainWindowMs > 0 ? state.chainCombo % 3 + 1 : 1) as 1 | 2 | 3;
}

function atOf(player: PlayerSimState): { readonly x: number; readonly y: number } {
  return { x: player.x, y: player.y - 18 };
}

function idle(state: PlayerCombatState, guards: readonly GuardState[]): PlayerCombatResult {
  return { state, guards, events: [], staminaCost: 0, engaged: false, lungePx: 0, startedMoveId: null };
}
