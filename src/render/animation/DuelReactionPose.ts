/** Translation only. The authored body's proportions and floor pivot stay intact. */
export function duelAirborneLift(timeMs: number, impactMs: number, heightPx: number, reducedMotion: boolean): number {
  if (reducedMotion || !(impactMs > 0) || timeMs <= 0 || timeMs >= impactMs) return 0;
  const u = timeMs / impactMs;
  return heightPx * 4 * u * (1 - u);
}

/**
 * A flight's lift `lift` at `timeMs`; past a wall at `wallMs` (its flight stopped flat on the stage's end or a wall — the fighters'
 * `downWallMs`, Otto's `OttoKnock.wallMs`) it falls from the height it hit at to the floor by `impactMs`, gaining speed: a drop, not a climb
 * up the post and not a snap down (2026-10-20 review — the old skip of the fall's clock jumped the drawn fall). Absent: the plain arc.
 */
export function duelWallFallLift(lift: (timeMs: number) => number, timeMs: number, impactMs: number, wallMs?: number): number {
  if (wallMs === undefined || timeMs <= wallMs) return lift(timeMs);
  const span = impactMs - wallMs;
  if (!(span > 0) || timeMs >= impactMs) return 0;
  const u = (timeMs - wallMs) / span;
  return lift(wallMs) * (1 - u * u);
}

/**
 * A body springing back off a wall (2026-10-24, a bout's KO rope rebound): from `fromPx` (the height it hit at) it rises `risePx` more on an
 * arc and lands at `spanMs` — its fall straight down when there is no rise. `timeMs`: since the rebound.
 */
export function duelReboundLift(fromPx: number, risePx: number, timeMs: number, spanMs: number): number {
  if (!(spanMs > 0) || timeMs >= spanMs) return 0;
  const u = Math.max(0, timeMs / spanMs);
  return fromPx * (1 - u * u) + risePx * 4 * u * (1 - u);
}
