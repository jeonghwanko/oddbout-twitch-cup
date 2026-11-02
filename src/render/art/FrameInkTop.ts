import type Phaser from "phaser";

/**
 * 원화 칸의 실제 그림 위 끝(2026-10-24 — 사용자: 높이 올라가는 자세가 무투장 얼굴 HUD 뒤로 간다, "고쳐"): 칸의 위쪽 투명 여백을 빼고
 * 그림이 시작하는 줄을 칸 높이의 몫으로 잰다. 카메라가 몸 그림이 어디까지 닿는지 알려고 쓴다 — 칸 경계는 머리 위 여백까지 넣어 높이를
 * 부풀리고, 등록 선수의 원화는 미리 잴 수 없어 그리는 순간 잰다. 칸마다 처음 한 번 작은 캔버스에 줄여 그려 읽고 기억한다.
 */

/**
 * The opacity (0..255) a row needs to count as drawn, the sample's height (px — a quarter of a 256 px cell is plenty), and the most frames a
 * sheet may have to be read as one clip (`textureInkTopShare` — more is an atlas of several moves).
 */
const INK = Object.freeze({ alpha: 40, sampleRows: 64, minSourcePx: 16, clipFrames: 40 });

const measured = new WeakMap<object, Map<string | number, number | null>>();
const clips = new WeakMap<object, number>();
let canvas: HTMLCanvasElement | null = null;

/**
 * The share of `frame`'s height above its first drawn row (0: drawn from its top; 1: an empty frame), or null when it cannot be read: a
 * compressed texture, a stand-in still waiting for its decode (`PhaserTextureResidency` — not remembered: the real art reads later).
 */
export function frameInkTopShare(frame: Phaser.Textures.Frame): number | null {
  const texture = frame.texture as object;
  let frames = measured.get(texture);
  if (frames?.has(frame.name)) return frames.get(frame.name)!;
  const image = frame.source.image as (CanvasImageSource & { readonly width?: number }) | null, sourceWidth = frame.source.width;
  const imageWidth = typeof image?.width === "number" ? image.width : 0;
  if (!image || imageWidth < INK.minSourcePx || sourceWidth <= 0 || frame.cutHeight <= 0) return null;
  const k = imageWidth / sourceWidth, rows = Math.max(1, Math.min(INK.sampleRows, Math.round(frame.cutHeight * k)));
  const cols = Math.max(1, Math.round(rows * frame.cutWidth / frame.cutHeight));
  let share: number | null;
  try {
    canvas ??= document.createElement("canvas");
    canvas.width = cols; canvas.height = rows;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.clearRect(0, 0, cols, rows);
    context.drawImage(image, frame.cutX * k, frame.cutY * k, frame.cutWidth * k, frame.cutHeight * k, 0, 0, cols, rows);
    const pixels = context.getImageData(0, 0, cols, rows).data;
    let row = rows;
    for (let y = 0; y < rows && row === rows; y++) for (let x = 0; x < cols; x++) if (pixels[(y * cols + x) * 4 + 3]! > INK.alpha) { row = y; break; }
    share = row / rows;
  } catch {
    // A texture the canvas cannot draw or read (compressed, cross-origin): its box stands for it, and it is not tried again.
    share = null;
  }
  if (!frames) { frames = new Map(); measured.set(texture, frames); }
  frames.set(frame.name, share);
  return share;
}

/**
 * The least empty share over every frame of `texture` (`frameInkTopShare`): a clip sheet's tallest pose — the fighters' moves are one sheet
 * each (`…-slam`, `…-combo`), so a camera reading it as the move starts frames its highest cell before it is drawn (Yume's slam reaches its
 * cell's top on its fourth cell: read cell by cell the camera only began to ease out then). Null for a sheet of more than `clipFrames` frames
 * (an atlas of several moves) or one not readable yet.
 */
export function textureInkTopShare(texture: Phaser.Textures.Texture): number | null {
  const known = clips.get(texture);
  if (known !== undefined) return known;
  const names = texture.getFrameNames();
  if (names.length === 0 || names.length > INK.clipFrames) return null;
  let least = 1;
  for (const name of names) {
    const share = frameInkTopShare(texture.get(name));
    if (share === null) return null;
    least = Math.min(least, share);
  }
  clips.set(texture, least);
  return least;
}

/**
 * The world y where `sprite`'s drawing starts at the top: its box top plus its frame's empty rows (`frameInkTopShare`) — with `wholeClip`,
 * its sheet's tallest frame's (`textureInkTopShare`; the frame's own where the sheet is no single clip); the box top for a turned or
 * upside-down sprite, or one whose frame cannot be read.
 */
export function spriteInkTopY(sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, wholeClip = false): number {
  const top = sprite.y - sprite.displayHeight * sprite.originY;
  if (sprite.flipY || Math.abs(sprite.angle) > 2) return Math.min(top, sprite.getBounds().top);
  const frame = frameInkTopShare(sprite.frame) ?? 0, clip = wholeClip ? textureInkTopShare(sprite.texture) : null;
  return top + Math.min(frame, clip ?? frame) * sprite.displayHeight;
}
