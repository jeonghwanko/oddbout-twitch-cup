import type { CityPoint } from "../../world/NativeCityDefinition";

/**
 * 바닥에 깔리는 판정 표시(공격 예고 등) 한 장. 점은 도시 평면(plan) 좌표이고 볼록 다각형이어야 한다(부채꼴 ≤ 180°·직사각형).
 * 평면 화면은 투영해서 Phaser Graphics 로, 3D 카드 화면은 `NativeCityFloorDecalView` 가 바닥 층에 그려
 * 건물 카드가 그 위를 가린다(Graphics 는 카드 화면 전체 위에 그려져 건물을 뚫고 보였다).
 */
export interface NativeCityFloorDecal {
  readonly points: readonly CityPoint[];
  /**
   * A painted mark instead of the flat polygon (2026-10-18, B072 — the telegraphs read as clip-art plates): `points` is then an open
   * spine, `edgeWidth` the stroke's width, `edge` / `edgeAlpha` its tint; the fill fields are unused.
   */
  readonly mark?: NativeCityFloorMark;
  /** The fill polygon may be concave (a screen-space effect shape carried onto the floor): ear-clipped instead of fanned. */
  readonly concave?: boolean;
  readonly fill: number;
  /** 0 이면 면을 그리지 않는다(테두리만). */
  readonly fillAlpha: number;
  readonly edge: number;
  readonly edgeAlpha: number;
  /** 테두리 폭(plan 단위). 화면 px 은 투영 배율로 나눠서 넘긴다. */
  readonly edgeWidth: number;
}

/**
 * One region of a white chalk / brush atlas (`NativeCityFloorMarkCatalog`), stretched along a decal's spine. `image` is the atlas's decoded
 * source (the 3D floor uploads it once per `key`); `rect` its pixels [x, y, w, h] in an atlas of `size`.
 */
export interface NativeCityFloorMark {
  readonly key: string;
  readonly image: TexImageSource;
  readonly size: readonly [number, number];
  readonly rect: readonly [number, number, number, number];
  /** Share of the mark shown from the spine's start (a stroke painting itself along it); 1 = all of it. */
  readonly reveal?: number;
}

/**
 * A mark's strip along its open spine: two vertices per point at ± width / 2 on the bisector, u along the length (only the revealed
 * share, the art not stretched by it), v across. Positions xy0 (plan) and uvs for a flipY texture of the atlas.
 */
export function floorDecalMarkStrip(points: readonly CityPoint[], width: number, mark: NativeCityFloorMark): { positions: number[]; uvs: number[] } {
  const positions: number[] = [], uvs: number[] = [];
  const reveal = Math.max(0, Math.min(1, mark.reveal ?? 1));
  if (points.length < 2 || !(width > 0) || reveal <= 0) return { positions, uvs };
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = lengths[lengths.length - 1]!;
  if (!(total > 1e-9)) return { positions, uvs };
  // The spine cut at the revealed length.
  const spine: CityPoint[] = [], along: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const at = lengths[i]! / total;
    if (at <= reveal) { spine.push(points[i]!); along.push(at); continue; }
    const before = lengths[i - 1]! / total, t = (reveal - before) / (at - before), a = points[i - 1]!, b = points[i]!;
    spine.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); along.push(reveal);
    break;
  }
  if (spine.length < 2) return { positions, uvs };
  const [rx, ry, rw, rh] = mark.rect, [sw, sh] = mark.size, half = width / 2;
  const u = (share: number) => (rx + rw * share) / sw, vTop = 1 - ry / sh, vBottom = 1 - (ry + rh) / sh;
  const side = spine.map((_, i) => {
    const a = spine[Math.max(0, i - 1)]!, b = spine[Math.min(spine.length - 1, i + 1)]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l * half, dx / l * half] as const;
  });
  for (let i = 0; i + 1 < spine.length; i++) {
    const a = spine[i]!, b = spine[i + 1]!, na = side[i]!, nb = side[i + 1]!;
    const ua = u(along[i]!), ub = u(along[i + 1]!);
    const a0 = [a[0] + na[0], a[1] + na[1]], a1 = [a[0] - na[0], a[1] - na[1]], b0 = [b[0] + nb[0], b[1] + nb[1]], b1 = [b[0] - nb[0], b[1] - nb[1]];
    positions.push(a0[0]!, a0[1]!, 0, b0[0]!, b0[1]!, 0, b1[0]!, b1[1]!, 0, a0[0]!, a0[1]!, 0, b1[0]!, b1[1]!, 0, a1[0]!, a1[1]!, 0);
    uvs.push(ua, vTop, ub, vTop, ub, vBottom, ua, vTop, ub, vBottom, ua, vBottom);
  }
  return { positions, uvs };
}

/** 볼록 다각형의 부채 삼각분할(xy, z=0). */
export function floorDecalFillTriangles(points: readonly CityPoint[]): number[] {
  const out: number[] = [];
  const first = points[0];
  if (!first || points.length < 3) return out;
  for (let i = 1; i + 1 < points.length; i++) {
    const b = points[i]!, c = points[i + 1]!;
    out.push(first[0], first[1], 0, b[0], b[1], 0, c[0], c[1], 0);
  }
  return out;
}

/** 닫힌 테두리를 변마다 폭 `width` 의 사각형 두 삼각형으로 펼친다(꼭짓점은 반폭만큼 늘려 이음매를 덮는다). */
export function floorDecalEdgeTriangles(points: readonly CityPoint[], width: number): number[] {
  const out: number[] = [];
  if (points.length < 2 || !(width > 0)) return out;
  const half = width / 2;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1e-9) continue;
    const ux = dx / length * half, uy = dy / length * half, nx = -uy, ny = ux;
    const a0: CityPoint = [a[0] - ux + nx, a[1] - uy + ny], a1: CityPoint = [a[0] - ux - nx, a[1] - uy - ny];
    const b0: CityPoint = [b[0] + ux + nx, b[1] + uy + ny], b1: CityPoint = [b[0] + ux - nx, b[1] + uy - ny];
    out.push(a0[0], a0[1], 0, b0[0], b0[1], 0, b1[0], b1[1], 0, a0[0], a0[1], 0, b1[0], b1[1], 0, a1[0], a1[1], 0);
  }
  return out;
}

/** 원(평면)을 다각형으로. 견본 자리 고리처럼 테두리만 쓰는 표시에. */
export function floorDecalCircle(center: CityPoint, radius: number, segments = 24): CityPoint[] {
  const points: CityPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius]);
  }
  return points;
}
