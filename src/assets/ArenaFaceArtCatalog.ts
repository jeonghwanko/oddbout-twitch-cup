import art from "./arena-face-art.json";

/**
 * 무투장 얼굴 HUD 의 표정 시트(2026-10-23, 시안 v5 — 사용자: "이거 좋다"): 선수마다 한 장, 3열 × 2행 여섯 칸에 같은 상반신의 여섯 표정
 * (`ARENA_FACE_EXPRESSIONS` 순서 — 기본·맞음·으스댐·위기·옆눈질·KO). 모든 얼굴은 화면 오른쪽(3/4 측면)을 본다 — 오른쪽 코너는 뒤집어 그린다.
 * 카드 정면 원화와 필살기 컷인을 기준으로 Codex image_gen 이 그렸다. 원본·프롬프트는 `assets/art/arena-faces-20261023`,
 * 런타임 파일은 `tools/art/import-arena-faces.mjs` 가 만든다. 시트가 없는 선수(등록 선수)는 카드 원화의 얼굴 칸으로 선다.
 */
export const ARENA_FACE_EXPRESSIONS = Object.freeze(["default", "hit", "smug", "danger", "sideeye", "ko"] as const);
export type ArenaFaceExpression = (typeof ARENA_FACE_EXPRESSIONS)[number];

export interface ArenaFaceSheet {
  readonly key: string;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  /** One cell's side (runtime px); the sheet is `columns` × `rows` of them. */
  readonly cell: number;
}

export const ARENA_FACE_SHEET_GRID = Object.freeze({ columns: art.columns, rows: art.rows });

export const ARENA_FACE_SHEETS: Readonly<Record<string, ArenaFaceSheet>> = Object.freeze(Object.fromEntries(
  Object.entries(art.art).map(([id, a]) => [id, Object.freeze({ key: `arena-face-${id}`, path: a.path, width: a.width, height: a.height, cell: art.cell })]),
));

export const ARENA_FACE_FILE_PATHS: readonly string[] = Object.freeze(Object.values(ARENA_FACE_SHEETS).map(sheet => sheet.path));

/** `id`'s expression sheet, or null where none is drawn. */
export function arenaFaceSheet(id: string): ArenaFaceSheet | null { return ARENA_FACE_SHEETS[id] ?? null; }

/** `expression`'s cell in a sheet (runtime px, its top-left). */
export function arenaFaceCell(sheet: ArenaFaceSheet, expression: ArenaFaceExpression): { readonly x: number; readonly y: number } {
  const index = ARENA_FACE_EXPRESSIONS.indexOf(expression);
  return { x: (index % ARENA_FACE_SHEET_GRID.columns) * sheet.cell, y: Math.floor(index / ARENA_FACE_SHEET_GRID.columns) * sheet.cell };
}
