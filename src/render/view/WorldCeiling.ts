import type Phaser from "phaser";

/**
 * 월드 위 조각을 화면 위쪽 HUD 밑에 두기(2026-10-24 — 사용자: 무투장 얼굴 HUD 위로 글자·숫자·파편이 걸친다): 천장(월드 y)보다 위로
 * 그려지려는 조각을 카메라가 그리기 직전(Phaser `prerender`)에 그 밑으로 내린다. 무투장 장면은 효과를 갱신한 뒤에 카메라 리그를 움직여서
 * 갱신 때의 천장은 한 프레임 늦다 — 타격에 카메라가 당겨지면 그만큼 조각이 HUD 로 밀려 올라갔다. 순수 계산(`underCeiling`)과 걸기(`holdUnderCeiling`)를 둔다.
 */

/** A piece as the ceiling sees it: where it is drawn and how far over its origin it reaches. */
export interface CeilingPiece {
  readonly visible: boolean;
  y: number;
  readonly displayHeight: number;
  readonly originY: number;
}

/** The y that keeps a piece's top (`y − displayHeight × originY`) at or under `ceiling`. */
export function underCeiling(y: number, displayHeight: number, originY: number, ceiling: number): number {
  return Math.max(y, ceiling + displayHeight * originY);
}

/**
 * A burst's scale and y under `ceiling` (a glass shatter — its contact stays its centre): shrunk about its origin to fit, never under
 * `minShare` of its size, then moved down by what still passes it. `frameHeight` is its frame's height before `scale`.
 */
export function fitUnderCeiling(y: number, scale: number, frameHeight: number, originY: number, ceiling: number, minShare: number)
  : { readonly y: number; readonly scale: number } {
  const above = frameHeight * originY;
  if (above <= 0 || y - above * scale >= ceiling) return { y, scale };
  const fitted = Math.max(scale * minShare, Math.min(scale, Math.max(0, y - ceiling) / above));
  return { y: underCeiling(y, frameHeight * fitted, originY, ceiling), scale: fitted };
}

/** Each shown piece put back under `ceiling` (its top no higher). */
export function keepUnderCeiling(pieces: Iterable<CeilingPiece>, ceiling: number): void {
  for (const piece of pieces) if (piece.visible) piece.y = underCeiling(piece.y, piece.displayHeight, piece.originY, ceiling);
}

/**
 * Just before the scene's cameras draw (every frame), `pieces` are kept under `ceiling()` (null: no ceiling this frame). Returns the way to
 * stop it (call it when the view is destroyed). The event is named, not imported: the views that use this import Phaser's types only.
 */
export function holdUnderCeiling(scene: Phaser.Scene, pieces: () => Iterable<CeilingPiece>, ceiling: () => number | null): () => void {
  const hold = (): void => {
    const at = ceiling();
    if (at !== null) keepUnderCeiling(pieces(), at);
  };
  scene.events.on("prerender", hold);
  return () => { scene.events.off("prerender", hold); };
}

/**
 * The world y of `share` of the screen's height down, from the camera's scroll and zoom as they are now (its `worldView` is only worked out
 * as it draws) — the arena's face HUD floor (`ArenaFaceHud.floorShare`).
 */
export function cameraShareY(camera: Pick<Phaser.Cameras.Scene2D.Camera, "scrollY" | "height" | "zoom">, share: number): number {
  const viewHeight = camera.height / Math.max(1e-6, camera.zoom);
  return camera.scrollY + camera.height / 2 - viewHeight / 2 + viewHeight * share;
}
