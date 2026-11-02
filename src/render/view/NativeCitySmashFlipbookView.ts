import type Phaser from "phaser";
import { SMASH_FLIPBOOKS, SMASH_GROUND_LAYERS, type SmashFlipbook } from "../../assets/NativeCitySmashFxCatalog";
import { preloadSpriteSheets } from "../art/PhaserAssetLoader";
import { artTextureKey } from "../art/ArtFallback";
import { VILLAGE_DEPTHS, villageDepthJustAbove } from "../depths";
import type { NativeCitySmashDraw } from "../effects/NativeCityBallSmashFx";
import { stepIndexAt } from "../animation/StepTimeline";
import { fitUnderCeiling } from "./WorldCeiling";

/** Unequal authored exposures; the caller owns all clocks, including hitstop. */
function frameAt(sheet: SmashFlipbook, ageMs: number): number | null {
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  const frame = stepIndexAt(sheet.durationsMs, ageMs, "once", ms => ms);
  return frame < 0 ? null : frame;
}

/** The ground layer: over the foot dust, behind the bodies. */
const GROUND_DEPTH = villageDepthJustAbove(VILLAGE_DEPTHS.actorFootDust);

/**
 * Burst cels kept under a ceiling (2026-10-24, the arena's face HUD floor — a broken guard's and a super's glass shards flew up over the HUD):
 * `kinds` drawn so their top would pass `ceiling()` (world y, null: none) shrink about their contact down to `minShare` of their size, then
 * move down what still passes it. Done just before the cameras draw (the arena moves its camera after this view's update).
 */
export interface SmashCeilingFit {
  readonly kinds: readonly (keyof typeof SMASH_FLIPBOOKS)[];
  readonly ceiling: () => number | null;
  readonly minShare: number;
}

/** Raster VFX pool, allocated before the UI camera. Never stretches a fighter or uses an animation clock of its own. */
export class NativeCitySmashFlipbookView {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private requested = false;
  /** The kind each pooled sprite draws this frame (the ceiling fits only its `kinds`). */
  private readonly drawnKinds: (keyof typeof SMASH_FLIPBOOKS | null)[];
  private readonly release: (() => void) | null = null;

  /**
   * `kinds`: the sheets `prepare` asks for (all by default; a scene that draws one kind loads only that). `card` (ground dust handed to the
   * 3D card view, 2026-10-18 B072 — on the 2D layer it drew over the buildings): each sprite is a translucent card (`*-ghost`, alpha kept
   * under 1) anchored on its ground point `behindPx` farther, so a body standing there stays in front and a building in front hides it.
   */
  constructor(private readonly scene: Phaser.Scene, private readonly burstDepth: number,
    private readonly kinds: readonly (keyof typeof SMASH_FLIPBOOKS)[] = Object.keys(SMASH_FLIPBOOKS) as (keyof typeof SMASH_FLIPBOOKS)[],
    private readonly card: { readonly behindPx: number } | null = null, fit: SmashCeilingFit | null = null) {
    this.sprites = Array.from({ length: 16 }, () => scene.add.sprite(0, 0, "__DEFAULT")
      .setVisible(false).setName(card ? "native-city-smash-ground-ghost" : "native-city-smash-flipbook"));
    this.drawnKinds = this.sprites.map(() => null);
    if (fit) {
      const fitAll = (): void => {
        const ceiling = fit.ceiling();
        if (ceiling === null) return;
        this.sprites.forEach((sprite, i) => {
          const kind = this.drawnKinds[i];
          if (!sprite.visible || kind === null || kind === undefined || !fit.kinds.includes(kind)) return;
          const placed = fitUnderCeiling(sprite.y, sprite.scaleY, sprite.frame.height, sprite.originY, ceiling, fit.minShare);
          sprite.setScale(placed.scale).setY(placed.y);
        });
      };
      // By name (this view imports Phaser's types only): `Phaser.Scenes.Events.PRE_RENDER`.
      scene.events.on("prerender", fitAll);
      this.release = () => { scene.events.off("prerender", fitAll); };
    }
  }

  /** The pooled sprites (a `card` pool goes to the scene's 3D card list). */
  get objects(): readonly Phaser.GameObjects.Sprite[] { return this.sprites; }

  prepare(): void {
    if (this.requested) return;
    this.requested = true;
    preloadSpriteSheets(this.scene, this.kinds.map(kind => SMASH_FLIPBOOKS[kind]));
    if (!this.scene.load.isLoading() && this.scene.load.list.size > 0) this.scene.load.start();
  }

  /** The sheet for `kind` is in the texture cache (it streams in after `prepare`, or never on a failed load). */
  ready(kind: keyof typeof SMASH_FLIPBOOKS): boolean {
    return artTextureKey(this.scene, SMASH_FLIPBOOKS[kind].key, "decorative") !== null;
  }

  draw(commands: readonly NativeCitySmashDraw[]): void {
    if (commands.length) this.prepare();
    let used = 0;
    for (const command of commands) {
      const sheet = SMASH_FLIPBOOKS[command.kind], frame = frameAt(sheet, command.ageMs);
      if (frame === null || !artTextureKey(this.scene, sheet.key, "decorative")) continue;
      const sprite = this.sprites[used];
      if (!sprite) break;
      this.drawnKinds[used++] = command.kind;
      const flip = command.flipX === true;
      sprite.setTexture(sheet.key, frame).setOrigin(flip ? 1 - sheet.pivot[0] : sheet.pivot[0], sheet.pivot[1])
        .setPosition(command.x, command.y).setScale(command.width / sheet.frameWidth)
        .setFlipX(flip).setAngle(command.angle ?? 0).setAlpha(this.card ? Math.min(.98, command.alpha ?? 1) : command.alpha ?? 1)
        .setDepth(SMASH_GROUND_LAYERS.has(command.kind) || command.behind === true ? GROUND_DEPTH : this.burstDepth)
        .setVisible(true);
      if (this.card) sprite.setData("spatialAnchor", { x: command.x, y: command.y - this.card.behindPx });
    }
    for (let i = used; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
  }

  destroy(): void { this.release?.(); for (const sprite of this.sprites) sprite.destroy(); }
}
