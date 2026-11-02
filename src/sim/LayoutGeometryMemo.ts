import type { GeometryRect } from "./MansionLayout";
import type { Rect } from "./GeometryTypes";

/**
 * 스텝마다 다시 만드는 레이아웃 투영(블랙손 장치·물리 소품)의 지형 배열을 입력 배열의 정체성으로 기억한다.
 * 입력은 모두 읽기 전용이라 같은 입력 → 같은 출력이 보장되고, 결과 배열의 정체성이 스텝 사이에 유지돼
 * 아래 소비자(정적 물리 월드 키 등)가 매 틱 지형 전체를 다시 훑지 않는다. 판정 값은 바뀌지 않는다 —
 * 순수 파생 캐시이며 SimState 는 담지 않는다(WeakMap 이라 레이아웃이 사라지면 함께 사라진다).
 */
const appended = new WeakMap<readonly GeometryRect[], Map<string, readonly GeometryRect[]>>();

function rectKey(r: Rect): string { return `${r.x},${r.y},${r.w},${r.h}`; }

/** `[...base, extra]` 와 같은 배열을 base·extra 내용마다 하나만 만든다. */
export function withGeometry(base: readonly GeometryRect[], extra: GeometryRect): readonly GeometryRect[] {
  let byExtra = appended.get(base);
  if (!byExtra) { byExtra = new Map(); appended.set(base, byExtra); }
  const key = `${extra.id}|${extra.kind}|${rectKey(extra.rect)}`;
  let result = byExtra.get(key);
  if (!result) { result = [...base, extra]; byExtra.set(key, result); }
  return result;
}

const withoutPhysics = new WeakMap<readonly GeometryRect[], readonly GeometryRect[]>();

/** 물리 소품(`physics:` 접두사)을 뺀 지형. 같은 배열에는 같은 결과를 돌려준다. */
export function geometryWithoutPhysics(geometry: readonly GeometryRect[]): readonly GeometryRect[] {
  let result = withoutPhysics.get(geometry);
  if (!result) {
    result = geometry.some(g => g.id.startsWith("physics:")) ? geometry.filter(g => !g.id.startsWith("physics:")) : geometry;
    withoutPhysics.set(geometry, result);
  }
  return result;
}

const staticSolids = new WeakMap<readonly GeometryRect[], { readonly rects: readonly Rect[]; readonly key: string }>();

/** 정적 물리 월드가 쓰는 고체·발판 사각형과 그 내용 키. 지형 배열마다 한 번만 계산한다. */
export function staticSolidRects(geometry: readonly GeometryRect[], keyOf: (rects: readonly Rect[]) => string) {
  let result = staticSolids.get(geometry);
  if (!result) {
    const rects = geometry.filter(g => (g.kind === "solid" || g.kind === "platform") && !g.id.startsWith("physics:")).map(g => g.rect);
    result = { rects, key: keyOf(rects) };
    staticSolids.set(geometry, result);
  }
  return result;
}
