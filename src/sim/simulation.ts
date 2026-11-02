import { BLACKTHORNE_BOSS_ARENA, confineBlackthorneBossKnockback, initializeBlackthorneGuard, observeBlackthorneBossHits, shoveFromKeeperExposed, shoveFromKeeperShockwave, stepBlackthorneBoss, type BlackthorneBossState } from "./BlackthorneBossRules";
import { initialBlackthorneCheckpointExterior } from "./BlackthorneCheckpointRules";
import { primaryInteractionAffordance } from "./InteractionAffordance";
import { advanceExhibition, exhibitionArrivalEvents, exhibitionDocked } from "./ExhibitionRules";
import { createEnvironmentPhysics, physicsLayoutFor, type EnvironmentPhysicsState } from "./PhysicsProps";
import { stepEnvironment, applyPropActions, applyCartWalk, resolvePropActors } from "./EnvironmentPhysicsRules";
import { createManorExploration, manorLayoutFor, observeManor } from "./ManorExplorationRules";
import { advanceExteriorHeist, EXTERIOR_HEIST_GUARD_IDS, supportsExteriorHeist } from "./ExteriorHeistRules";
import { INPUT_MASKS, maskInput } from "./InputMask";
import type { ManorExplorationState } from "./ManorExplorationRules";
import { manorGuestAccess } from "./BlackthorneStoryRules";
import type { Facing, InputFrame, RngState, SimEvent, Vec2 } from "./types";
import type { MansionLayout } from "./MansionLayout";
import { floorOfY, floorSurfaceY } from "./MansionLayout";
import { onSameFloor } from "./geom";
import type { PlayerSimState } from "./MovementRules";
import * as MovementRules from "./MovementRules";
import type { StaminaState } from "./StaminaRules";
import * as StaminaRules from "./StaminaRules";
import type { CarryState } from "./CarryRules";
import * as CarryRules from "./CarryRules";
import type { MischiefState } from "./MischiefRules";
import * as MischiefRules from "./MischiefRules";
import type { Projectile } from "./MischiefRules";
import type { CaperState } from "./CaperRules";
import * as CaperRules from "./CaperRules";
import type { RunState } from "./RunRules";
import * as RunRules from "./RunRules";
import { rank } from "./SuspicionRules";
import * as SuspicionRules from "./SuspicionRules";
import type { GuardState } from "./GuardPlanner";
import * as CombatRules from "./CombatRules";
import { alertGuard, applyCombatImpulse, daggerCombatStaggerMs, impulseFor } from "./CombatImpulse";
import { evaluateCombatDamage } from "./CombatDamage";
import * as PlayerHealthRules from "./PlayerHealthRules";
import { archetypeOf } from "./GuardArchetypes";
import * as GuardPlanner from "./GuardPlanner";
import type { SubdueState } from "./SubdueRules";
import * as SubdueRules from "./SubdueRules";
import type { PickpocketState } from "./PickpocketRules";
import * as PickpocketRules from "./PickpocketRules";
import { collectNoise } from "./NoisePlanner";
import { lootDef } from "./LootRules";
import { createRng, nextChance } from "./rng";
import type { CrowdState } from "./CrowdRules";
import * as CrowdRules from "./CrowdRules";
import type { BodyDragState } from "./BodyDragRules";
import * as BodyDragRules from "./BodyDragRules";
import type { PlayerCombatState } from "./PlayerCombatRules";
import * as PlayerCombatRules from "./PlayerCombatRules";
import { brakesIntoStep, moveOf } from "./AttackMoves";
import type { CombatDirectorState } from "./CombatDirectorRules";
import * as CombatDirectorRules from "./CombatDirectorRules";
import { displaceHorizontally } from "./CombatDisplacementRules";
import type { Tuning } from "./tuning";
import { SIM_STEP_MS } from "./tuning";
import * as PlayerActionRules from "./PlayerActionRules";
import * as GuardTargetRules from "./GuardTargetRules";
import * as GuardStatusRules from "./GuardStatusRules";
import { hasWeaponMod, VEIL_STEP_NOISE_MUL, WIRE_PULL_GAP_PX, WIRE_PULL_STAGGER_MS } from "./WeaponModRules";
import { transitionGuardMode } from "./GuardStateMachine";
import * as ActorContactRules from "./ActorContactRules";
import type { GrandEscapeState } from "./GrandEscapeRules";
import * as GrandEscapeRules from "./GrandEscapeRules";
import type { TacticState } from "./TacticRules";
import * as TacticRules from "./TacticRules";
import type { ShowtimeState } from "./ShowtimeRules";
import * as ShowtimeRules from "./ShowtimeRules";
import { isSociallyComposed } from "./DisguiseRules";
import type { PlayerCommandResolution } from "./PlayerCommandArbiter";
import { arbitratePlayerCommands } from "./PlayerCommandArbiter";
import type { InteractionFocus, InteractionKind } from "./InteractionAffordance";
import { grappleInteraction, interactionFocusOf, parkourThrowRouteId, routeInteractionInput, ventInteractLinkId } from "./InteractionAffordance";
import type { AuctionBidderId, AuctionState } from "./AuctionModel";
import * as AuctionRules from "./AuctionRules";
import { auctionAttention } from "./AuctionAttentionRules";
import { auctionGuestAccess } from "./AuctionZoneRules";
import {
  activateTutorialClimaxGuards,
  TUTORIAL_CLIMAX_ANCHOR_ID,
} from "./TutorialRules";
import { PERSONAL_ARTIFACT_ANCHOR_ID } from "./PersonalArtifactRules";

/**
 * 시뮬레이션 진입점.
 *
 * step() 은 고정 dtMs(SIM_STEP_MS) 로만 호출된다. 가변 프레임 시간은 렌더 쪽
 * 누산기가 흡수한다. 이것이 프레임레이트 독립성과 시드 재현성의 근거다.
 */

export interface SimState {
  readonly environmentPhysics?: EnvironmentPhysicsState;
  readonly manor?: ManorExplorationState;
  readonly timeMs: number;
  readonly rng: RngState;
  readonly player: PlayerSimState;
  readonly stamina: StaminaState;
  readonly carry: CarryState;
  readonly guards: readonly GuardState[];
  readonly crowds: readonly CrowdState[];
  readonly run: RunState;
  readonly mischief: MischiefState;
  readonly caper: CaperState;
  readonly grandEscape: GrandEscapeState;
  readonly tactics: TacticState;
  readonly showtime: ShowtimeState;
  readonly subdue: SubdueState;
  readonly pickpocket: PickpocketState;
  readonly bodyDrag: BodyDragState;
  readonly playerCombat: PlayerCombatState;
  readonly combatDirector: CombatDirectorState;
  readonly interactionFocus: InteractionFocus | null;
  readonly auction: AuctionState | null;
  /** 발소리 펄스 누산기. */
  readonly footstepMs: number;
  /** 다음 스텝에서 판정할 소음. 소음은 발생 스텝의 다음 스텝에 들린다. */
  readonly pendingNoise: readonly SimEvent[];
  readonly captured: boolean;
}

export interface StepResult {
  readonly state: SimState;
  readonly events: readonly SimEvent[];
  /** 이번 스텝에서 실제 각 행동 모듈로 전달된 단일 명령 판정. */
  readonly commands: PlayerCommandResolution;
}

export function createSimState(
  layout: MansionLayout,
  tuning: Tuning,
  seed: number,
  options: Readonly<{ readonly auctionCoverBidderId?: AuctionBidderId }> = {},
): SimState {
  const player = MovementRules.previewGroundedPlayer(
    MovementRules.createPlayer(layout.spawn, tuning.combat.playerMaxHp), tuning, layout,
  );
  const exteriorSupported = supportsExteriorHeist(layout);
  const exteriorGuardsPresent = exteriorSupported
    && EXTERIOR_HEIST_GUARD_IDS.every((id) => layout.guards.some((guard) => guard.id === id));
  const guards = layout.guards
    .filter((spawn) => spawn.activationLootAnchorId === undefined && spawn.activationRunPhase === undefined)
    .map((spawn) => GuardPlanner.createGuard({ ...spawn,
      previewOnly: exteriorGuardsPresent && EXTERIOR_HEIST_GUARD_IDS.some((id) => id === spawn.id)
        ? true : spawn.previewOnly }, tuning))
    .map(guard => layout.manor?.heist ? initializeBlackthorneGuard(guard) : guard);
  return {
    manor: layout.manor === undefined ? undefined : {
      ...createManorExploration(layout.manor.initialMemory),
      ...(exteriorSupported ? { exterior: advanceExteriorHeist(initialBlackthorneCheckpointExterior(layout), layout, player, player, guards).state } : {}),
    },
    environmentPhysics: createEnvironmentPhysics(layout),
    timeMs: 0,
    rng: createRng(seed),
    player,
    stamina: StaminaRules.createStamina(tuning),
    carry: CarryRules.createCarry(),
    guards,
    crowds: layout.crowds.map((spawn) => CrowdRules.createCrowd(spawn, tuning)),
    run: RunRules.createRun(tuning, layout),
    mischief: MischiefRules.createMischief(tuning, layout.toolLoadout),
    caper: CaperRules.createCaper(),
    grandEscape: GrandEscapeRules.createGrandEscape(),
    tactics: TacticRules.createTactics(),
    showtime: ShowtimeRules.createShowtime(),
    subdue: SubdueRules.createSubdue(),
    pickpocket: PickpocketRules.createPickpocket(),
    bodyDrag: BodyDragRules.createBodyDrag(),
    playerCombat: PlayerCombatRules.createPlayerCombat(),
    combatDirector: CombatDirectorRules.createCombatDirector(),
    interactionFocus: null,
    auction: layout.auction === undefined
      ? null
      : AuctionRules.createAuctionState(layout.auction, seed, options.auctionCoverBidderId),
    footstepMs: 0,
    pendingNoise: [],
    captured: false,
  };
}

/**
 * 한 스텝 내내 고정인 읽기 전용 값. 스텝 시작 상태는 여기 없다 — 아래 `StepStart` 조각으로만 받는다.
 */
interface StepContext {
  /** 저택 탐사·물리 프롭 치환 이전의 원본 레이아웃. 전시 진행이 이것을 본다. */
  readonly originalLayout: MansionLayout;
  /** 저택 탐사·물리 프롭까지 치환한 이번 스텝의 레이아웃. */
  readonly layout: MansionLayout;
  readonly tuning: Tuning;
  readonly dtMs: number;
  /** 상호작용 라우팅까지 끝난, 아직 명령 중재 전의 입력. */
  readonly rawInput: InputFrame;
}

/**
 * 스텝 시작 상태(환경 물리·저택 도구 프롤로그까지 반영)의 **조각**.
 *
 * 페이즈는 `SimState` 를 통째로 받지 않고 자기가 읽을 필드만 `Pick` 으로 받는다. 이전 상태가
 * `state` 하나로 800줄 내내 스코프에 살아 있으면, 앞 페이즈가 이미 갱신한 값(예: 이동 뒤 플레이어)
 * 대신 스텝 시작 값을 읽는 실수가 타입상 완전히 합법이다 — 증상은 "가끔 한 프레임 어긋난다" 뿐이다.
 * 조각 목록이 곧 그 페이즈의 선언이다. 넣어도 되는 필드는 두 가지뿐이다.
 * - 그 페이즈 시점에 이번 스텝이 **아직 갱신하지 않은** 필드. 시작 값이 곧 최신값이다.
 * - **의도적으로** 스텝 시작 시점을 기준점으로 쓰는 필드. 조각 타입의 주석에 이유를 적는다.
 * 앞 페이즈가 이미 갱신한 필드는 누산기(`acc`)에서 읽는다. 조각에 추가하는 것은 리뷰에서 보이는 결정이다.
 */
type StepStart<K extends keyof SimState> = Pick<SimState, K>;

/** 1. 입력 마스킹 — 첫 페이즈라 아직 아무것도 갱신되지 않았다. */
type MaskStart = StepStart<
  "manor" | "player" | "guards" | "subdue" | "pickpocket" | "bodyDrag" | "mischief" | "run" | "carry"
  | "stamina" | "caper" | "interactionFocus" | "auction" | "playerCombat"
>;
/** 2. 이동 — 플레이어가 이번 스텝에 처음 움직이는 자리다. 나머지도 아직 그대로다. */
type MovementStart = StepStart<
  "player" | "stamina" | "pickpocket" | "interactionFocus" | "crowds" | "guards" | "mischief" | "auction" | "bodyDrag"
>;
/**
 * 3. 층·경매·기력·발소리. `player` 는 **이동 전 기준점**으로만 읽는다(이번 스텝에 도하·사슬이 새로
 * 시작됐는가). 현재 플레이어는 `acc.playerAfterMovement` 다.
 */
/** 군중(`crowds`)은 뒤의 `stepCrowds` 가 갱신한다 — 이 페이즈 시점에는 시작 값이 최신값이다(군중 속 가면 발소리). */
type WorldSenseStart = StepStart<"player" | "auction" | "interactionFocus" | "stamina" | "mischief" | "footstepMs" | "crowds">;
/** 4. 장난·연쇄극 — 장난·연쇄극·런·소매치기·제압·군중은 아직 이번 스텝에 진행하지 않았다. */
type MischiefStart = StepStart<"run" | "caper" | "subdue" | "pickpocket" | "mischief" | "crowds" | "interactionFocus">;
/** 5. 군중. `rng` 는 이번 스텝에 군중이 처음 쓴다. */
type CrowdStart = StepStart<"crowds" | "grandEscape" | "rng">;
/**
 * 6. 경비 반응. `run`·`subdue`·`pickpocket`·`manor`·`combatDirector` 는 아직 그대로다. `pendingNoise` 는
 * 직전 스텝의 소음이다(한 프레임 지연은 설계). `player` 는 추격 목표 예측의 **이동 전 기준점**이다.
 * 경매는 3에서 진행한 `acc.auction` 을 본다.
 *
 * 나머지는 이 페이즈 앞에서 이미 갱신된 필드를 스텝 시작 값으로 읽는 자리다(백로그 5번 리팩터가
 * 행동 동치로 옮기며 드러낸 것 — 하네스로는 행동 차이가 관측되지 않았다). `playerCombat`(1에서 예약
 * 동사 반영), `rng`(5에서 군중이 사용), `mischief`(4에서 진행 — 활동 판정 스냅샷에서만).
 */
type GuardReactionStart = StepStart<
  "run" | "subdue" | "pickpocket" | "manor" | "combatDirector" | "pendingNoise" | "player"
  | "playerCombat" | "rng" | "mischief"
>;
/**
 * 7. 플레이어 전투. 소매치기·제압은 여기서 처음 진행한다. `mischief` 는 **스텝 시작의 가면**을
 * 보는 기준점이다(공격 입력이 가면을 벗기므로 가면 기습 표식은 시작 값을 본다).
 */
type CombatStart = StepStart<"mischief" | "pickpocket" | "subdue" | "interactionFocus">;
/** 8. 런 진행 — 런·소지품은 여기서 처음 진행한다. */
type RunStart = StepStart<"carry" | "run" | "timeMs" | "interactionFocus">;
/**
 * 9. 대탈출·상호작용 피드백. 대탈출은 여기서 처음 진행한다. 저택 탐사(`manor`)는 11에서 진행하고,
 * `interactionFocus` 는 이 스텝의 E 가 겨눈 프롬프트다.
 *
 * `pickpocket` 은 7에서 진행한 소매치기를 스텝 시작 값으로 읽는 자리다(대탈출의 구역 열쇠 — 백로그 5번
 * 리팩터가 행동 동치로 옮기며 드러낸 것, 하네스로는 행동 차이가 관측되지 않았다).
 */
type EscapeStart = StepStart<"grandEscape" | "pickpocket" | "timeMs" | "manor" | "interactionFocus">;
/** 10. 정착 — 전술·쇼타임·환경 물리는 여기서 처음 진행한다. */
type SettleStart = StepStart<"tactics" | "showtime" | "environmentPhysics">;
/**
 * 11. 조립. 저택 탐사·포획 기록은 여기서 진행한다. `player` 는 외곽 잠입 경계 통과를 재는 **이동 전
 * 기준점**, `interactionFocus` 는 조립 직후 다시 계산하는 자리표시자다. `caper` 는 이미 갱신된 연쇄극을
 * 스텝 시작 값으로 읽는다(저택 소음 — 백로그 5번 리팩터가 행동 동치로 옮기며 드러낸 것).
 */
type AssembleStart = StepStart<"timeMs" | "caper" | "manor" | "player" | "interactionFocus" | "captured">;

/**
 * 페이즈 사이를 흐르는 누산기.
 *
 * 각 페이즈는 자기가 만든 값만 덧붙인 새 누산기를 돌려주므로, 아직 만들어지지
 * 않은 값을 뒤 페이즈가 읽는 일이 타입 단계에서 막힌다. 의도적으로 **옛 스냅샷**을
 * 읽는 자리는 필드 이름에 그 시점을 박아 둔다(`playerAfterContact` 등).
 */
interface StepAccumulator {
  /** 이번 스텝의 사건. 페이즈는 여기에 순서대로 append 한다. */
  readonly events: SimEvent[];
}

interface MaskedInputAcc extends StepAccumulator {
  readonly loadRatio: number;
  readonly exhausted: boolean;
  readonly bodyCandidate: GuardState | null;
  readonly bodyDragBlocked: boolean;
  readonly dragTarget: GuardState | null;
  readonly commands: PlayerCommandResolution;
  /** 명령 중재를 거친 이번 스텝의 입력. */
  readonly input: InputFrame;
  readonly struggling: boolean;
  readonly movementLocked: boolean;
  readonly movementInput: InputFrame;
  /** 이동 규칙에 넘길 플레이어. 몸 끌기 중에는 속도만 제한한 스텝 시작 값이다. */
  readonly playerForMovement: PlayerSimState;
  /** E 를 도하가 가져간 루트. 없으면 null — 이동 규칙이 줄을 던지지 않는다. */
  readonly parkourRouteId: string | null;
  readonly ventLinkId: string | null;
  /**
   * 이번 스텝의 전투가 이어받을 상태. 공격 중 눌린 점프·회피가 예약되거나, 회수 취소 창에서
   * 발동하며 남은 회수를 끊은 결과다. 이후 페이즈는 `start.playerCombat` 대신 이것을 본다.
   */
  readonly playerCombatForStep: PlayerCombatState;
  readonly grappleAnchorId: string | null;
  /** 이번 E 를 아무도 가져가지 않았거나 매달린 사슬이 소유한다 — 공중이면 고리 입력 버퍼로 남긴다. */
  readonly grappleBufferable: boolean;
}

interface MovementAcc extends MaskedInputAcc {
  /**
   * **옛 스냅샷**: 몸 끌기 보정 전, 접촉 해소 직후의 플레이어.
   * 스텝 마지막의 접촉 정리가 의도적으로 이 시점을 기준점으로 쓴다.
   */
  readonly playerAfterContact: PlayerSimState;
  /** 이동·접촉·몸 끌기까지 반영된 플레이어. */
  readonly playerAfterMovement: PlayerSimState;
  /** 이동 규칙이 낸 사건. 즉발 기력 소모는 전체 사건이 아니라 이것만 본다. */
  readonly movementEvents: readonly SimEvent[];
  readonly enteredGuardContacts: readonly ActorContactRules.GuardBodyContact[];
  readonly bodyDrag: BodyDragRules.BodyDragResult;
}

interface WorldSenseAcc extends MovementAcc {
  readonly floor: number;
  readonly auction: AuctionState | null;
  readonly auctionOwnsInteraction: boolean;
  readonly auctionAlarmTriggered: boolean;
  readonly interactionInput: InputFrame;
  readonly stamina: StaminaState;
  readonly footstepMs: number;
  /**
   * 군중 속 가면이 도운 발소리 박자. 사건은 스텝 끝 조립에서 최종 가면이 남았을 때만 낸다 — 이 스텝
   * 어디서든(행동·도구 전환·만료·발각·훔치기) 가면이 벗겨졌다면 "가면이 지켜 줬다" 는 거짓이다.
   */
  readonly crowdCoverBeats: readonly FootstepBeat[];
}

interface MischiefAcc extends WorldSenseAcc {
  readonly caper: ReturnType<typeof CaperRules.step>;
  readonly mischief: ReturnType<typeof MischiefRules.step>;
  /** 장난의 순간이동까지 반영된 플레이어. 군중·경비 판정이 보는 값이다. */
  readonly playerAfterMischief: PlayerSimState;
}

interface CrowdAcc extends MischiefAcc {
  readonly crowd: ReturnType<typeof CrowdRules.step>;
}

interface GuardAcc extends CrowdAcc {
  readonly guardStep: ReturnType<typeof stepGuards>;
  /** 페이즈를 지나며 갱신되는 장난 상태의 현재 SSOT. */
  readonly mischiefState: MischiefState;
  readonly perfectDodge: SimEvent | undefined;
  readonly meleePerfectDodge: boolean;
  /** 적 피격 변위와 근접 완벽 회피 정착까지 반영된 플레이어. */
  readonly playerAfterGuards: PlayerSimState;
  readonly guardedActivity: ReturnType<typeof PlayerActionRules.activityOf>;
  readonly playerRestrained: boolean;
  readonly bodyDragState: BodyDragState;
}

interface CombatAcc extends GuardAcc {
  readonly playerCombat: ReturnType<typeof PlayerCombatRules.step>;
  /** 반격 방향 잠금까지 반영된 플레이어. 이후 모든 페이즈가 보는 값이다. */
  readonly playerAfterCombat: PlayerSimState;
  readonly struck: ReturnType<typeof applyProjectileHits>;
  readonly pickpocket: ReturnType<typeof PickpocketRules.step>;
  readonly subdue: ReturnType<typeof SubdueRules.step>;
}

interface RunAcc extends CombatAcc {
  readonly interactionBlocked: boolean;
  readonly runStep: ReturnType<typeof RunRules.step>;
  readonly performedSuspiciousInteraction: boolean;
  readonly guards: readonly GuardState[];
  readonly run: RunState;
  readonly rng: RngState;
}

interface EscapeAcc extends RunAcc {
  readonly grandEscape: ReturnType<typeof GrandEscapeRules.step>;
  readonly escapeCaper: { readonly state: CaperState; readonly events: readonly SimEvent[] };
}

interface SettledAcc extends EscapeAcc {
  readonly finalActivity: ReturnType<typeof PlayerActionRules.activityOf>;
  readonly finalCaper: CaperState;
  readonly tactics: ReturnType<typeof TacticRules.observe>;
  readonly showtime: ReturnType<typeof ShowtimeRules.observe>;
  readonly rewardedStamina: StaminaState;
  readonly rewardedMischief: MischiefState;
  readonly playerFinal: PlayerSimState;
  readonly guardsFinal: readonly GuardState[];
  readonly environmentPhysics: EnvironmentPhysicsState | undefined;
}

export function step(
  state: SimState,
  rawInput: InputFrame,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number = SIM_STEP_MS,
): StepResult {
  const originalLayout = layout;
  layout = manorLayoutFor(layout, state.manor);
  const events: SimEvent[] = [];

  // 런이 끝났으면 시뮬레이션을 멈춘다. 정산 화면 뒤에서 세계가 계속 도는 것은
  // 리플레이를 길게 만들고 결과를 바꿀 수 있다.
  if (state.run.outcome !== null) {
    return { state, events, commands: arbitratePlayerCommands(rawInput, "outcome") };
  }
  if (state.auction !== null && layout.auction !== undefined && state.auction.introRemainingMs > 0) {
    const auctionStep = AuctionRules.stepAuction(
      state.auction,
      rawInput,
      { x: state.player.x, y: state.player.y },
      floorOfY(state.player.y, tuning.world.floorHeightPx),
      layout.auction,
      dtMs,
    );
    const nextState: SimState = {
      ...state,
      timeMs: state.timeMs + dtMs,
      auction: auctionStep.state,
      interactionFocus: null,
      pendingNoise: [],
    };
    return {
      state: { ...nextState, interactionFocus: interactionFocusOf(nextState, layout, tuning) },
      events,
      commands: arbitratePlayerCommands(rawInput, "outcome"),
    };
  }
  const physics = stepEnvironment(state.environmentPhysics, layout, tuning, dtMs);
  const propActors = resolvePropActors(physics.state, state.environmentPhysics, state.player, state.guards, layout, tuning);
  events.push(...physics.events, ...propActors.events);
  state = { ...state, environmentPhysics: propActors.state, player: propActors.player, guards: propActors.guards };
  layout = physicsLayoutFor(layout, state.environmentPhysics);
  rawInput = routeInteractionInput(rawInput, state, layout, tuning);

  // 아래부터는 한 스텝의 페이즈 순서가 곧 코드 순서다. 각 페이즈는 ctx(고정값), 스텝 시작 상태의
  // 선언한 조각(`StepStart`), 누산기(지금까지 만들어진 값)만 읽고, 자기 결과를 덧붙인 누산기를 돌려준다.
  const ctx: StepContext = { originalLayout, layout, tuning, dtMs, rawInput };
  const masked = maskPlayerCommands(ctx, state, { events });
  const moved = stepPlayerMovement(ctx, state, masked);
  const sensed = stepWorldSense(ctx, state, moved);
  const mischieved = stepMischiefAndCaper(ctx, state, sensed);
  const crowded = stepCrowds(ctx, state, mischieved);
  const guarded = stepGuardReactions(ctx, state, crowded);
  const fought = stepPlayerCombatAndTakedowns(ctx, state, guarded);
  const progressed = stepRunProgress(ctx, state, fought);
  const escaped = stepEscapeAndInteractionFeedback(ctx, state, progressed);
  const settled = settleStepState(ctx, state, escaped);
  return assembleStepResult(ctx, state, settled);
}

/**
 * 1. 입력 마스킹.
 *
 * 이번 스텝에 어떤 행동이 점유 중인지 먼저 확정하고, 그 결과로 이동·전투·장난이
 * 각각 볼 입력을 만든다. 여기서 만들어진 `input` 이 이후 모든 페이즈의 입력이다.
 */
function maskPlayerCommands(ctx: StepContext, start: MaskStart, acc: StepAccumulator): MaskedInputAcc {
  const { tuning, rawInput } = ctx;
  const loadRatio = CarryRules.loadRatio(start.carry, tuning);
  const exhausted = StaminaRules.isExhausted(start.stamina);
  const committedActivity = PlayerActionRules.activityOf(start);
  // 몸 끌기는 빈손 상태에서 시작하고, 기존 UX 계약대로 투척 충전만 명시적으로
  // 취소할 수 있다. 후보를 먼저 계산해 combat/subdue 같은 현재 점유를 덮지 않는다.
  const canAttemptBodyDrag = committedActivity === "free"
    || committedActivity === "throwing"
    || committedActivity === "body-drag";
  const bodyCandidate = BodyDragRules.candidate(
    start.guards,
    start.player,
    tuning,
    focusedTargetId(start, "body-drag"),
  );
  const bodyDragBlocked = canAttemptBodyDrag
    && rawInput.interact
    && start.stamina.value <= 0
    && bodyCandidate !== null;
  const dragTarget = start.run.struggle !== null || !canAttemptBodyDrag
    ? null
    : BodyDragRules.targetForInput(
        start.bodyDrag,
        start.guards,
        start.player,
        rawInput,
        start.stamina.value,
        tuning,
        focusedTargetId(start, "body-drag"),
      );
  // 공격 중 눌린 점프·회피는 버리지 않는다. 예약했다가 회수 취소 창이 열리는 틱에 낸다.
  // 그 틱의 활동 판정부터 끊긴 회수를 봐야 이동 입력이 전투 잠금에 다시 막히지 않는다.
  const combatVerb = resolveCombatVerb(start.playerCombat, rawInput, tuning, ctx.dtMs);
  const playerCombatForStep = combatVerb.combat;
  const initialActivity = PlayerActionRules.activityOf(
    {
      player: start.player,
      run: start.run,
      caper: start.caper,
      bodyDrag: start.bodyDrag,
      subdue: start.subdue,
      pickpocket: start.pickpocket,
      mischief: start.mischief,
      playerCombat: playerCombatForStep,
    },
    { dragging: dragTarget !== null },
  );
  // 매달린 사슬은 E 를 통째로 소유한다(방향 + E 옮겨 잡기). 아니면 프롬프트와 같은 1순위 대상이 고리일 때만 쏜다.
  const grapple = rawInput.interactPressed ? grappleInteraction(start, ctx.layout, tuning, rawInput.moveX) : null;
  const availableGrappleId = grapple?.anchorId ?? null;
  const commands = arbitratePlayerCommands(rawInput, initialActivity, availableGrappleId !== null || grapple?.owned === true);
  const input = commands.input;
  const struggling = PlayerActionRules.isRestrained(initialActivity);
  // 포박이 끝난 뒤에는 ←/→가 발버둥 전용이다. 그 전의 제압 시도에서는 최초 충돌만
  // 접촉 경계에 멈추고, 플레이어가 경비 반대쪽으로 직접 입력하면 빠져나올 수 있다.
  const movementLocked = struggling;
  const combatCommitted = initialActivity === "combat";
  const counterMovementLocked = start.playerCombat.counterMovementLocked
    && start.playerCombat.counterWindowMs > 0;
  const movementInput = dragTarget !== null
    ? maskInput(input, INPUT_MASKS.bodyDragMovement)
    : combatCommitted
      ? maskInput(input, INPUT_MASKS.combatCommittedMovement)
      : counterMovementLocked
        ? maskInput(input, INPUT_MASKS.counterMovementLocked)
      : input;
  const verbMovementInput = combatVerb.fired === null || struggling || dragTarget !== null
    || initialActivity === "outcome"
    ? movementInput
    : withFiredCombatVerb(movementInput, combatVerb.fired);
  const dragMaxSpeed = tuning.movement.walkSpeed * tuning.guard.bodyDragSpeedMul;
  const playerForMovement = dragTarget === null
    ? start.player
    : {
        ...start.player,
        vx: Math.max(-dragMaxSpeed, Math.min(dragMaxSpeed, start.player.vx)),
        dodgeMs: 0,
        dodgeCooldownMs: start.player.dodgeCooldownMs,
      };
  return {
    ...acc,
    loadRatio,
    exhausted,
    bodyCandidate,
    bodyDragBlocked,
    dragTarget,
    commands,
    input,
    struggling,
    movementLocked,
    movementInput: verbMovementInput,
    playerForMovement,
    parkourRouteId: input.interactPressed
      ? parkourThrowRouteId(start, ctx.layout, tuning)
      : null,
    ventLinkId: input.interactPressed
      ? ventInteractLinkId(start, ctx.layout, tuning)
      : null,
    grappleAnchorId: input.interactPressed ? availableGrappleId : null,
    grappleBufferable: input.interactPressed && grapple?.bufferable === true,
    playerCombatForStep,
  };
}

/**
 * 지금 방향+질주+웅크리기를 넣으면 다음 스텝에 실제로 구르기가 시작되는가.
 *
 * `step` 이 회피를 막는 조건을 함께 본다: 행동 점유(공격 중이면 예약될 뿐이고, 몸 끌기·은신·
 * 등반·포박 등은 이동 입력을 가져간다), 완벽 반격의 이동 잠금, 그리고 이동 규칙의 접지·재사용·비용.
 * 따라하기 레슨은 이 값이 참일 때만 월드를 멈춰, 마지막 키가 약속한 구르기를 반드시 낸다.
 */
export function playerCanDodgeNow(state: SimState, tuning: Tuning): boolean {
  if (PlayerActionRules.activityOf(state) !== "free") return false;
  if (state.playerCombat.counterMovementLocked && state.playerCombat.counterWindowMs > 0) return false;
  return MovementRules.dodgeReady(state.player, state.stamina.value, tuning);
}

/**
 * 지금 방향+질주를 누르면 실제로 질주가 시작되는가. 행동 점유·접지·탈진을 본다
 * (따라하기 경비반장 통과 레슨의 멈춤 조건).
 */
export function playerCanSprintNow(state: SimState): boolean {
  return PlayerActionRules.activityOf(state) === "free" && state.player.onGround
    && !StaminaRules.isExhausted(state.stamina);
}

/**
 * 지금 평타를 누르면 실제 공격이 되는가. 행동 점유(`blocksCombat`)와 경직만 본다 — 공격 중이면
 * 다음 타로 예약되고, 재사용 대기 중이면 입력 버퍼가 받아 곧 나간다(따라하기 반격 레슨의 멈춤 조건).
 */
export function playerCanAttackNow(state: SimState): boolean {
  const activity = PlayerActionRules.activityOf(state);
  return !PlayerActionRules.blocksCombat(activity) && activity !== "staggered" && activity !== "hidden"
    && activity !== "venting" && activity !== "climbing";
}

/**
 * 공격 중 누른 점프·회피를 예약하거나, 회수 취소 창이 열렸으면 발동한다.
 *
 * 회피는 누르는 순간의 입력 문법(질주 + 방향 + 웅크리기)을 그대로 요구하고 방향을 잠근다.
 * 발동 틱에만 그 입력을 되살려 `MovementRules` 가 평소와 똑같이 판정하게 한다 — 스태미나·
 * 쿨다운·지상 조건이 안 맞으면 평소처럼 아무 일도 없다. 회피 무적도 발동한 그 틱부터의
 * 평범한 구르기일 뿐이라, 예약 중인 공격 회수가 완벽 회피를 공짜로 얻는 창은 없다.
 */
function resolveCombatVerb(
  combat: PlayerCombatState,
  rawInput: InputFrame,
  tuning: Tuning,
  dtMs: number,
): { readonly combat: PlayerCombatState; readonly fired: PlayerCombatRules.BufferedVerb | null } {
  const pressed: PlayerCombatRules.BufferedVerb | null = rawInput.jump
    ? { kind: "jump" }
    : rawInput.crouchPressed && rawInput.moveX !== 0 && rawInput.run
      ? { kind: "dodge", direction: rawInput.moveX }
      : null;
  if (PlayerCombatRules.activityOf(combat) === "attacking") {
    const verb = pressed ?? combat.bufferedVerb;
    if (verb !== null && PlayerCombatRules.verbCancelReady(combat, dtMs)) {
      return { combat: PlayerCombatRules.releaseForVerb(combat), fired: verb };
    }
    return pressed === null
      ? { combat, fired: null }
      : { combat: PlayerCombatRules.bufferVerb(combat, pressed, tuning), fired: null };
  }
  // 행동이 스스로 끝난 다음 틱. 새로 누른 입력이 있으면 그것이 평소대로 처리되고 예약은 버린다.
  if (combat.bufferedVerb !== null && combat.verbBufferMs > 0) {
    return {
      combat: { ...combat, bufferedVerb: null, verbBufferMs: 0 },
      fired: pressed === null ? combat.bufferedVerb : null,
    };
  }
  return { combat, fired: null };
}

function withFiredCombatVerb(input: InputFrame, verb: PlayerCombatRules.BufferedVerb): InputFrame {
  return verb.kind === "jump"
    ? { ...input, jump: true }
    : { ...input, moveX: verb.direction, run: true, crouchPressed: true };
}

/**
 * 2. 이동·접촉·몸 끌기.
 *
 * 플레이어 좌표가 이번 스텝에 확정되는 유일한 자리다. 뒤 페이즈가 보는 플레이어는
 * 전부 여기서 나온 `playerAfterMovement` 의 파생이다.
 */
function stepPlayerMovement(ctx: StepContext, start: MovementStart, acc: MaskedInputAcc): MovementAcc {
  const { layout, tuning, dtMs } = ctx;
  // 포박 중 ←/→는 월드 이동이 아니다. 직전 달리기 속도나 공중 속도까지
  // MovementRules에 흘리면 플레이어가 포박자에게서 미끄러져 나가므로 몸을 고정한다.
  // 몸은 멈춰도 피격 무적 시계는 흐른다. 이동 규칙을 통째로 건너뛰는 이 분기가
  // 시계까지 세우면, 맞고 붙잡힌 플레이어가 발버둥 내내 그리고 풀려난 뒤까지 무적을 들고 다닌다.
  const movedRaw = acc.movementLocked
    ? {
        player: MovementRules.withDecayedHitInvuln(
          { ...start.player, vx: 0, vy: 0, staggerMs: 0, motion: "still" as const },
          dtMs,
        ),
        events: [] as SimEvent[],
      }
    : MovementRules.step(
        acc.playerForMovement,
        acc.movementInput,
        {
          layout,
          tuning,
          loadRatio: acc.loadRatio,
          exhausted: acc.exhausted,
          canDodge: MovementRules.dodgeStaminaReady(start.stamina.value, tuning),
          staminaValue: start.stamina.value,
          grappleInteractAnchorId: acc.grappleAnchorId,
          grappleBufferable: acc.grappleBufferable,
          areaKey: start.pickpocket.areaKey,
          preferredInteractionTargetId: focusedTargetId(start, "hide", "vent", "climb"),
          parkourInteractRouteId: acc.parkourRouteId,
          ventInteractLinkId: acc.ventLinkId,
          speedMul: (acc.dragTarget === null ? 1 : tuning.guard.bodyDragSpeedMul)
            * CrowdRules.playerSpeedMultiplier(
              start.crowds,
              MovementRules.previewGroundedPlayer(start.player, tuning, layout),
              tuning,
            ),
        },
        dtMs,
      );
  // 포박 뒤 두 몸은 의도적으로 같은 기준점에 고정된다. 제압 시도 중에는 일반 접촉
  // 분리가 접근 방향을 막되, 반대 방향의 플레이어 탈출 입력은 허용한다.
  const actorContact: ActorContactRules.ActorContactResult = acc.movementLocked
    ? { player: movedRaw.player, contacts: [] }
    : ActorContactRules.resolvePlayerGuardContacts(
        movedRaw.player,
        start.player,
        start.guards,
        layout,
        tuning,
        start.mischief.snuffedLamps,
        layout.manor?.disguisePassage === true && start.mischief.disguiseMs > 0
          || auctionGuestAccess(start.auction, layout.auction, movedRaw.player),
      );
  const enteredGuardContacts = actorContact.contacts.filter((contact) => contact.entered);
  const bodyDrag = BodyDragRules.step(
    start.bodyDrag,
    acc.dragTarget?.id ?? null,
    start.player,
    actorContact.player,
    start.guards,
    layout,
    tuning,
  );
  const movementEvents: readonly SimEvent[] = movedRaw.events;
  acc.events.push(...movementEvents);
  acc.events.push(...bodyDrag.events);
  for (const contact of enteredGuardContacts) {
    acc.events.push({
      kind: "GuardBodyContact",
      guardId: contact.guardId,
      at: contact.at,
      facing: contact.side,
    });
  }
  return {
    ...acc,
    playerAfterContact: actorContact.player,
    playerAfterMovement: bodyDrag.player,
    movementEvents,
    enteredGuardContacts,
    bodyDrag,
  };
}

/**
 * 3. 층·경매·기력·발소리.
 *
 * 새 좌표가 세계에 대해 뜻하는 것들을 한 번에 확정한다. 여기서 만들어진
 * `interactionInput` 이 이후 모든 E 판정의 단일 입력이다.
 */
function stepWorldSense(ctx: StepContext, start: WorldSenseStart, acc: MovementAcc): WorldSenseAcc {
  const { layout, tuning, dtMs } = ctx;
  // 줄 던지기도 환기구 진입과 같이 이동 규칙이 E 를 이미 소비한 경우다. 같은
  // 누름이 훔치기·제압·탈출로 이어 발동하지 않게 여기서 한 번만 끊는다.
  const movementReservedInteraction = acc.movementEvents.some((event) =>
    event.kind === "PlayerEnteredVent" ||
    (event.kind === "ActionRejected" && event.action === "vent")
  ) || (start.player.parkour === undefined && acc.playerAfterMovement.parkour !== undefined);
  const grappleReservedInteraction = acc.movementEvents.some((event) => event.kind === "GrappleAttached")
    || acc.input.interactPressed && start.player.grapple !== undefined;
  const floor = floorOfY(acc.playerAfterMovement.y, tuning.world.floorHeightPx);
  let auction = start.auction;
  let auctionOwnsInteraction = false;
  let auctionAlarmTriggered = false;
  if (auction !== null && layout.auction !== undefined) {
    const alarmBeforeStep = auction.alarm;
    const auctionStep = AuctionRules.stepAuction(
      auction,
      acc.input,
      { x: acc.playerAfterMovement.x, y: acc.playerAfterMovement.y },
      floor,
      layout.auction,
      dtMs,
      focusedTargetId(start, "auction-bid"),
    );
    auction = auctionStep.state;
    auctionAlarmTriggered = !alarmBeforeStep && auction.alarm;
    auctionOwnsInteraction = auctionStep.ownsInteraction;
    acc.events.push(...auctionStep.events);
  }
  const interactionInput = movementReservedInteraction || grappleReservedInteraction || acc.bodyDragBlocked || auctionOwnsInteraction
    ? maskInput(acc.input, INPUT_MASKS.interactionTaken)
    : acc.input;
  const staminaStep = StaminaRules.step(
    start.stamina,
    {
      pose: acc.playerAfterMovement.pose,
      motion: acc.playerAfterMovement.motion,
      loadRatio: acc.loadRatio,
      at: { x: acc.playerAfterMovement.x, y: acc.playerAfterMovement.y },
      floor,
      tuning,
      exertionDrainPerSec: acc.bodyDrag.dragging ? tuning.guard.bodyDragDrainPerSec : 0,
      hidden: acc.playerAfterMovement.hideSpotId !== null || acc.playerAfterMovement.ventLinkId !== null,
      grappleAirborne: acc.playerAfterMovement.grappleAirborne === true,
      grappleHanging: acc.playerAfterMovement.grapple !== undefined,
    },
    dtMs,
  );
  acc.events.push(...staminaStep.events);

  // 점프·강한 착지는 즉발 소모다. 이벤트를 근거로 삼아 규칙을 한 곳에 모은다.
  let stamina = staminaStep.state;
  for (const event of acc.movementEvents) {
    if (event.kind === "PlayerJumped") stamina = StaminaRules.spend(stamina, tuning.stamina.jumpCost);
    if (event.kind === "PlayerDodged") stamina = StaminaRules.spend(stamina, tuning.combat.dodgeStaminaCost);
    if (event.kind === "GrappleAttached") stamina = StaminaRules.spend(stamina, tuning.grapple.attachCost);
    if (event.kind === "PlayerLanded" && event.impact === "hard") {
      stamina = StaminaRules.spend(stamina, tuning.stamina.landCost);
    }
  }

  // 장막 걸음: 내 연막 안의 질주 발소리를 줄인다(발소리 반경만, 이동은 그대로).
  const veiled = hasWeaponMod(layout, "smoke-veil-step")
    && MischiefRules.insideSmoke(start.mischief, { x: acc.playerAfterMovement.x, y: acc.playerAfterMovement.y - tuning.movement.bodyHeightStand / 2 }, floor);
  // 군중 속 가면: 가면을 쓴 채 손님 사이를 비집으며 달린다(위장이 깨지지 않는 판정과 같은 군중 함수).
  const crowdMasked = hasWeaponMod(layout, "mask-crowd") && start.mischief.disguiseMs > 0
    && CrowdRules.playerSpeedMultiplier(start.crowds, acc.playerAfterMovement, tuning) !== 1;
  const footsteps = stepFootsteps(start, acc.playerAfterMovement, acc.loadRatio, floor, tuning, dtMs, veiled, crowdMasked);
  acc.events.push(...footsteps.events);
  return {
    ...acc,
    floor,
    auction,
    auctionOwnsInteraction,
    auctionAlarmTriggered,
    interactionInput,
    stamina,
    footstepMs: footsteps.footstepMs,
    crowdCoverBeats: footsteps.crowdCoverBeats,
  };
}

/**
 * 4. 장난 동사와 연쇄극.
 *
 * 소음과 빛을 플레이어가 능동적으로 만드는 유일한 지점이다.
 */
function stepMischiefAndCaper(ctx: StepContext, start: MischiefStart, acc: WorldSenseAcc): MischiefAcc {
  const { layout, tuning, dtMs } = ctx;
  const combatRequested = acc.input.attack || acc.input.heavy;
  const mischiefActivity = PlayerActionRules.activityOf(
    {
      player: acc.playerAfterMovement,
      run: start.run,
      caper: start.caper,
      bodyDrag: acc.bodyDrag.state,
      subdue: start.subdue,
      pickpocket: start.pickpocket,
      mischief: start.mischief,
      playerCombat: acc.playerCombatForStep,
    },
    { dragging: acc.bodyDrag.dragging },
  );
  const mischiefBlocked = PlayerActionRules.blocksMischief(mischiefActivity) || combatRequested;
  const baseMischiefInput = acc.struggling
    ? maskInput(acc.input, INPUT_MASKS.struggleMischief)
    : mischiefBlocked
      ? maskInput(acc.input, INPUT_MASKS.mischiefTaken)
      : acc.input;
  // 연쇄극과 일반 장난은 같은 두 손을 쓴다. 이미 시작한 투척·소등이 있으면 연쇄극이
  // 중간에 끼어들지 못하고, 연쇄극이 새로 R을 소유한 프레임에는 Q까지 함께 소비한다.
  const mischiefHandBusy = MischiefRules.handActionOf(start.mischief) !== "idle";
  const caperBlocked = mischiefBlocked || mischiefHandBusy;
  const caperInput = caperBlocked
    ? maskInput(baseMischiefInput, INPUT_MASKS.caperBlocked)
    : baseMischiefInput;
  const caper = CaperRules.step(
    caperBlocked ? CaperRules.cancelRoot(start.caper) : start.caper,
    caperInput,
    {
      at: { x: acc.playerAfterMovement.x, y: acc.playerAfterMovement.y },
      floor: acc.floor,
      collectedAnchorIds: RunRules.unavailableLootAnchorIds(start.run),
      preferredInteractionTargetId: focusedTargetId(start, "caper"),
    },
    layout,
    tuning,
    dtMs,
  );
  acc.events.push(...caper.events);
  // 연쇄극이 R 을 가져간 프레임에는 두 손이 이미 장치에 있다 — 투척·소등을 함께 막는다.
  const mischiefInput = caper.ownsSnuffInput
    ? maskInput(baseMischiefInput, INPUT_MASKS.mischiefTaken)
    : baseMischiefInput;
  const mischiefState = mischiefBlocked
    ? MischiefRules.cancelActions(start.mischief)
    : start.mischief;
  const mischief = MischiefRules.step(
    mischiefState,
    mischiefInput,
    {
      at: { x: acc.playerAfterMovement.x, y: acc.playerAfterMovement.y },
      facing: acc.playerAfterMovement.facing,
      floor: acc.floor,
      hidden: acc.playerAfterMovement.hideSpotId !== null,
      collectedAnchorIds: RunRules.unavailableLootAnchorIds(start.run),
      preferredInteractionTargetId: focusedTargetId(start, "environment", "snuff"),
      sociallyComposed: isSociallyComposed(acc.playerAfterMovement),
      composedIgnoringRun: isSociallyComposed({ ...acc.playerAfterMovement, motion: "walk" }),
      running: acc.playerAfterMovement.motion === "run",
      guards: acc.bodyDrag.guards,
      counterGuardId: acc.playerCombatForStep.counterWindowMs > 0 ? acc.playerCombatForStep.counterGuardId : null,
      inCrowd: CrowdRules.playerSpeedMultiplier(start.crowds, acc.playerAfterMovement, tuning) !== 1,
    },
    layout,
    tuning,
    dtMs,
  );
  acc.events.push(...mischief.events);
  const playerAfterMischief = mischief.relocation === null
    ? acc.playerAfterMovement
    : {
        ...acc.playerAfterMovement,
        ...mischief.relocation,
        vx: 0,
        vy: 0,
        onGround: true,
        motion: "still" as const,
      };
  // 반격 단도가 창을 쓰면 같은 반격권으로 근접 반격까지 두 번 받지 않는다.
  const playerCombatForStep = mischief.counterConsumed
    ? { ...acc.playerCombatForStep, counterGuardId: null, counterWindowMs: 0, counterMovementLocked: false }
    : acc.playerCombatForStep;
  // 와이어 당기기·킥과 추격 가면은 경비 배열을 바꾼다. 이후 페이즈가 보는 경비 SSOT에 적용한다.
  const wired = applyWireGuard(acc.bodyDrag.guards, mischief.wireGuard, playerAfterMischief, layout, tuning);
  acc.events.push(...wired.events);
  const masked = applyChaseMask(wired.guards, mischief.events, layout, tuning);
  acc.events.push(...masked.events);
  const bodyDrag = masked.guards === acc.bodyDrag.guards ? acc.bodyDrag : { ...acc.bodyDrag, guards: masked.guards };
  return { ...acc, bodyDrag, playerCombatForStep, caper, mischief, playerAfterMischief };
}

/**
 * 가면 기습: 가면을 쓴 채 시작한 공격은 접촉 순간 등 뒤 빈틈으로 들어간다. 공격 입력이 가면을 벗기므로
 * 시작 프레임(스텝 시작의 가면 상태)에 표식을 남기고, 접촉 판정(`PlayerCombatRules`)이 그 표식을 읽는다.
 * 접촉이 끝나면 표식을 지운다 — 첫 공격 한 번뿐이다.
 */
function markMaskAmbush<T extends { readonly state: PlayerCombatRules.PlayerCombatState; readonly events: readonly SimEvent[] }>(
  result: T,
  disguisedAtStart: boolean,
  layout: MansionLayout,
  events: SimEvent[],
): T {
  const started = result.events.some((event) => event.kind === "PlayerAttackStarted");
  const contacted = result.events.some((event) => event.kind === "PlayerAttacked");
  if (contacted && result.state.attackAmbush === true) {
    const hit = result.events.find((event) => event.kind === "CombatHit");
    if (hit?.kind === "CombatHit") {
      events.push({ kind: "WeaponModTriggered", mod: "mask-ambush", at: hit.at, guardId: hit.guardId, ...(hit.facing === undefined ? {} : { facing: hit.facing }) });
    }
  }
  const { attackAmbush: _previous, ...cleared } = result.state;
  if (started && disguisedAtStart && hasWeaponMod(layout, "mask-ambush")) {
    return { ...result, state: { ...cleared, attackAmbush: true } };
  }
  if ((started || contacted) && result.state.attackAmbush === true) return { ...result, state: cleared };
  return result;
}


function applyWireGuard(
  guards: readonly GuardState[],
  wire: ReturnType<typeof MischiefRules.step>["wireGuard"],
  player: PlayerSimState,
  layout: MansionLayout,
  tuning: Tuning,
): { readonly guards: readonly GuardState[]; readonly events: readonly SimEvent[] } {
  if (wire === null) return { guards, events: [] };
  const target = guards.find((guard) => guard.id === wire.guardId);
  if (target === undefined) return { guards, events: [] };
  const playerAt = { x: player.x, y: player.y };
  if (wire.mode === "kick") {
    const alerted = guards.map((guard) => guard.id === target.id ? alertGuard(guard, playerAt, tuning) : guard);
    const impulse = applyCombatImpulse(target.id, alerted, player.facing, playerAt, impulseFor("dash", tuning), layout, tuning);
    // 연계 갈래이므로 당기기와 같은 휘청임을 보장해 빈틈을 실제로 쓸 수 있게 한다.
    return {
      guards: impulse.guards.map((guard) => {
        if (guard.id !== target.id) return guard;
        const staggerMs = Math.max(guard.staggerMs, WIRE_PULL_STAGGER_MS);
        return { ...guard, staggerMs, toolOpeningMs: staggerMs };
      }),
      events: impulse.events,
    };
  }
  const pullDelta = player.x + player.facing * WIRE_PULL_GAP_PX - target.x;
  const alreadyClose = Math.abs(target.x - player.x) <= WIRE_PULL_GAP_PX;
  const moved = displaceHorizontally({
    fromX: target.x,
    deltaX: alreadyClose ? 0 : pullDelta,
    feetY: target.y,
    halfWidth: tuning.movement.bodyWidth / 2,
    bodyHeight: tuning.movement.bodyHeightStand,
    stayGrounded: true,
  }, layout);
  const pulled = GuardStatusRules.haltGuardMovement({
    ...alertGuard(target, playerAt, tuning),
    x: moved.x,
    facing: (player.facing === 1 ? -1 : 1) as Facing,
    mode: transitionGuardMode(target.mode, { kind: "staggered" }),
    staggerMs: Math.max(target.staggerMs, WIRE_PULL_STAGGER_MS),
    toolOpeningMs: WIRE_PULL_STAGGER_MS,
    contactMs: 0,
  });
  return { guards: guards.map((guard) => guard.id === target.id ? pulled : guard), events: [] };
}

/**
 * 추격 가면: 어떤 경비의 시야에도 없을 때 가면을 쓰면 추격자가 마지막 목격 위치 수색으로 돌아간다.
 * 추격 등급만 경계로 낮추며 목격 위치는 그대로 둔다 — 쫓던 사람이 사라졌다고 믿게 하는 것이지 잊게 하는 것이 아니다.
 */
function applyChaseMask(
  guards: readonly GuardState[],
  events: readonly SimEvent[],
  layout: MansionLayout,
  tuning: Tuning,
): { readonly guards: readonly GuardState[]; readonly events: readonly SimEvent[] } {
  const activated = events.find((event) => event.kind === "DisguiseActivated");
  if (activated === undefined || !hasWeaponMod(layout, "mask-chase")) return { guards, events: [] };
  const active = guards.filter((guard) => !GuardStatusRules.isInactive(guard));
  if (active.some((guard) => guard.susp.wasExposed)) return { guards, events: [] };
  const out: SimEvent[] = [];
  const next = guards.map((guard) => {
    if (!MischiefRules.weaponModTargetable(guard) || guard.susp.tier !== "spotted") return guard;
    out.push(
      { kind: "SuspicionTierChanged", guardId: guard.id, from: "spotted", to: "alert" },
      { kind: "WeaponModTriggered", mod: "mask-chase", at: { x: guard.x, y: guard.y }, guardId: guard.id },
    );
    return {
      ...guard,
      permanentAlert: false,
      susp: { ...guard.susp, tier: "alert" as const, meter: Math.min(guard.susp.meter, tuning.suspicion.alertThreshold), tierLockMs: 0, pursuitOrigin: null },
    };
  });
  return out.length === 0 ? { guards, events: [] } : { guards: next, events: out };
}

/**
 * 5. 군중.
 *
 * 군중은 탐지 AI가 아니라 이동·접촉·동적 엄폐만 갖는 가벼운 액터다.
 * 경비보다 먼저 전진시켜 화면의 현재 위치와 이번 스텝 시야 차폐가 일치하게 한다.
 */
function stepCrowds(ctx: StepContext, start: CrowdStart, acc: MischiefAcc): CrowdAcc {
  const { layout, tuning, dtMs } = ctx;
  const crowd = CrowdRules.step(
    start.crowds,
    layout.crowds,
    acc.playerAfterMischief,
    tuning,
    start.rng,
    dtMs,
    start.grandEscape.active && start.grandEscape.origin !== null
      ? { x: start.grandEscape.origin.x, floor: floorOfY(start.grandEscape.origin.y, tuning.world.floorHeightPx) }
      : undefined,
  );
  acc.events.push(...crowd.events);
  return { ...acc, crowd };
}

/**
 * 6. 경비 반응.
 *
 * 경비는 직전 스텝에 발생한 소음을 듣는다. 같은 스텝 안에서 이동 순서에 따라
 * 들리고 안 들리는 일이 생기지 않게 한 프레임 지연시킨다.
 */
function stepGuardReactions(ctx: StepContext, start: GuardReactionStart, acc: CrowdAcc): GuardAcc {
  const { layout, tuning, dtMs } = ctx;
  const guardStep = stepGuards({
    guards: acc.bodyDrag.guards,
    mischief: acc.mischief.state,
    world: start,
    playerAtStart: start.player,
    auction: acc.auction,
    playerCombatAtStart: start.playerCombat,
    rngAtStart: start.rng,
    player: acc.playerAfterMischief,
    input: acc.input,
    layout,
    tuning,
    dtMs,
    crowds: acc.crowd.crowds,
    bodyContacts: acc.enteredGuardContacts,
  });
  // 사건은 append-only 다. 위장 노출·피해·피격 밀림·충격파 밀림을 먼저 계산하고(어느 것도 `acc.events` 를
  // 읽지 않는다), 밀린 거리까지 실은 최종 사건을 경비 사건 → 위장 노출 → 피해 순서로 한 번만 낸다.
  const exposedDisguise = guardStep.justSpotted
    ? MischiefRules.breakDisguise(
        acc.mischief.state,
        "spotted",
        { x: acc.playerAfterMischief.x, y: acc.playerAfterMischief.y },
        acc.floor,
      )
    : { state: acc.mischief.state, events: [] as readonly SimEvent[] };
  const perfectDodge = guardStep.events.find((event) => event.kind === "PerfectDodge");
  const hitGuard = guardStep.struckBy === null ? undefined : guardStep.guards.find((guard) => guard.id === guardStep.struckBy);
  const hitIndex = guardStep.events.findIndex((event) => event.kind === "PlayerStruck" && event.guardId === guardStep.struckBy);
  const hitEvent = hitIndex < 0 ? undefined : guardStep.events[hitIndex];
  const hitWeapon = hitGuard === undefined ? undefined : archetypeOf(hitGuard.archetypeId).combat?.weaponId;
  // 저작된 공격(2막 금고지기 돌진)은 사건이 피해를 싣는다. 나머지는 때린 무기의 기본 피해다.
  const authoredHitDamage = hitEvent?.kind === "PlayerStruck" ? hitEvent.damage : undefined;
  const hitDamage = authoredHitDamage !== undefined ? authoredHitDamage
    : hitEvent === undefined || hitWeapon === undefined ? 0 : evaluateCombatDamage({
    weaponId: hitWeapon,
    armorK: tuning.combat.armorK,
    opportunityMultiplier: tuning.combat.punishDamage,
  }).damage;
  const damagedPlayer = PlayerHealthRules.damage(acc.playerAfterMischief, hitDamage, tuning);
  let playerAfterGuards = applyPlayerHitDisplacement(
    damagedPlayer,
    guardStep.guards,
    guardStep.struckBy,
    guardStep.events,
    layout,
    tuning,
  );
  // 렌더가 몸을 맞은 자리에 붙들었다 미끄러뜨리도록 실제로 밀린 거리를 싣는다(벽에 막힌 만큼 줄어든다).
  const hitKnockbackPx = Math.abs(playerAfterGuards.x - damagedPlayer.x);
  const shockwaveIndex = guardStep.events.findIndex((event) => event.kind === "KeeperRoarShockwave");
  const shockwave = shockwaveIndex < 0 ? undefined : guardStep.events[shockwaveIndex];
  let shockwavePush: { readonly pushedPx: number; readonly facing: Facing } | null = null;
  if (shockwave?.kind === "KeeperRoarShockwave") {
    const shoved = shoveFromKeeperShockwave(playerAfterGuards, shockwave, layout, tuning);
    playerAfterGuards = shoved.player;
    if (shoved.pushedPx > 0) shockwavePush = { pushedPx: shoved.pushedPx, facing: shoved.facing };
  }
  acc.events.push(...guardStep.events.map((event, index): SimEvent => {
    if (index === hitIndex && event.kind === "PlayerStruck") return { ...event, knockbackPx: hitKnockbackPx };
    if (index === shockwaveIndex && event.kind === "KeeperRoarShockwave" && shockwavePush !== null) {
      return { ...event, pushedPx: shockwavePush.pushedPx, pushFacing: shockwavePush.facing };
    }
    return event;
  }));
  acc.events.push(...exposedDisguise.events);
  if (damagedPlayer.hp < acc.playerAfterMischief.hp && guardStep.struckBy !== null) {
    acc.events.push({
      kind: "PlayerDamaged",
      guardId: guardStep.struckBy,
      at: { x: damagedPlayer.x, y: damagedPlayer.y },
      damage: acc.playerAfterMischief.hp - damagedPlayer.hp,
      hp: damagedPlayer.hp,
      maxHp: damagedPlayer.maxHp,
    });
  }
  const meleePerfectDodge = perfectDodge?.kind === "PerfectDodge"
    && isMeleeCombatGuard(guardStep.guards, perfectDodge.guardId);
  if (perfectDodge?.kind === "PerfectDodge" && meleePerfectDodge) {
    playerAfterGuards = settleMeleePerfectDodge(
      playerAfterGuards,
      guardStep.guards,
      perfectDodge.guardId,
      layout,
      tuning,
    );
  }
  // 여러 경비의 판정이 같은 스텝에 겹쳐도 한 번의 구르기 비용보다 많이 환급하지 않는다.
  let stamina = acc.stamina;
  if (perfectDodge?.kind === "PerfectDodge") {
    stamina = StaminaRules.restore(
      stamina,
      tuning.combat.perfectDodgeStaminaRefund,
      tuning.stamina.max,
    );
  }
  const guardedActivity = PlayerActionRules.activityOf(
    {
      player: playerAfterGuards,
      run: start.run,
      caper: acc.caper.state,
      bodyDrag: acc.bodyDrag.state,
      subdue: start.subdue,
      pickpocket: start.pickpocket,
      // 장난 점유는 스텝 시작 값이다 — 4에서 진행한 `acc.mischief.state` 가 아니다(`GuardReactionStart`).
      mischief: start.mischief,
      playerCombat: acc.playerCombatForStep,
    },
    { dragging: acc.bodyDrag.dragging, capturedBy: guardStep.capturedBy },
  );
  const playerRestrained = PlayerActionRules.isRestrained(guardedActivity);
  const bodyDragState = acc.bodyDrag.state.targetId !== null
    && guardStep.guards.some((guard) => guard.id === acc.bodyDrag.state.targetId && GuardStatusRules.canBeDragged(guard))
    ? acc.bodyDrag.state
    : BodyDragRules.createBodyDrag();
  if (acc.bodyDrag.state.targetId !== null && bodyDragState.targetId === null) {
    const released = guardStep.guards.find((guard) => guard.id === acc.bodyDrag.state.targetId);
    if (released !== undefined) {
      acc.events.push({ kind: "BodyDragReleased", guardId: released.id, at: { x: released.x, y: released.y } });
    }
  }
  return {
    ...acc,
    guardStep,
    mischiefState: exposedDisguise.state,
    perfectDodge,
    meleePerfectDodge,
    playerAfterGuards,
    stamina,
    guardedActivity,
    playerRestrained,
    bodyDragState,
  };
}

/**
 * 공격 걸음 한 틱. 넉백·돌진과 같은 연속 충돌로 벽·난간 앞에서 멈추고, 앞에 선 몸의
 * 접촉 경계에서 멈춘다 — 관통한 뒤 되밀리면 다음 틱에 다시 파고들며 떨린다.
 */
function stepAttackRootMotion(
  player: PlayerSimState,
  deltaX: number,
  acc: GuardAcc,
  layout: MansionLayout,
  tuning: Tuning,
): PlayerSimState {
  const moved = displaceHorizontally({
    fromX: player.x,
    deltaX: capAttackStepAtBodies(player, deltaX, acc.guardStep.guards, tuning),
    feetY: player.y,
    halfWidth: tuning.movement.bodyWidth / 2,
    bodyHeight: MovementRules.bodyHeight(player.pose, tuning),
    stayGrounded: true,
  }, layout);
  if (moved.deltaX === 0) return player;
  return ActorContactRules.resolvePlayerGuardContacts(
    { ...player, x: moved.x },
    player,
    acc.guardStep.guards,
    layout,
    tuning,
    acc.mischiefState.snuffedLamps,
    layout.manor?.disguisePassage === true && acc.mischiefState.disguiseMs > 0
      || auctionGuestAccess(acc.auction, layout.auction, player),
  ).player;
}

/**
 * 공격 걸음은 앞에 선 상대의 접촉 경계(`captureRangePx`)를 넘지 않는다. 경직된 경비는 걸어서는
 * 지나칠 수 있지만(몸 접촉 규칙 `guardHasSolidBody`), 방금 맞힌 상대를 다음 타의 걸음이 뚫고 지나가면
 * 3타(38.9px 스텝)가 경비 몸 뒤에서 올려치는 그림이 된다(2026-09-25 실측: 2타 명중 뒤 3타 접촉 −10px).
 * 쓰러지지 않은 같은 층 경비만 센다. 이미 경계 안이면 더 파고들지 않는다(0).
 */
function capAttackStepAtBodies(player: PlayerSimState, deltaX: number, guards: readonly GuardState[], tuning: Tuning): number {
  if (deltaX === 0) return 0;
  const direction = Math.sign(deltaX);
  let allowed = Math.abs(deltaX);
  for (const guard of guards) {
    if (guard.knockedOut || guard.combat?.defeated === true || guard.climbLinkId !== null) continue;
    if (!onSameFloor(player.y, guard.y, tuning.world.floorHeightPx)) continue;
    const ahead = (guard.x - player.x) * direction;
    if (ahead <= 0) continue;
    allowed = Math.min(allowed, Math.max(0, ahead - tuning.guard.captureRangePx));
  }
  return direction * allowed;
}

/**
 * 7. 플레이어 전투와 무력화.
 *
 * 플레이어 전투는 경비의 현재 공격 단계를 본 뒤 판정한다. 그래야 선딜을 강공격으로 끊거나
 * 후딜에 3연타를 넣는 타이밍이 화면에 보인 상태와 일치한다.
 */
function stepPlayerCombatAndTakedowns(ctx: StepContext, start: CombatStart, acc: GuardAcc): CombatAcc {
  const { layout, tuning, dtMs } = ctx;
  const { perfectDodge } = acc;
  const combatBefore = acc.playerRestrained || acc.playerAfterGuards.hp <= 0
    ? PlayerCombatRules.createPlayerCombat() : acc.playerCombatForStep;
  // 펀치·발차기는 sim 에서 실제로 딛는다. 접촉 틱의 걸음까지 먼저 옮긴 자리에서 사거리를
  // 재야 앞발이 닿는 순간이 판정 순간이 된다(헛쳐도 딛는다).
  const rootStepPx = PlayerCombatRules.rootMotionStepPx(combatBefore, acc.playerAfterGuards, dtMs);
  const playerForCombat = rootStepPx === 0
    ? acc.playerAfterGuards
    : stepAttackRootMotion(acc.playerAfterGuards, rootStepPx, acc, layout, tuning);
  const playerCombatStep = PlayerCombatRules.step(
    combatBefore,
    PlayerActionRules.blocksCombat(acc.guardedActivity) || acc.playerAfterGuards.hp <= 0 || acc.input.interact
      ? maskInput(acc.input, INPUT_MASKS.combatTaken)
      : acc.input,
    playerForCombat,
    acc.guardStep.guards,
    acc.stamina.value,
    layout,
    tuning,
    dtMs,
  );
  // 완벽 회피가 발생한 스텝의 전투 입력까지 처리한 뒤 창을 연다. 다음 스텝부터 정확히
  // 설정된 전체 시간이 보장되고, 같은 프레임의 우연한 C가 반격권을 먼저 소비하지 않는다.
  // 금고지기는 전장 경계 밖으로 밀리지 않는다(경계의 기둥에 막힌다).
  const confined = confineBlackthorneBossKnockback(acc.guardStep.guards, playerCombatStep.guards, playerCombatStep.events);
  const playerCombatConfined = confined.guards === playerCombatStep.guards
    ? playerCombatStep : { ...playerCombatStep, guards: confined.guards, events: confined.events };
  const playerCombatOpened = perfectDodge?.kind === "PerfectDodge"
    ? {
        ...playerCombatConfined,
        state: PlayerCombatRules.openCounterWindow(
          playerCombatConfined.state,
          perfectDodge.guardId,
          tuning.combat.perfectCounterWindowMs,
          acc.meleePerfectDodge,
        ),
      }
    : playerCombatConfined;
  const playerCombat = markMaskAmbush(playerCombatOpened, start.mischief.disguiseMs > 0, layout, acc.events);
  let playerAfterCombat: PlayerSimState = playerForCombat;
  const startedMove = playerCombat.startedMoveId === null ? null : moveOf(playerCombat.startedMoveId);
  if (startedMove !== null && brakesIntoStep(startedMove) && playerAfterCombat.onGround) {
    // 제동 후 한 발. 걷던 관성이 윈드업 내내 미끄러지면 걸음 위에 최대 19px가 더 얹혀
    // 발이 헛돈다 — 이 무브의 몸 이동은 이제 `rootMotion` 곡선 하나가 소유한다.
    // 대시는 달리던 관성이 곧 예비 동작이라 끊지 않는다(곡선은 돌진 뒤 회수 걸음만 갖는다).
    playerAfterCombat = { ...playerAfterCombat, vx: 0, motion: "still" };
  }
  if (playerCombat.state.attackCounterGuardId !== null && playerCombat.state.attackContactMs > 0) {
    // 반격 입력 프레임에는 이동이 이미 계산된 뒤다. 공격 방향만 잠그면 판정은 맞아도
    // 배우가 계속 빈 공간을 보며 한 프레임 미끄러지므로, 같은 잠긴 방향으로 몸도 정착시킨다.
    playerAfterCombat = {
      ...playerAfterCombat,
      facing: playerCombat.state.attackFacing,
      vx: 0,
      motion: "still",
    };
  }
  if (playerCombat.lungePx !== 0) {
    // 대시 공격의 전진. 넉백과 같은 기하 규칙을 태워 벽 안으로 파고들지 않게 한다.
    const lunged = displaceHorizontally({
      fromX: playerAfterCombat.x,
      deltaX: playerCombat.lungePx,
      feetY: playerAfterCombat.y,
      halfWidth: tuning.movement.bodyWidth / 2,
      bodyHeight: MovementRules.bodyHeight(playerAfterCombat.pose, tuning),
      stayGrounded: true,
    }, layout);
    playerAfterCombat = { ...playerAfterCombat, x: lunged.x };
    if (lunged.deltaX !== 0) {
      // 순간 이동은 sim 의 진실이고, 화면이 그 사이를 잇는다. 경비 넉백과 같은 프레임의
      // 같은 사건이라 렌더가 둘을 같은 속도로 따라잡아야 뚫고 지나간 것처럼 안 보인다.
      acc.events.push({
        kind: "PlayerLunged",
        at: { x: lunged.x, y: playerAfterCombat.y },
        facing: lunged.deltaX < 0 ? -1 : 1,
        distancePx: Math.abs(lunged.deltaX),
      });
    }
  }
  let stamina = acc.stamina;
  if (playerCombat.staminaCost > 0) {
    stamina = StaminaRules.spend(stamina, playerCombat.staminaCost);
  }
  acc.events.push(...playerCombat.events);

  // 샹들리에는 정면 방어와 공격 후딜을 우회하는 공간 정답이다.
  // 경비가 이동한 뒤 판정해야 화면에 보인 마지막 위치와 명중 여부가 같다.
  const caperHits = applyCaperHits(playerCombat.guards, acc.caper.events, layout, tuning);
  acc.events.push(...caperHits.events);
  const environment = applyEnvironmentHits(caperHits.guards, acc.mischief.events, layout, tuning);
  acc.events.push(...environment.events);
  const snaredOnly = MischiefRules.triggerRibbonSnares(acc.mischiefState, environment.guards, layout);
  acc.events.push(...snaredOnly.events);
  // 유인구·연막 개조도 경비 이동이 끝난 좌표로 판정한다(올가미와 같은 자리).
  const popped = MischiefRules.triggerFirecrackers(snaredOnly.state, snaredOnly.guards, layout);
  acc.events.push(...popped.events);
  const gassed = MischiefRules.applyTearGas(popped.state, popped.guards, layout, tuning);
  acc.events.push(...gassed.events);
  const snared = { state: popped.state, guards: gassed.guards };
  const mischiefState = snared.state;

  // 단도는 발사 때 지정한 경비에게만 맞는다. 경비 스텝 뒤의 위치로 접촉을 판정하되,
  // 이미 경직된 대상을 다시 맞혀 시간을 연장하지 않는다.
  const struck = applyProjectileHits(
    snared.guards,
    mischiefState.projectiles.filter((projectile) => projectile.tool === "dagger" && projectile.targetLampId === undefined),
    layout,
    tuning,
  );
  acc.events.push(...struck.events);

  // 소매치기. 경비반장 뒤에서는 같은 E가 무력화보다 정보 획득을 먼저 뜻한다.
  const pickpocket = PickpocketRules.step(
    start.pickpocket,
    PlayerActionRules.blocksInteraction(acc.guardedActivity)
      ? maskInput(acc.interactionInput, INPUT_MASKS.interactionTaken)
      : acc.interactionInput,
    // 단도가 없으면 올가미 적용 전 environment 배열로 돌아가지 않는다. 사건만 보이고
    // 경비 경직이 사라지는 화면/판정 분리를 막기 위해 snared가 현재 경비 SSOT다.
    struck.guards.length > 0 ? struck.guards : snared.guards,
    { at: { x: playerAfterCombat.x, y: playerAfterCombat.y }, hidden: playerAfterCombat.hideSpotId !== null },
    tuning,
    dtMs,
    focusedTargetId(start, "pickpocket"),
  );
  acc.events.push(...pickpocket.events);

  // 무력화. 앞을 막고 선 경비에게 남은 마지막 수단이다.
  // 경비 스텝 뒤에 둬야 이번 프레임의 위치·방향으로 등 뒤 판정을 한다.
  const subdue = SubdueRules.step(
    start.subdue,
    pickpocket.busy || PlayerActionRules.blocksInteraction(acc.guardedActivity)
      ? maskInput(acc.interactionInput, INPUT_MASKS.interactionTaken)
      : acc.interactionInput,
    pickpocket.guards,
    { at: { x: playerAfterCombat.x, y: playerAfterCombat.y }, hidden: playerAfterCombat.hideSpotId !== null },
    tuning,
    dtMs,
    focusedTargetId(start, "subdue"),
  );
  acc.events.push(...subdue.events);
  return { ...acc, playerCombat, playerAfterCombat, stamina, mischiefState, struck, pickpocket, subdue };
}

/**
 * 8. 런 진행: 절도, 탈출, 제한시간, 추격자 활성화.
 */
function stepRunProgress(ctx: StepContext, start: RunStart, acc: CombatAcc): RunAcc {
  const { layout, tuning, dtMs } = ctx;
  const engaged = acc.playerCombat.engaged || acc.subdue.guards.some(
    (g) => GuardStatusRules.canJoinCombat(g) && g.susp.tier === "spotted",
  );

  const awareGuards = acc.subdue.guards.filter((guard) => !GuardStatusRules.isInactive(guard));
  const maxAlarm = awareGuards.reduce<0 | 1 | 2 | 3>(
    (worst, guard) => (Math.max(worst, rank(guard.susp.tier)) as 0 | 1 | 2 | 3),
    0,
  );
  const nearestGuardPx = acc.subdue.guards
    .filter((guard) =>
      GuardStatusRules.canAct(guard)
      && floorOfY(guard.y, tuning.world.floorHeightPx) === acc.floor
    )
    .reduce(
    (best, guard) => Math.min(best, Math.hypot(guard.x - acc.playerAfterCombat.x, guard.y - acc.playerAfterCombat.y)),
    Number.POSITIVE_INFINITY,
  );

  // 과적 유실 주기가 찬 프레임에만 난수를 소비한다. 매 프레임 굴리면 뒤따르는
  // 추격자 넘어짐과 군중 행동의 RNG 순서가 입력과 무관하게 흔들린다.
  const spillDue = !acc.input.drop && CarryRules.overloadSpillDue(
    start.carry,
    acc.playerAfterCombat.motion !== "still",
    tuning,
    dtMs,
  );
  const spillRoll = spillDue
    ? nextChance(acc.crowd.rng, tuning.carry.spillChance)
    : { state: acc.crowd.rng, value: false };

  const interactionActivity = PlayerActionRules.activityOf(
    {
      player: acc.playerAfterCombat,
      run: start.run,
      caper: acc.caper.state,
      bodyDrag: acc.bodyDragState,
      subdue: acc.subdue.state,
      pickpocket: acc.pickpocket.state,
      mischief: acc.mischiefState,
      playerCombat: acc.playerCombat.state,
    },
    { capturedBy: acc.guardStep.capturedBy },
  );
  const interactionBlocked = PlayerActionRules.blocksInteraction(interactionActivity);
  // 연막 탈출: 포박 발버둥 중 연막을 고른 채 Q를 누르면 연막을 터뜨리며 즉시 빠져나온다.
  // 명령 중재는 포박 중 발버둥 이동만 넘기므로 Q는 중재 전 입력에서 읽는다(연막 탈출이 발버둥의 한 방법이다).
  const smokeEscape = start.run.struggle !== null && ctx.rawInput.throwPressed
    && hasWeaponMod(layout, "smoke-escape")
    && MischiefRules.selectedToolOf(acc.mischiefState) === "smoke"
    && MischiefRules.ammoOf(acc.mischiefState, "smoke") > 0;
  const runStep = RunRules.step(
    start.run,
    start.carry,
    {
      at: { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y },
      // 무력화 중에는 절도가 걸리지 않는다. 같은 E 가 두 가지를 동시에 하면
      // 무엇을 하고 있는지 화면이 설명할 수 없다.
      interact: acc.interactionInput.interact && !interactionBlocked && !acc.pickpocket.busy && !acc.subdue.busy,
      interactPressed: acc.interactionInput.interactPressed && !interactionBlocked && !acc.pickpocket.busy && !acc.subdue.busy,
      drop: !PlayerActionRules.isRestrained(interactionActivity) && acc.input.drop,
      moving: acc.playerAfterCombat.motion !== "still",
      overloadSpillRoll: spillRoll.value,
      maxAlarm,
      nearestGuardPx,
      moveX: acc.input.moveX,
      justSpotted: acc.guardStep.justSpotted || acc.pickpocket.failedGuardId !== null,
      forceBreakFree: smokeEscape,
      capturedBy: acc.guardStep.capturedBy,
      defeatedBy: acc.playerAfterCombat.hp <= 0 ? acc.guardStep.struckBy : null,
      vaultCode: acc.pickpocket.state.vaultCode,
      preferredInteractionTargetId: focusedTargetId(start, "escape", "steal"),
      unavailableAnchorIds: acc.auction !== null && layout.auction !== undefined
        ? AuctionRules.auctionLockedAnchorIds(acc.auction, layout.auction)
        : [],
      conduct: {
        engagedInCombat: engaged,
        subdued: acc.subdue.subdued,
        pickpocketed: acc.pickpocket.picked,
        // 경계 등급과 절도 진행은 RunRules 가 자기 스텝 안에서 확정해 덮어쓴다.
        maxAlarm: 0,
        grabbing: false,
      },
    },
    layout,
    tuning,
    dtMs,
    start.timeMs,
  );
  acc.events.push(...runStep.events);
  let auction = acc.auction;
  let auctionAlarmTriggered = acc.auctionAlarmTriggered;
  if (auction !== null && layout.auction !== undefined) {
    const observedAuction = AuctionRules.observeAuctionLoot(auction, runStep.events, layout.auction);
    auction = observedAuction.state;
    auctionAlarmTriggered = auctionAlarmTriggered || observedAuction.alarmTriggered;
    acc.events.push(...observedAuction.events);
    // 경비가 알아본 순간 변장 신분이 끝난다. 소매치기 실패도 같은 발각이다.
    const exposure = AuctionRules.observeAuctionExposure(
      auction,
      acc.guardStep.justSpotted || acc.pickpocket.failedGuardId !== null,
      { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y },
      layout.auction,
    );
    auction = exposure.state;
    auctionAlarmTriggered = auctionAlarmTriggered || exposure.alarmTriggered;
    acc.events.push(...exposure.events);
  }
  const performedSuspiciousInteraction = acc.interactionInput.interact && (
    acc.bodyDrag.dragging
    || acc.pickpocket.busy
    || acc.subdue.busy
    || runStep.run.grabbingAnchorId !== null
    || runStep.events.some((event) => event.kind === "LootCollected")
  );
  let mischiefState = acc.mischiefState;
  if (smokeEscape && runStep.events.some((event) => event.kind === "PlayerBrokeFree")) {
    const at = { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y };
    const deployed = MischiefRules.deploySmoke(mischiefState, at, acc.floor);
    mischiefState = { ...deployed.state, smokeAmmo: Math.max(0, deployed.state.smokeAmmo - 1) };
    acc.events.push(...deployed.events, { kind: "WeaponModTriggered", mod: "smoke-escape", at });
  }
  if (performedSuspiciousInteraction && mischiefState.disguiseMs > 0) {
    const broken = MischiefRules.breakDisguise(
      mischiefState,
      "suspicious-action",
      { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y },
      acc.floor,
    );
    mischiefState = broken.state;
    acc.events.push(...broken.events);
  }

  // 기본 발각은 추격을 유지한다. 명시적으로 고른 왁스 계약만 이 결정론적 전도를 켠다.
  const trip = rollPursuerTrip(
    spillRoll.state,
    {
      ...acc.guardStep,
      guards: acc.subdue.guards as GuardState[],
      justSpotted: acc.guardStep.justSpotted || acc.pickpocket.failedGuardId !== null,
      spottedGuardId: acc.pickpocket.failedGuardId ?? acc.guardStep.spottedGuardId,
    },
    runStep,
    layout,
    tuning,
    { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y },
  );
  const activated = activateTriggeredGuards(
    trip.guards,
    layout,
    runStep.events,
    runStep.run.phase,
    acc.playerAfterCombat,
    tuning,
  );
  acc.events.push(...activated.events);
  const artifactAlarm = applyPersonalArtifactAlarm(activated.guards, runStep.events, tuning);
  acc.events.push(...artifactAlarm.events);
  // 마지막 유물을 집은 결과는 sim이 소유한다. render가 경비 상태를 고치면 같은 입력의
  // 리플레이와 화면이 서로 다른 세계를 재생하므로, 경보와 곤봉병 각성을 한 스텝에서 확정한다.
  const tutorialClimaxGuards = runStep.events.some(
    (event) => event.kind === "LootCollected"
      && (event.anchorId === TUTORIAL_CLIMAX_ANCHOR_ID || event.anchorId === PERSONAL_ARTIFACT_ANCHOR_ID),
  )
    ? activateTutorialClimaxGuards(artifactAlarm.guards, tuning)
    : artifactAlarm.guards;
  const auctionAlert = alertGuardsForAuction(
    tutorialClimaxGuards,
    auctionAlarmTriggered,
    acc.playerAfterCombat,
    tuning,
  );
  acc.events.push(...auctionAlert.events);
  const ambushTrip = rollActivatedPursuerTrips(
    auctionAlert.guards,
    activated.spottedGuardIds,
    trip.rng,
    tuning,
    { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y },
    acc.floor,
  );
  // 전리품 함정도 일반 발각과 같은 실패 사다리를 탄다. 이벤트만 spotted 로 만들고
  // 유예·최고 경계 기록을 빼면 같은 화면인데 규칙이 다른 부당한 기습이 된다.
  const triggeredPressure = activated.spottedGuardIds.length === 0
    ? { run: runStep.run, events: [] as readonly SimEvent[] }
    : RunRules.advanceRunPressure(runStep.run, 3, true, layout, tuning, 0);
  acc.events.push(...triggeredPressure.events);
  return {
    ...acc,
    interactionBlocked,
    runStep,
    auction,
    auctionAlarmTriggered,
    performedSuspiciousInteraction,
    mischiefState,
    guards: ambushTrip.guards,
    run: triggeredPressure.run,
    rng: ambushTrip.rng,
  };
}

/**
 * 9. 대탈출 연쇄와 상호작용 피드백.
 *
 * E를 새로 눌렀는데 어떤 행동도 시작·거절되지 않았다면 입력 자체가 유실된 것처럼
 * 보이지 않게 일반 사유를 돌려준다. 지금까지 쌓인 사건 전체를 근거로 삼는다.
 */
function stepEscapeAndInteractionFeedback(ctx: StepContext, start: EscapeStart, acc: RunAcc): EscapeAcc {
  const { layout, tuning, dtMs } = ctx;
  const grandEscape = GrandEscapeRules.step(
    start.grandEscape,
    acc.runStep.events,
    {
      playerAt: { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y },
      playerFloor: acc.floor,
      layout,
      closedExitIds: acc.run.closedExits,
      loadRatio: CarryRules.loadRatio(acc.runStep.carry, tuning),
      areaKey: start.pickpocket.areaKey,
      preparedChainIds: acc.caper.state.preparedChainIds,
      tuning,
    },
    dtMs,
  );
  acc.events.push(...grandEscape.events);
  const cascade = grandEscape.events.find(
    (event) => event.kind === "GrandEscapeBeatChanged" && event.beat === "cascade",
  );
  const manorRecovery = layout.manor !== undefined && acc.runStep.events.some((event) => event.kind === "LootCollected" && event.anchorId === layout.manor?.targetAnchorId);
  const escapeCaper = manorRecovery
    ? CaperRules.reactivatePrepared(acc.caper.state, layout, layout.manor?.crankChainId)
    : cascade?.kind === "GrandEscapeBeatChanged"
    ? CaperRules.reactivatePrepared(acc.caper.state, layout, cascade.preparedChainId)
    : { state: acc.caper.state, events: [] as readonly SimEvent[] };
  acc.events.push(...escapeCaper.events);

  // 들고 있는 동안 계속 울리는 물건. 오르골이 런의 클라이맥스를 만드는 장치다.
  acc.events.push(...carriedNoise(acc.runStep.carry, acc.playerAfterCombat, acc.floor, start.timeMs, dtMs));

  const interactionHandled =
    acc.pickpocket.busy ||
    acc.subdue.busy ||
    PlayerActionRules.handlesInteraction(PlayerActionRules.activityOf({
      player: acc.playerAfterCombat,
      run: acc.runStep.run,
      caper: acc.caper.state,
      bodyDrag: acc.bodyDragState,
      subdue: acc.subdue.state,
      pickpocket: acc.pickpocket.state,
      mischief: acc.mischiefState,
      playerCombat: acc.playerCombat.state,
    })) ||
    acc.events.some((event) =>
      event.kind === "PlayerEnteredVent" ||
      (event.kind === "ActionRejected" && ["interact", "steal", "escape", "vent"].includes(event.action))
    ) || acc.auctionOwnsInteraction;
  const exhaustedBody = acc.input.interactPressed && acc.bodyDragBlocked && !acc.interactionBlocked ? acc.bodyCandidate : null;
  if (exhaustedBody !== null) {
    acc.events.push({
      kind: "ActionRejected",
      action: "interact",
      reason: "depleted",
      targetId: exhaustedBody.id,
      at: { x: exhaustedBody.x, y: exhaustedBody.y },
    });
  }
  if (acc.input.interactPressed && exhaustedBody === null && !interactionHandled && !acc.interactionBlocked) {
    // 거절 사유는 이번 스텝이 끝난 세계로 판정한다. 플레이어만 새 값이고 세계는 스텝 시작 값이면
    // "대상 없음" 거절이 이미 사라진 대상의 자리에 뜬다.
    const blocked = primaryInteractionAffordance({
      manor: start.manor,
      player: acc.playerAfterCombat,
      guards: acc.guards,
      subdue: acc.subdue.state,
      pickpocket: acc.pickpocket.state,
      bodyDrag: acc.bodyDragState,
      mischief: acc.mischiefState,
      run: acc.run,
      carry: acc.runStep.carry,
      stamina: acc.stamina,
      caper: escapeCaper.state,
      interactionFocus: start.interactionFocus,
      auction: acc.auction,
    }, layout, tuning);
    acc.events.push({ kind: "ActionRejected", action: "interact", reason: blocked?.blockedReason ?? "no-target",
      ...(blocked?.blockedReason ? { targetId: blocked.targetId } : {}),
      at: blocked?.at ?? { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y } });
  }
  return { ...acc, grandEscape, escapeCaper };
}

/**
 * 10. 정착.
 *
 * 포박·보상·최종 접촉 정리까지 끝낸 플레이어와 경비를 확정한다. 여기 이후로는
 * 판정이 없고 조립만 남는다.
 */
function settleStepState(ctx: StepContext, start: SettleStart, acc: EscapeAcc): SettledAcc {
  const { layout, tuning, dtMs } = ctx;
  const projectileResolvedMischief = acc.struck.consumed.length === 0
    ? acc.mischiefState
    : {
        ...acc.mischiefState,
        projectiles: acc.mischiefState.projectiles.filter((p) => !acc.struck.consumed.includes(p.id)),
      };
  // 포박이 이번 스텝에 새로 시작됐더라도 차지·홀드 상태를 즉시 지운다. 그렇지 않으면
  // 다음 스텝의 강제 입력 해제가 투척으로 해석되어 붙잡힌 손에서 물건이 발사된다.
  const finalActivity = PlayerActionRules.activityOf({
    player: acc.playerAfterCombat,
    run: acc.run,
    caper: acc.escapeCaper.state,
    bodyDrag: acc.bodyDragState,
    subdue: acc.subdue.state,
    pickpocket: acc.pickpocket.state,
    mischief: projectileResolvedMischief,
    playerCombat: acc.playerCombat.state,
  });
  const finalMischief = !PlayerActionRules.isRestrained(finalActivity)
    ? projectileResolvedMischief
    : MischiefRules.cancelActions(projectileResolvedMischief);
  const finalCaper = !PlayerActionRules.isRestrained(finalActivity)
    ? acc.escapeCaper.state
    : CaperRules.cancelRoot(acc.escapeCaper.state);
  const tactics = TacticRules.observe(start.tactics, acc.events, layout);
  acc.events.push(...tactics.events);
  const showtime = ShowtimeRules.observe(
    start.showtime,
    acc.events,
    dtMs,
    { x: acc.playerAfterCombat.x, y: acc.playerAfterCombat.y },
  );
  acc.events.push(...showtime.events);
  const rewardedStamina = showtime.reward
    ? StaminaRules.restore(acc.stamina, tuning.stamina.max, tuning.stamina.max)
    : acc.stamina;
  const rewardedMischief = showtime.reward
    ? MischiefRules.refillEquippedTools(finalMischief, tuning)
    : finalMischief;
  // 환경 장치·추격 활성화까지 반영된 최종 경비 위치로 한 번 더 정착시킨다. 판정은 위의
  // 이동 직후 접촉이 소유하고, 이 단계는 경비가 플레이어 쪽으로 이동한 프레임의 관통만 제거한다.
  let playerFinal: PlayerSimState = PlayerActionRules.isRestrained(finalActivity)
    ? { ...acc.playerAfterCombat, parkour: undefined, grapple: undefined, vx: 0, vy: 0, staggerMs: 0, motion: "still" as const }
    : ActorContactRules.resolvePlayerGuardContacts(
        acc.playerAfterCombat,
        // 근접 완벽 회피는 위에서 이미 반대편 접촉 경계로 정착했다. 회피 전 좌표를
        // 기준으로 분리하면 앞쪽으로 되감기므로 정착 좌표를 기준으로 삼되, 다른 경비와의
        // 접촉 정리는 그대로 수행한다.
        acc.meleePerfectDodge ? acc.playerAfterCombat : acc.playerAfterContact,
        acc.guards,
        layout,
        tuning,
        rewardedMischief.snuffedLamps,
        layout.manor?.disguisePassage === true && rewardedMischief.disguiseMs > 0
          || auctionGuestAccess(acc.auction, layout.auction, acc.playerAfterContact),
      ).player;
  if (acc.run.outcome !== null && (playerFinal.parkour !== undefined || playerFinal.grapple !== undefined)) {
    playerFinal = { ...playerFinal, parkour: undefined, grapple: undefined };
  }

  // GuardPlanner has a kinematic floor controller: stop at the same prop solids as the player.
  let guardsFinal: readonly GuardState[] = acc.guards;
  let environmentPhysics: EnvironmentPhysicsState | undefined = start.environmentPhysics;
  if (environmentPhysics) {
    const settled = resolvePropActors(environmentPhysics, environmentPhysics, playerFinal, guardsFinal, layout, tuning);
    playerFinal = settled.player;
    guardsFinal = [...settled.guards];
    environmentPhysics = settled.state;
    acc.events.push(...settled.events);
  }
  return {
    ...acc,
    finalActivity,
    finalCaper,
    tactics,
    showtime,
    rewardedStamina,
    rewardedMischief,
    playerFinal,
    guardsFinal,
    environmentPhysics,
  };
}

/** 11. 다음 상태 조립. 판정은 끝났고 소유자별 결과를 한 객체로 모은다. */
function assembleStepResult(ctx: StepContext, start: AssembleStart, acc: SettledAcc): StepResult {
  const { originalLayout, layout, tuning, dtMs } = ctx;
  const exhibition = advanceExhibition(start.manor?.exhibition, originalLayout, acc.events, dtMs, acc.playerFinal, start.manor?.exterior);
  acc.events.push(...exhibitionArrivalEvents(start.manor?.exhibition, exhibition, originalLayout));
  // 플레이어 타격까지 끝난 뒤 금고지기의 무방비·열쇠 빼앗기를 기록한다(보스 스텝은 이번 적중을 모른다).
  const keeper = observeBlackthorneBossHits(acc.guardStep.bossState, acc.guardsFinal, acc.events,
    { x: acc.playerFinal.x, y: acc.playerFinal.y }, start.timeMs + dtMs,
    floorSurfaceY(BLACKTHORNE_BOSS_ARENA.floor, tuning.world.floorHeightPx, tuning.world.slabThicknessPx), acc.playerFinal.facing);
  let playerFinal = acc.playerFinal;
  for (const event of keeper.events) {
    if (event.kind !== "KeeperExposed") {
      acc.events.push(event);
      continue;
    }
    const shoved = shoveFromKeeperExposed(playerFinal, event.at, layout, tuning);
    playerFinal = shoved.player;
    acc.events.push(shoved.pushedPx > 0 ? { ...event, pushedPx: shoved.pushedPx, pushFacing: shoved.facing } : event);
  }
  const exterior = supportsExteriorHeist(originalLayout)
    ? advanceExteriorHeist(start.manor?.exterior, originalLayout, start.player, playerFinal, acc.guardsFinal, acc.events, dtMs)
    : null;
  if (exterior !== null) acc.events.push(...exterior.events);
  const guardsAfterExterior = exterior?.state.entered === true
    ? acc.guardsFinal.map((guard) => EXTERIOR_HEIST_GUARD_IDS.some((id) => id === guard.id)
      && guard.previewOnly === true ? { ...guard, previewOnly: false } : guard)
    : acc.guardsFinal;
  const walkedProps = dtMs > 0
    ? applyCartWalk(acc.environmentPhysics, playerFinal, acc.finalActivity === "free" ? acc.movementInput : null, layout, tuning)
    : acc.environmentPhysics;
  const nextState: SimState = {
      manor: layout.manor === undefined ? undefined : observeManor({ ...start.manor!, guestRevoked: start.manor?.guestRevoked === true || acc.performedSuspiciousInteraction || acc.guardStep.justSpotted || exterior?.state.entered === true, exhibition,
        ...(exterior === null ? {} : { exterior: { ...exterior.state, ...(keeper.state ? { boss: keeper.state } : {}) } }) }, originalLayout, playerFinal, acc.events, tuning),
      environmentPhysics: applyPropActions(walkedProps, layout, acc.events, tuning, acc.playerFinal.pose === "crouch"),
      timeMs: start.timeMs + dtMs,
      player: playerFinal,
      stamina: acc.rewardedStamina,
      carry: acc.runStep.carry,
      guards: guardsAfterExterior,
      crowds: acc.crowd.crowds,
      run: originalLayout.manor?.heist && exhibitionDocked(exhibition)
        ? { ...acc.run, preparedEscapeIds: [...new Set([...acc.run.preparedEscapeIds, ...originalLayout.escapes.map(exit => exit.id)])] }
        : acc.run,
      subdue: acc.subdue.state,
      pickpocket: acc.pickpocket.state,
      bodyDrag: acc.bodyDragState,
      playerCombat: acc.playerCombat.state,
      combatDirector: acc.guardStep.combatDirector,
      interactionFocus: start.interactionFocus,
      auction: acc.auction,
      mischief: acc.rewardedMischief,
      caper: acc.finalCaper,
      grandEscape: acc.grandEscape.state,
      tactics: acc.tactics.state,
      showtime: acc.showtime.state,
      rng: acc.rng,
      footstepMs: acc.footstepMs,
      pendingNoise: acc.events.filter((e) => e.kind === "NoiseEmitted"),
      captured: start.captured || acc.guardStep.captured,
  };
  // 군중 속 가면 박자는 최종 가면이 남았을 때만 사건이 된다(스텝 시작에 가면을 썼다는 조건은 박자가 이미 담았다).
  if (nextState.mischief.disguiseMs > 0) {
    for (const beat of acc.crowdCoverBeats) {
      acc.events.push({ kind: "WeaponModTriggered", mod: "mask-crowd", at: beat.at, facing: beat.facing });
    }
  }
  return {
    state: { ...nextState, interactionFocus: interactionFocusOf(nextState, layout, tuning) },
    events: acc.events,
    commands: acc.commands,
  };
}

function alertGuardsForAuction(
  guards: readonly GuardState[],
  triggered: boolean,
  player: PlayerSimState,
  tuning: Tuning,
): { readonly guards: GuardState[]; readonly events: SimEvent[] } {
  if (!triggered) return { guards: guards.slice(), events: [] };
  const events: SimEvent[] = [];
  const alerted = guards.map((guard) => {
    if (GuardStatusRules.isInactive(guard)) return guard;
    const susp = SuspicionRules.bump(
      guard.susp,
      tuning.suspicion.spottedThreshold,
      { x: player.x, y: player.y },
      tuning,
    );
    if (guard.susp.tier !== susp.tier) {
      events.push({ kind: "SuspicionTierChanged", guardId: guard.id, from: guard.susp.tier, to: susp.tier });
    }
    return {
      ...guard,
      previewOnly: false,
      susp,
      permanentAlert: true,
      mode: transitionGuardMode(guard.mode, { kind: "alerted" }),
    };
  });
  return { guards: alerted, events };
}

function focusedTargetId(state: Pick<SimState, "interactionFocus">, ...kinds: readonly InteractionKind[]): string | null {
  return state.interactionFocus !== null && kinds.includes(state.interactionFocus.kind)
    ? state.interactionFocus.targetId
    : null;
}

/**
 * 근접 완벽 회피는 무기를 통과한 바로 그 자리에서 구르기 관성을 정리한다.
 *
 * 계속 0.25초를 미끄러지면 46px 평타 사거리 밖으로 80~100px 벌어져, 화면의
 * `C 한 번 반격`이 실제로는 즉시 역방향 제동을 요구하는 함정이 된다. 원거리 회피는
 * 투사체에서 계속 벗어나는 동작이므로 멈추지 않는다.
 */
function settleMeleePerfectDodge(
  player: PlayerSimState,
  guards: readonly GuardState[],
  guardId: string,
  layout: MansionLayout,
  tuning: Tuning,
): PlayerSimState {
  const guard = guards.find((candidate) => candidate.id === guardId);
  const profile = guard === undefined ? undefined : archetypeOf(guard.archetypeId).combat;
  if (guard === undefined || profile?.attackKind !== "melee") return player;
  // 공격자 쪽으로 구른 경우에만 통과를 완성한다. 반대로 거리를 벌인 회피까지 접촉
  // 경계로 당겨 버리면 입력과 반대 방향으로 순간이동하는 결과가 된다.
  const movingTowardGuard = (guard.x - player.x) * player.facing > 0;
  const settledX = movingTowardGuard
    ? guard.x + player.facing * (tuning.guard.captureRangePx + 0.001)
    : player.x;
  const settled = displaceHorizontally({
    fromX: player.x,
    deltaX: settledX - player.x,
    feetY: player.y,
    halfWidth: tuning.movement.bodyWidth / 2,
    bodyHeight: MovementRules.bodyHeight(player.pose, tuning),
    stayGrounded: true,
  }, layout);
  return {
    ...player,
    x: settled.x,
    vx: 0,
    dodgeMs: 0,
    motion: "still",
    // 구르기 방향을 그대로 보면 통과·이탈 뒤 공격이 빈 공간을 향한다. 전용 반격 안내가
    // 추가 방향 입력을 숨기지 않도록 회피한 공격자를 즉시 바라본다.
    facing: guard.x === settled.x ? player.facing : guard.x > settled.x ? 1 : -1,
  };
}

function isMeleeCombatGuard(guards: readonly GuardState[], guardId: string): boolean {
  const guard = guards.find((candidate) => candidate.id === guardId);
  return guard !== undefined && archetypeOf(guard.archetypeId).combat?.attackKind === "melee";
}

/** 저택 전체 방송은 소음 반경이 아니라 명시적인 사건으로 모든 활동 경비에게 전달한다. */
function applyPersonalArtifactAlarm(
  guards: readonly GuardState[],
  runEvents: readonly SimEvent[],
  tuning: Tuning,
): { guards: GuardState[]; events: SimEvent[] } {
  const alarm = runEvents.find((event) => event.kind === "PersonalArtifactAlarmTriggered");
  if (alarm === undefined) return { guards: guards.slice(), events: [] };

  const events: SimEvent[] = [];
  const next = guards.map((guard) => {
    const responded = GuardPlanner.respondToMansionAlarm(guard, alarm.at, tuning);
    if (responded.susp.tier !== guard.susp.tier) {
      events.push({
        kind: "SuspicionTierChanged",
        guardId: guard.id,
        from: guard.susp.tier,
        to: responded.susp.tier,
      });
    }
    return responded;
  });
  return { guards: next, events };
}

/** 적의 명중은 실패 판정뿐 아니라 실제 거리를 벌리고 짧게 자세를 무너뜨린다. */
function applyPlayerHitDisplacement(
  player: PlayerSimState,
  guards: readonly GuardState[],
  struckBy: string | null,
  sourceEvents: readonly SimEvent[],
  layout: MansionLayout,
  tuning: Tuning,
): PlayerSimState {
  if (struckBy === null || !sourceEvents.some((event) => event.kind === "PlayerStruck" && event.guardId === struckBy)) {
    return player;
  }
  const attacker = guards.find((guard) => guard.id === struckBy);
  if (attacker === undefined) return player;

  const direction = player.x === attacker.x ? attacker.facing : player.x < attacker.x ? -1 : 1;
  const displaced = displaceHorizontally({
    fromX: player.x,
    deltaX: direction * tuning.combat.playerHitKnockbackPx,
    feetY: player.y,
    halfWidth: tuning.movement.bodyWidth / 2,
    bodyHeight: MovementRules.bodyHeight(player.pose, tuning),
    stayGrounded: false,
  }, layout);
  const releasedTraversal = player.pose === "climb" || player.pose === "hang";
  return {
    ...player,
    x: displaced.x,
    vx: 0,
    vy: releasedTraversal ? 0 : player.vy,
    // 사다리·매달리기 중 피격은 연결을 놓고 낙하 상태로 전환한다. 링크를 남기면
    // 넉백 뒤 다음 프레임에 원래 사다리 경로로 되감긴다.
    climbLinkId: null,
    parkour: undefined,
    grapple: undefined,
    pose: releasedTraversal ? "stand" : player.pose,
    onGround: releasedTraversal ? false : player.onGround,
    fallStartY: releasedTraversal ? player.y : player.fallStartY,
    staggerMs: Math.max(player.staggerMs, tuning.combat.playerHitStunMs),
    // 같은 자세 붕괴 동안 옆 경비가 이어 때려 "한 대 = 패배" 가 되는 것을 막는다.
    hitInvulnMs: Math.max(player.hitInvulnMs ?? 0, tuning.combat.playerHitInvulnMs),
    motion: "still",
  };
}

/** 낙하 환경 공격. 전투 적의 방어를 우회하고 일반 경비도 같은 충격 반경에서 무력화한다. */
function applyEnvironmentHits(
  guards: readonly GuardState[],
  sourceEvents: readonly SimEvent[],
  layout: MansionLayout,
  tuning: Tuning,
): { guards: GuardState[]; events: SimEvent[] } {
  const drops = sourceEvents.filter((event) => event.kind === "ChandelierDropped");
  if (drops.length === 0) return { guards: guards.slice(), events: [] };

  let next = guards.slice();
  const events: SimEvent[] = [];
  for (const drop of drops) {
    const hazard = layout.environmentHazards.find((entry) => entry.id === drop.hazardId);
    if (hazard === undefined) continue;
    const impactFloor = floorOfY(hazard.impactAt.y - 1, tuning.world.floorHeightPx);
    next = next.map((guard) => {
      const dx = Math.abs(guard.x - hazard.impactAt.x);
      if (guard.floor !== impactFloor || dx > hazard.impactRadiusPx) return guard;
      if (GuardStatusRules.isInactive(guard)) return guard;

      const groundedGuard = GuardPlanner.settleClimberToFloor(guard, layout, tuning);
      const at = { x: groundedGuard.x, y: groundedGuard.y };
      if (guard.combat !== null) {
        events.push({ kind: "CombatDefeated", guardId: guard.id, at });
        return GuardStatusRules.immobilize({
          ...groundedGuard,
          combat: { ...guard.combat, hp: 0, defeated: true },
          staggerMs: 0,
        });
      }
      events.push({ kind: "GuardSubdued", guardId: guard.id, at, method: "environment" });
      return GuardStatusRules.immobilize({
        ...groundedGuard,
        knockedOut: true,
        knockoutMs: tuning.guard.knockoutMs,
        staggerMs: 0,
      });
    });
    events.push({
      kind: "NoiseEmitted",
      at: hazard.impactAt,
      floor: impactFloor,
      radius: tuning.mischief.chandelierNoiseRadius,
      source: "prop",
    });
  }
  return { guards: next, events };
}

/** 연쇄 장치의 공간 판정. 연출이 아니라 레이아웃의 impactAt/effect가 실제 결과를 정한다. */
function applyCaperHits(
  guards: readonly GuardState[],
  sourceEvents: readonly SimEvent[],
  layout: MansionLayout,
  tuning: Tuning,
): { guards: GuardState[]; events: SimEvent[] } {
  const triggers = sourceEvents.filter((event) => event.kind === "CaperDeviceTriggered");
  if (triggers.length === 0) return { guards: guards.slice(), events: [] };

  let next = guards.slice();
  const events: SimEvent[] = [];
  for (const trigger of triggers) {
    const chain = (layout.caperChains ?? []).find((entry) => entry.id === trigger.chainId);
    const device = chain?.devices.find((entry) => entry.id === trigger.deviceId);
    // Zero-radius devices are acoustic outlets, not invisible weapons.
    if (device === undefined || device.impactRadiusPx <= 0) continue;
    next = next.map((guard) => {
      if (guard.floor !== device.floor || Math.abs(guard.x - device.impactAt.x) > device.impactRadiusPx) return guard;
      if (GuardStatusRules.isInactive(guard)) return guard;
      const grounded = GuardPlanner.settleClimberToFloor(guard, layout, tuning);

      if (device.effect === "shove") {
        const displaced = displaceHorizontally({
          fromX: grounded.x,
          deltaX: device.direction * 112,
          feetY: grounded.y,
          halfWidth: tuning.movement.bodyWidth / 2,
          bodyHeight: tuning.movement.bodyHeightStand,
          stayGrounded: true,
        }, layout);
        const movedGuard = {
          ...grounded,
          x: displaced.x,
          facing: device.direction,
          staggerMs: Math.max(grounded.staggerMs, 760),
        };
        events.push({
          kind: "GuardShoved",
          guardId: guard.id,
          from: { x: guard.x, y: guard.y },
          at: { x: movedGuard.x, y: movedGuard.y },
        });
        return movedGuard;
      }

      if (device.effect === "stagger") {
        return {
          ...grounded,
          facing: device.direction,
          staggerMs: Math.max(grounded.staggerMs, device.kind === "wine-rack" ? 1500 : 1100),
        };
      }

      const at = { x: grounded.x, y: grounded.y };
      if (grounded.combat !== null) {
        events.push({ kind: "CombatDefeated", guardId: guard.id, at });
        return GuardStatusRules.immobilize({
          ...grounded,
          combat: { ...grounded.combat, hp: 0, defeated: true },
          staggerMs: 0,
        });
      }
      events.push({ kind: "GuardSubdued", guardId: guard.id, at, method: "environment" });
      return GuardStatusRules.immobilize({
        ...grounded,
        knockedOut: true,
        knockoutMs: tuning.guard.knockoutMs,
        staggerMs: 0,
      });
    });
  }
  return { guards: next, events };
}

/**
 * 전리품 획득이나 런 페이즈 전환으로 시작하는 추격자를 그 완료 프레임에 생성한다.
 * 비활성 경비를 상태와 렌더에 미리 넣지 않아 일반 감시망·소음 전파·무력화 후보에 섞이지 않는다.
 */
function activateTriggeredGuards(
  guards: readonly GuardState[],
  layout: MansionLayout,
  runEvents: readonly SimEvent[],
  runPhase: RunState["phase"],
  player: PlayerSimState,
  tuning: Tuning,
): { guards: GuardState[]; events: SimEvent[]; spottedGuardIds: string[] } {
  const collected = new Set<string>();
  for (const event of runEvents) {
    if (event.kind === "LootCollected") collected.add(event.anchorId);
  }
  if (collected.size === 0 && runPhase !== "greatEscape") {
    return { guards: guards.slice(), events: [], spottedGuardIds: [] };
  }

  const existingIds = new Set(guards.map((guard) => guard.id));
  const next = guards.slice();
  const events: SimEvent[] = [];
  const spottedGuardIds: string[] = [];
  for (const spawn of layout.guards) {
    const lootTriggered = spawn.activationLootAnchorId !== undefined && collected.has(spawn.activationLootAnchorId);
    const phaseTriggered = spawn.activationRunPhase !== undefined && spawn.activationRunPhase === runPhase;
    if (
      (!lootTriggered && !phaseTriggered) ||
      existingIds.has(spawn.id)
    ) {
      continue;
    }
    const created = GuardPlanner.createGuard(spawn, tuning);
    next.push({
      ...created,
      mode: transitionGuardMode(created.mode, { kind: "alerted" }),
      susp: SuspicionRules.bump(
        created.susp,
        tuning.suspicion.spottedThreshold,
        { x: player.x, y: player.y },
        tuning,
      ),
    });
    existingIds.add(spawn.id);
    spottedGuardIds.push(spawn.id);
    events.push({ kind: "SuspicionTierChanged", guardId: spawn.id, from: "calm", to: "spotted" });
  }
  return { guards: next, events, spottedGuardIds };
}

/** 세트피스로 새로 나타난 일반 포획 경비에도 명시적 계약의 자빠짐 규칙을 적용한다. */
function rollActivatedPursuerTrips(
  guards: readonly GuardState[],
  spottedGuardIds: readonly string[],
  initialRng: RngState,
  tuning: Tuning,
  playerAt: Vec2,
  playerFloor: number,
  ): { guards: GuardState[]; rng: RngState } {
  let next = guards.slice();
  let rng = initialRng;
  for (const guardId of spottedGuardIds) {
    const roll = nextChance(rng, tuning.run.tripChance);
    rng = roll.state;
    const guard = next.find((candidate) => candidate.id === guardId);
    // 전투 적과 감시 장치는 접촉·등장 자체가 각자의 공격/경보 규칙이다.
    // 일반 경비도 플레이어 몸과 겹쳐 등장했다면 다음 스텝의 포박 교습을 자동 전도로 덮지 않는다.
    // RNG는 기존과 동일하게 소비해 이후 리플레이의 난수 순서를 보존한다.
    const bodyContact = guard !== undefined
      && guard.floor === playerFloor
      && Math.abs(guard.x - playerAt.x) <= tuning.guard.captureRangePx + 0.001;
    if (
      !roll.value || guard === undefined || bodyContact ||
      !GuardStatusRules.canPratfallOnSpotted(guard)
    ) continue;
    next = next.map((guard) =>
      guard.id === guardId
        ? {
            ...guard,
            staggerMs: tuning.movement.fallStaggerMs,
            contractTripMs: tuning.movement.fallStaggerMs,
          }
        : guard,
    );
  }
  return { guards: next, rng };
}

/**
 * 비행 중인 투척물이 경비의 몸에 닿았을 때.
 *
 * 비장갑 경비는 5초간 행동·시야·접촉을 잃는다. 기사의 정면 판금은 기존 전투
 * 실루엣대로 튕겨 내고, 후면 적중만 비살상 경직을 허용한다.
 */
function applyProjectileHits(
  guards: readonly GuardState[],
  projectiles: readonly Projectile[],
  layout: MansionLayout,
  tuning: Tuning,
): { guards: GuardState[]; events: SimEvent[]; consumed: readonly number[] } {
  if (projectiles.length === 0) return { guards: [], events: [], consumed: [] };

  const events: SimEvent[] = [];
  const consumed: number[] = [];
  let changed = false;

  const next = guards.map((guard) => {
    if (GuardStatusRules.isInactive(guard)) return guard;
    // 근접 타격과 같은 유효 프로필을 쓴다 — 금고지기 포효 무적·무방비 같은 조우 덮어쓰기가 단도에도 걸린다.
    const profile = CombatRules.effectiveCombatProfile(guard);

    // 착탄 지점이 아니라 비행 중 몸에 닿는지를 본다.
    // 벽에 닿아야만 판정하면 상대를 스쳐 지나간 것이 아무 일도 하지 않는다.
    const reachPx = tuning.mischief.grazeReachPx;
    for (const p of projectiles) {
      if (consumed.includes(p.id)) continue;
      if (p.targetGuardId !== undefined && p.targetGuardId !== guard.id) continue;
      const dx = Math.abs(p.x - guard.x);
      const dy = p.y - guard.y;
      const withinBody = dy > -tuning.movement.bodyHeightStand * 1.4 && dy < 8;
      if (dx > reachPx || !withinBody) continue;

      const at = { x: p.x, y: p.y };
      // 이미 경직된 일반 경비의 경직은 연장하지 않는다(설계) — 단도는 몸을 지나쳐 계속 난다. 뒤의 경비에게 닿거나 떨어져
      // 착탄 소음(울림 날 포함)을 낸다. 예전에는 여기서 투사체만 사라져 탄이 말없이 줄었다(2026-09-30).
      // 전투 상대는 경직 중에도 아래 전투 가지에서 맞는다 — 올가미·와이어가 연 무기 빈틈을 단도로 닫을 수 있다.
      if (guard.staggerMs > 0 && (guard.combat === null || profile === undefined)) continue;

      // --- 일반 경비: 피해 없이 5초 경직 ---
      if (guard.combat === null || profile === undefined) {
        changed = true;
        consumed.push(p.id);
        // 단도가 온 방향의 반대편에 던진 사람이 있다.
        const back: Facing = p.vx >= 0 ? -1 : 1;
        const suspectAt = { x: guard.x + back * tuning.mischief.grazeSuspectPx, y: guard.y };
        events.push({ kind: "DaggerDazed", guardId: guard.id, at, durationMs: tuning.mischief.grazeStaggerMs });
        events.push({
          kind: "NoiseEmitted",
          at,
          floor: guard.floor,
          radius: tuning.mischief.grazeNoiseRadius,
          source: "prop",
        });
        return {
          ...GuardPlanner.settleClimberToFloor(guard, layout, tuning),
          facing: back,
          staggerMs: Math.max(guard.staggerMs, tuning.mischief.grazeStaggerMs),
          susp: SuspicionRules.bump(guard.susp, tuning.suspicion.curiousThreshold, suspectAt, tuning),
        };
      }

      // --- 전투 상대: 단검 ---
      const fromBehind = CombatRules.isBehind(at, { x: guard.x, y: guard.y }, guard.facing);
      const back: Facing = p.vx >= 0 ? -1 : 1;
      const suspectAt = { x: guard.x + back * tuning.mischief.grazeSuspectPx, y: guard.y };
      const susp = SuspicionRules.bump(guard.susp, tuning.suspicion.spottedThreshold, suspectAt, tuning);
      const alerted = {
        ...guard,
        // 경직(넘어짐) 중인 몸은 돌려세우지 않는다 — 누운 몸이 단도 쪽으로 뒤집혀 보였다.
        facing: guard.staggerMs > 0 ? guard.facing : back,
        susp,
        permanentAlert: true,
        mode: transitionGuardMode(guard.mode, { kind: "alerted" }),
      };
      if (guard.susp.tier !== susp.tier) {
        events.push({ kind: "SuspicionTierChanged", guardId: guard.id, from: guard.susp.tier, to: susp.tier });
      }
      if (profile.invulnerable === true || (profile.frontImmune && !fromBehind)) {
        // 판금에 막힌 단검이 몸을 관통해 뒤쪽까지 날아가면 정면 무효가 화면에서 거짓말이 된다.
        // 포효 중 무적도 같은 자리에서 막힌다(근접과 같은 튕김 연출).
        changed = true;
        consumed.push(p.id);
        events.push({ kind: "CombatBlocked", guardId: guard.id, at, ...(profile.invulnerable === true ? { invulnerable: true } : {}) });
        events.push({
          kind: "NoiseEmitted",
          at,
          floor: guard.floor,
          radius: tuning.combat.engageNoiseRadius,
          source: "combat",
        });
        return alerted;
      }

      // 전투 상대도 일반 공격과 같은 HP 판정을 쓴다. 살아남은 상대만 단도 경직을 받는다.
      changed = true;
      consumed.push(p.id);
      const toolOpening = CombatRules.hasToolOpening(guard);
      const hit = CombatRules.damage(guard.combat, {
        fromBehind,
        profile,
        tuning,
        weaponId: "dagger",
        forcePunish: p.counter === true,
        toolOpening,
      });
      if (hit.landed) {
        events.push({ kind: "CombatHit", guardId: guard.id, at, contactAt: at, damage: hit.damage, weaponId: "dagger", punish: fromBehind || p.counter === true || toolOpening || CombatRules.isPunishable(guard.combat), tier: "light", knockbackPx: 0,
          // 무기 빈틈을 단도로 닫은 타격도 닫힘이다(보상 박자는 빈틈 하나에 한 번 — `ToolCashLedger`). 반격 투사체는
          // 제 연출(반격)이 있어 싣지 않는다.
          ...(toolOpening && p.counter !== true ? { toolOpening: true } : {}),
          // 반격 투사체는 반격 단도 개조로만 태어난다 — 그 박힘이 개조의 결과 박자다.
          ...(p.counter === true ? { viaMod: "dagger-counter-throw" as const } : {}) });
      }
      if (hit.defeated) {
        events.push({ kind: "CombatDefeated", guardId: guard.id, at, contactAt: at, weaponId: "dagger" });
      } else {
        events.push({ kind: "DaggerDazed", guardId: guard.id, at, durationMs: daggerCombatStaggerMs(tuning) });
      }
      events.push({
        kind: "NoiseEmitted",
        at,
        floor: guard.floor,
        radius: tuning.combat.engageNoiseRadius,
        source: "combat",
      });
      const resolved = GuardPlanner.settleClimberToFloor(alerted, layout, tuning);
      return {
        ...resolved,
        combat: hit.state,
        staggerMs: hit.defeated ? resolved.staggerMs : Math.max(guard.staggerMs, daggerCombatStaggerMs(tuning)),
      };
    }
    return guard;
  });

  return { guards: changed ? next : [], events, consumed };
}

/**
 * 명시적 계약의 발각 순간 넘어짐과 발버둥 성공 시의 떼어내기.
 * 시드 RNG 만 쓰므로 리플레이가 그대로 재현된다.
 */
function rollPursuerTrip(
  initialRng: RngState,
  guardStep: { guards: GuardState[]; justSpotted: boolean; spottedGuardId: string | null },
  runStep: { shookOffGuardId: string | null },
  layout: MansionLayout,
  tuning: Tuning,
  playerAt: Vec2,
): { guards: GuardState[]; rng: RngState } {
  let guards = guardStep.guards;
  let rng = initialRng;

  if (guardStep.justSpotted && guardStep.spottedGuardId !== null) {
    const roll = nextChance(rng, tuning.run.tripChance);
    rng = roll.state;
    const spottedGuard = guards.find((guard) => guard.id === guardStep.spottedGuardId);
    // 기본 튜닝은 0이며, 왁스 계약처럼 플레이어가 미리 고른 효과만 여기서 전도를 허용한다.
    // 몸이 닿아 시작된 제압 시도는 방향 탈출 → 포박 QTE라는 학습 흐름을 보장한다.
    // 여기서 추격자 넘어짐까지 무작위로 끼면 같은 실수가 어떤 때는 자동 해결되어 판정을 배울 수 없다.
    // 곤봉병 같은 전투 적은 접촉을 공격 선딜로 이어 가야 하므로 일반 경비의 코믹 넘어짐에서 제외한다.
    // 판정 적용만 제한하고 RNG는 위에서 그대로 소비해 시드 리플레이 순서는 바꾸지 않는다.
    if (
      roll.value &&
      spottedGuard !== undefined &&
      GuardStatusRules.canPratfallOnSpotted(spottedGuard) &&
      spottedGuard.contactMs <= 0
    ) {
      guards = guards.map((g) =>
        g.id === guardStep.spottedGuardId
          ? {
              ...GuardPlanner.settleClimberToFloor(g, layout, tuning),
              // 같은 프레임 올가미·단도처럼 더 긴 경직이 이미 성립했다면
              // 발각 슬랩스틱이 그 결과를 짧게 덮지 않는다.
              staggerMs: Math.max(g.staggerMs, tuning.movement.fallStaggerMs),
              contractTripMs: tuning.movement.fallStaggerMs,
            }
          : g,
      );
    }
  }

  if (runStep.shookOffGuardId !== null) {
    guards = guards.map((g) =>
      g.id === runStep.shookOffGuardId
        ? {
            ...GuardPlanner.settleClimberToFloor(g, layout, tuning),
            // 포박 탈출은 무작위 넘어짐이 아니라 예고된 재포획 압박으로 이어진다.
            // 플레이어를 바라보는 충전 링이 끝난 뒤 걷기보다 빠른 전용 추격을 시작한다.
            mode: transitionGuardMode(g.mode, { kind: "recapture-primed" }),
            facing: playerAt.x === g.x ? g.facing : playerAt.x > g.x ? 1 : -1,
            staggerMs: tuning.guard.recaptureWindupMs,
            contactMs: 0,
            // 포박 전에 시작한 공격의 타격·후딜이 예고 뒤 움직임을 다시 묶지 않게 한다.
            // 체력 같은 결과 상태는 CombatRules가 그대로 보존한다.
            combat: g.combat === null ? null : CombatRules.resetAttackCycle(g.combat),
          }
        : g,
    );
  }

  return { guards, rng };
}

/** 소음을 내는 전리품은 주기적으로 파문을 낸다. 반경은 물건 정의가 정한다. */
function carriedNoise(
  carry: CarryState,
  player: PlayerSimState,
  floor: number,
  nowMs: number,
  dtMs: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const period = 700;
  const crossedTick = Math.floor(nowMs / period) !== Math.floor((nowMs + dtMs) / period);
  if (!crossedTick) return events;
  // 옷장 문이 닫힌 동안, 그리고 환기구 안에서는 소리가 밖으로 새지 않는다. 은신 중 반복 소음은
  // 경비를 옷장·환기구 입구에 영원히 묶어 두는 무한 대치를 만든다. 파문만 막고 주기는 시계
  // 그대로라 나오면 바로 이어진다.
  if (player.hideSpotId !== null || player.ventLinkId !== null) return events;

  for (const item of carry.items) {
    const radius = lootDef(item.lootId).carryNoiseRadius;
    if (radius <= 0) continue;
    events.push({
      kind: "NoiseEmitted",
      at: { x: player.x, y: player.y },
      floor,
      radius,
      source: "prop",
    });
  }
  return events;
}

/**
 * 경비 전체 스텝이 공유하는 입력 묶음.
 *
 * 인자 여덟 개를 순서로 넘기면 타입이 같은 값끼리 자리를 바꿔도 컴파일이 통과한다.
 * `GuardPlanner.GuardStepContext` 와 같은 규약으로, 스텝 내내 고정인 값만 여기 담는다.
 */
interface GuardsStepContext {
  /** 이번 스텝의 경비 SSOT. 몸 끌기·와이어·추격 가면까지 반영했다. */
  readonly guards: readonly GuardState[];
  /** 이번 스텝의 장난까지 반영된 장난 상태. */
  readonly mischief: MischiefState;
  /** 경비 페이즈 뒤에서 진행하는 상태 — 스텝 시작 값이 곧 최신값이다(`GuardReactionStart`). */
  readonly world: StepStart<"manor" | "run" | "pickpocket" | "subdue" | "combatDirector" | "pendingNoise">;
  /** **옛 스냅샷**: 스텝 시작의 플레이어. 추격 목표가 이번 스텝에 얼마나 움직였는지 재는 기준점이다. */
  readonly playerAtStart: PlayerSimState;
  /** 이번 스텝의 경매 진행(`WorldSenseAcc.auction`)까지 반영된 경매 상태. */
  readonly auction: AuctionState | null;
  /** **옛 스냅샷**: 예약 동사·반격권 소비 이전의 플레이어 전투. 임박한 플레이어 타격 판정이 본다. */
  readonly playerCombatAtStart: PlayerCombatState;
  /** **옛 스냅샷**: 군중이 쓰기 전 난수 상태. 금고지기 패턴 시드로만 쓴다. */
  readonly rngAtStart: RngState;
  /** 이번 스텝의 경비 판정이 볼 플레이어. 소란 이동까지 반영된 최신 스냅샷이다. */
  readonly player: PlayerSimState;
  readonly input: InputFrame;
  readonly layout: MansionLayout;
  readonly tuning: Tuning;
  readonly dtMs: number;
  /** 이미 전진시킨 이번 스텝의 군중. 시야 차폐로만 참여한다. */
  readonly crowds: readonly CrowdState[];
  /** 이번 스텝에 새로 성립한 플레이어-경비 몸 접촉. */
  readonly bodyContacts: readonly ActorContactRules.GuardBodyContact[];
}

function stepGuards(ctx: GuardsStepContext): {
  bossState: BlackthorneBossState | undefined;
  guards: GuardState[];
  events: SimEvent[];
  captured: boolean;
  capturedBy: string | null;
  struckBy: string | null;
  justSpotted: boolean;
  spottedGuardId: string | null;
  combatDirector: CombatDirectorState;
} {
  const { world, guards: guardsBefore, mischief, player, input, layout, tuning, dtMs, crowds, bodyContacts } = ctx;
  const events: SimEvent[] = [];
  let bossState = world.manor?.exterior?.boss;
  const receptionGuest = (manorGuestAccess(world, player, layout, tuning)
    || auctionGuestAccess(ctx.auction, layout.auction, player))
    && !input.attack && !input.heavy && !input.throw && !input.snuffHold;
  // 경매장의 시선이 무대에 쏠린 동안 무대 뒤 직원은 무대를 보고, 창이 닫히면 진열장을 확인하러 간다.
  const attention = ctx.auction !== null && layout.auction !== undefined
    ? auctionAttention(ctx.auction, layout.auction)
    : null;
  const stageDuty = attention?.staffToStage === true ? "watch" as const : attention?.staffCheck === true ? "check" as const : undefined;
  // 가면을 쓴 채 침착하게 걷는 발소리는 손님의 일상 소리다. 소리는 플레이어에게 그대로
  // 들리지만 경비 자극으로 해석하지 않는다. 달리기나 위장 파기 소음은 이 면제를 받지 않는다.
  const noises = collectNoise(world.pendingNoise.filter((event) => !(
    (mischief.disguiseMs > 0 || receptionGuest)
      && event.kind === "NoiseEmitted"
      && event.source === "footstep"
  )));
  // 봉쇄부터는 저택 전체가 한 단계 조여든다. 경비마다 다시 계산하지 않는다.
  const pressure = RunRules.lockdownPressure(world.run.phase, tuning);
  const propagation = GuardPlanner.propagationFrom(guardsBefore, tuning);
  const bodies = SubdueRules.bodies(guardsBefore);
  // 직전 스텝에 잡고 있었고 아직 손을 안 뗐다면, 이번 스텝에도 붙잡혀 있다.
  const heldInteractionId = input.interact ? world.pickpocket.targetId ?? world.subdue.targetId : null;

  const target = GuardTargetRules.fromPlayers(player, ctx.playerAtStart, tuning);
  const dynamicSightBlockers = mischief.smokeClouds.map(MischiefRules.smokeSightCircle);
  const visionInput: GuardPlanner.GuardVisionInput = {
    target,
    snuffedLamps: mischief.snuffedLamps,
    crowds,
    dynamicSightBlockers,
    lockdownPressure: pressure,
    disguiseActive: mischief.disguiseMs > 0,
    receptionGuest,
  };
  // 시야 표본은 경비마다 한 번: 공격권 선점과 아래 경비 스텝(`visualPerception`)이 같은 결과를 쓴다.
  const perceptions = guardsBefore.map((guard) => GuardPlanner.perceiveVisual(guard, visionInput, layout, tuning));
  const visuallyEligibleGuardIds = guardsBefore
    .filter((_guard, index) => perceptions[index]!.visualExposure > 0)
    .map((guard) => guard.id);
  const directed = CombatDirectorRules.step(
    world.combatDirector,
    guardsBefore,
    target.at,
    tuning,
    dtMs,
    visuallyEligibleGuardIds,
    imminentPlayerStrikeGuardIds(ctx.playerCombatAtStart, ctx.playerAtStart, guardsBefore, tuning),
  );
  events.push(...directed.events);
  const pressureTargets = CombatDirectorRules.pressureTargets(
    guardsBefore,
    directed.state.ownerGuardId,
    target.at,
    tuning,
  );

  const guards: GuardState[] = [];
  let captured = false;
  let capturedBy: string | null = null;
  let struckBy: string | null = null;
  let justSpotted = false;
  let spottedGuardId: string | null = null;

  for (const [guardIndex, guard] of guardsBefore.entries()) {
    const spawn = layout.guards.find((g) => g.id === guard.id);
    if (spawn === undefined) {
      guards.push(guard);
      continue;
    }
    const captureContactAllowed = !(receptionGuest && (guard.susp.tier === "calm" || guard.susp.tier === "curious")) && ActorContactRules.playerGuardCaptureContactAllowedFor(
      player,
      guard,
      layout,
      tuning,
      mischief.snuffedLamps,
      layout.manor?.disguisePassage === true && mischief.disguiseMs > 0
        || auctionGuestAccess(ctx.auction, layout.auction, player),
    );
    const enteredBodyContact = captureContactAllowed
      ? bodyContacts.find((contact) => contact.guardId === guard.id)
      : undefined;
    const guardInput: GuardPlanner.GuardStepInput = {
        target,
        noises,
        activeLures: mischief.mice.map((mouse) => ({
          at: { x: mouse.x, y: mouse.y },
          floor: mouse.floor,
        })),
        // 전파는 프레임당 비율로 나눠 넣는다. 그대로 더하면 순식간에 포화된다.
        propagated: ((propagation.get(guard.id) ?? 0) * dtMs) / 1000,
        snuffedLamps: mischief.snuffedLamps,
        bodies,
        heldInteractionId,
        holdingTarget: world.run.struggle?.guardId === guard.id || guard.contactMs > 0,
        canStartAttack: directed.state.ownerGuardId === guard.id,
        combatPressureX: pressureTargets.get(guard.id),
        crowds,
        dynamicSightBlockers,
        lockdownPressure: pressure,
        disguiseActive: mischief.disguiseMs > 0,
        receptionGuest,
        stageDuty,
        bodyContactAt: enteredBodyContact?.at,
        bodyContactAllowed: captureContactAllowed,
        visualPerception: perceptions[guardIndex],
      };
    const bossStep = layout.manor?.heist && guard.id === "manor-vault-watch"
      ? stepBlackthorneBoss(bossState, guard, guardInput, spawn, layout, tuning, dtMs, world.manor?.exterior?.entered === true, ctx.rngAtStart.seed) : null;
    if (bossStep) bossState = bossStep.state;
    const result = bossStep?.guardStep ?? GuardPlanner.step(guard, guardInput, spawn, layout, tuning, dtMs);
    guards.push(result.guard);
    events.push(...result.events);
    if (result.struckPlayer && struckBy === null) struckBy = result.guard.id;
    if (result.captured && capturedBy === null) {
      captured = true;
      capturedBy = result.guard.id;
    }
    if (guard.susp.tier !== "spotted" && result.guard.susp.tier === "spotted") {
      justSpotted = true;
      spottedGuardId = result.guard.id;
    }
  }

  // 입력은 사용하지 않지만, 향후 상호작용 판정이 경비 스텝에 들어올 자리를 남긴다.
  void input;
  return {
    bossState,
    guards,
    events,
    captured,
    justSpotted,
    spottedGuardId,
    capturedBy,
    struckBy,
    combatDirector: directed.state,
  };
}


function imminentPlayerStrikeGuardIds(
  combat: PlayerCombatState,
  player: PlayerSimState,
  guards: readonly GuardState[],
  tuning: Tuning,
): readonly string[] {
  if (combat.attackMoveId === null || combat.attackContactMs <= 0
    || combat.attackContactMs > CombatDirectorRules.IMMINENT_PLAYER_STRIKE_MS) return [];
  const move = moveOf(combat.attackMoveId);
  const reach = (move.reachPx ?? tuning.combat.attackReachPx) + move.stepInPx + tuning.guard.captureRangePx;
  return guards
    .filter((guard) => guard.combat !== null && !guard.combat.defeated && !guard.knockedOut
      && onSameFloor(player.y, guard.y, tuning.world.floorHeightPx)
      && (guard.x - player.x) * combat.attackFacing >= -tuning.guard.captureRangePx
      && Math.abs(guard.x - player.x) <= reach)
    .map((guard) => guard.id);
}

/** 발소리 한 박자의 자리와 방향. */
interface FootstepBeat {
  readonly at: Vec2;
  readonly facing: Facing;
}

/**
 * 이동 중 주기적으로 발소리를 낸다. 웅크리면 무음이다.
 * 군중 속 가면이 도운 박자는 사건이 아니라 `crowdCoverBeats` 로 돌려준다 — 가면이 스텝 끝까지 남았는지는
 * 조립 단계만 안다.
 */
function stepFootsteps(
  state: Pick<SimState, "footstepMs">,
  player: PlayerSimState,
  loadRatio: number,
  floor: number,
  tuning: Tuning,
  dtMs: number,
  veiled = false,
  crowdMasked = false,
): { footstepMs: number; events: SimEvent[]; crowdCoverBeats: FootstepBeat[] } {
  const grounded = player.onGround && player.climbLinkId === null && player.hideSpotId === null;
  if (!grounded || player.motion === "still" || player.pose === "crouch") {
    return { footstepMs: 0, events: [], crowdCoverBeats: [] };
  }

  const running = player.motion === "run";
  const interval = running ? tuning.noise.runPulseMs : tuning.noise.walkPulseMs;
  const baseRadius = (running ? tuning.noise.runRadius : tuning.noise.walkRadius)
    * (running && veiled ? VEIL_STEP_NOISE_MUL : 1);

  let acc = state.footstepMs + dtMs;
  const events: SimEvent[] = [];
  const crowdCoverBeats: FootstepBeat[] = [];
  while (acc >= interval && interval > 0) {
    acc -= interval;
    events.push({
      kind: "NoiseEmitted",
      at: { x: player.x, y: player.y },
      floor,
      radius: baseRadius + tuning.carry.noisePerLoad * loadRatio,
      source: "footstep",
    });
    // 개조가 이 걸음을 도왔다는 표현 사건. 발소리 박자에 맞춰 나와 매 프레임 울리지 않는다.
    if (running && veiled) events.push({ kind: "WeaponModTriggered", mod: "smoke-veil-step", at: { x: player.x, y: player.y }, facing: player.facing });
    if (running && crowdMasked) crowdCoverBeats.push({ at: { x: player.x, y: player.y }, facing: player.facing });
  }
  return { footstepMs: acc, events, crowdCoverBeats };
}
