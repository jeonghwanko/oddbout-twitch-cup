import { VILLAGE_LAYERED_LAYOUT as concept } from "./VillageFacilityLayout";
import type { VillageIsoAssetId } from "../assets/VillageArtCatalog";
import scene from "./village-isometric.scene.json";

export interface VillageIsoTilePoint {
  readonly u: number;
  readonly v: number;
}

export interface VillageIsoWorldPoint {
  readonly x: number;
  readonly y: number;
}

export interface VillageIsoPlacement {
  readonly id: string;
  readonly asset: VillageIsoAssetId;
  readonly tile: VillageIsoTilePoint;
  readonly role: "building" | "landmark";
  readonly interactive: boolean;
  readonly flipX: boolean;
}

export const VILLAGE_ISO_PROJECTION = Object.freeze({
  ...scene.projection,
  origin: Object.freeze({ ...scene.projection.origin }),
});

export function villageIsoToWorld(tile: VillageIsoTilePoint): VillageIsoWorldPoint {
  const projection = VILLAGE_ISO_PROJECTION;
  return Object.freeze({
    x: projection.origin.x + (tile.u - tile.v) * projection.tileWidth / 2,
    y: projection.origin.y + (tile.u + tile.v) * projection.tileHeight / 2,
  });
}

export function villageWorldToIso(point: VillageIsoWorldPoint): VillageIsoTilePoint {
  const projection = VILLAGE_ISO_PROJECTION;
  const dx = (point.x - projection.origin.x) / (projection.tileWidth / 2);
  const dy = (point.y - projection.origin.y) / (projection.tileHeight / 2);
  return Object.freeze({ u: (dy + dx) / 2, v: (dy - dx) / 2 });
}

const objectPlacements = scene.objects.map((object) => Object.freeze({
  id: object.id,
  asset: object.asset as VillageIsoAssetId,
  tile: Object.freeze((()=>{const a=concept.assets.find(a=>a.id===object.id);return a && typeof a.anchorX === "number" ? villageWorldToIso({x:a.anchorX,y:a.anchorY}) : {...object.tile};})()),
  role: object.role as VillageIsoPlacement["role"],
  interactive: object.interactive,
  flipX: "flipX" in object && object.flipX === true,
}));

export const VILLAGE_ISO_SCENE = Object.freeze({
  version: scene.version,
  canvas: Object.freeze({ ...scene.canvas }),
  projection: VILLAGE_ISO_PROJECTION,
  player: Object.freeze({
    radius: scene.player.radius,
    walkSpeed: scene.player.walkSpeed,
    spawnTile: Object.freeze({ ...scene.player.spawnTile }),
  }),
  placements: Object.freeze([...objectPlacements]),
});

export function villageIsoPlacement(id: string): VillageIsoPlacement {
  const placement = VILLAGE_ISO_SCENE.placements.find((candidate) => candidate.id === id);
  if (placement === undefined) throw new Error(`village iso placement missing: ${id}`);
  return placement;
}
