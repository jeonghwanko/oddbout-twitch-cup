import type Phaser from "phaser";
import { PALETTE } from "../../art/palette";
import { ARENA_DEPTHS } from "../../depths";

/**
 * The cross's cut (2026-10-25 교차 돌파 — `CityFightBoutExchange`; game-animator review: "a slash line across the loser's body, two and a half
 * strides along the run, white one frame then fading over two"): a thin blade of light across the body the winner passed, tilted a little up
 * along his run — `whiteMs` solid white, then `fadeMs` thinning away inside a navy ink edge. The last pass's cut is longer and thicker
 * (`ARENA_CROSS_SLASH.final`). Screen time: it plays through the pass's freeze. Reduced motion: none (the pass's freeze and the blow tell it).
 */
export const ARENA_CROSS_SLASH = Object.freeze({
  whiteMs: 34, fadeMs: 60, tiltDeg: 8, thickBodies: 0.035, inkPx: 2,
  final: Object.freeze({ lengthScale: 1.4, thickScale: 1.6, whiteMs: 50 }),
});

export class ArenaCrossSlashView {
  private readonly g: Phaser.GameObjects.Graphics;
  private cut: { readonly x: number; readonly y: number; readonly dir: -1 | 1; readonly lengthPx: number; readonly thickPx: number;
    readonly whiteMs: number; ageMs: number } | null = null;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(ARENA_DEPTHS.crossSlash).setName("arena-cross-slash");
  }

  get objects(): readonly Phaser.GameObjects.GameObject[] { return [this.g]; }

  /** A cut centred at (`x`, `y`) world px along `dir` (the winner's run on screen), `lengthPx` long over a body `bodyPx` tall. */
  slash(x: number, y: number, dir: -1 | 1, lengthPx: number, bodyPx: number, final: boolean, reduced: boolean): void {
    if (reduced) return;
    const S = ARENA_CROSS_SLASH, F = S.final;
    this.cut = { x, y, dir, lengthPx: lengthPx * (final ? F.lengthScale : 1), thickPx: bodyPx * S.thickBodies * (final ? F.thickScale : 1),
      whiteMs: final ? F.whiteMs : S.whiteMs, ageMs: 0 };
  }

  /** One frame of screen time. */
  update(dtMs: number): void {
    const g = this.g, cut = this.cut;
    g.clear();
    if (!cut) return;
    cut.ageMs += Math.max(0, dtMs);
    const S = ARENA_CROSS_SLASH, fade = Math.max(0, (cut.ageMs - cut.whiteMs) / S.fadeMs);
    if (fade >= 1) { this.cut = null; return; }
    // A lens: pointed ends, its thickest a little ahead of the middle (the blade's sweep).
    const k = 1 - fade, half = cut.lengthPx / 2, thick = cut.thickPx * (0.35 + 0.65 * k);
    const angle = -cut.dir * S.tiltDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const at = (along: number, across: number) => ({ x: cut.x + cut.dir * along * cos - across * sin, y: cut.y + cut.dir * along * sin + across * cos });
    const lens = [at(-half, 0), at(half * 0.2, -thick / 2), at(half, 0), at(half * 0.2, thick / 2)];
    if (fade > 0) {
      g.lineStyle(S.inkPx, PALETTE.navyInk, 0.85 * k);
      g.strokePoints(lens, true, true);
    }
    g.fillStyle(PALETTE.white, fade > 0 ? 0.95 * k : 1);
    g.fillPoints(lens, true, true);
  }

  destroy(): void { this.g.destroy(); this.cut = null; }
}
