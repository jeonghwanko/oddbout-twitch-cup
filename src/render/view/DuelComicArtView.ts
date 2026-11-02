import type Phaser from "phaser";
import { COMIC_IMPACT_ART, COMIC_IMPACT_ART_KINDS, COMIC_IMPACT_SHEETS, comicImpactArtFrame, type ComicImpactArtKind } from "../../assets/ComicImpactArtCatalog";
import { preloadSpriteSheets } from "../art/PhaserAssetLoader";
import { artTextureKey } from "../art/ArtFallback";
import { duelComicArtHasLight, hypeContactOf, type DuelComicArtCommand } from "../effects/DuelComicArt";
import type { KeyedHypeContact } from "../effects/HypeImpactFx";
import { HypeImpactView } from "./HypeImpactView";

/** A bounded normal-blend pool, plus the light layer (`HypeImpactView`) that every confirmed contact also drives. */
export class DuelComicArtView {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private readonly hype: HypeImpactView;
  constructor(private readonly scene: Phaser.Scene, depth: number) {
    this.sprites = Array.from({ length: 24 }, () => scene.add.sprite(0, 0, "__DEFAULT")
      .setVisible(false).setOrigin(.5).setDepth(depth).setName("duel-comic-impact-art"));
    this.hype = new HypeImpactView(scene, depth);
    preloadSpriteSheets(scene, COMIC_IMPACT_SHEETS);
    if (!scene.load.isLoading() && scene.load.list.size > 0) scene.load.start();
  }
  /** Decorative: a missing sheet draws nothing here and the procedural contact recipe stays (`ArtFallback`). */
  ready(kind: ComicImpactArtKind): boolean { return artTextureKey(this.scene, COMIC_IMPACT_ART[kind].key, "decorative") !== null; }
  /** Every kind's `ready` (the procedural recipes keep only their light under a loaded cel — `drawNativeCityCombatFx`). */
  readiness(): Record<ComicImpactArtKind, boolean> {
    return Object.fromEntries(COMIC_IMPACT_ART_KINDS.map(kind => [kind, this.ready(kind)])) as Record<ComicImpactArtKind, boolean>;
  }
  /** 장면 정리 — 이어 그리던 불티까지 지운다. */
  clear(): void { this.draw([], [], 0); this.hype.clear(); }
  /**
   * `extra`: light-layer contacts with no comic art (the shattered guard, ground slams — `nativeCityHypeContact`). `nowMs`: the
   * caller's screen clock — the light layer carries a contact its caller let go on it (never the game loop's own time).
   */
  draw(commands: readonly DuelComicArtCommand[], extra: readonly KeyedHypeContact[], nowMs: number): void {
    // A stopped blow's light keeps its star and arc until its drawn cel is in (`HypeContact.drawn`).
    this.hype.draw([...commands.filter(command => duelComicArtHasLight(command.kind))
      .map(command => hypeContactOf(command, this.ready(command.kind))), ...extra], nowMs);
    let used = 0;
    for (const command of commands.slice(-this.sprites.length)) {
      const shown = comicImpactArtFrame(command.kind, command.ageMs, command.holdMs, command.clearHold === true);
      if (!shown || !this.ready(command.kind)) continue;
      const sprite = this.sprites[used++];
      if (!sprite) break;
      // The held peak boils: a 2-degree turn and a 3 % swell every other `COMIC_IMPACT_BOIL_MS`.
      const boil = shown.boil === 1;
      sprite.setTexture(COMIC_IMPACT_ART[command.kind].key, shown.frame).setPosition(command.x, command.y)
        .setScale(command.width / COMIC_IMPACT_ART[command.kind].frameWidth * (boil ? 1.03 : 1) * (shown.scale ?? 1)).setRotation(command.angle + (boil ? .035 : 0))
        .setFlipX(command.flipX).setAlpha(shown.alpha * (command.alpha ?? 1)).setVisible(true);
      if (command.tint !== undefined) sprite.setTint(command.tint); else if (sprite.isTinted) sprite.clearTint();
    }
    for (let i = used; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
  }
  destroy(): void { for (const sprite of this.sprites) sprite.destroy(); this.hype.destroy(); }
}
