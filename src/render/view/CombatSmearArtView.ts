import type Phaser from "phaser";
import { COMBAT_SMEAR_ART } from "../../assets/CombatSmearArtCatalog";
import { artTextureKey } from "../art/ArtFallback";
import { preloadSpriteSheets } from "../art/PhaserAssetLoader";
import type { CombatSmearDraw } from "../effects/CombatSmear";

/**
 * 공격 번짐 원화(`CombatSmear`)의 그림 풀. 시트는 만들 때 받는다(장식 — 아직 없으면 아무것도 그리지 않고 리본 궤적이 그대로 남는다,
 * `ArtFallback`). 마을 대결과 저택 전투가 같은 뷰를 쓴다.
 */
export class CombatSmearArtView {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  constructor(private readonly scene: Phaser.Scene, depth: number, pool = 6) {
    this.sprites = Array.from({ length: pool }, () => scene.add.sprite(0, 0, "__DEFAULT")
      .setVisible(false).setDepth(depth).setName("combat-smear-art"));
    preloadSpriteSheets(scene, [COMBAT_SMEAR_ART]);
    if (!scene.load.isLoading() && scene.load.list.size > 0) scene.load.start();
  }

  get objects(): readonly Phaser.GameObjects.GameObject[] { return this.sprites; }

  /** The sheet is in (until then the ribbons draw every stroke). */
  get ready(): boolean { return artTextureKey(this.scene, COMBAT_SMEAR_ART.key, "decorative") !== null; }

  draw(draws: readonly CombatSmearDraw[]): void {
    const key = draws.length > 0 ? artTextureKey(this.scene, COMBAT_SMEAR_ART.key, "decorative") : null;
    let used = 0;
    if (key !== null) {
      for (const d of draws.slice(-this.sprites.length)) {
        this.sprites[used++]!.setTexture(key, d.frame).setOrigin(d.originX, d.originY).setPosition(d.x, d.y)
          .setRotation(d.rotation).setScale(d.scale, d.scaleY).setFlipY(d.flipY).setVisible(true);
      }
    }
    for (let i = used; i < this.sprites.length; i++) this.sprites[i]!.setVisible(false);
  }

  destroy(): void { for (const sprite of this.sprites) sprite.destroy(); }
}
