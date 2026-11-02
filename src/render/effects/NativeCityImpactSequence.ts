import { NATIVE_CITY_COMBAT } from "../../sim/cityFight/NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { PALETTE } from "../art/palette";
import { cometPoints, crescentPoints, ellipsePoints } from "./CombatFxShapes";
import { ROPE_FX_RAMPS } from "./RopeTraversalFx";
import type { FxPrim } from "./FxPrim";
import type { NativeCityFxLayers, NativeCityFxProject, NativeCityImpactCue } from "./NativeCityCombatFx";
import type { NativeCityAttackTrailFrame, NativeCityTrailStroke } from "./NativeCityAttackTrail";
import { BALL_SMASH_FX, type NativeCitySmashDraw } from "./NativeCityBallSmashFx";
import { nativeCityOrthoActionTiming, type NativeCityOrthoActionClip } from "../art/NativeCityOrthoPack";
import { nativeCityWarpFightMs } from "../animation/NativeCityTempoWarp";
import type { NativeCityPlayerActionTimeline } from "../animation/NativeCityPlayerAction";

export interface NativeCityImpactMotionSample {
  readonly id: string;
  readonly point: CityPoint;
  readonly airborne: boolean;
  /** Shared simulation still owns this receiver's displacement (false excludes a resumed walk/chase). */
  readonly knocked?: boolean;
  /** World-pixel offset to the body's ground contact, for a drawn knockdown. */
  readonly landOffset?: readonly [number, number];
  /** An authored down/KO event owns its landing dust and sound; the shared sequence still draws the wake. */
  readonly landingHandled?: boolean;
  /** The simulation is moving a grounded body through its landing slide. */
  readonly groundedSlide?: boolean;
}
interface Trail { readonly point: CityPoint; readonly born: number; readonly airborne: boolean;
  readonly slide?: boolean; readonly offset?: readonly [number, number] }
interface Sequence {
  readonly cue: NativeCityImpactCue;
  age: number;
  point: CityPoint;
  travel: number;
  still: number;
  stopped: boolean;
  landed: number | null;
  airborne: boolean;
  flew: boolean;
  landingHandled: boolean;
  landOffset: readonly [number, number];
  landPoint?: CityPoint;
  trails: Trail[];
}

/** One receiver-bound sequence per body: freeze -> pressure release -> moving wake -> actual stop/landing.
 * Real roots drive the wake, including walls and stage bounds. No guessed endpoint or second simulation. */
export class NativeCityImpactSequence {
  private sequences: Sequence[] = [];

  clear(): void { this.sequences = []; }

  impact(cue: NativeCityImpactCue): void {
    if (!cue.victimId) return;
    // A fresh contact cancels the receiver's previous flight, including a light hit that interrupts it.
    this.sequences = this.sequences.filter(s => s.cue.victimId !== cue.victimId);
    if (cue.reducedMotion || cue.armored || cue.guarded || cue.dustOnly
      || (cue.skidUnits ?? 0) < cue.stepUnits * NATIVE_CITY_COMBAT.feel.fx.sequence.minTravelStrides) return;
    this.sequences.push({ cue, age: 0, point: cue.victim, travel: 0, still: 0, stopped: false, landed: null,
      airborne: false, flew: false, landingHandled: false, landOffset: [0, 0], trails: [] });
    if (this.sequences.length > 4) this.sequences.shift();
  }

  frame(dtMs: number, bodies: readonly NativeCityImpactMotionSample[]): void {
    const t = NATIVE_CITY_COMBAT.feel.fx.sequence, dt = Math.max(0, Number.isFinite(dtMs) ? dtMs : 0);
    this.sequences = this.sequences.filter(s => {
      const body = bodies.find(b => b.id === s.cue.victimId);
      if (!body) return false;
      s.age += dt;
      const smash = s.cue.technique === "ballSmash";
      if (s.age >= t.maxMs) return false;
      if (dt === 0) return true;
      const moved = Math.hypot(body.point[0] - s.point[0], body.point[1] - s.point[1]);
      // A teleport is a reset, never a flight trail or a landing across the scene.
      if (moved > Math.max(s.cue.stepUnits, s.cue.skidUnits ?? 0) * 1.5) return false;
      if (s.landed !== null) {
        // The landing cloud stays at first contact. Only actual grounded travel leaves a wake; a wall or freeze cannot emit it.
        const forward = (body.point[0] - s.point[0]) * s.cue.direction[0] + (body.point[1] - s.point[1]) * s.cue.direction[1];
        if (body.groundedSlide && forward > .002 * s.cue.stepUnits && moved > .002 * s.cue.stepUnits) {
          s.travel += moved;
          if (!s.trails.length || s.age - s.trails.at(-1)!.born >= t.trailEveryMs) {
            s.trails.push({ point: [...body.point], born: s.age, airborne: false, slide: true, offset: body.landOffset ?? [0, 0] });
          }
          s.point = [...body.point];
        }
        s.trails = s.trails.filter(p => s.age - p.born < (p.slide ? BALL_SMASH_FX.skidMs : smash ? BALL_SMASH_FX.wakeMs : t.trailLifeMs)).slice(-10);
        return s.age - s.landed < BALL_SMASH_FX.dustMs || s.trails.some(p => p.slide);
      }
      const touchedDown = s.airborne && !body.airborne;
      s.airborne = body.airborne; s.flew ||= body.airborne;
      s.landingHandled = body.landingHandled === true;
      if (touchedDown) {
        // Contact with the floor is the landing beat, even when a grounded skid continues or a wall stopped horizontal travel first.
        s.travel += moved;
        s.point = [...body.point]; s.landPoint = [...body.point]; s.landOffset = body.landOffset ?? [0, 0]; s.landed = s.age;
        return true;
      }
      if (s.stopped) {
        s.landOffset = body.landOffset ?? [0, 0];
        if (!body.airborne) s.landed = s.age;
        return true;
      }
      const forward = (body.point[0] - s.point[0]) * s.cue.direction[0] + (body.point[1] - s.point[1]) * s.cue.direction[1];
      if (s.travel > 0 && (body.knocked === false || forward < -.002 * s.cue.stepUnits)) {
        // Include the last forward displacement of the rule's knock, then stop following ordinary locomotion.
        if (forward >= 0) { s.travel += moved; s.point = [...body.point]; }
        s.stopped = true;
        s.landOffset = body.landOffset ?? [0, 0];
        if (!body.airborne) s.landed = s.age;
        return true;
      }
      s.travel += moved; s.still = moved > .002 * s.cue.stepUnits ? 0 : s.still + dt;
      if (moved > .002 * s.cue.stepUnits && (!s.trails.length || s.age - s.trails.at(-1)!.born >= t.trailEveryMs)) {
        s.trails.push({ point: [...body.point], born: s.age, airborne: body.airborne });
      }
      s.trails = s.trails.filter(p => s.age - p.born < (smash ? BALL_SMASH_FX.wakeMs : t.trailLifeMs)).slice(-10);
      s.point = [...body.point]; s.landOffset = body.landOffset ?? [0, 0];
      if (s.age > t.settleMs && s.still >= t.settleMs && !body.airborne) s.landed = s.age;
      return true;
    });
  }

  /** Compact diagnostic state, also useful for capture labels. */
  get snapshot() { return this.sequences.map(s => ({ id: s.cue.victimId, phase: s.landed !== null ? "land" : s.age === 0 ? "contact" : "travel",
    ageMs: s.age, travel: s.travel, point: s.point, trails: s.trails.length })); }

  landingFrames(project: NativeCityFxProject): NativeCitySmashDraw[] {
    return this.sequences.flatMap(s => {
      if (s.landed === null || s.landingHandled || !s.flew && s.travel < .05 * s.cue.stepUnits) return [];
      const [x, y] = project(s.landPoint ?? s.point);
      return [{ kind: "dust" as const, x: x + s.landOffset[0], y: y + s.landOffset[1],
        width: s.cue.bodyPx * Math.min(1.25, .65 + s.travel / s.cue.stepUnits * .17), ageMs: s.age - s.landed }];
    });
  }

  /** Small dust cels left on the floor behind a sliding body, never attached to its moving root. */
  skidFrames(project: NativeCityFxProject): NativeCitySmashDraw[] {
    return this.sequences.flatMap(s => s.trails.filter(p => p.slide).map(p => {
      const [x, y] = project(p.point), [aheadX] = project([p.point[0] + s.cue.direction[0], p.point[1] + s.cue.direction[1]]);
      return { kind: "skid" as const, x: x + (p.offset?.[0] ?? 0), y: y + (p.offset?.[1] ?? 0),
        width: s.cue.bodyPx * .65, ageMs: s.age - p.born, flipX: aheadX > x, alpha: .65 };
    }));
  }

  draw(project: NativeCityFxProject): NativeCityFxLayers {
    const out: NativeCityFxLayers = { ground: [], burst: [] }, t = NATIVE_CITY_COMBAT.feel.fx.sequence;
    const poly = (layer: FxPrim[], points: number[], color: number, alpha: number) => {
      if (alpha > .004) layer.push({ kind: "poly", additive: false, points, color, alpha: Math.min(1, alpha) });
    };
    for (const s of this.sequences) {
      const c = s.cue, size = c.bodyPx, [ox, oy] = project(c.victim);
      const smash = c.technique === "ballSmash", wakeMs = smash ? BALL_SMASH_FX.wakeMs : t.trailLifeMs;
      const [dx, dy] = project([c.victim[0] + c.direction[0], c.victim[1] + c.direction[1]]);
      const angle = Math.atan2(dy - oy, dx - ox), warm = ROPE_FX_RAMPS.warm;
      const edge = c.weaponKind === "sharp" ? PALETTE.throwSteel : warm[2]!;
      const ink = PALETTE.webtoonInk, paper = PALETTE.villagePavingPaper;
      // The pressure front opens only after the frozen contact releases; blunt blows keep rounded edges.
      const release = s.age / t.releaseMs;
      if (!smash && release > 0 && release < 1) {
        const radius = size * (.14 + .42 * release), cx = ox + Math.cos(angle) * size * .22 * release;
        const cy = oy - size * c.contactHeight + Math.sin(angle) * size * .22 * release;
        const from = angle - 1.1, to = angle + 1.1, width = size * (c.weaponKind === "blunt" ? .065 : .042) * (1 - release * .5);
        const fade = (1 - release) ** .65;
        poly(out.burst, crescentPoints(cx, cy, radius, radius * .72, from, to, width * 1.6, 22), ink, .8 * fade);
        poly(out.burst, crescentPoints(cx, cy, radius * .99, radius * .71, from, to, width, 22), edge, fade);
        poly(out.burst, crescentPoints(cx, cy, radius * .985, radius * .705, from, to, width * .38, 22), warm[0]!, fade);
      }
      // A paired wake follows the actual travelling body, leaving its face and strike contact visible.
      for (const p of s.trails) {
        if (p.slide) continue;
        const u = (s.age - p.born) / wakeMs;
        if (u >= 1) continue;
        const [px, py] = project(p.point), fade = (1 - u) ** 1.3;
        if (smash) {
          // Sparse pressure flecks carry the released force. No outlined rails or airborne foot dust.
          for (const height of [.24, .66]) {
            const length = size * .18 * (1 - .6 * u), width = size * .006;
            poly(out.burst, cometPoints(px, py - size * height, angle, length, width), PALETTE.villageStone, .4 * fade);
            poly(out.burst, cometPoints(px, py - size * height - width, angle, length * .8, width * .45), paper, .5 * fade);
          }
          continue;
        }
        for (const height of [.22, .72]) {
          const length = size * t.ribbonLength * (.45 + .55 * (1 - u));
          const width = size * t.ribbonWidth;
          poly(out.burst, cometPoints(px, py - size * height, angle, length, width * 1.5), ink, .35 * fade);
          poly(out.burst, cometPoints(px, py - size * height, angle, length * .96, width), paper, .8 * fade);
        }
        if (p.airborne) continue;
        const r = size * .04 * (1 + u), dustY = py - size * .05 * u;
        poly(out.ground, ellipsePoints(px, dustY, r * 1.3, r * .4, 14), PALETTE.villageStone, .24 * fade);
        poly(out.ground, ellipsePoints(px, dustY - r * .25, r, r * .38, 14), paper, .52 * fade);
      }
    }
    return out;
  }
}

export interface NativeCityHeavyFlowFrame {
  readonly ground?: CityPoint;
  readonly actorId?: string;
  readonly attackId?: number;
  readonly x: number;
  readonly y: number;
  readonly bodyPx: number;
  readonly side: -1 | 1;
  readonly timeMs: number;
  readonly strokes: readonly NativeCityTrailStroke[];
  readonly windups: readonly { readonly fromMs: number; readonly releaseMs: number; readonly anchor: CityPoint; readonly strength: number }[];
}

const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const point = (v: unknown): v is CityPoint => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n));

/**
 * The clip opts in with measured hand/boot paths and preparation steps. The existing action warp owns every time. A timeline with fewer
 * contacts than the clip draws strokes for takes the LAST ones (2026-10-18: the charged V plays only the clip's last contact, the kick);
 * a windup whose steps the timeline skips collapses to no time and never shows.
 */
export function nativeCityHeavyFlowSpec(clip: NativeCityOrthoActionClip, timeline: NativeCityPlayerActionTimeline)
  : Pick<NativeCityHeavyFlowFrame, "strokes" | "windups"> | null {
  const spec = record(clip.keys?.heavyFlow);
  // A V cut to its last blow (`nativeCityHeavyBlowFromStep`) plays the clip's last contacts: their strokes are the list's tail.
  const skipped = Array.isArray(spec?.strokes) ? spec.strokes.length - timeline.hitsMs.length : -1;
  if (!spec || !timeline.warp || !Array.isArray(spec.strokes) || !Array.isArray(spec.windups) || skipped < 0 || timeline.hitsMs.length === 0) return null;
  const cutAtMs = timeline.warp.art[0] ?? 0;
  const strokes: NativeCityTrailStroke[] = [];
  for (let i = 0; i < timeline.hitsMs.length; i++) {
    const s = record(spec.strokes[skipped + i]), releaseMs = timeline.contacts?.[i]?.releaseMs, hitMs = timeline.hitsMs[i]!;
    if (!s || !Array.isArray(s.path) || s.path.length < 2 || !s.path.every(point)
      || typeof s.width !== "number" || !Number.isFinite(s.width) || s.width <= 0 || releaseMs === undefined || releaseMs >= hitMs) return null;
    strokes.push({ hitMs, releaseMs, path: s.path, width: s.width, kind: "fist" });
  }
  const { startsMs } = nativeCityOrthoActionTiming(clip), windups: NativeCityHeavyFlowFrame["windups"][number][] = [];
  for (const value of spec.windups) {
    const w = record(value);
    if (!w || !Number.isInteger(w.fromSequenceIndex) || !Number.isInteger(w.releaseSequenceIndex) || !point(w.anchor)
      || typeof w.strength !== "number" || !Number.isFinite(w.strength) || w.strength <= 0 || w.strength > 1) return null;
    const start = startsMs[w.fromSequenceIndex as number], end = startsMs[w.releaseSequenceIndex as number];
    if (start === undefined || end === undefined || end <= start) return null;
    // A windup the cut skipped (it ends before the played steps) is not drawn.
    if (end <= cutAtMs) continue;
    windups.push({ fromMs: nativeCityWarpFightMs(timeline.warp, start), releaseMs: nativeCityWarpFightMs(timeline.warp, end),
      anchor: w.anchor, strength: w.strength });
  }
  return { strokes, windups };
}

/** Brief inward strokes on the planted preparation poses, including the reload before the final kick. */
export function nativeCityHeavyFlowPrims(f: NativeCityHeavyFlowFrame | null): FxPrim[] {
  if (!f) return [];
  const out: FxPrim[] = [], warm = ROPE_FX_RAMPS.warm, size = f.bodyPx;
  const poly = (points: number[], color: number, alpha: number) => {
    if (alpha <= .01) return;
    out.push({ kind: "poly", additive: false, points: points.map((v, i) => i % 2 ? f.y + v * size : f.x + f.side * v * size), color, alpha });
  };
  for (const w of f.windups) {
    const u = (f.timeMs - w.fromMs) / (w.releaseMs - w.fromMs);
    if (u <= 0 || u >= 1) continue;
    const fade = Math.sin(Math.PI * u) * w.strength;
    // Converge behind the raised knee/guard, away from the face and the opponent. Gone before the strike releases.
    for (const vertical of [-1, 1]) {
      const x = w.anchor[0] - .18 * (1 - u), y = w.anchor[1] + vertical * .14 * (1 - u), angle = -vertical * .45;
      poly(cometPoints(x, y, angle, .16, .014), PALETTE.webtoonInk, fade);
      poly(cometPoints(x, y, angle, .14, .006), warm[0]!, fade);
    }
  }
  return out;
}

export function nativeCityHeavyTrailFrame(f: NativeCityHeavyFlowFrame): NativeCityAttackTrailFrame {
  return { ...f, technique: "heavyFlurry" };
}
