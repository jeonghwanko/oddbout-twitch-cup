import { nativeCityAttackTrailPrims, nativeCityTrailLifeMs, type NativeCityAttackTrailFrame } from "./NativeCityAttackTrail";
import { combatSmearDraws, combatSmearOwns, type CombatSmearDraw } from "./CombatSmear";
import type { NativeCityFxProject } from "./NativeCityCombatFx";
import type { FxPrim } from "./FxPrim";

interface Tail {
  readonly frame: NativeCityAttackTrailFrame;
  readonly offset: readonly [number, number];
  ageMs: number;
}

/** Actor/attack/contact identities, not opponent names. Released trails outlive the attack pose. */
export class NativeCityAttackTrailSequence {
  constructor(private readonly brush = nativeCityAttackTrailPrims) {}
  private live: NativeCityAttackTrailFrame[] = [];
  private tails: Tail[] = [];
  private seen = new Set<string>();

  clear(): void { this.live = []; this.tails = []; this.seen.clear(); }

  update(frames: readonly NativeCityAttackTrailFrame[], project: NativeCityFxProject): void {
    this.live = [];
    for (const f of frames) {
      if (f.actorId === undefined || f.attackId === undefined) { this.live.push(f); continue; }
      const pending = f.strokes.filter(s => f.timeMs < s.hitMs);
      if (pending.length) this.live.push({ ...f, strokes: pending });
      f.strokes.forEach((s, i) => {
        const key = `${f.actorId}:${f.attackId}:${i}`;
        if (f.timeMs < s.hitMs || this.seen.has(key)) return;
        this.seen.add(key);
        const ageMs = f.timeMs - s.hitMs;
        if (ageMs >= nativeCityTrailLifeMs(s)) return;
        const [x, y] = f.ground ? project(f.ground) : [f.x, f.y];
        this.tails.push({ frame: { ...f, ground: f.ground ? [...f.ground] : undefined, strokes: [s] },
          offset: [f.x - x, f.y - y], ageMs });
      });
    }
    this.tails = this.tails.slice(-12);
    while (this.seen.size > 96) this.seen.delete(this.seen.values().next().value!);
  }

  frame(dtMs: number): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
    for (const tail of this.tails) tail.ageMs += dt;
    this.tails = this.tails.filter(t => t.ageMs < nativeCityTrailLifeMs(t.frame.strokes[0]!));
  }

  /** `smearArt`: the drawn smears are in — a stroke's ribbon rests while its smear owns the moment (`combatSmearOwns`). */
  draw(project: NativeCityFxProject, smearArt = false): FxPrim[] {
    const ribbons = (f: NativeCityAttackTrailFrame) => this.brush(smearArt
      ? { ...f, strokes: f.strokes.filter(s => !combatSmearOwns(s, f.timeMs)) } : f);
    return [...this.live.flatMap(ribbons), ...this.releasedFrames(project).flatMap(ribbons)];
  }

  /** The drawn smears (`CombatSmear`) of the same strokes: the last frames before each contact and the contact frame. */
  smears(project: NativeCityFxProject): CombatSmearDraw[] {
    return [...this.live.flatMap(combatSmearDraws), ...this.releasedFrames(project).flatMap(combatSmearDraws)];
  }

  /** The released strokes as frames at their age, re-projected where the fight camera has moved. */
  private releasedFrames(project: NativeCityFxProject): NativeCityAttackTrailFrame[] {
    return this.tails.map(t => {
      const f = t.frame, [x, y] = f.ground ? project(f.ground) : [f.x, f.y];
      return { ...f, x: x + t.offset[0], y: y + t.offset[1], timeMs: f.strokes[0]!.hitMs + t.ageMs };
    });
  }
}
