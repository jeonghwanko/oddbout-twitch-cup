import type Phaser from "phaser";
import { FIGHTER_MOVE_FX_EFFECTS, FIGHTER_MOVE_FX_SHEETS } from "../../../assets/FighterMoveFxArtCatalog";
import type { CityFightBoutTrace } from "../../../sim/cityFight/bout/CityFightBoutTraces";
import { clamp01 } from "../../../sim/geom";
import { cityProject, type CityPoint, type NativeCityDefinition } from "../../../world/NativeCityDefinition";
import { artTextureKey } from "../../art/ArtFallback";
import { ARENA_DEPTHS } from "../../depths";

/**
 * The skills' traces on the ring (2026-10-22 4차, ODDBOUT — `CityFightBoutTraces`): the penguin's ice patches (his ice sheet's sustained
 * trail cell) and the gopher's holes (his dirt sheet's crack), each as wide as its rule radius, faded in and out over its life; and the ice
 * spray where a body slid on the ice (`spray`). A fixed pool made with the bout (before the UI camera takes its ignore list); a sheet not in
 * (neither fighter draws it) draws nothing. Presentation only.
 */
const POOL = 28;
/** A trace fades in over this long and out over the last `FADE_OUT_MS` of its life (fight ms). */
const FADE_IN_MS = 150;
const FADE_OUT_MS = 700;
/** Its drawn width over its rule diameter (the drawn cell has soft edges). */
const DRAWN_SCALE = 1.35;

const LOOK = Object.freeze({
  ice: { sheet: FIGHTER_MOVE_FX_SHEETS.oddboutIce, frame: 1, originY: 0.6, alpha: 0.85 },
  hole: { sheet: FIGHTER_MOVE_FX_SHEETS.oddboutDirt, frame: 0, originY: 0.8, alpha: 1 },
});

interface Spray { readonly at: CityPoint; readonly widthPx: number; ageMs: number }

export class ArenaTraceView {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private readonly sprays: Spray[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.sprites = Array.from({ length: POOL }, (_, i) => scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName(`arena-trace-${i}`));
  }

  /** The ice spray where a body slid on the ice (`CityFightBoutHit.slip`), `widthPx` wide. */
  spray(at: CityPoint, widthPx: number): void {
    this.sprays.push({ at, widthPx, ageMs: 0 });
    if (this.sprays.length > 4) this.sprays.shift();
  }

  /** This frame: every trace on the floor, then the sprays (screen ms; reduced motion holds the spray's first cell). */
  frame(traces: readonly CityFightBoutTrace[], view: NativeCityDefinition, direction: CityPoint, screenDtMs: number, reduced: boolean): void {
    let used = 0;
    for (const trace of traces) {
      const look = LOOK[trace.kind], key = this.textureKey(look.sheet.key);
      if (key === null || used >= this.sprites.length) continue;
      const [x, y] = cityProject(trace.point, view);
      const [ex, ey] = cityProject([trace.point[0] + direction[0] * trace.radiusUnits, trace.point[1] + direction[1] * trace.radiusUnits], view);
      const widthPx = 2 * Math.hypot(ex - x, ey - y) * DRAWN_SCALE, age = trace.ms - trace.leftMs;
      const alpha = look.alpha * Math.min(clamp01(age / FADE_IN_MS), clamp01(trace.leftMs / FADE_OUT_MS));
      const depth = ARENA_DEPTHS.trace;
      this.sprites[used++]!.setTexture(key, look.frame).setOrigin(0.5, look.originY).setScale(widthPx / look.sheet.frameWidth)
        .setPosition(x, y).setAlpha(alpha).setDepth(depth).setVisible(alpha > 0.01);
    }
    const effect = FIGHTER_MOVE_FX_EFFECTS.iceSpray, iceKey = this.textureKey(FIGHTER_MOVE_FX_SHEETS.oddboutIce.key);
    for (let i = this.sprays.length - 1; i >= 0; i--) {
      const spray = this.sprays[i]!;
      spray.ageMs += screenDtMs;
      const times = effect?.frameMs ?? [], total = times.reduce((sum, ms) => sum + ms, 0);
      if (!effect || iceKey === null || spray.ageMs >= total) { this.sprays.splice(i, 1); continue; }
      let step = 0, left = reduced ? 0 : spray.ageMs;
      while (step < times.length - 1 && left >= times[step]!) { left -= times[step]!; step++; }
      if (used >= this.sprites.length) continue;
      const [x, y] = cityProject(spray.at, view), depth = ARENA_DEPTHS.trace;
      this.sprites[used++]!.setTexture(iceKey, effect.frames[step]).setOrigin(effect.pivot[0], effect.pivot[1])
        .setScale(spray.widthPx / FIGHTER_MOVE_FX_SHEETS.oddboutIce.frameWidth).setPosition(x, y).setAlpha(1).setDepth(depth).setVisible(true);
    }
    for (let i = used; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
  }

  destroy(): void { for (const sprite of this.sprites) sprite.destroy(); this.sprays.length = 0; }

  /** The sheet's loaded key (a decorative sheet: none — the trace is not drawn). */
  private textureKey(key: string): string | null { return artTextureKey(this.scene, key, "decorative"); }
}
