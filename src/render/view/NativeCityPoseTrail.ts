import type Phaser from "phaser";
import { villageAfterimageDepth } from "../depths";
import { NATIVE_CITY_EXCHANGE_COLORS } from "../effects/NativeCityExchangeFx";

/**
 * One drawn state of a body (world px), at `t` on its owner's clock: what a ghost copies. `feetX` / `feetY`: its feet — the 3D card
 * anchor a lift (a hop, a launch) leaves on the ground; the drawn spot itself while it stands.
 */
export interface NativeCityPoseSample {
  readonly t: number; readonly texture: string; readonly frame: string | number;
  readonly x: number; readonly y: number; readonly originX: number; readonly originY: number;
  readonly scaleX: number; readonly scaleY: number; readonly angle: number; readonly flipX: boolean; readonly depth: number;
  readonly feetX: number; readonly feetY: number;
}

/** The most poses a trail keeps, whatever its window (a safety net: a 240 ms window at 240 Hz is 58). */
const MAX_SAMPLES = 64;


export class NativeCityPoseTrail {
  private readonly ghosts: Phaser.GameObjects.Sprite[] = [];
  private trail: NativeCityPoseSample[] = [];

  /** `add`: the scene's factory (none in a test: no ghosts, the trail still records). */
  constructor(add: Pick<Phaser.GameObjects.GameObjectFactory, "sprite"> | null, count: number, name: string) {
    if (add) for (let i = 0; i < count; i++) this.ghosts.push(add.sprite(0, 0, "__DEFAULT").setVisible(false).setName(name));
  }

  /** The ghosts (the 3D card view draws them as bodies). */
  get objects(): readonly Phaser.GameObjects.Sprite[] { return this.ghosts; }

  /**
   * Records `sample` and forgets the poses more than `keepMs` older than it. A sample at the newest pose's time replaces it (a held clock —
   * a dialogue, an unfocused window, a pause — records every frame at one `t`, and a body may be dressed twice in a frame); an older one
   * starts the trail over (another clock). At most `MAX_SAMPLES` stay.
   */
  record(sample: NativeCityPoseSample, keepMs: number): void {
    const trail = this.trail, last = trail.at(-1);
    if (last && sample.t < last.t) trail.length = 0;
    if (last && sample.t === last.t) trail[trail.length - 1] = sample;
    else trail.push(sample);
    let drop = 0;
    while (drop < trail.length && (sample.t - trail[drop]!.t > keepMs || trail.length - drop > MAX_SAMPLES)) drop++;
    if (drop > 0) trail.splice(0, drop);
  }

  /** Forgets every recorded pose. */
  clear(): void { this.trail = []; }

  hide(): void { for (const ghost of this.ghosts) ghost.setVisible(false); }

  /** Ghost i on the newest pose at least `spacingMs × (i + 1)` before `nowMs` (hidden when none is that old). */
  show(nowMs: number, spacingMs: number, baseAlpha: number): void {
    this.ghosts.forEach((ghost, i) => {
      const past = this.newestAtOrBefore(nowMs - spacingMs * (i + 1));
      if (!past) { ghost.setVisible(false); return; }
      ghost.setTexture(past.texture, past.frame).setOrigin(past.originX, past.originY).setFlipX(past.flipX).setScale(past.scaleX, past.scaleY)
        .setAngle(past.angle).setPosition(past.x, past.y).setDepth(villageAfterimageDepth(past.depth, i)).setTint(NATIVE_CITY_EXCHANGE_COLORS.pearl)
        .setAlpha(baseAlpha / (i + 1)).setVisible(true).setData("spatialAnchor", { x: past.feetX, y: past.feetY });
    });
  }

  private newestAtOrBefore(t: number): NativeCityPoseSample | undefined {
    for (let i = this.trail.length - 1; i >= 0; i--) if (this.trail[i]!.t <= t) return this.trail[i];
    return undefined;
  }
}
