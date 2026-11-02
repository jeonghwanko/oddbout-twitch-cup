import { NATIVE_CITY_MOVEMENT, type CityPoint, type CityPolygon, type NativeCityDefinition } from "../world/NativeCityDefinition";

const INDEX_CELL = 16;
/**
 * A polygon with its bounding box, padded by `BOX_PAD`: a point outside the box is outside the polygon — `cityPointInPolygon` says so
 * too (no edge crosses its row past the pad, and the on-edge test stays inside the box), so the box only skips work.
 */
interface BoxedPolygon { readonly polygon: CityPolygon; readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
const BOX_PAD = 1e-6;
/** The path grid's memo for one city (`cityWalkingPath`): 0 not asked yet, 1 clear, 2 blocked. */
interface CityPathGrid {
  readonly cell: number;
  readonly clearance: number;
  readonly minX: number;
  readonly minY: number;
  readonly cols: number;
  readonly rows: number;
  /** Each node at the routing clearance. */
  readonly nodes: Uint8Array;
  /**
   * Each directed step to a neighbour (`node * 8 + direction`, two bits each — four to a byte): both the clearance and the body sweep
   * are clear.
   */
  readonly edges: Uint8Array;
}
interface CityGeometryIndex {
  readonly bounds: BoxedPolygon;
  readonly regions: readonly BoxedPolygon[] | null;
  readonly roads: Map<number, BoxedPolygon[]>;
  readonly obstacles: Map<number, BoxedPolygon[]>;
  readonly overrides: readonly { readonly region: BoxedPolygon; readonly roads?: readonly BoxedPolygon[]; readonly obstacles?: readonly BoxedPolygon[] }[];
  grid: CityPathGrid | null;
  /** Open ground (`openCell`), made on first use. */
  open: CityOpenGround | null;
}
/**
 * Open ground: cells (`OPEN_CELL` plan units over the play bounds' box) whose square, grown by `OPEN_REACH`, no navigation edge touches
 * and whose middle passes every test of `cityWalkable` — inside the bounds, a play region and a road, in no obstacle, under no override.
 * Every sample of a body standing in such a cell (a ring no wider than `OPEN_RING`) lies at least `OPEN_SLACK` from every edge, on the
 * middle's side of each: it passes too, so the cell answers for the body (a cell that is not open asks the polygons). 0 not asked yet,
 * 1 open, 2 not.
 */
interface CityOpenGround { readonly minX: number; readonly minY: number; readonly cols: number; readonly rows: number; readonly cells: Uint8Array }
const OPEN_CELL = 2;
/** The widest ring open ground answers for: the planner's clearance (`cityWalkingPath`). */
const OPEN_RING = NATIVE_CITY_MOVEMENT.radius + NATIVE_CITY_MOVEMENT.pathMargin;
/** How far every such sample stays from an edge — far above the rounding of the polygon tests. */
const OPEN_SLACK = 0.01;
const OPEN_REACH = OPEN_RING + OPEN_SLACK;
const geometryIndexes = new WeakMap<NativeCityDefinition, CityGeometryIndex>();
const NO_POLYGONS: readonly BoxedPolygon[] = Object.freeze([]);
/** The index cell of a point (`INDEX_CELL`), as one number: column and row offset into two 21-bit halves. */
const cellKey = (x: number, y: number): number => (x + 0x100000) * 0x200000 + (y + 0x100000);
const indexKey = (point: CityPoint): number => cellKey(Math.floor(point[0] / INDEX_CELL), Math.floor(point[1] / INDEX_CELL));
/** The ring of eight samples round a body's centre (`cityWalkable`), as unit offsets. */
const RING: readonly (readonly [number, number])[] = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)] as const);

/** A polygon's bounds, unpadded: `[minX, minY, maxX, maxY]` (what `Math.min(...xs)` and friends give). */
function bounds(polygon: CityPolygon): readonly [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of polygon) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  return [minX, minY, maxX, maxY];
}
function boxed(polygon: CityPolygon): BoxedPolygon {
  const [minX, minY, maxX, maxY] = bounds(polygon);
  return { polygon, minX: minX - BOX_PAD, minY: minY - BOX_PAD, maxX: maxX + BOX_PAD, maxY: maxY + BOX_PAD };
}
function inside(point: CityPoint, entry: BoxedPolygon): boolean {
  return point[0] >= entry.minX && point[0] <= entry.maxX && point[1] >= entry.minY && point[1] <= entry.maxY
    && cityPointInPolygon(point, entry.polygon);
}

function geometryIndex(city: NativeCityDefinition): CityGeometryIndex {
  const known = geometryIndexes.get(city);
  if (known) return known;
  const index = (polygons: readonly CityPolygon[]): Map<number, BoxedPolygon[]> => {
    const cells = new Map<number, BoxedPolygon[]>();
    for (const polygon of polygons) {
      if (polygon.length === 0) continue;
      const entry = boxed(polygon), [x0, y0, x1, y1] = bounds(polygon);
      const minX = Math.floor(x0 / INDEX_CELL), maxX = Math.floor(x1 / INDEX_CELL), minY = Math.floor(y0 / INDEX_CELL), maxY = Math.floor(y1 / INDEX_CELL);
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const key = cellKey(x, y), bucket = cells.get(key) ?? [];
        bucket.push(entry); cells.set(key, bucket);
      }
    }
    return cells;
  };
  const result: CityGeometryIndex = {
    bounds: boxed(city.playBounds), regions: city.playRegions?.map(boxed) ?? null,
    roads: index(city.walkablePolygons), obstacles: index(city.obstacles),
    overrides: (city.navigationOverrides ?? []).map(area => ({ region: boxed(area.region),
      ...(area.walkablePolygons ? { roads: area.walkablePolygons.map(boxed) } : {}), ...(area.obstacles ? { obstacles: area.obstacles.map(boxed) } : {}) })),
    grid: null, open: null,
  };
  geometryIndexes.set(city, result); return result;
}

/** Whether segment a–b meets the box (closed); conservative at the box's edge, which open ground keeps far from any sample. */
function segmentMeetsBox(a: CityPoint, b: CityPoint, minX: number, minY: number, maxX: number, maxY: number): boolean {
  if (Math.max(a[0], b[0]) < minX || Math.min(a[0], b[0]) > maxX || Math.max(a[1], b[1]) < minY || Math.min(a[1], b[1]) > maxY) return false;
  const inBox = (p: CityPoint) => p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;
  if (inBox(a) || inBox(b)) return true;
  // The segment's line leaves all four corners on one side: it misses the box.
  const side = (x: number, y: number) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
  const s = [side(minX, minY), side(maxX, minY), side(minX, maxY), side(maxX, maxY)];
  return !(s.every(v => v > 0) || s.every(v => v < 0));
}
function polygonMeetsBox(entry: BoxedPolygon, minX: number, minY: number, maxX: number, maxY: number): boolean {
  if (entry.maxX < minX || entry.minX > maxX || entry.maxY < minY || entry.minY > maxY) return false;
  const polygon = entry.polygon;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) if (segmentMeetsBox(polygon[j]!, polygon[i]!, minX, minY, maxX, maxY)) return true;
  return false;
}

/** Whether `point` stands in open ground (`CityOpenGround`) — then a body there no wider than `OPEN_RING` is walkable. */
function inOpenGround(geometry: CityGeometryIndex, point: CityPoint): boolean {
  const open = geometry.open ??= (() => {
    const { minX, minY, maxX, maxY } = geometry.bounds;
    const cols = Math.max(0, Math.ceil((maxX - minX) / OPEN_CELL)), rows = Math.max(0, Math.ceil((maxY - minY) / OPEN_CELL));
    return { minX, minY, cols, rows, cells: new Uint8Array(cols * rows) };
  })();
  const cx = Math.floor((point[0] - open.minX) / OPEN_CELL), cy = Math.floor((point[1] - open.minY) / OPEN_CELL);
  if (!(cx >= 0 && cx < open.cols && cy >= 0 && cy < open.rows)) return false;
  const id = cy * open.cols + cx;
  if (open.cells[id] === 0) {
    const x0 = open.minX + cx * OPEN_CELL, y0 = open.minY + cy * OPEN_CELL;
    open.cells[id] = openCell(geometry, x0 - OPEN_REACH, y0 - OPEN_REACH, x0 + OPEN_CELL + OPEN_REACH, y0 + OPEN_CELL + OPEN_REACH) ? 1 : 2;
  }
  return open.cells[id] === 1;
}
/** The open-ground test of one grown cell (`CityOpenGround`). */
function openCell(geometry: CityGeometryIndex, minX: number, minY: number, maxX: number, maxY: number): boolean {
  const middle: CityPoint = [(minX + maxX) / 2, (minY + maxY) / 2];
  // Untouched by every edge, the whole box is on its middle's side of each polygon.
  const holds = (entry: BoxedPolygon) => !polygonMeetsBox(entry, minX, minY, maxX, maxY) && inside(middle, entry);
  const clear = (entry: BoxedPolygon) => !polygonMeetsBox(entry, minX, minY, maxX, maxY) && !inside(middle, entry);
  if (geometry.overrides.some(area => !(area.region.maxX < minX || area.region.minX > maxX || area.region.maxY < minY || area.region.minY > maxY))) return false;
  if (!holds(geometry.bounds) || geometry.regions !== null && !geometry.regions.some(holds)) return false;
  // A road holding the box holds every sample, and it is in every sample's bucket; any obstacle a sample could meet is in one of the
  // buckets the box overlaps.
  if (!(geometry.roads.get(indexKey(middle)) ?? NO_POLYGONS).some(holds)) return false;
  for (let y = Math.floor(minY / INDEX_CELL); y <= Math.floor(maxY / INDEX_CELL); y++) {
    for (let x = Math.floor(minX / INDEX_CELL); x <= Math.floor(maxX / INDEX_CELL); x++) {
      if (!(geometry.obstacles.get(cellKey(x, y)) ?? NO_POLYGONS).every(clear)) return false;
    }
  }
  return true;
}

export function cityPointInPolygon(point: CityPoint, polygon: CityPolygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(cross) < 1e-7 && point[0] >= Math.min(a[0], b[0]) && point[0] <= Math.max(a[0], b[0])
      && point[1] >= Math.min(a[1], b[1]) && point[1] <= Math.max(a[1], b[1])) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** The same circle clearance owns manual movement, path planning and click destinations. */
export function cityWalkable(point: CityPoint, city: NativeCityDefinition, radius: number = NATIVE_CITY_MOVEMENT.radius): boolean {
  const geometry = geometryIndex(city);
  if (radius <= OPEN_RING && radius >= 0 && inOpenGround(geometry, point)) return true;
  for (let i = -1; i < 8; i++) {
    const sample: CityPoint = i < 0 ? point : [point[0] + radius * RING[i]![0], point[1] + radius * RING[i]![1]];
    const key = indexKey(sample);
    const override = geometry.overrides.find(area => inside(sample, area.region));
    const roads = override?.roads ?? geometry.roads.get(key) ?? NO_POLYGONS;
    const obstacles = override?.obstacles ?? geometry.obstacles.get(key) ?? NO_POLYGONS;
    if (!inside(sample, geometry.bounds)
      || geometry.regions !== null && !geometry.regions.some(polygon => inside(sample, polygon))
      || !roads.some(polygon => inside(sample, polygon))
      || obstacles.some(polygon => inside(sample, polygon))) return false;
  }
  return true;
}
export function citySegmentWalkable(from: CityPoint, to: CityPoint, city: NativeCityDefinition, radius: number = NATIVE_CITY_MOVEMENT.radius): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / (NATIVE_CITY_MOVEMENT.radius / 2)));
  for (let i = 0; i <= steps; i++) {
    if (!cityWalkable([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps], city, radius)) return false;
  }
  return true;
}

/**
 * How far `from` → `to` stays walkable (plan units), sampled like `citySegmentWalkable`: the distance to the last clear sample before
 * the first blocked one (a wall, a fixed obstacle, the play bounds) — 0 when `from` itself is blocked, the whole length when clear.
 * `radius` is the clearance (the width the cut is judged with).
 */
export function citySegmentClearLength(from: CityPoint, to: CityPoint, city: NativeCityDefinition,
  radius: number = NATIVE_CITY_MOVEMENT.radius): number {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(length / (NATIVE_CITY_MOVEMENT.radius / 2)));
  for (let i = 0; i <= steps; i++) {
    if (!cityWalkable([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps], city, radius)) {
      return i === 0 ? 0 : length * (i - 1) / steps;
    }
  }
  return length;
}

/** Stop at the first blocked sample, then refine that contact without skipping a thin obstacle. */
function cityContactPoint(from: CityPoint, to: CityPoint, city: NativeCityDefinition, radius: number): CityPoint {
  const dx = to[0] - from[0], dy = to[1] - from[1], length = Math.hypot(dx, dy);
  if (length <= 1e-9) return from;
  let low = citySegmentClearLength(from, to, city, radius) / length;
  if (low >= 1) return to;
  let high = Math.min(1, low + 1 / Math.max(1, Math.ceil(length / (NATIVE_CITY_MOVEMENT.radius / 2))));
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2;
    if (cityWalkable([from[0] + dx * mid, from[1] + dy * mid], city, radius)) low = mid; else high = mid;
  }
  return [from[0] + dx * low, from[1] + dy * low];
}

/** Manual wall movement: preserve the clear approach, project the remainder onto a nearby wall edge.
 * Uses the same clearance as routes/actors, with no world-X priority, extra speed or reverse step. */
export function slideCityMove(from: CityPoint, to: CityPoint, city: NativeCityDefinition,
  radius: number = NATIVE_CITY_MOVEMENT.radius): CityPoint {
  if (citySegmentWalkable(from, to, city, radius)) return to;
  if (!cityWalkable(from, city, radius)) return from;
  const at = cityContactPoint(from, to, city, radius), dx = to[0] - at[0], dy = to[1] - at[1];
  const geometry = geometryIndex(city), reach = radius + .01;
  const polygons = new Set<BoxedPolygon>([geometry.bounds, ...(geometry.regions ?? [])]);
  for (let y = Math.floor((at[1] - reach) / INDEX_CELL); y <= Math.floor((at[1] + reach) / INDEX_CELL); y++) {
    for (let x = Math.floor((at[0] - reach) / INDEX_CELL); x <= Math.floor((at[0] + reach) / INDEX_CELL); x++) {
      const key = cellKey(x, y);
      for (const polygon of [...(geometry.roads.get(key) ?? NO_POLYGONS), ...(geometry.obstacles.get(key) ?? NO_POLYGONS)]) polygons.add(polygon);
    }
  }
  for (const override of geometry.overrides) for (const polygon of [override.region, ...(override.roads ?? []), ...(override.obstacles ?? [])]) polygons.add(polygon);
  let best = at, score = 0;
  for (const { polygon, minX, minY, maxX, maxY } of polygons) {
    if (at[0] < minX - reach || at[0] > maxX + reach || at[1] < minY - reach || at[1] > maxY + reach) continue;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const ex = b[0] - a[0], ey = b[1] - a[1], length = Math.hypot(ex, ey);
      if (length < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((at[0] - a[0]) * ex + (at[1] - a[1]) * ey) / (length * length)));
      if (Math.hypot(at[0] - a[0] - ex * t, at[1] - a[1] - ey * t) > reach) continue;
      const ux = ex / length, uy = ey / length, along = dx * ux + dy * uy;
      const end = cityContactPoint(at, [at[0] + ux * along, at[1] + uy * along], city, radius);
      const progress = (end[0] - at[0]) * dx + (end[1] - at[1]) * dy;
      if (progress > score + 1e-9 && citySegmentWalkable(from, end, city, radius)) { best = end; score = progress; }
    }
  }
  return best;
}

/** The eight grid steps, in the planner's order (`CityPathGrid.edges` index them). */
const GRID_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const;

/** The city's path grid (made on its first route, then reused): its frame from the play bounds, empty memos. */
function pathGrid(city: NativeCityDefinition, cell: number, clearance: number): CityPathGrid {
  const geometry = geometryIndex(city), known = geometry.grid;
  if (known && known.cell === cell && known.clearance === clearance) return known;
  const minX = Math.min(...city.playBounds.map(p => p[0])), minY = Math.min(...city.playBounds.map(p => p[1]));
  const cols = Math.ceil((Math.max(...city.playBounds.map(p => p[0])) - minX) / cell) + 1;
  const rows = Math.ceil((Math.max(...city.playBounds.map(p => p[1])) - minY) / cell) + 1;
  return geometry.grid = { cell, clearance, minX, minY, cols, rows, nodes: new Uint8Array(cols * rows), edges: new Uint8Array(cols * rows * 2) };
}

export function cityWalkingPath(from: CityPoint, to: CityPoint, city: NativeCityDefinition): CityPoint[] | null {
  if (!cityWalkable(from, city) || !cityWalkable(to, city)) return null;
  // A planned segment must tolerate the different sampling phase of real frame steps.
  // Keep physical collision unchanged; reserve a little clearance around routed corners.
  const clearance = NATIVE_CITY_MOVEMENT.radius + NATIVE_CITY_MOVEMENT.pathMargin;
  // A larger sampled ring can miss a small post that the physical ring hits. Both must pass.
  const segment = (a: CityPoint, b: CityPoint): boolean => citySegmentWalkable(a, b, city)
    && (!(cityWalkable(a, city, clearance) && cityWalkable(b, city, clearance)) || citySegmentWalkable(a, b, city, clearance));
  if (segment(from, to)) return [to];
  const grid = pathGrid(city, NATIVE_CITY_MOVEMENT.grid, clearance), { cell, minX, minY, cols, rows, nodes, edges } = grid;
  const at = (id: number): CityPoint => [minX + id % cols * cell, minY + Math.floor(id / cols) * cell];
  // The grid's facts are the city's (one memo per city, `pathGrid`): a node at the clearance, a step to a neighbour.
  const free = (id: number): boolean => {
    if (nodes[id] === 0) nodes[id] = cityWalkable(at(id), city, clearance) ? 1 : 2;
    return nodes[id] === 1;
  };
  const stepClear = (from: number, direction: number, to: number): boolean => {
    const edge = from * 8 + direction, byte = edge >> 2, shift = (edge & 3) * 2;
    let known = edges[byte]! >> shift & 3;
    if (known === 0) {
      const a = at(from), b = at(to);
      known = citySegmentWalkable(a, b, city, clearance) && citySegmentWalkable(a, b, city) ? 1 : 2;
      edges[byte] = edges[byte]! | known << shift;
    }
    return known === 1;
  };
  const nearby = (point: CityPoint): number => {
    let best = -1, distance = Infinity;
    const cx = Math.round((point[0] - minX) / cell), cy = Math.round((point[1] - minY) / cell);
    for (let y = Math.max(0, cy - 3); y <= Math.min(rows - 1, cy + 3); y++) {
      for (let x = Math.max(0, cx - 3); x <= Math.min(cols - 1, cx + 3); x++) {
        const id = y * cols + x, candidate = at(id), d = Math.hypot(candidate[0] - point[0], candidate[1] - point[1]);
        if (d < distance && free(id) && segment(point, candidate)) { best = id; distance = d; }
      }
    }
    return best;
  };
  const start = nearby(from), finish = nearby(to);
  if (start < 0 || finish < 0) return null;
  const parents = new Int32Array(cols * rows).fill(-1), scores = new Float64Array(cols * rows).fill(Infinity);
  parents[start] = start;
  scores[start] = 0;
  const queue: { id: number; cost: number; priority: number }[] = [];
  const enqueue = (id: number, cost: number): void => {
    const point = at(id), priority = cost + Math.hypot(point[0] - to[0], point[1] - to[1]) / cell;
    const node = { id, cost, priority }; queue.push(node);
    let index = queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (queue[parent]!.priority <= priority) break;
      queue[index] = queue[parent]!; index = parent;
    }
    queue[index] = node;
  };
  const dequeue = (): { id: number; cost: number; priority: number } => {
    const first = queue[0]!, last = queue.pop()!;
    if (queue.length > 0) {
      let index = 0;
      while (index * 2 + 1 < queue.length) {
        let child = index * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1]!.priority < queue[child]!.priority) child++;
        if (last.priority <= queue[child]!.priority) break;
        queue[index] = queue[child]!; index = child;
      }
      queue[index] = last;
    }
    return first;
  };
  enqueue(start, 0);
  while (queue.length > 0) {
    const node = dequeue(), current = node.id;
    if (node.cost !== scores[current]) continue;
    if (current === finish) break;
    for (let direction = 0; direction < 8; direction++) {
      const [dx, dy] = GRID_STEPS[direction]!;
      const x = current % cols + dx, y = Math.floor(current / cols) + dy;
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const next = y * cols + x;
      const cost = scores[current] + Math.hypot(dx, dy);
      if (cost >= scores[next]! || !free(next) || !stepClear(current, direction, next)) continue;
      parents[next] = current; scores[next] = cost; enqueue(next, cost);
    }
  }
  if (parents[finish] === -1) return null;
  const path: CityPoint[] = [to];
  for (let id = finish; id !== start; id = parents[id]!) path.unshift(at(id));
  path.unshift(at(start));
  const result: CityPoint[] = [];
  let origin = from;
  for (let i = 0; i < path.length;) {
    let next = path.length - 1;
    while (next > i && !segment(origin, path[next]!)) next--;
    origin = path[next]!; result.push(origin); i = next + 1;
  }
  return result;
}

/** Plan length of a walk from `from` along `cityWalkingPath`'s waypoints. */
export function cityPathLength(from: CityPoint, path: readonly CityPoint[]): number {
  let length = 0, previous = from;
  for (const point of path) { length += Math.hypot(point[0] - previous[0], point[1] - previous[1]); previous = point; }
  return length;
}

/**
 * A click / quest-guide walk's gait (2026-10-17, user: the walk between quest stops dragged). A path longer than
 * `pathRunSteps` runs; a run keeps running until `pathWalkInSteps` are left, then walks them in to the stop (`running` is last
 * frame's answer, the hysteresis). A walk to a door runs on through it: the portal fade takes over from the run.
 */
export function cityPathGait(remainingUnits: number, stepUnits: number, running: boolean, throughPortal: boolean): "walk" | "run" {
  if (!(stepUnits > 0) || !Number.isFinite(remainingUnits)) return "walk";
  const steps = remainingUnits / stepUnits;
  if (!running) return steps > NATIVE_CITY_MOVEMENT.pathRunSteps ? "run" : "walk";
  return throughPortal || steps > NATIVE_CITY_MOVEMENT.pathWalkInSteps ? "run" : "walk";
}

export function stepCityPath(point: CityPoint, path: readonly CityPoint[], dtMs: number, city: NativeCityDefinition, speed: number = NATIVE_CITY_MOVEMENT.speed): { point: CityPoint; path: CityPoint[] } {
  const remaining = [...path];
  let budget = (Number.isFinite(speed) ? Math.max(0, speed) : 0) * Math.max(0, Math.min(NATIVE_CITY_MOVEMENT.maxDtMs, dtMs)) / 1000;
  while (budget > 0 && remaining.length > 0) {
    const target = remaining[0]!, distance = Math.hypot(target[0] - point[0], target[1] - point[1]);
    if (distance < 0.001) { remaining.shift(); continue; }
    const travel = Math.min(budget, distance), next: CityPoint = [point[0] + (target[0] - point[0]) * travel / distance, point[1] + (target[1] - point[1]) * travel / distance];
    if (!citySegmentWalkable(point, next, city)) return { point, path: [] };
    point = next; budget -= travel;
    if (travel === distance) remaining.shift();
  }
  return { point, path: remaining };
}
