import { manorIsExploring } from "./ManorExplorationRules";
import type { SimEvent, Vec2 } from "./types";
import type { EscapePoint, LootAnchor, MansionLayout } from "./MansionLayout";
import { floorOfY } from "./MansionLayout";
import type { LootDef, LootId } from "./LootRules";
import { lootDef, stealDurationMs } from "./LootRules";
import type { CarryState } from "./CarryRules";
import * as CarryRules from "./CarryRules";
import type { Tuning } from "./tuning";
import { clamp } from "./geom";
import { PERSONAL_ARTIFACT_LOOT_ID } from "./PersonalArtifactRules";
import { fastestTravelMs } from "./MansionRoutes";
import type { ConductInput } from "./ConductRules";
import { alarmTransitionDelta, conductDelta } from "./ConductRules";
import { interactionReachPx, pointInInteractionRect } from "./InteractionRangeRules";

/**
 * 런 진행 상태: 제한시간, 페이즈, 기술치, 절도, 탈출, 결과.
 *
 * "한 방만 더?" 가 도박이 아니라 판단이 되려면 탈출 예상 시간이 상시 계산되어야 한다.
 * 그것도 지금 적재로 열려 있는 경로만 고려해서.
 */

export const RUN_PHASES = ["calm", "shiftChange", "lockdown", "greatEscape"] as const;
export type RunPhase = (typeof RUN_PHASES)[number];
export type RunOutcome = "escaped" | "timeout" | "busted";

export function runPhaseRank(phase: RunPhase): 0 | 1 | 2 | 3 {
  return RUN_PHASES.indexOf(phase) as 0 | 1 | 2 | 3;
}

export interface StolenItem {
  readonly anchorId: string;
  readonly lootId: LootId;
  /** 획득 시점의 기술치. 정산은 훔친 순간의 품격으로 값을 매긴다. */
  readonly skillAtSteal: number;
}

/**
 * 포박 발버둥. 잡혔다고 즉시 런이 끝나면 단발 실수가 처벌이 되고,
 * 무한히 빠져나올 수 있으면 긴장이 사라진다. 그래서 기회는 유한하다.
 */
export interface StruggleState {
  readonly guardId: string;
  readonly presses: number;
  readonly remainingMs: number;
  readonly lastDir: -1 | 0 | 1;
}

export interface RunState {
  /** 준비가 끝난 출구(`requiresPreparation`). 블랙손 옥상 창은 전시대가 받침에 닿을 때 sim 이 풀어 둔다. */
  readonly preparedEscapeIds: readonly string[];
  /** 발각 직후 유예 기록. 현재 직접 판정에는 쓰지 않으며 리플레이 계약을 위해 보존한다. */
  readonly graceMs: number;
  readonly struggle: StruggleState | null;
  readonly remainingMs: number;
  readonly phase: RunPhase;
  readonly skill: number;
  readonly stolen: readonly StolenItem[];
  /** 한 번이라도 회수 완료된 앵커. 버리더라도 원 진열대와 활성화 상태는 되살아나지 않는다. */
  readonly collectedAnchorIds: readonly string[];
  /** 획득 중인 앵커와 진행 시간. */
  readonly grabbingAnchorId: string | null;
  readonly grabMs: number;
  /** 중단된 앵커의 잔여 진행도. */
  readonly grabProgress: Readonly<Record<string, number>>;
  readonly lastStealAtMs: number;
  /** 이번 런에서 도달한 최고 경계 등급. 무사고 보너스 판정에 쓴다. */
  readonly peakAlarm: 0 | 1 | 2 | 3;
  readonly escapeCharges: number;
  readonly outcome: RunOutcome | null;
  readonly escapeId: string | null;
  /** 대탈출 중 닫힌 출구. */
  readonly closedExits: readonly string[];
  readonly overtimeMs: number;
}

/** 런 제어권의 배타적 상태. 페이즈(calm/lockdown)는 압박 축이고 이 FSM은 입력 소유권 축이다. */
export type RunControlState = "active" | "stealing" | "restrained" | "complete";

export function controlStateOf(run: Pick<RunState, "outcome" | "struggle" | "grabbingAnchorId">): RunControlState {
  if (run.outcome !== null) return "complete";
  if (run.struggle !== null) return "restrained";
  if (run.grabbingAnchorId !== null) return "stealing";
  return "active";
}

export function invariantViolations(
  run: Pick<RunState, "outcome" | "struggle" | "grabbingAnchorId" | "grabMs" | "escapeId">,
): string[] {
  const violations: string[] = [];
  if (run.outcome !== null && run.struggle !== null) violations.push("completed run remains restrained");
  if (run.outcome !== null && run.grabbingAnchorId !== null) violations.push("completed run remains stealing");
  if (run.struggle !== null && run.grabbingAnchorId !== null) violations.push("restrained player remains stealing");
  if (run.grabbingAnchorId === null && run.grabMs !== 0) violations.push("grab progress exists without an active anchor");
  if (run.escapeId !== null && run.outcome !== "escaped") violations.push("escape id exists without escaped outcome");
  return violations;
}

export function createRun(tuning: Tuning, layout?: MansionLayout): RunState {
  return {
    preparedEscapeIds: [],
    graceMs: 0,
    struggle: null,
    remainingMs: tuning.run.durationMs,
    phase: "calm",
    skill: tuning.skill.start,
    stolen: [],
    collectedAnchorIds: [],
    grabbingAnchorId: null,
    grabMs: 0,
    grabProgress: {},
    lastStealAtMs: -Number.MAX_SAFE_INTEGER,
    peakAlarm: 0,
    escapeCharges: tuning.run.escapeCharges,
    outcome: null,
    escapeId: null,
    closedExits: layout?.escapes.filter((exit) => exit.requiresPreparation).map((exit) => exit.id) ?? [],
    overtimeMs: 0,
  };
}

export function phaseOf(remainingMs: number, tuning: Tuning): RunPhase {
  if (remainingMs <= 0) return "greatEscape";
  if (remainingMs <= tuning.run.lockdownAt) return "lockdown";
  const elapsed = tuning.run.durationMs - remainingMs;
  if (elapsed >= tuning.run.durationMs * tuning.run.shiftChangeAt) return "shiftChange";
  return "calm";
}

/**
 * 봉쇄가 경비에게 주는 압박.
 *
 * 페이즈가 음악만 바꾸면 "저택이 조여든다" 는 화면의 분위기일 뿐 판단 재료가 아니다.
 * 봉쇄부터는 실제로 더 멀리 보고 더 빨리 움직여야 남은 시간이 위험으로 읽힌다.
 *
 * 시야 배수는 판정과 화면 콘이 같은 `observerOf` 를 통해 함께 쓴다 — 한쪽만 넓히면
 * 플레이어가 콘 밖에서 걸리고 그것을 자기 실수로 오해한다.
 */
export interface LockdownPressure {
  readonly viewMul: number;
  readonly speedMul: number;
}

export const NO_LOCKDOWN_PRESSURE: LockdownPressure = Object.freeze({ viewMul: 1, speedMul: 1 });

export function lockdownPressure(phase: RunPhase, tuning: Tuning): LockdownPressure {
  if (phase !== "lockdown" && phase !== "greatEscape") return NO_LOCKDOWN_PRESSURE;
  return { viewMul: tuning.run.lockdownViewMul, speedMul: tuning.run.lockdownSpeedMul };
}

/** 대탈출 중에는 출구가 하나씩 셔터로 닫힌다. */
export function closedExitsAt(
  overtimeMs: number,
  exits: readonly EscapePoint[],
  tuning: Tuning,
  forcedClosed: readonly string[] = [],
): string[] {
  // 손상된 저장이나 잘못 만든 레이아웃도 플레이어를 완전히 가두지는 못한다.
  const forced = [...new Set(forcedClosed)]
    .filter((id) => exits.some((exit) => exit.id === id))
    .slice(0, Math.max(0, exits.length - 1));
  if (overtimeMs <= 0 || tuning.run.exitShutterMs <= 0) return forced;
  const count = Math.floor(overtimeMs / tuning.run.exitShutterMs);
  // 마지막 하나는 남긴다. 완전히 갇히는 것은 재미가 아니라 벌이다.
  const timed = exits
    .filter((exit) => !forced.includes(exit.id))
    .slice(0, Math.min(count, Math.max(0, exits.length - forced.length - 1)))
    .map((exit) => exit.id);
  return [...forced, ...timed];
}

/** 지난 성공 대응과 개인 유물 반전이 현재 강제로 닫는 출구. */
export function narrativeClosedExitIds(
  run: Pick<RunState, "stolen">,
  layout: MansionLayout,
  tuning: Tuning,
): string[] {
  const response = layout.response?.kind === "watched-exit" ? [layout.response.exitId] : [];
  const target = layout.lootAnchors.find((anchor) => anchor.lootId === PERSONAL_ARTIFACT_LOOT_ID);
  if (target === undefined || !run.stolen.some((item) => item.anchorId === target.id)) return response;
  const entry = entryEscapeRoute(layout, tuning);
  if (entry === null || response.includes(entry.exit.id)) return response;
  // 출구 수가 줄어든 특수 레이아웃에서도 현재 런의 핵심 반전(입구 봉쇄)을 우선한다.
  return [entry.exit.id, ...response];
}

/** Preparation gates participate in every route estimate through the same closed-exit list.
 * Timed shutters only consider prepared exits, so the kitchen remains a fallback. */
export function escapeNeedsPreparation(exit: EscapePoint, run: Pick<RunState, "preparedEscapeIds">): boolean {
  return exit.requiresPreparation === true && !run.preparedEscapeIds.includes(exit.id);
}
export function runClosedExits(run: Pick<RunState, "stolen" | "preparedEscapeIds">, layout: MansionLayout, tuning: Tuning, overtimeMs: number): string[] {
  const pending = layout.escapes.filter((exit) => escapeNeedsPreparation(exit, run));
  return [...closedExitsAt(overtimeMs, layout.escapes.filter((exit) => !pending.includes(exit)), tuning, narrativeClosedExitIds(run, layout, tuning)), ...pending.map((exit) => exit.id)];
}

/** 현재 적재로 이 출구를 쓸 수 있는가. 탐욕이 경로를 삭제하는 두 번째 지점. */
export function isExitUsable(exit: EscapePoint, loadRatio: number, closed: readonly string[]): boolean {
  if (closed.includes(exit.id)) return false;
  return exit.loadLimit === undefined || loadRatio < exit.loadLimit;
}

/** 개인 유물이 배치된 런은 그것을 회수해야만 성공 조건이 열린다. */
export function hasRequiredArtifact(run: Pick<RunState, "stolen">, layout: MansionLayout): boolean {
  const stolenIds = new Set(run.stolen.map((item) => item.anchorId));
  if ((layout.requiredLootAnchorIds ?? []).some((anchorId) => !stolenIds.has(anchorId))) return false;
  const target = layout.lootAnchors.find((anchor) => anchor.lootId === PERSONAL_ARTIFACT_LOOT_ID);
  return target === undefined || stolenIds.has(target.id);
}

export interface EscapeRoute {
  readonly exit: EscapePoint;
  readonly at: Vec2;
  readonly estimateMs: number;
}

/** 현재 적재·봉쇄에서 실제 사용할 수 있는 가장 가까운 출구와 예상 시간을 함께 돌려준다. */
export function bestEscapeRoute(
  at: Vec2,
  layout: MansionLayout,
  loadRatio: number,
  closed: readonly string[],
  tuning: Tuning,
  excludedExitIds: readonly string[] = [],
  areaKey = false,
): EscapeRoute | null {
  let best: EscapeRoute | null = null;

  for (const exit of layout.escapes) {
    if (excludedExitIds.includes(exit.id) || !isExitUsable(exit, loadRatio, closed)) continue;
    const target = { x: exit.rect.x + exit.rect.w / 2, y: exit.rect.y + exit.rect.h / 2 };
    const estimateMs = fastestTravelMs(
      layout,
      tuning.world,
      tuning,
      { floor: floorOfY(at.y, tuning.world.floorHeightPx), x: at.x },
      { floor: floorOfY(target.y, tuning.world.floorHeightPx), x: target.x },
      loadRatio,
      { sprint: false, skill: tuning.skill.start, areaKey },
    );
    if (estimateMs === null) continue;
    const route = { exit, at: target, estimateMs };
    if (best === null || route.estimateMs < best.estimateMs) best = route;
  }
  return best;
}

export interface ArtifactEscapeRecommendation extends EscapeRoute {
  /** 잠입 때 쓴 출구와 다른 퇴로인가. 대안이 없으면 입장 출구도 마지막 수단으로 남긴다. */
  readonly changesEntryRoute: boolean;
}

/** 스폰에서 가장 가까운 출구를 이번 잠입의 입구로 해석한다. */
export function entryEscapeRoute(layout: MansionLayout, tuning: Tuning): EscapeRoute | null {
  return bestEscapeRoute(layout.spawn, layout, 0, [], tuning);
}

/** 개인 유물 회수 뒤에는 입장 출구를 제외한 최단 퇴로를 우선한다. */
export function artifactEscapeRecommendation(
  run: Pick<RunState, "stolen" | "outcome">,
  at: Vec2,
  layout: MansionLayout,
  loadRatio: number,
  closed: readonly string[],
  tuning: Tuning,
  areaKey = false,
): ArtifactEscapeRecommendation | null {
  if (run.outcome !== null) return null;
  const target = layout.lootAnchors.find((anchor) => anchor.lootId === PERSONAL_ARTIFACT_LOOT_ID);
  if (target === undefined || !run.stolen.some((item) => item.anchorId === target.id)) return null;

  // 디버그 스폰도 같은 레이아웃 상태를 따르며, 정산 역시 이 입구 판정을 공유한다.
  const entry = entryEscapeRoute(layout, tuning);
  const alternate = bestEscapeRoute(
    at,
    layout,
    loadRatio,
    closed,
    tuning,
    entry === null ? [] : [entry.exit.id],
    areaKey,
  );
  const route = alternate ?? bestEscapeRoute(at, layout, loadRatio, closed, tuning, [], areaKey);
  if (route === null) return null;
  return { ...route, changesEntryRoute: entry !== null && route.exit.id !== entry.exit.id };
}

/**
 * 탈출 예상 시간. 지금 적재로 열려 있는 출구만 후보로 삼는다.
 * HUD 의 붉은 쐐기가 이 값이다. 없으면 탐욕 판단이 도박이 된다.
 */
export function escapeEstimateMs(
  at: Vec2,
  layout: MansionLayout,
  loadRatio: number,
  closed: readonly string[],
  tuning: Tuning,
  areaKey = false,
): number | null {
  return bestEscapeRoute(at, layout, loadRatio, closed, tuning, [], areaKey)?.estimateMs ?? null;
}

export interface RunStepInput {
  /** 연막 탈출(무기 개조): 이번 스텝 발버둥을 즉시 성공시킨다. 탈출 기회는 평소처럼 하나 쓴다. */
  readonly forceBreakFree?: boolean;
  readonly at: Vec2;
  readonly interact: boolean;
  readonly interactPressed: boolean;
  readonly drop: boolean;
  /** 과적 유실 타이머를 진행할 만큼 실제로 이동 중인가. */
  readonly moving?: boolean;
  /** 과적 유실 주기가 찼을 때 시드 PRNG로 미리 굴린 결과. */
  readonly overloadSpillRoll?: boolean;
  /** 발버둥 입력. 좌우를 번갈아 눌러야 한 번으로 센다. */
  readonly moveX: -1 | 0 | 1;
  /** 이번 스텝에 새로 발각되었는가. 유예 타이머를 건다. */
  readonly justSpotted: boolean;
  /** 포박한 경비. 없으면 null. */
  readonly capturedBy: string | null;
  /** 전투 HP가 0이 된 공격자. 포박과 구분해 런을 즉시 종료한다. */
  readonly defeatedBy?: string | null;
  /** 어떤 경비라도 이 등급 이상이면 기술치가 회복되지 않는다. */
  readonly maxAlarm: 0 | 1 | 2 | 3;
  /** 가장 가까운 경비까지의 거리. 대담한 절도 판정에 쓴다. */
  readonly nearestGuardPx: number;
  /** 집사에게서 금고 번호를 훔쳤는가. */
  readonly vaultCode?: boolean;
  /** 입력 전부터 화면에 고정된 같은 종류의 대상. 실제 판정도 이 ID를 먼저 본다. */
  readonly preferredInteractionTargetId?: string | null;
  /** 스테이지 전용 계약이 아직 공개하지 않은 전리품. 수집 판정과 화면 안내가 함께 소비한다. */
  readonly unavailableAnchorIds?: readonly string[];
  /** 이번 스텝의 행실. 품격 회계는 ConductRules 가 소유한다. */
  readonly conduct: ConductInput;
}

export interface RunStepResult {
  readonly run: RunState;
  readonly carry: CarryState;
  readonly events: readonly SimEvent[];
  /** 발버둥에 성공해 떼어낸 경비. 그 경비를 자빠뜨린다. */
  readonly shookOffGuardId: string | null;
}

/** 현재 정산 소지품과 영구 회수 기록을 합친, 다시 절도할 수 없는 앵커 목록. */
export function unavailableLootAnchorIds(
  run: Pick<RunState, "stolen" | "collectedAnchorIds">,
): readonly string[] {
  return [...new Set([...run.collectedAnchorIds, ...run.stolen.map((item) => item.anchorId)])];
}

export interface RunPressureResult {
  readonly run: RunState;
  readonly events: readonly SimEvent[];
}

/** 시간 경과와 새 경계 사건을 한 경로에서 적용한다. 뒤늦게 생성된 추격자도 이 계약을 쓴다. */
export function advanceRunPressure(
  run: RunState,
  maxAlarm: 0 | 1 | 2 | 3,
  justSpotted: boolean,
  layout: MansionLayout,
  tuning: Tuning,
  elapsedMs: number,
): RunPressureResult {
  if (run.outcome !== null) return { run, events: [] };

  const exploring = manorIsExploring(layout, run);
  const pressureElapsedMs = exploring ? 0 : elapsedMs;
  const spottedTimePenaltyMs = !exploring && justSpotted ? tuning.run.spottedTimePenaltyMs : 0;
  const remainingMs = Math.max(0, run.remainingMs - pressureElapsedMs - spottedTimePenaltyMs);
  const overtimeMs = remainingMs > 0 ? 0 : run.overtimeMs + pressureElapsedMs;
  const phase = exploring ? "calm" : phaseOf(remainingMs, tuning);
  const closedExits = runClosedExits(run, layout, tuning, overtimeMs);
  const peakAlarm = Math.max(run.peakAlarm, maxAlarm) as 0 | 1 | 2 | 3;
  const skill = clamp(
    run.skill + alarmTransitionDelta(run.peakAlarm, maxAlarm, justSpotted, tuning),
    0,
    tuning.skill.max,
  );
  const graceMs = justSpotted ? tuning.run.graceMs : Math.max(0, run.graceMs - elapsedMs);
  const events: SimEvent[] = phase === run.phase
    ? []
    : [{ kind: "RunPhaseChanged", from: run.phase, to: phase }];

  return {
    run: { ...run, remainingMs, overtimeMs, phase, closedExits, peakAlarm, skill, graceMs },
    events,
  };
}

export function step(
  run: RunState,
  carry: CarryState,
  input: RunStepInput,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
  nowMs: number,
): RunStepResult {
  const control = controlStateOf(run);
  if (control === "complete") return { run, carry, events: [], shookOffGuardId: null };

  if (input.defeatedBy != null) {
    return {
      run: { ...interruptGrab(run, tuning), struggle: null, outcome: "busted" },
      carry,
      events: [{ kind: "PlayerBusted", guardId: input.defeatedBy, at: input.at }],
      shookOffGuardId: null,
    };
  }

  const pressure = advanceRunPressure(run, input.maxAlarm, input.justSpotted, layout, tuning, dtMs);
  const events: SimEvent[] = [...pressure.events];
  const { remainingMs, overtimeMs, phase, peakAlarm, graceMs } = pressure.run;
  let { closedExits } = pressure.run;
  const alarmSkill = pressure.run.skill;

  // --- 포박과 발버둥 ---
  if (control === "restrained" && run.struggle !== null) {
    const struggled = stepStruggle({ ...run, skill: alarmSkill }, run.struggle, input, tuning, dtMs);
    return {
      run: { ...struggled.run, remainingMs, phase, overtimeMs, closedExits, peakAlarm, graceMs },
      carry,
      events: [...events, ...struggled.events],
      shookOffGuardId: struggled.shookOffGuardId,
    };
  }

  if (input.capturedBy !== null) {
    const interrupted = interruptGrab(run, tuning);
    // 남은 기회가 있으면 발버둥으로, 없으면 강제 퇴장으로.
    if (run.escapeCharges > 0) {
      return {
        run: {
          ...interrupted,
          remainingMs,
          phase,
          overtimeMs,
          closedExits,
          peakAlarm,
          graceMs,
          skill: alarmSkill,
          struggle: {
            guardId: input.capturedBy,
            presses: 0,
            remainingMs: tuning.run.struggleWindowMs,
            lastDir: 0,
          },
        },
        carry,
        events: [
          ...events,
          {
            kind: "PlayerGrabbed",
            guardId: input.capturedBy,
            at: input.at,
            escapeCharges: run.escapeCharges,
          },
        ],
        shookOffGuardId: null,
      };
    }
    return {
      run: {
        ...interrupted,
        remainingMs,
        phase,
        overtimeMs,
        closedExits,
        peakAlarm,
        graceMs,
        skill: alarmSkill,
        outcome: "busted",
      },
      carry,
      events: [...events, { kind: "PlayerBusted", guardId: input.capturedBy, at: input.at }],
      shookOffGuardId: null,
    };
  }

  const loadRatio = CarryRules.loadRatio(carry, tuning);

  // --- 탈출 ---
  const exit = interactionExitAt(layout, input.at, tuning, input.preferredInteractionTargetId ?? null);
  const interactionReservedByExit = exit !== null && input.interactPressed;
  if (exit !== null && input.interactPressed) {
    const objectiveComplete = hasRequiredArtifact(run, layout);
    if (objectiveComplete && isExitUsable(exit, loadRatio, closedExits)) {
      const outcome = remainingMs > 0 ? "escaped" : "timeout";
      // 제한시간이 끝난 프레임은 출구 판정 안에 있어도 성공 연출을 내지 않는다.
      // PlayerEscaped 뒤 timeout 정산으로 이어지면 화면과 결과가 서로 모순된다.
      if (outcome === "escaped") {
        events.push({
          kind: "PlayerEscaped",
          escapeId: exit.id,
          escapeKind: exit.kind,
          facing: exit.facing,
          at: input.at,
        });
      }
      return {
        run: {
          ...interruptGrab(run, tuning),
          remainingMs,
          phase,
          overtimeMs,
          closedExits,
          peakAlarm,
          graceMs,
          skill: alarmSkill,
          outcome,
          escapeId: outcome === "escaped" ? exit.id : null,
        },
        carry,
        events,
        shookOffGuardId: null,
      };
    }
    events.push({
      kind: "ActionRejected",
      action: "escape",
      reason: !objectiveComplete ? "objective" : closedExits.includes(exit.id) ? "closed" : "load-limit",
      at: input.at,
      targetId: exit.id,
      current: loadRatio,
      required: exit.loadLimit,
    });
  }

  const protectedLootIds = [PERSONAL_ARTIFACT_LOOT_ID, ...run.stolen.filter(item => item.anchorId === layout.manor?.targetAnchorId).map(item => item.lootId), ...(layout.manor === undefined ? [] : layout.lootAnchors.filter((anchor) => anchor.id === layout.manor?.targetAnchorId).map((anchor) => anchor.lootId))];
  // --- 소지품 버리기 ---
  let nextCarry = carry;
  let nextStolen = run.stolen;
  let skill = alarmSkill;
  if (input.drop) {
    // 사진으로 등록한 내 유물은 월드에 다시 생성할 수 없는 핵심 목표다. 마지막으로 집었다는
    // 이유만으로 버리면 영구 탈출 불가가 되므로, 그 앞의 일반 전리품을 찾아 버린다.
    const dropped = CarryRules.dropLastExcept(nextCarry, protectedLootIds);
    if (dropped.dropped !== null) {
      nextCarry = { ...dropped.state, sinceSpillMs: 0 };
      // 버린 물건이 정산 보상에 남으면 G가 무게만 지우는 무한 이득 버튼이 된다.
      nextStolen = nextStolen.filter((item) => item.anchorId !== dropped.dropped?.id);
      skill += tuning.skill.onDropped;
      events.push({ kind: "LootDropped", anchorId: dropped.dropped.id, at: input.at });
      events.push({
        kind: "NoiseEmitted",
        at: input.at,
        floor: Math.floor(input.at.y / tuning.world.floorHeightPx),
        radius: tuning.carry.spillNoiseRadius,
        source: "lootDropped",
      });
    } else {
      const carryingProtectedObjective = nextCarry.items.some(
        (item) => protectedLootIds.includes(item.lootId),
      );
      events.push({
        kind: "ActionRejected",
        action: "drop",
        reason: carryingProtectedObjective ? "objective" : "empty",
        at: input.at,
      });
    }
  } else {
    const spilled = CarryRules.stepOverloadSpill(
      nextCarry,
      input.moving === true,
      input.overloadSpillRoll === true,
      protectedLootIds,
      tuning,
      dtMs,
    );
    nextCarry = spilled.state;
    if (spilled.dropped !== null) {
      nextStolen = nextStolen.filter((item) => item.anchorId !== spilled.dropped?.id);
      skill += tuning.skill.onDropped;
      events.push({ kind: "LootDropped", anchorId: spilled.dropped.id, at: input.at });
      events.push({
        kind: "NoiseEmitted",
        at: input.at,
        floor: Math.floor(input.at.y / tuning.world.floorHeightPx),
        radius: tuning.carry.spillNoiseRadius,
        source: "lootDropped",
      });
    }
  }

  // --- 절도 ---
  const grabInput = interactionReservedByExit
    ? { ...input, interact: false, interactPressed: false }
    : input;
  const grab = stepGrab({ ...run, stolen: nextStolen, skill }, nextCarry, grabInput, layout, tuning, dtMs, nowMs);
  nextCarry = grab.carry;
  skill += grab.skillDelta;
  const artifactRecovered = grab.events.some((event) => event.kind === "PersonalArtifactAlarmTriggered");
  const entry = artifactRecovered ? entryEscapeRoute(layout, tuning) : null;
  closedExits = runClosedExits({ ...run, stolen: grab.stolen }, layout, tuning, overtimeMs);
  // 출구가 하나뿐인 첫 미션은 안전장치가 마지막 길을 남긴다. 실제로 닫히지 않은 문을
  // 봉쇄됐다고 연출하지 않는다.
  const reversalEvents: SimEvent[] = entry === null || !closedExits.includes(entry.exit.id)
    ? []
    : [{ kind: "ArtifactRouteSealed", exitId: entry.exit.id, at: input.at }];

  // --- 행실이 품격에 남기는 것 ---
  // 경계 등급과 절도 진행은 이 스텝이 이미 아는 사실이다. 호출부가 채운 값을
  // 믿으면 두 곳이 갈라질 수 있으므로 여기서 확정해 덮는다.
  skill += conductDelta(
    {
      ...input.conduct,
      maxAlarm: input.maxAlarm,
      grabbing: grab.grabbingAnchorId !== null || grab.events.some((event) => event.kind === "LootCollected"),
    },
    tuning,
    dtMs,
  );

  return {
    run: {
      ...run,
      remainingMs,
      phase,
      overtimeMs,
      closedExits,
      peakAlarm,
      graceMs,
      skill: clamp(skill, 0, tuning.skill.max),
      stolen: grab.stolen,
      collectedAnchorIds: grab.collectedAnchorIds,
      grabbingAnchorId: grab.grabbingAnchorId,
      grabMs: grab.grabMs,
      grabProgress: grab.grabProgress,
      lastStealAtMs: grab.lastStealAtMs,
    },
    carry: nextCarry,
    events: [...events, ...grab.events, ...reversalEvents],
    shookOffGuardId: null,
  };
}

/** 절도→포박/결과 전환은 진행 중 점유를 끊고 재시도 가능한 일부 진행도만 남긴다. */
function interruptGrab(run: RunState, tuning: Tuning): RunState {
  if (run.grabbingAnchorId === null) return { ...run, grabMs: 0 };
  return {
    ...run,
    grabProgress: {
      ...run.grabProgress,
      [run.grabbingAnchorId]: Math.max(0, run.grabMs) * tuning.loot.interruptKeepRatio,
    },
    grabbingAnchorId: null,
    grabMs: 0,
  };
}

/**
 * 발버둥. 좌우를 번갈아 눌러야 한 번으로 센다.
 * 성공하면 모자를 남기고 빠져나온다 — 대가는 품격이지 런이 아니다.
 */
function stepStruggle(
  run: RunState,
  struggle: StruggleState,
  input: RunStepInput,
  tuning: Tuning,
  dtMs: number,
): { run: RunState; shookOffGuardId: string | null; events: readonly SimEvent[] } {
  const alternated = input.moveX !== 0 && input.moveX !== struggle.lastDir;
  const presses = struggle.presses + (alternated ? 1 : 0);
  const remainingMs = struggle.remainingMs - dtMs;

  if (presses >= tuning.run.strugglePresses || input.forceBreakFree === true) {
    return {
      run: {
        ...run,
        struggle: null,
        escapeCharges: run.escapeCharges - 1,
        graceMs: tuning.run.graceMs,
      },
      shookOffGuardId: struggle.guardId,
      events: [{
        kind: "PlayerBrokeFree",
        guardId: struggle.guardId,
        at: input.at,
        remainingCharges: run.escapeCharges - 1,
      }],
    };
  }

  if (remainingMs <= 0) {
    return {
      run: { ...run, struggle: null, outcome: "busted" },
      shookOffGuardId: null,
      events: [{ kind: "PlayerBusted", guardId: struggle.guardId, at: input.at }],
    };
  }

  return {
    run: {
      ...run,
      struggle: { ...struggle, presses, remainingMs, lastDir: alternated ? input.moveX : struggle.lastDir },
    },
    shookOffGuardId: null,
    events: alternated
      ? [{ kind: "StruggleBeat", guardId: struggle.guardId, at: input.at, presses, direction: input.moveX }]
      : [],
  };
}

interface GrabResult {
  readonly carry: CarryState;
  readonly stolen: readonly StolenItem[];
  readonly collectedAnchorIds: readonly string[];
  readonly grabbingAnchorId: string | null;
  readonly grabMs: number;
  readonly grabProgress: Readonly<Record<string, number>>;
  readonly lastStealAtMs: number;
  readonly skillDelta: number;
  readonly events: readonly SimEvent[];
}

function stepGrab(
  run: RunState,
  carry: CarryState,
  input: RunStepInput,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
  nowMs: number,
): GrabResult {
  const base: GrabResult = {
    carry,
    stolen: run.stolen,
    collectedAnchorIds: run.collectedAnchorIds,
    grabbingAnchorId: null,
    grabMs: 0,
    grabProgress: run.grabProgress,
    lastStealAtMs: run.lastStealAtMs,
    skillDelta: 0,
    events: [],
  };

  if (!input.interact) {
    // 손을 떼면 진행도의 일부만 남는다.
    if (run.grabbingAnchorId !== null && run.grabMs > 0) {
      return {
        ...base,
        grabProgress: { ...run.grabProgress, [run.grabbingAnchorId]: run.grabMs * tuning.loot.interruptKeepRatio },
      };
    }
    return base;
  }

  const unavailableAnchorIds = [
    ...unavailableLootAnchorIds(run),
    ...(input.unavailableAnchorIds ?? []),
  ];
  const latched = run.grabbingAnchorId === null
    ? null
    : layout.lootAnchors.find((candidate) => candidate.id === run.grabbingAnchorId) ?? null;
  // 잡는 도중 대상이 사라지면(경매 반출처럼) 홀드도 끊긴다. 잠긴 대상을 끝까지 들게 두면
  // 이미 무대로 나간 진품을 진열장에서 바꿔치는 모순이 생긴다.
  const latchedInReach = latched !== null && !unavailableAnchorIds.includes(latched.id) && isAnchorInReach(
    latched,
    input.at,
    interactionReachPx(tuning.loot.reachPx + tuning.movement.bodyWidth, tuning),
  );
  const focusedAnchor = input.preferredInteractionTargetId === undefined
    || input.preferredInteractionTargetId === null
    ? null
    : layout.lootAnchors.find((candidate) => candidate.id === input.preferredInteractionTargetId) ?? null;
  const focusedAnchorInReach = focusedAnchor !== null
    && !unavailableAnchorIds.includes(focusedAnchor.id)
    && isAnchorInReach(
      focusedAnchor,
      input.at,
      interactionReachPx(tuning.loot.reachPx, tuning),
    );
  const anchor = latchedInReach
    ? latched
    : input.interactPressed
      ? nearestAnchor(
          input.at,
          unavailableAnchorIds,
          layout,
          tuning,
          input.preferredInteractionTargetId ?? null,
        )
      : focusedAnchorInReach
        ? focusedAnchor
        : null;
  if (anchor === null) {
    if (latched !== null && run.grabMs > 0) {
      return {
        ...base,
        grabProgress: { ...run.grabProgress, [latched.id]: run.grabMs * tuning.loot.interruptKeepRatio },
      };
    }
    return base;
  }

  const def = lootDef(anchor.lootId);
  const skillRequired = effectiveSkillRequired(def, input.vaultCode === true, anchor.skillRequiredOverride);
  if (run.skill < skillRequired) {
    return {
      ...base,
      events: input.interactPressed
        ? [{
            kind: "ActionRejected",
            action: "steal",
            reason: "skill",
            at: anchor.at,
            targetId: anchor.id,
            current: run.skill,
            required: skillRequired,
          }]
        : [],
    };
  }
  if (!CarryRules.canPickUp(carry, def.weight, tuning)) {
    return {
      ...base,
      events: input.interactPressed
        ? [{
            kind: "ActionRejected",
            action: "steal",
            reason: "capacity",
            at: anchor.at,
            targetId: anchor.id,
            current: CarryRules.totalWeight(carry),
            required: tuning.carry.maxWeight * tuning.carry.overloadRatio,
          }]
        : [],
    };
  }

  const duration = stealDurationMs(def, tuning);
  const resumed = run.grabbingAnchorId === anchor.id ? run.grabMs : (run.grabProgress[anchor.id] ?? 0);
  const grabMs = resumed + dtMs;

  if (grabMs < duration) {
    return { ...base, grabbingAnchorId: anchor.id, grabMs };
  }

  // 완료.
  const events: SimEvent[] = [{ kind: "LootCollected", anchorId: anchor.id, at: anchor.at }];
  if (def.id === PERSONAL_ARTIFACT_LOOT_ID) {
    events.push({ kind: "PersonalArtifactAlarmTriggered", at: anchor.at });
  }
  return {
    ...base,
    carry: CarryRules.pickUp(carry, { id: anchor.id, lootId: def.id, weight: def.weight }),
    stolen: [...run.stolen, { anchorId: anchor.id, lootId: def.id, skillAtSteal: run.skill }],
    collectedAnchorIds: run.collectedAnchorIds.includes(anchor.id)
      ? run.collectedAnchorIds
      : [...run.collectedAnchorIds, anchor.id],
    grabbingAnchorId: null,
    grabMs: 0,
    grabProgress: { ...run.grabProgress, [anchor.id]: 0 },
    lastStealAtMs: nowMs,
    skillDelta: stealSkillGain(run, input, def, tuning, nowMs),
    events,
  };
}

/** 집사의 금고 번호는 금고 채권에만 적용된다. 다른 고급 전리품은 그대로다. */
export function effectiveSkillRequired(
  def: LootDef,
  vaultCode: boolean,
  skillRequiredOverride?: number,
): number {
  if (skillRequiredOverride !== undefined && Number.isFinite(skillRequiredOverride)) {
    return Math.max(0, skillRequiredOverride);
  }
  // 런 필수 목표는 품격이 바닥났다는 이유로 영구히 막히면 탈출도 함께 막힌다.
  if (def.id === PERSONAL_ARTIFACT_LOOT_ID) return 0;
  return def.id === "vault" && vaultCode ? Math.max(0, def.skillRequired - 20) : def.skillRequired;
}

/** 대담한 절도와 연쇄 절도가 품격을 올린다. 위험을 감수한 깔끔함에만 붙는다. */
function stealSkillGain(run: RunState, input: RunStepInput, _def: LootDef, tuning: Tuning, nowMs: number): number {
  let gain = 0;
  if (input.nearestGuardPx <= tuning.skill.boldStealRangePx) gain += tuning.skill.boldSteal;
  if (nowMs - run.lastStealAtMs <= tuning.skill.chainStealMs) gain += tuning.skill.chainSteal;
  return gain;
}

export function nearestAnchor(
  at: Vec2,
  unavailableAnchorIds: readonly string[],
  layout: MansionLayout,
  tuning: Tuning,
  preferredAnchorId: string | null = null,
): LootAnchor | null {
  const preferred = preferredAnchorId === null
    ? undefined
    : layout.lootAnchors.find((anchor) => anchor.id === preferredAnchorId);
  if (
    preferred !== undefined
    && !unavailableAnchorIds.includes(preferred.id)
    && isAnchorInReach(preferred, at, interactionReachPx(tuning.loot.reachPx, tuning))
  ) return preferred;
  let best: LootAnchor | null = null;
  let bestDistance = interactionReachPx(tuning.loot.reachPx, tuning);
  for (const anchor of layout.lootAnchors) {
    if (anchor.id === preferredAnchorId) continue;
    if (unavailableAnchorIds.includes(anchor.id)) continue;
    const dx = anchor.at.x - at.x;
    const dy = anchor.at.y - at.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > bestDistance) continue;
    bestDistance = distance;
    best = anchor;
  }
  return best;
}

/** 여러 출구 판정이 겹치면 화면에 이미 고정된 출구를 실제 E 판정도 유지한다. */
export function interactionExitAt(
  layout: MansionLayout,
  at: Vec2,
  tuning: Tuning,
  preferredExitId: string | null = null,
): EscapePoint | null {
  const preferred = preferredExitId === null
    ? undefined
    : layout.escapes.find((exit) => exit.id === preferredExitId);
  if (preferred !== undefined && pointInInteractionRect(at, preferred.rect, tuning)) return preferred;
  return layout.escapes.find((exit) =>
    exit.id !== preferredExitId && pointInInteractionRect(at, exit.rect, tuning)
  ) ?? null;
}

function isAnchorInReach(anchor: LootAnchor, at: Vec2, reachPx: number): boolean {
  const dx = anchor.at.x - at.x;
  const dy = anchor.at.y - at.y;
  return Math.sqrt(dx * dx + dy * dy) <= reachPx;
}
