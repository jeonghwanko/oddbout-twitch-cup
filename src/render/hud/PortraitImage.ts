import type Phaser from "phaser";
import {
  conversationExpressionCell,
  conversationPortraitFlipX,
  validConversationPortraitRegion,
  type ConversationPortrait,
  type ConversationSeat,
} from "../../app/ConversationPanel";
import { artTextureKey } from "../art/ArtFallback";

/**
 * `ConversationPortrait` 하나를 실제 `Image` 에 붙인다.
 *
 * 이 로직은 원래 대화 판 안에만 있었다. 그런데 초상은 이제 대화 판 밖에서도 쓰인다 —
 * 퀘스트 트래커의 메달리온, 완료·갱신 배너, 퀘스트 기록의 히어로 카드가 전부 같은 표정
 * 시트의 같은 칸을 가리킨다. 네 곳이 각자 region→frame 승격을 다시 쓰면 그중 하나가
 * `texture.firstFrame` 복원을 빠뜨리는 순간, 같은 텍스처를 쓰는 **다른** 화면의 기본
 * 프레임이 조용히 크롭으로 바뀐다. 그 사고를 한 번만 막을 수 있게 한 곳에 둔다.
 *
 * 텍스처가 없거나 region 이 시트 밖이면 `false` 를 돌려주고 아무것도 건드리지 않는다 —
 * 부르는 쪽은 그 자리를 비우고 글자를 원좌표로 되돌리면 된다.
 */
export function applyConversationPortrait(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  portrait: ConversationPortrait | null | undefined,
  /** 대화 판의 자리. 넘기면 규격(`conversationPortraitFlipX`)대로 상대 쪽을 보게 뒤집는다. */
  seat: ConversationSeat | null = null,
  cutCorners = false,
): boolean {
  if (!portrait || artTextureKey(scene, portrait.key, "decorative") === null) return false;
  const texture = scene.textures.get(portrait.key);
  let frame = portrait.frame;
  if (portrait.region) {
    const { x, y, width, height } = portrait.region;
    // The texture's own size, not its image's: a phone's mobile copy of a sheet is smaller than the sheet (`ArenaMobileArt`).
    if (!validConversationPortraitRegion(portrait.region, texture.source[0]!)) return false;
    frame = portrait.frame ?? `dialogue-${x}-${y}-${width}-${height}`;
    if (texture.has(String(frame))) {
      const existing = texture.get(frame);
      if (existing.cutX !== x || existing.cutY !== y || existing.cutWidth !== width || existing.cutHeight !== height)
        frame = `dialogue-${x}-${y}-${width}-${height}`;
    }
    if (!texture.has(String(frame))) {
      // Phaser promotes the first added region to the texture's default frame.
      // A dialogue crop must not change other images sharing this texture.
      const firstFrame = texture.firstFrame;
      texture.add(String(frame), 0, x, y, width, height);
      texture.firstFrame = firstFrame;
    }
  }
  if (frame !== undefined && !texture.has(String(frame))) return false;
  image.setTexture(portrait.key, frame).setFlipX(conversationPortraitFlipX(portrait.facing, seat));
  if (cutCorners) {
    // Clip only the dialogue presentation; preserve the shared atlas and authored crop.
    const source = image.frame;
    const key = `conversation-cut-${portrait.key}-${source.name}`;
    if (!scene.textures.exists(key)) {
      const width = source.cutWidth, height = source.cutHeight, corner = Math.min(width, height) * 0.09;
      const canvas = scene.textures.createCanvas(key, width, height);
      if (canvas) {
        const context = canvas.getContext();
        context.beginPath();
        context.moveTo(corner, 0); context.lineTo(width - corner, 0);
        context.lineTo(width, corner); context.lineTo(width, height - corner);
        context.lineTo(width - corner, height); context.lineTo(corner, height);
        context.lineTo(0, height - corner); context.lineTo(0, corner); context.closePath();
        context.clip();
        // The image may be a mobile copy smaller than the sheet (`ArenaMobileArt`): cut in its own pixels.
        const image = source.source.image as HTMLImageElement | HTMLCanvasElement, ratio = (image.width || source.source.width) / source.source.width;
        context.drawImage(image, source.cutX * ratio, source.cutY * ratio, width * ratio, height * ratio, 0, 0, width, height);
        canvas.refresh();
      }
    }
    if (scene.textures.exists(key)) image.setTexture(key);
  }
  return true;
}

/**
 * 2×2 표정 아틀라스에서 한 칸을 오려 낸 초상.
 *
 * 세 시트(시계공·로잘린·회사원 주인공)가 같은 규격이라 칸 크기는 텍스처에서 읽는다 —
 * 시트를 더 큰 해상도로 다시 구워도 이 코드가 따라 바뀌지 않는다.
 * 시트가 아직 없으면 `null` 이고, 부르는 쪽이 각자의 폴백 초상으로 물러난다.
 *
 * 대화 판 밖에서도 쓴다 — 퀘스트 트래커·배너·기록이 같은 시트의 같은 칸을 가리키므로
 * 크롭 규칙이 두 벌로 갈라지면 같은 인물이 화면마다 다른 얼굴로 잘린다.
 */
export function expressionSheetPortrait(
  scene: Phaser.Scene,
  key: string,
  expression: number,
): ConversationPortrait | null {
  if (artTextureKey(scene, key, "decorative") === null) return null;
  const cell = scene.textures.get(key).getSourceImage().width / 2;
  const frame = conversationExpressionCell(expression);
  return {
    key,
    // 크롭 전용 프레임 이름을 새로 만든다 — 같은 텍스처를 쓰는 다른 표면의 frame 0 을 건드리지 않는다.
    frame: `expression-${frame}`,
    region: { x: (frame % 2) * cell, y: Math.floor(frame / 2) * cell, width: cell, height: cell },
    // 표정 시트(시계공·로잘린·회사원)는 모두 정면으로 그렸다.
    facing: "front",
  };
}
