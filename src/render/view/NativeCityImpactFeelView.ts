import type Phaser from "phaser";
import type { NativeCityImpactTier } from "../../sim/cityFight/NativeCityCombatTuning";
import type { FixedCameraSpace } from "../FixedCameraSpace";
import { VILLAGE_DEPTHS } from "../depths";
import { artTextureKey } from "../art/ArtFallback";
import { createNativeCityHpChip, NATIVE_CITY_IMPACT_COLORS, nativeCityCameraKickAt, nativeCityHpChipShakePx, nativeCityHurtVignetteAlpha,
  nativeCityHurtVignetteMs, stepNativeCityHpChip, type NativeCityCameraKick, type NativeCityHpChip,
  type NativeCityRumble } from "../effects/NativeCityImpactFeel";
import { playGamepadRumble } from "../input/gamepadRumble";

const VIGNETTE_TEXTURE = "native-city-hurt-vignette";
const VIGNETTE_SIZE = 256;


export class NativeCityImpactFeelView {
  private kicks: { readonly kick: NativeCityCameraKick; ageMs: number }[] = [];
  private hurtTier: NativeCityImpactTier | null = null;
  private hurtMs = 0;
  private readonly vignette: Phaser.GameObjects.Image | null;
  private kumaHp: NativeCityHpChip | null = null;
  private playerHp: NativeCityHpChip | null = null;

  constructor(scene: Phaser.Scene, private readonly space: FixedCameraSpace) {
    this.vignette = makeVignetteTexture(scene)
      ? space.add(scene.add.image(0, 0, VIGNETTE_TEXTURE).setDepth(VILLAGE_DEPTHS.hurtVignette).setTint(NATIVE_CITY_IMPACT_COLORS.hurtRed)
        .setVisible(false).setName("native-city-hurt-vignette"))
      : null;
  }

  kick(kick: NativeCityCameraKick): void {
    // A held push-in (`focus`) lets go the moment any other kick lands — the counter's heel: the snap back out is part of the blow.
    if (!kick.focus) this.kicks = this.kicks.filter(entry => !entry.kick.focus);
    this.kicks.push({ kick, ageMs: 0 });
    if (this.kicks.length > 4) this.kicks.shift();
  }

  hurt(tier: NativeCityImpactTier): void { this.hurtTier = tier; this.hurtMs = 0; }

  rumble(rumble: NativeCityRumble): void { playGamepadRumble(rumble); }

  /**
   * One frame (screen time): kick and glow clocks, and the two HP chips (`kumaHp` null when he is not fighting — his chip resets).
   */
  step(dtMs: number, kumaHp: number | null, playerHp: number, reducedMotion: boolean): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    for (const entry of this.kicks) entry.ageMs += dt;
    this.kicks = this.kicks.filter(entry => nativeCityCameraKickAt(entry.kick, entry.ageMs) !== null);
    this.kumaHp = kumaHp === null ? null : stepNativeCityHpChip(this.kumaHp ?? createNativeCityHpChip(kumaHp), kumaHp, dt);
    this.playerHp = stepNativeCityHpChip(this.playerHp ?? createNativeCityHpChip(playerHp), playerHp, dt);
    this.hurtMs += dt;
    const vignette = this.vignette;
    if (!vignette) return;
    const alpha = this.hurtTier === null || this.hurtMs >= nativeCityHurtVignetteMs() ? 0
      : nativeCityHurtVignetteAlpha(this.hurtTier, this.hurtMs, reducedMotion);
    vignette.setVisible(alpha > 0.004);
    if (alpha > 0.004) {
      this.space.setLogicalPosition(vignette, this.space.width / 2, this.space.height / 2);
      vignette.setDisplaySize(this.space.width, this.space.height).setAlpha(alpha);
    }
  }

  /** The camera kick now: screen-px offset of the view centre and a zoom multiplier (all kicks summed). */
  get camera(): { readonly dx: number; readonly dy: number; readonly zoom: number } {
    let dx = 0, dy = 0, zoom = 1;
    for (const entry of this.kicks) {
      const at = nativeCityCameraKickAt(entry.kick, entry.ageMs);
      if (at) { dx += at.dx; dy += at.dy; zoom *= at.zoom; }
    }
    return { dx, dy, zoom };
  }

  /** KUMA's bar: the chip's HP and its shake (screen px); null when he is not fighting. */
  kumaBar(reducedMotion: boolean): { readonly chip: number; readonly shakePx: number } | null {
    return this.kumaHp ? { chip: this.kumaHp.chip, shakePx: nativeCityHpChipShakePx(this.kumaHp, reducedMotion) } : null;
  }


  playerBar(reducedMotion: boolean): { readonly chip: number; readonly shakePx: number } | null {
    return this.playerHp ? { chip: this.playerHp.chip, shakePx: nativeCityHpChipShakePx(this.playerHp, reducedMotion) } : null;
  }
}

/** A soft white edge glow (clear in the middle) — tinted warm red and stretched to the screen. False without a canvas. */
function makeVignetteTexture(scene: Phaser.Scene): boolean {
  if (artTextureKey(scene, VIGNETTE_TEXTURE, "decorative") !== null) return true;
  const canvas = scene.textures.createCanvas(VIGNETTE_TEXTURE, VIGNETTE_SIZE, VIGNETTE_SIZE);
  const context = canvas?.getContext();
  if (!canvas || !context) return false;
  const half = VIGNETTE_SIZE / 2;
  const gradient = context.createRadialGradient(half, half, half * 0.55, half, half, half * Math.SQRT2);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.45, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, VIGNETTE_SIZE, VIGNETTE_SIZE);
  canvas.refresh();
  return true;
}
