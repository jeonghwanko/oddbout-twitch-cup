import type { AttackTier } from "./AttackMoves";
import type { Impulse } from "./CombatImpulse";

/** Internal cooperative campaign tuning; independent of the existing solo replay contract. */
export const COOP_TUNING = Object.freeze({
  stepMs: 50,
  playerSpeed: 150,
  sneakSpeed: 85,
  sprintSpeed: 205,
  carrySpeed: 110,
  playerRadius: 14,
  interactionRadius: 58,
  guardSpeed: 75,
  chaseSpeed: 132,
  guardStairsMemoryMs: 14000,
  guardStairsWindupMs: 900,
  guardStairsArrivalMs: 650,
  visionRadius: 220,
  visionHalfAngle: Math.PI / 3,
  suspicionMs: 1800,
  suspicionRecoveryMs: 2800,
  captureRadius: 25,
  distractionMs: 5000,
  distractionCooldownMs: 6500,
  smokeMs: 4000,
  smokeCooldownMs: 10000,
  smokeRadius: 100,
  rescueMs: 1600,
  selfRescueMs: 5500,
  graceMs: 2500,
  moonRadius: 160,
  moonPassageOpenLift: 0.55,
  stairsCooldownMs: 1000,
  clockPeriodMs: 6000,
  clockWindowMs: 1800,
  clockFreezeMs: 3500,
  gadgetCooldownMs: 6000,
  platformLiftMs: 900,
  jumpMs: 650,
  jumpHeight: 70,
  coopCellSpacing: 34,
  lockdownAlarm: 2,
  disguiseInspectRadius: 55,
});

/**
 * 런 단위로 조정되는 게임플레이 계수의 단일 진실원.
 *
 * 여기 있는 것은 예고장·주인공·메타 강화가 패치할 수 있는 값이다
 * (`CallingCardRules.applyOps` 가 유일한 적용기다).
 *
 * 여기 없는 것: 개체 하나의 성격을 정의하는 수치. 경비의 공격 프로필은
 * `GuardArchetypes`, 플레이어 평타는 `AttackMoves`, 전리품 표는 `LootRules`,
 * 주인공 배수는 `CharacterRules`, 강화 비용 곡선은 `MetaProgressRules`, 예고장
 * 효과량은 `CallingCardRules` 라는 콘텐츠 표가 소유한다. 무브 하나를 바꾸는 일과
 * 런 전체의 난이도를 미는 일은 다른 작업이므로 파일도 나눈다.
 *
 * 콘텐츠 표 밖의 sim 수치 리터럴은 소유자 파일 하나에 명명 상수로만 존재한다 —
 * 같은 값을 두 파일이 각자 적는 것이 금지 대상이다 (예: "같은 층" 판정은
 * `geom.onSameFloor`, 사선 원점은 `LineOfFireRules.originY` 가 유일 소유자다).
 *
 * `test/tuning.test.ts` 가 **아무도 읽지 않는 필드가 새로 생기는 것**을 막는다.
 * 이미 죽어 있던 필드는 그 파일의 `UNWIRED_FIELDS` 에 부류(중복/폐기/충돌/미구현)와
 * 근거가 적혀 있다. 필드를 지우거나 배선하면 그 목록도 함께 정리해야 통과한다.
 */

export interface WorldTuning {
  readonly tilePx: number;
  readonly floorHeightPx: number;
  readonly slabThicknessPx: number;
}

export interface InteractionTuning {
  /** 모든 저택 상호작용 판정과 가까운 행동 안내가 함께 소비하는 사거리 배수. */
  readonly reachMul: number;
}

export interface MovementTuning {
  readonly bodyWidth: number;
  readonly bodyHeightStand: number;
  readonly bodyHeightCrouch: number;
  readonly walkSpeed: number;
  readonly runSpeed: number;
  readonly crouchSpeed: number;
  readonly climbUpSpeed: number;
  readonly climbDownSpeed: number;
  /** 위 끝에서 이 거리(발 기준 world px) 안은 꼭대기 올라서기 구간이다. 렌더 T0~T2 구간(75.8px + 반 컷)을 덮는다. */
  readonly ladderTopMountPx: number;
  /** 꼭대기 올라서기 구간의 오르기 속도 배율. */
  readonly ladderTopMountSpeedMul: number;
  readonly ventSpeed: number;
  /** 레이아웃이 travelMs 를 지정하지 않은 환기구의 통과 시간. 이동과 표시가 같이 읽는다. */
  readonly ventTravelDefaultMs: number;
  readonly gravity: number;
  readonly jumpVelocity: number;
  /** 상승 중 점프 키를 놓았을 때 남기는 속도 비율. 짧은 점프와 긴 점프를 구분한다. */
  readonly jumpReleaseVelocityMul: number;
  readonly maxFallSpeed: number;
  readonly groundAccelPerSec: number;
  readonly airAccelPerSec: number;
  readonly coyoteMs: number;
  readonly jumpBufferMs: number;
  readonly rollWindowMs: number;
  /** 이 타일 수를 넘게 떨어지면 착지 소음이 커진다. */
  readonly softLandingTiles: number;
  /** 이 타일 수를 넘게 떨어지면 자빠진다. */
  readonly pratfallTiles: number;
  readonly fallStaggerMs: number;
}

export interface ParkourTuning {
  readonly departureReachPx: number;
  /** 갈고리가 손을 떠나 수직으로 쉬는 샹들리에에 걸릴 때까지. 그동안 배우는 제자리에 선다. */
  readonly throwMs: number;
  /**
   * 줄을 당겨 샹들리에를 수직(0.5)에서 잡는 쪽(0)으로 끌어오는 시간.
   *
   * 속도가 아니라 시간인 이유: 배우와 샹들리에가 **같은 곡선 위에서** 만나야
   * 줄이 물리적으로 말이 된다. 둘을 각자 속도로 움직이면 도착 시점이 어긋난다.
   */
  readonly reelMs: number;
  readonly swingTravelMs: number;
  readonly releaseBufferMs: number;
  /** 이 진행도 아래에서 누른 Space 는 도약이 아니라 복귀다. */
  readonly returnWindowEnd: number;
  readonly releaseWindowStart: number;
  readonly releaseWindowEnd: number;
  readonly releaseFlightMs: number;
  readonly releaseTimeoutMs: number;
  readonly windowReachPx: number;
  readonly mantleSpeedPxPerSec: number;
  readonly returnSpeedPxPerSec: number;
}

export interface GrappleTuning {
  /** 매달리지 않은 몸(손 높이)에서 고리까지 E 로 줄을 쏠 수 있는 거리. 고리별 reachPx 가 덮는다. */
  readonly reachPx: number;
  /** 매달린 고리에서 다음 고리까지(고리 대 고리) 옮겨 잡을 수 있는 거리. */
  readonly transferReachPx: number;
  /** 옮겨 잡기에서 다음 고리가 이 x 거리 이상 그쪽에 있어야 "그 방향" 이다. */
  readonly transferMinAheadPx: number;
  /** 줄 쏘기·옮겨 잡기 한 번의 즉발 소모. */
  readonly attachCost: number;
  /** 매달려 있는 동안의 초당 소모. 샹들리에 매달리기(stamina.hangDrainPerSec)와 따로 둔다. */
  readonly hangDrainPerSec: number;
  /** 공중에서 조금 일찍 누른 E·비행 중에 누른 다음 E 를 기억하는 시간. */
  readonly inputBufferMs: number;
  /** 고리에서 발까지의 매달림 길이. 쉬는 자세 몸(손→발 약 96px) + 보이는 사슬 약 16px. */
  readonly hangRopeLengthPx: number;
  /** 바닥이 가까운 고리에서 줄일 수 있는 최소 매달림 길이. */
  readonly minRopeLengthPx: number;
  /** 지면에서 쏠 때 고리가 머리보다 이만큼은 위에 있어야 한다. */
  readonly groundMinRisePx: number;
  /** 줄을 쏘고 날아가 잡는 호. 거리 / 속도를 최소·최대 시간으로 자른다. */
  readonly flightSpeedPxPerSec: number;
  readonly flightMinMs: number;
  readonly flightMaxMs: number;
  /** 호의 가운데를 현보다 들어 올리는 높이(거리에 비례, 이 값이 상한). */
  readonly flightLiftPx: number;
  /** 잡는 순간 고리 뒤쪽(진행 반대쪽)으로 기운 각도. 거기서 앞으로 흔들려 나간다. */
  readonly catchAngleRad: number;
  readonly catchMinSpeedPxPerSec: number;
  readonly catchMaxSpeedPxPerSec: number;
  /** 스스로 유지하는 진폭(연직에서). 방향키를 누르면 더 크게 흔든다. */
  readonly swingAmplitudeRad: number;
  readonly swingHeldAmplitudeRad: number;
  /** 진폭 오차(rad)당 접선 가속과 그 상한. 펌프 입력 없이 흔들림을 유지하는 조절기다. */
  readonly swingDriveGainPxPerSec2PerRad: number;
  readonly swingDriveMaxPxPerSec2: number;
  /** 누른 방향으로 몸을 기울이는 일정한 접선 가속(평형점이 약 4° 옮겨 간다). */
  readonly steerAccelPxPerSec2: number;
  readonly maxTangentialSpeedPxPerSec: number;
  /** 벽에 닿으면 놓지 않고 이 비율로 튕겨 돌아온다. */
  readonly wallBounce: number;
  /** Space 로 놓기: 보는 쪽으로 흔들려 나갈 때는 가속·들어 올림을 더한다. */
  readonly releaseBoostSpeedMul: number;
  readonly releaseBoostLiftPxPerSec: number;
  readonly releaseBoostMinForwardPxPerSec: number;
  /** 뒤로 흔들릴 때 놓으면 접선 속도에 작은 뜀만 더한다. */
  readonly releaseHopLiftPxPerSec: number;
  /**
   * `autoDismountFrom` 고리에 옮겨 잡은 뒤 스스로 뛰어내리기까지의 박자(잡는 자세 180ms 를 보여 준다).
   * 옛 리플레이 묶음의 튜닝에는 없다 — 그때는 예전처럼 매달린 채 남는다.
   */
  readonly autoDismountMs?: number;
}

export interface StaminaTuning {
  readonly max: number;
  readonly runDrainPerSec: number;
  readonly climbDrainPerSec: number;
  readonly hangDrainPerSec: number;
  readonly ventDrainPerSec: number;
  readonly jumpCost: number;
  readonly landCost: number;
  readonly idleRegenPerSec: number;
  readonly walkRegenPerSec: number;
  readonly hideRegenPerSec: number;
  readonly regenDelayMs: number;
  /** 스태미나 0일 때 헐떡임 소음 주기와 반경. */
  readonly pantingIntervalMs: number;
  readonly pantingNoiseRadius: number;
}

export interface CarryTuning {
  readonly maxWeight: number;
  readonly overloadRatio: number;
  readonly speedPenalty: number;
  readonly jumpPenalty: number;
  readonly climbPenalty: number;
  readonly noisePerLoad: number;
  readonly staminaDrainPerLoad: number;
  readonly spillIntervalMs: number;
  readonly spillChance: number;
  readonly spillNoiseRadius: number;
}

export interface NoiseTuning {
  readonly walkRadius: number;
  readonly runRadius: number;
  readonly runPulseMs: number;
  readonly walkPulseMs: number;
  readonly softLandingRadius: number;
  readonly hardLandingRadius: number;
  readonly rolledLandingRadius: number;
  readonly whistleRadius: number;
  readonly throwRadius: number;
  readonly gain: number;
  readonly otherFloorFactor: number;
  readonly wallFactor: number;
}

export interface VisionTuning {
  /** 예고장 등 런 단위 효과가 모든 경비 시야에 곱하는 배수. */
  readonly rangeMul: number;
  readonly peripheralRadius: number;
  readonly peripheralExposure: number;
  readonly calmPitchLimitDeg: number;
  readonly alertPitchLimitDeg: number;
  readonly distFalloffExponent: number;
  readonly coneFalloff: number;
  readonly darkLightFactor: number;
  readonly poseStand: number;
  readonly poseCrouch: number;
  readonly poseClimb: number;
  readonly poseHang: number;
  readonly motionStill: number;
  readonly motionWalk: number;
  readonly motionRun: number;
  readonly eyeOffsetY: number;
}

export interface SuspicionTuning {
  /** 모든 경비 의심 미터가 내려갈 수 있는 런 단위 하한. */
  readonly floor: number;
  readonly max: number;
  readonly baseGainPerSec: number;
  readonly calmDecayPerSec: number;
  readonly alertDecayPerSec: number;
  readonly calmDecayDelayMs: number;
  readonly alertDecayDelayMs: number;
  readonly curiousThreshold: number;
  readonly alertThreshold: number;
  readonly spottedThreshold: number;
  readonly curiousFloorLockMs: number;
  readonly alertFloorLockMs: number;
  /** 콘 진입 즉시 부여되는 값. 보이지 않는 누적으로 죽지 않게 하는 공정성 규칙. */
  readonly coneEntryBump: number;
  readonly noiseGain: number;
  /** 은신 진입 순간 이 노출도를 넘었던 경비는 은신처를 열러 온다. */
  readonly sawYouHideExposure: number;
  /** Searching 경비가 같은 층 동료에게 전파하는 양. */
  readonly propagation: number;
}

export interface GuardTuning {
  /** 순찰 반전 예고. 고개가 먼저 돌고 이 시간 뒤에 몸이 움직인다. */
  readonly turnWindupMs: number;
  /** 의심 상태에서 자극 방향으로 다가갈 때의 속도 배수. */
  readonly investigateSpeedMul: number;
  /** 수색 지점 한 곳을 확인하는 데 걸리는 시간. */
  readonly searchDwellMs: number;
  /** 유인구 착탄점에서 고개를 숙여 확인하는 최소 시간. */
  readonly lureInspectMinMs: number;
  /** 유인구를 밟지 않고 바라볼 수 있도록 착탄점 앞에 남기는 수평 간격. */
  readonly lureInspectStandoffPx: number;
  /** 수색 대상으로 삼는 최대 거리. */
  readonly searchRadiusPx: number;
  /** 수색할 지점 개수. */
  readonly searchNodeCount: number;
  /** 목격한 은신처를 확인한 뒤 문 앞을 비워 주는 최소 이탈 거리. */
  readonly hideSearchClearancePx: number;
  /** 경계 순찰(각성 후 복귀) 지속 시간과 속도 배수. */
  readonly alertPatrolMs: number;
  readonly alertPatrolSpeedMul: number;
  /** 목표 x 에 이 거리 안으로 들어오면 도착으로 친다. */
  readonly arriveEpsilonPx: number;
  /** 추격 중 실제 몸 접촉을 시작하는 중심 간 거리. 진행 중인 제압의 해제 거리는 GuardPlanner가 파생한다. */
  readonly captureRangePx: number;
  /** 실제 몸 접촉 뒤 제압이 유지되는 시간. */
  readonly captureHoldMs: number;
  /** 소등 그림자에서 포복 통과를 허용한 비전투 경비가 그 자리를 지키는 최소 시간. */
  readonly darkCrawlPauseMs: number;
  /** 포박 전에 접촉을 끊었을 때 경비가 헛손질하며 추격을 재개하지 못하는 시간. */
  readonly captureEscapeStaggerMs: number;
  /** 포박 QTE 탈출 뒤 재포획 추격을 예고하는 충전 시간과 플레이어 걷기 대비 추격 속도. 걷기는 빠르게 회수하되 질주에는 뒤처져야 한다. */
  readonly recaptureWindupMs: number;
  readonly recaptureWalkSpeedMul: number;
  /** 무력화: 등 뒤 이 거리에서 이 시간 동안 붙어 있으면 재운다. */
  readonly subdueReachPx: number;
  readonly subdueMs: number;
  readonly subdueNoiseRadius: number;
  /** 무력화된 경비가 쓰러져 있는 시간. 한 순찰 주기 뒤 다시 위험이 된다. */
  readonly knockoutMs: number;
  /** 경비반장 소매치기: 등 뒤 사거리·홀드 시간과 교대표 가시화 시간. */
  readonly pickpocketReachPx: number;
  readonly pickpocketMs: number;
  readonly patrolIntelMs: number;
  /** 쓰러진 동료를 이 노출도 이상으로 보면 즉시 경계로 올라간다. */
  readonly bodySeenExposure: number;
  /** 쓰러진 몸 끌기: 시작 거리, 이동 배수, 초당 스태미나 소모, 누운 몸 반폭. */
  readonly bodyDragReachPx: number;
  readonly bodyDragSpeedMul: number;
  readonly bodyDragDrainPerSec: number;
  readonly bodyDragHalfWidthPx: number;
}

export interface CrowdTuning {
  readonly guestWalkSpeed: number;
  readonly drunkWalkSpeed: number;
  /** 손님이 중앙 대화 지점과 자기 자리에서 머무는 시간. */
  readonly guestChatMs: number;
  readonly guestIdleMs: number;
  /** 취객 이동 구간 중 일반 보행 행을 고르는 비율. 이동 속도·판정에는 영향이 없다. */
  readonly drunkSteadyWalkChance: number;
  readonly guestNoiseRadius: number;
  readonly drunkNoiseRadius: number;
  /** 손님을 비집고 지날 때 플레이어 수평 속도 배수. */
  readonly guestPlayerSpeedMul: number;
  readonly bumpReachPx: number;
  readonly bumpResetPx: number;
  readonly reactionMs: number;
  readonly drunkDecisionMinMs: number;
  readonly drunkDecisionMaxMs: number;
  readonly bodyWidth: number;
  readonly bodyHeight: number;
}

export interface LootTuning {
  readonly minGrabMs: number;
  /** 자물쇠 따기 강화 1레벨당 절도 시간 감소 비율. */
  readonly lockpickPerLevel: number;
  /**
   * 이번 런의 자물쇠 따기 강화 레벨.
   *
   * 메타 강화가 여기로 들어온다. 별도 인자로 흘리면 sim·render의 여러 경로가 각자
   * 값을 들고 다니게 되고, 한 곳만 빠뜨려도 화면과 판정이 조용히 어긋난다.
   */
  readonly lockpickLevel: number;
  /** 가치 배수 = valueBase + valuePerSkill × 기술치. 0 에서 0.8배, 100 에서 1.4배. */
  readonly valueBase: number;
  readonly valuePerSkill: number;
  /** 획득 중단 시 남는 진행도 비율. */
  readonly interruptKeepRatio: number;
  /** 상호작용 사거리. */
  readonly reachPx: number;
  /** 절도 소요 시간 배수. 캐릭터 특성이 여기에 들어간다. */
  readonly grabDurationMul: number;
}

export interface SkillTuning {
  readonly max: number;
  readonly start: number;
  readonly silentRoom: number;
  readonly boldSteal: number;
  readonly boldStealRangePx: number;
  readonly evadedSearch: number;
  readonly chainStealMs: number;
  readonly chainSteal: number;
  readonly onCurious: number;
  readonly onAlert: number;
  readonly onSpotted: number;
  readonly onDropped: number;
  /** 사람에게 손을 대는 대가. 괴도의 품격이 깎인다. */
  readonly onSubdue: number;
  /** 사람을 해치지 않고 정보를 훔친 보상. */
  readonly onPickpocket: number;
  /** 미관측 상태 초당 회복. 누군가 각성해 있으면 0. */
  readonly idleRegenPerSec: number;
  /** 이 값 이상이면 예고장 보너스가 붙는다. */
  readonly cleanRunThreshold: number;
  readonly cleanRunBonus: number;
}

export interface RunTuning {
  readonly durationMs: number;
  /** 교대 시점(진행률)과 마지막 압박 구간(남은 시간). */
  readonly shiftChangeAt: number;
  readonly lockdownAt: number;
  readonly lockdownViewMul: number;
  readonly lockdownSpeedMul: number;
  /** 시간 초과 후 출구가 하나씩 닫히는 간격. */
  readonly exitShutterMs: number;
  /** 결과별 수령 비율. */
  readonly timeoutPayout: number;
  readonly bustedPayout: number;
  /** 포박 탈출 기회. 다 쓰면 런이 끝난다. */
  readonly escapeCharges: number;
  readonly strugglePresses: number;
  readonly struggleWindowMs: number;
  /** 발각 직후 유예 기록과 명시적 계약 효과의 추격자 전도 확률. */
  readonly graceMs: number;
  readonly tripChance: number;
  readonly spottedTimePenaltyMs: number;
  /** 무사고 보너스: 경계 이상을 한 번도 만들지 않았을 때. */
  readonly flawlessBonus: number;
}

export interface MischiefTuning {
  /** 휘파람: 내 위치에 소음. 무료·무제한이라 위치를 드러내는 것이 곧 대가다. */
  readonly whistleCooldownMs: number;
  /** 투척: 던진 지점에 소음. 탄수가 제한된다. */
  readonly throwAmmo: number;
  /** 완전히 모았을 때의 속도와 각. 실제 발사는 여기에 세기(0..1)를 곱한다. */
  readonly throwSpeed: number;
  readonly throwArc: number;
  /** 이 시간 동안 누르고 있으면 최대 세기가 된다. */
  readonly throwChargeMs: number;
  /**
   * 톡 눌렀을 때의 세기. 사거리는 세기의 제곱에 비례하므로 0.55 면 약 1/3 이다.
   * 거리를 못 고르는 유인은 "정확히 그만큼 떨어진 자리까지 걸어가라"는 요구가 된다.
   */
  readonly throwMinPower: number;
  /**
   * 투척물 전용 중력. 플레이어 중력(점프 0.42초에 맞춘 값)을 쓰면 안 된다.
   * 그 값으로는 단도가 80px 앞에 떨어져 소음 반경 안에 내가 들어가고,
   * 유인 동사가 "나를 부르는 사이렌"이 된다.
   */
  readonly throwGravity: number;
  /** 단도에 맞은 비장갑 경비가 행동·시야·접촉을 잃는 시간. */
  readonly grazeStaggerMs: number;
  readonly grazeNoiseRadius: number;
  /** 단도가 사람 몸에 맞았다고 볼 좌우 폭. 충돌 바디(12)보다 넉넉해야 한다. */
  readonly grazeReachPx: number;
  /** 맞은 경비가 "저쪽에서 왔다" 고 짐작하는 거리. */
  readonly grazeSuspectPx: number;
  /** 등 끄기: 소요 시간과, 꺼진 등이 만드는 어둠 반경 배수. */
  readonly snuffMs: number;
  readonly snuffDarkMul: number;
  /** 샹들리에 줄 당기기: 일회성 환경 공격의 커밋 시간과 충격 소음. */
  readonly chandelierHoldMs: number;
  readonly chandelierNoiseRadius: number;
  /** 괴도의 눈: 시간 배속과 집중 자원. */
  readonly eyeTimeScale: number;
  readonly eyeMaxMs: number;
  readonly eyeRegenPerSec: number;
  /** 상호작용 사거리(등 끄기 등). */
  readonly reachPx: number;
}

export interface CombatTuning {
  /** 플레이어의 한 런 최대 체력. */
  readonly playerMaxHp: number;
  /**
   * 플레이어가 받는 피해 배수(피해 경감 어시스트, `AssistRules`). 없으면 1 이다 —
   * 기본 튜닝에는 일부러 넣지 않는다. 기존 리플레이 번들의 튜닝에도 없고, 기본값이
   * 바이트 단위로 그대로여야 과거 기록과 비교가 성립한다.
   */
  readonly playerDamageTakenMul?: number;
  /** 방어 수치가 피해를 줄이는 공통 전투 분모. */
  readonly armorK: number;
  /** 회피 구르기: 무적 시간과 재사용 대기. 잠입에서는 닫히는 콘 밑을 빠져나가는 데 쓴다. */
  readonly dodgeMs: number;
  readonly dodgeCooldownMs: number;
  readonly dodgeSpeed: number;
  readonly dodgeStaminaCost: number;
  /** 공격 판정 안에서 정확히 구른 경우 돌려받는 스태미나. 비용보다 작아야 연속 회피가 유한하다. */
  readonly perfectDodgeStaminaRefund: number;
  /** 단검 한 발의 피해. */
  readonly daggerDamage: number;
  /** 무브 표가 `reachPx: null` 로 남긴 타수의 기본 전방 판정. */
  readonly attackReachPx: number;
  /** 공격 후 다음 입력을 기억하는 시간. 표의 가장 긴 회수(강공격)보다 길어야 한다. */
  readonly attackInputBufferMs: number;
  readonly comboWindowMs: number;
  /** 완벽 회피 뒤 해당 공격자에게 전용 반격을 넣을 수 있는 시간. */
  readonly perfectCounterWindowMs: number;
  /**
   * 공격 무게별 충격. 무브 표가 `tier` 로 가리키는 유일한 수치 소유자다.
   *
   * `resetsAttack` 이 평타와 나머지를 가른다. 평타까지 상대의 공격 페이즈를 되감으면
   * `연타 → 영구 경직` 이 성립해 회피·처벌 문법이 통째로 사라진다.
   */
  readonly tierImpulse: Readonly<Record<AttackTier, Impulse>>;
  /** 카트 밀기 반경. 무브 사거리가 아니라 사물 상호작용 거리다. */
  readonly shoveReachPx: number;
  /** 강공격 한 번의 기술 대가. */
  readonly heavyStaminaCost: number;
  /**
   * 대시 공격 한 번의 기술 대가.
   *
   * 0이면 달리며 C를 두드리는 것이 모든 상황의 정답이 된다 — 가장 멀리 날리고 가장
   * 크게 전진하는 무브가 공짜면 회피·평타 문법이 통째로 사라진다. 강공격보다는 싸게
   * 둬서 "무게를 바꾸는 쪽이 더 비싸다" 는 순서는 유지한다.
   */
  readonly dashStaminaCost: number;
  /** 경직 저항: 이 횟수만큼의 평타를 이 창 안에 맞으면 그만큼 경직을 흘린다. */
  readonly poiseHits: number;
  readonly poiseWindowMs: number;
  readonly poiseBreakMs: number;
  /** 피격 직후 플레이어의 무적. 다수전에서 한 프레임에 두 번 맞지 않게 한다. */
  readonly playerHitInvulnMs: number;
  /** 한 공격이 끝난 뒤 다음 경비가 선딜을 시작하기까지의 다수전 호흡. */
  readonly attackHandoffMs: number;
  /** 공격권을 기다리는 경비가 플레이어 중심에 포개지지 않도록 잡는 첫 거리와 같은 편 간격. */
  readonly pressureDistancePx: number;
  readonly pressureSpacingPx: number;
  /** 원거리 대기열은 근접 전열 뒤에서 사선을 유지한다. */
  readonly rangedPressureDistancePx: number;
  readonly rangedPressureSpacingPx: number;
  /** 적 공격에 맞았을 때 실제로 밀리는 거리와 짧은 자세 붕괴 시간. */
  readonly playerHitKnockbackPx: number;
  readonly playerHitStunMs: number;
  /** 후딜·등 뒤 제압의 피해. 한 방에 정리된다. */
  readonly punishDamage: number;
  /** 교전이 내는 소음. 근처 경비가 전부 모인다. */
  readonly engageNoiseRadius: number;
  /** 교전당 기술치 대가. 전리품 가치 배수가 그만큼 내려간다. */
  readonly skillPerEngagement: number;
}

export interface Tuning {
  readonly interaction: InteractionTuning;
  readonly combat: CombatTuning;
  readonly mischief: MischiefTuning;
  readonly world: WorldTuning;
  readonly loot: LootTuning;
  readonly skill: SkillTuning;
  readonly run: RunTuning;
  readonly guard: GuardTuning;
  readonly crowd: CrowdTuning;
  readonly movement: MovementTuning;
  readonly parkour: ParkourTuning;
  readonly grapple: GrappleTuning;
  readonly stamina: StaminaTuning;
  readonly carry: CarryTuning;
  readonly noise: NoiseTuning;
  readonly vision: VisionTuning;
  readonly suspicion: SuspicionTuning;
}

/**
 * 1타일 = 16px, 캐릭터 2타일, 층 높이 180px(내부 해상도 360의 절반).
 * 한 화면에 두 개 층이 보이고 위층 경비가 보이는 것이 의도된 긴장 요소다.
 */
export const DEFAULT_TUNING: Tuning = Object.freeze({
  interaction: Object.freeze({
    // 해상도·카메라 줌과 무관하게 기존 판정보다 20% 먼저 가까운 행동을 연다.
    reachMul: 1.2,
  }),
  world: Object.freeze({
    tilePx: 16,
    floorHeightPx: 180,
    slabThicknessPx: 12,
  }),
  combat: Object.freeze({
    playerMaxHp: 6,
    armorK: 100,
    // 마지막 약 0.27초의 시청각 신호를 보고도 타격 스텝까지 무적이 남는다.
    dodgeMs: 300,
    dodgeCooldownMs: 600,
    dodgeSpeed: 420,
    dodgeStaminaCost: 15,
    perfectDodgeStaminaRefund: 10,
    daggerDamage: 1,
    // 접촉 키프레임까지 서로 움직이는 횡스크롤 전투에서 46px는 원화가 닿아 보여도
    // 헛치는 구간이 넓었다. 92px로도 "안 맞는다"는 보고가 남아 1.2배인 110px로 넓힌다.
    attackReachPx: 110,
    // 강공격 회수 720ms · 대시 560ms 보다 길다. 짧으면 회수 중에 누른 V 가 쿨다운이
    // 끝나기 전에 조용히 버려져 "입력을 먹었다" 가 된다.
    attackInputBufferMs: 740,
    comboWindowMs: 820,
    // 곤봉병의 전체 후딜과 맞춰 깨진 방패 링이 곧 반격 가능 시간을 뜻하게 한다.
    perfectCounterWindowMs: 900,
    tierImpulse: Object.freeze({
      // 평타는 공간을 조금만 만든다. 1·2타가 같은 8px 였을 때는 두 몸이 붙은 채 눌리기만 해 1타와 2타가
      // 복사본으로 읽혔다(2026-09-27 C-C-C 캡처 실측) — 잽 12 → 스트레이트 22 로 박자마다 한 단 더 민다.
      light: Object.freeze({
        tier: "light" as const,
        knockbackPx: 12,
        chainBeatKnockbackPx: Object.freeze({ 1: 12, 2: 22 }),
        staggerMs: 150,
        chainStaggerMs: 0,
        wallStaggerMs: 220,
        resetsAttack: false,
      }),
      heavy: Object.freeze({
        tier: "heavy" as const,
        knockbackPx: 44,
        staggerMs: 330,
        chainStaggerMs: 290,
        wallStaggerMs: 960,
        resetsAttack: true,
      }),
      dash: Object.freeze({
        tier: "dash" as const,
        knockbackPx: 68,
        staggerMs: 390,
        chainStaggerMs: 340,
        wallStaggerMs: 1060,
        resetsAttack: true,
      }),
      // 피니셔 58 → 96(2026-09-27): 렌더가 반동 38px 로 sim 위치를 지나쳤다가 24px 되돌아오며 무게를 잃었다.
      // 이제 날아가는 거리는 sim 넉백만이 소유한다(렌더 반동 4px). 벽·아레나는 `displaceHorizontalChain`·
      // `confineBlackthorneBossKnockback` 이 자른다.
      finisher: Object.freeze({
        tier: "finisher" as const,
        knockbackPx: 96,
        staggerMs: 480,
        chainStaggerMs: 400,
        wallStaggerMs: 900,
        resetsAttack: true,
      }),
    }),
    shoveReachPx: 52,
    heavyStaminaCost: 14,
    dashStaminaCost: 10,
    poiseHits: 3,
    poiseWindowMs: 1400,
    poiseBreakMs: 900,
    playerHitInvulnMs: 650,
    attackHandoffMs: 240,
    pressureDistancePx: 48,
    pressureSpacingPx: 22,
    rangedPressureDistancePx: 260,
    rangedPressureSpacingPx: 34,
    playerHitKnockbackPx: 28,
    playerHitStunMs: 260,
    punishDamage: 3,
    engageNoiseRadius: 320,
    skillPerEngagement: -15,
  }),
  mischief: Object.freeze({
    whistleCooldownMs: 700,
    throwAmmo: 3,
    // 유인구의 최대 탄도와 단도의 자동 조준 사거리. 화면 폭 안에서 대상이 읽힌다.
    throwSpeed: 470,
    throwArc: -270,
    throwChargeMs: 600,
    throwMinPower: 0.55,
    grazeStaggerMs: 5_000,
    grazeReachPx: 20,
    grazeNoiseRadius: 90,
    grazeSuspectPx: 130,
    throwGravity: 700,
    snuffMs: 500,
    snuffDarkMul: 1,
    chandelierHoldMs: 650,
    chandelierNoiseRadius: 420,
    eyeTimeScale: 0.35,
    eyeMaxMs: 3000,
    eyeRegenPerSec: 1000,
    reachPx: 40,
  }),
  loot: Object.freeze({
    minGrabMs: 200,
    lockpickPerLevel: 0.08,
    lockpickLevel: 0,
    valueBase: 0.8,
    valuePerSkill: 0.006,
    interruptKeepRatio: 0.5,
    reachPx: 30,
    grabDurationMul: 1,
  }),
  skill: Object.freeze({
    max: 100,
    start: 40,
    silentRoom: 6,
    boldSteal: 10,
    boldStealRangePx: 120,
    evadedSearch: 15,
    chainStealMs: 5000,
    chainSteal: 3,
    onCurious: -4,
    onAlert: -10,
    onSpotted: -25,
    onDropped: -5,
    onSubdue: -12,
    onPickpocket: 12,
    idleRegenPerSec: 6,
    cleanRunThreshold: 70,
    cleanRunBonus: 1.25,
  }),
  run: Object.freeze({
    durationMs: 180000,
    shiftChangeAt: 0.6,
    lockdownAt: 45000,
    lockdownViewMul: 1.15,
    lockdownSpeedMul: 1.1,
    exitShutterMs: 15000,
    timeoutPayout: 0.5,
    bustedPayout: 0.35,
    escapeCharges: 2,
    strugglePresses: 14,
    struggleWindowMs: 2500,
    graceMs: 3000,
    tripChance: 0,
    spottedTimePenaltyMs: 20000,
    flawlessBonus: 1.2,
  }),
  guard: Object.freeze({
    turnWindupMs: 500,
    investigateSpeedMul: 0.8,
    searchDwellMs: 2000,
    lureInspectMinMs: 5000,
    lureInspectStandoffPx: 18,
    searchRadiusPx: 250,
    searchNodeCount: 3,
    hideSearchClearancePx: 120,
    alertPatrolMs: 20000,
    alertPatrolSpeedMul: 1.15,
    arriveEpsilonPx: 6,
    // 두 캐릭터의 실루엣이 겹치기 전에 붙잡기 판정이 시작되는 한 보폭 거리다.
    captureRangePx: 26,
    captureHoldMs: 600,
    darkCrawlPauseMs: 1200,
    captureEscapeStaggerMs: 420,
    recaptureWindupMs: 700,
    // 걷기보다는 빠르되 만재 질주보다 느려야, 반대 방향 질주가 실제 탈출 해법으로 남는다.
    recaptureWalkSpeedMul: 1.2,
    // 넓어진 몸 충돌 바깥에서도 등 뒤 상호작용이 성립하도록 별도 여유 폭을 둔다.
    subdueReachPx: 34,
    subdueMs: 900,
    subdueNoiseRadius: 70,
    knockoutMs: 20000,
    pickpocketReachPx: 38,
    pickpocketMs: 1200,
    patrolIntelMs: 15000,
    bodySeenExposure: 0.25,
    bodyDragReachPx: 28,
    bodyDragSpeedMul: 0.38,
    bodyDragDrainPerSec: 12,
    bodyDragHalfWidthPx: 18,
  }),
  crowd: Object.freeze({
    guestWalkSpeed: 34,
    drunkWalkSpeed: 26,
    guestChatMs: 2160,
    guestIdleMs: 720,
    drunkSteadyWalkChance: 0.35,
    guestNoiseRadius: 140,
    drunkNoiseRadius: 220,
    guestPlayerSpeedMul: 0.6,
    bumpReachPx: 18,
    bumpResetPx: 30,
    reactionMs: 720,
    drunkDecisionMinMs: 600,
    drunkDecisionMaxMs: 1600,
    bodyWidth: 18,
    bodyHeight: 36,
  }),
  movement: Object.freeze({
    bodyWidth: 12,
    bodyHeightStand: 32,
    bodyHeightCrouch: 20,
    walkSpeed: 145,
    runSpeed: 340,
    crouchSpeed: 55,
    // 사다리 속도(2026-09-26 사용자: 160/220 은 너무 빠르다 → 절반). 끊김은 속도가 아니라 렌더가 고쳤다 — 몸은 sim 을
    // 연속으로 따라가고, 가로대 한 주기(44.9 world px)를 6컷(C0·CA·C1·C2·CB·C3)이 나눈다. 80px/s 에서 컷당 65~122ms
    // (평균 94ms, 초당 약 10.7컷 — 걷기 8~12fps 체감), 110px/s 내리기는 평균 68ms. 옛 80px/s 의 끊김은 4컷 + 컷마다
    // 240ms 멈췄다 19px 튀는 가로대 고정이었다. 근거: handsome-heist-runtime.json playback.climb.rung.cell_ms_*.
    // 경비도 같은 값을 쓴다(옛 80/140 에 가깝다).
    climbUpSpeed: 80,
    climbDownSpeed: 110,
    // 2026-09-27 사용자: 꼭대기에서 모서리 잡고 올라서는 동작이 느리다(80px/s 로 약 1초) → 2배. 올라서기 컷(T0~T2)은
    // 모서리에 고정해 그리고 sim 거리로 넘기므로 이 구간의 sim 속도가 곧 재생 속도다.
    ladderTopMountPx: 80,
    ladderTopMountSpeedMul: 2,
    ventSpeed: 60,
    ventTravelDefaultMs: 2000,
    gravity: 1400,
    // 기존 330px/s 점프보다 정점 높이를 정확히 2배로 만든다.
    // 중력은 유지하므로 h=v²/(2g)에 따라 이륙 속도만 √2배한다(정점 약 78px/4.9타일).
    jumpVelocity: 330 * Math.SQRT2,
    jumpReleaseVelocityMul: 0.5,
    maxFallSpeed: 900,
    // 0→질주는 약 0.15초. 입력 즉시 최고속도였던 이전 값보다 체중 이동이 보이되
    // 횡스크롤 잠입의 짧은 회피 입력은 둔해지지 않는 선을 유지한다.
    groundAccelPerSec: 2200,
    airAccelPerSec: 1320,
    coyoteMs: 90,
    jumpBufferMs: 120,
    rollWindowMs: 150,
    softLandingTiles: 3,
    pratfallTiles: 6,
    fallStaggerMs: 1000,
  }),
  parkour: Object.freeze({
    departureReachPx: 26,
    throwMs: 380,
    reelMs: 360,
    swingTravelMs: 900,
    releaseBufferMs: 300,
    returnWindowEnd: 0.5,
    releaseWindowStart: 0.6,
    releaseWindowEnd: 1,
    releaseFlightMs: 600,
    releaseTimeoutMs: 1100,
    windowReachPx: 30,
    mantleSpeedPxPerSec: 170,
    returnSpeedPxPerSec: 180,
  }),
  // 고리 사슬(2026-09-25 개편): E 한 번으로 쏘고·날아가·잡는다. 매달리면 스스로 흔들리고,
  // 방향 + E 가 다음 고리로 옮겨 잡는 보장된 호다. 타이밍을 맞출 필요가 없는 것이 목표다.
  grapple: Object.freeze({
    // 2026-09-27: 230 에서 넓혔다. 발코니 어디에 서 있든 첫 고리가 한 번에 잡혀야 한다.
    reachPx: 260,
    // 저택 고리 간격이 120~200px 다. 전투 시험장의 세 고리도 200px 간격으로 잇는다.
    transferReachPx: 250,
    transferMinAheadPx: 24,
    attachCost: 5,
    hangDrainPerSec: 3,
    inputBufferMs: 150,
    hangRopeLengthPx: 112,
    minRopeLengthPx: 64,
    groundMinRisePx: 24,
    // 200px 옮겨 잡기가 약 280ms. 짧은 쏘기·옮겨 잡기도 250ms 는 날아 보이게 한다.
    flightSpeedPxPerSec: 720,
    flightMinMs: 250,
    flightMaxMs: 320,
    flightLiftPx: 30,
    catchAngleRad: 0.3,
    catchMinSpeedPxPerSec: 150,
    catchMaxSpeedPxPerSec: 300,
    // 매달림 112px 에서 0.6rad 는 좌우 약 63px, 주기 약 1.8초.
    swingAmplitudeRad: 0.6,
    swingHeldAmplitudeRad: 0.85,
    swingDriveGainPxPerSec2PerRad: 1400,
    swingDriveMaxPxPerSec2: 520,
    steerAccelPxPerSec2: 100,
    maxTangentialSpeedPxPerSec: 390,
    wallBounce: 0.35,
    releaseBoostSpeedMul: 1.15,
    releaseBoostLiftPxPerSec: 250,
    releaseBoostMinForwardPxPerSec: 210,
    releaseHopLiftPxPerSec: 120,
    autoDismountMs: 220,
  }),
  stamina: Object.freeze({
    max: 100,
    runDrainPerSec: 15.7,
    climbDrainPerSec: 6,
    hangDrainPerSec: 9,
    ventDrainPerSec: 25,
    jumpCost: 4,
    landCost: 5,
    idleRegenPerSec: 14,
    walkRegenPerSec: 6,
    hideRegenPerSec: 24,
    regenDelayMs: 800,
    pantingIntervalMs: 1500,
    pantingNoiseRadius: 90,
  }),
  carry: Object.freeze({
    maxWeight: 100,
    overloadRatio: 1.4,
    speedPenalty: 0.35,
    jumpPenalty: 0.3,
    climbPenalty: 0.45,
    noisePerLoad: 40,
    staminaDrainPerLoad: 0.9,
    spillIntervalMs: 6000,
    spillChance: 0.25,
    spillNoiseRadius: 220,
  }),
  noise: Object.freeze({
    walkRadius: 48,
    runRadius: 220,
    runPulseMs: 191,
    walkPulseMs: 377,
    softLandingRadius: 90,
    hardLandingRadius: 200,
    rolledLandingRadius: 60,
    whistleRadius: 130,
    throwRadius: 260,
    gain: 35,
    otherFloorFactor: 0.4,
    wallFactor: 0.6,
  }),
  vision: Object.freeze({
    rangeMul: 1,
    peripheralRadius: 40,
    peripheralExposure: 0.35,
    calmPitchLimitDeg: 8,
    alertPitchLimitDeg: 35,
    distFalloffExponent: 1.5,
    coneFalloff: 0.5,
    darkLightFactor: 0.35,
    poseStand: 1,
    poseCrouch: 0.6,
    poseClimb: 1,
    poseHang: 0.5,
    motionStill: 0.8,
    motionWalk: 1,
    motionRun: 1.3,
    // 발바닥 기준 눈높이. 캐릭터 몸통 중심과 같은 높이라 같은 층에 선 상대는
    // 콘 축 위에 놓인다. 발치에 두면 콘이 바닥 슬래브에 박혀 얇은 조각으로만 보인다.
    eyeOffsetY: -16,
  }),
  suspicion: Object.freeze({
    floor: 0,
    max: 100,
    baseGainPerSec: 55,
    calmDecayPerSec: 12,
    alertDecayPerSec: 6,
    calmDecayDelayMs: 1200,
    alertDecayDelayMs: 3000,
    curiousThreshold: 25,
    alertThreshold: 60,
    spottedThreshold: 100,
    curiousFloorLockMs: 4000,
    alertFloorLockMs: 8000,
    coneEntryBump: 8,
    noiseGain: 35,
    sawYouHideExposure: 0.3,
    propagation: 20,
  }),
});

/**
 * 튜닝 값들 사이에 반드시 성립해야 하는 관계(error-reduction-backlog #2 의 첫 조각).
 * 빈 배열이면 정상이다. 기본 튜닝·교습 튜닝·어시스트를 입힌 튜닝이 모두 통과해야 한다 —
 * 변환이 관계를 깨는 것이 가장 잡기 어려운 형태다.
 */
export function tuningViolations(t: Tuning): readonly string[] {
  const s = t.suspicion;
  const violations: string[] = [];
  if (!(s.floor <= s.curiousThreshold && s.curiousThreshold < s.alertThreshold
    && s.alertThreshold < s.spottedThreshold && s.spottedThreshold <= s.max)) {
    violations.push("suspicion-threshold-order");
  }
  if (!(s.baseGainPerSec > 0) || !(s.noiseGain >= 0) || !(s.coneEntryBump >= 0)) violations.push("suspicion-gain-sign");
  if (!(t.guard.captureHoldMs > 0)) violations.push("capture-hold-positive");
  if (!(t.run.struggleWindowMs > 0)) violations.push("struggle-window-positive");
  if (!(t.run.durationMs > 0) || !(t.run.lockdownAt >= 0) || !(t.run.exitShutterMs >= 0)) violations.push("run-timer-sign");
  const damageMul = t.combat.playerDamageTakenMul ?? 1;
  if (!(damageMul > 0 && damageMul <= 1)) violations.push("player-damage-taken-range");
  if (!(t.carry.maxWeight * t.carry.overloadRatio >= t.carry.maxWeight)) violations.push("carry-overload-below-max");
  return violations;
}

/** 고정 시뮬레이션 스텝. 60Hz. 프레임레이트 독립과 시드 재현성의 근거. */
export const SIM_STEP_MS = 1000 / 60;

/** 한 프레임에 소화할 최대 캐치업 스텝 수. 탭 복귀 시 폭주를 막는다. */
export const MAX_CATCHUP_STEPS = 5;

/**
 * 내부 렌더 해상도. Scale.FIT 으로 확대된다.
 *
 * 스파인 캐릭터를 쓰기 위해 640×360 에서 올렸다. 월드 단위는 그대로 두고
 * 카메라 줌으로만 프레이밍을 잡는다 — sim 과 레벨 데이터를 건드리지 않으면서
 * 캐릭터가 화면에서 차지하는 픽셀 수만 늘리는 가장 싼 방법이다.
 */
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

/**
 * 카메라 줌. 보이는 월드 영역은 VIEW / CAMERA_ZOOM 이다.
 *
 * 1.61은 기존 1.4에서 정확히 15% 당긴 값이다. 795×447 월드 영역과 2.48개 층을 보여 주며,
 * 캐릭터·상호작용물은 화면에서 15% 커진다. 그래도 가로 화각은 최대 경비 시야와 투척 사거리보다
 * 넓어 화면 밖의 판정에 당하지 않는 잠입 공정성을 유지한다.
 *
 * 배경 플레이트는 914px라 화면보다 15% 넓다. TileSprite 이음매가 화면 가장자리 밖에 머물러
 * 확대 후에도 배경 연결부가 눈에 들어오지 않는다.
 * 줌 3(427×240)일 때는 둘 다 깨져 있었다 — 층은 1.3개만 보이고,
 * 화면 밖에서 나를 보고 있는 경비를 플레이어가 알 방법이 없었다.
 */
export const CAMERA_ZOOM = 1.61;

/** 카메라가 실제로 보여주는 월드 크기. 스크롤 계산이 이 값을 쓴다. */
export const VISIBLE_WORLD_WIDTH = VIEW_WIDTH / CAMERA_ZOOM;
export const VISIBLE_WORLD_HEIGHT = VIEW_HEIGHT / CAMERA_ZOOM;

/** Blackthorne exploration is untimed until the first recovery. */
export const BLACKTHORNE_HEIST_FLOOR_HEIGHT_PX = 210;
export const MANOR_TUNING = Object.freeze({ exhibitionTravelMs: 4200, exhibitionDockNoiseRadiusPx: 100, escapeDurationMs: 90000, previewReachPx: 180 });

/** Comic props: strong shove, readable bounce and nonlethal stumble. */
export const PROP_PHYSICS_TUNING = Object.freeze({
  gravity: 0.0024, shoveVelocity: 7.5, controlledShoveVelocity: 3.4, airFriction: 0.018, restitution: 0.42,
  impactMs: 420, impactSpeed: 1.4, noiseRadius: 540,
  guardStaggerMs: 2200, guardPushPx: 48,
  cartFocusGapPx: 32, cartContactGapPx: 0.5, cartFloorTolerancePx: 4, cartWalkVelocity: 1.1,
});
