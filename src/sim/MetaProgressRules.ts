/**
 * 메타 진행. 골드는 도구와 용량을, 명성은 기술과 패시브를 산다.
 *
 * 화폐를 둘로 나눈 이유: 탐욕 플레이와 정교한 플레이가 서로 다른 축을 올려야
 * 둘 다 정당한 플레이 스타일이 된다. 하나뿐이면 최적 전략이 하나로 수렴한다.
 */

import type { PatchOp } from "./CallingCardRules";
import { CALLING_CARD_IDS, type CallingCardId } from "./CallingCardIds";
import type { TacticId } from "./TacticRules";
import { TACTIC_IDS } from "./TacticRules";
import type { ToolLoadout } from "./ToolRules";
import { DEFAULT_TOOL_LOADOUT } from "./ToolRules";
import type { CharacterId } from "./CharacterRules";
import type { FirstOutfitState } from "./FirstOutfitRules";
import { LEGACY_FIRST_OUTFIT_STATE, NEW_FIRST_OUTFIT_STATE } from "./FirstOutfitRules";
import type { CampaignMemory } from "./CampaignProgressRules";
import type { FollowLessonId, FollowLessonMemory, FollowLessonProgress } from "./FollowLessonRules";
import type { WeaponModState } from "./WeaponModRules";
import { EMPTY_WEAPON_MODS } from "./WeaponModRules";

export type Currency = "gold" | "fame";

interface UpgradeNodeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currency: Currency;
  readonly maxLevel: number;
  readonly baseCost: number;
  readonly costGrowth: number;
}

const upgradeDefinitions = [
  { id: "carry", name: "넉넉한 자루", description: "적재 한계 +20", currency: "gold", maxLevel: 5, baseCost: 120, costGrowth: 1.6 },
  { id: "stamina", name: "긴 호흡", description: "체력 +15", currency: "gold", maxLevel: 5, baseCost: 100, costGrowth: 1.6 },
  { id: "lockpick", name: "빠른 손끝", description: "절도 시간 −8%", currency: "gold", maxLevel: 5, baseCost: 150, costGrowth: 1.7 },
  { id: "skillMax", name: "괴도의 이름", description: "기술 최대치 +10", currency: "fame", maxLevel: 5, baseCost: 60, costGrowth: 1.5 },
  { id: "escape", name: "미꾸라지", description: "포박 탈출 기회 +1", currency: "fame", maxLevel: 2, baseCost: 120, costGrowth: 2 },
  { id: "quiet", name: "고양이 걸음", description: "발소리 반경 −15%", currency: "fame", maxLevel: 3, baseCost: 90, costGrowth: 1.6 },
] as const satisfies readonly UpgradeNodeDefinition[];

export type UpgradeId = (typeof upgradeDefinitions)[number]["id"];
export type UpgradeNode = Omit<UpgradeNodeDefinition, "id"> & { readonly id: UpgradeId };

export const UPGRADES: readonly UpgradeNode[] = Object.freeze(
  upgradeDefinitions.map((node) => Object.freeze({ ...node })),
);

export const UPGRADE_TABLE: Readonly<Record<UpgradeId, UpgradeNode>> = Object.freeze(
  Object.fromEntries(UPGRADES.map((node) => [node.id, node])) as Record<UpgradeId, UpgradeNode>,
);

export type UpgradeLevels = Readonly<Partial<Record<UpgradeId, number>>>;

export type MasteryDiscoveryId =
  | "escape-knot"
  | "shadow-slip"
  | "velvet-fall"
  | "stolen-minute"
  | "servant-passages"
  | "clock-thief";

export interface MasteryDiscovery {
  readonly id: MasteryDiscoveryId;
  readonly name: string;
  readonly trigger: "busted" | "timeout";
  readonly requires?: MasteryDiscoveryId;
  readonly description: string;
  readonly nextRunEffect: string;
  readonly ops: readonly PatchOp[];
}

/** 실패 원인을 다음 런의 새 능력으로 뒤집는 영구 숙련. 화폐나 구매 단계를 거치지 않는다. */
export const MASTERY_DISCOVERIES: readonly MasteryDiscovery[] = Object.freeze([
  Object.freeze({
    id: "escape-knot",
    name: "소매 속 탈출 매듭",
    trigger: "busted",
    description: "붙잡힌 손목의 각도를 읽었다",
    nextRunEffect: "포박 탈출 기회 +1",
    ops: Object.freeze([{ op: "add", path: "run.escapeCharges", v: 1 }] as const),
  }),
  Object.freeze({
    id: "shadow-slip",
    name: "그림자 미끄럼",
    trigger: "busted",
    requires: "escape-knot",
    description: "붙잡히기 직전 하인 통로의 바람을 기억했다",
    nextRunEffect: "환기구 속도 +35% · 발소리 반경 −15%",
    ops: Object.freeze([
      { op: "mul", path: "movement.ventSpeed", v: 1.35 },
      { op: "mul", path: "noise.footstepRadius", v: 0.85 },
    ] as const),
  }),
  Object.freeze({
    id: "velvet-fall",
    name: "벨벳 낙법",
    trigger: "busted",
    requires: "shadow-slip",
    description: "세 번째 포박은 넘어지는 방향까지 수법이 되었다",
    nextRunEffect: "포박 탈출 기회 +1 · 체력 +20",
    ops: Object.freeze([
      { op: "add", path: "run.escapeCharges", v: 1 },
      { op: "add", path: "stamina.max", v: 20 },
    ] as const),
  }),
  Object.freeze({
    id: "stolen-minute",
    name: "훔친 15초",
    trigger: "timeout",
    description: "경비 교대의 비는 초침을 찾아냈다",
    nextRunEffect: "모든 실전 제한시간 +15초",
    ops: Object.freeze([{ op: "add", path: "run.durationMs", v: 15_000 }] as const),
  }),
  Object.freeze({
    id: "servant-passages",
    name: "하인 통로 지도",
    trigger: "timeout",
    requires: "stolen-minute",
    description: "늦은 귀환에서 가장 짧은 훔침 동선을 찾아냈다",
    nextRunEffect: "절도 숙련 +2 · 전 이동 속도 +8%",
    ops: Object.freeze([
      { op: "add", path: "loot.lockpickLevel", v: 2 },
      { op: "mul", path: "movement.speedMul", v: 1.08 },
    ] as const),
  }),
  Object.freeze({
    id: "clock-thief",
    name: "시계 도둑",
    trigger: "timeout",
    requires: "servant-passages",
    description: "마침내 저택의 교대 시간 자체를 훔쳤다",
    nextRunEffect: "제한시간 +30초 · 기술 획득 +25%",
    ops: Object.freeze([
      { op: "add", path: "run.durationMs", v: 30_000 },
      { op: "mul", path: "skill.gainMul", v: 1.25 },
    ] as const),
  }),
]);

export const TUTORIAL_ONBOARDING_VERSION = 1;

export const ONBOARDING_VERB_IDS = [
  "move",
  "jump",
  "run",
  "crouch",
  "interact",
  "hide",
  "whistle",
  "thief-eye",
  "snuff",
  "vent",
  "drop",
  "lure",
  "dodge",
  "struggle",
  "escape",
] as const;

export type OnboardingVerbId = (typeof ONBOARDING_VERB_IDS)[number];

export interface TutorialOnboardingState {
  /** Explicitly launched an official calling-card job; Blackthorne runs are not this evidence. */
  readonly callingCardBriefed?: boolean;
  readonly tutorialVersion: number;
  /** 첫 45초 오프닝 잠입을 끝내 마을을 열었는가. 전체 훈련 완료와 같은 뜻이 아니다. */
  readonly openingCompleted: boolean;
  /** 연습 회랑의 8장 기초 훈련을 끝냈는가. */
  readonly trainingCompleted: boolean;
  /** 전체 훈련 직후 마을의 첫 동행 소개를 끝냈는가. */
  readonly villageIntroCompleted: boolean;
  /** 실제 입력과 sim 사건으로 한 번 이상 증명한 핵심 동사. */
  readonly learnedVerbs: readonly OnboardingVerbId[];
  /** 벨의 따라하기 레슨별 보조 단계 기억. 없던 저장은 빈 기억이다(`FollowLessonRules`). */
  readonly lessons?: FollowLessonMemory;
  /** 브라우저를 닫아도 마지막 장부터 재개하기 위한 ID. */
  readonly checkpointId: string | null;
  /** Esc로 나간 뒤 다음 저택 입장에서 다시 강제하지 않는다. T로는 언제든 재개 가능하다. */
  readonly dismissed: boolean;
}

export interface MetaState {
  /** Authored female and photo look share a CharacterId but have separate opening/restore paths. */
  readonly femaleLook?: "authored" | "personal";
  /** New female opening. Absent in existing saves, which keep their current progress. */
  readonly femalePrologue?: import("./FemalePrologueRules").FemalePrologueState;
  readonly blackthorneStory?: import("./BlackthorneStoryRules").BlackthorneStoryMemory;
  readonly grievesStory?: import("./GrievesStoryRules").GrievesStoryMemory;
  readonly manorMemory?: import("./ManorMemoryRules").ManorMemory;
  /** Fixed first manor recovery; independent of calling-card mastery. */
  readonly blackthorneCompleted?: boolean;
  /** 이세계 수신기의 강림과 건너온 물건(`OtherworldItemRules`). 없던 저장은 아직 강림 전이다. */
  readonly otherworld?: import("./OtherworldItemRules").OtherworldState;
  /** 블랙손 문전박대와 세 가지 준비(`BlackthorneGuestListRules`). 없던 저장은 아직 문을 두드리지 않았다. */
  readonly blackthorneGuestList?: import("./BlackthorneGuestListRules").BlackthorneGuestListState;
  /** 시계점 앞 오토 격파와 반납 견본 최초 취득(`OttoCampaignRules`). 없던 저장은 아직 오토를 쓰러뜨리지 않았다. */
  readonly ottoCampaign?: import("./OttoCampaignRules").OttoCampaignState;
  /** 도시 기록 조사(BH-17 소포) 진행(`NativeCityRecordsRules`). 없던 저장은 아직 배달원을 만나지 않았다. */
  readonly nativeCityRecords?: import("./NativeCityRecordsRules").NativeCityRecordsState;
  /** 마을 1:1 대결의 상대별 승수(`CityFightRewardRules` — 첫 승리 상금). 없으면 아직 이긴 적이 없다. */
  readonly cityFightWins?: import("./CityFightRewardRules").CityFightWinsState;
  /** 이번 주 마을 토너먼트의 대진과 결과(`tournament/CityTournamentRules`). 없으면 아직 이번 주 대진을 열지 않았다. */
  readonly cityTournament?: import("./tournament/CityTournamentRules").CityTournamentState;
  /** 저장 형식(2026-10-11 v6 — 개발 중이라 그 전 형식은 읽지 않는다: 새 저장으로 시작한다). */
  readonly version: 6;
  /** 마을의 곁 기록(v6 에서 따로 있던 저장 키를 합쳤다). */
  readonly village: VillageProgress;
  /** 최초 부팅의 주인공 선택을 확정했는가. */
  readonly characterSelected: boolean;
  /** 최초 선택한 주인공. 마을과 이후 모든 런에 이어진다. */
  readonly character: CharacterId;
  /** 신규 남성의 첫 거래·환복·회랑 의뢰를 단조로운 한 단계로 저장한다. */
  readonly firstOutfit: FirstOutfitState;
  /** 마지막으로 확정한 두 도구. 반복 런 브리핑에서 조용히 기본값으로 되감지 않는다. */
  readonly toolLoadout: ToolLoadout;
  /** 괴도 무기 개조의 소유와 무기별 활성 갈래(`WeaponModRules`). */
  readonly weaponMods: WeaponModState;
  readonly onboarding: TutorialOnboardingState;
  /** 실제 제패 증거에서 해금된 메인 사건의 관람 기록. */
  readonly campaign: CampaignMemory;
  readonly gold: number;
  readonly fame: number;
  readonly upgrades: UpgradeLevels;
  /** 실패에서 발견한 영구 수법. */
  readonly discoveries: readonly MasteryDiscoveryId[];
  /** 친선 초대가 아닌 런에서 탈출과 CONTRACT KEPT를 함께 달성한 예고장. */
  readonly clearedCallingCardIds: readonly CallingCardId[];
  readonly stats: {
    readonly runs: number;
    readonly escapes: number;
    readonly busted: number;
    readonly bestPayout: number;
    /** 마지막 성공에 사용한 퇴로. 다음 생성 저택이 이 선택에 대응한다. */
    readonly lastEscapeId: string | null;
    /** 마지막 성공에서 가장 강했던 수법. 실패는 이 값을 바꾸지 않는다. */
    readonly lastTactic?: TacticId | null;
  };
}

/** 마을의 곁 기록: 생활 사건의 결말, 첫 마을 로잘린 동행. */
export interface VillageProgress {
  readonly story: import("./VillageStoryRules").VillageStoryMemory;
  readonly rosalineEscortDone: boolean;
}

export const EMPTY_VILLAGE_PROGRESS: VillageProgress = Object.freeze({ story: Object.freeze({}), rosalineEscortDone: false });

export function createMeta(): MetaState {
  return {
    version: 6,
    village: EMPTY_VILLAGE_PROGRESS,
    blackthorneCompleted: false,
    manorMemory: { visits: 0, visitedRoomIds: [] },
    characterSelected: false,
    character: "male",
    firstOutfit: NEW_FIRST_OUTFIT_STATE,
    toolLoadout: DEFAULT_TOOL_LOADOUT,
    weaponMods: EMPTY_WEAPON_MODS,
    campaign: { seenInterludes: [] },
    onboarding: {
      callingCardBriefed: false,
      tutorialVersion: TUTORIAL_ONBOARDING_VERSION,
      openingCompleted: false,
      trainingCompleted: false,
      villageIntroCompleted: false,
      learnedVerbs: [],
      lessons: {},
      checkpointId: null,
      dismissed: false,
    },
    gold: 0,
    fame: 0,
    upgrades: {},
    discoveries: [],
    clearedCallingCardIds: [],
    stats: { runs: 0, escapes: 0, busted: 0, bestPayout: 0, lastEscapeId: null, lastTactic: null },
  };
}

/** 최초 선택을 한 번의 불변 갱신으로 확정한다. */
export function selectCharacter(meta: MetaState, character: CharacterId, options: { readonly personalLook?: boolean } = {}): MetaState {
  const experiencedCharacterSwitch = character === "male"
    && meta.character === "female"
    && (meta.onboarding.openingCompleted || meta.onboarding.trainingCompleted);
  return {
    ...meta,
    character,
    characterSelected: true,
    ...(character === "female" ? { femaleLook: options.personalLook ? "personal" as const : "authored" as const } : {}),
    ...(!options.personalLook && !meta.characterSelected && character === "female" && !meta.onboarding.openingCompleted
      && !meta.onboarding.trainingCompleted && meta.stats.runs === 0 ? { femalePrologue: { phase: "arrived" as const } } : {}),
    firstOutfit: experiencedCharacterSwitch ? LEGACY_FIRST_OUTFIT_STATE : meta.firstOutfit,
  };
}

export function shouldAutoStartOpening(meta: MetaState): boolean {
  // 실전 기록이 있어도 현재 오프닝을 끝내지 않았다면 한 번은 자연스럽게 연결한다.
  // 원하지 않는 사용자는 오프닝 안에서 Esc로 나가면 이후 자동 진입하지 않는다.
  return !(meta.character === "female" && meta.femaleLook !== "personal" && meta.femalePrologue !== undefined)
    && !meta.onboarding.openingCompleted && !meta.onboarding.dismissed;
}

export function hasLearnedVerb(meta: MetaState, verb: OnboardingVerbId): boolean {
  return meta.onboarding.learnedVerbs.includes(verb);
}

/** 이미 배운 순서를 흔들지 않고 새로 증명한 동사만 정규 목록 순서로 저장한다. */
export function recordLearnedVerbs(
  meta: MetaState,
  verbs: readonly OnboardingVerbId[],
): MetaState {
  const requested = new Set([...meta.onboarding.learnedVerbs, ...verbs]);
  const learnedVerbs = ONBOARDING_VERB_IDS.filter((verb) => requested.has(verb));
  if (
    learnedVerbs.length === meta.onboarding.learnedVerbs.length
    && learnedVerbs.every((verb, index) => meta.onboarding.learnedVerbs[index] === verb)
  ) return meta;
  return {
    ...meta,
    onboarding: { ...meta.onboarding, learnedVerbs },
  };
}

/** 레슨 하나의 진행을 교체한다. 같은 값이면 원본을 돌려줘 불필요한 저장을 막는다. */
export function recordFollowLesson(
  meta: MetaState,
  id: FollowLessonId,
  progress: FollowLessonProgress,
): MetaState {
  const current = meta.onboarding.lessons?.[id];
  if (current !== undefined
    && current.taught === progress.taught
    && current.attempts === progress.attempts
    && current.successStreak === progress.successStreak
    && current.failStreak === progress.failStreak) return meta;
  return {
    ...meta,
    onboarding: { ...meta.onboarding, lessons: { ...meta.onboarding.lessons, [id]: progress } },
  };
}

/** 짧은 첫 사건을 완료한다. 기초 훈련을 했다고 주장하지 않는다. */
export function completeOpeningHeist(meta: MetaState): MetaState {
  return {
    ...meta,
    onboarding: {
      ...meta.onboarding,
      openingCompleted: true,
      checkpointId: null,
      dismissed: false,
    },
  };
}

export function recordTutorialCheckpoint(meta: MetaState, checkpointId: string): MetaState {
  return {
    ...meta,
    onboarding: {
      ...meta.onboarding,
      tutorialVersion: TUTORIAL_ONBOARDING_VERSION,
      // 완료는 단조롭게 유지한다. 완료자가 연습 회랑을 다시 플레이하다 나가도
      // 이미 끝낸 훈련을 미완료로 되돌리면 마을·브리핑 안내가 거짓이 된다.
      trainingCompleted: meta.onboarding.trainingCompleted,
      checkpointId,
      dismissed: false,
    },
  };
}

export function dismissTutorial(meta: MetaState): MetaState {
  return {
    ...meta,
    onboarding: { ...meta.onboarding, dismissed: true },
  };
}

export function completeTutorial(meta: MetaState): MetaState {
  return {
    ...meta,
    onboarding: {
      ...meta.onboarding,
      tutorialVersion: TUTORIAL_ONBOARDING_VERSION,
      openingCompleted: true,
      trainingCompleted: true,
      checkpointId: null,
      dismissed: false,
    },
  };
}

/** 첫 마을 동행은 한 번만 재생하며 훈련·런 진행은 건드리지 않는다. */
export function completeVillageIntro(meta: MetaState): MetaState {
  if (meta.onboarding.villageIntroCompleted) return meta;
  return {
    ...meta,
    onboarding: { ...meta.onboarding, villageIntroCompleted: true },
  };
}

export function levelOf(meta: MetaState, id: UpgradeId): number {
  return meta.upgrades[id] ?? 0;
}

export function isUpgradeId(value: unknown): value is UpgradeId {
  return typeof value === "string" && Object.hasOwn(UPGRADE_TABLE, value);
}

/** 저장·네트워크 문자열용 fallible lookup. */
export function findUpgrade(id: string): UpgradeNode | null {
  return isUpgradeId(id) ? UPGRADE_TABLE[id] : null;
}

/** 검증된 강화 ID의 total lookup. */
export function upgradeOf(id: UpgradeId): UpgradeNode {
  return UPGRADE_TABLE[id];
}

/** 다음 레벨 비용. 최대 레벨이면 null. */
export function costOf(meta: MetaState, id: UpgradeId): number | null {
  const node = upgradeOf(id);
  const level = levelOf(meta, id);
  if (level >= node.maxLevel) return null;
  return Math.round(node.baseCost * Math.pow(node.costGrowth, level));
}

export function canAfford(meta: MetaState, id: UpgradeId): boolean {
  const node = upgradeOf(id);
  const cost = costOf(meta, id);
  if (cost === null) return false;
  return (node.currency === "gold" ? meta.gold : meta.fame) >= cost;
}

export function purchase(meta: MetaState, id: UpgradeId): MetaState {
  const node = upgradeOf(id);
  const cost = costOf(meta, id);
  if (cost === null || !canAfford(meta, id)) return meta;
  return {
    ...meta,
    gold: node.currency === "gold" ? meta.gold - cost : meta.gold,
    fame: node.currency === "fame" ? meta.fame - cost : meta.fame,
    upgrades: { ...meta.upgrades, [id]: levelOf(meta, id) + 1 },
  };
}

export interface DerivedStats {
  readonly carryBonus: number;
  readonly staminaBonus: number;
  readonly lockpickLevel: number;
  readonly skillMaxBonus: number;
  readonly escapeChargeBonus: number;
  readonly noiseMul: number;
}

export function derive(meta: MetaState): DerivedStats {
  return {
    carryBonus: levelOf(meta, "carry") * 20,
    staminaBonus: levelOf(meta, "stamina") * 15,
    lockpickLevel: levelOf(meta, "lockpick"),
    skillMaxBonus: levelOf(meta, "skillMax") * 10,
    escapeChargeBonus: levelOf(meta, "escape"),
    noiseMul: Math.max(0.4, 1 - levelOf(meta, "quiet") * 0.15),
  };
}

/**
 * 메타 강화를 튜닝 패치 op 목록으로 낸다.
 *
 * 수치의 출처는 `derive` 하나뿐이고, 이 함수는 그것을 예고장과 같은 적용기에 태우는
 * 투영이다. 강화를 손으로 스프레드해 넣으면 적용 지점이 늘어나고, 한 곳만 빠뜨려도
 * 화면에 표시된 효과와 실제 판정이 조용히 갈라진다.
 */
export function metaPatchOps(meta: MetaState): readonly PatchOp[] {
  const derived = derive(meta);
  return [
    { op: "add", path: "carry.maxWeight", v: derived.carryBonus },
    { op: "add", path: "stamina.max", v: derived.staminaBonus },
    { op: "add", path: "skill.max", v: derived.skillMaxBonus },
    { op: "add", path: "run.escapeCharges", v: derived.escapeChargeBonus },
    { op: "add", path: "loot.lockpickLevel", v: derived.lockpickLevel },
    { op: "mul", path: "noise.footstepRadius", v: derived.noiseMul },
    ...MASTERY_DISCOVERIES
      .filter((discovery) => meta.discoveries.includes(discovery.id))
      .flatMap((discovery) => discovery.ops),
  ];
}

export const MASTERY_DISCOVERY_TABLE: Readonly<Record<MasteryDiscoveryId, MasteryDiscovery>> = Object.freeze(
  Object.fromEntries(
    MASTERY_DISCOVERIES.map((discovery) => [discovery.id, discovery]),
  ) as Record<MasteryDiscoveryId, MasteryDiscovery>,
);

/** codec을 통과한 숙련 ID의 total lookup. */
export function masteryDiscoveryOf(id: MasteryDiscoveryId): MasteryDiscovery {
  return MASTERY_DISCOVERY_TABLE[id];
}

export function newMasteryDiscoveries(
  meta: MetaState,
  outcome: "escaped" | "busted" | "timeout",
): readonly MasteryDiscovery[] {
  if (outcome === "escaped") return [];
  return MASTERY_DISCOVERIES.filter(
    (discovery) => discovery.trigger === outcome
      && !meta.discoveries.includes(discovery.id)
      && (discovery.requires === undefined || meta.discoveries.includes(discovery.requires)),
  ).slice(0, 1);
}

/**
 * 저택을 얼마나 조일 것인가.
 *
 * 시도 횟수가 아니라 **성공한 탈출** 로 센다. 계속 실패하는 플레이어에게 더 어려운
 * 저택을 주는 것은 난이도 곡선이 아니라 벌이다.
 *
 * 최대 압박에 도달하는 성공 횟수. 8회면 한 저녁에 닿기는 어렵고, 익숙해진 뒤에도
 * 한참 남아 있는 거리다.
 */
export const FULL_PRESSURE_ESCAPES = 8;

/** 생성 저택이 다음 런 대응으로 기억할 수 있는 정규 퇴로. */
export const PERSISTENT_ESCAPE_IDS = Object.freeze(["front-door", "roof-window", "chimney"] as const);

/** 저장·개발 스테이지에서 들어온 임의 문자열이 브리핑과 생성 저택으로 새지 않게 한다. */
export function persistentEscapeId(value: unknown): string | null {
  return typeof value === "string" && (PERSISTENT_ESCAPE_IDS as readonly string[]).includes(value)
    ? value
    : null;
}

export function persistentTacticId(value: unknown): TacticId | null {
  return typeof value === "string" && (TACTIC_IDS as readonly string[]).includes(value)
    ? value as TacticId
    : null;
}

export function mansionPressure(meta: MetaState): number {
  return Math.min(1, meta.stats.escapes / FULL_PRESSURE_ESCAPES);
}

export interface CallingCardClearProgress {
  readonly cleared: number;
  readonly total: number;
  readonly remaining: number;
  readonly complete: boolean;
}

export function callingCardClearProgress(meta: Pick<MetaState, "clearedCallingCardIds">): CallingCardClearProgress {
  const cleared = meta.clearedCallingCardIds.length;
  const total = CALLING_CARD_IDS.length;
  return Object.freeze({
    cleared,
    total,
    remaining: Math.max(0, total - cleared),
    complete: cleared === total,
  });
}

export function isCallingCardCleared(meta: MetaState, cardId: CallingCardId): boolean {
  return meta.clearedCallingCardIds.includes(cardId);
}

export function recordRun(
  meta: MetaState,
  payout: {
    readonly gold: number;
    readonly fame: number;
    readonly escaped: boolean;
    readonly busted: boolean;
    readonly escapeId?: string | null;
    readonly tactic?: TacticId | null;
    readonly cardId?: CallingCardId | null;
    readonly contractKept?: boolean;
  },
): MetaState {
  const rememberedEscape = payout.escaped ? persistentEscapeId(payout.escapeId) : null;
  const rememberedTactic = payout.escaped ? persistentTacticId(payout.tactic) : null;
  const outcome = payout.escaped ? "escaped" : payout.busted ? "busted" : "timeout";
  const unlocked = newMasteryDiscoveries(meta, outcome).map((discovery) => discovery.id);
  const newlyClearedCardId = payout.escaped
    && payout.contractKept === true
    && payout.cardId !== undefined
    && payout.cardId !== null
    && !meta.clearedCallingCardIds.includes(payout.cardId)
    ? payout.cardId
    : null;
  return {
    ...meta,
    gold: meta.gold + payout.gold,
    fame: meta.fame + payout.fame,
    discoveries: [...meta.discoveries, ...unlocked],
    clearedCallingCardIds: newlyClearedCardId === null
      ? meta.clearedCallingCardIds
      : [...meta.clearedCallingCardIds, newlyClearedCardId],
    stats: {
      runs: meta.stats.runs + 1,
      escapes: meta.stats.escapes + (payout.escaped ? 1 : 0),
      busted: meta.stats.busted + (payout.busted ? 1 : 0),
      bestPayout: Math.max(meta.stats.bestPayout, payout.gold),
      // 실패는 저택을 더 영리하게 만들지 않는다. 성공한 퇴로만 다음 대응의 근거가 된다.
      lastEscapeId: rememberedEscape ?? meta.stats.lastEscapeId,
      lastTactic: rememberedTactic ?? meta.stats.lastTactic ?? null,
    },
  };
}
