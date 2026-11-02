import type Phaser from "phaser";
import { FONT, PALETTE, cssHex } from "../art/palette";
import { VILLAGE_DEPTHS } from "../depths";



export const CITY_FIGHT_METER_BAR = Object.freeze({
  widthPx: 240,
  heightPx: 10,
  edgePx: 48,
  /** Its bottom edge at this share of the view's height above the bottom (clear of the letterbox band and the buttons). */
  liftShare: 0.13,
  pulseMs: 700,
  keyPx: 18,
});

export interface CityFightMeterBarFrame {
  /** Each corner's meter (0..1); null: that corner has none (a host enemy). */
  readonly shares: readonly [number | null, number | null];
  /** The super key's label beside a full left meter (the player's), else null. */
  readonly key: string | null;
}

export class CityFightMeterBarView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly key: Phaser.GameObjects.Text;
  private ms = 0;

  constructor(scene: Phaser.Scene, private readonly camera: () => Phaser.Cameras.Scene2D.Camera, private readonly worldPxPerScreenPx: () => number) {
    const depth = VILLAGE_DEPTHS.fightComboCounter;
    this.graphics = scene.add.graphics().setDepth(depth).setName("city-fight-meters").setVisible(false);
    this.key = scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: `${CITY_FIGHT_METER_BAR.keyPx}px`, fontStyle: "bold",
      color: cssHex(PALETTE.navyInk), backgroundColor: cssHex(PALETTE.hotGold), padding: { x: 6, y: 2 } })
      .setResolution(2).setOrigin(0, 0.5).setDepth(depth).setName("city-fight-meter-key").setVisible(false);
  }

  /** One frame (screen ms); null: no fight on screen. */
  update(screenDtMs: number, frame: CityFightMeterBarFrame | null, reducedMotion: boolean): void {
    this.ms += Math.max(0, Number.isFinite(screenDtMs) ? screenDtMs : 0);
    const g = this.graphics.clear();
    if (!frame) { g.setVisible(false); this.key.setVisible(false); return; }
    g.setVisible(true);
    const C = CITY_FIGHT_METER_BAR, view = this.camera().worldView, unit = Math.max(1e-6, this.worldPxPerScreenPx());
    const width = C.widthPx * unit, height = C.heightPx * unit, y = view.bottom - view.height * C.liftShare - height;
    const breathe = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(this.ms / C.pulseMs * Math.PI * 2);
    let keyAt: { x: number; y: number } | null = null;
    frame.shares.forEach((share, corner) => {
      if (share === null) return;
      const left = corner === 0, x = left ? view.x + C.edgePx * unit : view.right - C.edgePx * unit - width, full = share >= 1 - 1e-9;
      g.fillStyle(PALETTE.navyInk, 0.85).fillRect(x - unit, y - unit, width + 2 * unit, height + 2 * unit);
      const fill = width * Math.max(0, Math.min(1, share));
      g.fillStyle(full ? PALETTE.hotGold : PALETTE.fxWarmGold, full ? breathe : 0.95)
        .fillRect(left ? x : x + width - fill, y, fill, height);
      g.fillStyle(PALETTE.white, full ? 0.35 * breathe : 0.18).fillRect(left ? x : x + width - fill, y, fill, Math.max(unit, height * 0.3));
      if (left && full) keyAt = { x: x + width + 8 * unit, y: y + height / 2 };
    });
    const at = keyAt as { x: number; y: number } | null;
    if (at && frame.key) {
      if (this.key.text !== frame.key) this.key.setText(frame.key);
      this.key.setVisible(true).setScale(unit).setAlpha(breathe).setPosition(at.x, at.y);
    } else this.key.setVisible(false);
  }

  destroy(): void { this.graphics.destroy(); this.key.destroy(); }
}
