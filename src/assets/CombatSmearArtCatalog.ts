import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";
import ANCHORS from "./combat-smear-anchors.json";

/**
 * 공격 번짐(스미어) 원화(2026-10-16, codex image_gen): 공격 경로 모양마다 붓 한 획 — 남색 잉크 몸통, 금색 앞날(닿는 쪽), 마른 붓 꼬리.
 * 원본·프롬프트는 `assets/art/combat-smear-20261016`, 포장·기준점 측정은 `tools/art/package-combat-smear.mjs`.
 * 칸마다 `lead`(금 앞날의 무게중심 — 맞는 점), `tail`(앞날에서 가장 먼 ¼ 의 무게중심), `bend`(획 전체의 무게중심 — 휘는 쪽)는
 * 런타임 칸(px) 좌표다(`combat-smear-anchors.json`).
 */
export type CombatSmearKind = "thrust" | "hook" | "swing" | "slam" | "slide" | "jab";

export interface CombatSmearCell {
  readonly index: number;
  readonly lead: readonly [number, number];
  readonly tail: readonly [number, number];
  readonly bend: readonly [number, number];
}

export const COMBAT_SMEAR_ART: SpriteSheetAssetDefinition = Object.freeze({
  key: "combat-smear-sheet",
  path: "art/fx/combat-smear-20261016/smear.webp",
  frameWidth: ANCHORS.cellPx,
  frameHeight: ANCHORS.cellPx,
  columns: ANCHORS.columns,
  rows: ANCHORS.rows,
});

export const COMBAT_SMEAR_FILE_PATHS: readonly string[] = [COMBAT_SMEAR_ART.path];

export const COMBAT_SMEAR_CELLS = ANCHORS.cells as unknown as Readonly<Record<CombatSmearKind, CombatSmearCell>>;
