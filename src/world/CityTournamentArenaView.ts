import view from "./city-tournament-arena-view.json";
import type { CityPoint, CityPolygon, NativeCityDefinition } from "./NativeCityDefinition";

/**
 * The tournament ring's view (2026-10-19, `city-tournament-arena-view.json`): the plaza's midground V1 projection, actor height and
 * presentation with no ground (no walkable polygons, obstacles, stops or layers — the ring is a fixed line, its ends are its walls). The
 * arena scene and the bracket's headless bouts read it instead of the whole village world, which stays off the arena's direct link.
 */
export const CITY_TOURNAMENT_ARENA_VIEW: NativeCityDefinition = Object.freeze({
  version: view.version,
  presentation: "midground-plate",
  name: view.name,
  image: Object.freeze({ ...view.image }),
  projection: Object.freeze({ origin: view.projection.origin as unknown as CityPoint, x: view.projection.x as unknown as CityPoint,
    y: view.projection.y as unknown as CityPoint }),
  playBounds: view.playBounds as unknown as CityPolygon,
  focus: view.focus as unknown as CityPoint,
  spawn: view.spawn as unknown as CityPoint,
  actorHeightPx: view.actorHeightPx,
  walkablePolygons: Object.freeze([]),
  obstacles: Object.freeze([]),
  stops: Object.freeze([]),
  layers: Object.freeze([]),
});
