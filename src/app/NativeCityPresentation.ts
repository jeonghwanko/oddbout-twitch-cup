import type { MetaState } from "../sim/MetaProgressRules";
import { villageQuestLine } from "../sim/VillageQuestRules";
import { NATIVE_CITY_MOVEMENT, cityProject, type CityPoint, type CityStopId, type CityViewId, type NativeCityDefinition } from "../world/NativeCityDefinition";
import { NATIVE_CITY_PLAZA_STOP_NAMES } from "../world/NativeCityPlazaStops";
import { localeText, type Locale } from "./Locale";
import { nativeCityStoryObjective, type NativeCityStoryState } from "./NativeCityStory";
import type { VillageStorybook } from "./VillageStorybook";
import type { NativeCityTravel } from "../sim/NativeCityPortals";

/** Closer village framing makes actors about 10% of a 16:9 viewport's height. */
export const NATIVE_CITY_PLAZA_PRESENTATION = Object.freeze({ zoomScale: 2.4, actorHeight: 44, anchorX: 0.32, anchorY: 0.6 });

/** Independent comparison preview settings; the game never opts in implicitly. */
export const NATIVE_CITY_STUDY_PRESENTATION = Object.freeze({
  zoomScale: 2.2, wideZoomScale: 1.4, actorHeight: 52, anchorX: 0.5, anchorY: 0.6,
  lookAheadViewportFraction: 0.07, followTimeMs: 150,
});

/** 주민·쿠마 이름표 글자의 안쪽 여백(왼·위·오른·아래, px). 씬과 쿠마 조우가 함께 쓴다. */
export const NATIVE_CITY_NAME_TAG_PADDING = Object.freeze([4, 2, 4, 2] as const);
export interface NativeCityCameraFrame { readonly zoom: number; readonly centerX: number; readonly centerY: number }
export type NativeCityFraming = "close" | "wide";

/** Extra viewport space reveals more world; it must not move the perspective camera away. */
export function nativeCityLensViewportHeight(width: number, height: number, city: NativeCityDefinition): number {
  return Math.min(height, width * city.image.height / city.image.width);
}

/**
 * Bodies side by side in one frame (2026-10-18: the fight stage, a free conversation and the guard conflict each did this sum): the zoom
 * at which their screen points' (world px) horizontal span plus `padPx` of room (world px, both sides together) fills `width` (canvas
 * px), the middle of that span and the lowest foot. The caller clamps the zoom and places the height its own way.
 */
export function nativeCitySpanFrame(points: readonly (readonly [number, number])[], width: number, padPx: number):
  { readonly zoom: number; readonly centerX: number; readonly bottom: number } {
  let left = Infinity, right = -Infinity, bottom = -Infinity;
  for (const [x, y] of points) { left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  return { zoom: width / Math.max(1e-6, right - left + padPx), centerX: (left + right) / 2, bottom };
}

/** Gap between the talking actors' feet and the dialogue panel's top, in UI px (times the panel's UI scale). */
export const NATIVE_CITY_DIALOGUE_MARGIN_PX = 18;

/** Keep the talking actors above the live dialogue panel without changing angle or zoom. */
export function nativeCityDialogueCameraFrame(frame: NativeCityCameraFrame, viewportHeight: number,
  actorFootY: number, dialogueTop: number, margin: number): NativeCityCameraFrame {
  const actorScreenY = viewportHeight / 2 + (actorFootY - frame.centerY) * frame.zoom;
  const lift = Math.max(0, actorScreenY - dialogueTop + margin);
  return lift === 0 ? frame : { ...frame, centerY: frame.centerY + lift / frame.zoom };
}

function clampNativeCityCameraFrame(frame: NativeCityCameraFrame, width: number, height: number, city: NativeCityDefinition): NativeCityCameraFrame {
  const halfWidth = width / frame.zoom / 2, halfHeight = height / frame.zoom / 2;
  return { zoom: frame.zoom,
    centerX: Math.max(halfWidth, Math.min(city.image.width - halfWidth, frame.centerX)),
    centerY: Math.max(halfHeight, Math.min(city.image.height - halfHeight, frame.centerY)),
  };
}

/** Exponential follow has the same response for any partition of elapsed time at a fixed target. */
export function smoothNativeCityCameraFrame(previous: NativeCityCameraFrame | null, target: NativeCityCameraFrame,
  dtMs: number, width: number, height: number, city: NativeCityDefinition, reducedMotion = false): NativeCityCameraFrame {
  if (!previous || reducedMotion || city.presentation !== "registered-plate") return clampNativeCityCameraFrame(target, width, height, city);
  const blend = -Math.expm1(-Math.max(0, dtMs) / NATIVE_CITY_STUDY_PRESENTATION.followTimeMs);
  // Viewport changes use the new zoom immediately; old center coordinates are still safe after clamping.
  return clampNativeCityCameraFrame({ zoom: target.zoom,
    centerX: previous.centerX + (target.centerX - previous.centerX) * blend,
    centerY: previous.centerY + (target.centerY - previous.centerY) * blend,
  }, width, height, city);
}

export function nativeCityActorHeight(city: NativeCityDefinition): number {
  return city.presentation === "registered-plate" ? NATIVE_CITY_PLAZA_PRESENTATION.actorHeight : city.actorHeightPx;
}

/**
 * One ground (plan) speed for every heading (2026-10-16, user, "실제 공간 속도"): the pace a side walk crosses the screen
 * (`midgroundWalkBodyHeightsPerSec`) divided by σ1, the largest singular value of the plan → screen map (px per plan unit along
 * the camera's screen-horizontal ground axis). The side walk keeps its screen pace; at 16° a front/back walk crosses about 28% of
 * it on screen and a camera-relative diagonal about 78%. The old rule (the same SCREEN pace in every heading) made front/back
 * cross 3.6× more ground than the feet cover (docs/kaito-web/walk-feel-handoff-20261015.md). `direction` only guards a zero step.
 */
/**
 * σ1: screen px per plan unit along the camera's screen-horizontal ground axis — the scale a side walk crosses the screen at (a side
 * stride in screen px over it is its plan length). σ1² = F/2 + √((F/2)² − det²), F the squared Frobenius norm of [[x0, y0], [x1, y1]].
 */
export function nativeCityGroundPixelsPerPlanUnit(city: NativeCityDefinition): number {
  return groundPixelsPerPlanUnit(city.projection.x, city.projection.y);
}

/** σ1 of any plan → screen map whose plan axes land on screen as `x` and `y` (the city's projection, the shop's registered axes). */
export function groundPixelsPerPlanUnit(x: CityPoint, y: CityPoint): number {
  const half=(x[0]**2+y[0]**2+x[1]**2+y[1]**2)/2, det=x[0]*y[1]-y[0]*x[1];
  return Math.sqrt(half+Math.sqrt(Math.max(0,half*half-det*det)));
}

export function nativeCityDirectionalSpeed(city: NativeCityDefinition, direction: CityPoint,
  legacySpeed: number, actorHeight: number, gait: "walk" | "run"): number {
  if (city.presentation !== "midground-plate") return legacySpeed;
  if (Math.hypot(...direction)<1e-8) return legacySpeed;
  const pixelsPerPlanUnit=nativeCityGroundPixelsPerPlanUnit(city);
  if (pixelsPerPlanUnit<1e-8) return legacySpeed;
  const pace=actorHeight*NATIVE_CITY_MOVEMENT.midgroundWalkBodyHeightsPerSec;
  return pace*(gait==="run"?NATIVE_CITY_MOVEMENT.runSpeed/NATIVE_CITY_MOVEMENT.speed:1)/pixelsPerPlanUnit;
}

/** Compare screen-space follow without changing the existing game camera. */
export function nativeCityStudyCameraFrame(width: number, height: number, city: NativeCityDefinition,
  player: CityPoint = city.spawn, screenDirection: CityPoint = [0, 0], reducedMotion = false,
  framing: NativeCityFraming = "close"): NativeCityCameraFrame {
  if (city.presentation === "registered-plate") {
    const style = NATIVE_CITY_STUDY_PRESENTATION;
    const zoom = Math.max(width / city.image.width, height / city.image.height)
      * (framing === "wide" ? style.wideZoomScale : style.zoomScale);
    const [x, y] = cityProject(player, city);
    const directionLength = Math.hypot(screenDirection[0], screenDirection[1]);
    const lookAhead = !reducedMotion && directionLength > 0
      ? Math.min(width, height) * style.lookAheadViewportFraction / zoom / directionLength : 0;
    return clampNativeCityCameraFrame({ zoom,
      centerX: x + (0.5 - style.anchorX) * width / zoom + screenDirection[0] * lookAhead,
      centerY: y + (0.5 - style.anchorY) * height / zoom + screenDirection[1] * lookAhead,
    }, width, height, city);
  }
  return nativeCityCameraFrame(width, height, city, player);
}

/** Follow the player without exposing the edge of the registered plaza painting. */
export function nativeCityCameraFrame(width: number, height: number, city: NativeCityDefinition,
  player: CityPoint = city.spawn): NativeCityCameraFrame {
  if (city.presentation === "midground-plate") {
    return {zoom:Math.min(width/city.image.width,height/city.image.height),
      centerX:city.image.width/2,centerY:city.image.height/2};
  }
  if (city.presentation === "registered-plate") {
    const style = NATIVE_CITY_PLAZA_PRESENTATION;
    const zoom = Math.max(width / city.image.width, height / city.image.height) * style.zoomScale;
    const [x, y] = cityProject(player, city);
    const halfWidth = width / zoom / 2, halfHeight = height / zoom / 2;
    return { zoom,
      centerX: Math.max(halfWidth, Math.min(city.image.width - halfWidth, x + (0.5 - style.anchorX) * width / zoom)),
      centerY: Math.max(halfHeight, Math.min(city.image.height - halfHeight, y + (0.5 - style.anchorY) * height / zoom)),
    };
  }
  const zoom = Math.max(width / city.image.width, height / city.image.height);
  const points = city.focus ? [cityProject(city.focus, city)] : city.stops.map(stop => cityProject(stop.point, city));
  let focusX = (Math.min(...points.map(point => point[0])) + Math.max(...points.map(point => point[0]))) / 2;
  const focusY = (Math.min(...points.map(point => point[1])) + Math.max(...points.map(point => point[1]))) / 2;
  const halfWidth = width / zoom / 2, halfHeight = height / zoom / 2;
  // Narrow desktop panels crop the city. Preserve the first scene's landmark,
  // including its tower, instead of centring the now-secondary clockmaker.
  const manor = city.stops.some(stop => stop.id === "blackthorne") ? city.layers.find(layer => layer.id === "B142") : undefined;
  if (manor) {
    const minCenter = manor.x + manor.width + 24 - halfWidth;
    const maxCenter = manor.x - 24 + halfWidth;
    focusX = minCenter <= maxCenter ? Math.max(minCenter, Math.min(maxCenter, focusX)) : manor.x + manor.width / 2;
  }
  return { zoom,
    centerX: Math.max(halfWidth, Math.min(city.image.width - halfWidth, focusX)),
    centerY: Math.max(halfHeight, Math.min(city.image.height - halfHeight, focusY)),
  };
}

export function nativeCityViewName(view: CityViewId, locale: Locale): string {
  if (view === "V1") return localeText(locale, "블랙손 광장", "Blackthorne Square");
  if (view === "V2") return localeText(locale, "왕실 경매가", "Royal Auction Quarter");
  if (view === "V3") return localeText(locale, "항구와 세관", "Harbor and Customs");
  if (view === "V4") return localeText(locale, "상업지구", "Commerce Quarter");
  return localeText(locale, "대성당 지구", "Cathedral Quarter");
}

/** 정거장 이름의 영어판. 한국어는 월드 정의(`native-city-world.json` `stops[].label`)가 소유한다. */
const NATIVE_CITY_STOP_NAMES_EN: Readonly<Partial<Record<CityStopId, string>>> = Object.freeze({
  rosaline: "Rosaline's Boutique", plaza: "Plaza", clockmaker: "Clock Repair Shop", blackthorne: "Blackthorne Manor",
  training: "Practice Gallery", B143: "Golden Stag Relic Auction", "auction-service": "Auction Delivery Door",
  "pier-cargo": "Cargo Pier", B004: "Harbor Customs", "pier-passenger": "Passenger Pier", "trade-square": "Trade Square",
  B141: "City Hall & Guild Hall", B144: "Cathedral", north: "North Square", expedition: "Expedition road",
  gentleman: NATIVE_CITY_PLAZA_STOP_NAMES.gentleman.en, vending: NATIVE_CITY_PLAZA_STOP_NAMES.vending.en,
  board: NATIVE_CITY_PLAZA_STOP_NAMES.board.en,
});

export function nativeCityStopName(stop: { readonly id: CityStopId; readonly label: string }, locale: Locale): string {
  return localeText(locale, stop.label, NATIVE_CITY_STOP_NAMES_EN[stop.id] ?? stop.label);
}

export function nativeCityTransitionProgress(elapsedMs: number, durationMs: number, reducedMotion: boolean) {
  const linear = Math.max(0, Math.min(1, elapsedMs / Math.max(1, durationMs)));
  const fade = linear * linear * (3 - 2 * linear);
  return { fade, travel: reducedMotion ? 1 : fade };
}

/**
 * A view change's progress: the cross-fade of the two views' own objects (`fade`) and the camera's move between plates (`travel`, at
 * once under reduced motion). The P14 pilot (a push-in, depth parallax and a foreground canopy sweeping across between the plaza and
 * the commerce quarter) was removed on 2026-10-18 with the districts' shared plate: a district crossing is a walk, not a scene cut.
 */
export function nativeCityPortalPresentation(travel: NativeCityTravel | null, reducedMotion: boolean) {
  return travel ? nativeCityTransitionProgress(travel.elapsedMs, travel.durationMs, reducedMotion) : { fade: 0, travel: 0 };
}

/** A view's objects during a view change: the view left fades out as the view entered fades in. */
export function nativeCityViewAlpha(viewId: CityViewId, travel: NativeCityTravel | null,
  presentation: ReturnType<typeof nativeCityPortalPresentation>): number {
  if (!travel) return 1;
  return viewId === travel.from ? 1 - presentation.fade : presentation.fade;
}

export function nativeCityQuestRole(stop: CityStopId, locale: Locale): string {
  if (stop === "plaza") return localeText(locale, "배달원", "Courier");
  if (stop === "B141") return localeText(locale, "길드 기록 담당", "Guild clerk");
  if (stop === "pier-cargo") return localeText(locale, "화물 담당", "Dock foreman");
  if (stop === "B004") return localeText(locale, "세관 기록 담당", "Customs clerk");
  if (stop === "B143") return localeText(locale, "경매 감정 담당", "Auction appraiser");
  if (stop === "B144") return localeText(locale, "성당 기록 담당", "Cathedral archivist");
  return localeText(locale, "집사에게 대화", "Speak to the steward");
}

export interface NativeCityHudRect { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
/** Choose the nearest available label slot, keeping all screen guides in one collision layout. */
export function placeNativeCityHudLabel(preferred: { readonly x: number; readonly y: number }, size: { readonly width: number; readonly height: number },
  bounds: NativeCityHudRect, occupied: readonly NativeCityHudRect[], gap = 8): { x: number; y: number } {
  const halfW = size.width / 2, halfH = size.height / 2;
  const minX = bounds.left + halfW, maxX = Math.max(minX, bounds.right - halfW);
  const minY = bounds.top + halfH, maxY = Math.max(minY, bounds.bottom - halfH);
  const clampX = (x: number) => Math.max(minX, Math.min(maxX, x)), clampY = (y: number) => Math.max(minY, Math.min(maxY, y));
  const desired = { x: clampX(preferred.x), y: clampY(preferred.y) };
  const blockedAt = (x: number, y: number) => occupied.some(rect => x + halfW > rect.left - gap && x - halfW < rect.right + gap
    && y + halfH > rect.top - gap && y - halfH < rect.bottom + gap);
  // Every candidate lies inside the bounds, and the clamped point is the in-bounds point nearest the preference.
  // When it is free no candidate can beat it, so skip the search (most labels on most frames).
  if (!blockedAt(desired.x, desired.y)) return desired;
  const xs = [desired.x, minX, maxX, ...occupied.flatMap(rect => [clampX(rect.left - halfW - gap), clampX(rect.right + halfW + gap)])];
  const ys = [desired.y, minY, maxY, ...occupied.flatMap(rect => [clampY(rect.top - halfH - gap), clampY(rect.bottom + halfH + gap)])];
  let best = desired, distance = Number.POSITIVE_INFINITY;
  for (const x of xs) for (const y of ys) {
    if (blockedAt(x, y)) continue;
    const candidate = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
    if (candidate < distance) { distance = candidate; best = { x, y }; }
  }
  return best;
}

/** The existing Storybook window consumes the local case's records and current destination. */
export function nativeCityStorybook(state: NativeCityStoryState, locale: Locale, completed = false): VillageStorybook {
  const objective = nativeCityStoryObjective(state, locale);
  const conditions = [...objective.conditions, ...(completed ? [{ id: "native-city-manor", label: localeText(locale,
    "블랙손 정문에서 기록 조사를 마쳤다", "Finished the records investigation at Blackthorne's entrance"), done: true }] : [])];
  return { title: objective.heading, openChapterId: "native-city", collection: { collected: conditions.length, total: 8, complete: completed },
    chapters: [{ id: "native-city", number: 1, title: objective.heading, label: localeText(locale, "도시 기록 조사", "City records investigation"),
      status: completed ? "completed" : "writing", navigable: !completed,
      entries: conditions.map((condition, index) => ({ stepId: condition.id, title: localeText(locale, `기록 ${index + 1}`, `Record ${index + 1}`), text: condition.label })),
      current: completed ? null : { stepId: objective.key, quest: objective.title,
        detail: `${nativeCityViewName(objective.viewId, locale)} · ${objective.npcName}`, conditions: [{ id: objective.key, label: objective.npcName, done: false }] },
    }] };
}

/** Only destinations present in the native camera slice can receive quest guidance. */
export function nativeCityQuestTarget(meta: MetaState): CityStopId | null {
  const target = villageQuestLine(meta).active?.target;
  if (target === "merchant") return "rosaline";
  if (target === "gentleman") return "gentleman";
  if (target === "clockmaker") return "clockmaker";
  if (target === "manor") return "blackthorne";
  // The calling-card campaign leaves town through the side gate beside Blackthorne (`NativeCityExpeditionDoor`).
  if (target === "expedition") return "expedition";
  return null;
}
