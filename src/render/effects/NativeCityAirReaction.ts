import { clamp01 } from "../../sim/geom";
import type { KumaAir } from "../../sim/cityFight/NativeCityKumaAir";
import type { NativeCityAirReactionTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import AIR_CELLS from "../../assets/native-city-fighter-air-cells.json";



/** A fall cell's measure (`tools/art/measure-fighter-air-cells.py`): its head–feet axis, the source cell's head side, its middle, its turn limit. */
export interface NativeCityAirCell {
  /** The head–feet line's angle over the horizontal (deg); + head below the feet. 0 for a ball of a body. */
  readonly axisDeg: number;
  /** The head's side of the feet on the source (unflipped) cell: +1 right, -1 left. */
  readonly head: number;
  /** The drawn body's middle from its feet (body heights, source cell, y down). */
  readonly center: readonly [number, number];
  /** How far it may turn (deg). */
  readonly limitDeg: number;
}

const CELLS = (AIR_CELLS as unknown as { readonly clips: Readonly<Record<string, { readonly cells: Readonly<Record<string, NativeCityAirCell>> }>> }).clips;

/** The measure of cell `frame` of the fall clip keyed `clipKey` (its sheet key, or its first page's), or null (a pack not measured). */
export function nativeCityAirCell(clipKey: string, frame: number): NativeCityAirCell | null {
  return CELLS[clipKey]?.cells[String(frame)] ?? null;
}

/**
 * Where his flight's head–feet line should point now (deg, + head down): the spike's; rising, the rise's (held down to `riseFullShare` of the
 * launch's speed — an air blow's small lift still rises head up — then easing to the apex's); falling, by its speed. Null bouncing.
 */
export function nativeCityAirTarget(air: KumaAir, launchSpeed: number, t: NativeCityAirReactionTuning): number | null {
  if (air.bounced) return null;
  if (air.spiked) return t.spikeDeg;
  const speed = Math.max(1e-9, launchSpeed);
  if (air.vy > 0) return t.apexDeg + (t.riseDeg - t.apexDeg) * clamp01(air.vy / (speed * Math.max(1e-6, t.riseFullShare)));
  return t.apexDeg + (t.fallDeg - t.apexDeg) * clamp01(-air.vy / speed);
}


export function nativeCityAirTurnLimit(cell: NativeCityAirCell, spiked: boolean, t: NativeCityAirReactionTuning): number {
  const limit = Math.max(0, cell.limitDeg);
  return spiked ? Math.max(limit, Math.min(t.spikeLimitDeg, 2 * limit)) : limit;
}

/** The turn (deg, head down +) a cell needs to point at `target`, within `limit`; 0 without a target or a measure. */
export function nativeCityAirTurnWanted(cell: NativeCityAirCell | null, target: number | null, limit: number): number {
  if (!cell || target === null) return 0;
  return Math.max(-limit, Math.min(limit, target - cell.axisDeg));
}


export function nativeCityAirTurnCarried(turn: number, from: NativeCityAirCell | null, to: NativeCityAirCell | null, limit: number): number {
  if (!from || !to) return 0;
  return Math.max(-limit, Math.min(limit, turn + from.axisDeg - to.axisDeg));
}

/** The turn eased toward `wanted` at most `turnDegPerSec` on the fight clock (a freeze holds it); `snap`: at once. */
export function nativeCityAirTurnStep(turn: number, wanted: number, fightDtMs: number, snap: boolean, t: NativeCityAirReactionTuning): number {
  if (snap) return wanted;
  const most = t.turnDegPerSec * Math.max(0, fightDtMs) / 1000;
  return turn + Math.max(-most, Math.min(most, wanted - turn));
}

/** A staccato curve's share `ms` into it: each step `[ms, share]` held, then 0. */
function steps(curve: readonly (readonly [number, number])[], ms: number): number {
  let at = 0;
  for (const [length, share] of curve) {
    at += length;
    if (ms < at) return share;
  }
  return 0;
}

/**
 * The flinch of the air blow that last found him (not the launch, nor the spike or the bounce): the kick (deg) full from the freeze's first frame,
 * stepping home; the push (body heights) none on the freeze, out on the clock's first moving frame. `chained`: the blow before it was under
 * `chainMs` before — the short hold. `heavy`: a heavy blow's bigger kick and push.
 */
export function nativeCityAirFlinch(air: KumaAir, chained: boolean, heavy: boolean, t: NativeCityAirReactionTuning)
  : { readonly kickDeg: number; readonly pushBodies: number; readonly held: boolean } {
  if (air.bounced || air.spiked || air.hits === 0) return { kickDeg: 0, pushBodies: 0, held: false };
  const curve = chained ? t.chainSteps : t.kickSteps, share = steps(curve, air.sinceMs);
  const push = air.sinceMs > 0 ? steps(t.pushSteps, air.sinceMs) : 0;
  return { kickDeg: (heavy ? t.kickHeavyDeg : t.kickDeg) * share, pushBodies: (heavy ? t.pushHeavyBodies : t.pushBodies) * push,
    held: air.sinceMs < (curve[0]?.[0] ?? 0) };
}

/**
 * The offset (world px) that keeps the point `[px, py]` from the feet (world px, y down) where it was when the sprite turns `angleDeg`
 * (clockwise) about its feet.
 */
export function nativeCityPivotOffset(angleDeg: number, px: number, py: number): readonly [number, number] {
  const r = angleDeg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return [px - (px * c - py * s), py - (px * s + py * c)];
}
