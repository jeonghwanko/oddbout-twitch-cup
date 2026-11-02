import type Phaser from "phaser";
import { ARENA_RING_ART } from "../../../assets/ArenaArtCatalog";
import type { CityFightStageLine } from "../../../sim/cityFight/CityFightStageLine";
import { cityProject, type CityPoint, type NativeCityDefinition } from "../../../world/NativeCityDefinition";
import { artTextureKey } from "../../art/ArtFallback";
import { PALETTE } from "../../art/palette";
import { ARENA_DEPTHS } from "../../depths";
import { attachDecisiveFramePost, decisiveFramePostRenderer, type DecisiveFramePostPipeline } from "../../effects/DecisiveFramePostPipeline";
import type { NativeCityBackdropFrame } from "../../effects/NativeCityScreenGrade";
import { cityFightLightTexture } from "../../view/CityFightLightKit";

/** The KO's light at the blow over the decisive ink (`koLight`): its strength at the ink's full strength, warm. */
const KO_LIGHT = Object.freeze({ alpha: 0.5, tint: PALETTE.fxWarmAmber });


const RING = Object.freeze({ apronStrides: 1.2, floorBack: 0.12, floorFront: 0.36, shadowWidth: 0.42 });


/**
 * The ring's ropes at its two corner posts in world px (`ARENA_RING_ART.pads`), for the pinball's ropes (2026-10-26, `ArenaPinballRopeView`):
 * each post's pads' inner face (`faces`, the left post's then the right's on screen), the three ropes' heights there (top first — the far
 * post), and how far down the near post's pads stand on screen (`depthPx`: the canvas's depth, the near post is off the picture).
 */
export interface ArenaRingRopes {
  readonly faces: readonly [number, number];
  readonly pads: readonly number[];
  readonly depthPx: number;
}

export class ArenaGround {
  /** The ring's ropes at its posts (`ArenaRingRopes`); null without the picture. */
  readonly ropes: ArenaRingRopes | null;
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly dim: Phaser.GameObjects.Rectangle;
  /** The KO's light at the blow over the ink (2026-10-23 arena audit): shown with the ink while a KO set its place (`koLight`). */
  private readonly light: Phaser.GameObjects.Image;
  private lightAt: { readonly x: number; readonly y: number; readonly size: number } | null = null;
  /** The night and the ring picture (the decisive frame shader's layer). */
  private readonly back: Phaser.GameObjects.Layer;
  /** The shader on `back`, attached once and off; null without WebGL. */
  private readonly night: DecisiveFramePostPipeline | null;

  constructor(private readonly scene: Phaser.Scene, line: CityFightStageLine, city: NativeCityDefinition, stepUnits: number,
    private readonly actorHeight: number) {
    const at = (t: number): CityPoint => [line.origin[0] + line.direction[0] * t, line.origin[1] + line.direction[1] * t];
    const apron = RING.apronStrides * stepUnits;
    const [x0, y0] = cityProject(at(line.min - apron), city), [x1] = cityProject(at(line.max + apron), city);
    const left = Math.min(x0, x1), right = Math.max(x0, x1), width = right - left, H = actorHeight;
    // The night under everything (far wider than any frame the stage camera takes).
    const sky = scene.add.rectangle(left - width * 2, y0 - H * 8, width * 5, H * 16, PALETTE.arenaNight, 1).setOrigin(0, 0)
      .setDepth(ARENA_DEPTHS.backdrop).setName("arena-night");
    const art = ARENA_RING_ART, key = artTextureKey(scene, art.key, "decorative");
    let ring: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (key) {
      const scale = width / (art.posts[1] - art.posts[0]), x = (px: number) => left + (px - art.posts[0]) * scale;
      ring = scene.add.image(left - art.posts[0] * scale, y0 - art.feet * scale, key).setOrigin(0, 0).setScale(scale)
        .setDepth(ARENA_DEPTHS.ring).setName("arena-ring");
      this.ropes = Object.freeze({ faces: Object.freeze([x(art.posts[0] + art.padInset), x(art.posts[1] - art.padInset)] as const),
        pads: Object.freeze(art.pads.map(pad => y0 + (pad - art.feet) * scale)), depthPx: (art.canvasFront - art.canvasBack) * scale });
    } else {
      this.ropes = null;
      ring = scene.add.rectangle(left, y0 - H * RING.floorBack, width, H * (RING.floorBack + RING.floorFront), PALETTE.arenaCanvas, 1)
        .setOrigin(0, 0).setDepth(ARENA_DEPTHS.ring).setName("arena-ring");
    }
    // One layer at the ring's depth (nothing else draws between the night and the ring), its two pieces in their own order inside.
    this.back = scene.add.layer([sky, ring]).setDepth(ARENA_DEPTHS.ring).setName("arena-back");
    this.night = decisiveFramePostRenderer(scene) ? attachDecisiveFramePost(this.back) : null;
    this.shadows = scene.add.graphics().setDepth(ARENA_DEPTHS.shadow).setName("arena-shadows");
    this.light = scene.add.image(0, 0, cityFightLightTexture(scene, "puff")).setDepth(ARENA_DEPTHS.koLight).setBlendMode("ADD")
      .setTint(KO_LIGHT.tint).setVisible(false).setName("arena-ko-light");
    this.dim = scene.add.rectangle(0, 0, 1, 1, PALETTE.arenaKoBackdrop, 1).setOrigin(0, 0).setDepth(ARENA_DEPTHS.backdropDim)
      .setAlpha(0).setVisible(false).setName("arena-backdrop-dim");
  }

  /** Each body's contact shadow: an ellipse at its feet (`spatialAnchor` while a hop lifts it off the ground), sized by its body scale. */
  shadowsAt(bodies: readonly { readonly sprite: Phaser.GameObjects.Sprite; readonly bodyScale: number }[]): void {
    const g = this.shadows.clear();
    for (const { sprite, bodyScale } of bodies) {
      if (!sprite.visible) continue;
      const width = this.actorHeight * RING.shadowWidth * bodyScale;
      const feet = (sprite.getData("spatialAnchor") as { x: number; y: number } | undefined) ?? { x: sprite.x, y: sprite.y };
      g.fillStyle(PALETTE.webtoonInk, 0.38).fillEllipse(feet.x, feet.y, width, width * 0.22);
    }
  }

  /**
   * A stage dressing drawn with the ring (the duel's airship — its own depth over the ring, under the ink): into the background layer, so an
   * awakening's night falls on it too.
   */
  adopt(piece: Phaser.GameObjects.GameObject): void { this.back.add(piece); }

  /** An awakening's sky can be drawn (the shader is on the layer — WebGL). */
  get nightReady(): boolean { return this.night !== null; }

  /**
   * The fight's backdrop this frame (`NativeCityCombatHost.backdrop`): an awakening's `night` turns the night and the ring to a starry night
   * at its strength (its clouds and stars on its clock), any other frame is the decisive blows' ink sheet.
   */
  backdrop(frame: NativeCityBackdropFrame, view: Phaser.Geom.Rectangle): void {
    const night = frame.mode === "night" && frame.alpha > 0 ? this.night : null;
    if (this.night) this.night.active = night !== null;
    if (night) {
      night.mode = "night"; night.alpha = Math.min(1, frame.alpha); night.nightMs = frame.clockMs ?? 0; night.sky = frame.sky ?? null;
      night.pitchScale = this.scene.game.renderer.width / Math.max(1, this.scene.scale.width);
    }
    this.dimTo(frame.mode === "night" ? 0 : frame.alpha, view);
  }

  /**
   * The KO's light (2026-10-23 arena audit — black clothes vanished on the KO's ink): a warm glow `size` world px across at (x, y) (the
   * blow), shown with the decisive ink and gone with it.
   */
  koLight(at: { readonly x: number; readonly y: number; readonly size: number }): void { this.lightAt = at; }

  /** The decisive blows' ink over the ring (the fight's backdrop pass, `NativeCityCombatHost.backdrop`): `alpha` over the camera's view. */
  dimTo(alpha: number, view: Phaser.Geom.Rectangle): void {
    const shown = Math.max(0, Math.min(1, alpha));
    this.dim.setVisible(shown > 0).setAlpha(shown);
    if (shown > 0) this.dim.setPosition(view.x - 4, view.y - 4).setSize(view.width + 8, view.height + 8);
    else this.lightAt = null;
    const at = this.lightAt;
    this.light.setVisible(at !== null);
    if (at) this.light.setPosition(at.x, at.y).setDisplaySize(at.size, at.size).setAlpha(KO_LIGHT.alpha * shown);
  }
}
