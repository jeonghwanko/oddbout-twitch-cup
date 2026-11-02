import navigation from './village-concept-navigation.json';
import { VILLAGE_FACILITY_LOTS, VILLAGE_TRAINING_ENTRY, VILLAGE_TRAINING_FORECOURT } from './VillageFacilityLayout';

// 각 부지의 벽은 그대로 두고 시설 이름만 교환한다. 시안 래스터와 실루엣이 계속 일치한다.
const footprints = { ...navigation.footprints,
  tutorial: navigation.footprints[VILLAGE_FACILITY_LOTS.tutorial],
  "south-house": navigation.footprints[VILLAGE_FACILITY_LOTS["south-house"]],
};
export const VILLAGE_CONCEPT_NAVIGATION = { ...navigation, footprints, routes: {
  ...navigation.routes,
  tutorial: [[260, 688], [232, 696], [136, 680], [VILLAGE_TRAINING_ENTRY.approach.x, VILLAGE_TRAINING_ENTRY.approach.y]],
} };
const cells = new Uint8Array(navigation.cols * navigation.rows);
for (const [y, spans] of navigation.spans.entries()) {
  for (let i = 0; i < spans.length; i += 2) {
    cells.fill(1, y * navigation.cols + spans[i]!, y * navigation.cols + spans[i + 1]!);
  }
}

function contains(x: number, y: number, polygon: readonly (readonly number[])[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1]! > y) !== (b[1]! > y) && x < (b[0]! - a[0]!) * (y - a[1]!) / (b[1]! - a[1]!) + a[0]!) hit = !hit;
  }
  return hit;
}

// 원래 장식 주택이던 회랑의 포장 앞마당을 연다. 벽 안쪽은 기존 footprint로 막는다.
for (let row = 0; row < navigation.rows; row++) for (let col = 0; col < navigation.cols; col++) {
  const x = (col + 0.5) * navigation.cell, y = (row + 0.5) * navigation.cell;
  if (contains(x, y, VILLAGE_TRAINING_FORECOURT) && !contains(x, y, footprints.tutorial)) cells[row * navigation.cols + col] = 1;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Exact swept circle against occupied raster cells, including corners between movement frames. */
export function villageConceptSegmentContains(ax: number, ay: number, bx: number, by: number, radius = 0): boolean {
  if (![ax, ay, bx, by, radius].every(Number.isFinite)) return false;
  const r = Math.max(0, radius), size = navigation.cell;
  const left = Math.floor((Math.min(ax, bx) - r) / size);
  const right = Math.floor((Math.max(ax, bx) + r) / size);
  const top = Math.floor((Math.min(ay, by) - r) / size);
  const bottom = Math.floor((Math.max(ay, by) + r) / size);
  if (left < 0 || top < 0 || right >= navigation.cols || bottom >= navigation.rows) return false;
  const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
  const pointDistance = (x: number, y: number) => {
    const t = lengthSquared > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / lengthSquared, 0, 1) : 0;
    return (ax + dx * t - x) ** 2 + (ay + dy * t - y) ** 2;
  };
  for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
    if (cells[row * navigation.cols + col] === 1) continue;
    const x0 = col * size, y0 = row * size, x1 = x0 + size, y1 = y0 + size;
    let enter = 0, leave = 1, intersects = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q! < 0) intersects = false; continue; }
      const t = q! / p!;
      if (p! < 0) enter = Math.max(enter, t); else leave = Math.min(leave, t);
    }
    if (intersects && enter <= leave) return false;
    const distance = Math.min(pointDistance(x0, y0), pointDistance(x1, y0), pointDistance(x1, y1), pointDistance(x0, y1),
      (ax - clamp(ax, x0, x1)) ** 2 + (ay - clamp(ay, y0, y1)) ** 2,
      (bx - clamp(bx, x0, x1)) ** 2 + (by - clamp(by, y0, y1)) ** 2);
    if (distance < r * r - 1e-8) return false;
  }
  return true;
}

export function villageConceptGroundContains(x: number, y: number, radius = 0): boolean {
  return villageConceptSegmentContains(x, y, x, y, radius);
}
