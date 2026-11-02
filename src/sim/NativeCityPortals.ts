import type { CityPoint, CityViewId, NativeCityPortal, NativeCityTransitionDefinition } from "../world/NativeCityDefinition";

export interface NativeCityTravel {
  readonly portalId: string; readonly from: CityViewId; readonly to: CityViewId;
  readonly elapsedMs: number; readonly durationMs: number;
}
/**
 * `travel`: a move between views on different plates (the far view's painting and the city) — the camera plays it and the town holds
 * for it. `fade`: a crossing between views on one plate (2026-10-18: all five districts share the midground plate) — it changed the
 * district at once and only cross-fades the districts' own objects (residents, name tags) for its duration; nothing holds for it.
 */
export interface NativeCityPortalState {
  readonly viewId: CityViewId; readonly travel: NativeCityTravel | null; readonly fade: NativeCityTravel | null;
  readonly settleMs: number; readonly lockedPortalId: string | null;
}
export const createNativeCityPortalState = (viewId: CityViewId = "V1"): NativeCityPortalState =>
  ({ viewId, travel: null, fade: null, settleMs: 0, lockedPortalId: null });

export function cityPortalNormal(portal: NativeCityPortal): CityPoint {
  const dx = portal.bAt[0] - portal.aAt[0], dy = portal.bAt[1] - portal.aAt[1], length = Math.hypot(dx, dy);
  return length > 0 ? [dx / length, dy / length] : [0, 0];
}
export function cityPortalDistance(portal: NativeCityPortal, point: CityPoint): number {
  const normal = cityPortalNormal(portal);
  return (point[0] - portal.at[0]) * normal[0] + (point[1] - portal.at[1]) * normal[1];
}
/** A narrow oriented threshold: moving nearby or along the road edge never changes cameras. */
export function cityPortalCrossed(portal: NativeCityPortal, viewId: CityViewId, from: CityPoint, to: CityPoint, halfWidth: number): boolean {
  if (viewId !== portal.a && viewId !== portal.b) return false;
  const d0 = cityPortalDistance(portal, from), d1 = cityPortalDistance(portal, to);
  if (viewId === portal.a ? !(d0 <= 0 && d1 > 0) : !(d0 >= 0 && d1 < 0)) return false;
  const fraction = d0 / (d0 - d1), normal = cityPortalNormal(portal);
  const x = from[0] + (to[0] - from[0]) * fraction - portal.at[0];
  const y = from[1] + (to[1] - from[1]) * fraction - portal.at[1];
  return Math.abs(-normal[1] * x + normal[0] * y) <= halfWidth;
}

/**
 * One step of the portals. `sharePlate(from, to)`: the two views are one plate — a crossing between them lands at once (`fade`), not a
 * `travel`. Omitted, every crossing travels.
 */
export function stepNativeCityPortals(state: NativeCityPortalState, from: CityPoint, to: CityPoint, dtMs: number,
  portals: readonly NativeCityPortal[], tuning: NativeCityTransitionDefinition, blocked: boolean, reducedMotion: boolean,
  selectedPortalId?: string | null, sharePlate?: (from: CityViewId, to: CityViewId) => boolean): NativeCityPortalState {
  const dt = Math.max(0, Math.min(50, dtMs));
  const fade = state.fade && state.fade.elapsedMs + dt < state.fade.durationMs ? { ...state.fade, elapsedMs: state.fade.elapsedMs + dt } : null;
  // A dialogue or a menu holds crossings — not a cross-fade already under way (it would freeze the district left half-faded).
  if (blocked) return state.fade === null ? state : { ...state, fade };
  if (state.travel) {
    const elapsedMs = Math.min(state.travel.durationMs, state.travel.elapsedMs + dt);
    return elapsedMs < state.travel.durationMs ? { ...state, fade, travel: { ...state.travel, elapsedMs } }
      : { viewId: state.travel.to, travel: null, fade, settleMs: tuning.settleMs, lockedPortalId: state.travel.portalId };
  }
  const settleMs = Math.max(0, state.settleMs - dt);
  let lockedPortalId = state.lockedPortalId;
  const locked = portals.find(portal => portal.id === lockedPortalId);
  // An exit route may cross other thresholds inside overlapping camera footprints.
  // Undefined leaves manual walking open; null keeps an NPC approach in its current view.
  const open = (portal: NativeCityPortal) => selectedPortalId === undefined || portal.id === selectedPortalId;
  const cross = (portal: NativeCityPortal): NativeCityPortalState => {
    const move: NativeCityTravel = { portalId: portal.id, from: state.viewId, to: state.viewId === portal.a ? portal.b : portal.a,
      elapsedMs: 0, durationMs: reducedMotion ? tuning.reducedDurationMs : tuning.durationMs };
    // One plate: the district changes on the threshold (and settles there like an arrival), its objects cross-fade.
    if (sharePlate?.(move.from, move.to)) return { viewId: move.to, travel: null, fade: move, settleMs: tuning.settleMs, lockedPortalId: portal.id };
    return { viewId: state.viewId, settleMs: 0, lockedPortalId: portal.id, travel: move, fade };
  };
  // The lock keeps the threshold from flickering: it lets go once he is a band (`hysteresisPlanUnits`) deep into the new side. Back the
  // same band across the portal he came through, the district follows him back — the lock never holds the old district (2026-10-18:
  // crossed and turned straight back, he stood in V1 with V4's residents, and no path into V1 let go of it).
  if (locked && settleMs === 0) {
    const depth = (state.viewId === locked.b ? 1 : -1) * cityPortalDistance(locked, to);
    if (depth >= tuning.hysteresisPlanUnits) lockedPortalId = null;
    else if (depth <= -tuning.hysteresisPlanUnits && open(locked)) return cross(locked);
  }
  if (settleMs > 0) return { ...state, fade, settleMs, lockedPortalId };
  const crossed = portals.find(portal => open(portal)
    && portal.id !== lockedPortalId && cityPortalCrossed(portal, state.viewId, from, to, portal.triggerHalfWidth ?? tuning.triggerHalfWidth));
  return crossed ? cross(crossed) : { ...state, fade, settleMs, lockedPortalId };
}

/** Shortest open road itinerary; this chooses exits, never relocates the actor. */
export function nativeCityPortalRoute(from: CityViewId, to: CityViewId, portals: readonly NativeCityPortal[]): readonly NativeCityPortal[] {
  if (from === to) return [];
  const queue: { view: CityViewId; path: NativeCityPortal[] }[] = [{ view: from, path: [] }], visited = new Set<CityViewId>([from]);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]!;
    for (const portal of portals) {
      const next = portal.a === node.view ? portal.b : portal.b === node.view ? portal.a : null;
      if (next === null || visited.has(next)) continue;
      const path = [...node.path, portal];
      if (next === to) return path;
      visited.add(next); queue.push({ view: next, path });
    }
  }
  return [];
}
