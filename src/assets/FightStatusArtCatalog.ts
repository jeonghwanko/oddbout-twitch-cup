import type { CityFightFoeStatus, CityFightPlayerStatus } from "../sim/cityFight/CityFightStatus";

/**
 * 1:1 싸움 게이지의 상태 아이콘 아틀라스(2026-10-18, codex image_gen 한 장 — 출처 `assets/art/fight-status-icons-20261018/`). 투명 배경,
 * 96 px 정사각 칸 3×3. 칸 순서가 `frames` 다. 게이지는 Phaser 칸 자르기로, 설명 창(DOM)은 같은 그림의 배경 위치로 그린다.
 */
export const FIGHT_STATUS_ICON_ATLAS = Object.freeze({
  key: "fight-status-icons",
  path: "art/ui/fight-status-icons-v1.webp",
  width: 288,
  height: 288,
  frameWidth: 96,
  frameHeight: 96,
  columns: 3,
  rows: 3,
  frames: Object.freeze(["armor", "guard", "opening", "broken", "down", "grab", "invulnerable", "guardBroken", "dizzy"] as const),
});

export type FightStatusIcon = (typeof FIGHT_STATUS_ICON_ATLAS.frames)[number];


export function fightStatusIcon(status: CityFightFoeStatus | CityFightPlayerStatus): FightStatusIcon {
  return status === "grabbed" ? "grab" : status;
}

/** The icon's cell in the atlas (px). */
export function fightStatusIconCell(icon: FightStatusIcon): { readonly x: number; readonly y: number } {
  const index = FIGHT_STATUS_ICON_ATLAS.frames.indexOf(icon), { columns, frameWidth, frameHeight } = FIGHT_STATUS_ICON_ATLAS;
  return { x: (index % columns) * frameWidth, y: Math.floor(index / columns) * frameHeight };
}
