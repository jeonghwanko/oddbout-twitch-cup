import OTTO from "../../world/native-city-otto.json";
import type { CityPoint } from "../../world/NativeCityDefinition";
import type { OttoState } from "./NativeCityOttoEncounter";
import { cityFightStageSnap, type CityFightStageLine } from "./CityFightStageLine";

export const OTTO_GROUND_SLAM = OTTO.groundSlam;
type SlamState = Pick<OttoState, "pattern"> & Partial<Pick<OttoState, "comboBeat">>;
export function ottoGroundSlams(state: SlamState): boolean {
  return state.pattern === "drive" && state.comboBeat === 1 || state.pattern === "reverse" && state.comboBeat === 2;
}

export interface OttoGroundRock {
  readonly center: CityPoint;
  readonly direction: CityPoint;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly size: number;
  readonly bornMs: number;
}

/** One ground footprint for the warning, visible pile and collision. The source stays at the strike's planted feet. */
export function ottoGroundRocks(state: OttoState, radius: number,
  clear?: (from: CityPoint, to: CityPoint) => boolean, line?: CityFightStageLine | null): readonly OttoGroundRock[] {
  if (!ottoGroundSlams(state)) return [];
  const b = radius * 2, tuning = OTTO_GROUND_SLAM;
  const reach = (state.pattern === "drive" ? OTTO.lastHand : OTTO.chains.reverse[1]!).reachB * b;
  const origin = state.phase === "active" || state.phase === "recovery" ? state.driveFrom ?? state.point : state.point;
  const rocks: OttoGroundRock[] = [];
  for (let i = 0; i < tuning.widths.length; i++) {
    const distance = reach * (tuning.startReach + tuning.spacingReach * i), size = tuning.widths[i]!;
    const center: CityPoint = [origin[0] + state.aim[0] * distance, origin[1] + state.aim[1] * distance];
    if (line) {
      const snap = cityFightStageSnap(line, center);
      if (Math.hypot(snap[0] - center[0], snap[1] - center[1]) > 1e-5) break;
    }
    if (clear && !clear(origin, center)) break;
    rocks.push({ center, direction: state.aim, size, halfLength: b * tuning.halfLengthB * size,
      halfWidth: b * tuning.halfWidthB * size, bornMs: i * tuning.intervalMs });
  }
  return rocks;
}

export function ottoGroundRockPolygon(rock: OttoGroundRock): CityPoint[] {
  const [x, y] = rock.center, [dx, dy] = rock.direction, a = rock.halfLength, b = rock.halfWidth;
  return [[x - dx * a - dy * b, y - dy * a + dx * b], [x + dx * a - dy * b, y + dy * a + dx * b],
    [x + dx * a + dy * b, y + dy * a - dx * b], [x - dx * a + dy * b, y - dy * a - dx * b]];
}

/** Sweeps elapsed fight time so a slow frame cannot skip a rising pile. A collapsed pile never hits a late arrival. */
export function ottoRisingRockContact(rocks: readonly OttoGroundRock[], previousMs: number, nowMs: number,
  player: CityPoint, radius: number): OttoGroundRock | null {
  for (const rock of rocks) {
    const start = rock.bornMs + OTTO_GROUND_SLAM.hitDelayMs;
    if (nowMs < start || previousMs >= start + OTTO_GROUND_SLAM.hitWindowMs) continue;
    const x = player[0] - rock.center[0], y = player[1] - rock.center[1], [dx, dy] = rock.direction;
    const along = Math.max(0, Math.abs(x * dx + y * dy) - rock.halfLength);
    const across = Math.max(0, Math.abs(-x * dy + y * dx) - rock.halfWidth);
    if (along * along + across * across <= radius * radius) return rock;
  }
  return null;
}
