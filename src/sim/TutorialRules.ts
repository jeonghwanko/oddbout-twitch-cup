import tutorialContent from "./quests/tutorial.json";
import { parseTutorialQuestDefinitions, type TutorialRequirementDefinition } from "./TutorialQuestDefinition";
import { loadRatio } from "./CarryRules";
import { shouldWait } from "./CandelabraRules";
import { readablePatrolDwellMs } from "./GuardArchetypes";
import { interactionReachPx, pointInInteractionRect } from "./InteractionRangeRules";
import { onSameFloor } from "./geom";
import type { MansionLayout } from "./MansionLayout";
import { floorOfY } from "./MansionLayout";
import { createGuard } from "./GuardPlanner";
import type { GuardState } from "./GuardPlanner";
import { transitionGuardMode } from "./GuardStateMachine";
import * as SuspicionRules from "./SuspicionRules";
import * as SubdueRules from "./SubdueRules";
import { TUTORIAL_FLOORS, TUTORIAL_MANSION_LAYOUT, tutorialSurfaceY } from "./TutorialMansionLayout";
import { PERSONAL_ARTIFACT_ANCHOR_ID } from "./PersonalArtifactRules";
import type { OnboardingVerbId } from "./MetaProgressRules";
import type { SimState } from "./simulation";
import type { InputFrame, SimEvent, Vec2 } from "./types";
import { DEFAULT_TUNING } from "./tuning";
import { TUTORIAL_BEAT_IDS, TUTORIAL_FIRST_BEAT_ID, isTutorialBeatId, type TutorialBeatId } from "./TutorialBeatIds";
import type { Tuning } from "./tuning";
import {
  openingCanBeConfirmed as wardenOpeningCanBeConfirmed,
  tacticCue as wardenTacticCue,
} from "./WardenRules";

/**
 * 스토리형 첫 잠입의 진행 판정.
 *
 * 렌더는 목표와 대사를 보여 줄 뿐이고, 다음 장으로 갈 수 있는지는 실제 sim 상태와
 * 이벤트만으로 판단한다. 편법으로 목표선을 넘겨도 필요한 행동 증거가 없으면 통과하지 않는다.
 */

// 장 ID 는 `TutorialBeatIds`가 소유한다. 이 모듈을 쓰던 곳이 그대로 쓰도록 다시 내보낸다.
export { TUTORIAL_BEAT_IDS, TUTORIAL_FIRST_BEAT_ID, isTutorialBeatId, type TutorialBeatId };

/** 유인 실습을 끝내고 아직 반장 서쪽에 있을 때 전술 교습을 시작하는 경계. */
export const TUTORIAL_WARDEN_APPROACH_X = 1180;

export const TUTORIAL_CLIMAX_ANCHOR_ID = "tutorial-musicbox";

function requiredTutorialClimaxAnchor(): MansionLayout["lootAnchors"][number] {
  const anchor = TUTORIAL_MANSION_LAYOUT.lootAnchors.find(
    (candidate) => candidate.id === TUTORIAL_CLIMAX_ANCHOR_ID,
  );
  if (anchor === undefined) throw new Error("tutorial climax anchor is missing");
  return anchor;
}

function requiredTutorialRoofWindow(): MansionLayout["escapes"][number] {
  const escape = TUTORIAL_MANSION_LAYOUT.escapes.find(
    (candidate) => candidate.id === "tutorial-roof-window",
  );
  if (escape === undefined) throw new Error("tutorial roof window is missing");
  return escape;
}

const TUTORIAL_CLIMAX_ANCHOR = requiredTutorialClimaxAnchor();
const TUTORIAL_ROOF_WINDOW = requiredTutorialRoofWindow();

export type TutorialAction =
  | "left"
  | "right"
  | "up"
  | "down"
  | "run"
  | "jump"
  | "interact"
  | "hide"
  | "whistle"
  | "throw"
  | "snuff"
  | "drop"
  | "thiefEye"
  | "attack"
  | "heavy";

/**
 * 한 장을 판정할 때 보는 것 전부.
 *
 * 장마다 필요한 재료가 조금씩 다르므로 한 묶음으로 넘긴다. 술어가 이것 말고
 * 다른 것을 보기 시작하면 그 장은 표에 담을 수 없는 예외라는 신호다.
 */
export interface StageContext {
  readonly state: SimState;
  readonly evidence: TutorialEvidence;
  readonly tuning: Tuning;
  readonly floor: number;
}

export interface StageRequirement {
  /** 아직 괜찮은가. false 면 `retry` 문구를 돌려준다. */
  readonly met: (ctx: StageContext) => boolean;
  readonly retry: TutorialRetry;
}

export interface TutorialRetry {
  readonly text: string;
  readonly actions: readonly TutorialAction[];
}

/**
 * 한 장의 합격 조건.
 *
 * 모양이 모든 장에서 같다: **도착하면 → 순서대로 확인하고 → 통과 문구**.
 * 이것이 `judgeTutorial` 이 8개 case 를 가질 이유가 없었던 이유다.
 *
 * `reached` 만 임의 술어로 남긴다 — 월드 좌표와 층 조건은 데이터로 접을 수 없고,
 * 접으려 하면 표가 아니라 새 언어를 만들게 된다.
 */
export interface StageObjective {
  /** 판정 지점에 도달했는가. */
  readonly reached: (ctx: StageContext) => boolean;
  /** 순서대로 검사한다. 처음 실패한 요구가 재시도 문구를 준다. */
  readonly requires: readonly StageRequirement[];
  readonly complete: string;
  /** 도착 전이라도 되돌릴 수 없게 됐는가. 자원을 다 쓴 막다른 길을 잡는다. */
  readonly stuck?: readonly StageRequirement[];
}

export interface TutorialBeatDef {
  readonly id: TutorialBeatId;
  readonly title: string;
  readonly goal: string;
  readonly checkpoint: Vec2;
  readonly objective: StageObjective;
  /** 이 장을 시작할 때 원위치시킬 경비. 이전 방에서 쫓아온 경비가 새 구간을 침범하지 않게 한다. */
  readonly resetGuardIds?: readonly string[];
}

export interface TutorialEvidence {
  readonly jumped: boolean;
  readonly crouched: boolean;
  readonly hid: boolean;
  readonly whistled: boolean;
  readonly whistledWhileHidden: boolean;
  readonly usedEye: boolean;
  /** 관찰 장에서 감시 촛대가 실제 spotted 단계까지 플레이어를 포착했는가. */
  readonly detectedByClock: boolean;
  readonly descended: boolean;
  readonly lampSnuffed: boolean;
  readonly pocketwatchStolen: boolean;
  readonly usedVent: boolean;
  readonly droppedLoot: boolean;
  readonly lureLandedBeyondGuard: boolean;
  readonly lureFailed: boolean;
  readonly guardSubdued: boolean;
  readonly ascended: boolean;
  /** 선택적으로 괴도의 눈을 써 반장의 현재 안전 방향을 읽었는가. */
  readonly watchedWardenTurn: boolean;
  readonly musicboxStolen: boolean;
  readonly ran: boolean;
  readonly attackDodged: boolean;
  readonly bruiserShoved: boolean;
  readonly bruiserHit: boolean;
  readonly bruiserDefeated: boolean;
  /** 오르골을 든 채 곤봉병을 출구 쪽으로 추월했는가. */
  readonly bruiserBypassed: boolean;
  readonly struggledFree: boolean;
}

export interface TutorialPrompt {
  readonly actions: readonly TutorialAction[];
  readonly label: string;
  /**
   * HUD 목표 카드에 들어가는 문장형 설명.
   *
   * 월드 키캡 위 라벨은 줄바꿈 없는 한 줄이라 짧아야 하고, 카드 줄은 두 줄까지 접힌다.
   * 조건에 숫자가 붙는 프롬프트만 여기서 그 숫자를 밝힌다.
   */
  readonly detail?: string;
  readonly markerX: number;
  readonly markerFloor: number;
  /** 바닥선이 아니라 실제 오브젝트 중심을 가리켜야 할 때 쓰는 선택 좌표. */
  readonly markerY?: number;
  /** 첫 유물처럼 위 화살촉과 바닥 타원으로 실물을 강조할 목표. */
  readonly emphasis?: "objective";
  /** 실제 상호작용 대상과 같아지는 순간 원거리 표식에서 대상 키캡으로 소유권을 넘긴다. */
  readonly targetId?: string;
  /**
   * 조작 자체를 가르칠 때는 월드 목표 원과 방향 접두사를 생략한다(`actor-action`).
   *
   * 통과하는 것 자체가 과제인 구간은 `route-only`다. 목적지 표식은 그대로 두되, 지나가는
   * 동안 잠깐씩 열리는 문맥 행동 키캡은 비운다. 몸 충돌이 꺼진 통과 창에서는 경비를
   * 관통하므로 등 뒤 키캡이 몇 프레임씩 번쩍이는데, 그것이 정작 지금 해야 할 이동을 가린다.
   */
  readonly presentation?: "world-target" | "actor-action" | "route-only";
}

/** 첫 세션은 전투 콤보가 아니라 위기를 한 번 넘겨 탈출할 수 있음을 증명하면 된다. */
export function tutorialEscapeResponseProven(evidence: TutorialEvidence): boolean {
  return evidence.attackDodged ||
    evidence.bruiserShoved ||
    evidence.bruiserHit ||
    evidence.bruiserDefeated ||
    evidence.bruiserBypassed;
}

/** 휘파람과 옷장을 실제로 모두 활용했다면 입력 순서와 동시 여부를 강제하지 않는다. */
export function tutorialHideMisdirectionProven(evidence: TutorialEvidence): boolean {
  return evidence.hid && evidence.whistled;
}

/** 유인구와 선택형 무력화는 경비를 비우는 서로 다른 정답이다. */
export function tutorialLureResponseProven(evidence: TutorialEvidence): boolean {
  return evidence.lureLandedBeyondGuard || evidence.guardSubdued;
}

export type TutorialJudgement =
  | { readonly kind: "playing" }
  | { readonly kind: "complete"; readonly message: string }
  | { readonly kind: "retry"; readonly message: string; readonly actions: readonly TutorialAction[] };

const at = (x: number, floor: number): Vec2 => ({ x, y: tutorialSurfaceY(floor) });
const TUTORIAL_RUN_DURATION_MS = 60 * 60 * 1000;

/**
 * 교습 난도는 저장된 강화·주인공 성능과 무관하게 하나로 고정한다.
 * 같은 짐이 어떤 저장에서는 환기구를 막고 다른 저장에서는 통과하면 조작이 아니라 저장 상태를 배운다.
 */
export function tutorialTuning(): Tuning {
  return {
    ...DEFAULT_TUNING,
    run: {
      ...DEFAULT_TUNING.run,
      durationMs: TUTORIAL_RUN_DURATION_MS,
      escapeCharges: Math.max(1, DEFAULT_TUNING.run.escapeCharges),
    },
  };
}

const TUTORIAL_REACHED: Readonly<Record<TutorialBeatId, StageObjective["reached"]>> = {
  arrival: ({ state }) => state.player.x >= 720,
  hide: ({ state }) => state.player.x >= 1400,
  observe: ({ state, floor }) => floor === TUTORIAL_FLOORS.basement && state.player.onGround,
  snuff: ({ state }) => state.player.x <= 1320,
  steal: ({ state, floor }) =>
        floor === TUTORIAL_FLOORS.gallery && state.player.ventLinkId === null && state.player.onGround,
  lure: ({ state }) => state.player.x >= TUTORIAL_WARDEN_APPROACH_X,
  wait: ({ state, floor }) =>
        floor === TUTORIAL_FLOORS.attic && state.player.climbLinkId === null && state.player.onGround,
  escape: ({ state }) => state.run.outcome === "escaped",
};
const TUTORIAL_REQUIREMENTS = {
  "jumped": ({ evidence }) => evidence.jumped,
  "ran": ({ evidence }) => evidence.ran,
  "hide-misdirection": ({ evidence }) => tutorialHideMisdirectionProven(evidence),
  "lamp-snuffed": ({ evidence }) => evidence.lampSnuffed,
  "carrying-pocketwatch": ({ state }) => carrying(state, "tutorial-pocketwatch"),
  "used-vent": ({ evidence }) => evidence.usedVent,
  "lure-response": ({ evidence }) => tutorialLureResponseProven(evidence),
  "lure-retry-possible": ({ state, evidence }) =>
          tutorialLureResponseProven(evidence)
          || state.mischief.mouseAmmo > 0
          || state.mischief.projectiles.length > 0,
  "carrying-climax": ({ state }) => carryingTutorialClimax(state),
} satisfies Readonly<Record<string, StageRequirement["met"]>>;

export const TUTORIAL_DEFINITION_BINDINGS = Object.freeze({
  reached: Object.keys(TUTORIAL_REACHED), conditions: Object.keys(TUTORIAL_REQUIREMENTS),
  floors: Object.keys(TUTORIAL_FLOORS), guards: TUTORIAL_MANSION_LAYOUT.guards.map(guard => guard.id),
});
const tutorialDefinitions = parseTutorialQuestDefinitions(tutorialContent, TUTORIAL_DEFINITION_BINDINGS);

export const TUTORIAL_BEATS: readonly TutorialBeatDef[] = tutorialDefinitions.order.map(id => {
  const definition = tutorialDefinitions.beats[id]!;
  const requirement = (entry: TutorialRequirementDefinition): StageRequirement => ({
    met: TUTORIAL_REQUIREMENTS[entry.condition as keyof typeof TUTORIAL_REQUIREMENTS], retry: entry.retry,
  });
  return { id: id as TutorialBeatId, title: definition.title, goal: definition.goal,
    checkpoint: at(definition.checkpoint.x === "warden-approach" ? TUTORIAL_WARDEN_APPROACH_X : definition.checkpoint.x,
      TUTORIAL_FLOORS[definition.checkpoint.floor as keyof typeof TUTORIAL_FLOORS]),
    ...(definition.resetGuardIds === undefined ? {} : { resetGuardIds: definition.resetGuardIds }),
    objective: { reached: TUTORIAL_REACHED[definition.objective.reached as TutorialBeatId],
      requires: definition.objective.requires.map(requirement), complete: definition.objective.complete,
      ...(definition.objective.stuck === undefined ? {} : { stuck: definition.objective.stuck.map(requirement) }) },
  };
});

export const TUTORIAL_BEAT_TABLE: Readonly<Record<TutorialBeatId, TutorialBeatDef>> = Object.freeze(
  Object.fromEntries(TUTORIAL_BEATS.map((beat) => [beat.id, beat])) as Record<TutorialBeatId, TutorialBeatDef>,
);

export function tutorialBeat(id: TutorialBeatId): TutorialBeatDef {
  return TUTORIAL_BEAT_TABLE[id];
}

export function tutorialBeatIndex(id: TutorialBeatId): number {
  return TUTORIAL_BEAT_IDS.indexOf(id);
}

export function nextTutorialBeat(id: TutorialBeatId): TutorialBeatId | null {
  return tutorialDefinitions.beats[id]!.next as TutorialBeatId | null;
}

export function tutorialLayoutAt(id: TutorialBeatId): MansionLayout {
  const beforeWardenBeat = tutorialBeatIndex(id) < tutorialBeatIndex("wait");
  return {
    ...TUTORIAL_MANSION_LAYOUT,
    spawn: tutorialBeat(id).checkpoint,
    guards: beforeWardenBeat
      ? TUTORIAL_MANSION_LAYOUT.guards.map((guard) => guard.id === "tutorial-warden"
        // 유인구 구간의 동쪽 엄폐 뒤에서 보이는 위치·방향은 유지하되 아직 순찰하지 않는다.
        // wait 전환이 같은 좌표의 정식 route를 넘기므로 렌더 배우가 순간이동하지 않는다.
        ? {
            ...guard,
            route: [guard.route[0] ?? 1250],
            dwellMs: 99999,
            periodicScanDisabled: true,
            // 다음 장 배우를 미리 보여 주되 현재 유인 실습의 시야·접촉·상호작용에는 참여시키지 않는다.
            previewOnly: true,
          }
        : guard)
      : TUTORIAL_MANSION_LAYOUT.guards,
  };
}

const OPENING_RUNWAY_GEOMETRY_IDS = new Set([
  "crate-stack-3f-tutorial-musicbox",
  "bookcase-3f-tutorial-bruiser",
  "tutorial-attic-crate",
  "covered-armchair-3f-tutorial-west",
  "garment-rack-3f-tutorial-exit",
]);

/**
 * 첫 45초는 점프 시험이 아니라 훔치고 도망치는 판타지를 먼저 판다.
 * 전체 교습의 다락 구조는 보존하고 오프닝 복제본에서만 탈출 동선을 비운다.
 */
export function openingTutorialLayoutAt(id: TutorialBeatId): MansionLayout {
  const layout = tutorialLayoutAt(id);
  if (id !== "escape") return layout;
  return {
    ...layout,
    id: `${layout.id}-opening`,
    geometry: layout.geometry.filter((geometry) => !OPENING_RUNWAY_GEOMETRY_IDS.has(geometry.id)),
    guards: layout.guards.map((guard) => guard.id === "tutorial-bruiser"
      // 전체 훈련에서는 정면 회피를 가르치지만, 오프닝은 아직 구르기·발버둥을
      // 소개하지 않는다. 추격자는 뒤에서 압박하되 왼쪽 퇴로를 몸으로 막지 않는다.
      ? { ...guard, route: [2020], facing: 1 }
      : guard),
  };
}

export type TutorialBeatPreparation = "checkpoint" | "continuation";

/**
 * 체크포인트 진입은 경비를 저자 배치로 되돌리고, 정상적인 연속 장 전환은 현재 배치를 보존한다.
 * 두 경우 모두 의심·접촉·행동 상태는 새 장의 초기 상태로 비운다.
 */
export function prepareTutorialBeat(
  state: SimState,
  id: TutorialBeatId,
  tuning: Tuning,
  preparation: TutorialBeatPreparation = "checkpoint",
): SimState {
  const guardIds = tutorialBeat(id).resetGuardIds;
  if (guardIds === undefined) return state;
  const layout = tutorialLayoutAt(id);
  return {
    ...state,
    guards: state.guards.map((guard) => {
      if (!guardIds.includes(guard.id)) return guard;
      const spawn = layout.guards.find((candidate) => candidate.id === guard.id);
      if (spawn === undefined) return guard;
      const reset = createGuard(spawn, tuning);
      const positioned = preparation === "checkpoint"
        ? reset
        : {
            ...reset,
            x: guard.x,
            y: guard.y,
            floor: guard.floor,
            facing: guard.facing,
          };
      if (id !== "wait" || guard.id !== "tutorial-warden") return positioned;

      // 유인구 장의 완료선은 아직 반장 서쪽이다. 일반 대기 전체를 첫 통과 창으로 열어
      // 장 전환 즉시 HUD·몸 충돌·시야가 같은 `WardenRules` 상태를 읽게 한다.
      return {
        ...positioned,
        dwellMs: readablePatrolDwellMs(
          "warden",
          spawn.dwellMs,
          tuning.guard.turnWindupMs,
        ),
        turnPending: true,
        openingPassEnabled: true,
      };
    }),
  };
}

export function createTutorialEvidence(): TutorialEvidence {
  return {
    jumped: false,
    crouched: false,
    hid: false,
    whistled: false,
    whistledWhileHidden: false,
    usedEye: false,
    detectedByClock: false,
    descended: false,
    lampSnuffed: false,
    pocketwatchStolen: false,
    usedVent: false,
    droppedLoot: false,
    lureLandedBeyondGuard: false,
    lureFailed: false,
    guardSubdued: false,
    ascended: false,
    watchedWardenTurn: false,
    musicboxStolen: false,
    ran: false,
    attackDodged: false,
    bruiserShoved: false,
    bruiserHit: false,
    bruiserDefeated: false,
    bruiserBypassed: false,
    struggledFree: false,
  };
}

/** 화면 추측이 아니라 실제 튜토리얼 증거를 영구 학습 상태로 번역한다. */
export function learnedVerbsFromTutorialEvidence(
  evidence: TutorialEvidence,
  hasMoved: boolean,
  escaped: boolean,
): readonly OnboardingVerbId[] {
  const learned: OnboardingVerbId[] = [];
  if (hasMoved) learned.push("move");
  if (evidence.jumped) learned.push("jump");
  if (evidence.ran) learned.push("run");
  if (evidence.crouched) learned.push("crouch");
  if (evidence.pocketwatchStolen || evidence.musicboxStolen || evidence.usedVent || evidence.guardSubdued) {
    learned.push("interact");
  }
  if (evidence.hid) learned.push("hide");
  if (evidence.whistled) learned.push("whistle");
  if (evidence.usedEye) learned.push("thief-eye");
  if (evidence.lampSnuffed) learned.push("snuff");
  if (evidence.usedVent) learned.push("vent");
  if (evidence.droppedLoot) learned.push("drop");
  if (evidence.lureLandedBeyondGuard || evidence.lureFailed) learned.push("lure");
  if (evidence.attackDodged) learned.push("dodge");
  if (evidence.struggledFree) learned.push("struggle");
  if (escaped) learned.push("escape");
  return learned;
}

function hasEvent(events: readonly SimEvent[], kind: SimEvent["kind"]): boolean {
  return events.some((event) => event.kind === kind);
}

function stolen(state: SimState, anchorId: string): boolean {
  return state.run.stolen.some((item) => item.anchorId === anchorId);
}

function carrying(state: SimState, anchorId: string): boolean {
  return state.carry.items.some((item) => item.id === anchorId);
}

function carryingTutorialClimax(state: SimState): boolean {
  return carrying(state, TUTORIAL_CLIMAX_ANCHOR_ID) || carrying(state, PERSONAL_ARTIFACT_ANCHOR_ID);
}

/**
 * 플레이어가 실제 퇴로 방향으로 움직이며 곤봉병의 반대편까지 추월한 프레임만 인정한다.
 * 현재 좌표 한 장만 비교하면 곤봉병이 정지 플레이어를 지나간 경우도 파훼로 오인한다.
 */
function crossedTutorialBruiserTowardExit(
  before: SimState,
  state: SimState,
  tuning: Tuning,
): boolean {
  const bruiserBefore = before.guards.find((guard) => guard.id === "tutorial-bruiser");
  const bruiserAfter = state.guards.find((guard) => guard.id === "tutorial-bruiser");
  const bruiserSpawn = TUTORIAL_MANSION_LAYOUT.guards.find((guard) => guard.id === "tutorial-bruiser");
  const exit = TUTORIAL_MANSION_LAYOUT.escapes.find((candidate) => candidate.id === "tutorial-roof-window");
  const spawnX = bruiserSpawn?.route[0];
  if (bruiserBefore === undefined || bruiserAfter === undefined || spawnX === undefined || exit === undefined) {
    return false;
  }

  const exitX = exit.rect.x + exit.rect.w / 2;
  const exitDirection = exitX < spawnX ? -1 : 1;
  const playerMovedTowardExit = (state.player.x - before.player.x) * exitDirection > 0;
  const beforeLead = (before.player.x - bruiserBefore.x) * exitDirection;
  // 경비가 플레이어 반대편으로 이동해 상대 순서만 뒤집은 경우를 배제한다. 플레이어의
  // 새 좌표가 경비의 이전 좌표까지 직접 넘어야 실제 추월이다.
  const playerPassedPreviousGuard = (state.player.x - bruiserBefore.x) * exitDirection > 0;
  const afterLead = (state.player.x - bruiserAfter.x) * exitDirection;
  return carryingTutorialClimax(state) &&
    onSameFloor(before.player.y, bruiserBefore.y, tuning.world.floorHeightPx) &&
    onSameFloor(state.player.y, bruiserAfter.y, tuning.world.floorHeightPx) &&
    playerMovedTowardExit &&
    beforeLead <= 0 &&
    playerPassedPreviousGuard &&
    afterLead > 0;
}

export function observeTutorial(
  previous: TutorialEvidence,
  before: SimState,
  state: SimState,
  events: readonly SimEvent[],
  tuning: Tuning,
): TutorialEvidence {
  const beforeFloor = floorOfY(before.player.y, tuning.world.floorHeightPx);
  const floor = floorOfY(state.player.y, tuning.world.floorHeightPx);
  const lureGuard = state.guards.find((guard) => guard.id === "tutorial-lure-guard");
  const landedBeyond =
    lureGuard !== undefined &&
    events.some(
      (event) => event.kind === "NoiseEmitted" && event.source === "mouse" && event.at.x > lureGuard.x + 20,
    );
  const lureFailed =
    hasEvent(events, "GuardGrazed") ||
    (lureGuard !== undefined &&
      events.some(
        (event) => event.kind === "NoiseEmitted" && event.source === "mouse" && event.at.x <= lureGuard.x + 20,
      ));
  const bruiserAfter = state.guards.find((guard) => guard.id === "tutorial-bruiser");
  const bruiserShoved = events.some(
    (event) => event.kind === "GuardShoved" && event.guardId === "tutorial-bruiser",
  );
  // CombatHit 자체가 플레이어 공격의 유효타 계약이다. 같은 프레임의 표현용 PlayerAttacked
  // 사건까지 요구하면 두 사건의 방출 시점이 분리되는 순간 실제 타격 증거를 잃는다.
  const bruiserHit = events.some(
    (event) => event.kind === "CombatHit" && event.guardId === "tutorial-bruiser",
  );
  const bruiserDefeated = events.some(
    (event) => event.kind === "CombatDefeated" && event.guardId === "tutorial-bruiser",
  ) || bruiserAfter?.combat?.defeated === true;
  const bruiserBypassed = crossedTutorialBruiserTowardExit(before, state, tuning);
  const bruiserDodged = events.some(
    (event) => event.kind === "PerfectDodge" && event.guardId === "tutorial-bruiser",
  );
  const escapedStruggle =
    before.run.struggle !== null &&
    state.run.struggle === null &&
    state.run.escapeCharges < before.run.escapeCharges &&
    state.run.outcome === null;
  const whistle = events.some((event) => event.kind === "NoiseEmitted" && event.source === "whistle");
  const jumped = previous.jumped || hasEvent(events, "PlayerJumped");
  const detectedByClock = events.some(
    (event) => event.kind === "SuspicionTierChanged"
      && event.guardId === "tutorial-clock-guard"
      && event.to === "spotted",
  );
  const wardenBefore = before.guards.find((guard) => guard.id === "tutorial-warden");
  const wardenAfter = state.guards.find((guard) => guard.id === "tutorial-warden");
  const usedEye = previous.usedEye || state.mischief.eyeActive || before.mischief.eyeActive;
  const inspectedWardenNow = state.mischief.eyeActive || before.mischief.eyeActive;
  const watchedWardenTurn =
    wardenBefore !== undefined &&
    wardenAfter !== undefined &&
    // 이전 장에서 쓴 괴도의 눈 이력을 재사용하지 않는다. 현재 프레임에 Tab을 들고
    // 실제 방향·거리·대기 상태를 확인한 순간에만 통과 권한을 연다.
    inspectedWardenNow &&
    wardenOpeningCanBeConfirmed(
      wardenAfter,
      { x: state.player.x, y: state.player.y },
      tuning,
    ) &&
    state.player.x <= 1497 &&
    wardenAfter.dwellMs > 0;

  return {
    jumped,
    crouched: previous.crouched || state.player.pose === "crouch",
    hid: previous.hid || state.player.hideSpotId !== null || before.player.hideSpotId !== null,
    whistled: previous.whistled || whistle,
    whistledWhileHidden:
      previous.whistledWhileHidden ||
      (whistle && (before.player.hideSpotId !== null || state.player.hideSpotId !== null)),
    usedEye,
    detectedByClock: previous.detectedByClock || detectedByClock,
    descended: previous.descended || floor > beforeFloor,
    lampSnuffed: previous.lampSnuffed || state.mischief.snuffedLamps.includes("tutorial-basement-lamp"),
    pocketwatchStolen: previous.pocketwatchStolen || stolen(state, "tutorial-pocketwatch"),
    usedVent: previous.usedVent || before.player.ventLinkId !== null || state.player.ventLinkId !== null || (beforeFloor === 3 && floor === 1),
    droppedLoot:
      previous.droppedLoot || events.some((event) => event.kind === "NoiseEmitted" && event.source === "lootDropped"),
    lureLandedBeyondGuard: previous.lureLandedBeyondGuard || landedBeyond,
    lureFailed: previous.lureFailed || lureFailed,
    guardSubdued: previous.guardSubdued || hasEvent(events, "GuardSubdued"),
    ascended: previous.ascended || floor < beforeFloor,
    watchedWardenTurn: previous.watchedWardenTurn || watchedWardenTurn,
    // 필드명은 저장·표현 계약을 위해 유지하지만, 첫 세션에서는 같은 절정 자리에 개인 유물이 온다.
    musicboxStolen: previous.musicboxStolen ||
      stolen(state, TUTORIAL_CLIMAX_ANCHOR_ID) ||
      stolen(state, PERSONAL_ARTIFACT_ANCHOR_ID),
    ran: previous.ran || state.player.motion === "run" || before.player.motion === "run",
    // 회피 교습 성공과 실제 공격 종료를 같은 사건으로 묶는다. 선딜 중 너무 일찍 구르거나
    // 수색 돋보기 때 구른 입력만으로는 판정을 통과했다고 가르치지 않는다.
    attackDodged: previous.attackDodged || bruiserDodged,
    bruiserShoved: previous.bruiserShoved || bruiserShoved,
    bruiserHit: previous.bruiserHit || bruiserHit,
    // 안내를 무시하고 3연계를 먼저 완주한 숙련자는 이미 더 어려운 해법을 증명했다.
    // 쓰러진 상대에게 강공격을 강요해 체크포인트를 막지 않는다.
    bruiserDefeated: previous.bruiserDefeated || bruiserDefeated,
    bruiserBypassed: previous.bruiserBypassed || bruiserBypassed,
    struggledFree: previous.struggledFree || escapedStruggle,
  };
}

/**
 * 오르골을 건드리면 숨겨 둔 태엽 경보가 울린다.
 *
 * 마지막 복도에서 전투 경비를 우연히 스쳐 지나가 회피 학습을 건너뛰지 않도록 경계를 올린다.
 * 단, 엄폐 뒤 플레이어 좌표를 미리 알게 하지는 않는다. 곤봉병은 자기 자리에서 수색하다
 * 플레이어가 책장을 빠져나와 실제로 보이는 순간 정면 교전을 시작한다.
 */
export function activateTutorialClimaxGuards(
  guards: readonly GuardState[],
  tuning: Tuning,
): readonly GuardState[] {
  return guards.map((guard) =>
      guard.id === "tutorial-bruiser"
        ? {
            ...guard,
            mode: transitionGuardMode(guard.mode, { kind: "alerted" }),
            susp: SuspicionRules.bump(
              guard.susp,
              tuning.suspicion.max,
              { x: guard.x, y: guard.y - tuning.movement.bodyHeightStand / 2 },
              tuning,
            ),
          }
        : guard,
    );
}

/** @deprecated 새 sim 스텝은 경비 배열 규칙을 직접 소비한다. 기존 순수 규칙 호출자를 위한 래퍼. */
export function activateTutorialClimax(state: SimState, tuning: Tuning): SimState {
  return { ...state, guards: activateTutorialClimaxGuards(state.guards, tuning) };
}

function retry(feedback: TutorialRetry): TutorialJudgement {
  return { kind: "retry", message: feedback.text, actions: feedback.actions };
}

/**
 * 이 장을 통과했는가.
 *
 * 모든 장이 같은 모양을 쓰므로 분기 대신 표를 읽는다. 장을 추가하는 일이
 * 이 함수를 고치는 일이 아니게 되는 것이 요점이다.
 */
export function judgeTutorial(
  id: TutorialBeatId,
  evidence: TutorialEvidence,
  state: SimState,
  tuning: Tuning,
): TutorialJudgement {
  if (state.run.outcome === "busted") {
    return retry({ text: "붙잡혔습니다. 이 장의 입구에서 다시 해 보세요.", actions: [] });
  }

  const ctx: StageContext = {
    state,
    evidence,
    tuning,
    floor: floorOfY(state.player.y, tuning.world.floorHeightPx),
  };
  const { objective } = tutorialBeat(id);

  // 다음 안전 구역 도착은 과거의 회복 가능한 실수보다 우선한다. 단, 장의 핵심 행동이나
  // 필수 물건이 빠졌다면 해당 requirement가 명시적으로 재시도를 요구한다.
  if (objective.reached(ctx)) {
    const missing = objective.requires.find((requirement) => !requirement.met(ctx));
    return missing === undefined
      ? { kind: "complete", message: objective.complete }
      : retry(missing.retry);
  }

  // stuck은 유인구를 모두 소비한 경우처럼 아직 목적지에 닿지 못했고 더 진행할 방법도
  // 없는 진짜 막다른 길만 소유한다.
  const deadEnd = (objective.stuck ?? []).find((requirement) => !requirement.met(ctx));
  if (deadEnd !== undefined) return retry(deadEnd.retry);

  return { kind: "playing" };
}

export interface TutorialChecklistItem {
  readonly label: string;
  readonly done: boolean;
}

/**
 * 장의 할 일을 처음부터 모두 펼친 체크리스트.
 *
 * `tutorialPrompt`가 "지금 누를 것" 하나를 고른다면, 이쪽은 장 전체의 굵은 단계만 남긴다.
 * 한 줄씩 갈아 끼우면 앞으로 몇 개가 남았는지, 방금 무엇을 끝냈는지 읽히지 않는다.
 * 경비 시선을 기다리라는 식의 상황 안내는 목록에 넣지 않는다 — 그건 월드 키캡이 맡는다.
 * 마지막 항목은 대개 장의 도착 조건이라 체크되는 순간 다음 장으로 넘어간다.
 */
export function tutorialChecklist(
  id: TutorialBeatId,
  evidence: TutorialEvidence,
  state: SimState,
  climaxAnchorId: string = TUTORIAL_CLIMAX_ANCHOR_ID,
  openingHeist = false,
): readonly TutorialChecklistItem[] {
  const escaped = state.run.outcome === "escaped";
  switch (id) {
    case "arrival":
      return [
        { label: "낮은 짐짝 넘기", done: evidence.jumped },
        { label: "의상실까지 질주", done: evidence.ran },
      ];
    case "hide":
      return [
        { label: "옷장에 숨기", done: evidence.hid },
        { label: "휘파람", done: evidence.whistled },
        { label: "경비 등 뒤로 통과", done: state.player.x >= 1400 },
      ];
    case "observe":
      return [
        { label: "감시 분석", done: evidence.usedEye },
        { label: "지하로 내려가기", done: evidence.descended },
      ];
    case "snuff":
      return [
        { label: "램프 불 끄기", done: evidence.lampSnuffed },
        { label: "어둠 속에서 몸 낮춰 통과", done: state.player.x <= 1320 },
      ];
    case "steal":
      return [
        { label: "회중시계 되찾기", done: evidence.pocketwatchStolen || carrying(state, "tutorial-pocketwatch") },
        { label: "환기구로 2층 탈출", done: evidence.usedVent },
      ];
    case "lure":
      return [
        { label: "유인구로 경비 비우기", done: tutorialLureResponseProven(evidence) },
        { label: "반장 앞 엄폐까지", done: state.player.x >= TUTORIAL_WARDEN_APPROACH_X },
      ];
    case "wait":
      return [
        { label: "빈틈에 사다리까지 질주", done: evidence.ascended || state.player.climbLinkId !== null || state.player.x >= 1940 },
        { label: "사다리로 다락 오르기", done: evidence.ascended },
      ];
    case "escape": {
      const recovered = { label: "", done: evidence.musicboxStolen || carryingTutorialClimax(state) };
      if (openingHeist) {
        return [
          { ...recovered, label: "유물 되찾기" },
          { label: "옥상 창으로 탈출", done: escaped },
        ];
      }
      return [
        { ...recovered, label: climaxAnchorId === PERSONAL_ARTIFACT_ANCHOR_ID ? "내 유물 되찾기" : "노래하는 오르골 되찾기" },
        { label: "곤봉병 따돌리기", done: tutorialEscapeResponseProven(evidence) },
        { label: "옥상 창으로 탈출", done: escaped },
      ];
    }
  }
}

/**
 * 지금 무엇을 누르라고 보여 줄 것인가.
 *
 * 판정(`judgeTutorial`)과 달리 이쪽은 표로 접지 않았다. 각 장의 안내가 증거 플래그뿐
 * 아니라 특정 경비의 의심 단계, 무력화 후보, 적재율, 사다리 위치를 그때그때 계산해
 * 쓰기 때문이다. 이것을 데이터로 만들면 행마다 서로 다른 클로저가 들어앉아 switch 와
 * 같은 코드에 껍데기만 늘어난다 — 표가 아니라 가짜 DSL 이 된다.
 *
 * 규칙적인 것만 표로 옮기고 불규칙한 것은 정직하게 분기로 둔다.
 */
export function tutorialPrompt(
  id: TutorialBeatId,
  evidence: TutorialEvidence,
  state: SimState,
  tuning: Tuning,
  climaxAnchorId: string = TUTORIAL_CLIMAX_ANCHOR_ID,
  openingHeist = false,
): TutorialPrompt | null {
  const floor = floorOfY(state.player.y, tuning.world.floorHeightPx);
  const climaxAt = TUTORIAL_CLIMAX_ANCHOR.at;
  const roofWindowAt = {
    x: TUTORIAL_ROOF_WINDOW.rect.x + TUTORIAL_ROOF_WINDOW.rect.w / 2,
    y: TUTORIAL_ROOF_WINDOW.rect.y + TUTORIAL_ROOF_WINDOW.rect.h / 2,
  };
  const atRoofWindow = pointInInteractionRect(
    { x: state.player.x, y: state.player.y },
    TUTORIAL_ROOF_WINDOW.rect,
    tuning,
  );
  switch (id) {
    case "arrival":
      if (!evidence.jumped) return { actions: ["right", "jump"], label: "낮은 짐짝 넘기", markerX: 340, markerFloor: 2 };
      if (!evidence.ran) return { actions: ["run", "right"], label: "의상실까지 질주", markerX: 720, markerFloor: 2 };
      return { actions: ["right"], label: "의상실로 이동", markerX: 720, markerFloor: 2 };
    case "hide":
      if (!evidence.hid) {
        return { actions: ["hide"], label: "옷장에 숨기", markerX: 815, markerFloor: 2, targetId: "tutorial-wardrobe" };
      }
      if (!evidence.whistled) return { actions: ["whistle"], label: "휘파람", markerX: 815, markerFloor: 2, presentation: "actor-action" };
      if (state.player.hideSpotId !== null) return { actions: ["hide"], label: "경비가 지나가면 나오기", markerX: 815, markerFloor: 2, targetId: "tutorial-wardrobe", presentation: "actor-action" };
      return { actions: ["right"], label: "경비 등 뒤로 통과", markerX: 1400, markerFloor: 2 };
    case "observe":
      if (!evidence.usedEye) return { actions: ["thiefEye"], label: "감시 분석", markerX: 1620, markerFloor: 2, presentation: "actor-action" };
      if (state.player.climbLinkId !== null) {
        return { actions: ["down"], label: "사다리 아래까지 내려가기", markerX: 1998, markerFloor: 3, targetId: "tutorial-ladder-basement" };
      }
      if (floor === TUTORIAL_FLOORS.basement && !state.player.onGround) return null;
      if (floor === TUTORIAL_FLOORS.service && state.player.x >= 1970) {
        return { actions: ["down"], label: "사다리로 조용히 내려가기", markerX: 1998, markerFloor: 2, targetId: "tutorial-ladder-basement" };
      }
      if (floor === TUTORIAL_FLOORS.service && state.player.x < 1770) {
        const clock = state.guards.find((guard) => guard.id === "tutorial-clock-guard");
        if (clock !== undefined && clock.susp.tier !== "calm") {
          return { actions: ["thiefEye"], label: "엄폐 유지 · 경계가 풀릴 때까지", markerX: clock.x, markerFloor: 2, presentation: "actor-action" };
        }
        if (clock !== undefined && shouldWait(state.player, { guard: clock, side: -1 })) {
          return { actions: ["thiefEye"], label: "돌아설 때까지 관찰", markerX: clock.x, markerFloor: 2, presentation: "actor-action" };
        }
        return { actions: ["run", "right"], label: "지금! 시야 반대편 엄폐까지 질주", markerX: 1770, markerFloor: 2 };
      }
      return { actions: ["right"], label: "지하 사다리까지 이동", markerX: 1998, markerFloor: 2 };
    case "snuff":
      if (!evidence.lampSnuffed) {
        return {
          actions: ["snuff"],
          label: "램프 불 끄기",
          markerX: 1840,
          markerFloor: 3,
          targetId: "tutorial-basement-lamp",
          // 상호작용 거리 밖에서도 첫 필수 입력 R을 바로 보여 준다. 가까워지면
          // ContextActionView가 같은 targetId를 넘겨받아 소등 홀드 안내를 이어 간다.
          presentation: "actor-action",
        };
      }
      // 어둠 속 웅크림은 경비 몸을 관통해 지나간다. 스쳐 지나가는 등 뒤 키캡이 아니라
      // 건너야 할 복도 끝만 남긴다.
      return {
        actions: ["left", "down"],
        label: "어둠 속에서 몸 낮춰 통과",
        markerX: 1320,
        markerFloor: 3,
        presentation: "route-only",
      };
    case "steal":
      if (!carrying(state, "tutorial-pocketwatch")) return { actions: ["interact"], label: "회중시계 되찾기 · 길게 누르기", markerX: 1250, markerFloor: 3, targetId: "tutorial-pocketwatch" };
      if (loadRatio(state.carry, tuning) >= 0.7) {
        return {
          actions: ["drop"],
          label: "무게를 줄여 환기구로 탈출",
          detail: "무게를 70% 이하로 줄여 환기구로 탈출하세요.",
          markerX: 360,
          markerFloor: 3,
        };
      }
      if (state.player.x <= 430) return { actions: ["up", "interact"], label: "환기구 진입", markerX: 362, markerFloor: 3, targetId: "tutorial-vent" };
      return { actions: ["left"], label: "창고 왼쪽 환기구로 이동", markerX: 360, markerFloor: 3, targetId: "tutorial-vent" };
    case "lure": {
      const candidate = SubdueRules.candidate(
        state.guards,
        { at: { x: state.player.x, y: state.player.y }, hidden: state.player.hideSpotId !== null },
        tuning,
        state.subdue.targetId,
      );
      if (candidate !== null && !evidence.guardSubdued) {
        return { actions: ["interact"], label: "선택: 무력화 (기술 감소·몸이 남음)", markerX: candidate.x, markerFloor: 1 };
      }
      if (!tutorialLureResponseProven(evidence)) {
        return { actions: ["throw"], label: "여기서 경비 너머 바닥으로 유인구", markerX: 640, markerFloor: 1 };
      }
      return {
        actions: ["right"],
        label: "경비가 비운 틈에 반장 앞 엄폐까지",
        markerX: TUTORIAL_WARDEN_APPROACH_X,
        markerFloor: 1,
      };
    }
    case "wait": {
      const warden = state.guards.find((guard) => guard.id === "tutorial-warden");
      const cue = warden === undefined
        ? null
        : wardenTacticCue(warden, { x: state.player.x, y: state.player.y }, tuning);
      // Tab은 방향을 더 자세히 읽는 선택 기능이다. 실제 현재 빈틈이면 바로 질주할 수 있고,
      // 회전 예고 중에만 엄폐를 유지하게 한다.
      if (state.player.x <= 1497 && cue?.kind !== "opening") {
        return {
          actions: [],
          label: "반장이 돌아보는 중 · 다음 빈틈 기다리기",
          markerX: 1450,
          markerFloor: 1,
        };
      }
      if (state.player.climbLinkId !== null && floor === TUTORIAL_FLOORS.attic) {
        return { actions: ["left"], label: "사다리에서 다락 바닥으로 내리기", markerX: 1960, markerFloor: 0, targetId: "tutorial-ladder-attic" };
      }
      if (state.player.x >= 1940) return { actions: ["up"], label: "사다리로 다락 오르기", markerX: 2000, markerFloor: 1, targetId: "tutorial-ladder-attic" };
      // 반장의 빈틈은 몸을 통과시키는 창이기도 하다. 그 창을 달려 지나는 몇 프레임에
      // 소매치기 키캡이 열렸다 닫히면, 시간이 걸린 질주 안내를 스스로 덮는다.
      return {
        actions: ["run", "right"],
        label: "빈틈 동안 D + SHIFT로 사다리까지 질주",
        markerX: 1840,
        markerFloor: 1,
        presentation: "route-only",
      };
    }
    case "escape":
      if (openingHeist) {
        if (!carryingTutorialClimax(state)) {
          const dx = state.player.x - climaxAt.x;
          const dy = state.player.y - climaxAt.y;
          const inReach = Math.hypot(dx, dy) <= interactionReachPx(tuning.loot.reachPx, tuning);
          return inReach
            ? {
                actions: ["interact"],
                label: "회수",
                detail: "E를 길게 눌러 유물을 되찾으세요.",
                markerX: climaxAt.x,
                markerFloor: 0,
                markerY: climaxAt.y,
                emphasis: "objective",
                targetId: climaxAnchorId,
              }
            : {
                actions: [dx < 0 ? "right" : "left"],
                label: "유물",
                detail: dx < 0 ? "오른쪽의 유물을 되찾으세요." : "왼쪽의 유물을 되찾으세요.",
                markerX: climaxAt.x,
                markerFloor: 0,
                markerY: climaxAt.y,
                emphasis: "objective",
                targetId: climaxAnchorId,
              };
        }
        if (atRoofWindow) {
          return {
            actions: ["interact"],
            label: "옥상 창으로 탈출",
            markerX: roofWindowAt.x,
            markerFloor: 0,
            targetId: TUTORIAL_ROOF_WINDOW.id,
          };
        }
        return {
          actions: state.player.x < roofWindowAt.x ? ["right"] : ["run", "left"],
          label: state.player.x < roofWindowAt.x ? "오른쪽 창 앞으로 돌아가기" : "왼쪽 옥상 창까지 계속 달리기",
          markerX: roofWindowAt.x,
          markerFloor: 0,
          presentation: "route-only",
        };
      }
      if (!carryingTutorialClimax(state)) return {
        actions: ["interact"],
        label: climaxAnchorId === PERSONAL_ARTIFACT_ANCHOR_ID ? "내 유물 되찾기" : "노래하는 오르골 되찾기",
        markerX: climaxAt.x,
        markerFloor: 0,
        markerY: climaxAt.y,
        emphasis: "objective",
        targetId: climaxAnchorId,
      };
      if (!evidence.ran) return { actions: ["run", "left"], label: "경보보다 빠르게 달리기", markerX: 1600, markerFloor: 0 };
      if (!tutorialEscapeResponseProven(evidence)) {
        const bruiser = state.guards.find((guard) => guard.id === "tutorial-bruiser");
        // 공격 단계에는 블랙손과 같은 HUD 공격 대응 키캡이 누를 키를 보여 준다. 그 밖의
        // 시간(수색 포함)엔 키캡이 뜨지 않으므로 설명 문장 없이 짧은 표식만 남긴다.
        if (
          bruiser?.combat?.phase === "windup"
          || bruiser?.combat?.phase === "strike"
          || bruiser?.combat?.phase === "recovery"
        ) return null;
        return {
          actions: [],
          label: "거리 유지",
          markerX: bruiser?.x ?? 1450,
          markerFloor: 0,
          presentation: "actor-action",
        };
      }
      if (state.player.x > 1100 && state.player.x < 1360) {
        return { actions: ["run", "left", "jump"], label: "짐짝을 넘어 추격 끊기", markerX: 1200, markerFloor: 0 };
      }
      if (atRoofWindow) return { actions: ["interact"], label: "옥상 창으로 탈출", markerX: roofWindowAt.x, markerFloor: 0, targetId: TUTORIAL_ROOF_WINDOW.id };
      return { actions: ["run", "left"], label: "옥상 창까지 질주", markerX: roofWindowAt.x, markerFloor: 0, targetId: TUTORIAL_ROOF_WINDOW.id };
  }
}

/** 현재 키캡으로 가르치던 행동이 성공했는지 판정해 다음 안내 전 공백을 만든다. */
export function tutorialPromptProgressed(
  id: TutorialBeatId,
  previous: TutorialEvidence,
  current: TutorialEvidence,
  before: SimState,
  state: SimState,
  openingHeist = false,
): boolean {
  switch (id) {
    case "arrival":
      if (!previous.jumped) return current.jumped;
      if (!previous.ran) return current.ran;
      return false;
    case "hide":
      if (!previous.hid) return current.hid;
      if (!previous.whistled) return current.whistled;
      return before.player.hideSpotId !== null && state.player.hideSpotId === null;
    case "observe":
      if (!previous.usedEye) return current.usedEye;
      return !previous.descended && current.descended;
    case "snuff":
      return previous.lampSnuffed !== current.lampSnuffed;
    case "steal":
      if (!previous.pocketwatchStolen) return current.pocketwatchStolen;
      if (!previous.droppedLoot && current.droppedLoot) return true;
      if (!previous.usedVent && current.usedVent) return true;
      return false;
    case "lure":
      return previous.lureLandedBeyondGuard !== current.lureLandedBeyondGuard || previous.guardSubdued !== current.guardSubdued;
    case "wait":
      return !previous.ascended && current.ascended;
    case "escape":
      if (!previous.musicboxStolen) return current.musicboxStolen;
      if (!previous.ran) return current.ran;
      if (openingHeist) return false;
      if (!tutorialEscapeResponseProven(previous)) {
        return tutorialEscapeResponseProven(current);
      }
      return (
        !previous.jumped &&
        current.jumped &&
        before.player.x > 1100 &&
        before.player.x < 1360
      );
  }
}

/** 첫 입력 전에는 해당 화면의 경비와 시간이 움직이지 않는다. */
export function startsTutorialBeat(id: TutorialBeatId, input: InputFrame): boolean {
  switch (id) {
    case "arrival":
    case "hide":
    case "observe":
    case "snuff":
    case "steal":
    case "lure":
    case "wait":
      return input.moveX !== 0 || input.moveY !== 0 || input.jump || input.hide || input.whistle || input.throw || input.snuffHold || input.interact || input.thiefEye;
    case "escape":
      return input.moveX !== 0 || input.interact || input.run || input.attack || input.heavy;
  }
}
