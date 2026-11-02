import type { CityPoint } from "../../world/NativeCityDefinition";
import type { CityFightStageLine } from "../../sim/cityFight/CityFightStageLine";

/** Where the watching neighbours stand (`native-city-fighters.json` stage.spectators; lengths in strides). */
export interface NativeCitySpectatorSpec {
  /** Rows behind the stage line, nearest first: a watcher whose spot fails tries the next row back. */
  readonly depthStrides: readonly number[];
  /** The first watcher on each side stands this far along the line beyond the outer fighter (clear of both bodies on screen). */
  readonly clearStrides: number;
  /** The next watchers on that side, each this much further out. */
  readonly spreadStrides: number;
  /** The fight's middle — or its width — moves this far from where their spots were picked: they pick again (and shuffle over). */
  readonly repickStrides: number;
}

/** The fight's middle (plan) and its half width along the line: how far the outer fighter stands from the middle. */
export function nativeCityFightSpan(line: CityFightStageLine, bodies: readonly CityPoint[]): { readonly mid: CityPoint; readonly half: number } {
  if (bodies.length === 0) return { mid: line.origin, half: 0 };
  const mid: CityPoint = [bodies.reduce((sum, p) => sum + p[0], 0) / bodies.length, bodies.reduce((sum, p) => sum + p[1], 0) / bodies.length];
  const half = Math.max(...bodies.map(p => Math.abs((p[0] - mid[0]) * line.direction[0] + (p[1] - mid[1]) * line.direction[1])));
  return { mid, half };
}


export function nativeCitySpectatorSpots(line: CityFightStageLine, bodies: readonly CityPoint[], away: CityPoint, sides: readonly number[],
  strideUnits: number, spec: NativeCitySpectatorSpec, ok: (spot: CityPoint, index: number) => boolean): (CityPoint | null)[] {
  const [d0, d1] = line.direction, { mid, half } = nativeCityFightSpan(line, bodies);
  // The line's normal on the camera's far side (the camera turns square to the line, so `away` only picks the sign).
  const flip = -d1 * away[0] + d0 * away[1] >= 0 ? 1 : -1, n0 = -d1 * flip, n1 = d0 * flip;
  const taken = { [-1]: 0, [1]: 0 } as Record<number, number>;
  return sides.map((raw, index) => {
    const side = raw < 0 ? -1 : 1, ring = taken[side]!++;
    for (let out = 0; out <= 2; out++) {
      const along = side * (half + (spec.clearStrides + (ring + out) * spec.spreadStrides) * strideUnits);
      for (let row = out === 0 ? ring % 2 : 0; row < spec.depthStrides.length; row++) {
        const depth = spec.depthStrides[row]! * strideUnits;
        const at: CityPoint = [mid[0] + d0 * along + n0 * depth, mid[1] + d1 * along + n1 * depth];
        if (ok(at, index)) return at;
      }
    }
    return null;
  });
}
