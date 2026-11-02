import { VILLAGE_FACILITY_ART } from "./VillageFacilityArt";
import currentBuildings from './native-city-current-building-art.json';
import {currentCityBuildingAssetPath} from './NativeCityCurrentBuildingArt';
import layeredVillage from "./village-layered.json";
import generationContract from "./village-iso-generation-contract.json";
import storyAtlases from "./village-story-atlases.json";
import npcBreathing from "./village-npc-breathing.json";
import environmentContract from "./village-environment-tile-contract.json";
import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";
import { OTHERWORLD_IMAGE_ASSETS } from "./OtherworldArtCatalog";

export interface VillageImageAsset {
  readonly key: string;
  readonly path: string;
  readonly w: number;
  readonly h: number;
  readonly transparent: boolean;
}

export interface VillageEnvironmentSpriteSheetAsset extends SpriteSheetAssetDefinition {
  readonly w: number;
  readonly h: number;
  readonly transparent: true;
  readonly renderScale: number;
  readonly frames: readonly string[];
}

export type VillageGrowthArtStage = "hideout" | "rising" | "notorious";

export interface VillageAmbientArtSet {
  readonly banner: VillageImageAsset;
  readonly foliage: VillageImageAsset;
  readonly smoke: VillageImageAsset;
}

export interface VillageSignageArtSet {
  /** 건물명 문자열은 런타임 현지화가 소유하고 ImageGen 원화는 빈 명판 재질만 제공한다. */
  readonly buildingNameplate: VillageImageAsset;
}

export type VillageIsoBuildingAssetId = "blackthorne-manor" | "royal-auction-house" | "thieves-guild" | "training-passage";
export type VillageIsoObjectAssetId = "magpie-fountain";
export type VillageIsoAssetId = VillageIsoBuildingAssetId | VillageIsoObjectAssetId;

export interface VillageIsoAssetSpec {
  readonly art: VillageImageAsset;
  readonly footprint: { readonly width: number; readonly depth: number };
  readonly elevationUnits: number;
  /** 제작 캔버스를 64×32 타일 풋프린트에 맞추는 자산별 고정 배율. */
  readonly renderScale: number;
  /** 원화 하단 불투명 접지 픽셀로 계측한 현관 계단 접지점. */
  readonly anchor: { readonly x: number; readonly y: number };
  /** 생성 계약의 소켓과 원화 등록점이 일치하므로 정상 자산은 (0, 0)이다. */
  readonly renderOffset: { readonly x: number; readonly y: number };
  /** 현관 원화 앵커에서 충돌·기초판의 최대 u/v 모서리까지의 타일 오프셋. */
  readonly footprintFrontOffset: { readonly u: number; readonly v: number };
  /** 입장 가능한 건물의 현관 통로를 어느 기초판 변에서 오릴지 지정한다. */
  readonly entranceNotchEdge: "front-corner" | "max-v";
  /** 배경·건물·충돌 검증이 공유하는 건물 부지 좌표. 현재 완성 후면에서는 별도 판으로 그리지 않는다. */
  readonly backgroundLot: {
    readonly centerTile: { readonly u: number; readonly v: number };
    readonly width: number;
    readonly depth: number;
  } | null;
  readonly collision: "footprint" | "none";
}

function villageImage(id: string, w: number, h: number, transparent = true): VillageImageAsset {
  return Object.freeze({
    key: `village-${id}`,
    path: `art/village/${id}.webp`,
    w,
    h,
    transparent,
  });
}

function villageEnvironmentSheet(
  spec: typeof environmentContract.terrain | typeof environmentContract.props | typeof environmentContract.edgeBuildings,
): VillageEnvironmentSpriteSheetAsset {
  return Object.freeze({
    key: `village-iso-${spec.runtime.id}`,
    path: spec.runtime.path,
    w: spec.runtime.frameWidth * spec.runtime.columns,
    h: spec.runtime.frameHeight * spec.runtime.rows,
    transparent: true,
    frameWidth: spec.runtime.frameWidth,
    frameHeight: spec.runtime.frameHeight,
    columns: spec.runtime.columns,
    rows: spec.runtime.rows,
    renderScale: spec.runtime.renderScale,
    frames: Object.freeze([...spec.frames]),
  });
}

/**
 * 같은 배치의 마을을 번영도별로 교체한다. 현재 단계의 통합 마스터만 내려받으며,
 * 판정 앵커는 VillageDefinition이 계속 소유한다.
 */
export const VILLAGE_ART = Object.freeze({
  growthStages: Object.freeze({
    hideout: villageImage("iso-v3/heist-haven-hideout-walkable-v4", 1920, 800, false),
    rising: villageImage("iso-v3/heist-haven-rising-walkable-v4", 1920, 800, false),
    notorious: villageImage("iso-v3/heist-haven-notorious-walkable-v4", 1920, 800, false),
  }),
});

/** 바람·수목·연기는 베이스 원화와 분리되어 성장 단계와 무관하게 재사용한다. */
export const VILLAGE_AMBIENT_ART: VillageAmbientArtSet = Object.freeze({
  banner: villageImage("village-banner-wind-v1", 512, 512),
  foliage: villageImage("village-foliage-sway-v1", 512, 512),
  smoke: villageImage("village-smoke-v1", 512, 512),
});

export const VILLAGE_SIGNAGE_ART: VillageSignageArtSet = Object.freeze({
  buildingNameplate: villageImage("village-building-nameplate-v1", 512, 111),
});

/** 64×32 지형, 한 칸 접지 소품, 3×2 보조 건축이 같은 피벗 규칙을 공유하는 V4 모듈 키트. */
export const VILLAGE_ENVIRONMENT_ART = Object.freeze({
  terrain: villageEnvironmentSheet(environmentContract.terrain),
  props: villageEnvironmentSheet(environmentContract.props),
  edgeBuildings: villageEnvironmentSheet(environmentContract.edgeBuildings),
});

export const VILLAGE_ENVIRONMENT_SPRITE_SHEETS: readonly VillageEnvironmentSpriteSheetAsset[] =
  Object.freeze(Object.values(VILLAGE_ENVIRONMENT_ART));

/** 완성된 후면 지면 위에는 바닥판 없는 소품만 합성한다. 지형·보조 건축은 후면 교체 때만 활성화한다. */
export const VILLAGE_RUNTIME_ENVIRONMENT_SPRITE_SHEETS: readonly VillageEnvironmentSpriteSheetAsset[] =
  Object.freeze([
    VILLAGE_ENVIRONMENT_ART.props,
  ]);

export function villageEnvironmentFrame(
  sheet: VillageEnvironmentSpriteSheetAsset,
  id: string,
): number {
  const frame = sheet.frames.indexOf(id);
  if (frame < 0) throw new Error(`village environment frame missing: ${id}`);
  return frame;
}

/** V3 선화 도시 후면의 빈 소켓에 결합하는 네 영웅 지구와 중앙 랜드마크. */
export const VILLAGE_ISO_ART = Object.freeze({
  buildings: Object.freeze({
    "blackthorne-manor": villageIsoV3Image(
      generationContract.assets["blackthorne-manor"].runtime.id,
      generationContract.assets["blackthorne-manor"].runtime.width,
      generationContract.assets["blackthorne-manor"].runtime.height,
    ),
    "royal-auction-house": villageIsoV3Image(
      generationContract.assets["royal-auction-house"].runtime.id,
      generationContract.assets["royal-auction-house"].runtime.width,
      generationContract.assets["royal-auction-house"].runtime.height,
    ),
    "thieves-guild": villageIsoV3Image(
      generationContract.assets["thieves-guild"].runtime.id,
      generationContract.assets["thieves-guild"].runtime.width,
      generationContract.assets["thieves-guild"].runtime.height,
    ),
    "training-passage": villageIsoV3Image(
      generationContract.assets["training-passage"].runtime.id,
      generationContract.assets["training-passage"].runtime.width,
      generationContract.assets["training-passage"].runtime.height,
    ),
  } satisfies Readonly<Record<VillageIsoBuildingAssetId, VillageImageAsset>>),
  objects: Object.freeze({
    "magpie-fountain": villageIsoV3Image(
      generationContract.assets["magpie-fountain"].runtime.id,
      generationContract.assets["magpie-fountain"].runtime.width,
      generationContract.assets["magpie-fountain"].runtime.height,
    ),
  } satisfies Readonly<Record<VillageIsoObjectAssetId, VillageImageAsset>>),
});

export const VILLAGE_ISO_IMAGE_ASSETS: readonly VillageImageAsset[] = Object.freeze([
  ...Object.values(VILLAGE_ISO_ART.buildings),
  VILLAGE_ISO_ART.objects["magpie-fountain"],
]);

const isoSpec = (
  art: VillageImageAsset,
  width: number,
  depth: number,
  elevationUnits: number,
  renderScale: number,
  groundAnchor: Readonly<{ x: number; y: number }>,
  collision: VillageIsoAssetSpec["collision"],
  renderOffset: Readonly<{ x: number; y: number }> = { x: 0, y: 0 },
  footprintFrontOffset: Readonly<{ u: number; v: number }> = { u: 0, v: 0 },
  entranceNotchEdge: VillageIsoAssetSpec["entranceNotchEdge"] = "front-corner",
  backgroundLot: VillageIsoAssetSpec["backgroundLot"] = null,
): VillageIsoAssetSpec => Object.freeze({
  art,
  footprint: Object.freeze({ width, depth }),
  elevationUnits,
  renderScale,
  // 투명 캔버스의 중심이 아니라 생성 계약으로 등록한 현관 계단 접지점이다.
  anchor: Object.freeze({ ...groundAnchor }),
  renderOffset: Object.freeze({ ...renderOffset }),
  footprintFrontOffset: Object.freeze({ ...footprintFrontOffset }),
  entranceNotchEdge,
  backgroundLot: backgroundLot === null ? null : Object.freeze({
    ...backgroundLot,
    centerTile: Object.freeze({ ...backgroundLot.centerTile }),
  }),
  collision,
});

/** 대형 화면에서 독립 지구·랜드마크가 후면 도시보다 과대해지지 않게 하는 공통 배율. */
export const VILLAGE_ISO_LANDMARK_SCALE = 0.7;

/** 네 독립 건물이 후면 도시의 지붕·빈 부지와 같은 축척으로 읽히게 하는 추가 배율. */
export const VILLAGE_ISO_BUILDING_SCALE = 0.7;

/** 건물 기단이 64×32 바닥 다이아몬드의 모서리에 놓이는 최소 서브타일 단위. */
export const VILLAGE_ISO_BUILDING_FOOTPRINT_STEP = 0.5;

/** 홀수 크기 기단도 외부 부지 중심에 놓을 수 있게 하는 배치 등록점의 최소 서브타일 단위. */
export const VILLAGE_ISO_BUILDING_PLACEMENT_STEP = 0.25;

/** 넓은 광장을 소유하는 핵심 시설만 기준 건물보다 더 큰 타일 점유율을 갖는다. */
export const VILLAGE_ISO_BUILDING_PRESENCE_SCALE = Object.freeze({
  "blackthorne-manor": 1.25,
  "royal-auction-house": 1.3,
  "thieves-guild": 1,
  "training-passage": 1,
} satisfies Readonly<Record<VillageIsoBuildingAssetId, number>>);

function scaledVillageIsoValue(value: number, localScale = 1): number {
  return Number((value * VILLAGE_ISO_LANDMARK_SCALE * localScale).toFixed(3));
}

function scaledVillageIsoBuildingFootprint(value: number, presenceScale: number): number {
  const scaled = scaledVillageIsoValue(value, VILLAGE_ISO_BUILDING_SCALE * presenceScale);
  return Number((
    Math.round(scaled / VILLAGE_ISO_BUILDING_FOOTPRINT_STEP)
    * VILLAGE_ISO_BUILDING_FOOTPRINT_STEP
  ).toFixed(3));
}

const isoLandmarkSpec = (
  art: VillageImageAsset,
  width: number,
  depth: number,
  elevationUnits: number,
  collision: VillageIsoAssetSpec["collision"],
  runtime: Readonly<{
    renderScale: number;
    anchor: Readonly<{ x: number; y: number }>;
    renderOffset: Readonly<{ x: number; y: number }>;
  }>,
  localScale = 1,
): VillageIsoAssetSpec => isoSpec(
  art,
  scaledVillageIsoValue(width, localScale),
  scaledVillageIsoValue(depth, localScale),
  elevationUnits,
  runtime.renderScale,
  runtime.anchor,
  collision,
  runtime.renderOffset,
);

const isoBuildingSpec = (
  art: VillageImageAsset,
  width: number,
  depth: number,
  elevationUnits: number,
  presenceScale: number,
  runtime: Readonly<{
    renderScale: number;
    anchor: Readonly<{ x: number; y: number }>;
    renderOffset: Readonly<{ x: number; y: number }>;
  }>,
  footprintOverride?: Readonly<{ width: number; depth: number }>,
  footprintFrontOffset: Readonly<{ u: number; v: number }> = { u: 0, v: 0 },
  entranceNotchEdge: VillageIsoAssetSpec["entranceNotchEdge"] = "front-corner",
  backgroundLot: VillageIsoAssetSpec["backgroundLot"] = null,
): VillageIsoAssetSpec => isoSpec(
  art,
  footprintOverride?.width ?? scaledVillageIsoBuildingFootprint(width, presenceScale),
  footprintOverride?.depth ?? scaledVillageIsoBuildingFootprint(depth, presenceScale),
  elevationUnits,
  runtime.renderScale,
  runtime.anchor,
  "footprint",
  runtime.renderOffset,
  footprintFrontOffset,
  entranceNotchEdge,
  backgroundLot,
);

/** 활성 V3 자산의 제작 캔버스·타일 풋프린트·높이 단일 원본. */
export const VILLAGE_ISO_ASSET_SPECS = Object.freeze({
  "blackthorne-manor": isoBuildingSpec(
    VILLAGE_ISO_ART.buildings["blackthorne-manor"],
    5,
    8,
    9,
    VILLAGE_ISO_BUILDING_PRESENCE_SCALE["blackthorne-manor"],
    generationContract.assets["blackthorne-manor"].runtime,
    {
      width: generationContract.assets["blackthorne-manor"].foundationSocket.uSpan,
      depth: generationContract.assets["blackthorne-manor"].foundationSocket.vSpan,
    },
    generationContract.assets["blackthorne-manor"].foundationSocket.frontOffsetFromActor,
    generationContract.assets["blackthorne-manor"].foundationSocket.entranceNotchEdge as VillageIsoAssetSpec["entranceNotchEdge"],
    generationContract.assets["blackthorne-manor"].backgroundLot,
  ),
  "royal-auction-house": isoBuildingSpec(
    VILLAGE_ISO_ART.buildings["royal-auction-house"],
    6,
    4,
    7,
    VILLAGE_ISO_BUILDING_PRESENCE_SCALE["royal-auction-house"],
    generationContract.assets["royal-auction-house"].runtime,
    {
      width: generationContract.assets["royal-auction-house"].foundationSocket.uSpan,
      depth: generationContract.assets["royal-auction-house"].foundationSocket.vSpan,
    },
    generationContract.assets["royal-auction-house"].foundationSocket.frontOffsetFromActor,
    generationContract.assets["royal-auction-house"].foundationSocket.entranceNotchEdge as VillageIsoAssetSpec["entranceNotchEdge"],
    generationContract.assets["royal-auction-house"].backgroundLot,
  ),
  "thieves-guild": isoBuildingSpec(
    VILLAGE_ISO_ART.buildings["thieves-guild"],
    5,
    4,
    6,
    VILLAGE_ISO_BUILDING_PRESENCE_SCALE["thieves-guild"],
    generationContract.assets["thieves-guild"].runtime,
    {
      width: generationContract.assets["thieves-guild"].foundationSocket.uSpan,
      depth: generationContract.assets["thieves-guild"].foundationSocket.vSpan,
    },
    generationContract.assets["thieves-guild"].foundationSocket.frontOffsetFromActor,
    generationContract.assets["thieves-guild"].foundationSocket.entranceNotchEdge as VillageIsoAssetSpec["entranceNotchEdge"],
    generationContract.assets["thieves-guild"].backgroundLot,
  ),
  "training-passage": isoBuildingSpec(
    VILLAGE_ISO_ART.buildings["training-passage"],
    4,
    3,
    3.5,
    VILLAGE_ISO_BUILDING_PRESENCE_SCALE["training-passage"],
    generationContract.assets["training-passage"].runtime,
    {
      width: generationContract.assets["training-passage"].foundationSocket.uSpan,
      depth: generationContract.assets["training-passage"].foundationSocket.vSpan,
    },
    generationContract.assets["training-passage"].foundationSocket.frontOffsetFromActor,
    generationContract.assets["training-passage"].foundationSocket.entranceNotchEdge as VillageIsoAssetSpec["entranceNotchEdge"],
    generationContract.assets["training-passage"].backgroundLot,
  ),
  "magpie-fountain": isoLandmarkSpec(
    VILLAGE_ISO_ART.objects["magpie-fountain"],
    4,
    4,
    2,
    "footprint",
    generationContract.assets["magpie-fountain"].runtime,
  ),
} satisfies Readonly<Record<VillageIsoAssetId, VillageIsoAssetSpec>>);

const storyImages:readonly VillageImageAsset[]=Object.values(storyAtlases).map(a=>({key:a.key,path:a.path,w:a.width,h:a.height,transparent:true}));
const npcBreathingImage: VillageImageAsset = { key: npcBreathing.key, path: npcBreathing.path,
  w: npcBreathing.width, h: npcBreathing.height, transparent: true };
export const VILLAGE_LAYERED_ASSETS: readonly VillageImageAsset[] = Object.freeze([...layeredVillage.assets.map(a=>({key:a.key,path:currentCityBuildingAssetPath(a.path),w:a.w,h:a.h,transparent:a.kind!=="ground"})), ...Object.values(VILLAGE_FACILITY_ART)]);
export const VILLAGE_IMAGE_ASSETS: readonly VillageImageAsset[] = Object.freeze([
  ...Object.values(VILLAGE_ART.growthStages),
  ...Object.values(VILLAGE_AMBIENT_ART),
  ...Object.values(VILLAGE_SIGNAGE_ART),
  ...VILLAGE_ISO_IMAGE_ASSETS,
  ...storyImages,
  npcBreathingImage,
  ...VILLAGE_LAYERED_ASSETS,
  ...OTHERWORLD_IMAGE_ASSETS,
]);

export function villageArtForGrowthStage(stage: VillageGrowthArtStage): VillageImageAsset {
  void stage;
  return VILLAGE_LAYERED_ASSETS.find(a=>a.key==='village-layer-ground-underpainting')!;
}

function villageIsoV3Image(id: string, w: number, h: number): VillageImageAsset {
  const current = id.startsWith('blackthorne-manor') ? currentBuildings.buildings.B142 : undefined;
  return Object.freeze({
    key: `village-iso-${id}`,
    path: current?.path ?? `art/village/iso-v3/${id}.webp`,
    w: current?.w ?? w,
    h: current?.h ?? h,
    // 옛 iso 오림 원화는 투명 캔버스지만, 그 자리를 잇는 최신 저택(B142) 정면은 불투명 면 원화다(11272eb2).
    transparent: current === undefined,
  });
}

/** LoadingScene과 VillageScene이 현재 단계의 무대와 공용 생동감 애셋만 요청하게 한다. */
export function villageImageAssetsForGrowthStage(
  stage: VillageGrowthArtStage,
): readonly VillageImageAsset[] {
  return Object.freeze([
    villageArtForGrowthStage(stage),
    ...storyImages,
    npcBreathingImage,
  ...VILLAGE_LAYERED_ASSETS.filter(a=>a.key!=='village-layer-ground-underpainting'),
    ...Object.values(VILLAGE_AMBIENT_ART),
    ...Object.values(VILLAGE_SIGNAGE_ART),
    ...VILLAGE_ISO_IMAGE_ASSETS,
    ...OTHERWORLD_IMAGE_ASSETS,
  ]);
}
