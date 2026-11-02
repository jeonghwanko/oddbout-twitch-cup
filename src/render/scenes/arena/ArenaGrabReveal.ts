import Phaser from "phaser";
import { GRAB_REVEAL_COLORS, PALETTE } from "../../art/palette";
import { easeInCubic, easeOutCubic } from "../../art/easing";
import type { ArenaScreenSpace } from "./ArenaHudSpace";


export const ARENA_GRAB_REVEAL = Object.freeze({
  /** The snap zoom ("두둥"): at each step's screen ms the thing jumps to its scale (no tween — a soap opera's crash zoom). */
  zoomSteps: Object.freeze([Object.freeze({ at: 0, scale: 1 }), Object.freeze({ at: 90, scale: 1.14 }), Object.freeze({ at: 180, scale: 1.3 })]),
  /** Each step's jolt (HUD px), gone over `shakeMs`. */
  shakePx: 9,
  shakeMs: 70,
  /** The thing's height at scale 1 (share of the screen's height) and its tilt (degrees). */
  heightShare: 0.46,
  tiltDeg: -8,
  /** It leaves from `outAtMs`, shrinking toward the caster's side, gone at `outEndMs`. */
  outAtMs: 270,
  outEndMs: 360,
  /** The ink over the ring. */
  dim: 0.6,
  /** The rays: how many, how far (share of the screen's diagonal), how fast they turn (radians per screen ms). */
  rays: 16,
  rayReach: 0.62,
  raySpin: 0.0006,
  /** Reduced motion: it stands this long, faded in and out over `reducedFadeMs`. */
  reducedMs: 300,
  reducedFadeMs: 80,
});

export class ArenaGrabReveal {
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly thing: Phaser.GameObjects.Image;
  private ms = 0;
  private active = false;
  private reduced = false;
  /** -1: the caster stands left of the other, +1: right (where it flies off to). */
  private side: -1 | 1 = 1;
  private steps = 0;

  /** `beat`: each zoom step's jolt (the scene's sound). */
  constructor(scene: Phaser.Scene, private readonly space: ArenaScreenSpace, private readonly beat: () => void) {
    this.back = space.add(scene.add.graphics().setName("arena-grab-reveal-back").setVisible(false));
    this.thing = space.add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5).setName("arena-grab-reveal").setVisible(false));
  }

  get shown(): boolean { return this.active; }

  /** Flash `key` (a texture the caller found loaded — `artTextureKey`), the caster on screen side `side`. */
  show(key: string, side: -1 | 1, reducedMotion: boolean): void {
    this.thing.setTexture(key);
    this.ms = 0; this.steps = 0; this.active = true; this.reduced = reducedMotion; this.side = side;
    this.update(0);
  }

  hide(): void {
    this.active = false;
    this.back.clear().setVisible(false);
    this.thing.setVisible(false);
  }

  update(dtMs: number): void {
    if (!this.active) return;
    this.ms += Math.max(0, Math.min(100, Number.isFinite(dtMs) ? dtMs : 0));
    const R = ARENA_GRAB_REVEAL, W = this.space.width, H = this.space.height, ms = this.ms;
    if (this.reduced ? ms >= R.reducedMs : ms >= R.outEndMs) { this.hide(); return; }
    // The zoom steps it has reached; each new one jolts (and sounds).
    let step = 0;
    R.zoomSteps.forEach((s, i) => { if (ms >= s.at) step = i; });
    if (!this.reduced) while (this.steps <= step) { this.steps++; this.beat(); }
    else if (this.steps === 0) { this.steps = 1; this.beat(); }
    const zoom = this.reduced ? 1 : R.zoomSteps[step]!.scale;
    const since = ms - R.zoomSteps[step]!.at, jolt = this.reduced ? 0 : R.shakePx * Math.max(0, 1 - since / R.shakeMs);
    const jx = jolt * (step % 2 === 0 ? 1 : -1), jy = jolt * 0.5;
    // Out: shrinking toward the caster's side, the ink and the light going with it.
    const out = this.reduced ? 0 : Math.max(0, Math.min(1, (ms - R.outAtMs) / (R.outEndMs - R.outAtMs)));
    const fade = this.reduced ? Math.min(1, ms / R.reducedFadeMs, (R.reducedMs - ms) / R.reducedFadeMs) : 1 - easeInCubic(out);
    const cx = W / 2 + (this.side * W * 0.28) * easeOutCubic(out) + jx, cy = H * 0.5 + H * 0.06 * easeOutCubic(out) + jy;
    const f = this.thing.frame, height = H * R.heightShare * zoom * (1 - 0.75 * easeOutCubic(out));
    const scale = height / Math.max(1, f.cutHeight);
    // The ink, the aura's soft rings, the turning rays, the bright core — all round the thing.
    const g = this.back.clear().setVisible(true);
    this.space.setLogicalPosition(g, 0, 0);
    g.fillStyle(PALETTE.oddboutInk, R.dim * fade).fillRect(0, 0, W, H);
    const reach = Math.hypot(W, H) * R.rayReach * (this.reduced ? 1 : zoom), spin = this.reduced ? 0 : ms * R.raySpin;
    for (let i = 0; i < R.rays; i++) {
      const a = spin + (i / R.rays) * Math.PI * 2, wide = (i % 2 === 0 ? 0.07 : 0.04), long = reach * (i % 2 === 0 ? 1 : 0.72);
      g.fillStyle(GRAB_REVEAL_COLORS.rays, 0.5 * fade).fillTriangle(cx, cy, cx + Math.cos(a - wide) * long, cy + Math.sin(a - wide) * long,
        cx + Math.cos(a + wide) * long, cy + Math.sin(a + wide) * long);
    }
    const r = height * 0.75;
    for (const [k, alpha] of [[1.35, 0.16], [1.05, 0.22], [0.8, 0.3]] as const) g.fillStyle(GRAB_REVEAL_COLORS.aura, alpha * fade).fillCircle(cx, cy, r * k);
    g.fillStyle(GRAB_REVEAL_COLORS.core, 0.55 * fade).fillCircle(cx, cy, r * 0.45);
    this.thing.setScale(scale).setRotation(Phaser.Math.DegToRad(R.tiltDeg)).setAlpha(fade).setVisible(true);
    this.space.setLogicalPosition(this.thing, cx, cy);
  }

  destroy(): void {
    this.back.destroy();
    this.thing.destroy();
  }
}
