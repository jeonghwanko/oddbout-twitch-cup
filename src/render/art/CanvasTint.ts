import Phaser from "phaser";

/**
 * Phaser Canvas 렌더러는 Image `setTint` 를 그리지 않는다. 흰 마스크 텍스처에 색을 입혀 쓰는 빛·그늘 층은
 * Canvas 에서 흰색 그대로 나온다 — 옥상 무대 비네트·바닥 감쇠가 흰 안개로, 등불 빛이 무채색으로 더해졌다
 * (2026-09-29 실측). WebGL 은 `setTint` 그대로, Canvas 는 같은 색을 곱한 텍스처 사본으로 바꿔 끼운다.
 *
 * 사본은 원본 × 색(곱하기)이고 알파는 원본 그대로다 — WebGL tint(텍스처 색 × tint)와 같은 결과다.
 * 같은 (텍스처, 색) 사본은 한 번만 만든다.
 */
export function applyLayerTint(scene: Phaser.Scene, image: Phaser.GameObjects.Image, color: number): Phaser.GameObjects.Image {
  if (scene.game.renderer.type === Phaser.WEBGL) return image.setTint(color);
  const key = bakeTintedTexture(scene, image.texture.key, color);
  if (key !== image.texture.key) {
    const { displayWidth, displayHeight } = image;
    image.setTexture(key).setDisplaySize(displayWidth, displayHeight);
  }
  return image;
}

/** `key` 텍스처(첫 프레임) × `color` 사본의 키. 만들 수 없으면 원래 키를 돌려준다. */
export function bakeTintedTexture(scene: Phaser.Scene, key: string, color: number): string {
  // 24비트 RGB 만 쓴다(부호 없는 16진의 마지막 여섯 자리).
  const hex = (color >>> 0).toString(16).padStart(6, "0").slice(-6);
  const tintedKey = `${key}--tint-${hex}`;
  if (scene.textures.exists(tintedKey)) return tintedKey;
  if (!scene.textures.exists(key)) return key;
  const source = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const width = source.width, height = source.height;
  if (width === 0 || height === 0) return key;
  const texture = scene.textures.createCanvas(tintedKey, width, height);
  if (texture === null) return key;
  const context = texture.getContext();
  context.drawImage(source, 0, 0);
  // 곱하기로 색을 입히고(투명 칸은 색으로 채워진다), 원본 알파로 다시 오린다.
  context.globalCompositeOperation = "multiply";
  context.fillStyle = `#${hex}`;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = "source-over";
  texture.refresh();
  return tintedKey;
}

/** 게임마다 (원본 키 → 최근 쓴 색 사본 키, 오래된 것부터) 목록. */
const TINT_LRU = new WeakMap<Phaser.Game, Map<string, string[]>>();

/**
 * `bakeTintedTexture` 에 상한을 건 판 — 매 프레임 여러 색이 바뀌는 층(줄타기·전투·줍기 FX 의 가산 빛)이 쓴다.
 * 같은 원본에서 굽은 사본이 `cap` 을 넘으면 가장 오래 안 쓴 사본부터 텍스처 관리자에서 지운다. `inUse(key)` 가
 * 참인 사본(지금 어떤 이미지가 그리고 있는 사본)은 지우지 않고 목록 뒤로 돌린다. 팔레트 램프 색 수(한 무대에
 * 스무 남짓)면 사본은 한 번씩만 굽고 멈춘다.
 */
export function bakeTintedTextureLru(scene: Phaser.Scene, key: string, color: number, cap: number,
  inUse: (tintedKey: string) => boolean): string {
  const tinted = bakeTintedTexture(scene, key, color);
  if (tinted === key) return key;
  let perGame = TINT_LRU.get(scene.game);
  if (perGame === undefined) TINT_LRU.set(scene.game, perGame = new Map());
  const order = perGame.get(key) ?? [];
  perGame.set(key, order);
  const at = order.indexOf(tinted);
  if (at >= 0) order.splice(at, 1);
  order.push(tinted);
  for (let guard = order.length; order.length > cap && guard > 0; guard -= 1) {
    const oldest = order.shift()!;
    if (oldest === tinted || inUse(oldest)) order.push(oldest);
    else scene.textures.remove(oldest);
  }
  return tinted;
}

/** 지금 LRU 에 남은 사본 수(테스트·진단용). */
export function tintedTextureCount(game: Phaser.Game, key: string): number {
  return TINT_LRU.get(game)?.get(key)?.length ?? 0;
}
