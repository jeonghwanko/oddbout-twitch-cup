import type { FxPrim } from "./FxPrim";
import { fxRng } from "./FxRandom";

/**
 * 가장자리 집중선 — 화면 가장자리에서 접점으로 몰리는 잉크 쐐기(2026-10-15 프레임 검수의 엣지 기법). 가운데(맞은 몸 키의
 * `innerBody` 배)는 비워 두 몸이 읽히게 하고, `holdMs` 동안 정물로 섰다가 한 번에 끊는다(페이드 없음). 마을 대결과 저택 전투가 같이
 * 쓴다: 밝은 마을은 잉크 선, 어두운 저택은 종이 선. 첫 반격(`counter`)과 KO(`ko`, 임팩트 판 뒤)에만 — 흔해지면 무게가 사라진다.
 * 모션 감소에서는 없다(호출자가 거른다).
 */
export const COMBAT_FOCUS_LINES = Object.freeze({
  /** 쐐기 수: [첫 반격, KO]. */
  count: [24, 32] as const,
  /** 안쪽 끝: 접점에서 맞은 몸 키의 이 배수(여기에 `innerJitter` 배까지 더 물러난다). */
  innerBody: .9,
  innerJitter: .35,
  /** 가장자리에서의 쐐기 폭(화면 논리 px). */
  widthPx: [8, 18] as const,
  /** 서 있는 화면 ms — 그 뒤 한 번에 끊는다. */
  holdMs: 50,
});

export type CombatFocusLinesWeight = "counter" | "ko";

/**
 * `ageMs`(화면 시간) 시각의 집중선. `at`: 접점(월드), `bodyPx`: 맞은 몸 키(월드), `view`: 카메라가 보는 월드 사각형,
 * `linePx`: 화면 논리 1px 의 월드 길이. 같은 시드는 같은 배치다.
 */
export function combatFocusLinePrims(ageMs: number, at: { readonly x: number; readonly y: number }, bodyPx: number,
  view: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, seed: number,
  weight: CombatFocusLinesWeight, color: number, linePx = 1): FxPrim[] {
  const c = COMBAT_FOCUS_LINES;
  if (!(ageMs >= 0) || ageMs >= c.holdMs || !(bodyPx > 0)) return [];
  const corners = [[view.x, view.y], [view.x + view.width, view.y], [view.x, view.y + view.height], [view.x + view.width, view.y + view.height]];
  const reach = Math.max(...corners.map(([x, y]) => Math.hypot(x! - at.x, y! - at.y))) + 40 * linePx;
  const rng = fxRng(seed), n = c.count[weight === "ko" ? 1 : 0], out: FxPrim[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + (rng() - .5) * (Math.PI * 2 / n) * .8;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const inner = bodyPx * c.innerBody * (1 + c.innerJitter * rng());
    const width = (c.widthPx[0] + (c.widthPx[1] - c.widthPx[0]) * rng()) * linePx;
    const ox = at.x + dx * reach, oy = at.y + dy * reach, px = -dy * width / 2, py = dx * width / 2;
    out.push({ kind: "poly", points: [ox + px, oy + py, at.x + dx * inner, at.y + dy * inner, ox - px, oy - py], color, alpha: 1, additive: false });
  }
  return out;
}
