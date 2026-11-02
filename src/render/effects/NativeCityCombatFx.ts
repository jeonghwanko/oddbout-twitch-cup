import type Phaser from "phaser";
import { nativeCityKnockbackCurve } from "../../sim/cityFight/NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityAuraTuning, type NativeCityFxTuning, type NativeCityImpactTier, type NativeCityKumaActionKind,
  type NativeCityKumaGrade } from "../../sim/cityFight/NativeCityCombatTuning";
import { COMBAT_FX_FREEZE_RATE } from "./CombatFxClock";
import { NATIVE_CITY_KUMA_GRADE_COLORS, nativeCityKumaGradeColors } from "./NativeCityKumaGrade";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { clamp01 } from "../../sim/geom";
import { easeOutCubic } from "../art/easing";
import { mixColor } from "../art/ColorMix";
import { PALETTE } from "../art/palette";
import { cometPoints, crescentPoints, ellipsePoints, fract, ribbonPoints, sampleSpine, smoothstep, sparklePoints, taper } from "./CombatFxShapes";
import { ROPE_FX_RAMPS } from "./RopeTraversalFx";
import { pushFxPoly, type FxPrim } from "./FxPrim";
import { fxRng } from "./FxRandom";
import { knockbackRemainingPx } from "./KnockbackCurve";
import { drawNativeCityExchangeFx, nativeCityExchangeFxLifeMs, nativeCityExchangeOnGround, type NativeCityExchangeCue } from "./NativeCityExchangeFx";
import type { NativeCityWireNetFrame } from './NativeCityWireNetFx';
import { nativeCityWeaponContactPrims, type NativeCityWeaponImpactKind } from "./NativeCityWeaponImpact";
import type { NativeCityHeavyFlowFrame, NativeCityImpactMotionSample } from "./NativeCityImpactSequence";
import type { NativeCityAttackTrailFrame } from "./NativeCityAttackTrail";
import { BALL_SMASH_FX, nativeCityComicContact } from "./NativeCityBallSmashFx";
import { duelComicImpactPrims } from "./DuelComicImpact";
import { combatImpactRank, comicKindOfRank } from "./CombatImpactRecipe";
import { nativeCityComicArtCommand } from "./NativeCityComicArt";
import type { ComicImpactArtKind } from "../../assets/ComicImpactArtCatalog";
import { duelComicArtHasLight } from "./DuelComicArt";

/**
 * 마을 대결의 절차 층. 깨끗한 명중은 공통 만화 원화를 쓰며, 로딩 전에는 `DuelComicImpact`의 절차 형태로 대체한다.
 * 방어·갑옷, 바닥 먼지, 예고와 기 모으기는 이 모듈이 소유한다. 색은 팔레트와 `ROPE_FX_RAMPS`에서 읽는다.
 *
 * 한 접촉의 박자(실제 화면 몸 75–130px 에서 바로 읽히게). 한 방의 모양은 그린 먹 별(`NativeCityHitFxView`)이 맡고, 여기 도형은
 * 그 가족이다 — 초승달·혜성마다 먹 밑선(`fx.inkStroke`)이 깔려 밝은 광장 바닥(휘도 ~221)에서도 읽힌다:
 *   1. 심   — 1–2 프레임 밝은 심(옅은 가산 빛 + 오목 반짝임, 화면 시간). break·ko 만 흰색.
 *   2. 불꽃 — 화면 시간으로 짧게 튀는 바늘 불꽃. 강타는 방향성 충격선을 접촉 경직 동안 유지한 뒤 빠르게 지운다.
 *   3. 파편 — 먼지·불티 조각이 타격 방향으로 포물선을 그리며 튄다(바닥을 치는 내려찍기·돌진·KO 와 붕괴만, 몸통 타격은 0).
 *   바닥 — 강타 이상에서 발밑 빛과 멈춤이 풀린 뒤의 먼지 고리, 넉백으로 미끄러지는 동안 발밑에 남는 먼지 자국.
 *
 * 쿠마 내려찍기: 바닥 충격파 띠 두 겹 + 먼지 덩이, 기 모으기(`nativeCityKumaAuraPrims`)는 충격 순간 바닥으로 무너진다.
 * 순수 함수다: 바닥 도형은 평면 원을 `project` 로 찍어 카메라가 돌아도 바닥에 붙는다. 수치는 json `feel.fx`·`feel.aura`.
 */

/** 평면 → 월드 px. */
export type NativeCityFxProject = (point: CityPoint) => readonly [number, number];

export interface NativeCityImpactCue {
  readonly technique?: string;
  /** Receiver identity for follow-through; never retarget an effect when the active opponent changes. */
  readonly victimId?: string;
  readonly tier: NativeCityImpactTier;
  readonly weaponKind?: NativeCityWeaponImpactKind;
  readonly guarded?: boolean;
  /** 쿠마 갑옷이 먹은 한 방(작고 둔하게). */
  readonly armored: boolean;
  /** 맞은 몸의 발(평면). */
  readonly victim: CityPoint;
  /** 맞은 몸 키(월드 px). */
  readonly bodyPx: number;
  /** 한 보(평면 단위) — 바닥 고리 크기. */
  readonly stepUnits: number;
  /** 때린 쪽 → 맞은 쪽(평면). */
  readonly direction: CityPoint;
  /** 접촉점 높이(몸 키 비율). */
  readonly contactHeight: number;

  readonly contactInset?: number;
  /** 티어 배율(`feel.tiers.*.fxScale`, 갑옷이면 × `armoredFxScale`). */
  readonly scale: number;
  readonly seed: number;
  /** 이 접촉의 공유 멈춤(ms). 맞은 몸 발밑 먼지는 멈춤이 풀릴 때 퍼지기 시작한다. */
  readonly freezeMs?: number;
  /** Motion preference and the existing per-exchange accent budget. */
  readonly reducedMotion?: boolean;
  readonly emphasis?: boolean;
  /** 바닥 먼지 고리만(쓰러진 몸이 바닥에 닿는 순간) — 발밑 빛·심·불꽃·고리·섬광은 없다. */
  readonly dustOnly?: boolean;

  readonly netted?: boolean;
  /**
   * 쿠마 잡기의 조이기(2026-10-19): 품 안에서 조이는 작은 고리(`NativeCityExchangeFx` hugSqueeze, 팔이 닫히는 자리)가 이 한 방의 그림이다 —
   * 만화 명중 원화·절차 명중·빛은 없다(한 순간 몸 위 그림 하나). 멈춤·맞은 몸 번쩍임·소리는 그대로다.
   */
  readonly squeezed?: boolean;
  /**
   * 이 한 방이 맞은 몸을 미는 거리(평면 단위, `nativeCityKnockbackCurve` 로 미끄러진다). 멈춤이 풀린 뒤 그 곡선을 따라 발밑에 먼지
   * 자국이 남는다(`feel.fx.skid`). 없거나 `skid.minStrides` 보다 짧으면 자국이 없다.
   */
  readonly skidUnits?: number;
}

export interface NativeCitySlamGroundCue {
  readonly technique?: string;
  readonly reducedMotion?: boolean;
  /** 주먹이 바닥을 친 자리(평면). */
  readonly center: CityPoint;
  /** 쿠마 발(평면) — 기 모으기가 여기서 무너진다. */
  readonly feet: CityPoint;
  readonly stepUnits: number;
  /** 쿠마 몸 키(월드 px) — 먼지 크기. */
  readonly bodyPx: number;

  readonly hit: boolean;
  readonly seed: number;

  readonly noAura?: boolean;
}

/** 내려찍기 예고: 주먹이 떨어질 바닥(평면 원)과 정점 유지에서 접촉까지의 진행(0..1). */
export interface NativeCitySlamTelegraph {
  readonly center: CityPoint;
  readonly radius: number;
  readonly progress: number;
}

/** 쿠마 기 모으기 한 프레임. */
export interface NativeCityKumaAura {
  readonly feet: CityPoint;
  readonly bodyPx: number;
  /** 0..1(이미 공격별 정점 배율이 곱해졌다). */
  readonly intensity: number;
  /** 지금 공격 시계(ms) — 소용돌이·맥박 위상. */
  readonly timeMs: number;
  /** 첫 접촉까지 시계(ms) — 맥박이 빨라지는 끝. */
  readonly impactMs: number;
  readonly reducedMotion: boolean;

  readonly opponent?: CityPoint;
  /** 다가오는 기술의 상성 등급(2026-10-14 `triangle`): 불꽃·테 빛·바닥 빛의 색(`NativeCityKumaGrade`). 없으면 금(예전 그대로). */
  readonly grade?: NativeCityKumaGrade | null;

  readonly quiet?: number;
}

export type NativeCityFxElement =
  | { readonly kind: "impact"; readonly cue: NativeCityImpactCue; readonly bornMs: number; readonly bornScreenMs: number }
  | { readonly kind: "slam"; readonly cue: NativeCitySlamGroundCue; readonly bornMs: number; readonly bornScreenMs: number }
  /** The traditional-exchange effects (guard / clash / parry / whiff / finisher / KO dust / calling card, `NativeCityExchangeFx`). */
  | { readonly kind: "exchange"; readonly cue: NativeCityExchangeCue; readonly bornMs: number; readonly bornScreenMs: number };

export interface NativeCityFxLayers {
  readonly ground: FxPrim[];
  readonly burst: FxPrim[];
}

const WARM = ROPE_FX_RAMPS.warm;
/** 색: 금빛 접촉(평타·강타), 반격 고리, 흰 결판, 바닥 빛·먼지, 예고, 기 모으기. */
export const NATIVE_CITY_FX_COLORS = Object.freeze({
  core: WARM[1]!,
  sparkEdge: WARM[2]!,
  sparkCore: WARM[1]!,
  streak: WARM[2]!,
  streakTail: WARM[3]!,
  /**
   * A blow KUMA's armour ate (2026-10-09 `feel.tells.armor`): IRON sparks, not the body's gold — the fist met metal. Edge, a cold
   * steel core, the dark iron the ring cools to.
   */
  armored: PALETTE.manorIronEdge,
  armoredHot: PALETTE.throwSteel,
  armoredDeep: PALETTE.manorIron,
  white: PALETTE.white,
  glow: PALETTE.lampLight,
  /** Dust reads on the pale paving only in two tones: a stone shadow under a paper-light crest. */
  dust: PALETTE.villagePavingPaper,
  dustShade: PALETTE.villageStone,
  telegraphFill: WARM[3]!,
  /**
   * 내려찍기(엉덩방아 포함) 바닥 예고의 테두리: 금 등급의 짙은 바깥 불꽃(상성 삼각형, 2026-10-14). 붉은 alarm 은 잡기(붉음 = 막지 마라)의
   * 색이라 금 기술의 바닥에 쓰지 않는다.
   */
  telegraphEdge: NATIVE_CITY_KUMA_GRADE_COLORS.gold.outer[1],
  /** 기 모으기는 불씨 가족만: 바깥 WARM[3]→WARM[4], 안쪽 WARM[2]→WARM[1](세기로 섞는다). */
  auraWarm: WARM[2]!,
  auraHot: WARM[1]!,
  auraDanger: WARM[4]!,
  auraEmber: WARM[3]!,
  /** Dust's sunlit top and the shockwave's first bright crest; the slam's flat flash. */
  dustBright: WARM[0]!,
  shockBright: WARM[2]!,
  flashFlat: WARM[1]!,
  /** The drawn ink star's line under every code crescent / comet (`fx.inkStroke`): one shape family, and it reads on the pale paving. */
  ink: PALETTE.webtoonInk,
});

const C = NATIVE_CITY_FX_COLORS;

const easeOut = (t: number) => easeOutCubic(clamp01(t));

/**
 * Whether this contact owns the body-sized blunt pressure wave (`NativeCityShockwaveView`): a clean comic blunt contact of tier rank
 * (`combatImpactRank`, the shared ladder) ≥ `pressureWave.minRank` whose accent played loud. A light tie flick or a budget-quiet
 * accent keeps the contact sheet and its light.
 */
export function nativeCityBodyPressureWave(cue: NativeCityImpactCue, t: NativeCityFxTuning = NATIVE_CITY_COMBAT.feel.fx): boolean {
  return cue.weaponKind === "blunt" && nativeCityComicContact(cue) && cue.emphasis !== false && combatImpactRank(cue.tier) >= t.pressureWave.minRank;
}

/**
 * What the raster side can draw right now. `comicContact`: the authored contact sheet is loaded — without it (first contact while the
 * sheet streams in, or a failed load) a blunt contact falls back to the procedural rounded burst instead of a bare light.
 */
export interface NativeCityFxArt {
  readonly comicContact: boolean;
  readonly contacts?: Readonly<Partial<Record<ComicImpactArtKind, boolean>>>;
  /** The drawn ground dust (`SMASH_FLIPBOOKS.dust`) is loaded: a knocked-out body lands in it, not in the procedural ring and puffs. */
  readonly groundDust?: boolean;
  /** The drawn skid dust (`SMASH_FLIPBOOKS.skid`) is loaded: a slide kicks it up instead of the code-drawn bloom and puffs. */
  readonly skidDust?: boolean;
  /** The drawn landing puff (`SMASH_FLIPBOOKS.puff`) is loaded: the dodge's duck stirs it instead of the code-drawn puffs. */
  readonly puffDust?: boolean;
}

/** The exchange cue a loaded raster flipbook draws instead of its code-drawn stand-in (the view pushes the flipbook). */
export function nativeCityExchangeDrawnByArt(cue: NativeCityExchangeCue, art: NativeCityFxArt): boolean {
  if (cue.reducedMotion) return false;
  return cue.kind === "koDustRing" ? art.groundDust === true : cue.kind === "slideDust" ? art.skidDust === true
    : cue.kind === "whiffWind" ? art.puffDust === true : false;
}
const ART_READY: NativeCityFxArt = Object.freeze({ comicContact: true });

/** Ground impact family is independent of whether the attacker used a weapon or his body. */
export function nativeCityComicGroundSlam(cue: NativeCitySlamGroundCue): boolean {
  return !cue.reducedMotion && (cue.technique === "ballSmash" || cue.technique === "buttSlam");
}

/** 이 요소가 다 사라지는 나이(효과 시계 ms). */
export function nativeCityFxLifeMs(element: NativeCityFxElement, t: NativeCityFxTuning = NATIVE_CITY_COMBAT.feel.fx,
  aura: NativeCityAuraTuning = NATIVE_CITY_COMBAT.feel.aura): number {
  if (element.kind === "slam") {
    if (nativeCityComicGroundSlam(element.cue)) return BALL_SMASH_FX.dustMs;
    return Math.max(t.shockwave.lifeMs + t.shockwave.secondDelayMs, t.dustPuffs.lifeMs + 60, aura.collapseMs, aura.collapseFlash.ms);
  }
  if (element.kind === "exchange") return nativeCityExchangeFxLifeMs(element.cue);
  const rank = combatImpactRank(element.cue.tier);
  const release = (element.cue.freezeMs ?? 0) * COMBAT_FX_FREEZE_RATE;
  if (element.cue.dustOnly) return release + t.dustRing.lifeMs;
  return Math.max(t.core.holdMs + t.core.fadeMs, t.sparks.lifeMs, t.groundGlow.lifeMs, release + t.dustRing.lifeMs,
    rank >= 1 ? Math.max(release + t.comets.lifeMs, release + t.aftershock.lifeMs) : 0, rank >= 3 ? t.flash.lifeMs : 0, t.debris.lifeMs + 40,
    skidUnits(element.cue, t) > 0 ? release + skidStopMs(element.cue) + Math.max(t.skid.puffLifeMs, t.skid.scuffLifeMs) : 0);
}

/** The skid's length (plan units), 0 when the push is too short to leave one. */
function skidUnits(cue: NativeCityImpactCue, t: NativeCityFxTuning): number {
  const units = cue.skidUnits ?? 0;
  return cue.dustOnly || !(units > t.skid.minStrides * cue.stepUnits) ? 0 : units;
}

/** Fight ms the knockback takes to stop (the same curve the victim slides on). */
function skidStopMs(cue: NativeCityImpactCue): number {
  const units = cue.skidUnits ?? 0, curve = nativeCityKnockbackCurve(cue.stepUnits);
  if (!(units > 0)) return 0;
  let lo = 0, hi = 4000;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (knockbackRemainingPx(units, mid, curve) > 0) lo = mid; else hi = mid; }
  return hi;
}

/** How far (plan units) the victim has slid `ms` after the freeze let go. */
function skidTravelled(cue: NativeCityImpactCue, units: number, ms: number): number {
  return ms <= 0 ? 0 : units - knockbackRemainingPx(units, ms, nativeCityKnockbackCurve(cue.stepUnits));
}

/** When (ms after the release) the slide passed `distance` — bisection on the monotonic slide. */
function skidPassedMs(cue: NativeCityImpactCue, units: number, distance: number, stopMs: number): number {
  let lo = 0, hi = stopMs;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (skidTravelled(cue, units, mid) < distance) lo = mid; else hi = mid; }
  return hi;
}

function rotate(points: number[], angle: number, cx: number, cy: number): number[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!, y = points[i + 1]!;
    points[i] = cx + x * c - y * s;
    points[i + 1] = cy + x * s + y * c;
  }
  return points;
}

/**
 * 바닥 위 고리 띠(평면 원 두 개 사이)를 `from`..`to` 호로. 반 바퀴를 넘으면 단순 다각형 둘로 나눈다(채우기가 구멍을 안다).
 * `thickness(u)` 는 호 비율 u 에서의 띠 두께(평면 단위).
 */
export function nativeCityGroundBand(center: CityPoint, radius: number, thickness: (u: number) => number, project: NativeCityFxProject,
  from = 0, to = Math.PI * 2, steps = 28): number[][] {
  const span = to - from, parts = Math.max(1, Math.ceil(Math.abs(span) / Math.PI - 1e-9));
  const out: number[][] = [];
  for (let part = 0; part < parts; part++) {
    const a0 = from + span * part / parts, a1 = from + span * (part + 1) / parts, n = Math.max(2, Math.ceil(steps / parts));
    const outer: number[] = [], inner: number[] = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, a = a0 + (a1 - a0) * k, u = (part + k) / parts;
      const th = Math.max(0, thickness(u)), r0 = radius + th / 2, r1 = Math.max(0, radius - th / 2);
      const [ox, oy] = project([center[0] + Math.cos(a) * r0, center[1] + Math.sin(a) * r0]);
      const [ix, iy] = project([center[0] + Math.cos(a) * r1, center[1] + Math.sin(a) * r1]);
      outer.push(ox, oy); inner.push(ix, iy);
    }
    for (let i = inner.length - 2; i >= 0; i -= 2) outer.push(inner[i]!, inner[i + 1]!);
    out.push(outer);
  }
  return out;
}

/** 바닥 위 꽉 찬 원(평면) — 투영된 타원. */
export function nativeCityGroundDisc(center: CityPoint, radius: number, project: NativeCityFxProject, steps = 28): number[] {
  const points: number[] = [];
  for (let i = 0; i < steps; i++) {
    const a = Math.PI * 2 * i / steps;
    const [x, y] = project([center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius]);
    points.push(x, y);
  }
  return points;
}

function screenAngle(cue: NativeCityImpactCue, project: NativeCityFxProject): number {
  const [x0, y0] = project(cue.victim);
  const [x1, y1] = project([cue.victim[0] + cue.direction[0], cue.victim[1] + cue.direction[1]]);
  return Math.hypot(x1 - x0, y1 - y0) < 1e-6 ? 0 : Math.atan2(y1 - y0, x1 - x0);
}

/**
 * The ink under a code crescent (`fx.inkStroke`): the same arc, its band `thickness`× as thick and grown so the ink shows evenly on
 * both edges — the drawn star's line, under the colour. Rotated by `angle` about (`ox`, `oy`) like the crescent it sits under.
 */
function inkCrescent(layer: FxPrim[], rx: number, ry: number, from: number, to: number, th: number, steps: number, angle: number, ox: number,
  oy: number, alpha: number, t: NativeCityFxTuning): void {
  const k = t.inkStroke.thickness, grow = th * (k - 1) / 2, squash = ry / Math.max(1e-6, rx);
  pushFxPoly(layer, rotate(crescentPoints(0, 0, rx + grow, ry + grow * squash, from, to, th * k, steps, 0.5), angle, ox, oy), C.ink, alpha * t.inkStroke.alpha);
}

/** The ink under a code comet: the head `thickness`× as wide (the ink rims it) and the tail a little longer. */
function inkComet(layer: FxPrim[], hx: number, hy: number, angle: number, length: number, width: number, alpha: number, t: NativeCityFxTuning): void {
  const k = t.inkStroke.thickness;
  pushFxPoly(layer, cometPoints(hx, hy, angle, length + width * (k - 1) / 2, width * k), C.ink, alpha * t.inkStroke.alpha);
}

function drawImpact(cue: NativeCityImpactCue, age: number, screenAge: number, project: NativeCityFxProject, out: NativeCityFxLayers,
  t: NativeCityFxTuning, art: NativeCityFxArt): void {
  if (cue.netted || cue.squeezed) return;
  const rank = combatImpactRank(cue.tier), body = cue.bodyPx, k = Math.max(0.2, cue.scale), armored = cue.armored;
  const angle = screenAngle(cue, project);
  // The burst sits back from the victim's centre toward the attacker, where fist meets body (`contactInset`).
  const [fx, fy] = project(cue.victim), cx = fx - Math.cos(angle) * (cue.contactInset ?? t.contactInset) * body, cy = fy - cue.contactHeight * body;
  if (nativeCityComicContact(cue) && art.comicContact) {
    // The ink silhouette is normal-blended raster. Only the short emission uses additive light;
    // the longer fragments and grounded tail have their own clocks, even during the contact hold.
    const u = screenAge / BALL_SMASH_FX.contactLightMs;
    if (u >= 0 && u < 1 && !cue.dustOnly && cue.emphasis !== false) {
      out.burst.push({ kind: "light", x: cx, y: cy, radius: body * .22 * (.65 + .35 * u), squash: .85,
        color: PALETTE.combatNeonYellow, alpha: .32 * (1 - u) ** 2 });
    }
    return;
  }
  const rng = fxRng(cue.seed);
  const finale = rank >= 3;

  // ── ground under the victim's feet: a squashed warm glow, and a two-tone dust ring kicked toward the push from the moment
  // the freeze lets go (it grows with the knockback) ──
  const glow = t.groundGlow, g = age / glow.lifeMs;
  if (g < 1 && !cue.dustOnly && !cue.guarded && !cue.reducedMotion && rank >= 1) {
    out.ground.push({ kind: "light", x: fx, y: fy, radius: glow.radius * body * k * (0.75 + 0.35 * easeOut(g)), squash: glow.squash,
      color: C.glow, alpha: (armored ? 0.12 : 0.26) * (1 - g) ** 2 });
  }
  {
    const ring = t.dustRing, u = (age - (cue.freezeMs ?? 0) * COMBAT_FX_FREEZE_RATE) / ring.lifeMs;
    if (u > 0 && u < 1 && !cue.guarded && !cue.reducedMotion && !armored && (rank >= 1 || cue.dustOnly)) {
      const size = rank >= 1 ? 1 : 0.65;
      const radius = (ring.radiusStrides + (ring.growToStrides - ring.radiusStrides) * easeOut(u)) * cue.stepUnits * Math.sqrt(k) * size;
      const band = ring.bandStrides * cue.stepUnits * (1 - 0.6 * u) * size * (armored ? 0.6 : 1);
      const push = Math.atan2(cue.direction[1], cue.direction[0]);
      const shape = (w: number) => 0.3 + 0.7 * Math.cos(Math.PI * (w - 0.5)) ** 2;
      // Thick on the side he is pushed toward, thin toward the attacker; the stone shadow sits just outside the paper-light crest.
      for (const points of nativeCityGroundBand(cue.victim, radius * 1.06, w => band * shape(w), project, push - Math.PI, push + Math.PI)) {
        pushFxPoly(out.ground, points, C.dustShade, 0.42 * (1 - u) ** 1.5);
      }
      for (const points of nativeCityGroundBand(cue.victim, radius * 0.94, w => band * 0.7 * shape(w), project, push - Math.PI, push + Math.PI)) {
        pushFxPoly(out.ground, points, C.dust, 0.6 * (1 - u) ** 1.5);
      }
    }
  }
  if (cue.dustOnly) return;
  // Receiver-bound sequences follow the real root; the old estimated skid is only a fallback without an identity.
  if (!cue.reducedMotion && !cue.victimId) drawSkid(cue, age - (cue.freezeMs ?? 0) * COMBAT_FX_FREEZE_RATE, project, out, t);

  if (cue.weaponKind === "blunt" || cue.weaponKind === "sharp") {
    out.burst.push(...nativeCityWeaponContactPrims(cue.weaponKind, { x: cx, y: cy, angle, bodyPx: body, scale: k,
      ageMs: screenAge, freezeMs: cue.freezeMs ?? 0, rank, armored, guarded: cue.guarded === true, reduced: cue.reducedMotion === true }));
    return;
  }

  // All clean fist contacts share one contour family, independent of actor and encounter.
  if (!armored && !cue.guarded) {
    out.burst.push(...duelComicImpactPrims(comicKindOfRank(rank), { x: cx, y: cy, angle, bodyPx: body,
      scale: k * (cue.emphasis === false ? .72 : 1),
      ageMs: screenAge, freezeMs: cue.freezeMs ?? 0, reduced: cue.reducedMotion === true, seed: cue.seed }));
    return;
  }

  // ── 1. core: the contact frame at 1.0r, the next at 1.3r, then it fades (screen time — it pops even inside the freeze) ──
  const core = t.core;
  // The bright centre must explain the whole contact stop, including when the raster star is still loading.
  const coreHoldMs = rank >= 1 && !armored && !cue.guarded ? Math.max(core.holdMs, cue.freezeMs ?? 0) : core.holdMs;
  const coreFade = clamp01((screenAge - coreHoldMs) / Math.max(1, core.fadeMs));
  if (screenAge < coreHoldMs + core.fadeMs) {
    const on = 1 - coreFade, grow = screenAge < 16 ? 1 : 1.3;
    const r = core.radius * body * k * (armored ? 0.6 : 1) * grow * (1 - 0.4 * coreFade);
    const white = finale && screenAge < t.flash.whiteMs;
    const color = white ? C.white : armored ? C.armoredHot : C.core;
    // A tight additive bloom (`core.alpha` — low: additive gold on the pale paving and skin washes out, the drawn star carries the hit)
    // and a gold star (normal blend), with a small additive centre. White is the break's and the KO's only.
    out.burst.push({ kind: "light", x: cx, y: cy, radius: r * 1.3, color, alpha: (armored ? core.armoredAlpha : finale ? core.finaleAlpha : core.alpha) * on });
    if (rank >= 1 && !armored && !cue.guarded) {
      pushFxPoly(out.burst, sparklePoints(cx, cy, r * 1.3, r * 0.82, 0.16, angle + Math.PI / 4), C.ink, on);
    }
    pushFxPoly(out.burst, sparklePoints(cx, cy, r * 1.15, r * 0.7, 0.16, angle + Math.PI / 4), white ? color : armored ? C.armored : C.sparkEdge, on);
    if (!white && !armored) pushFxPoly(out.burst, sparklePoints(cx, cy, r * 0.6, r * 0.38, 0.16, angle + Math.PI / 4), C.core, (finale ? 1 : 0.45) * on, true);
  }

  if (cue.reducedMotion) return;

  // The pressure front leaves only when the contact releases. Its split centre leaves the fist and face readable, and its
  // body-relative size and projected direction follow any receiver / camera. Armour and quiet contacts have no second accent.
  const shock = t.aftershock, releaseAge = screenAge - (cue.freezeMs ?? 0), su = releaseAge / Math.max(1, shock.lifeMs);
  if (rank >= 1 && !armored && cue.emphasis !== false && shock.lifeMs > 0 && su > 0 && su < 1) {
    const e = easeOut(su), r = (shock.radius + (shock.growTo - shock.radius) * e) * body * Math.sqrt(k);
    const travel = shock.travel * body * e, ox = cx + Math.cos(angle) * travel, oy = cy + Math.sin(angle) * travel;
    const th = shock.thickness * body * (1 - 0.8 * su), alpha = shock.alpha * (1 - su) ** 1.5;
    for (const [from, to] of [[-1.35, -0.22], [0.22, 1.35]] as const) {
      inkCrescent(out.burst, r * 0.48, r, from, to, th, 14, angle, ox, oy, alpha, t);
      pushFxPoly(out.burst, rotate(crescentPoints(0, 0, r * 0.48, r, from, to, th, 14, 0.5), angle, ox, oy), C.streak, alpha);
      pushFxPoly(out.burst, rotate(crescentPoints(0, 0, r * 0.47, r * 0.98, from, to, th * 0.38, 14, 0.5), angle, ox, oy), C.core, alpha);
    }
  }

  // ── 2. Needle sparks clear on screen time, even during a freeze: each jab reads as a separate snap. ──
  const sparks = t.sparks, sp = screenAge / (sparks.lifeMs * (rank === 0 ? 0.7 : 1));
  if (sp < 1) {
    const count = Math.max(1, Math.round((sparks.count[cue.tier] ?? 3) * (armored ? 0.67 : 1)));
    const spread = sparks.spreadDeg * Math.PI / 180;
    for (let i = 0; i < count; i++) {
      const lane = count === 1 ? 0 : i / (count - 1) - 0.5;
      const a = angle + lane * 2 * spread + (rng() - 0.5) * 0.3, speed = 0.7 + 0.6 * rng(), delay = rng() * 0.12;
      const u = clamp01((sp - delay) / (1 - delay));
      if (u <= 0 || u >= 1) continue;
      const travel = sparks.travel * body * k * speed * easeOut(u);
      const r = sparks.radius * body * k * (1 - 0.45 * u) * (0.8 + 0.4 * rng());
      const th = sparks.thickness * body * k * (1 - 0.65 * u);
      const hx = cx + Math.cos(a) * travel, hy = cy + Math.sin(a) * travel;
      const alpha = (armored ? 0.6 : 0.95) * (1 - u ** 2);
      inkComet(out.burst, hx, hy, a, r, th, alpha, t);
      pushFxPoly(out.burst, cometPoints(hx, hy, a, r, th), armored ? C.armoredDeep : C.streakTail, alpha);
      pushFxPoly(out.burst, cometPoints(hx, hy, a, r * 0.85, th * 0.4), armored ? C.armoredHot : C.sparkCore, alpha);
    }
  }
  // Heavy and up: comet streaks.
  if (rank >= 1 && !armored) {
    // The heavy contact fans out at once, locks with the bodies, then clears quickly after its own freeze.
    // Thin strokes reach beyond the victim without filling the space where the fist / heel meets him.
    const comets = t.comets, c = Math.max(0, screenAge - (cue.freezeMs ?? 0)) / comets.lifeMs;
    if (c < 1) {
      // Independent of live spark count: disappearing sparks must not change the held fan's shape.
      const strokeRng = fxRng(cue.seed ^ 0x51f15e);
      const count = Math.max(1, Math.round(comets.count + (finale ? 2 : 0)));
      for (let i = 0; i < count; i++) {
        const lane = (count === 1 ? 0 : (i / (count - 1) - 0.5)) * 1.15;
        const a = angle + lane, snap = 0.8 + 0.2 * clamp01(screenAge / 24);
        const length = comets.length * body * k * snap * (0.8 + 0.2 * strokeRng()) * (cue.emphasis === false ? 0.65 : 1);
        const travel = comets.travel * body * k * c;
        // The wide base is at the contact and the tapered tip points out along the blow.
        const hx = cx + Math.cos(a) * travel, hy = cy + Math.sin(a) * travel;
        const width = comets.width * body * k * (1 - 0.75 * c), alpha = 0.95 * (1 - c) ** 1.4;
        inkComet(out.burst, hx, hy, a + Math.PI, length, width, alpha, t);
        pushFxPoly(out.burst, cometPoints(hx, hy, a + Math.PI, length, width), C.streakTail, alpha);
        pushFxPoly(out.burst, cometPoints(hx, hy, a + Math.PI, length * 0.96, width * 0.4), C.streak, alpha);
      }
    }
  }

  // ── 3. debris: dust and ember flecks thrown along the blow on a short arc (up `lift`, back down), a stone shadow under a
  // paper-light speck, every third one an ember crescent ──
  const debris = t.debris, du = age / debris.lifeMs;
  if (du < 1 && !armored) {
    const count = Math.max(0, Math.round(debris.count[cue.tier] ?? 0)), spread = debris.spreadDeg * Math.PI / 180;
    for (let i = 0; i < count; i++) {
      const a = angle + (rng() - 0.5) * 2 * spread, speed = 0.6 + 0.6 * rng(), delay = rng() * 0.1, grow = 0.7 + 0.6 * rng();
      const u = clamp01((du - delay) / (1 - delay));
      if (u <= 0 || u >= 1) continue;
      const reach = debris.travel * body * k * speed * easeOut(u), lift = debris.lift * body * k * 4 * u * (1 - u) * speed;
      const x = cx + Math.cos(a) * reach, y = cy + Math.sin(a) * reach - lift, r = debris.size * body * k * grow * (1 - 0.4 * u);
      const fade = (1 - u) ** 1.4;
      if (i % 3 === 2) {
        inkCrescent(out.burst, r * 1.4, r, -0.9, 0.9, r * 0.7, 10, a, x, y, 0.9 * fade, t);
        pushFxPoly(out.burst, rotate(crescentPoints(0, 0, r * 1.4, r, -0.9, 0.9, r * 0.7, 10, 0.5), a, x, y), C.streakTail, 0.9 * fade);
      } else {
        pushFxPoly(out.burst, ellipsePoints(x, y, r, r * 0.75, 10), C.dustShade, 0.7 * fade);
        pushFxPoly(out.burst, ellipsePoints(x - r * 0.2, y - r * 0.25, r * 0.65, r * 0.5, 10), C.dust, 0.85 * fade);
      }
    }
  }

  // ── break and KO: the only white fill — a concave star and a white bloom for whiteMs, then they cool to gold ──
  if (finale) {
    const flash = t.flash, u = age / flash.lifeMs;
    if (u < 1) {
      const white = screenAge < flash.whiteMs;
      const r = flash.radius * body * k * (0.85 + 0.4 * easeOut(u));
      pushFxPoly(out.burst, sparklePoints(cx, cy, r * 1.15, r * 0.85, 0.16, angle), white ? C.white : C.sparkEdge, white ? 1 : 0.85 * (1 - u) ** 2);
      out.burst.push({ kind: "light", x: cx, y: cy, radius: r * 1.3, color: white ? C.white : C.sparkCore, alpha: 0.75 * (1 - u) ** 2 });
    }
  }
}

/**
 * The victim's skid (`since` = effect ms since the freeze let go): soft dust puffs left behind every `puffEveryStrides` as his feet
 * pass, rising a little and fading over `puffLifeMs`, and a scuff ribbon on the paving from where he stood to where he is now.
 */
function drawSkid(cue: NativeCityImpactCue, since: number, project: NativeCityFxProject, out: NativeCityFxLayers, t: NativeCityFxTuning): void {
  const units = skidUnits(cue, t), s = t.skid;
  if (!(units > 0) || since <= 0) return;
  const stopMs = skidStopMs(cue), done = skidTravelled(cue, units, Math.min(since, stopMs));
  const length = Math.hypot(cue.direction[0], cue.direction[1]);
  if (!(length > 1e-9) || done <= 1e-6) return;
  const dir: CityPoint = [cue.direction[0] / length, cue.direction[1] / length];
  const at = (d: number): CityPoint => [cue.victim[0] + dir[0] * d, cue.victim[1] + dir[1] * d];
  const [ox, oy] = project(cue.victim), [ex, ey] = project(at(cue.stepUnits));
  const pxPerUnit = Math.hypot(ex - ox, ey - oy) / Math.max(1e-6, cue.stepUnits);
  // The scuff: a thin ribbon behind his feet, widest where he started, fading once he stopped.
  const scuffFade = since <= stopMs ? 1 : 1 - (since - stopMs) / Math.max(1, s.scuffLifeMs);
  if (scuffFade > 0) {
    const spine = sampleSpine(10, u => project(at(done * u)));
    const width = s.scuffWidthStrides * cue.stepUnits * pxPerUnit;
    pushFxPoly(out.ground, ribbonPoints(spine, u => width * (1 - 0.6 * u) * taper(u, 0.15)), C.dustShade, s.scuffAlpha * scuffFade);
  }
  const every = Math.max(1e-6, s.puffEveryStrides * cue.stepUnits), body = cue.bodyPx;
  for (let i = 0; i < 24 && i * every <= done; i++) {
    const d = i * every, born = skidPassedMs(cue, units, d, stopMs), u = (since - born) / Math.max(1, s.puffLifeMs);
    if (u < 0 || u >= 1) continue;
    const [x, y] = project(at(d)), r = s.puffRadius * body * (0.6 + 0.9 * easeOut(u)) * (1 - 0.35 * d / units);
    const lift = s.rise * body * easeOut(u), fade = (1 - u) ** 1.5;
    pushFxPoly(out.ground, ellipsePoints(x, y - lift - r * 0.3, r, r * 0.5, 12), C.dustShade, s.shadeAlpha * fade);
    pushFxPoly(out.ground, ellipsePoints(x - r * 0.15, y - lift - r * 0.55, r * 0.7, r * 0.36, 12), C.dustBright, s.brightAlpha * fade);
  }
}

function drawSlam(cue: NativeCitySlamGroundCue, age: number, project: NativeCityFxProject, out: NativeCityFxLayers, t: NativeCityFxTuning,
  aura: NativeCityAuraTuning): void {
  // The charge collapses: the flames on both sides lie down flat on the ground and slide into the struck spot, shrinking to nothing.
  const collapse = cue.noAura ? 1 : age / Math.max(1, aura.collapseMs);
  if (collapse < 1) {
    const [x, y] = project(cue.feet), [ix, iy] = project(cue.center), e = easeOut(collapse);
    const halfW = 0.5 * aura.silhouette.width * cue.bodyPx, height = aura.silhouette.height * cue.bodyPx;
    for (const side of [-1, 1]) {
      const sx = x + side * halfW * (1 - e) + (ix - x) * e, sy = y + (iy - y) * e;
      const rx = 0.45 * halfW * (1 - 0.6 * e), ry = 0.5 * height * 0.35 * (1 - e), th = 0.05 * cue.bodyPx * (1 - 0.6 * e);
      if (ry < 0.5) continue;
      const from = side < 0 ? Math.PI : 0, to = from + side * Math.PI;
      pushFxPoly(out.ground, crescentPoints(sx, sy, rx, ry, from, to, th, 12, 0.5), C.auraEmber, 0.85 * (1 - collapse));
      pushFxPoly(out.ground, crescentPoints(sx, sy, rx * 0.95, ry * 0.95, from, to, th * 0.45, 12, 0.5), C.flashFlat, 0.85 * (1 - collapse));
    }
  }
  // The struck paving: a flat hot-gold flash for two frames (normal blend — an additive glow on the pale stone reads white).
  if (age < aura.collapseFlash.ms) {
    pushFxPoly(out.ground, nativeCityGroundDisc(cue.center, aura.collapseFlash.radiusStrides * cue.stepUnits, project, 24), C.flashFlat,
      0.8 * (1 - age / aura.collapseFlash.ms));
  }
  // Two shockwave bands, the second a beat later and smaller: a stone shadow under a crest that starts bright and turns to dust.
  const wave = t.shockwave;
  for (const [delay, reach, alpha] of [[0, 1, 0.8], [wave.secondDelayMs, 0.72, 0.5]] as const) {
    const u = (age - delay) / wave.lifeMs;
    if (u < 0 || u >= 1) continue;
    const radius = (wave.radiusStrides + (wave.growToStrides * reach - wave.radiusStrides) * easeOut(u)) * cue.stepUnits;
    const band = wave.bandStrides * cue.stepUnits * (1 - 0.75 * u);
    const wobble = (w: number) => 0.6 + 0.4 * Math.sin(Math.PI * 4 * w) ** 2;
    for (const points of nativeCityGroundBand(cue.center, radius + band * 0.25, w => band * wobble(w), project)) {
      pushFxPoly(out.ground, points, C.dustShade, 0.5 * alpha * (1 - u) ** 1.3);
    }
    for (const points of nativeCityGroundBand(cue.center, radius - band * 0.2, w => band * 0.55 * wobble(w), project)) {
      pushFxPoly(out.ground, points, u < wave.brightShare ? C.shockBright : C.dust, alpha * (1 - u) ** 1.3);
    }
  }
  // Dust puffs: soft blobs rolling out and rising — a faint stone shadow under a sunlit top.
  const puffs = t.dustPuffs, rng = fxRng(cue.seed);
  for (let i = 0; i < puffs.count; i++) {
    const a = Math.PI * 2 * (i + rng() * 0.6) / puffs.count, speed = 0.65 + 0.5 * rng(), lag = rng() * 60, grow = 0.8 + 0.4 * rng();
    const u = (age - lag) / puffs.lifeMs;
    if (u < 0 || u >= 1) continue;
    const reach = puffs.spreadStrides * cue.stepUnits * speed * easeOut(u);
    const [x, y] = project([cue.center[0] + Math.cos(a) * reach, cue.center[1] + Math.sin(a) * reach]);
    const r = puffs.radius * cue.bodyPx * (0.6 + 1.8 * easeOut(u)) * grow;
    const lift = puffs.rise * cue.bodyPx * smoothstep(0, 1, u), fade = (1 - u) ** 1.6;
    pushFxPoly(out.ground, ellipsePoints(x, y - lift - r * 0.35, r, r * puffs.yRatio, 14), C.dustShade, puffs.shadeAlpha * fade);
    pushFxPoly(out.ground, ellipsePoints(x - r * 0.15, y - lift - r * 0.35 - r * 0.4, r * 0.72, r * puffs.yRatio * 0.72, 14), C.dustBright,
      puffs.brightAlpha * fade);
  }
}

/**
 * 살아 있는 요소를 두 층 도형으로 푼다. `nowMs` 는 효과 시계(히트스톱 동안 반속), `screenMs` 는 화면 시계 — 접촉 심·흰 섬광은
 * 화면 시계라 멈춤 안에서도 1–2 프레임만 밝다.
 */
export function drawNativeCityCombatFx(elements: readonly NativeCityFxElement[], nowMs: number, project: NativeCityFxProject,
  screenMs = nowMs, t: NativeCityFxTuning = NATIVE_CITY_COMBAT.feel.fx, aura: NativeCityAuraTuning = NATIVE_CITY_COMBAT.feel.aura,
  art: NativeCityFxArt = ART_READY): NativeCityFxLayers {
  const out: NativeCityFxLayers = { ground: [], burst: [] };
  for (const element of elements) {
    const age = nowMs - element.bornMs;
    if (age < 0 || age >= nativeCityFxLifeMs(element, t, aura)) continue;
    const local: NativeCityFxLayers = { ground: out.ground, burst: [] };
    if (element.kind === "impact") drawImpact(element.cue, age, Math.max(0, screenMs - element.bornScreenMs), project, local, t, art);
    else if (element.kind === "exchange") {
      if (nativeCityExchangeDrawnByArt(element.cue, art)) continue;
      const layers = nativeCityExchangeOnGround(element.cue.kind) ? { ground: out.ground, burst: out.ground } : local;
      drawNativeCityExchangeFx(element.cue, age, Math.max(0, screenMs - element.bornScreenMs), project, layers);
    } else if (nativeCityComicGroundSlam(element.cue)) {
      // The atlas renderer owns this ground strike, as well as the receiver's later landing.
    } else drawSlam(element.cue, age, project, local, t, aura);
    const contact = nativeCityComicArtCommand(element, screenMs, project);
    // A loaded cel owns the complete contact silhouette and chips. Its light is the light layer's (`HypeImpactView`, drawn with the cel):
    // the stand-in's warm additive glow stays only under a cel with no light layer — a tell's glint, whose warm light is its one light
    // (2026-10-18 — under a hit cel it doubled the light layer's core; one owner per beat).
    if (!(contact && art.contacts?.[contact.kind])) out.burst.push(...local.burst);
    else if (!duelComicArtHasLight(contact.kind)) out.burst.push(...local.burst.filter(p => p.kind === "light"));
  }
  return out;
}

/**
 * 내려찍기 예고: 주먹이 떨어질 바닥의 옅은 위험색 타원. 정점 유지 동안 `startScale` 에서 실제 크기로 자라며 짙어지고, 안쪽
 * 고리가 가운데로 조여 들어 접촉 순간 닿는다("지금"). 곡선뿐이다.
 */
export function nativeCitySlamTelegraphPrims(telegraph: NativeCitySlamTelegraph, stepUnits: number, project: NativeCityFxProject,
  t: NativeCityFxTuning = NATIVE_CITY_COMBAT.feel.fx): FxPrim[] {
  const p = clamp01(telegraph.progress), spec = t.telegraph;
  if (!(telegraph.radius > 0)) return [];
  const radius = telegraph.radius * (spec.startScale + (1 - spec.startScale) * smoothstep(0, 1, p));
  const prims: FxPrim[] = [];
  pushFxPoly(prims, nativeCityGroundDisc(telegraph.center, radius, project), C.telegraphEdge, spec.fillAlpha * (0.3 + 0.7 * p));
  const band = spec.bandStrides * stepUnits * (0.6 + 0.6 * p);
  for (const points of nativeCityGroundBand(telegraph.center, radius, w => band * (0.5 + 0.5 * Math.sin(Math.PI * 2 * w) ** 2), project)) {
    pushFxPoly(prims, points, C.telegraphEdge, spec.edgeAlpha * Math.sqrt(p));
  }
  // An inner ring closing on the centre: it meets it at the impact.
  const inner = radius * (1 - smoothstep(0, 1, p)) * 0.85;
  if (inner > band) {
    for (const points of nativeCityGroundBand(telegraph.center, inner, () => band * 0.6, project)) {
      pushFxPoly(prims, points, C.telegraphFill, spec.edgeAlpha * 0.7 * p);
    }
  }
  return prims;
}

/**
 * 기 모으기 세기(0..1): 예비 동안 `windupShare` 까지, 정점 유지 동안 `rampPower` 곡선으로 정점까지 — 접촉 직전이 가장
 * 세다("지금 온다"). 콤보 예비는 `comboPeak` 로 옅다. 첫 접촉 뒤는 0(무너짐은 충격파 요소가 그린다).
 */
export function nativeCityKumaAuraIntensity(action: NativeCityKumaActionKind, modeMs: number, apexMs: number, impactMs: number,
  aura: NativeCityAuraTuning = NATIVE_CITY_COMBAT.feel.aura): number {
  if (!(impactMs > 0) || modeMs >= impactMs || modeMs < 0) return 0;
  // The red grab glows from its first frame (its whole windup is the tell — unarmoured, cut it), swelling to `grabPeak`.
  if (action === "grab") return aura.grabPeak * (0.55 + 0.45 * smoothstep(0, impactMs, modeMs));
  // Every other windup shows its grade's colour from its first frame too (`onsetFloor`, 2026-10-14 fun audit — a ramp from 0 hid it
  // for most of a short windup), then swells as before.
  if (action !== "slam") return Math.max(aura.onsetFloor, aura.comboPeak * smoothstep(0, impactMs, modeMs));
  const apex = Math.max(1, Math.min(apexMs, impactMs - 1));
  if (modeMs < apex) return Math.max(aura.onsetFloor, aura.slamPeak * aura.windupShare * smoothstep(0, apex, modeMs));
  return Math.max(aura.onsetFloor,
    aura.slamPeak * (aura.windupShare + (1 - aura.windupShare) * clamp01((modeMs - apex) / (impactMs - apex)) ** aura.rampPower));
}

/**
 * 쿠마 기 모으기: 실루엣 양쪽 가장자리를 타고 오르는 불꽃 혀(곡선 리본, 바깥 WARM[3]→WARM[4]·안쪽 WARM[2]→WARM[1] 을 세기로
 * 섞은 불씨 가족)와 튀어 오르는 불티, 몸 위의 부드러운 테 빛, 발밑의 부드러운 타원 세 겹. 세기는 정점 유지 끝에서 몰아 오르고
 * (`rampPower`), 접촉 직전 `tempo.kuma.inhaleMs` 동안 불꽃이 안으로 빨려 들며 테가 밝아진다("지금"). 상대 쪽 불꽃은 옅다. 모션 감소면
 * 불꽃·맥박 없이 고요한 빛만. 형태는 보통 합성, 가산은 가는 안쪽 심만. `back` 은 그의 몸 바로 뒤 층, `ground` 는 바닥.
 */
export function nativeCityKumaAuraPrims(state: NativeCityKumaAura, project: NativeCityFxProject,
  aura: NativeCityAuraTuning = NATIVE_CITY_COMBAT.feel.aura): { readonly ground: FxPrim[]; readonly back: FxPrim[] } {
  const ground: FxPrim[] = [], back: FxPrim[] = [];
  const i = clamp01(state.intensity);
  if (i <= 0.01) return { ground, back };
  const body = state.bodyPx, [fx, fy] = project(state.feet);
  const reduced = state.reducedMotion, t = Math.max(0, state.timeMs), T = Math.max(1, state.impactMs);
  // The inhale ("now" — the parry's cue): the rim brightens, and with motion the silhouette draws in too. Under reduced motion the rim
  // steps up further instead (`inhale.reducedRimAlpha`, one still step, no pulse) — the cue stays without the motion (2026-10-15).
  const now = T - t <= NATIVE_CITY_COMBAT.tempo.kuma.inhaleMs, inhale = !reduced && now;
  const halfW = 0.5 * aura.silhouette.width * body * (inhale ? aura.inhale.widthScale : 1), height = aura.silhouette.height * body;
  const cy = fy - 0.5 * height;
  const [f0, f1] = aura.pulseHz;
  // Phase of a pulse whose rate climbs from f0 to f1 with (t / T)²: its integral, so the beat never jumps.
  const phase = 2 * Math.PI / 1000 * (f0 * t + (f1 - f0) * t ** 3 / (3 * T * T));
  const pulse = reduced ? 1 : 0.7 + 0.3 * Math.sin(phase);
  // The triangle's colour (`NativeCityKumaGrade`; gold = the ember ramp it always had).
  const tint = nativeCityKumaGradeColors(state.grade);
  const outer = mixColor(tint.outer[0], tint.outer[1], i), inner = mixColor(tint.inner[0], tint.inner[1], i);
  const opponentSide = state.opponent ? Math.sign(project(state.opponent)[0] - fx) : 0;
  const q = now ? 1 : clamp01(state.quiet ?? 1);

  const g = aura.groundGlow, gr = g.radius * body * (0.75 + 0.35 * i);
  for (const scale of [1, 0.7, 0.45]) {
    pushFxPoly(ground, ellipsePoints(fx, fy, gr * scale, gr * scale * g.squash, 24), outer, g.alpha * i * q * (reduced ? 1 : 0.8 + 0.2 * pulse));
  }
  back.push({ kind: "light", x: fx, y: cy, radius: halfW * 1.6, squash: 1.7, color: inner,
    alpha: (now ? reduced ? aura.inhale.reducedRimAlpha : aura.inhale.rimAlpha : aura.rimGlow.alpha) * i * q * pulse });
  if (reduced) return { ground, back };

  // Flame tongues climbing both edges of his silhouette, curling as they rise.
  const f = aura.flames, rise = (f.riseHz[0] + (f.riseHz[1] - f.riseHz[0]) * i) * t / 1000;
  const edge = (h: number) => halfW * Math.sqrt(Math.max(0.05, 1 - ((h - 0.5 * height) / (0.6 * height)) ** 2)) + 0.03 * body;
  for (let n = 0; n < f.count; n++) {
    const side = n % 2 === 0 ? -1 : 1, climb = fract(rise + n / f.count * 0.9 + (side > 0 ? 0.13 : 0));
    const fade = Math.sin(Math.PI * climb) * (side === opponentSide ? f.opponentSideAlpha : 1);
    if (fade <= 0.03) continue;
    const base = climb * height * 0.8, length = f.length * body * (0.6 + 0.5 * i), wobble = phase * 0.35 + n * 1.9;
    const spine = sampleSpine(10, s => {
      const h = Math.min(height * 1.05, base + s * length);
      return [fx + side * (edge(h) + f.curl * body * Math.sin(Math.PI * 1.4 * s + wobble) - 0.05 * body * s * s), fy - h];
    });
    const width = f.width * body * (0.55 + 0.6 * i);
    pushFxPoly(back, ribbonPoints(spine, u => width * taper(u, 0.28)), outer, 0.85 * i * q * fade);
    pushFxPoly(back, ribbonPoints(spine, u => width * 0.42 * taper(u, 0.28)), inner, f.innerAlpha * i * q * fade, true);
  }
  // Embers: small crescents flicked up off his edges.
  const e = aura.embers;
  for (let n = 0; n < e.count; n++) {
    const side = n % 2 === 0 ? 1 : -1, climb = fract(e.riseHz * (0.6 + 0.6 * i) * t / 1000 + n / e.count);
    const h = climb * height * 1.1, x = fx + side * (edge(Math.min(h, height)) + 0.06 * body * climb), y = fy - h;
    const r = e.size * body * (1 - 0.5 * climb);
    pushFxPoly(back, crescentPoints(x, y, r, r * 1.4, -Math.PI * 0.8, -Math.PI * 0.2, r * 0.6, 8, 0.5), climb > 0.5 ? outer : inner,
      0.85 * i * q * Math.sin(Math.PI * climb) * (side === opponentSide ? f.opponentSideAlpha : 1));
  }
  return { ground, back };
}

/** Adds an effect; past `max` live ones (the recipes' `rules.maxConcurrentFx`, 48) the oldest gives way. */
export function pushNativeCityFxElement(elements: NativeCityFxElement[], element: NativeCityFxElement, max: number): void {
  while (elements.length >= Math.max(1, max)) elements.shift();
  elements.push(element);
}

/** Per-frame exchange state the FX view draws without an element: dizzy stars over a groggy or falling KUMA, and the rule tells. */
export interface NativeCityExchangeFrame {
  /** World px of the head the stars orbit, their recipe scale, their clock and opacity; null when none. */
  readonly dizzy: { readonly head: readonly [number, number]; readonly scale: number; readonly timeMs: number; readonly alpha: number;
    readonly reducedMotion: boolean } | null;
  /** His poise is low (`feel.tells.poise`): sweat off his head (world px), at this scale, on this clock. */
  readonly sweat?: { readonly head: readonly [number, number]; readonly scale: number; readonly timeMs: number } | null;
  /**
   * The coming move's grade badge (`feel.tells.gradeMark`, `NativeCityKumaGradeMark`): its grade, his feet and body (it stands `liftPx` over
   * the top of his body, over his name plate), its age (screen ms); null when nothing is coming.
   */
  readonly gradeMark?: { readonly grade: NativeCityKumaGrade; readonly feet: CityPoint; readonly bodyPx: number; readonly ageMs: number;
    readonly reducedMotion: boolean;
    /**
     * The keycap in the "attack now" magenta instead of its grade's colour (`PALETTE.fightAttackNow`) — the string's link window (2026-10-19
     * 신호 정리: its V keycap was the white grade's pearl one and read as a white swing coming). `grade` still picks the key it letters.
     */
    readonly attackNow?: boolean } | null;
  /**
   * The badge playing out its answer (2026-10-20, `gradeMark.resolve` — `NativeCityKumaGradeMarkOutcome`): the best answer's press, pop and
   * pearls, or a safe pass's fade, where the badge stood; `ageMs` is screen ms from the answer. Never drawn with `gradeMark` (the cues hand
   * one or the other); null when none.
   */
  readonly gradeMarkResolve?: { readonly grade: NativeCityKumaGrade; readonly feet: CityPoint; readonly bodyPx: number; readonly ageMs: number;
    readonly reducedMotion: boolean; readonly outcome: "best" | "safe";
    /** The string's link keycap: its face starts from the "attack now" magenta (and brightens to the white grade's pearl tint). */
    readonly attackNow?: boolean } | null;
  /**
   * V's counter gauge round the badge (`feel.tells.counterGauge`, `kuma.rhythm.counter`, 2026-10-18): where the badge stands (his feet and
   * body), its fill and window, the screen clock; null when none.
   */
  readonly counterGauge?: { readonly feet: CityPoint; readonly bodyPx: number; readonly fill: number; readonly open: boolean;
    /** The string's link (2026-10-19): open, the ring shows `fill` — the window left — instead of whole. */
    readonly draining?: boolean;
    readonly timeMs: number; readonly reducedMotion: boolean } | null;
}

/** Where the fight sends its effects (the scene's `NativeCityCombatFxView`; tests may record or omit it). */
export interface NativeCityCombatFxSink {
  ottoComboContact?(cue: import("./NativeCityOttoComboFx").OttoComboContactCue): void;
  ottoSlam?(cue: import("./NativeCityOttoSlamFx").NativeCityOttoSlamCue | null): void;
  clearMotion?(): void;
  heavyFlow?(frame: NativeCityHeavyFlowFrame | null): void;
  attackTrails?(frames: readonly NativeCityAttackTrailFrame[], reducedMotion?: boolean): void;
  /** Rule clock and real receiver roots after movement; holds during hitstop. */
  motionFrame?(fightDtMs: number, bodies: readonly NativeCityImpactMotionSample[]): void;
  /** Continuous attack effect; its clock and endpoints are supplied by the running swing. */
  wireNet?(frame: NativeCityWireNetFrame | null): void;
  impact(cue: NativeCityImpactCue): void;
  slamGround(cue: NativeCitySlamGroundCue): void;
  /** A traditional-exchange effect (`NativeCityExchangeFx`). Optional: older sinks (tests) ignore them. */
  exchange?(cue: NativeCityExchangeCue): void;
  /**
   * Once per frame after the fight stepped. `rate` is the effect clock's speed this frame (`COMBAT_FX_FREEZE_RATE` during a hit
   * stop, the slow-mo scale during one, else 1); `telegraph` the slam warning and `aura` KUMA's charge, or null; `exchange`
   * the dizzy stars.
   */
  frame(dtMs: number, rate: number, telegraph: NativeCitySlamTelegraph | null, aura: NativeCityKumaAura | null, stepUnits: number,
    exchange?: NativeCityExchangeFrame): void;
  /** Sprites the 3D card view stands up (the ground dust flipbooks, anchored on their ground point). */
  readonly cardObjects?: readonly Phaser.GameObjects.Sprite[];
}
