import { ottoContactSpec, type OttoState } from "../../sim/cityFight/NativeCityOttoEncounter";
import { OTTO_GROUND_SLAM, ottoGroundRocks, ottoGroundSlams, type OttoGroundRock } from "../../sim/cityFight/NativeCityOttoGroundSlam";
import type { CityPoint } from "../../world/NativeCityDefinition";
import type { CityFightStageLine } from "../../sim/cityFight/CityFightStageLine";
import { smashDurationMs } from "../../assets/NativeCitySmashFxCatalog";
import type { NativeCitySmashDraw } from "./NativeCityBallSmashFx";


export const OTTO_SLAM_FX = Object.freeze({ shake: { px: 8, durationMs: 160, verticalShare: .9 },
  snagShake: { px: 3, durationMs: 100, verticalShare: .35 } });
export interface NativeCityOttoSlamCue {
  readonly feet: CityPoint;
  readonly direction: CityPoint;
  readonly rocks: readonly OttoGroundRock[];
  readonly ageMs: number;
  readonly bodyPx: number;
  readonly reducedMotion: boolean;
}

/** Read every frame, including hit-stop: a rising pile freezes on the exact simulation contact cel. */
export function ottoGroundSlamCue(state: OttoState, radius: number, bodyPx: number, reducedMotion: boolean,
  clear?: (from: CityPoint, to: CityPoint) => boolean, line?: CityFightStageLine | null): NativeCityOttoSlamCue | null {
  if (!ottoGroundSlams(state) || state.phase !== "active" && state.phase !== "recovery") return null;
  const ageMs = state.ms + (state.phase === "recovery" ? ottoContactSpec(state).activeMs : 0);
  if (ageMs >= smashDurationMs("ottoRock") + (OTTO_GROUND_SLAM.widths.length - 1) * OTTO_GROUND_SLAM.intervalMs) return null;
  return { feet: state.driveFrom ?? state.point, direction: state.aim, ageMs, bodyPx, reducedMotion,
    rocks: ottoGroundRocks(state, radius, clear, line) };
}

/** The rule clock owns every cell. Six shared footprints, no independent timer or duplicate impact. */
export class NativeCityOttoSlamFx {
  private cue: NativeCityOttoSlamCue | null = null;
  sync(cue: NativeCityOttoSlamCue | null): void { this.cue = cue; }
  clear(): void { this.cue = null; }
  draw(project: (point: CityPoint) => CityPoint): NativeCitySmashDraw[] {
    const cue = this.cue;
    if (!cue) return [];
    const from = project(cue.feet), toward = project([cue.feet[0] + cue.direction[0], cue.feet[1] + cue.direction[1]]);
    const commands: NativeCitySmashDraw[] = [];
    for (const rock of cue.rocks) {
      const age = cue.ageMs - rock.bornMs;
      if (age < 0 || age >= smashDurationMs("ottoRock")) continue;
      const [x, y] = project(rock.center);
      // Reduced motion still shows the dangerous pile, as a stationary readable silhouette.
      commands.push({ kind: "ottoRock", x, y, width: cue.bodyPx * rock.size,
        ageMs: cue.reducedMotion ? OTTO_GROUND_SLAM.hitDelayMs : age,
        flipX: toward[0] < from[0], alpha: Math.min(1, (smashDurationMs("ottoRock") - age) / 100) });
    }
    return commands;
  }
}
