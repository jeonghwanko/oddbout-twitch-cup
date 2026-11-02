import type Phaser from "phaser";

/**
 * Phaser 텍스처 사본을 내릴지 정하는 선언 장부(`PhaserTextureResidency` 가 읽는다).
 * - 묶음: 한 캐릭터의 시트 묶음. three 가 묶음의 시트 하나를 맡으면 나머지 Phaser 사본도 함께 내린다 — 몸을 돌리면 three 가 쓸 시트다.
 * - 그리는 시트: Phaser 가 직접 그리는 시트. 내리지 않는다.
 *
 * Phaser 를 import 하지 않는다. 시트를 선언하는 쪽(마을 preload, 캐릭터 뷰, 대화 초상)은 Phaser 없는 테스트에서도 불린다.
 */
const familyOf = new Map<string, string>();
const familyKeys = new Map<string, readonly string[]>();

/** 시트 키 목록을 한 묶음으로 알린다. 같은 목록을 여러 번 알려도 같은 묶음이다. */
export function declarePhaserTextureFamily(keys: readonly string[]): void {
  const members = [...new Set(keys)].sort(), id = members.join("\n");
  familyKeys.set(id, members);
  for (const key of members) familyOf.set(key, id);
}

/** 시트가 속한 묶음(이름과 키 목록). 묶음이 없으면 null. */
export function phaserTextureFamilyOf(key: string): { readonly id: string; readonly keys: readonly string[] } | null {
  const id = familyOf.get(key);
  return id === undefined ? null : { id, keys: familyKeys.get(id) ?? [] };
}

const drawn = new Set<string>();
const drawnListeners = new Set<(keys: readonly string[]) => void>();

/**
 * Phaser 가 마을에서도 직접 그리는 시트(대화 초상의 몸 시트, 웹툰 컷 등). 3D 카드가 같은 시트를 맡아도 저해상도로 내리지 않는다.
 * 이미 내린 뒤에 알리면 `PhaserTextureResidency` 가 원본으로 되돌린다. 그리는 쪽이 그 시트를 알게 되는 때 부른다.
 */
export function declarePhaserDrawnTextures(keys: readonly string[]): void {
  const added = [...new Set(keys)].filter(key => !drawn.has(key));
  for (const key of added) drawn.add(key);
  if (added.length > 0) for (const listener of drawnListeners) listener(added);
}

export function isPhaserDrawnTexture(key: string): boolean {
  return drawn.has(key);
}

/** 새로 알린 '그리는 시트'를 듣는다. 해제 함수를 돌려준다. */
export function onPhaserDrawnTextures(listener: (keys: readonly string[]) => void): () => void {
  drawnListeners.add(listener);
  return () => { drawnListeners.delete(listener); };
}

let readiness: ((game: Phaser.Game, key: string) => boolean) | null = null;

/** 상주 장부(`PhaserTextureResidency`)가 처음 시트를 내릴 때 건다. 그 전에는 내린 시트가 없다. */
export function setPhaserTextureReadiness(check: (game: Phaser.Game, key: string) => boolean): void {
  readiness = check;
}


export function preparePhaserTexture(game: Phaser.Game, key: string): boolean {
  return readiness === null || readiness(game, key);
}
