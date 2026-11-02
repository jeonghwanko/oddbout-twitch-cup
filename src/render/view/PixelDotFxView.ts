import Phaser from "phaser";
import { cityProject, type CityPoint, type NativeCityDefinition } from "../../world/NativeCityDefinition";
import { VILLAGE_DEPTHS, villageYSorted } from "../depths";
import { bakePixelDotSprite } from "./PixelDotTexture";
import { PIXEL_DOT_FX, PIXEL_DOT_SPRITES, PixelDotFxState, pixelDotScale, type PixelDotDraw, type PixelDotPoint,
  type PixelDotSpriteId } from "../effects/PixelDotFx";

/** What the city scene lends the dots. Getters, so every frame reads this frame's values. */
export interface PixelDotFxHost {
  /** Current (orbit-rotated) projection — plan points are projected with it every frame (`cityProject`). */
  readonly projection: () => NativeCityDefinition;

  readonly actorHeight: () => number;
  /** World px that cover one screen (CSS) px right now (camera zoom and canvas scaling). */
  readonly worldPxPerScreenPx: () => number;
  readonly reducedMotion: () => boolean;
  /** The 3D card view is live (every Phaser effect draws over the actors there): fewer, fainter dots. */
  readonly cardMode?: () => boolean;
}

/** Same contact layer as `NativeCityCombatFxView`: over every y-sorted actor, under the near foreground (22.4). */
const OVER_DEPTH = villageYSorted(VILLAGE_DEPTHS.actorAdornment, 1200);
const GROUND_DEPTH = VILLAGE_DEPTHS.actorFootDust;
/** Transient dots (streaks, dust, impacts) + the stun stars and ring + the telegraph's dots and arrow head. */
const POOL_SIZE = PIXEL_DOT_FX.budget.transient + 2 + PIXEL_DOT_FX.budget.telegraphDots + 1;
let bakeSerial = 0;


export class PixelDotFxView {
  private readonly state: PixelDotFxState;
  private readonly keys = new Map<PixelDotSpriteId, string>();
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private destroyed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly host: PixelDotFxHost) {
    this.state = new PixelDotFxState(this.mode());
    const prefix = `pixel-dot-fx-${(bakeSerial += 1)}`;
    for (const sprite of Object.values(PIXEL_DOT_SPRITES)) {
      const key = `${prefix}-${sprite.id}`;
      if (this.bake(key, sprite.id)) this.keys.set(sprite.id, key);
    }
    const first = this.keys.values().next().value;
    for (let i = 0; i < POOL_SIZE; i++) {
      const image = first ? scene.add.image(0, 0, first, "0") : scene.add.image(0, 0, "__DEFAULT");
      this.pool.push(image.setOrigin(0, 0).setVisible(false).setName(`pixel-dot-fx-${i}`));
    }
  }

  dashStart(from: CityPoint, to: CityPoint, dir: CityPoint, bodyPx = this.host.actorHeight()): void {
    this.state.dashStart(from, to, dir, bodyPx);
  }

  dashTick(pos: CityPoint, dir: CityPoint, bodyPx = this.host.actorHeight(), speedShare?: number): void {
    this.state.dashTick(pos, dir, bodyPx, speedShare);
  }

  dashImpact(point: CityPoint, dir: CityPoint, liftPx = this.host.actorHeight() * PIXEL_DOT_FX.impactLift): void {
    this.state.dashImpact(point, dir, liftPx);
  }

  stunStart(head: PixelDotPoint, durationMs: number, feet: CityPoint | null = null): void {
    this.state.stunStart(head, durationMs, feet);
  }

  stunUpdate(head: PixelDotPoint, feet?: CityPoint | null): void {
    this.state.stunUpdate(head, feet);
  }

  stunEnd(): void { this.state.stunEnd(); }

  telegraph(from: CityPoint, to: CityPoint, progress: number): void { this.state.telegraph(from, to, progress); }

  telegraphEnd(): void { this.state.telegraphEnd(); }

  /** Live transient dots (capture labels, debugging). */
  get count(): number { return this.state.transientCount; }

  update(dtMs: number, rate = 1): void {
    if (this.destroyed) return;
    this.state.setMode(this.mode());
    this.state.update(dtMs, rate);
    const worldPerScreen = this.host.worldPxPerScreenPx();
    const wpps = Number.isFinite(worldPerScreen) && worldPerScreen > 0 ? worldPerScreen : 1;
    const cell = pixelDotScale(this.host.actorHeight() / wpps) * wpps;
    const definition = this.host.projection();
    const draws = this.state.draws(point => cityProject(point, definition), cell);
    let used = 0;
    for (const draw of draws) {
      const image = this.pool[used], key = this.keys.get(draw.sprite);
      if (!image || !key) continue;
      used += 1;
      this.show(image, key, draw);
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]!.setVisible(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const image of this.pool) image.destroy();
    this.pool.length = 0;
    this.state.clear();
    for (const key of this.keys.values()) this.scene.textures.remove(key);
    this.keys.clear();
  }

  private mode() {
    return { reducedMotion: this.host.reducedMotion(), cardMode: this.host.cardMode?.() === true };
  }

  private show(image: Phaser.GameObjects.Image, key: string, draw: PixelDotDraw): void {
    const depth = draw.layer === "over" ? OVER_DEPTH : draw.layer === "ground" ? GROUND_DEPTH
      : villageYSorted(VILLAGE_DEPTHS.actorBody, draw.sortY) - PIXEL_DOT_FX.behindDepth;
    image.setTexture(key, String(draw.frame)).setPosition(draw.x, draw.y).setScale(draw.cell).setFlip(draw.flipX, draw.flipY)
      .setAlpha(draw.alpha).setDepth(depth).setVisible(draw.alpha > 0.001);
  }

  /** Every frame of one grid, side by side, one texel per art pixel (nearest filter: the dots never blur). */
  private bake(key: string, id: PixelDotSpriteId): boolean {
    return bakePixelDotSprite(this.scene, key, PIXEL_DOT_SPRITES[id]);
  }
}
