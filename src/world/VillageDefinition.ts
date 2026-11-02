import { VILLAGE_LAYERED_LAYOUT as concept, VILLAGE_TRAINING_ENTRY } from "./VillageFacilityLayout";
import {VILLAGE_CONCEPT_NAVIGATION} from "./VillageConceptNavigation";
import {
  VILLAGE_ISO_ASSET_SPECS,
  type VillageIsoAssetId,
} from "../assets/VillageArtCatalog";
import {
  VILLAGE_ISO_SCENE,
  villageIsoPlacement,
  villageIsoToWorld,
  type VillageIsoPlacement,
  type VillageIsoTilePoint,
} from "./VillageIsometric";
import { VILLAGE_PUBLIC_COURTS, villageRoadHalfWidth } from "./VillageGroundPlan";

/** 마을의 타일 지형·배치·표시 메타데이터. 렌더와 충돌 규칙이 함께 소비한다. */
export interface VillageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VillageEllipse {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

export interface VillagePoint {
  readonly x: number;
  readonly y: number;
}

export interface VillagePolygon {
  readonly id: string;
  readonly points: readonly VillagePoint[];
}

export interface VillageIsoTileRegion extends VillagePolygon {
  readonly tileBounds: {
    readonly minU: number;
    readonly minV: number;
    readonly maxU: number;
    readonly maxV: number;
  };
}

/** NPC와 QA가 공유하는 도로 중심선. halfWidth 안쪽만 포장도로로 간주한다. */
export interface VillageRoadLane {
  readonly id: string;
  readonly from: VillagePoint;
  readonly to: VillagePoint;
  readonly halfWidth: number;
}

export type VillageHouseId = "thieves-guild";

export interface VillageHouseDefinition {
  readonly id: VillageHouseId;
  readonly name: string;
  readonly availability: "coming-soon";
  readonly teaser: { readonly ko: string; readonly en: string };
  readonly bounds: VillageRect;
  readonly labelAnchor: VillagePoint;
}

function placementDisplayBounds(placement: VillageIsoPlacement): VillageRect {
  const a=concept.assets.find(a=>a.id===placement.id);
  if(a)return {x:a.x,y:a.y,width:a.w*a.scale,height:a.h*a.scale};
  const spec = VILLAGE_ISO_ASSET_SPECS[placement.asset];
  const anchor = villageIsoToWorld(placement.tile);
  const scale = spec.renderScale;
  return Object.freeze({
    x: anchor.x + spec.renderOffset.x - spec.anchor.x * scale,
    y: anchor.y + spec.renderOffset.y - spec.anchor.y * scale,
    width: spec.art.w * scale,
    height: spec.art.h * scale,
  });
}

function buildingDefinition(id: string, entranceRadius: number) {
  const placement = villageIsoPlacement(id);
  const bounds = placementDisplayBounds(placement);
  const entrancePoint = villageIsoToWorld(placement.tile);
  return Object.freeze({
    bounds,
    labelAnchor: Object.freeze({
      x: entrancePoint.x,
      // 시작 카메라의 80px 세로 이동과 상단 HUD 아래에서도 지붕 명판이 가려지지 않는다.
      y: id === "mansion"
        ? Math.max(108, bounds.y + Math.min(48, bounds.height * 0.14))
        : Math.max(164, bounds.y + Math.min(58, bounds.height * 0.18)),
    }),
    entrance: Object.freeze({ x: entrancePoint.x, y: entrancePoint.y + 6, radius: entranceRadius }),
  });
}

function buildingFoundationTileBounds(placement: VillageIsoPlacement): VillageIsoTileRegion["tileBounds"] {
  const spec = VILLAGE_ISO_ASSET_SPECS[placement.asset];
  const footprint = spec.footprint;
  const frontU = placement.tile.u + spec.footprintFrontOffset.u;
  const frontV = placement.tile.v + spec.footprintFrontOffset.v;
  return Object.freeze({
    minU: frontU - footprint.width,
    minV: frontV - footprint.depth,
    maxU: frontU,
    maxV: frontV,
  });
}

function tileRegionPolygon(
  id: string,
  tileBounds: VillageIsoTileRegion["tileBounds"],
): VillageIsoTileRegion {
  const corners: readonly VillageIsoTilePoint[] = [
    { u: tileBounds.minU, v: tileBounds.minV },
    { u: tileBounds.maxU, v: tileBounds.minV },
    { u: tileBounds.maxU, v: tileBounds.maxV },
    { u: tileBounds.minU, v: tileBounds.maxV },
  ];
  return Object.freeze({
    id,
    tileBounds,
    points: Object.freeze(corners.map((corner) => Object.freeze(villageIsoToWorld(corner)))),
  });
}

function footprintPolygon(placement: VillageIsoPlacement): VillagePolygon {
  const conceptFootprint=VILLAGE_CONCEPT_NAVIGATION.footprints[placement.id as keyof typeof VILLAGE_CONCEPT_NAVIGATION.footprints];
  if(conceptFootprint)return {id:placement.id,points:conceptFootprint.map(([x,y])=>({x:x!,y:y!}))};
  // The auction has two forward wings and a screen-facing central stair, not a max-v doorway.
  // Source-image ground contacts keep the whole visible stair apron open on both sides.
  if (placement.id === "auction-house") {
    const anchor = villageIsoToWorld(placement.tile);
    const spec = VILLAGE_ISO_ASSET_SPECS[placement.asset];
    return Object.freeze({ id: placement.id, points: Object.freeze([
      [272, 254], [525, 346], [412, 411], [322, 363],
      [222, 363], [128, 411], [12, 346],
    ].map(([x, y]) => Object.freeze({
      x: anchor.x + (x! - spec.anchor.x) * spec.renderScale,
      y: anchor.y + (y! - spec.anchor.y) * spec.renderScale,
    }))) });
  }
  // The workshop's southeast forecourt is open ground, not a solid foundation slab.
  if (placement.id === "tutorial") {
    const anchor = villageIsoToWorld(placement.tile);
    const spec = VILLAGE_ISO_ASSET_SPECS[placement.asset];
    return Object.freeze({ id: placement.id, points: Object.freeze([
      [29, 162], [171, 76], [304, 147], [255, 172], [190, 187], [78, 187],
    ].map(([x, y]) => Object.freeze({
      x: anchor.x + (x! - spec.anchor.x) * spec.renderScale,
      y: anchor.y + (y! - spec.anchor.y) * spec.renderScale,
    }))) });
  }
  const spec = VILLAGE_ISO_ASSET_SPECS[placement.asset];
  const footprint = spec.footprint;
  const isFrontAnchored = placement.role === "building";
  const { minU: backU, minV: backV, maxU: frontU, maxV: frontV } = buildingFoundationTileBounds(placement);
  const corners: readonly VillageIsoTilePoint[] = isFrontAnchored && placement.interactive
    ? spec.entranceNotchEdge === "max-v"
      ? [
        // 비대칭 블랙손은 현관 계단점과 기초판의 정면 모서리가 다르다. 기초판 전체를
        // 유지하되 지름 32px인 플레이어가 아이소 1타일(가로 32px)에 끼지 않도록
        // 실제 현관 중심을 둘러싼 max-v 변의 1.5타일 통로를 비운다.
        { u: backU, v: backV },
        { u: frontU, v: backV },
        { u: frontU, v: frontV },
        { u: Math.min(frontU, placement.tile.u + 0.75), v: frontV },
        { u: Math.min(frontU, placement.tile.u + 0.75), v: placement.tile.v },
        { u: Math.max(backU, placement.tile.u - 0.75), v: placement.tile.v },
        { u: Math.max(backU, placement.tile.u - 0.75), v: frontV },
        { u: backU, v: frontV },
      ]
      : [
        // 선언한 전체 기단을 보존하고 현관 앞 1×1 타일만 오려 낸다. 이전 사각형은
        // 양 축을 한 타일씩 줄여 모든 입장 건물의 실제 점유를 작게 판정했다.
        { u: backU, v: backV },
        { u: frontU, v: backV },
        { u: frontU, v: frontV - 1 },
        { u: frontU - 1, v: frontV - 1 },
        { u: frontU - 1, v: frontV },
        { u: backU, v: frontV },
      ]
    : isFrontAnchored
      ? [
        { u: backU, v: backV },
        { u: frontU, v: backV },
        { u: frontU, v: frontV },
        { u: backU, v: frontV },
      ]
    : [
      { u: placement.tile.u - footprint.width / 2, v: placement.tile.v - footprint.depth / 2 },
      { u: placement.tile.u + footprint.width / 2, v: placement.tile.v - footprint.depth / 2 },
      { u: placement.tile.u + footprint.width / 2, v: placement.tile.v + footprint.depth / 2 },
      { u: placement.tile.u - footprint.width / 2, v: placement.tile.v + footprint.depth / 2 },
    ];
  return Object.freeze({
    id: placement.id,
    points: Object.freeze(corners.map((corner) => {
      const point = villageIsoToWorld(corner);
      return Object.freeze(point);
    })),
  });
}

function polygonBounds(polygon: VillagePolygon): VillageRect {
  const xs = polygon.points.map((point) => point.x);
  const ys = polygon.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

const mansionBase = buildingDefinition("mansion", 62);
const mansion = Object.freeze({
  name: "블랙손 저택",
  ...mansionBase,
  /** 자동 보행이 멈추는 그 도어스텝(`approachMansion`)이 나올 때의 자리이기도 하다. */
  returnAt: Object.freeze({
    x: mansionBase.entrance.x,
    y: mansionBase.entrance.y + 40,
    facing: "down" as const,
  }),
});
const guildPlacement = villageIsoPlacement("thieves-guild");
const guildBounds = placementDisplayBounds(guildPlacement);
const houses: readonly VillageHouseDefinition[] = Object.freeze([Object.freeze({
  id: "thieves-guild" as const,
  name: "괴도 조합",
  availability: "coming-soon" as const,
  teaser: Object.freeze({ ko: "의뢰와 명성 보상", en: "Contracts & Renown" }),
  bounds: guildBounds,
  labelAnchor: Object.freeze({
    x: villageIsoToWorld(guildPlacement.tile).x,
    y: Math.max(164, guildBounds.y + Math.min(54, guildBounds.height * 0.18)),
  }),
})]);

// 현관점은 3.5타일 기단 안쪽에 있다. 플레이어 반지름을 포함한 바깥 통로에서
// 상호작용할 수 있도록 기단 확장분만큼 판정 반경을 보전한다.
const auctionBase = buildingDefinition("auction-house", 68);
const auctionFootprint = polygonBounds(footprintPolygon(villageIsoPlacement("auction-house")));
const auctionHouse = Object.freeze({
  name: "왕립 유물 경매관",
  ...auctionBase,
  returnAt: Object.freeze({
    // 이음매에서 왼쪽으로 12px — 문 앞에 정면으로 서면 스윙 대부분이 주인공 등에 가렸다. 한 발 비켜
    // 서야 오른쪽 문짝이 보이고, 걸음이 이음매로 비스듬히 들어간다(2026-09-24 리뷰).
    x: auctionBase.entrance.x - 12,
    // 확대된 기단 안에 착지하면 충돌 판정이 이동을 막아 걷기 프레임도 정지한다.
    y: auctionFootprint.y + auctionFootprint.height + VILLAGE_ISO_SCENE.player.radius + 1,
    facing: "left" as const,
  }),
});

/** 옮긴 회랑의 울타리·문턱은 건물 배치와 같은 등록점을 공유한다. */
const tutorialGate = VILLAGE_TRAINING_ENTRY.gate;
const tutorialDoorstep = VILLAGE_TRAINING_ENTRY.approach;
const tutorialBase = buildingDefinition("tutorial", 62);
const tutorialEntrance = Object.freeze({
  name: "연습 회랑",
  subtitle: "기초 잠입 훈련",
  ...tutorialBase,
  entrance: Object.freeze({ ...tutorialBase.entrance, ...tutorialDoorstep }),
  gate: tutorialGate,
  sideApproach: Object.freeze({
    // 아치 현관 앞 포장길에서 E·클릭 자동 보행이 멈춘다.
    ...tutorialDoorstep,
    radius: 58,
  }),
  /** 현관 앞에서 한 걸음 옆으로 비켜 나와 닫히는 문과 배우가 겹치지 않는다. */
  returnAt: Object.freeze({ ...VILLAGE_TRAINING_ENTRY.returnAt, facing: "down-right" as const }),
});

const fountainPlacement = villageIsoPlacement("fountain");
const fountainBounds = placementDisplayBounds(fountainPlacement);
const fountainAnchor = villageIsoToWorld(fountainPlacement.tile);
const fountainScale = concept.registration.scale;
const fountain = Object.freeze({
  name: "황금 까치 분수",
  bounds: fountainBounds,
  collision: Object.freeze({
    centerX: fountainAnchor.x,
    centerY: fountainAnchor.y - 30 * fountainScale,
    radiusX: 88 * fountainScale,
    radiusY: 34 * fountainScale,
  }),
});

const collisionPolygons = Object.freeze(VILLAGE_ISO_SCENE.placements
  .filter((placement) => (
    VILLAGE_ISO_ASSET_SPECS[placement.asset].collision === "footprint"
    && placement.id !== "fountain"
  ))
  .map(footprintPolygon));

const foundationRegions = Object.freeze(VILLAGE_ISO_SCENE.placements
  .filter((placement) => placement.role === "building")
  .map((placement) => tileRegionPolygon(placement.id, buildingFoundationTileBounds(placement))));

const lotRegions = Object.freeze(VILLAGE_ISO_SCENE.placements
  .filter((placement) => placement.role === "building")
  .map((placement) => {
    const lot = VILLAGE_ISO_ASSET_SPECS[placement.asset].backgroundLot;
    if (lot === null) throw new Error(`village building lot missing: ${placement.id}`);
    return tileRegionPolygon(placement.id, Object.freeze({
      minU: lot.centerTile.u - lot.width / 2,
      minV: lot.centerTile.v - lot.depth / 2,
      maxU: lot.centerTile.u + lot.width / 2,
      maxV: lot.centerTile.v + lot.depth / 2,
    }));
  }));

const roadLanes = Object.freeze(Object.entries(VILLAGE_CONCEPT_NAVIGATION.routes).flatMap(([id, points]) =>
  points.slice(1).map((to, index) => Object.freeze({
    id: `${id}-${index}`, from: { x: points[index]![0]!, y: points[index]![1]! },
    to: { x: to[0]!, y: to[1]! },
    halfWidth: villageRoadHalfWidth(id),
  }))));
const publicCourts = Object.freeze(VILLAGE_PUBLIC_COURTS.map(court => ({
  id: court.id, points: court.points.map(([x, y]: readonly [number, number]) => ({ x, y })),
})));

export const VILLAGE_DEFINITION = Object.freeze({
  regionName: "HEIST HAVEN",
  width: VILLAGE_ISO_SCENE.canvas.worldWidth,
  height: VILLAGE_ISO_SCENE.canvas.worldHeight,
  art: VILLAGE_ISO_SCENE.canvas,
  projection: VILLAGE_ISO_SCENE.projection,
  placements: VILLAGE_ISO_SCENE.placements,
  player: Object.freeze({
    radius: VILLAGE_ISO_SCENE.player.radius,
    walkSpeed: VILLAGE_ISO_SCENE.player.walkSpeed,
    spawn: {x:VILLAGE_CONCEPT_NAVIGATION.spawn[0]!,y:VILLAGE_CONCEPT_NAVIGATION.spawn[1]!},
  }),
  mansion,
  houses,
  auctionHouse,
  fountain,
  tutorialEntrance,
  roadLanes,
  publicCourts,
  lotRegions,
  foundationRegions,
  collisionPolygons,
  /** 직사각형 소비자·디버그 표시를 위한 파생 bounds이며 판정 원본은 collisionPolygons다. */
  colliders: Object.freeze(collisionPolygons.map(polygonBounds)),
});

export function villageIsoAssetSpec(id: VillageIsoAssetId) {
  return VILLAGE_ISO_ASSET_SPECS[id];
}
