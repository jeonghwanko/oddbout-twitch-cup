import type { ManorDefinition } from "./BlackthorneManorDefinition";
import type { EscapeKind, Facing, Rect, Vec2 } from "./types";
import type { GuardArchetypeId } from "./GuardArchetypes";
import type { GuardBehaviorPolicy } from "./GuardBehaviorRules";
import type { LootId } from "./LootRules";
import { rectContains, rectOverlaps, spansOverlap } from "./geom";
import type { ToolLoadout } from "./ToolRules";
import type { WeaponModId } from "./WeaponModRules";
import type { TacticId } from "./TacticRules";
import type { AuctionDefinition } from "./AuctionModel";
import type { CameraZone } from "./CameraZoneModel";

/**
 * 스테이지의 단일 진실원. 렌더와 AI가 같은 데이터를 본다.
 *
 * 전부 JSON 직렬화 가능한 순수 데이터 shape 로 유지한다. 슬라이스 단계에서는
 * TS 리터럴이라 Vite HMR 로 즉시 반영되지만, 나중에 Tiled 어댑터가 같은 shape 를
 * 뱉게 하면 데이터 소스만 교체된다.
 *
 * 층 인덱스는 월드 Y 순서와 일치한다. 0 = 최상단 밴드. 표시 이름은 bands 에 둔다.
 */

export type GeometryKind =
  /** 충돌 + 시야 차단 */
  | "solid"
  /** 원웨이 발판. 위에서 아래로만 충돌 */
  | "platform"
  /** 충돌 없음 + 시야만 차단. 책장·커튼·기둥. 레벨디자인 주력 */
  | "blocker"
  /** 충돌 없음. 조명 감쇠 구역 */
  | "dark"
  /** 슬래브 구멍. 층간 시야가 통하는 유일한 예외 */
  | "visionHole";

export interface GeometryRect {
  readonly id: string;
  readonly kind: GeometryKind;
  readonly rect: Rect;
}

/**
 * 월드 바깥을 막기만 하는 껍데기 판정. 배우가 천장·좌우로 빠져나가지 못하게 하는 것이
 * 전부이고 플레이 공간 안에는 한 픽셀도 없다.
 *
 * 표현은 이것들을 **칠하지 않는다.** 카메라가 최상층 여백과 탈출 좌우 여백만큼 월드
 * 바깥을 비추므로, 도형으로 메우면 옥상 하늘 위에 보라 띠가, 양끝에는 보라 기둥이 남는다.
 */
export const OUTER_SHELL_GEOMETRY_IDS: ReadonlySet<string> = new Set([
  "wall-left",
  "wall-right",
  "roof",
]);

export type LinkKind = "ladder" | "vent" | "stair" | "beam" | "chimney";

export interface VerticalLink {
  readonly id: string;
  readonly kind: LinkKind;
  /** 진입 판정 영역. 사다리는 세로로 긴 띠, 환기구는 입구 지점. */
  readonly rect: Rect;
  /** Forgiving catch area; artwork and climb endpoints still use rect. */
  readonly catchPadding?: { readonly x: number; readonly bottom: number };
  /** 환기구·굴뚝 등 적재율 게이트. 없으면 제한 없음. */
  readonly loadLimit?: number;
  /** 환기구 통과 후 나오는 지점. 발 기준 월드 좌표. */
  readonly exit?: Vec2;
  /** 환기구 통과 소요 시간. */
  readonly travelMs?: number;
  /** 경비도 사용 가능한가. 평시 순찰은 단일 층이지만 조사·수색·추격은 이 링크를 쓴다. */
  readonly guardUsable: boolean;
  /** 안내원에게서 구역 열쇠를 훔치기 전에는 사용할 수 없는 서비스 통로. */
  readonly requiresAreaKey?: boolean;
}

/** Authored traversal geometry. All positions are world-space player feet except anchor (chain pivot). */
export interface ParkourRoute {
  readonly id: string;
  readonly from: Vec2;
  readonly anchor: Vec2;
  readonly to: Vec2;
  /** Foot position when the hands first catch the chandelier. */
  readonly grab?: Vec2;
  /** Foot position reached by reversing the swing; defaults to from. */
  readonly returnTo?: Vec2;
  /** Informational target for rendering the lower recovery landing; gravity owns the actual landing. */
  readonly recovery?: Vec2;
  /**
   * `false` = 줄을 던질 샹들리에가 걸려 있지 않은 도하 무대. 발코니·배수관·창턱·회복 착지 같은
   * 건축 좌표는 그대로 살아 있고(카메라 구도·경로 안내·전시 관찰·바닥 틈이 이 좌표를 읽는다),
   * E 는 줄 던지기가 아니라 고리 사슬(`grappleAnchors`)로 간다. 샹들리에도 그리지 않는다.
   * 블랙손 아트리움이 그렇다(2026-09-27: 샹들리에를 걷어내고 고리가 아트리움을 건너는 길).
   * 생략하면 던질 수 있다 — 옛 레이아웃·리플레이와 합성 루트 단위 테스트가 그렇다.
   */
  readonly throwable?: boolean;
}

/** Reusable chain pivot. Unlike a scripted ParkourRoute, it has no fixed destination. */
export interface GrappleAnchor {
  readonly id: string;
  readonly at: Vec2;
  /** Optional per-anchor reach override; omitted anchors use tuning.grapple.reachPx. */
  readonly reachPx?: number;
  /**
   * 이 고리들에서 옮겨 잡아 오면, 잡는 박자(`tuning.grapple.autoDismountMs`) 뒤 스스로 놓고 앞으로
   * 뛰어내린다. 창을 지나 방 안으로 들어가는 마지막 고리처럼 매달려 있을 이유가 없는 고리에 쓴다.
   * 그 박자 안에 누른 E·Space·↓ 가 먼저다.
   */
  readonly autoDismountFrom?: readonly string[];
}

export interface HideSpot {
  readonly id: string;
  readonly rect: Rect;
  /** 수색 우선순위 가중치. 높을수록 먼저 열어본다. */
  readonly searchWeight: number;
}

export interface Lamp {
  readonly id: string;
  readonly at: Vec2;
  readonly radius: number;
  readonly snuffable: boolean;
  /** 일반 층별 순환 대신 반드시 사용할 MansionProps 소품 id. */
  readonly visualId?: string;
}

/** R 홀드로 작동시키는 일회성 환경 공격. 판정과 원화 위치를 같은 레이아웃이 소유한다. */
export interface EnvironmentHazard {
  readonly id: string;
  readonly kind: "chandelier";
  /** 플레이어가 줄을 당기는 발 위치. */
  readonly triggerAt: Vec2;
  /** 낙하물이 착지하는 중심. */
  readonly impactAt: Vec2;
  /** 피해 판정 반경. 줄은 반드시 이 반경 밖에 놓는다. */
  readonly impactRadiusPx: number;
  /** 매달린 원화의 초기 중심. */
  readonly visualAt: Vec2;
  /** 이 전리품을 획득한 뒤에만 줄을 당길 수 있다. 없으면 처음부터 활성화된다. */
  readonly activationLootAnchorId?: string;
}

/**
 * 한 번의 조작이 여러 소품으로 번지는 괴도 연쇄극.
 *
 * 장치 순서와 판정 위치를 레이아웃에 함께 두어, 괴도의 눈이 그리는 연결선과
 * 실제 경비 판정이 서로 다른 답을 보여 주지 않게 한다.
 */
export type CaperDeviceKind = "cart" | "armor" | "wine-rack" | "chandelier";
export type CaperDeviceEffect = "shove" | "stagger" | "subdue";

export interface CaperDevice {
  readonly id: string;
  readonly kind: CaperDeviceKind;
  readonly floor: number;
  /** 첫 장치를 플레이어가 작동시키는 위치. 후속 장치는 연결 순서로 자동 발동한다. */
  readonly triggerAt: Vec2;
  readonly impactAt: Vec2;
  readonly visualAt: Vec2;
  readonly impactRadiusPx: number;
  readonly noiseRadiusPx: number;
  readonly effect: CaperDeviceEffect;
  readonly direction: Facing;
  /** 앞 장치가 발동한 뒤 이 장치가 발동하기까지의 시간. */
  readonly delayMs: number;
  readonly nextId?: string;
  readonly activationLootAnchorId?: string;
}

export interface CaperChain {
  readonly reusableOnEscape?: boolean;
  readonly id: string;
  readonly floor: number;
  readonly fromX: number;
  readonly toX: number;
  readonly rootDeviceId: string;
  readonly devices: readonly CaperDevice[];
}

/**
 * 건드리지 않으면 지나칠 수 있는 선택형 전투 구역.
 *
 * 보상, 실제 활성화 경비, 화면 경고가 이 데이터를 함께 읽는다. 경비 ID를 렌더에서
 * 다시 추측하지 않아야 "한 명이 예고됐는데 둘이 나온다" 같은 불공정이 생기지 않는다.
 */
export interface CombatPocket {
  readonly id: string;
  readonly kind: "crossfire";
  readonly floor: number;
  readonly fromX: number;
  readonly toX: number;
  readonly rewardAnchorId: string;
  readonly guardIds: readonly string[];
  /** 매복을 정면전 외의 방식으로 풀 수 있게 하는, 화면과 판정이 공유하는 환경 장치. */
  readonly environmentHazardId: string;
  /** 보상을 포기하면 전투를 일으키지 않고 통과할 수 있다. */
  readonly bypass: "leave-reward";
}

/** 생성 저택의 미술·대표 방·라이벌 규칙을 함께 묶는 런타임 테마. */
export type MansionThemeId = "musicbox" | "glasshouse" | "opera";

export interface MansionSignatureRoom {
  readonly id: string;
  readonly name: string;
  readonly floor: number;
  readonly fromX: number;
  readonly toX: number;
  /** 없으면 기존 저택 키트를 그대로 쓴다. */
  readonly artId?: "musicbox-ballroom" | "glasshouse-conservatory" | "opera-proscenium";
  /** 장식 문구가 아니라, 실제 포켓 장치로 실행할 수 있는 공략 정보다. */
  readonly rule: string;
}

export interface MansionRival {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly guardId: string;
  readonly activationAnchorId: string;
  /** 대표 방에 들어오기 전에 읽을 수 있는 실제 공략 약점. */
  readonly weakness: string;
}

export interface MansionTheme {
  readonly id: MansionThemeId;
  readonly name: string;
  readonly signatureRoom: MansionSignatureRoom;
  readonly rival: MansionRival;
}

/** 지난 성공을 기억한 저택이 다음 런에 적용하는, 사전 고지된 대응책. */
export interface MansionResponse {
  readonly kind: "watched-exit";
  /** 직전 성공에 사용돼 이번 저택에서는 처음부터 봉쇄되는 출구. */
  readonly exitId: string;
}

/** 성공 수법에 대한 다음 저택의 대응. counter와 weakness를 항상 함께 고지한다. */
export interface TacticResponse {
  readonly tactic: TacticId;
  readonly title: string;
  readonly counter: string;
  readonly weakness: string;
}

/** 생성 저택마다 보장하는 클라이맥스 배치의 안정 ID. */
export const MANSION_SETPIECE_IDS = Object.freeze({
  atticMusicbox: "setpiece-attic-musicbox",
  atticBruiser: "setpiece-attic-bruiser",
  grandHallChandelier: "setpiece-grand-hall-chandelier",
  basementVault: "setpiece-basement-vault",
  basementVaultChandelier: "setpiece-basement-vault-chandelier",
  basementKnight: "setpiece-basement-knight",
  galleryPrize: "setpiece-gallery-prize",
  galleryBruiser: "setpiece-gallery-bruiser",
  galleryCrossbow: "setpiece-gallery-crossbow",
  galleryCrossfire: "setpiece-gallery-crossfire",
  galleryCaperChain: "setpiece-gallery-caper-chain",
  informantUsher: "informant-usher",
  informantButler: "informant-butler",
  lockedServicePassage: "locked-service-passage",
  greatEscapeBruiserWest: "setpiece-great-escape-bruiser-west",
  greatEscapeBruiserEast: "setpiece-great-escape-bruiser-east",
  greatEscapeCrossbow: "setpiece-great-escape-crossbow",
});

export interface FloorBand {
  readonly index: number;
  readonly name: string;
  /** 기본 조명 0..1. dark 사각형이 여기에 곱해진다. */
  readonly light: number;
  /** 기본 층 키트 대신 사용할 전용 배경 원화. */
  readonly backgroundArtId?: "tutorial-rooftop";
}

/**
 * 경비 배치. 평시 순찰의 x 웨이포인트와 시작 층을 정의한다.
 * 발각 뒤에는 GuardPlanner가 `guardUsable` 사다리만 골라 층간 추격한다.
 */
export interface GuardSpawn {
  readonly id: string;
  readonly archetype: GuardArchetypeId;
  readonly floor: number;
  /**
   * 층의 공용 슬래브와 다른 발 기준선을 쓰는 단일 화면 세트피스용 높이.
   * 생략하면 `floorSurfaceY`를 사용한다.
   */
  readonly surfaceY?: number;
  readonly route: readonly number[];
  /** 웨이포인트에서 멈춰 두리번거리는 시간. 순찰 주기의 리듬을 만든다. */
  readonly dwellMs: number;
  readonly facing: Facing;
  /** 연출용 사전 배치처럼 제자리를 지켜야 하는 개체는 아키타입의 주기 스캔도 시작하지 않는다. */
  readonly periodicScanDisabled?: boolean;
  /** 다음 구간 배우를 미리 보여 주기만 하며 현재 판정에는 참여시키지 않는가. */
  readonly previewOnly?: boolean;
  /** 커스텀 초대장이 컴파일한 닫힌 행동 계약. 자유 프롬프트는 런에 들어오지 않는다. */
  readonly behaviorPolicy?: GuardBehaviorPolicy;
  /**
   * 이 전리품을 획득하기 전에는 생성하지 않는 세트피스 경비.
   * 일반 순찰 풀과 클라이맥스 전투를 분리해 평상시 구역에 전투 적이 섞이지 않게 한다.
   */
  readonly activationLootAnchorId?: string;
  /** 이 런 페이즈에 들어간 완료 프레임에 생성하는 세트피스 경비. */
  readonly activationRunPhase?: "greatEscape";
  /**
   * 경매장 무대 뒤 직원. 홀의 시선이 무대에 쏠린 동안(`AuctionAttentionRules`) 평온한 직원은
   * 순찰을 멈추고 이 자리로 가서 지정한 방향(무대)을 본다.
   */
  readonly stageWatch?: {
    readonly atX: number;
    readonly facing: Facing;
    /** 자리로 서두르는 걸음의 순찰 속도 배수. 창이 열린 뒤 자리에 선 모습이 읽혀야 한다. */
    readonly hurryMul: number;
    /** 창이 닫힌 직후 서둘러 가서 반대쪽(무대의 반대 방향)을 확인하는 자리. */
    readonly checkX: number;
  };
}

/** 탐지하지 않고 이동·접촉 소음·동적 엄폐만 제공하는 비전투 군중 배치. */
export interface CrowdSpawn {
  readonly id: string;
  readonly kind: "guest" | "drunk";
  readonly floor: number;
  /** 단일 층에서 어슬렁거릴 수 있는 수평 범위. */
  readonly range: readonly [number, number];
}

/** 전리품이 놓인 자리. 어떤 물건인지는 LootRules 의 표가 정한다. */
export interface LootAnchor {
  readonly id: string;
  readonly lootId: LootId;
  readonly at: Vec2;
  /** 이 배치만 LootRules의 기본 기술 요구치를 덮는다. 교습 필수품처럼 진행을 막으면 안 되는 대상에 쓴다. */
  readonly skillRequiredOverride?: number;
}

/** 탈출구. 어려운 경로일수록 배수가 크고, 적재 게이트가 걸리기도 한다. */
export interface EscapePoint {
  readonly requiresPreparation?: boolean;
  readonly id: string;
  /** 캐릭터가 재생할 탈출 동작. 레이아웃별 ID와 분리해 세 연출로 정규화한다. */
  readonly kind: EscapeKind;
  /** 탈출 연출의 수평 방향. 벽 출구는 저택 바깥쪽, 수직 출구는 원화의 정면을 명시한다. */
  readonly facing: Facing;
  readonly name: string;
  readonly rect: Rect;
  readonly bonusMul: number;
  readonly loadLimit?: number;
}

export interface MansionLayout {
  /** Absent in older layouts and replays. */
  readonly parkourRoutes?: readonly ParkourRoute[];
  readonly grappleAnchors?: readonly GrappleAnchor[];
  readonly physicsProps?: readonly import("./PhysicsProps").PhysicsPropDefinition[];
  readonly physicsState?: import("./PhysicsProps").EnvironmentPhysicsState;
  readonly manor?: ManorDefinition;
  /** Reproducible keeper-fight restart; persisted in replay layouts. */
  readonly blackthorneCheckpoint?: "keeper";
  readonly id: string;
  readonly name: string;
  readonly widthPx: number;
  readonly bands: readonly FloorBand[];
  readonly geometry: readonly GeometryRect[];
  readonly links: readonly VerticalLink[];
  readonly hideSpots: readonly HideSpot[];
  readonly lamps: readonly Lamp[];
  readonly environmentHazards: readonly EnvironmentHazard[];
  /** 이전 레이아웃·리플레이와 호환하기 위해 없는 경우 빈 목록으로 읽는다. */
  readonly caperChains?: readonly CaperChain[];
  readonly combatPockets: readonly CombatPocket[];
  /** 과거 레이아웃·튜토리얼에는 없을 수 있다. 생성 저택은 항상 가진다. */
  readonly theme?: MansionTheme;
  readonly guards: readonly GuardSpawn[];
  readonly crowds: readonly CrowdSpawn[];
  readonly lootAnchors: readonly LootAnchor[];
  readonly escapes: readonly EscapePoint[];
  /** 개인 유물 외에 회수해야 탈출이 열리는 고정 스테이지 목표. */
  readonly requiredLootAnchorIds?: readonly string[];
  /** 단일 화면 경매장의 호가·낙찰 박자. 일반 저택에는 없다. */
  readonly auction?: AuctionDefinition;
  /**
   * 장면별 카메라 구도(`CameraZoneModel`). 없으면 기본 추적만 쓴다 — 생성 저택·교습·옛 리플레이.
   * 표현 전용이라 sim 판정은 이 값을 읽지 않는다.
   */
  readonly cameraZones?: readonly CameraZone[];
  readonly response?: MansionResponse;
  readonly tacticResponse?: TacticResponse;
  /** 브리핑에서 고른 두 도구. 리플레이가 레이아웃과 함께 직렬화한다. */
  readonly toolLoadout?: ToolLoadout;
  /**
   * 이번 런에 가져간 무기 개조(`WeaponModRules.activeWeaponMods`). 리플레이가 레이아웃과 함께
   * 직렬화하므로 저장 상태 없이 같은 판정을 재생한다. 없으면 개조 없는 런이다 — 필드가 없던
   * 옛 리플레이도 그대로 재생된다. 초대 런·교습에는 싣지 않는다.
   */
  readonly toolMods?: readonly WeaponModId[];
  readonly spawn: Vec2;
}

/** 해당 층에서 걸을 수 있는 바닥면의 y. 경비는 항상 이 높이에 붙어 있다. */
export function floorSurfaceY(floorIndex: number, floorHeightPx: number, slabThicknessPx: number): number {
  return (floorIndex + 1) * floorHeightPx - slabThicknessPx;
}

/** 월드 Y 로부터 층 인덱스. 층 밴드 높이는 튜닝의 floorHeightPx. */
export function floorOfY(y: number, floorHeightPx: number): number {
  if (floorHeightPx <= 0) return 0;
  return Math.floor(y / floorHeightPx);
}

/** 사다리가 연결하는 [위층, 아래층]. 경로 예측과 경비 추격이 같은 판정을 쓴다. */
export function ladderFloors(link: VerticalLink, floorHeightPx: number): readonly [number, number] {
  const lowerFloor = floorOfY(link.rect.y + link.rect.h - 1, floorHeightPx);
  return [lowerFloor - 1, lowerFloor];
}

/** 시야를 막는 것: solid 와 blocker. */
export function visionBlockers(layout: MansionLayout): GeometryRect[] {
  return layout.geometry.filter((g) => g.kind === "solid" || g.kind === "blocker");
}

/** 이동을 막는 것: solid 만. platform 은 별도 원웨이 처리. */
export function solidRects(layout: MansionLayout): Rect[] {
  return layout.geometry.filter((g) => g.kind === "solid").map((g) => g.rect);
}

export function platformRects(layout: MansionLayout): Rect[] {
  return layout.geometry.filter((g) => g.kind === "platform").map((g) => g.rect);
}

/**
 * 점이 어두운가.
 *
 * 미리 깔린 dark 구역이거나, 플레이어가 꺼 버린 등의 반경 안이면 어둡다.
 * 등을 끄는 행동이 지도에 실제로 어둠을 만들어야 전술적 의미가 생긴다.
 *
 * `snuffDarkMul` 은 그 어둠이 등의 밝기 반경보다 얼마나 넓게(또는 좁게) 퍼지는지다.
 * sim 의 노출도 계산과 HUD 의 은신 표시가 같은 값을 써야 "어두운 줄 알았는데
 * 걸렸다" 가 생기지 않는다.
 */
export function isInDark(
  layout: MansionLayout,
  point: Vec2,
  snuffedLamps: readonly string[] = [],
  snuffDarkMul = 1,
): boolean {
  if (layout.geometry.some((g) => g.kind === "dark" && rectContains(g.rect, point))) return true;
  if (snuffedLamps.length === 0) return false;
  for (const lamp of layout.lamps) {
    if (!snuffedLamps.includes(lamp.id)) continue;
    if (isInsideLampDarkness(lamp, point, snuffDarkMul)) return true;
  }
  return false;
}

/**
 * 두 지점이 같은 소등 램프가 만든 그림자 안에 있는가.
 *
 * 미리 깔린 `dark` 지형은 포함하지 않는다. 시야·은신에는 둘 다 같은 어둠이지만,
 * "방금 끈 등 아래를 포복 통과한다"처럼 원인이 필요한 행동 규칙은 이 판정을 쓴다.
 */
export function sharesSnuffedLampDarkness(
  layout: MansionLayout,
  first: Vec2,
  second: Vec2,
  snuffedLamps: readonly string[] = [],
  snuffDarkMul = 1,
): boolean {
  if (snuffedLamps.length === 0) return false;
  return layout.lamps.some((lamp) =>
    snuffedLamps.includes(lamp.id)
    && isInsideLampDarkness(lamp, first, snuffDarkMul)
    && isInsideLampDarkness(lamp, second, snuffDarkMul)
  );
}

function isInsideLampDarkness(lamp: Lamp, point: Vec2, snuffDarkMul: number): boolean {
  const dx = lamp.at.x - point.x;
  const dy = lamp.at.y - point.y;
  const radius = lamp.radius * snuffDarkMul;
  return dx * dx + dy * dy <= radius * radius;
}

/** 상호작용 사거리 안의 끌 수 있는 등. */
export function snuffableLampAt(
  layout: MansionLayout,
  point: Vec2,
  reachPx: number,
  preferredLampId: string | null = null,
): Lamp | null {
  const preferred = preferredLampId === null
    ? null
    : layout.lamps.find((lamp) => lamp.id === preferredLampId) ?? null;
  if (preferred !== null && preferred.snuffable && distanceBetween(preferred.at, point) <= reachPx) return preferred;
  let best: Lamp | null = null;
  let bestDistance = reachPx;
  for (const lamp of layout.lamps) {
    if (!lamp.snuffable) continue;
    if (lamp.id === preferredLampId) continue;
    const distance = distanceBetween(lamp.at, point);
    if (distance > bestDistance) continue;
    bestDistance = distance;
    best = lamp;
  }
  return best;
}

/** 상호작용 사거리 안의 환경 공격 장치. */
export function environmentHazardAt(
  layout: MansionLayout,
  point: Vec2,
  reachPx: number,
  collectedAnchorIds: readonly string[] = [],
  preferredHazardId: string | null = null,
): EnvironmentHazard | null {
  const preferred = preferredHazardId === null
    ? null
    : layout.environmentHazards.find((hazard) => hazard.id === preferredHazardId) ?? null;
  if (
    preferred !== null &&
    (preferred.activationLootAnchorId === undefined || collectedAnchorIds.includes(preferred.activationLootAnchorId)) &&
    distanceBetween(preferred.triggerAt, point) <= reachPx
  ) return preferred;
  let best: EnvironmentHazard | null = null;
  let bestDistance = reachPx;
  for (const hazard of layout.environmentHazards) {
    if (
      hazard.activationLootAnchorId !== undefined &&
      !collectedAnchorIds.includes(hazard.activationLootAnchorId)
    ) continue;
    if (hazard.id === preferredHazardId) continue;
    const distance = distanceBetween(hazard.triggerAt, point);
    if (distance > bestDistance) continue;
    bestDistance = distance;
    best = hazard;
  }
  return best;
}

/** 상호작용 사거리 안에서 아직 시작할 수 있는 연쇄극의 첫 장치. */
export function caperRootAt(
  layout: MansionLayout,
  point: Vec2,
  reachPx: number,
  collectedAnchorIds: readonly string[] = [],
  preferredDeviceId: string | null = null,
): { readonly chain: CaperChain; readonly device: CaperDevice } | null {
  if (preferredDeviceId !== null) {
    for (const chain of layout.caperChains ?? []) {
      const device = chain.devices.find((entry) => entry.id === preferredDeviceId && entry.id === chain.rootDeviceId);
      if (
        device !== undefined &&
        (device.activationLootAnchorId === undefined || collectedAnchorIds.includes(device.activationLootAnchorId)) &&
        distanceBetween(device.triggerAt, point) <= reachPx
      ) return { chain, device };
    }
  }
  let best: { readonly chain: CaperChain; readonly device: CaperDevice } | null = null;
  let bestDistance = reachPx;
  for (const chain of layout.caperChains ?? []) {
    const device = chain.devices.find((entry) => entry.id === chain.rootDeviceId);
    if (device === undefined) continue;
    if (
      device.activationLootAnchorId !== undefined &&
      !collectedAnchorIds.includes(device.activationLootAnchorId)
    ) continue;
    if (device.id === preferredDeviceId) continue;
    const distance = distanceBetween(device.triggerAt, point);
    if (distance > bestDistance) continue;
    bestDistance = distance;
    best = { chain, device };
  }
  return best;
}

function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 두 층 사이 시야가 통하는가.
 * 기본은 차단이고 visionHole 이 명시된 x 구간에서만 통한다.
 * 이 조기 반환이 다층 시야 계산량을 통째로 없앤다.
 */
export function hasVerticalSight(layout: MansionLayout, xA: number, xB: number): boolean {
  const min = Math.min(xA, xB);
  const max = Math.max(xA, xB);
  return layout.geometry.some(
    (g) => g.kind === "visionHole" && spansOverlap(min, max, g.rect.x, g.rect.x + g.rect.w),
  );
}

export function linkAt(layout: MansionLayout, body: Rect, kind?: LinkKind): VerticalLink | null {
  return linkAtPreferred(layout, body, kind, null);
}

export function linkAtPreferred(
  layout: MansionLayout,
  body: Rect,
  kind: LinkKind | undefined,
  preferredLinkId: string | null,
): VerticalLink | null {
  const preferred = preferredLinkId === null
    ? undefined
    : layout.links.find((link) => link.id === preferredLinkId);
  if (
    preferred !== undefined
    && (kind === undefined || preferred.kind === kind)
    && rectOverlaps(body, linkCatchRect(preferred))
  ) return preferred;
  for (const link of layout.links) {
    if (link.id === preferredLinkId) continue;
    if (kind !== undefined && link.kind !== kind) continue;
    if (rectOverlaps(body, linkCatchRect(link))) return link;
  }
  return null;
}

function linkCatchRect(link: VerticalLink): Rect {
  const padding = link.catchPadding;
  if (padding === undefined || link.kind !== "ladder") return link.rect;
  return { x: link.rect.x - padding.x, y: link.rect.y,
    w: link.rect.w + padding.x * 2, h: link.rect.h + padding.bottom };
}

export function hideSpotAt(layout: MansionLayout, body: Rect, preferredSpotId: string | null = null): HideSpot | null {
  const preferred = preferredSpotId === null
    ? undefined
    : layout.hideSpots.find((spot) => spot.id === preferredSpotId);
  if (preferred !== undefined && rectOverlaps(body, preferred.rect)) return preferred;
  for (const spot of layout.hideSpots) {
    if (spot.id === preferredSpotId) continue;
    if (rectOverlaps(body, spot.rect)) return spot;
  }
  return null;
}

/**
 * Phase 1 그레이박스 스테이지.
 *
 * Phase 6 에서 「오르골 저택」이 이 자리를 대체한다.
 *
 * 방 나누기는 **blocker 로 한다.** 시야만 끊고 이동과 투척은 통과시킨다.
 * 예전에는 solid 칸막이로 잘라 방 하나가 520px 밖에 안 됐는데, 그 안에서는
 * 단도 사거리(392px)도 경비 시야(300px)도 방보다 커서 동사가 성립하지 않았다.
 * 벽이 방을 만드는 게 아니라 **가구가 시선을 끊어 방처럼 느끼게** 하는 것이
 * 이 게임의 문법이다. solid 는 바깥벽·바닥·낮은 상자에만 쓴다.
 *
 * 폭 2400 = 화면 3.75 개. 각 층의 한 구간이 최소 600px(화면 하나)은 되도록 잡았다.
 */
const BAND_H = 180;
const GROUND = BAND_H - 12;
const WORLD_W = 2400;

function slab(id: string, floor: number, x: number, w: number): GeometryRect {
  return { id, kind: "solid", rect: { x, y: floor * BAND_H + GROUND, w, h: 12 } };
}

/** 시야만 끊는 가구. 걸어서도 던져서도 통과한다. 레벨 디자인의 주력 도구다. */
function furniture(id: string, floor: number, x: number, w = 14, h = 74): GeometryRect {
  return { id, kind: "blocker", rect: { x, y: floor * BAND_H + GROUND - h, w, h } };
}

/**
 * 슬래브 구멍을 덮는 원웨이 뚜껑.
 *
 * 구멍을 그냥 뚫어 두면 복도를 걷다가 예고 없이 아래층으로 빠진다 — 2400px 짜리
 * 층에 함정이 세 개 생기는 셈이다. 뚜껑을 덮으면 걸어서 지나갈 수 있고,
 * 내려가고 싶을 때만 ↑/↓(사다리)나 ↓+Space(뚫고 낙하)로 내려간다.
 */
function hatch(id: string, floor: number, x: number, w: number): GeometryRect {
  return { id, kind: "platform", rect: { x, y: floor * BAND_H + GROUND, w, h: 8 } };
}

/** 빠르게 뛰어넘는 낮은 장애물. 점프 정점은 약 78px지만 기존 28px 박자감은 유지한다. */
function crate(id: string, floor: number, x: number, w = 40): GeometryRect {
  return { id, kind: "solid", rect: { x, y: floor * BAND_H + GROUND - 28, w, h: 28 } };
}

const GREYBOX_BANDS: readonly FloorBand[] = [
  { index: 0, name: "3F 다락", light: 0.7 },
  { index: 1, name: "2F 복도", light: 0.9 },
  { index: 2, name: "1F 현관", light: 0.9 },
  { index: 3, name: "B1 창고", light: 0.35 },
];

// 사다리 위치. 슬래브 구멍은 여기서 유도한다 — 손으로 맞추면 반드시 어긋난다.
const LADDER_2F_1F_X = 380;
const LADDER_3F_2F_X = 1180;
const LADDER_1F_B1_X = 1960;
/** 2F 바닥에 뚫린 낙하 구멍. 원웨이 발판을 밟고 내려가는 시험대다. */
const DROP_SHAFT_X = 820;
const DROP_SHAFT_W = 90;

const GREYBOX_GEOMETRY: readonly GeometryRect[] = [
  // 바깥 벽
  { id: "wall-left", kind: "solid", rect: { x: -10, y: 0, w: 10, h: BAND_H * 4 } },
  { id: "wall-right", kind: "solid", rect: { x: WORLD_W, y: 0, w: 10, h: BAND_H * 4 } },
  { id: "roof", kind: "solid", rect: { x: -10, y: -10, w: WORLD_W + 20, h: 10 } },

  // 각 층 바닥. 사다리와 낙하 구멍 자리에만 뚫는다.
  slab("floor-0-a", 0, 0, LADDER_3F_2F_X - 4),
  slab("floor-0-b", 0, LADDER_3F_2F_X + 24, WORLD_W - (LADDER_3F_2F_X + 24)),
  slab("floor-1-a", 1, 0, LADDER_2F_1F_X - 4),
  slab("floor-1-b", 1, LADDER_2F_1F_X + 24, DROP_SHAFT_X - (LADDER_2F_1F_X + 24)),
  slab("floor-1-c", 1, DROP_SHAFT_X + DROP_SHAFT_W, WORLD_W - (DROP_SHAFT_X + DROP_SHAFT_W)),
  slab("floor-2-a", 2, 0, LADDER_1F_B1_X - 4),
  slab("floor-2-b", 2, LADDER_1F_B1_X + 24, WORLD_W - (LADDER_1F_B1_X + 24)),
  slab("floor-3-a", 3, 0, WORLD_W),

  // 시야를 끊는 가구. 한 화면(640px)에 두어 개는 들어오도록 대략 350~450px 마다
  // 둔다. 이보다 성기면 복도가 뻥 뚫린 사격장이 되고, 촘촘하면 경비가 아무것도
  // 못 보게 되어 잠입이 사라진다.
  furniture("shelf-1f-w", 2, 300),
  furniture("cabinet-1f", 2, 620),
  furniture("pillar-1f-w", 2, 1150, 20, 108),
  furniture("shelf-1f-m", 2, 1450),
  furniture("curtain-1f", 2, 1700, 12, 96),
  furniture("pillar-1f-e", 2, 2080, 20, 108),

  furniture("cabinet-2f-w", 1, 250),
  furniture("curtain-2f-w", 1, 560, 12, 96),
  furniture("shelf-2f-w", 1, 880),
  furniture("shelf-2f-m", 1, 1300),
  furniture("pillar-2f", 1, 1620, 20, 108),
  furniture("curtain-2f-e", 1, 1980, 12, 96),
  furniture("cabinet-2f-e", 1, 2260),

  furniture("crate-3f-w", 0, 300),
  furniture("beam-3f", 0, 820, 16, 60),
  furniture("crate-3f-m", 0, 1400),
  furniture("crate-3f-e", 0, 1650),
  furniture("beam-3f-e", 0, 2000, 16, 60),

  furniture("rack-b1-a", 3, 400),
  furniture("rack-b1-b", 3, 700),
  furniture("rack-b1-c", 3, 1000),
  furniture("rack-b1-d", 3, 1500),
  furniture("rack-b1-e", 3, 1800),
  furniture("rack-b1-f", 3, 2150),

  // 뛰어넘는 낮은 장애물. 순찰 복도에는 두지 않는다 — 경비는 지형 충돌을 하지
  // 않아서 상자를 통과해 버리고, 나만 못 넘는 물건이 복도 한가운데 서 있게 된다.
  crate("crate-3f-low", 0, 500),

  // 어두운 구역
  { id: "dark-b1", kind: "dark", rect: { x: 0, y: 3 * BAND_H, w: WORLD_W, h: BAND_H } },
  { id: "dark-attic", kind: "dark", rect: { x: 1750, y: 0, w: 650, h: BAND_H } },

  // 층간 시야가 통하는 유일한 구간. 3F 사다리 샤프트와 정확히 겹친다.
  { id: "atrium", kind: "visionHole", rect: { x: LADDER_3F_2F_X - 4, y: 0, w: 28, h: BAND_H * 4 } },

  // 구멍 뚜껑. 사다리 앞에서 ↑/↓를 누르면 사다리가 우선하므로 통행을 막지 않는다.
  hatch("hatch-3f", 0, LADDER_3F_2F_X - 4, 28),
  hatch("hatch-2f-ladder", 1, LADDER_2F_1F_X - 4, 28),
  hatch("hatch-2f-drop", 1, DROP_SHAFT_X, DROP_SHAFT_W),
  hatch("hatch-1f", 2, LADDER_1F_B1_X - 4, 28),

  // 낙하 구멍 아래의 원웨이 발판. 밟고 내려가면 조용하고, 그냥 떨어지면 자빠진다.
  { id: "plat-a", kind: "platform", rect: { x: 760, y: 2 * BAND_H + 52, w: 110, h: 8 } },
  { id: "plat-b", kind: "platform", rect: { x: 900, y: 2 * BAND_H + 108, w: 110, h: 8 } },
  { id: "plat-c", kind: "platform", rect: { x: 1300, y: 1 * BAND_H + 60, w: 120, h: 8 } },
];

/**
 * 사다리 규약: rect 의 아래 끝이 아래층 바닥면, rect.y + 캐릭터 키가 위층 바닥면이다.
 * MovementRules 가 발 위치를 이 구간으로 클램프하므로, 꼭대기에 도달하면
 * 위층 바닥면 높이에서 멈추고 좌우로 걸어 내려설 수 있다.
 *
 * 위층 슬래브에는 사다리를 감쌀 만큼만 구멍을 뚫는다. 구멍이 넓으면 꼭대기에서
 * 손을 놓는 순간 그대로 다시 떨어진다.
 */
export const LADDER_WIDTH = 20;
export const LADDER_HEAD_ROOM = 32;

function ladder(id: string, upperFloor: number, x: number): VerticalLink {
  const upperSurface = upperFloor * BAND_H + GROUND;
  const lowerSurface = (upperFloor + 1) * BAND_H + GROUND;
  const top = upperSurface - LADDER_HEAD_ROOM;
  return {
    id,
    kind: "ladder",
    rect: { x, y: top, w: LADDER_WIDTH, h: lowerSurface - top },
    guardUsable: true,
  };
}

const GREYBOX_LINKS: readonly VerticalLink[] = [
  ladder("ladder-3f-2f", 0, LADDER_3F_2F_X),
  ladder("ladder-2f-1f", 1, LADDER_2F_1F_X),
  ladder("ladder-1f-b1", 2, LADDER_1F_B1_X),
  {
    // 2F 서쪽에서 3F 동쪽으로. 적재율 70% 이상에서 막힌다.
    id: "vent-2f-3f",
    kind: "vent",
    rect: { x: 180, y: 1 * BAND_H + 130, w: 24, h: 38 },
    loadLimit: 0.7,
    exit: { x: 2100, y: 0 * BAND_H + GROUND },
    travelMs: 2200,
    guardUsable: false,
  },
];

const GREYBOX_HIDE_SPOTS: readonly HideSpot[] = [
  { id: "hide-wardrobe", rect: { x: 700, y: 2 * BAND_H + 128, w: 28, h: 40 }, searchWeight: 1 },
  { id: "hide-clock", rect: { x: 1400, y: 1 * BAND_H + 118, w: 24, h: 50 }, searchWeight: 0.8 },
  { id: "hide-crate-b1", rect: { x: 1900, y: 3 * BAND_H + 128, w: 28, h: 40 }, searchWeight: 0.6 },
];

const GREYBOX_GUARDS: readonly GuardSpawn[] = [
  // 1F 현관을 크게 도는 순찰병. 순찰 시작점은 스폰에서 충분히 떨어뜨린다 —
  // 침투 직후 아무 판단도 하기 전에 발각되면 발각이 플레이어의 실수로 읽히지 않는다.
  // 서쪽 회차점은 옷장을 충분히 지나친 뒤에 둔다. 경비가 옷장 바로 옆에서 돌아보면
  // 숨어서 보낸 뒤에도 등 뒤로 빠져나갈 시간이 없어 은신이 사실상 함정이 된다.
  { id: "g-1f", archetype: "patroller", floor: 2, route: [460, 1700], dwellMs: 1800, facing: 1 },
  // 2F 복도의 경비반장. 넓게 왕복하며 제자리 스캔을 섞는다.
  { id: "g-2f", archetype: "warden", floor: 1, route: [700, 1600], dwellMs: 2600, facing: -1 },
  // 3F 다락 입구를 지키는 고정 촛대. 완벽히 주기적이다.
  { id: "g-3f", archetype: "candelabra", floor: 0, route: [1500], dwellMs: 0, facing: 1 },
  // B1 금고 앞. 지하가 공짜가 되지 않게 한 명 둔다.
  { id: "g-b1", archetype: "patroller", floor: 3, route: [800, 1600], dwellMs: 2200, facing: 1 },
];

const GREYBOX_LOOT: readonly LootAnchor[] = [
  { id: "a-candle", lootId: "candlestick", at: { x: 240, y: 2 * BAND_H + GROUND - 10 } },
  { id: "a-silver", lootId: "silverware", at: { x: 1350, y: 2 * BAND_H + GROUND - 10 } },
  { id: "a-watch", lootId: "pocketwatch", at: { x: 650, y: 1 * BAND_H + GROUND - 10 } },
  { id: "a-book", lootId: "rarebook", at: { x: 1450, y: 1 * BAND_H + GROUND - 10 } },
  { id: "a-jewel", lootId: "jewelbox", at: { x: 2150, y: 1 * BAND_H + GROUND - 10 } },
  { id: "a-music", lootId: "musicbox", at: { x: 2050, y: 0 * BAND_H + GROUND - 10 } },
  { id: "a-vault", lootId: "vault", at: { x: 1150, y: 3 * BAND_H + GROUND - 10 } },
  { id: "a-decoy", lootId: "decoy", at: { x: 500, y: 3 * BAND_H + GROUND - 10 } },
];

const GREYBOX_ESCAPES: readonly EscapePoint[] = [
  // 정문은 안전하고 배수가 없다.
  { id: "front-door", kind: "door", facing: -1, name: "정문", rect: { x: 20, y: 2 * BAND_H + 120, w: 40, h: 48 }, bonusMul: 1 },
  // 옥상 창은 멀지만 배수가 크다. 굴뚝은 짧지만 적재가 막는다.
  { id: "roof-window", kind: "window", facing: 1, name: "옥상 창", rect: { x: 2300, y: 0 * BAND_H + 120, w: 40, h: 48 }, bonusMul: 1.25 },
  // 배수가 큰 이유는 적재 60% 제한의 손익분기가 ×1.49 이기 때문이다. 그 아래면
  // 정문보다 항상 손해라 아무도 고르지 않는다.
  { id: "chimney", kind: "chimney", facing: 1, name: "굴뚝", rect: { x: 900, y: 0 * BAND_H + 120, w: 28, h: 48 }, bonusMul: 1.8, loadLimit: 0.6 },
];

const GREYBOX_LAMPS: readonly Lamp[] = [
  { id: "lamp-1f-w", at: { x: 300, y: 2 * BAND_H + 40 }, radius: 160, snuffable: true },
  { id: "lamp-1f-e", at: { x: 1500, y: 2 * BAND_H + 40 }, radius: 160, snuffable: true },
  { id: "lamp-2f", at: { x: 900, y: 1 * BAND_H + 40 }, radius: 160, snuffable: true },
  { id: "lamp-b1", at: { x: 1200, y: 3 * BAND_H + 40 }, radius: 140, snuffable: true },
];

export const GREYBOX_LAYOUT: MansionLayout = {
  id: "greybox",
  name: "그레이박스 시험장",
  widthPx: WORLD_W,
  bands: GREYBOX_BANDS,
  geometry: GREYBOX_GEOMETRY,
  links: GREYBOX_LINKS,
  hideSpots: GREYBOX_HIDE_SPOTS,
  lamps: GREYBOX_LAMPS,
  environmentHazards: [],
  combatPockets: [],
  guards: GREYBOX_GUARDS,
  crowds: [],
  lootAnchors: GREYBOX_LOOT,
  escapes: GREYBOX_ESCAPES,
  spawn: { x: 60, y: 2 * BAND_H + GROUND - 20 },
};
