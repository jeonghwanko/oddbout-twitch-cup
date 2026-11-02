import sheets from "./arena-mobile-art.json";


const SHEETS: Readonly<Record<string, readonly number[]>> = sheets.sheets;

/**
 * 선수 하나의 모바일 판 배율. `onScreen` 은 폰 무투장에서 원본 1 화소가 덮는 백버퍼 화소 수다(경기 시작 때 실측 — `npm run perf:arena:mobile
 * -- --scales`). 경기 중 최대는 시작 때보다 약 5% 크다(`ARENA_MOBILE_ART.boutPeak`). 최대에서도 텍셀 하나가 백버퍼 `stretch` 화소를 넘지
 * 않는 가장 작은 배율을 `step` 단위로 올려 고르고, `min` 아래로는 내리지 않는다. 1 이면 모바일 판을 만들지 않는다.
 */
export const ARENA_MOBILE_ART = Object.freeze({ boutPeak: 1.06, stretch: 1.15, step: 0.05, min: 0.5 });
export function arenaMobileScale(onScreen: number): number {
  const { boutPeak, stretch, step, min } = ARENA_MOBILE_ART;
  const steps = Math.ceil(Math.round(onScreen * boutPeak / stretch / step * 1e6) / 1e6);
  return Math.min(1, Math.max(min, Math.round(steps * step * 100) / 100));
}

/** 모바일 판의 경로: 원본 `art/characters/…` 와 같은 자리의 `art/characters-mobile/…`. */
export function arenaMobileArtPath(path: string): string {
  return path.replace(/^art\/characters\//, "art/characters-mobile/");
}

/** 시트 `path`(public 기준)의 모바일 판과 원본 크기. 모바일 판이 없으면 null. */
export function arenaMobileSheet(path: string): { readonly path: string; readonly width: number; readonly height: number } | null {
  const [width, height] = SHEETS[path] ?? [];
  return width !== undefined && height !== undefined ? { path: arenaMobileArtPath(path), width, height } : null;
}
