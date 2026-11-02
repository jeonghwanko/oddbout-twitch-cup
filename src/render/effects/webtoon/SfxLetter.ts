import { KUMA_FIGHT_LETTERS, type KumaFightLetterId, type KumaFightLocale } from "../../../assets/KumaFightArtCatalog";
import { NATIVE_CITY_COMBAT, type NativeCitySfxLetterTuning, type NativeCitySfxLetterWeight } from "../../../sim/cityFight/NativeCityCombatTuning";
import { clamp01 } from "../../../sim/geom";
import { easeOutBackWith, easeOutCubic } from "../../art/easing";
import { PALETTE } from "../../art/palette";

/**
 * 만화 효과음 글자(2026-10-09, 쿠마 대결 — "쾅!·텅!·막!·깨짐!·휙!·빈틈!·카운터!"; 격투 게임처럼 평타엔 글자가 없다). 순수 시간표:
 * 크게 찍혀 내려앉는 도장 팝, 기울기, 멈춤 동안 붙들기, 그 뒤 밀린 쪽으로 흘러가며 사라지기, 번갈이 자리, 화면 위 개수 상한.
 * 그리기는 `view/SfxLetterView` 가 한다(원화가 준비된 글자는 그림, 아니면 코드 글꼴). 수치는 json `feel.letters`.
 *
 * 시계는 화면 시간이다 — 히트스톱 동안에도 글자는 팝하고, 멈춤이 풀린 뒤 흘러간다(`holdMs` = 그 한 방의 멈춤).
 *
 * 무거운 글자(2026-10-16, 웹툰 쇼크 명세 3.1)는 흘러가며 흐려지지 않는다 — 버틴 뒤 끊기고, 그린 잉크·금 조각 여섯(`letterShards`)으로
 * 부서져 튀어 나간다(`sfxLetterShards`). 조각도 반투명 페이드 없이 작아지다 끊긴다. 모션 감소에서는 예전처럼 흐려진다.
 */

export type SfxLetterWeight = NativeCitySfxLetterWeight;

/** One letter to pop. */
export interface SfxLetterSpec {
  readonly id: KumaFightLetterId;
  readonly weight: SfxLetterWeight;
  /** World px where its centre pops (offset already applied). */
  readonly at: readonly [number, number];
  /** World px of its height. */
  readonly sizePx: number;
  /** Which way it leans (-1 left, 1 right). */
  readonly side: -1 | 1;
  /** Unit screen direction it drifts along once the hold is over (the push); [0, -1] floats it up. */
  readonly drift: readonly [number, number];
  /** Screen ms it holds at full size before lingering (the hit stop of its blow). */
  readonly holdMs: number;

  readonly tone?: "miss";
  /**
   * Screen ms it lingers after its hold instead of its weight's `lingerMs` (2026-10-23 arena audit — the arena's letters about 350 ms in
   * all, not over half a second on a face).
   */
  readonly lingerMs?: number;
  /**
   * World px above `at` that its drawing may reach (2026-10-24 — the arena's face HUD floor at its pop, `SfxLetterView`'s ceiling): its
   * stamp's big first frames grow down instead of up, a light letter's drift stops there, and a breaking letter's shards are thrown up no
   * higher. Absent: no limit (the village's letters over the heads).
   */
  readonly roomPx?: number;
}

/** A letter's look this frame. */
export interface SfxLetterFrame {
  readonly scale: number;
  readonly alpha: number;
  /** World px off `at`. */
  readonly dx: number;
  readonly dy: number;
  readonly angleDeg: number;
  /** The ink burst behind a heavy letter: its size (× letter height) and opacity; 0 when none. */
  readonly burst: number;
  readonly burstAlpha: number;
}

const TUNING: NativeCitySfxLetterTuning = NATIVE_CITY_COMBAT.feel.letters;

/**
 * A heavy letter breaks into shards at the end — never under reduced motion, and only when the drawn shards are in (`shardsReady`; the
 * view's `letterShards` strip). Without them it drifts and fades like a light letter: it was cut with nothing flying for the shatter's
 * length (a cold cache at the cat-vending landing, 2026-10-18 audit).
 */
export function sfxLetterShatters(spec: Pick<SfxLetterSpec, "weight">, reduced = false, t: NativeCitySfxLetterTuning = TUNING,
  shardsReady = true): boolean {
  return spec.weight === "heavy" && !reduced && shardsReady && t.shatter.ms > 0;
}

/** How long a letter lives (screen ms): pop, hold, linger, then drift — or, for a breaking heavy letter, its shards' flight. */
export function sfxLetterLifeMs(spec: Pick<SfxLetterSpec, "weight" | "holdMs" | "lingerMs">, reduced = false,
  t: NativeCitySfxLetterTuning = TUNING, shardsReady = true): number {
  const linger = (spec.lingerMs ?? t.lingerMs[spec.weight]) * (reduced ? t.reducedLingerScale : 1);
  return Math.max(t.popMs, Math.max(0, spec.holdMs)) + linger + (sfxLetterShatters(spec, reduced, t, shardsReady) ? t.shatter.ms : t.driftMs);
}

/**
 * The letter `ageMs` (screen) after it popped: STAMPED in from `startScale` (> 1: it lands big and slams down past 1 and back, an
 * ease-back over `popMs`), tilted `tiltDeg` to its side; held through `holdMs` and `lingerMs`; then it slides `driftShare` of its height
 * along `drift` while it fades. Reduced motion: no stamp or drift — it appears, stays, and fades. `burst` is the code-font fallback's ink
 * star (the view skips it for a drawn letter, which has its own ink spikes).
 */
export function sfxLetterFrame(spec: SfxLetterSpec, ageMs: number, reduced = false, t: NativeCitySfxLetterTuning = TUNING,
  shardsReady = true): SfxLetterFrame {
  const age = Math.max(0, ageMs), life = sfxLetterLifeMs(spec, reduced, t, shardsReady);
  const tilt = t.tiltDeg[spec.weight] * spec.side;
  const heavy = spec.weight === "heavy";
  // A breaking letter is cut the moment its shards fly (`sfxLetterShards`).
  const end = sfxLetterShatters(spec, reduced, t, shardsReady) ? life - t.shatter.ms : life;
  if (age >= end) return { scale: 1, alpha: 0, dx: 0, dy: 0, angleDeg: tilt, burst: 0, burstAlpha: 0 };
  const pop = clamp01(age / Math.max(1, t.popMs));
  const scale = reduced ? 1 : t.startScale + (1 - t.startScale) * easeOutBackWith(pop, t.overshoot);
  const driftFrom = life - t.driftMs, u = clamp01((age - driftFrom) / Math.max(1, t.driftMs));
  const travel = reduced ? 0 : t.driftShare * spec.sizePx * easeOutCubic(u);
  const alpha = 1 - u * u;
  // Under its ceiling (`roomPx`): its top never above it — the stamp's oversize first frames and the drift give way downward.
  const dy = spec.roomPx === undefined ? spec.drift[1] * travel : Math.max(spec.drift[1] * travel, spec.sizePx * scale / 2 - spec.roomPx);
  // The ink burst grows behind a heavy letter over `burst.ms` and fades with it.
  const b = clamp01(age / Math.max(1, t.burst.ms));
  return { scale, alpha, dx: spec.drift[0] * travel, dy, angleDeg: tilt * (reduced ? 0.6 : 1),
    burst: heavy ? t.burst.scale * (reduced ? 1 : 0.55 + 0.45 * easeOutCubic(b)) : 0, burstAlpha: heavy ? alpha : 0 };
}

/**
 * Where the `index`-th letter of a run sits relative to its anchor (world px): alternating sides (and climbing when `offset.up` > 0) by
 * `offset.side` / `offset.up` of the letter's height — kept small: one letter shows at a time, it must not jump around.
 */
export function sfxLetterOffset(index: number, sizePx: number, t: NativeCitySfxLetterTuning = TUNING): readonly [number, number] {
  const i = Math.max(0, Math.floor(index)), side = i % 2 === 0 ? -1 : 1;
  return [side * t.offset.side * sizePx, -(i % 3) * t.offset.up * sizePx];
}

/** A letter's height for a body `bodyPx` tall (`size[weight]`). */
export function sfxLetterSizePx(weight: SfxLetterWeight, bodyPx: number, t: NativeCitySfxLetterTuning = TUNING): number {
  return Math.max(4, t.size[weight] * Math.max(0, bodyPx));
}

/** The fallback lettering's colours: a warm fill, a heavy ink outline, a darker drop (palette tokens only). */
export interface SfxLetterStyle { readonly fill: number; readonly stroke: number; readonly shade: number }

/**
 * Per letter: landed hits warm gold (퍽 hot gold, 쾅 bright gold over burgundy ink), the armour's 텅 cold steel on iron ink, the
 * guard's 막 pearl, 깨짐 ivory over the alarm red, 휙 wind-pale, 빈틈 the "attack now" magenta (`PALETTE.fightAttackNow`, 2026-10-19 신호
 * 정리: one colour, one meaning — it was the accent gold, and gold is the gold grade's only), 카운터 hot gold on burgundy.
 */
export function sfxLetterStyle(id: KumaFightLetterId): SfxLetterStyle {
  switch (id) {
    case "puk": return { fill: PALETTE.hotGold, stroke: PALETTE.nativeCityExchangeInk, shade: PALETTE.burgundyInk };
    case "kwang": return { fill: PALETTE.brightGold, stroke: PALETTE.webtoonInk, shade: PALETTE.burgundyInk };
    case "teong":
    case "superArmor": return { fill: PALETTE.throwSteel, stroke: PALETTE.throwSteelDeep, shade: PALETTE.webtoonInk };
    case "mak": return { fill: PALETTE.pearl, stroke: PALETTE.nativeCityExchangeInk, shade: PALETTE.throwSteelDeep };
    case "kkaejim": return { fill: PALETTE.nativeCityExchangeIvory, stroke: PALETTE.burgundyInk, shade: PALETTE.webtoonInk };
    case "hwik": return { fill: PALETTE.nativeCityExchangeWindLight, stroke: PALETTE.nativeCityExchangeInk, shade: PALETTE.nativeCityExchangeWindShade };
    case "bintum": return { fill: PALETTE.fightAttackNow, stroke: PALETTE.webtoonInk, shade: PALETTE.navyInk };
    case "counter": return { fill: PALETTE.hotGold, stroke: PALETTE.burgundyInk, shade: PALETTE.webtoonInk };
    default: return { fill: PALETTE.hotGold, stroke: PALETTE.webtoonInk, shade: PALETTE.burgundyInk };
  }
}

/** The text a letter reads in `locale` (the catalog's). */
export function sfxLetterText(id: KumaFightLetterId, locale: KumaFightLocale): string {
  return KUMA_FIGHT_LETTERS[id][locale];
}

/** A live letter (the view's slot). */
export interface SfxLetterLive { readonly spec: SfxLetterSpec; ageMs: number }

/**
 * Adds a letter: past `maxOnScreen` live ones the oldest gives way (it would be fading under the new one anyway). Returns the list.
 */
export function pushSfxLetter(live: SfxLetterLive[], spec: SfxLetterSpec, t: NativeCitySfxLetterTuning = TUNING): SfxLetterLive[] {
  while (live.length >= Math.max(1, t.maxOnScreen)) live.shift();
  live.push({ spec, ageMs: 0 });
  return live;
}

/** One frame (screen ms): ages every letter and drops the finished ones. */
export function stepSfxLetters(live: SfxLetterLive[], dtMs: number, reduced = false, t: NativeCitySfxLetterTuning = TUNING,
  shardsReady = true): SfxLetterLive[] {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  for (const letter of live) letter.ageMs += dt;
  return live.filter(letter => letter.ageMs < sfxLetterLifeMs(letter.spec, reduced, t, shardsReady));
}

/** One shard of a breaking letter: which drawn shard (`letterShards` frame 0..5), where (world px off the letter's `at`), turn, size. */
export interface SfxLetterShard {
  readonly frame: number;
  readonly dx: number;
  readonly dy: number;
  readonly angleDeg: number;
  /** World px of the shard cell's height (shrinks to 0). */
  readonly sizePx: number;
}

/** The six shards' grid over the letter (fractions of its height): three across, two down. */
const SHARD_GRID: readonly (readonly [number, number])[] = [[-0.42, -0.22], [0, -0.26], [0.42, -0.2], [-0.38, 0.22], [0.02, 0.26], [0.4, 0.2]];

/** A seeded unit value per (letter, shard, salt) — the same letter breaks the same way (no `Math.random`). */
function shardNoise(spec: SfxLetterSpec, index: number, salt: number): number {
  let h = Math.imul(Math.round(spec.at[0] * 8) ^ 0x9e3779b1, 0x85ebca6b) ^ Math.imul(Math.round(spec.at[1] * 8) + index * 97 + salt * 13, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/**
 * A breaking heavy letter's shards `ageMs` after it popped: none before the break (`life − shatter.ms`); then each of the six flies out
 * from its spot on the letter (leaning along `drift`), falls, spins and shrinks to nothing over `shatter.ms`. Under a ceiling (`roomPx`)
 * a shard is thrown up only as fast as lets its top peak at it (gravity brings it down from there), and never drawn above it.
 */
export function sfxLetterShards(spec: SfxLetterSpec, ageMs: number, reduced = false, t: NativeCitySfxLetterTuning = TUNING,
  shardsReady = true): SfxLetterShard[] {
  if (!sfxLetterShatters(spec, reduced, t, shardsReady)) return [];
  const s = t.shatter, since = Math.max(0, ageMs) - (sfxLetterLifeMs(spec, reduced, t, shardsReady) - s.ms);
  if (since < 0 || since >= s.ms) return [];
  const sec = since / 1000, h = spec.sizePx, shrink = 1 - (since / s.ms) ** 2, gravity = s.gravity * h, room = spec.roomPx;
  return SHARD_GRID.map(([ox, oy], i) => {
    const dirX = ox + spec.drift[0] * 0.5 + (shardNoise(spec, i, 1) - 0.5) * 0.3, dirY = oy + spec.drift[1] * 0.5 - 0.25;
    const len = Math.hypot(dirX, dirY) || 1;
    const speed = (s.speed[0] + (s.speed[1] - s.speed[0]) * shardNoise(spec, i, 2)) * h;
    const spin = (shardNoise(spec, i, 3) * 2 - 1) * s.spinDegPerS;
    // Up no faster than lets its top (half its first size over its centre) peak at the ceiling: v² = 2 g × the room over it.
    let vy = dirY / len * speed;
    if (room !== undefined && vy < 0) vy = Math.max(vy, -Math.sqrt(2 * gravity * Math.max(0, oy * h + room - s.size * h / 2)));
    const sizePx = s.size * h * shrink, fall = oy * h + vy * sec + 0.5 * gravity * sec * sec;
    return {
      frame: i,
      dx: ox * h + dirX / len * speed * sec,
      dy: room === undefined ? fall : Math.max(fall, sizePx / 2 - room),
      angleDeg: t.tiltDeg[spec.weight] * spec.side + spin * sec,
      sizePx,
    };
  });
}
