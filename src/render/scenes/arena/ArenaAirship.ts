import type Phaser from "phaser";
import { ARENA_AIRSHIP_ART } from "../../../assets/ArenaArtCatalog";
import { artTextureKey } from "../../art/ArtFallback";
import { easeOutCubic } from "../../art/easing";
import { PALETTE } from "../../art/palette";
import { ARENA_DEPTHS } from "../../depths";

/**
 * Where and how the airship moves (screen shares of the stage camera's view; ms; degrees). It rests over the right third under the HP bars and
 * above the ropes (clear of READY's letters), hovers on a slow bob, climbs out nose up at FIGHT!, and comes back down over the winner after the
 * KO to light him. The bout itself never shows it: a thing crossing the screen mid-bout reads as a summon flying in.
 */
const AIRSHIP = Object.freeze({
  widthShare: 0.22, rest: [0.74, 0.25] as const, enterMs: 800, leaveMs: 500, leaveTiltDeg: 6, bobPx: 4, bobHz: 0.5,
  koReturnFromMs: 500, koReturnMs: 500, koRestY: 0.2, koMarginShare: 0.2, spotFromMs: 1100, spotFlashMs: 80,
  /** The cone's layers: [half width at the floor (body heights), alpha], widest first — a soft edge without a drawn gradient. */
  cone: [[0.55, 0.07], [0.4, 0.07], [0.24, 0.08]] as readonly (readonly [number, number])[], poolAlpha: 0.22,
});

/** The bout's moment as the airship reads it: before FIGHT!, the bout itself, or after a KO (with its ms and the winner's feet, world px). */
export type ArenaAirshipCue =
  | { readonly kind: "ready" }
  | { readonly kind: "fight" }
  | { readonly kind: "ko"; readonly ms: number; readonly winner: { readonly x: number; readonly y: number }; readonly bodyPx: number };

/**
 * The ODDBOUT event airship over the arena (2026-10-22 — 사용자: "비행선 오브젝트도 만들어서 날려야 할 것 같긴한데"; the VFX review put it at the
 * bout's two ends): a stage dressing only — it reads the bout's moment and the stage camera's view, never the rules. Reduced motion: no
 * flight — it shows still, at rest, after a KO only, and the light does not flash.
 */
export class ArenaAirship {
  private readonly ship: Phaser.GameObjects.Image | null;
  private readonly light: Phaser.GameObjects.Graphics;
  private readyMs = 0;
  private leftMs: number | null = null;

  constructor(scene: Phaser.Scene, private readonly reducedMotion: () => boolean) {
    const key = artTextureKey(scene, ARENA_AIRSHIP_ART.key, "decorative");
    this.ship = key ? scene.add.image(0, 0, key).setDepth(ARENA_DEPTHS.airship).setVisible(false).setName("arena-airship") : null;
    this.light = scene.add.graphics().setDepth(ARENA_DEPTHS.spotlight).setName("arena-airship-light");
  }

  /** The ship's picture (a stage dressing the ring's background layer takes in — an awakening's night falls on it too), or null. */
  get picture(): Phaser.GameObjects.Image | null { return this.ship; }

  /** One frame: `view` is the stage camera's world view, `screenWidth` the canvas width (its world px per screen px). */
  frame(cue: ArenaAirshipCue, view: Phaser.Geom.Rectangle, screenWidth: number, dtMs: number): void {
    const ship = this.ship, light = this.light.clear(), still = this.reducedMotion();
    if (!ship) return;
    const width = view.width * AIRSHIP.widthShare, scale = width / ARENA_AIRSHIP_ART.width, worldPerScreen = view.width / Math.max(1, screenWidth);
    const restX = view.x + view.width * AIRSHIP.rest[0], restY = view.y + view.height * AIRSHIP.rest[1];
    const bob = (ms: number) => still ? 0 : Math.sin(2 * Math.PI * AIRSHIP.bobHz * ms / 1000) * AIRSHIP.bobPx * worldPerScreen;
    ship.setScale(scale).setAngle(0);
    if (cue.kind === "ready") {
      this.readyMs += dtMs; this.leftMs = null;
      if (still) { ship.setVisible(false); return; }
      const k = easeOutCubic(Math.min(1, this.readyMs / AIRSHIP.enterMs));
      ship.setPosition(view.right + width + (restX - view.right - width) * k, restY + bob(this.readyMs)).setVisible(true);
      return;
    }
    if (cue.kind === "fight") {
      // FIGHT!: nose up and out over the top (once it came in at READY); then gone for the bout.
      if (still || this.readyMs === 0) { ship.setVisible(false); return; }
      this.leftMs = (this.leftMs ?? 0) + dtMs;
      const k = Math.min(1, this.leftMs / AIRSHIP.leaveMs);
      if (k >= 1) { ship.setVisible(false); return; }
      ship.setPosition(restX - width * 0.4 * k * k, restY - (restY - view.y + ARENA_AIRSHIP_ART.height * scale) * k * k)
        .setAngle(AIRSHIP.leaveTiltDeg * Math.min(1, k * 3)).setVisible(true);
      return;
    }
    // After the KO: down from above over the winner, then his light.
    const t = cue.ms - AIRSHIP.koReturnFromMs;
    if (t < 0 && !still) { ship.setVisible(false); return; }
    const margin = view.width * AIRSHIP.koMarginShare;
    const x = Math.min(view.right - margin, Math.max(view.x + margin, cue.winner.x));
    const restKoY = view.y + view.height * AIRSHIP.koRestY, k = still ? 1 : easeOutCubic(Math.min(1, t / AIRSHIP.koReturnMs));
    const y = restKoY - (1 - k) * (restKoY - view.y + ARENA_AIRSHIP_ART.height * scale) + bob(Math.max(0, t));
    ship.setPosition(x, y).setVisible(true);
    if (cue.ms < AIRSHIP.spotFromMs) return;
    // The cone from his gondola to the winner's feet, drawn in a few soft layers (no wider than the body), a pool on the floor; its first
    // frames flash white-hot.
    const flash = !still && cue.ms - AIRSHIP.spotFromMs < AIRSHIP.spotFlashMs;
    const top = { x, y: y + ARENA_AIRSHIP_ART.height * scale * 0.42 }, foot = cue.winner;
    for (const [half, alpha] of AIRSHIP.cone) {
      const w = half * cue.bodyPx;
      light.fillStyle(flash ? PALETTE.white : PALETTE.fxWarmCream, flash ? alpha * 2 : alpha)
        .fillTriangle(top.x - w * 0.12, top.y, top.x + w * 0.12, top.y, foot.x + w, foot.y).fillTriangle(top.x - w * 0.12, top.y, foot.x + w, foot.y, foot.x - w, foot.y);
    }
    light.fillStyle(PALETTE.fxWarmCream, AIRSHIP.poolAlpha).fillEllipse(foot.x, foot.y, cue.bodyPx * 1.1, cue.bodyPx * 0.22);
  }

  destroy(): void { this.ship?.destroy(); this.light.destroy(); }
}
