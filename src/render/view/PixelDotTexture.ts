import Phaser from "phaser";
import { cssHex } from "../art/palette";
import { PIXEL_DOT_TONES, type PixelDotSprite } from "../effects/PixelDotFx";

/** One transparent texel around every baked frame, so a scaled frame never samples its neighbour. */
const FRAME_PAD = 1;

/**
 * 손으로 찍은 격자(`PixelDotFx`) 하나의 모든 프레임을 나란히 한 장에 굽는다 — 텍셀 하나가 아트 픽셀 하나, NEAREST 라
 * 점이 번지지 않는다. 프레임 이름은 `"0".."n-1"`. 도시 뷰(`PixelDotFxView`)와 옷가게 변신 뷰가 같이 쓴다.
 */
export function bakePixelDotSprite(scene: Phaser.Scene, key: string, sprite: PixelDotSprite<string>): boolean {
  const stride = sprite.width + FRAME_PAD;
  const texture = scene.textures.createCanvas(key, FRAME_PAD + sprite.frames.length * stride, sprite.height + FRAME_PAD * 2);
  if (!texture) return false;
  const context = texture.getContext();
  context.clearRect(0, 0, texture.width, texture.height);
  sprite.frames.forEach((rows, f) => {
    const left = FRAME_PAD + f * stride;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const tone = sprite.palette[row[x]!];
        if (!tone) continue;
        context.fillStyle = cssHex(PIXEL_DOT_TONES[tone]);
        context.fillRect(left + x, FRAME_PAD + y, 1, 1);
      }
    });
    texture.add(String(f), 0, left, FRAME_PAD, sprite.width, sprite.height);
  });
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return true;
}
