import { PALETTE } from "../art/palette";
import { easeOutBack, easeOutCubic } from "../art/easing";
import { clamp01 } from "../../sim/geom";
import { COMBAT_IMPACT_RECIPES, combatImpactGrade } from "./CombatImpactRecipe";

/**
 * 명중 "빛 터짐" 층 — 접촉 핵·바늘 광선·불티·고리. 마을 대결과 저택 전투가 같은 층을 쓴다(만화 원화 `DuelComicArt` 의 짝).
 *
 * 2026-10-15 프레임 검수(VFX·애니메이터 리뷰, `docs/kaito-web/combat-vfx-lab.md`)로 다시 잡은 규칙:
 *   - 흰색은 접촉 0~1 프레임의 핵만(`whiteMs`). 남은 정지 동안은 작은 노랑 핵이 원화 밑을 받친다.
 *   - 정지(히트스톱) 동안은 정물이다: 떨림·불티·자라는 고리가 없다. 정지가 풀리는 첫 프레임에 핵이 한 번 튀고 광선·불티·고리가
 *     한꺼번에 나간다(홀드-스냅, `CombatFxClock`).
 *   - 가산 후광·불꽃 고리는 없다(두 몸을 지우는 흰 판이 됐다). 가산 합성은 흰 핵과 바늘의 흰 심만.
 *   - 사라질 때는 줄이거나 끊는다(반투명 잉크·면은 밝은 바닥에서 진흙이 됐다). 해제 뒤 `tailMs` 안에 끝난다.
 *   - 색 문법: 내 명중은 노랑(GOLD), 내 피격은 잉크 가시(HURT), 막힘·패리·깨짐은 흰색과 잉크(WHITE_INK).
 * 막힌 타격(armor·guard)은 때린 쪽으로 되튀고, 바닥 충격(slam)은 바닥에 눕고, 예고 눈빛(glint)은 정지 없이 짧다.
 *
 * 순수 함수다: 나이(화면 ms)·멈춤(ms)·시드만으로 같은 스프라이트 목록이 나온다. 텍스처는 `HypeImpactTextures`, 그리기는
 * `HypeImpactView` 가 소유한다. 헛친 공격은 이 층에 들어오지 않는다(헛친 바닥 충격만 `muted`).
 */

export type HypeTex = "glow" | "needle" | "star" | "ring" | "spark" | "crescent";
export type HypeKind = "strike" | "heavy" | "slash" | "parry" | "armor" | "guard" | "shatter" | "slam" | "glint";
/** 0 평타 · 1 강타 · 2 돌진 충돌 · 3 결정타. */
export type HypeRank = 0 | 1 | 2 | 3;

export interface HypeContact {
  readonly kind: HypeKind;
  readonly rank: HypeRank;
  /** 접촉점(화면/월드 px). */
  readonly x: number;
  readonly y: number;
  /** 맞은 몸의 화면 키(px) — 모든 크기의 기준. */
  readonly bodyPx: number;
  /** 때린 쪽 → 맞은 쪽 방향(라디안, 화면 좌표). */
  readonly angle: number;
  /** 접촉 뒤 화면 시간(ms). */
  readonly ageMs: number;
  /** 이 접촉의 히트스톱(ms) — 정점은 그동안 떨며 버틴다. */
  readonly holdMs: number;
  readonly seed: number;

  readonly hurt?: boolean;
  /** 바닥 원이 화면에서 눌린 비(세로/가로) — `slam` 의 바닥 섬광·고리. 없으면 마을 16° 카메라 값. */
  readonly squash?: number;
  /**
   * `glint` 의 색: 금(돌진 눈빛) / 진주(가드가 선다). 명중(`strike`·`heavy`)에선 "pearl" 이 마을 대결의 카운터 명중이다(2026-10-19 신호
   * 정리, 사용자: 한 색 한 뜻 — 진주·흰색은 흰 등급(카운터는 흰 휘두름의 답), 금은 금 등급만): 노랑(GOLD) 대신 진주.
   */
  readonly tone?: "gold" | "pearl";
  /** `slam`: 헛친 찍기 — 바닥 섬광 없이 바늘·고리·먼지만. */
  readonly muted?: boolean;
  /** 막힘(armor·guard)의 모양을 그린 원화(`clang`·`block` 칸)가 맡는다 — 이 층은 흰 핵과 되튀는 불티만 그린다(2026-10-17). */
  readonly drawn?: boolean;
  /** 모든 조각에 곱하는 불투명도 — 버틴 평타(`COMBAT_ABSORBED_HIT`). 없으면 1. */
  readonly alpha?: number;
}

/** 뷰가 같은 접촉을 프레임마다 알아보는 열쇠가 붙은 접촉. */
export type KeyedHypeContact = HypeContact & { readonly key: string };

export interface HypeSprite {
  readonly tex: HypeTex;
  /** 그리는 순서(`HYPE_LAYER`). `HYPE_UNDER_LAYERS` 미만은 손그림 원화 아래에 깔린다. */
  readonly layer: number;
  readonly x: number;
  readonly y: number;
  /** 텍스처 가로·세로 방향의 화면 크기(px). 바늘은 가로가 길이다. */
  readonly w: number;
  readonly h: number;
  readonly rot: number;
  readonly color: number;
  readonly alpha: number;
  readonly add: boolean;
}

/** 아래 → 위. 후광·먹 집중선은 원화 밑, 나머지는 원화 위. */
export const HYPE_LAYER = Object.freeze({
  halo: 0, inkLines: 1,
  ring: 2, crescentGlow: 3, crescentCore: 4, rayGlow: 5, rayCore: 6,
  inkStar: 7, starGlow: 8, starCore: 9, bloom: 10, spark: 11, sparkCore: 12, inkCut: 13,
});
export const HYPE_UNDER_LAYERS = 2;

/**
 * 크기는 맞은 몸 키 배율, 시간은 화면 ms. 배열은 [평타, 강타, 돌진 충돌, 결정타]. 2026-10-15 프레임 검수(VFX·애니메이터 리뷰)로
 * 다시 잡았다: 가산 후광·불꽃 고리를 없애고 크기를 몸의 0.12~0.25 로, 수명을 해제 뒤 100~233ms 로 줄였다(옛 820ms 는 평타
 * 간격 180ms 위로 3~5겹 쌓였다). 흰색은 접촉 0~1 프레임만, 정지 중에는 정물, 해제 첫 프레임에 광선·불티·고리가 나간다.
 */
export const HYPE_IMPACT = Object.freeze({
  /** 실제 히트스톱이 이보다 짧아도 정점은 최소 이만큼 보인다(30Hz 표시에서도 한 장은 남게). */
  minHoldMs: [34, 50, 60, 84],
  /** 흰 핵을 쓰는 첫 화면 ms(접촉 0~1 프레임). 그 뒤 정지 끝까지는 노랑 핵(`holdCore`)이 남는다. */
  whiteMs: [17, 33, 33, 50],
  holdCore: { alpha: .35, scale: .8 },
  /**
   * 해제 첫 프레임에 핵이 이만큼 튀었다가 `outMs` 에 걸쳐 줄어 사라진다. 해제 방출은 접촉보다 작다 — 첫 프레임이 가장 또렷하다
   * (2026-10-15 2차 검수: 1.5 배 팝·사방 광선은 해제 프레임을 접촉보다 밝게 만들었다).
   */
  releasePop: { scale: 1.15, outMs: 50 },
  bloom: { radius: [.12, .18, .2, .25] },
  /** 불티 — 정지 중에는 없고, 해제 첫 프레임에 한꺼번에 나간다(보통 합성). */
  sparks: { count: [3, 4, 6, 8], speed: [2.4, 3.0, 3.4, 3.8], gravity: 7.5, lift: 1.1, lifeMs: [150, 200, 220, 260] },

  hurt: { core: .2 },
  /** "깨짐!": 흰 핵과 잉크 테의 짧은 파편. */
  shatter: { shards: 8, speed: 3.6, lifeMs: 200, length: .22, width: .06 },
  /** 막힌 타격(armor·guard). 배열은 [가벼운 막힘, 무거운 막힘(강타·돌진 충돌)]. 광선·불티는 때린 쪽으로 되튄다. 색은 흰색·잉크만. */
  block: { holdMinMs: 40, bloom: [.12, .16], star: [.35, .45], starMs: [67, 83], rays: [3, 4], rayLength: [.35, .45], rayFlyMs: 67,
    sparks: [3, 4], sparkSpeed: [3.0, 3.6], sparkLifeMs: [150, 180], arc: [.6, .75], arcMs: [83, 100] },
  /** 바닥 충격. 배열은 [발뒤꿈치 찍기, 쿠마 내려찍기]. 헛친 찍기(`muted`)는 섬광이 없다. */
  slam: { holdMinMs: 60, flash: [.9, 1.2], flashMs: 50, needles: [6, 9], needleLength: [.6, .9], needleFlyMs: 117,
    ringTo: [1.2, 1.6], ringMs: 167, sparks: [6, 10], chips: [4, 6], squash: .32 },
  /** 예고 눈빛. 배열은 [가드가 선다, 돌진 직전]. */
  glint: { star: [.45, .7], flare: [.6, .8], popMs: 45, holdMs: 70, outMs: 110 },
  /** 해제 뒤 이만큼 지나면 그 접촉은 아무것도 그리지 않는다(`hypeContactLifeMs`). */
  tailMs: [100, 167, 200, 233],
});

/** 이 접촉이 다 사라지는 나이(화면 ms): 정지(최소 `minHoldMs`) + 해제 뒤 꼬리. 막힌 타격·바닥·눈빛도 이 안에서 끝난다. */
export function hypeContactLifeMs(c: Pick<HypeContact, "kind" | "rank" | "holdMs">): number {
  const T = HYPE_IMPACT, hold = Number.isFinite(c.holdMs) ? Math.max(0, c.holdMs) : 0;
  if (c.kind === "glint") return T.glint.popMs + T.glint.holdMs + T.glint.outMs;
  if (c.kind === "armor" || c.kind === "guard") return Math.max(hold, T.block.holdMinMs) + Math.max(T.block.sparkLifeMs[1]!, T.block.arcMs[1]!);
  if (c.kind === "slam") return Math.max(hold, T.slam.holdMinMs) + Math.max(T.slam.ringMs, 460);
  return Math.max(hold, T.minHoldMs[c.rank]!) + Math.max(T.tailMs[c.rank]!, c.kind === "shatter" ? T.shatter.lifeMs : 0);
}

interface HypePalette { core: number; halo: number; ray: number; star: number; ring: number; spark: readonly [number, number, number] }
const GOLD: HypePalette = { core: PALETTE.fxWarmCream, halo: PALETTE.fxWarmAmber, ray: PALETTE.fxWarmGold, star: PALETTE.hotGold,
  ring: PALETTE.hotGold, spark: [PALETTE.fxWarmCream, PALETTE.fxWarmGold, PALETTE.fxWarmAmber] };

const HURT: HypePalette = { core: 0xfff0ea, halo: 0xff3d2e, ray: PALETTE.webtoonInk, star: 0xffb09a, ring: 0xffc0b0, spark: [0xffe2d6, 0xff7a4a, 0xd8241a] };
/** 진주: 쿠마 가드의 진주빛 방패(`NativeCityExchangeFx` 의 pearl 과 같은 가족). */
const PEARL: HypePalette = { core: 0xf8fcff, halo: 0x8fc8ff, ray: 0x86bde8, star: 0xdcefff, ring: 0xe6f4ff, spark: [PALETTE.white, 0xd6ecff, 0x7fb0dc] };
/** 흰 핵 + 잉크 테(막힌 타격·패리·깨짐 — 색이 빠진 것 자체가 "안 들어갔다/맞받았다"). */
const WHITE_INK: HypePalette = { core: PALETTE.white, halo: PALETTE.white, ray: PALETTE.webtoonInk, star: PALETTE.white, ring: PALETTE.white,
  spark: [PALETTE.white, PALETTE.white, PALETTE.white] };
/** 바닥 돌 조각(보통 합성). */
const CHIP = 0x5a4632;

/** 공용 곡선(`render/art/easing`)은 구간 밖 입력을 자르지 않는다 — 나이 비율은 넘칠 수 있어 0~1 로 잘라 부른다. */
const outCubic = (u: number) => easeOutCubic(clamp01(u));
const outBack = (u: number) => easeOutBack(clamp01(u));
const rng = (seed: number, i: number) => { const v = Math.sin(i * 127.1 + seed * 311.7 + 74.7) * 43758.5453; return v - Math.floor(v); };

function lerpColor(a: number, b: number, u: number): number {
  const t = clamp01(u), ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
function sparkColor(p: HypePalette, u: number): number {
  return u < .2 ? lerpColor(p.spark[0], p.spark[1], u / .2) : lerpColor(p.spark[1], p.spark[2], (u - .2) / .8);
}

type Push = (tex: HypeTex, layer: number, x: number, y: number, w: number, h: number, rot: number, color: number,
  alpha: number, add: boolean) => void;

/**
 * 한 접촉의 박자: 멈춤(F) 동안은 정물(`frozen`), 풀린 뒤의 나이가 `r`. `release`: 해제 첫 프레임부터 지난 비율을 재는 데 쓴다.
 * 알파 페이드 대신 줄여 지우는 것이 기본이다(반투명 잉크·면이 밝은 바닥에서 회색·갈색 진흙이 됐다).
 */
function beat(c: HypeContact, minHoldMs: number, out: HypeSprite[]) {
  const t = c.ageMs, F = Math.max(Number.isFinite(c.holdMs) ? c.holdMs : 0, minHoldMs), fade = c.alpha ?? 1;
  const push: Push = (tex, layer, x, y, w, h, rot, color, alpha, add) => {
    const shown = Math.min(1, alpha) * fade;
    if (shown > .01 && w > .5 && h > .3) out.push({ tex, layer, x, y, w, h, rot, color, alpha: shown, add });
  };
  return { t, F, frozen: t < F, r: Math.max(0, t - F), tilt: (rng(c.seed, 1) - .5) * .24, push };
}

interface SparkSpec {
  readonly count: number; readonly speed: number; readonly lifeMs: number;
  /** 부채꼴 가운데 방향과 폭(라디안). `backShare` 만큼은 반대쪽으로 튄다. */
  readonly angle: number; readonly cone: number; readonly backShare: number;
  readonly lift: number; readonly thick: number; readonly salt: number;
}
/** 포물선 불티 — 정지 중에는 없고 해제 첫 프레임에 한꺼번에 나간다. 속도 방향으로 늘어난 줄이고, 끝에서 줄어 사라진다. */
function sparkBurst(c: HypeContact, b: ReturnType<typeof beat>, pal: HypePalette, s: SparkSpec): void {
  if (b.frozen) return;
  const T = HYPE_IMPACT, B = c.bodyPx, g = T.sparks.gravity * B, L = HYPE_LAYER;
  const tau = b.r / 1000;
  for (let i = 0; i < s.count; i++) {
    const j = s.salt + i;
    const back = rng(c.seed, 100 + j) < s.backShare;
    const a = (back ? s.angle + Math.PI : s.angle) + (rng(c.seed, 130 + j) - .5) * s.cone;
    const speed = B * s.speed * (.45 + .9 * rng(c.seed, 160 + j));
    const life = s.lifeMs * (.55 + .6 * rng(c.seed, 190 + j)) / 1000;
    if (tau >= life) continue;
    const vx = Math.cos(a) * speed, vy0 = Math.sin(a) * speed - B * s.lift * rng(c.seed, 220 + j);
    const x = c.x + vx * tau + (rng(c.seed, 250 + j) - .5) * B * .08;
    const y = c.y + vy0 * tau + .5 * g * tau * tau;
    const vy = vy0 + g * tau, v = Math.hypot(vx, vy), u = tau / life;
    const len = Math.max(B * .045, Math.min(B * .3, v * .05)) * (1 - .6 * u);
    const h = B * s.thick * (1 - .6 * u);
    b.push("spark", L.spark, x, y, len, h, Math.atan2(vy, vx), sparkColor(pal, u), 1, false);
    if (u < .45) b.push("spark", L.sparkCore, x, y, len * .7, h * .5, Math.atan2(vy, vx), pal.core, 1, false);
  }
}

/**
 * 해제 첫 프레임을 기준으로 한 바늘 한 줄: 정지 동안 `frozenReach` 길이로 찔린 채 멈춰 있다가, 풀리면 다 뻗고 바깥으로 날아가며
 * 가늘어진다. 날아간 끝에서 끊는다(알파 페이드 없음).
 */
function needle(b: ReturnType<typeof beat>, c: HypeContact, pal: HypePalette, a: number, len: number, wid: number, flyMs: number,
  frozenReach: number, startPx: number, glowLayer: number, coreLayer: number, releaseReach = 1): void {
  // On an ink rim the white heart is plain paint: added light over ink smeared into grey.
  const inkRim = pal.ray === PALETTE.webtoonInk;
  const flyU = b.frozen ? 0 : b.r / flyMs;
  if (flyU >= 1) return;
  const fly = outCubic(flyU), start = startPx + len * .9 * fly;
  const length = len * (b.frozen ? frozenReach : releaseReach) * (1 - .6 * fly), width = wid * (1 - .7 * fly);
  const x = c.x + Math.cos(a) * start, y = c.y + Math.sin(a) * start;
  b.push("needle", glowLayer, x, y, length * 1.08, width * 2.4, a, pal.ray, 1, false);
  b.push("needle", coreLayer, x, y, length, width, a, pal.core, 1, !inkRim);
}

/** 한 접촉의 이번 프레임 스프라이트(그리는 순서 무관 — 뷰가 `layer` 로 정렬한다). */
export function hypeImpactSprites(c: HypeContact): HypeSprite[] {
  const out: HypeSprite[] = [];
  const T = HYPE_IMPACT, R = c.rank, B = c.bodyPx;
  if (!(c.ageMs >= 0) || !(B > 0) || c.ageMs >= hypeContactLifeMs(c)) return out;
  if (c.kind === "armor" || c.kind === "guard") return blockSprites(c, out);
  if (c.kind === "slam") return slamSprites(c, out);
  if (c.kind === "glint") return glintSprites(c, out);
  const shatter = c.kind === "shatter", parry = c.kind === "parry";
  const pal = c.hurt ? HURT : parry || shatter ? WHITE_INK : c.tone === "pearl" ? PEARL : GOLD;
  const b = beat(c, T.minHoldMs[R]!, out), { t, frozen, r, push } = b;
  const L = HYPE_LAYER;

  // 1. 핵: 접촉 0~1 프레임은 흰 핵(유일한 흰색). 남은 정지 동안은 작은 노랑 핵이 원화 밑을 받친다. 해제 첫 프레임에 한 번 튀고
  // `releasePop.outMs` 안에 줄어 사라진다 — 정지가 풀리는 순간이 보이게.
  const bloomR = c.hurt ? B * T.hurt.core : B * T.bloom.radius[R]! * (parry ? .8 : shatter ? .5 : 1);
  if (frozen) {
    const white = t < T.whiteMs[R]!;
    const radius = bloomR * (white ? 1 : T.holdCore.scale);
    push("glow", L.bloom, c.x, c.y, radius * 2, radius * 2, 0, white ? pal.core : pal.halo, white ? 1 : T.holdCore.alpha, white);
  } else if (r < T.releasePop.outMs) {
    const u = r / T.releasePop.outMs, radius = bloomR * T.releasePop.scale * (1 - u);
    push("glow", L.bloom, c.x, c.y, radius * 2, radius * 2, 0, pal.halo, T.holdCore.alpha + (1 - T.holdCore.alpha) * (1 - u), false);
  }

  // 2026-10-17 (이펙트 화풍 통일, vfx-artist on the realtime film): no needle fan, jab cross, shock ring, finisher ink X, slash crescent
  // or parry X here any more — vector shapes over the painted cels read as clip art. The drawn cel owns the contact's shape; this layer
  // keeps only its white core and the release sparks.
  // 2. 불티 — 해제 첫 프레임에 한꺼번에.
  sparkBurst(c, b, pal, { count: T.sparks.count[R]!, speed: T.sparks.speed[R]!, lifeMs: T.sparks.lifeMs[R]!, angle: c.angle,
    cone: R === 0 ? 1.9 : 2.4, backShare: R === 0 ? .15 : .25, lift: T.sparks.lift, thick: R === 0 ? .03 : .026, salt: 0 });
  // "깨짐!": 흰 핵과 잉크 테의 짧은 파편이 돌며 사방으로(해제 첫 프레임부터).
  if (shatter && !frozen) {
    const S = T.shatter, tau = r / 1000, g = T.sparks.gravity * B;
    for (let i = 0; i < S.shards; i++) {
      const a = (i / S.shards) * Math.PI * 2 + (rng(c.seed, 500 + i) - .5) * .5;
      const speed = B * S.speed * (.5 + .7 * rng(c.seed, 530 + i)), life = S.lifeMs * (.6 + .5 * rng(c.seed, 560 + i)) / 1000;
      if (tau >= life) continue;
      const u = tau / life, x = c.x + Math.cos(a) * speed * tau, y = c.y + Math.sin(a) * speed * tau + .5 * g * tau * tau;
      const spin = a + (rng(c.seed, 590 + i) - .5) * 14 * tau, k = 1 - .6 * u;
      const len = B * S.length * (.7 + .6 * rng(c.seed, 620 + i)) * k, w = B * S.width * k;
      push("needle", L.rayGlow, x, y, len * 1.15, w * 1.9, spin, pal.ray, 1, false);
      push("needle", L.rayCore, x, y, len, w * .7, spin, pal.core, 1, true);
    }
  }

  return out;
}

/**
 * 막힌 타격 — 뚫지 못한 한 방. 흰색과 잉크만(색이 빠진 것이 "안 들어갔다"). 앞으로 뻗는 광선 대신 때린 쪽으로 되튀는 짧은 광선·
 * 흰 조각, 때린 쪽을 향한 호. 갑옷은 잉크 테를 두른 X, 가드는 곧은 십자.
 */
function blockSprites(c: HypeContact, out: HypeSprite[]): HypeSprite[] {
  const T = HYPE_IMPACT.block, k = c.rank >= 1 ? 1 : 0, B = c.bodyPx, L = HYPE_LAYER;
  const armor = c.kind === "armor", pal = WHITE_INK, back = c.angle + Math.PI;
  const b = beat(c, T.holdMinMs, out), { t, frozen, r, tilt, push } = b;
  // 작고 단단한 흰 핵 — 접촉 한 프레임만.
  if (t < 17) push("glow", L.bloom, c.x, c.y, B * T.bloom[k]! * 2, B * T.bloom[k]! * 2, 0, pal.core, 1, true);
  // 반짝임: 갑옷은 45° X(잉크 테로 밝은 바닥에서도 선다), 가드는 곧은 십자. 풀리면 줄어 사라진다. 그린 원화가 있으면 별·호·광선은 없다.
  const starU = frozen ? 0 : r / T.starMs[k]!;
  if (c.drawn) {
    sparkBurst(c, b, pal, { count: T.sparks[k]!, speed: T.sparkSpeed[k]!, lifeMs: T.sparkLifeMs[k]!, angle: back, cone: 1.7,
      backShare: .1, lift: 1.6, thick: .03, salt: 0 });
    return out;
  }
  if (starU < 1) {
    const pop = .6 + .4 * outBack(t / 40), s = B * T.star[k]! * pop * (1 - starU), rot = (armor ? Math.PI / 4 : 0) + tilt;
    push("star", L.inkStar, c.x, c.y, s * 1.6, s * 1.6, rot, PALETTE.webtoonInk, 1, false);
    push("star", L.starCore, c.x, c.y, s, s, rot, pal.core, 1, true);
  }
  // 때린 쪽을 향해 부푼 호 — 쇠 테 / 방패 면에 맞고 멈췄다.
  const arcU = frozen ? 0 : r / T.arcMs[k]!;
  if (arcU < 1) {
    const d = B * T.arc[k]!, ax = c.x + Math.cos(back) * B * .06, ay = c.y + Math.sin(back) * B * .06;
    push("crescent", L.inkLines, ax, ay, d * .5 * 1.3 * (1 - .6 * arcU), d * 1.04, back, PALETTE.webtoonInk, 1, false);
    push("crescent", L.crescentCore, ax, ay, d * .5 * (1 - .7 * arcU), d, back, pal.core, 1, true);
  }
  // 되튀는 짧은 광선.
  const rays = T.rays[k]!;
  for (let i = 0; i < rays; i++) {
    const a = back + (i / Math.max(1, rays - 1) - .5) * 2.3 + (rng(c.seed, 10 + i) - .5) * .25;
    const len = B * T.rayLength[k]! * (.6 + .6 * rng(c.seed, 40 + i)), wid = B * .04 * (.7 + .6 * rng(c.seed, 70 + i));
    needle(b, c, pal, a, len, wid, T.rayFlyMs, .6, B * .08, L.rayGlow, L.rayCore);
  }
  sparkBurst(c, b, pal, { count: T.sparks[k]!, speed: T.sparkSpeed[k]!, lifeMs: T.sparkLifeMs[k]!, angle: back, cone: 1.7,
    backShare: .1, lift: 1.6, thick: .03, salt: 0 });
  return out;
}

/**
 * 바닥 충격: 바닥에 눕는 짧은 흰 섬광(헛친 찍기는 없음), 위로 솟는 바늘, 바닥 원근으로 눌린 충격 고리 하나, 위로 튀는 불티와 돌 조각.
 * `c.y` 는 바닥(충격점)이다.
 */
function slamSprites(c: HypeContact, out: HypeSprite[]): HypeSprite[] {
  const T = HYPE_IMPACT.slam, k = c.rank >= 2 ? 1 : 0, B = c.bodyPx, L = HYPE_LAYER, pal = GOLD;
  const sq = Math.max(.15, Math.min(1, c.squash ?? T.squash));
  const b = beat(c, T.holdMinMs, out), { t, frozen, r, push } = b;
  if (!c.muted && t < T.flashMs) {
    const w = B * T.flash[k]!;
    push("glow", L.bloom, c.x, c.y, w, w * sq * 1.4, 0, pal.core, 1, true);
  }
  // 위로 솟는 바늘 — 바닥 타원 위 여러 자리에서. 헛친 찍기는 바늘도 없다(먼지와 돌 조각만).
  const n = c.muted ? 0 : T.needles[k]!;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rng(c.seed, 10 + i) - .5) * 1.8, foot = (rng(c.seed, 40 + i) - .5) * B * 1.1;
    const len = B * T.needleLength[k]! * (.45 + .75 * rng(c.seed, 70 + i)), wid = B * .042 * (.7 + .6 * rng(c.seed, 100 + i));
    needle(b, { ...c, x: c.x + foot }, pal, a, len, wid, T.needleFlyMs, .6, 0, L.rayGlow, L.rayCore);
  }
  if (!frozen && r < T.ringMs) {
    const u = outCubic(r / T.ringMs), radius = B * (.4 + (T.ringTo[k]! - .4) * u);
    push("ring", L.ring, c.x, c.y, radius * 2, radius * 2 * sq, 0, pal.ring, 1 - u, false);
  }
  sparkBurst(c, b, pal, { count: T.sparks[k]!, speed: 4.2, lifeMs: 300, angle: -Math.PI / 2, cone: 2.4, backShare: 0, lift: .6,
    thick: .03, salt: 0 });
  // 돌 조각: 굵고 느리고 무겁다(보통 합성, 어두운 흙색). 해제 첫 프레임부터.
  const tau = r / 1000, g = HYPE_IMPACT.sparks.gravity * B * 1.3;
  for (let i = 0; !frozen && i < T.chips[k]!; i++) {
    const a = -Math.PI / 2 + (rng(c.seed, 700 + i) - .5) * 2.2, speed = B * 3 * (.5 + .7 * rng(c.seed, 730 + i));
    const life = .4 * (.6 + .5 * rng(c.seed, 760 + i));
    if (tau >= life) continue;
    const u = tau / life, x = c.x + Math.cos(a) * speed * tau, y = c.y + Math.sin(a) * speed * tau + .5 * g * tau * tau;
    const size = B * .07 * (.6 + .8 * rng(c.seed, 790 + i)) * (1 - .5 * u);
    push("spark", L.spark, x, y, size * 1.4, size, a + 9 * tau * (rng(c.seed, 820 + i) - .5), CHIP, 1, false);
  }
  return out;
}

/** 예고 눈빛 — 히트스톱이 없는 짧은 반짝임: 십자 별이 튀어나와 돌며 줄고, 가로 렌즈 섬광이 양쪽으로 뻗는다. */
function glintSprites(c: HypeContact, out: HypeSprite[]): HypeSprite[] {
  const T = HYPE_IMPACT.glint, k = c.rank >= 1 ? 1 : 0, B = c.bodyPx, L = HYPE_LAYER, pal = c.tone === "pearl" ? PEARL : GOLD;
  const t = c.ageMs, u = clamp01((t - T.popMs - T.holdMs) / T.outMs);
  if (u >= 1) return out;
  const { push } = beat(c, 0, out), pop = .35 + .65 * outBack(t / T.popMs), s = B * T.star[k]! * pop * (1 - u), rot = t * .004;
  push("star", L.starGlow, c.x, c.y, s * 1.4, s * 1.4, rot, pal.star, 1, false);
  push("star", L.starCore, c.x, c.y, s, s, rot, pal.core, 1, true);
  const len = B * T.flare[k]! * .5 * pop * (1 - .4 * u), w = B * .028 * (1 - u);
  for (const side of [0, Math.PI]) {
    push("needle", L.rayGlow, c.x, c.y, len * 1.05, w * 2.6, side, pal.ray, 1, false);
    push("needle", L.rayCore, c.x, c.y, len, w, side, pal.core, 1, true);
  }
  return out;
}

/** 원화 명령의 티어 이름 → 순위. 마을과 저택 이름을 모두 받는다 — 공통 타격 레시피(`CombatImpactRecipe`)의 등급이 정한다. */
export function hypeRankOf(tier: string | undefined): HypeRank {
  return COMBAT_IMPACT_RECIPES[combatImpactGrade(tier)].light;
}
