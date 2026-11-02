import type Phaser from "phaser";
import { artTextureKey } from "../art/ArtFallback";
import { PALETTE } from "../art/palette";
import { CITY_FIGHT_LIGHT_SIZE, cityFightLightAlpha, type CityFightLightKind } from "./CityFightLightShapes";


export type { CityFightLightKind };

/** The light texture `kind`, made in code once per scene (white, alpha only — tinted where drawn; its shape: `CityFightLightShapes`). */
export function cityFightLightTexture(scene: Phaser.Scene, kind: CityFightLightKind): string {
  const key = `city-fight-light-${kind}`;
  if (artTextureKey(scene, key, "decorative") !== null) return key;
  const [w, h] = CITY_FIGHT_LIGHT_SIZE[kind];
  const texture = scene.textures.createCanvas(key, w, h), ctx = texture?.getContext();
  if (!texture || !ctx) return "__WHITE";
  const data = ctx.createImageData(w, h), px = data.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = Math.round(255 * cityFightLightAlpha(kind, x, y));
    }
  }
  ctx.putImageData(data, 0, 0);
  texture.refresh();
  return key;
}

/** A fighter's body on screen (world px box) that added light must not white out. */
export interface CityFightLightBox { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/**
 * Light kept off the fighters (2026-10-23 arena audit — a flare, a claw streak or a bloom laid over a body hid who was hit): a light whose
 * box meets one of `boxes` is drawn at `maxAlpha` of its strength — a full-strength one at `maxAlpha`, and the halo and core of one ray
 * together not much over it (added light stacks: a cap per image let twelve rays white the body out again).
 */
export interface CityFightLightCover { readonly boxes: readonly CityFightLightBox[]; readonly maxAlpha: number }

/** A body's box (world px) from its middle x, feet y and height: `halfWidth` of its height either side. */
export function cityFightBodyBox(body: { readonly x: number; readonly y: number; readonly h: number }, halfWidth = 0.3): CityFightLightBox {
  return { left: body.x - body.h * halfWidth, right: body.x + body.h * halfWidth, top: body.y - body.h, bottom: body.y };
}

/**
 * `alpha` under `cover` for a light image at (x, y), `w` × `h`, turned `rotation`, from `originX` along its length: × `maxAlpha` when its
 * turned box meets a body's box. No cover: `alpha`.
 */
export function cityFightCoveredAlpha(cover: CityFightLightCover | null, x: number, y: number, w: number, h: number, rotation: number,
  originX: number, alpha: number): number {
  if (!cover || cover.boxes.length === 0) return alpha;
  const c = Math.cos(rotation), s = Math.sin(rotation), u0 = -originX * w, u1 = (1 - originX) * w, hh = h / 2;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const u of [u0, u1]) {
    for (const v of [-hh, hh]) {
      const px = x + u * c - v * s, py = y + u * s + v * c;
      left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
    }
  }
  const meets = cover.boxes.some(box => left < box.right && right > box.left && top < box.bottom && bottom > box.top);
  return meets ? alpha * cover.maxAlpha : alpha;
}

/** A pool of added-light images at one depth, redrawn each frame (`begin` … `end`). */
export class CityFightLightPool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private used = 0;
  /** Light over the fighters' bodies dimmed (`cityFightCoveredAlpha`); null: as asked. Set by the owner each frame. */
  cover: CityFightLightCover | null = null;
  /** Its cones at most `maxAlpha`, drawn by `pool` instead when set (behind the fighters) — a spotlight is not a plank over a body. */
  private cones: { readonly pool: CityFightLightPool | null; readonly maxAlpha: number } | null = null;

  constructor(private readonly scene: Phaser.Scene, depth: number, size: number, name: string) {
    for (let i = 0; i < size; i++) {
      this.images.push(scene.add.image(0, 0, "__DEFAULT").setDepth(depth).setName(name).setBlendMode("ADD").setVisible(false));
    }
  }

  /**
   * Its cones at most `maxAlpha`, drawn by `pool` (null: here) — 2026-10-23 arena audit, b05 #1766: the bulb's cone a plank over the caster.
   */
  conesTo(pool: CityFightLightPool | null, maxAlpha: number): void { this.cones = { pool: pool === this ? null : pool, maxAlpha }; }

  begin(): void { this.used = 0; }

  /** Every image to `depth` (a pool that follows a body's y-sort — `FighterMoveFxView`'s lights). */
  setDepth(depth: number): void { for (const image of this.images) image.setDepth(depth); }

  /** Hides what this frame did not use. */
  end(): void {
    for (let i = this.used; i < this.images.length; i++) this.images[i]!.setVisible(false);
  }

  hide(): void { this.used = 0; this.end(); }

  destroy(): void { for (const image of this.images) image.destroy(); }

  /** One image: `kind` at (x, y), `w` × `h`, turned `rotation`, tinted, from `originX` (0: its root — a ray). */
  light(kind: CityFightLightKind, x: number, y: number, w: number, h: number, rotation: number, tint: number, alpha: number, originX = 0.5): void {
    if (!(alpha > 0.003) || !(w > 0.5) || !(h > 0.5)) return;
    const image = this.images[this.used];
    if (!image) return;
    this.used++;
    const shown = cityFightCoveredAlpha(this.cover, x, y, w, h, rotation, originX, Math.min(1, alpha));
    image.setTexture(cityFightLightTexture(this.scene, kind)).setOrigin(originX, 0.5).setPosition(x, y).setDisplaySize(w, h)
      .setRotation(rotation).setTint(tint).setAlpha(shown).setVisible(true);
  }

  /** A ray from (x, y) along `angle`, tapering from its root: a wide tinted halo and a thin white core. */
  ray(x: number, y: number, angle: number, length: number, width: number, tint: number, alpha: number, core: number = PALETTE.white): void {
    this.light("ray", x, y, length, width * 3.2, angle, tint, alpha * 0.5, 0);
    this.light("ray", x, y, length * 0.9, width, angle, core, alpha, 0);
  }

  /** A streak through (x, y) along `angle`, fading at both ends. */
  streak(x: number, y: number, angle: number, length: number, width: number, tint: number, alpha: number, core: number = PALETTE.white): void {
    this.light("streak", x, y, length, width * 3.2, angle, tint, alpha * 0.5);
    this.light("streak", x, y, length * 0.85, width, angle, core, alpha);
  }

  /** A four-point flare `size` across, turned `rotation`, with a white heart. */
  flare(x: number, y: number, size: number, tint: number, alpha: number, rotation = 0): void {
    this.light("flare", x, y, size, size, rotation, tint, alpha);
    this.light("puff", x, y, size * 0.32, size * 0.32, 0, PALETTE.white, alpha * 0.9);
  }

  /** A cone of light from (x, y) along `angle`, `length` long and `width` wide at its far end (a lamp, a spotlight). */
  cone(x: number, y: number, angle: number, length: number, width: number, tint: number, alpha: number): void {
    const capped = this.cones ? Math.min(alpha, this.cones.maxAlpha) : alpha;
    if (this.cones?.pool) this.cones.pool.cone(x, y, angle, length, width, tint, capped);
    else this.light("cone", x, y, length, width, angle, tint, capped, 0);
  }

  /** A soft round glow `size` across (`squash`: its height's share — a flattened glow on the ground). */
  glow(x: number, y: number, size: number, tint: number, alpha: number, squash = 1): void {
    this.light("puff", x, y, size, size * squash, 0, tint, alpha);
  }

  /** A ring of light `radius` round (x, y) (`squash`: its height's share — a ring lying on the ground). */
  ring(x: number, y: number, radius: number, tint: number, alpha: number, squash = 1, rotation = 0): void {
    this.light("ring", x, y, radius * 2.32, radius * 2.32 * squash, rotation, tint, alpha);
  }
}
