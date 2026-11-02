import type Phaser from "phaser";
import { FIGHTER_MOVE_FX_EFFECTS, FIGHTER_MOVE_FX_SHEETS, type FighterMoveFxEffect } from "../../../assets/FighterMoveFxArtCatalog";
import { artTextureKey } from "../../art/ArtFallback";
import { preloadSpriteSheets } from "../../art/PhaserAssetLoader";
import { VILLAGE_DEPTHS } from "../../depths";

/** A corner's comic reaction (`ArenaDuelReactions`): the sweat of a swing into air, the anger of a second guarded blow, the shock of a cut swing. */
export type ArenaReactionMark = "sweat" | "anger" | "shock";

/**
 * Each mark's drawn effect (`fighter-move-fx.json` `comicReactions`) and where it sits from his crown: [toward his rival, up] in his body
 * heights — the sweat on the back of his head, the vein on his brow, the shock lines over his crown.
 */
const MARKS: Readonly<Record<ArenaReactionMark, { readonly effect: string; readonly at: readonly [number, number] }>> = Object.freeze({
  sweat: { effect: "sweatMark", at: [-0.08, -0.1] },
  anger: { effect: "angerMark", at: [0.1, -0.02] },
  shock: { effect: "shockMark", at: [0, 0.05] },
});


const CROWN_LEAN = 0.12;

/**
 * A corner's head this frame (world px): his head point's x, the top of his drawing (`spriteInkTopY` — 2026-10-24: a big body's head point
 * sat on his chest), his body height (px) and the side his rival stands on screen.
 */
export interface ArenaReactionHead { readonly x: number; readonly top: number; readonly bodyPx: number; readonly front: -1 | 1 }

/**
 * 무투장 AI 대결의 머리 옆 상황 기호(2026-10-24 이펙트 보강 3번 — 사용자: 코믹 요소): 그린 땀방울·핏대·놀람 획 하나를 그 선수의 그려진 머리 옆에
 * 붙여 제 칸 시간대로 재생한다. 선수마다 한 번에 하나다(새 기호가 앞 기호를 바꾼다). 싸움 시계로 돌아 타격 정지 동안 멈춘다. 시트는 만들 때
 * 받는다(장식 — 오기 전에는 그리지 않는다). 월드 카메라 전용이다(씬이 UI 카메라의 무시 목록을 만들기 전에 만든다).
 */
export class ArenaReactionMarks {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private readonly live: ({ readonly effect: FighterMoveFxEffect; readonly at: readonly [number, number]; ageMs: number } | null)[] = [null, null];

  constructor(private readonly scene: Phaser.Scene) {
    this.sprites = [0, 1].map(i => scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setDepth(VILLAGE_DEPTHS.fightReactionMark)
      .setName(`arena-reaction-mark-${i}`));
    preloadSpriteSheets(scene, [FIGHTER_MOVE_FX_SHEETS.comicReactions]);
    if (!scene.load.isLoading() && scene.load.list.size > 0) scene.load.start();
  }

  get objects(): readonly Phaser.GameObjects.GameObject[] { return this.sprites; }

  /** Corner `corner` shows `mark` from now (over any mark he still shows). */
  pop(corner: 0 | 1, mark: ArenaReactionMark): void {
    const spec = MARKS[mark], effect = FIGHTER_MOVE_FX_EFFECTS[spec.effect];
    if (effect) this.live[corner] = { effect, at: spec.at, ageMs: 0 };
  }

  /** One frame: `fightDtMs` of the duel clock (0 in the hit stop), each corner's drawn head (null: not drawn — his mark waits hidden). */
  draw(fightDtMs: number, heads: readonly (ArenaReactionHead | null)[]): void {
    const sheet = FIGHTER_MOVE_FX_SHEETS.comicReactions, key = artTextureKey(this.scene, sheet.key, "decorative");
    this.live.forEach((mark, i) => {
      const sprite = this.sprites[i]!, head = heads[i] ?? null;
      if (!mark) { sprite.setVisible(false); return; }
      mark.ageMs += Math.max(0, fightDtMs);
      const times = mark.effect.frameMs ?? [], total = times.reduce((sum, ms) => sum + ms, 0);
      if (mark.ageMs >= total) { this.live[i] = null; sprite.setVisible(false); return; }
      if (key === null || head === null) { sprite.setVisible(false); return; }
      let n = 0, start = 0;
      while (n < times.length - 1 && mark.ageMs >= start + times[n]!) start += times[n++]!;
      const last = n === times.length - 1 && mark.effect.fade === true ? 1 - (mark.ageMs - start) / Math.max(1, times[n]!) : 1;
      const [pivotX, pivotY] = mark.effect.pivot, width = mark.effect.size * head.bodyPx;
      sprite.setTexture(key, mark.effect.frames[n]).setOrigin(pivotX, pivotY).setScale(width / sheet.frameWidth)
        .setPosition(head.x + head.front * (CROWN_LEAN + mark.at[0]) * head.bodyPx, head.top - mark.at[1] * head.bodyPx)
        .setAlpha(Math.max(0, Math.min(1, last))).setVisible(true);
    });
  }

  destroy(): void { for (const sprite of this.sprites) sprite.destroy(); }
}
