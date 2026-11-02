import { easeOutCubic } from "../../art/easing";



export const BUBBLE_SHIELD = Object.freeze({
  cracks: 7,
  crackMs: 60,
  shakePx: 6,
  shakeMs: 300,
  /** The bubble breaks this long after the blow (its shake spent). */
  breakMs: 300,
  shatterMs: 380,
  /** It breaks along a jittered 4 × 2 grid, each cell split on a diagonal: 16 triangles that fit together at the break. */
  columns: 4,
  rows: 2,
  /** Piece speed (bubble heights per second) and fall (heights per s²). */
  speed: 3.2,
  gravity: 9,
});

type P = readonly [number, number];

/** A seeded unit value — the same bubble cracks the same way. */
function noise(seed: number, n: number): number {
  let h = Math.imul(seed ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(n + 1, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * The cracks of a `w` × `h` bubble struck from `side` (-1 left, 1 right), grown to `grow` (0..1): each a three-segment zigzag from the
 * struck edge inward, the middle ones longest.
 */
export function bubbleShieldCracks(w: number, h: number, side: -1 | 1, grow: number, seed: number): P[][] {
  const g = Math.max(0, Math.min(1, grow));
  if (g <= 0) return [];
  const origin: P = [side * w * 0.48, (noise(seed, 99) - 0.5) * h * 0.3];
  return Array.from({ length: BUBBLE_SHIELD.cracks }, (_, i) => {
    const spread = (i / (BUBBLE_SHIELD.cracks - 1) - 0.5) * 2.2 + (noise(seed, i) - 0.5) * 0.25;
    // About half the box at most — the line stays readable through the cracks.
    const reach = (0.18 + 0.3 * (1 - Math.abs(spread) / 1.25) + noise(seed, i + 20) * 0.08) * w * g;
    const dir: P = [-side * Math.cos(spread * 0.7), Math.sin(spread * 0.7) * (h / w) * 1.6];
    const pts: P[] = [origin];
    for (let k = 1; k <= 3; k++) {
      const along = reach * k / 3, jog = (noise(seed, i * 7 + k) - 0.5) * h * 0.18;
      pts.push([origin[0] + dir[0] * along - dir[1] * jog, origin[1] + dir[1] * along + dir[0] * jog]);
    }
    return pts;
  });
}

/** One flying piece: its quad (bubble-centre px, already moved), turn and size share. */
export interface BubbleShieldPiece { readonly points: readonly P[]; readonly cx: number; readonly cy: number; readonly angle: number; readonly scale: number }

/** The bubble's state `ageMs` after the blow: crack growth, the shake (px, sideways), broken or not, the flying pieces. */
export interface BubbleShieldFrame { readonly grow: number; readonly shakeX: number; readonly broken: boolean; readonly pieces: readonly BubbleShieldPiece[] }

export function bubbleShieldFrame(ageMs: number, w: number, h: number, side: -1 | 1, seed: number, reduced = false): BubbleShieldFrame | null {
  const S = BUBBLE_SHIELD, age = Math.max(0, ageMs);
  if (age >= S.breakMs + S.shatterMs) return null;
  const grow = reduced ? 1 : easeOutCubic(Math.min(1, age / S.crackMs));
  const shake = reduced || age >= S.shakeMs ? 0 : S.shakePx * (1 - age / S.shakeMs) * (Math.floor(age / 33) % 2 === 0 ? 1 : -1);
  if (age < S.breakMs) return { grow, shakeX: shake, broken: false, pieces: [] };
  if (reduced) return null;
  const since = (age - S.breakMs) / 1000, shrink = 1 - ((age - S.breakMs) / S.shatterMs) ** 2;
  // The break lines: grid vertices jittered (the box's edge stays straight), shared by neighbouring pieces.
  const vx = (c: number, r: number): P => {
    const edge = c === 0 || c === S.columns || r === 0 || r === S.rows;
    const jx = edge ? 0 : (noise(seed, 200 + c * 11 + r) - 0.5) * 0.6 * w / S.columns;
    const jy = edge ? 0 : (noise(seed, 300 + c * 11 + r) - 0.5) * 0.6 * h / S.rows;
    return [-w / 2 + c * w / S.columns + jx, -h / 2 + r * h / S.rows + jy];
  };
  const pieces: BubbleShieldPiece[] = [];
  for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.columns; c++) {
    const a = vx(c, r), b = vx(c + 1, r), d = vx(c + 1, r + 1), e = vx(c, r + 1);
    const tris: P[][] = (c + r) % 2 === 0 ? [[a, b, d], [a, d, e]] : [[a, b, e], [b, d, e]];
    for (const tri of tris) {
      const i = pieces.length, mx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3, my = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3;
      // Away from the struck edge, a little up; seeded spread.
      const svx = (-side * 0.6 + (mx / w) * 1.4 + (noise(seed, i + 40) - 0.5) * 0.6) * S.speed * h;
      const svy = ((my / h) * 1.2 - 0.9 + (noise(seed, i + 60) - 0.5) * 0.5) * S.speed * h;
      pieces.push({ points: tri.map(([x, y]): P => [x - mx, y - my]),
        cx: mx + svx * since, cy: my + svy * since + 0.5 * S.gravity * h * since * since,
        angle: (noise(seed, i + 80) - 0.5) * 6 * since, scale: shrink });
    }
  }
  return { grow: 1, shakeX: 0, broken: true, pieces };
}
