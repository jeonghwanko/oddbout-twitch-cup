/*
 * 이펙트 도형의 공용 형식과 도구(2026-10-16, 이펙트 리팩터 4단계). 이펙트 모듈은 그림을 도형 목록(`FxPrim[]`)으로 내고, 렌더러
 * (`RopeFxPhaserRenderer`·마을 FX 뷰)가 그린다. 전에는 로프 이펙트 모듈(`RopeTraversalFx`)이 이 형식을 가져서 전투·소음·마을 이펙트가
 * 모두 로프 모듈에 기대었고, 격자 다각형·레이어 다각형 도우미가 파일마다 따로 있었다.
 * 노드 도구(시트 CLI)도 이 파일을 읽는다 — import 에 `.ts` 를 붙인다.
 */

/** 채워진 다각형. */
export interface FxPolyPrim {
  readonly kind: "poly";
  readonly points: readonly number[];
  readonly color: number;
  readonly alpha: number;
  readonly additive: boolean;
}

/** 가운데서 가장자리로 부드럽게 꺼지는 가산 원. 렌더러마다 방사형 그라데이션으로 그린다. */
export interface FxLightPrim {
  readonly kind: "light";
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: number;
  readonly alpha: number;
  /**
   * 세로 반지름 / 가로 반지름. 없으면 1(원). 바닥에 깔린 빛 웅덩이는 납작한 타원이어야
   * 원근 바닥으로 읽힌다 — 둥근 빛은 공중에 뜬 공이 된다.
   */
  readonly squash?: number;
}

export type FxPrim = FxPolyPrim | FxLightPrim;

export interface FxPoint {
  readonly x: number;
  readonly y: number;
}

/** 저택 도트 이펙트의 격자(월드 px). 꼭짓점을 이 격자에 붙여야 확대된 화면에서 도트 그림으로 읽힌다. */
export const FX_GRID_PX = 2;

/** `v` 를 도트 격자에 붙인다. */
export const fxSnap = (v: number): number => Math.round(v / FX_GRID_PX) * FX_GRID_PX;

/** 꼭짓점을 도트 격자에 붙인 다각형(저택 이펙트). */
export function fxGridPoly(points: readonly number[], color: number, alpha = 1, additive = false): FxPolyPrim {
  return { kind: "poly", points: points.map(fxSnap), color, alpha, additive };
}

/** 보일 다각형(불투명도 0.004 초과, 꼭짓점 셋 이상)만 `layer` 에 넣는다. 불투명도는 1 을 넘지 않는다(마을 이펙트). */
export function pushFxPoly(layer: FxPrim[], points: number[], color: number, alpha: number, additive = false): void {
  if (alpha > 0.004 && points.length >= 6) layer.push({ kind: "poly", points, color, alpha: Math.min(1, alpha), additive });
}
