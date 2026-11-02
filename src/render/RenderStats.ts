/**
 * 렌더 통계 등록부. 렌더러를 가진 뷰가 자기 숫자(드로콜·텍스처 메모리 등)를 읽는 함수를 등록하고,
 * `?perf=1` 성능 표시(`dev/PerfOverlay.ts`)와 측정 도구가 같은 숫자를 읽는다.
 *
 * 읽기 함수는 표시가 켜졌을 때만 몇 번씩 불린다. 렌더 경로에서 매 프레임 계산하지 않는다.
 */
export type RenderStatsValue = string | number | null;

export interface RenderStatsSection {
  readonly title: string;
  read(): Readonly<Record<string, RenderStatsValue>>;
  /**
   * Phaser 텍스처 원본(이미지·캔버스) 가운데 이 렌더러가 자기 컨텍스트에 다시 올린 것. 컨텍스트가 달라 GPU 에 두 벌 있다.
   * 성능 표시의 Phaser 섹션이 이 몫을 따로 센다.
   */
  sharedSources?(): Iterable<object>;
}

const sections = new Set<RenderStatsSection>();

/** 등록하고 해제 함수를 돌려준다. 뷰의 `destroy`에서 부른다. */
export function registerRenderStats(section: RenderStatsSection): () => void {
  sections.add(section);
  return () => { sections.delete(section); };
}

export function renderStatsSections(): readonly RenderStatsSection[] {
  return [...sections];
}

/** GPU 텍스처 크기 어림: 픽셀 수 × 픽셀당 바이트 × (밉맵이면 4/3). 드라이버의 정렬·압축은 세지 않는다. */
export function textureBytes(width: number, height: number, bytesPerPixel: number, mipmapped: boolean): number {
  return Math.round(width * height * bytesPerPixel * (mipmapped ? 4 / 3 : 1));
}

export const MIB = 1024 * 1024;
