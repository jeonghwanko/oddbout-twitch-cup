import { NATIVE_CITY_OTTO_ID } from "../../sim/cityFight/NativeCityOttoEncounter";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { PALETTE } from "../art/palette";
import { cometPoints, crescentPoints, ribbonPoints, sparklePoints } from "./CombatFxShapes";
import { pushFxPoly, type FxPrim } from "./FxPrim";
import { nativeCityTrailLifeMs, nativeCityTrailTipAt, type NativeCityAttackTrailFrame } from "./NativeCityAttackTrail";
import { NativeCityAttackTrailSequence } from "./NativeCityAttackTrailSequence";
import type { NativeCityFxProject } from "./NativeCityCombatFx";

/** Otto's seizure and enforcement share an iron/gold brush. Other weapons keep their drawn smear. */
export function isOttoComboTrail(f: NativeCityAttackTrailFrame): boolean {
  return f.actorId === NATIVE_CITY_OTTO_ID && (f.technique === "sweep" || f.technique === "reverse");
}

/** The view encodes execution * 3 + beat, so a held contact cannot restart its ribbon. */
export function ottoComboBladePrims(frame: NativeCityAttackTrailFrame | null): FxPrim[] {
  if (!frame) return [];
  const out: FxPrim[] = [], beat = (frame.attackId ?? 0) % 3, b = frame.bodyPx;
  const enforcement = frame.technique === "reverse", turning = !enforcement && beat === 2;
  for (const s of frame.strokes) {
    const since = frame.timeMs - s.releaseMs, after = frame.timeMs - s.hitMs, life = nativeCityTrailLifeMs(s);
    if (since <= 0 || after >= life) continue;
    const u = Math.min(1, since / Math.max(1, s.hitMs - s.releaseMs));
    // The filmed return cuts rapidly through the foreshortened front pose; its brush must not lag like a projectile.
    const returning = enforcement && beat === 1 && s.path.at(-1)![0] < 0;
    const head = u ** (returning ? .35 : turning ? 1.25 : enforcement ? 1.7 : 2.2), fade = (1 - Math.max(0, after) / life) ** .7;
    const tail = Math.max(turning ? head - .48 : 0, Math.max(0, after - 12) / (life - 12));
    if (tail >= head) continue;
    const at = (v: number, spread = 1): CityPoint => {
      const [x, y] = nativeCityTrailTipAt(s.path, v);
      return [frame.x + frame.side * x * b * spread, frame.y + ((y + .65) * spread - .65) * b];
    };
    const width = b * (enforcement ? [ .17, .14, .23 ] : [ .15, .105, .19 ])[beat]!;
    // Split brush strokes: a broad iron edge, amber blade, narrow hot cutting line. The centre stays empty.
    for (let band = turning ? 1 : 0; band >= 0; band--) {
      const spine: number[] = [];
      for (let n = 0; n <= 32; n++) spine.push(...at(tail + (head - tail) * n / 32, band ? 1.14 : 1));
      const w = width * (band ? .28 : 1), opacity = band ? .64 : 1;
      for (const [scale, color, alpha] of [[1.2, PALETTE.webtoonInk, .9], [1, PALETTE.combatNeonOrange, 1],
        [.63, PALETTE.combatNeonYellow, 1], [.15, PALETTE.combatNeonCore, 1]] as const) {
        pushFxPoly(out, ribbonPoints(spine, v => w * scale * Math.sin(Math.PI * v) ** .7 * fade), color, alpha * opacity * fade);
      }
    }
    // Hot iron at the hook tip, small enough to leave both hands and the contact drawing readable.
    const [hx, hy] = at(head);
    pushFxPoly(out, sparklePoints(hx, hy, b * .095 * fade, b * .045 * fade, .08, frame.side * -.35), PALETTE.combatNeonYellow, .95 * fade);
    pushFxPoly(out, sparklePoints(hx, hy, b * .052 * fade, b * .025 * fade, .08), PALETTE.combatNeonCore, fade);
    for (let i = 0; i < (beat === 2 ? 7 : 4); i++) {
      const v = head - .055 - i * .065;
      if (v <= tail) continue;
      const [x, y] = at(v, 1.09 + (i % 2) * .05), [nx, ny] = at(Math.min(1, v + .025), 1.09 + (i % 2) * .05);
      const a = Math.atan2(ny - y, nx - x), length = b * (.065 + (i % 3) * .02) * fade;
      pushFxPoly(out, cometPoints(x, y, a, length, b * .025 * fade), PALETTE.webtoonInk, .8 * fade);
      pushFxPoly(out, cometPoints(x, y, a, length * .86, b * .014 * fade), PALETTE.combatNeonYellow, fade);
    }
  }
  return out;
}

export interface OttoComboContactCue {
  readonly key: number;
  readonly beat: number;
  readonly feet: CityPoint;
  readonly direction: CityPoint;
  readonly bodyPx: number;
  readonly height: number;
  readonly reducedMotion: boolean;
}
export interface OttoSeizureLandingCue {
  readonly feet: CityPoint;
  readonly bodyPx: number;
  readonly reducedMotion: boolean;
}
interface Burst<T> { readonly cue: T; ageMs: number; fresh: boolean }

/** Decorative sparks answer confirmed hits; floor rings answer the actual landing event. Neither infers damage from a pose. */
export class NativeCityOttoComboFx {
  private readonly trails = new NativeCityAttackTrailSequence(ottoComboBladePrims);
  private contacts: Burst<OttoComboContactCue>[] = [];
  private landings: Burst<OttoSeizureLandingCue>[] = [];
  private seen = new Set<number>();

  clear(): void { this.trails.clear(); this.contacts = []; this.landings = []; this.seen.clear(); }
  update(frames: readonly NativeCityAttackTrailFrame[], project: NativeCityFxProject, reducedMotion: boolean): void {
    if (reducedMotion) { this.clear(); return; }
    this.trails.update(frames.filter(isOttoComboTrail), project);
  }
  contact(cue: OttoComboContactCue): void {
    if (cue.reducedMotion || this.seen.has(cue.key)) return;
    this.seen.add(cue.key);
    while (this.seen.size > 96) this.seen.delete(this.seen.values().next().value!);
    this.contacts.push({ cue: { ...cue, feet: [...cue.feet], direction: [...cue.direction] }, ageMs: 0, fresh: true });
    this.contacts = this.contacts.slice(-6);
  }
  land(cue: OttoSeizureLandingCue): void {
    if (!cue.reducedMotion) this.landings.push({ cue: { ...cue, feet: [...cue.feet] }, ageMs: 0, fresh: true });
    this.landings = this.landings.slice(-3);
  }
  frame(dtMs: number): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    this.trails.frame(dt);
    for (const burst of [...this.contacts, ...this.landings]) {
      if (burst.fresh) burst.fresh = false;
      else burst.ageMs += dt;
    }
    this.contacts = this.contacts.filter(c => c.ageMs < 220);
    this.landings = this.landings.filter(c => c.ageMs < 290);
  }
  draw(project: NativeCityFxProject): FxPrim[] {
    const out = this.trails.draw(project);
    for (const { cue: c, ageMs } of this.contacts) {
      const [x, py] = project(c.feet), y = py - c.height * c.bodyPx;
      const [dx, dy] = project([c.feet[0] + c.direction[0], c.feet[1] + c.direction[1]]);
      const direction = Math.atan2(dy - py, dx - x), b = c.bodyPx, u = ageMs / 220, fade = (1 - u) ** 1.4;
      const strength = c.beat === 2 ? 1.3 : c.beat === 0 ? 1 : .75;
      // Broken outer arcs frame the original contact art; no second opaque flash on the victim's body.
      for (let i = 0; i < 2; i++) {
        const start = direction + (i ? 1.8 : -1.4), r = b * (.22 + u * .42) * strength;
        for (const [w, color, alpha] of [[.036, PALETTE.webtoonInk, .8], [.019, PALETTE.combatNeonYellow, 1]] as const) {
          pushFxPoly(out, crescentPoints(x, y, r, r * .86, start, start + 1.15, b * w * fade), color, alpha * fade);
        }
      }
      for (let i = 0; i < (c.beat === 2 ? 11 : c.beat === 0 ? 7 : 5); i++) {
        const angle = direction + (i % 2 ? -1 : 1) * (.25 + (i % 6) * .32);
        const travel = b * (.15 + u * (.65 + (i % 3) * .17)) * strength;
        const hx = x + Math.cos(angle) * travel, hy = y + Math.sin(angle) * travel + b * u * u * .25;
        const length = b * (.1 + (i % 3) * .035) * fade;
        pushFxPoly(out, cometPoints(hx, hy, angle, length, b * .029 * fade), PALETTE.webtoonInk, .8 * fade);
        pushFxPoly(out, cometPoints(hx, hy, angle, length * .88, b * .016 * fade), PALETTE.combatNeonYellow, fade);
        if (i % 3 === 0) pushFxPoly(out, sparklePoints(hx, hy, b * .04 * fade, b * .023 * fade, .1, angle), PALETTE.combatNeonCore, fade);
      }
    }
    return out;
  }
  /** Drawn on the existing spatial floor, so buildings and actors occlude the pressure rings correctly. */
  waves(project: NativeCityFxProject): { x: number; y: number; width: number; height: number; ageMs: number; ground: true; seed: number }[] {
    return this.landings.flatMap(({ cue: c, ageMs }) => {
      const [x, y] = project(c.feet);
      return [0, 1].filter(i => ageMs >= i * 50 && ageMs < 230 + i * 50).map(i => ({ x, y,
        width: c.bodyPx * (i ? 2.7 : 3.4), height: c.bodyPx * (i ? .65 : .85), ageMs: ageMs - i * 50, ground: true as const, seed: 3571 + i }));
    });
  }
}
