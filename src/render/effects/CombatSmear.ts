import { COMBAT_SMEAR_ART, COMBAT_SMEAR_CELLS, type CombatSmearKind } from "../../assets/CombatSmearArtCatalog";
import { NATIVE_CITY_TRAIL_HEAD_EASE, nativeCityTrailTipAt, type NativeCityAttackTrailFrame, type NativeCityTrailStroke } from "./NativeCityAttackTrail";

/*
 * 공격 번짐(스미어) 원화의 자리(2026-10-16, 엣지 연출 3번): 접촉 직전 한 프레임과 접촉 프레임에만 붓 한 획이 손끝(쇠구슬) 경로 위에 선다.
 * 리본 궤적보다 날카롭게 "휘둘렀다"를 읽히고, 접촉 뒤에는 끊는다 — 번짐은 접촉 앞의 그림이다(맞은 몸을 덮지 않는다).
 *
 * - 종류: 경로 모양으로 고른다(`combatSmearKind`) — 바닥을 쓸면 slide, 내려찍으면 slam, 올려치면 hook, 크게 휘면 swing,
 *   곧으면 무게에 따라 thrust/jab. 천 리본(넥타이)은 리본이 맡는다.
 * - 자리(`combatSmearPlace`): 원화의 "꼬리 → 금 앞날" 현을 경로의 "꼬리 → 머리" 현에 맞춰 돌리고 늘린다. 금 앞날이 머리(손끝)에 선다.
 *   휘는 방향이 경로와 반대면 위아래를 뒤집는다. 칸마다 현이 수평으로 눕혀 포장돼 있어(`package-combat-smear.mjs`) 현을 가로지르는 두께만
 *   `thickness` 로 줄인다 — 붓이 맞는 얼굴을 덮지 않게.
 * - 머리는 리본 궤적과 같은 가속 곡선(`NATIVE_CITY_TRAIL_HEAD_EASE`)으로 경로를 따른다 — 그려진 손끝·쇠구슬보다 앞서 나가지 않는다.
 *   원화가 그려지는 동안 그 획의 리본은 쉰다(`NativeCityAttackTrailSequence`) — 한 획에 주인 하나.
 * 순수 계산이다. 그리기는 `view/CombatSmearArtView`.
 */

export const COMBAT_SMEAR = Object.freeze({
  /**
   * Shown from this long before the contact (screen ms) — the swing's last frame … (two frames ahead, the drawn swings — their ball and
   * fist bunched into the last frames — still lagged the authored path the smear rides: 2026-10-16 capture.)
   */
  leadMs: 17,
  /** … through the contact frame, then cut. */
  holdMs: 17,
  /** The stretch of the path behind the head (0..1 of it) the smear spans. */
  spanU: 0.6,
  /** Its scale stays inside these (× the art's measured chord). */
  minScale: 0.2,
  maxScale: 3,
  /** The brush's width across its chord (× the along-chord scale). */
  thickness: 0.6,
  /** A bow counts (to flip for) past this: |cross(chord, bend offset)| / chord². */
  bendSignificance: 0.04,
});

/** One smear to draw: the sheet frame, the lead on screen (world px), turn, size, flip and the image origin (the lead in the cell). */
export interface CombatSmearDraw {
  readonly kind: CombatSmearKind;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  /** Along the chord. */
  readonly scale: number;
  /** Across the chord (`thickness` × `scale`). */
  readonly scaleY: number;
  readonly flipY: boolean;
  readonly originX: number;
  readonly originY: number;
}

type P = readonly [number, number];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];

/** The smear a stroke's path draws (body heights, +x along the blow, y up negative), or null (a cloth ribbon has its own). */
export function combatSmearKind(stroke: Pick<NativeCityTrailStroke, "path" | "kind" | "ribbon" | "width">): CombatSmearKind | null {
  if (stroke.ribbon === true || stroke.path.length < 2) return null;
  const a = nativeCityTrailTipAt(stroke.path, 0), b = nativeCityTrailTipAt(stroke.path, 1), m = nativeCityTrailTipAt(stroke.path, 0.5);
  const dx = b[0] - a[0], dy = b[1] - a[1], chord = Math.hypot(dx, dy);
  if (a[1] > -0.3 && b[1] > -0.3 && Math.abs(dy) < 0.15) return "slide";
  if (dy > 0.3) return "slam";
  if (dy < -0.25) return "hook";
  const bow = chord > 0 ? Math.abs(cross([dx, dy], [m[0] - a[0], m[1] - a[1]])) / (chord * chord) : 0;
  if (bow > 0.12) return "swing";
  return stroke.kind === "blunt" || (stroke.width ?? 0) >= 0.05 ? "thrust" : "jab";
}

/**
 * Where a `kind` smear sits for a stroke whose head is at `head`, its tail at `tail` and its middle at `mid` (screen px): the art's tail →
 * lead chord turned and stretched onto the path's, flipped top-to-bottom when the art bows the other way. Null for a degenerate path.
 */
export function combatSmearPlace(kind: CombatSmearKind, head: P, tail: P, mid: P): CombatSmearDraw | null {
  const cell = COMBAT_SMEAR_CELLS[kind], size = COMBAT_SMEAR_ART.frameWidth, S = COMBAT_SMEAR;
  const a: P = [cell.lead[0] - cell.tail[0], cell.lead[1] - cell.tail[1]], p: P = [head[0] - tail[0], head[1] - tail[1]];
  const aLen = Math.hypot(a[0], a[1]), pLen = Math.hypot(p[0], p[1]);
  if (aLen < 1 || pLen < 1) return null;
  const artBow = cross(a, [cell.bend[0] - (cell.lead[0] + cell.tail[0]) / 2, cell.bend[1] - (cell.lead[1] + cell.tail[1]) / 2]) / (aLen * aLen);
  const pathBow = cross(p, [mid[0] - (head[0] + tail[0]) / 2, mid[1] - (head[1] + tail[1]) / 2]) / (pLen * pLen);
  const flipY = Math.abs(artBow) > S.bendSignificance && Math.abs(pathBow) > S.bendSignificance && Math.sign(artBow) !== Math.sign(pathBow);
  const shown: P = flipY ? [a[0], -a[1]] : a;
  return {
    kind, frame: cell.index, x: head[0], y: head[1],
    rotation: Math.atan2(p[1], p[0]) - Math.atan2(shown[1], shown[0]),
    scale: Math.max(S.minScale, Math.min(S.maxScale, pLen / aLen)),
    scaleY: Math.max(S.minScale, Math.min(S.maxScale, pLen / aLen)) * S.thickness,
    flipY, originX: cell.lead[0] / size, originY: flipY ? 1 - cell.lead[1] / size : cell.lead[1] / size,
  };
}

/** Whether `stroke`'s smear owns the moment `timeMs` (from `leadMs` before its contact on) — its ribbon rests then. */
export function combatSmearOwns(stroke: NativeCityTrailStroke, timeMs: number): boolean {
  return timeMs >= stroke.hitMs - COMBAT_SMEAR.leadMs && combatSmearKind(stroke) !== null;
}

/** The smears a trail frame shows now: each stroke from `leadMs` before its contact through `holdMs` after it. */
export function combatSmearDraws(frame: NativeCityAttackTrailFrame): CombatSmearDraw[] {
  const out: CombatSmearDraw[] = [];
  for (const stroke of frame.strokes) {
    const t = frame.timeMs;
    if (t < stroke.releaseMs || t < stroke.hitMs - COMBAT_SMEAR.leadMs || t >= stroke.hitMs + COMBAT_SMEAR.holdMs) continue;
    const kind = combatSmearKind(stroke);
    if (kind === null) continue;
    const u = Math.max(0, Math.min(1, (t - stroke.releaseMs) / Math.max(1, stroke.hitMs - stroke.releaseMs))) ** NATIVE_CITY_TRAIL_HEAD_EASE;
    const at = (v: number): P => {
      const [x, y] = nativeCityTrailTipAt(stroke.path, Math.max(0, v));
      return [frame.x + frame.side * x * frame.bodyPx, frame.y + y * frame.bodyPx];
    };
    const draw = combatSmearPlace(kind, at(u), at(u - COMBAT_SMEAR.spanU), at(u - COMBAT_SMEAR.spanU / 2));
    if (draw) out.push(draw);
  }
  return out;
}
