import { NATIVE_CITY_COMBAT, type NativeCityFighter, type NativeCityImpactFeelTuning, type NativeCityImpactTier } from "../../sim/cityFight/NativeCityCombatTuning";
import { clamp01 } from "../../sim/geom";
import { mixColor } from "../art/ColorMix";
import { PALETTE } from "../art/palette";
import { ROPE_FX_RAMPS } from "./RopeTraversalFx";
import { nativeCityStaccatoHold, nativeCityStaccatoHoldMs, nativeCityStaccatoTime } from "./NativeCityStaccato";



const TUNING: NativeCityImpactFeelTuning = NATIVE_CITY_COMBAT.feel.impact;
const WARM = ROPE_FX_RAMPS.warm;

/**
 * 색: 채움은 평타·강타·내려찍기 hotGold, 반격·붕괴 상아(warm[0]), KO 만 흰색. 꼬리와 가장자리 빛은 경보 빨강과 불씨 주황의 중간 —
 * 분홍도 갈색도 아닌 따뜻한 빨강.
 */
export const NATIVE_CITY_IMPACT_COLORS = Object.freeze({
  fillGold: PALETTE.hotGold,
  fillIvory: WARM[0]!,
  hurtRed: mixColor(PALETTE.alarm, WARM[3]!, 0.5),
});

/**
 * 갑옷(맞아도 움찔하지 않고 하던 동작을 이어 가는 몸 — 마을 대결 모든 파이터 공통, 2026-10-18 사용자): 외곽선은 진한 주황, 갑옷에
 * 맞은 순간은 몸이 밝게 번쩍이고 외곽선도 함께 빛난다("무적 상태라도 빛나서 맞았다는 느낌").
 */
export const NATIVE_CITY_ARMOR_COLORS = Object.freeze({
  rim: PALETTE.fightArmorRim,
  /**
   * The rim's breath (`feel.tells.armor.shimmerMs`) and the rim while a blow on the armour lights it — cold steel light (2026-10-19: the
   * warm amber / gold put the gold grade's colour back on his armour).
   */
  rimLight: PALETTE.throwSteel,
  rimLit: PALETTE.white,
  /** The body's flat flash on the blow (`feel.tells.armor.flashMs`): steel-white, the "텅!". */
  flash: PALETTE.throwSteel,
});

/**
 * The armour's outline now: deep orange breathing toward amber over `shimmerMs` (steady under reduced motion); `litMs` (screen ms since a
 * blow landed on the armour, null: none) lights it gold for twice the body's flash.
 */
export function nativeCityArmorRimColor(armorMs: number, reduced = false, litMs: number | null = null): number {
  const armor = NATIVE_CITY_COMBAT.feel.tells.armor;
  if (litMs !== null && litMs >= 0 && litMs < armor.flashMs * 2) return NATIVE_CITY_ARMOR_COLORS.rimLit;
  if (reduced) return NATIVE_CITY_ARMOR_COLORS.rim;
  const period = Math.max(1, armor.shimmerMs);
  return mixColor(NATIVE_CITY_ARMOR_COLORS.rim, NATIVE_CITY_ARMOR_COLORS.rimLight,
    (armor.shimmerShare ?? 0.35) * (0.5 - 0.5 * Math.cos(2 * Math.PI * Math.max(0, armorMs) / period)));
}

/** One blow on one body. */
export interface NativeCityImpactHit {
  readonly tier: NativeCityImpactTier;
  readonly victim: NativeCityFighter;
  /** KUMA's attack armour ate it (smaller, dull). */
  readonly armored: boolean;
  /** The hook, drawn as an uppercut (C chain segment 3): the body stretches UP instead of squashing (`squash.uppercut`). */
  readonly uppercut?: boolean;
  /** The jumping heel drop: the body is crushed flat (`squash.crush`) instead of the tier's squash. */
  readonly crush?: boolean;
  /** A drawn horizontal recoil keeps its feet and body proportions; world knockback still moves it. */
  readonly grounded?: boolean;
}

/** The victim's colour now: `fill` = Phaser `setTintFill` (flat silhouette), else a multiply `setTint`. */
export interface NativeCityImpactFlash { readonly color: number; readonly fill: boolean }

/**
 * The arena's grade of a blow on the body (2026-10-23 arena audit — b01 #8, b02 #8 / #20, b04 #81: a jab filled the whole body cream, as
 * loud as a heavy): a light blow no fill — a warm tint (`lightTint`, a quarter of the fill's gold) for `lightTintMs`, then the fade; a heavy,
 * slam or dash blow the fill for `heavyFillMs` only (one frame); the counter, break and KO as the village's. Opt in per body
 * (`NativeCityBodyFeel` `grade`).
 */
export const NATIVE_CITY_ARENA_IMPACT_GRADE = Object.freeze({
  lightTintMs: 34,
  lightTint: mixColor(PALETTE.white, NATIVE_CITY_IMPACT_COLORS.fillGold, 0.25),
  heavyFillMs: 17,
});

/** Which grade a body's blows flash in: the village fight's, or the arena's (`NATIVE_CITY_ARENA_IMPACT_GRADE`). */
export type NativeCityImpactGrade = "village" | "arena";

function fillColor(tier: NativeCityImpactTier): number {
  if (tier === "counter" || tier === "break" || tier === "ko") return NATIVE_CITY_IMPACT_COLORS.fillIvory;
  return NATIVE_CITY_IMPACT_COLORS.fillGold;
}

/**
 * 맞은 몸의 색(`screenMs` = 타격 프레임부터의 화면 ms): 처음 `fillMs` 는 평평한 채움(1–2 프레임), 그 뒤 따뜻한 빨강 곱하기가
 * `fadeStrength` 에서 (1−u)² 로 꺼진다. 채움은 흰색이 아니다(흰 심은 마무리 접촉점의 `finisherBurst` 하나뿐 — 명세 수락 기준 8). 모션 감소면 채움은 `reducedFillMs` 까지, 꼬리는 `reducedFadeScale` 배.
 */
export function nativeCityImpactFlash(hit: NativeCityImpactHit, screenMs: number, reduced = false,
  t: NativeCityImpactFeelTuning = TUNING, grade: NativeCityImpactGrade = "village"): NativeCityImpactFlash | null {
  const f = t.flash, age = Math.max(0, screenMs);
  if (hit.armored) {
    // His armour took it (`feel.tells.armor`, 2026-10-18 user: "무적 상태라도 빛나서 맞았다는 느낌"): a bright flat flash for 2-3
    // frames — the blow landed — then an armour-orange fade, never the warm hurt red: he is not hurt and goes on with his move.
    const flashMs = NATIVE_CITY_COMBAT.feel.tells.armor.flashMs;
    if (age < (reduced ? Math.min(flashMs, f.reducedFillMs) : flashMs)) return { color: NATIVE_CITY_ARMOR_COLORS.flash, fill: true };
    const u = nativeCityStaccatoTime(age - flashMs) / Math.max(1, f.fadeMs[hit.tier]);
    if (u >= 1) return null;
    const strength = f.fadeStrength[hit.tier] * f.armoredFadeScale * (reduced ? f.reducedFadeScale : 1) * (1 - u) ** 2;
    return strength > 0.004 ? { color: mixColor(PALETTE.white, NATIVE_CITY_ARMOR_COLORS.rim, strength), fill: false } : null;
  }
  const G = NATIVE_CITY_ARENA_IMPACT_GRADE, arena = grade === "arena";
  const lightTint = arena && hit.tier === "light", shortFill = arena && (hit.tier === "heavy" || hit.tier === "slam" || hit.tier === "dash");
  const ownFillMs = lightTint ? G.lightTintMs : shortFill ? G.heavyFillMs : f.fillMs[hit.tier];
  const fillMs = reduced ? Math.min(ownFillMs, f.reducedFillMs) : ownFillMs;
  if (age < fillMs) return lightTint ? { color: G.lightTint, fill: false } : { color: fillColor(hit.tier), fill: true };
  const u = nativeCityStaccatoTime(age - fillMs) / Math.max(1, f.fadeMs[hit.tier]);
  if (u >= 1) return null;
  const strength = f.fadeStrength[hit.tier] * (reduced ? f.reducedFadeScale : 1) * (1 - u) ** 2;
  return strength > 0.004 ? { color: mixColor(PALETTE.white, NATIVE_CITY_IMPACT_COLORS.hurtRed, strength), fill: false } : null;
}

/** How long the flash lasts (screen ms) — the body owns its tint until then. */
export function nativeCityImpactFlashMs(tier: NativeCityImpactTier, t: NativeCityImpactFeelTuning = TUNING): number {
  return Math.max(t.flash.fillMs[tier], NATIVE_CITY_COMBAT.feel.tells.armor.flashMs) + t.flash.fadeMs[tier];
}

/**
 * The squash's held keys (`feel.staccato.squash`, fight ms over a squash `ms` long): 1 — the full key, through the freeze and
 * `holdMs` after (a longer squash holds until one `stepMs` before its end) — then one `overshoot` step (stretched back) until `ms`,
 * then 0. No spring between them.
 */
export function nativeCityImpactSquashLevel(fightMs: number, ms: number): number {
  const st = NATIVE_CITY_COMBAT.feel.staccato, at = Math.max(0, fightMs);
  if (at >= ms) return 0;
  return at < Math.max(st.squash.holdMs, ms - st.stepMs) ? 1 : st.squash.overshoot;
}

/**
 * 맞은 몸의 눌림(`fightMs` = 싸움 시계 — 멈춤 동안 0 이라 정점을 붙든다): scaleX +x, scaleY −y 를 붙들었다가 한 칸 되늘어난 뒤
 * `ms[victim]` 에 제자리(`nativeCityImpactSquashLevel`). 쿠마는 `kumaScale` 배로 덜 눌리고 더 오래 붙든다(`ms.kuma`). 갑옷이 먹은
 * 한 방은 `armoredScale` 배. 모션 감소면 없다. 어퍼컷으로 그린 훅(`uppercut`, 갑옷 아님)은 거꾸로 위로 늘어난다: scaleX −`uppercut.x`,
 * scaleY +`uppercut.y` 를 같은 계단으로. 발뒤꿈치 내려찍기(`crush`, 갑옷 아님)는 납작하게 짓눌린다: scaleX +`crush.x`, scaleY −`crush.y`.
 */
export function nativeCityImpactSquash(hit: NativeCityImpactHit, fightMs: number, reduced = false,
  t: NativeCityImpactFeelTuning = TUNING): { readonly scaleX: number; readonly scaleY: number } {
  const s = t.squash;
  if (reduced || hit.grounded) return { scaleX: 1, scaleY: 1 };
  const spring = nativeCityImpactSquashLevel(fightMs, s.ms[hit.victim]);
  if (hit.uppercut && !hit.armored) return { scaleX: 1 - s.uppercut.x * spring, scaleY: 1 + s.uppercut.y * spring };
  // The heel drop crushes him flat (2026-10-11 `squash.crush`): the full key, not KUMA's lighter `kumaScale`.
  if (hit.crush && !hit.armored) return { scaleX: 1 + s.crush.x * spring, scaleY: 1 - s.crush.y * spring };
  const k = spring * (hit.victim === "kuma" ? s.kumaScale : 1) * (hit.armored ? s.armoredScale : 1);
  return { scaleX: 1 + s.x[hit.tier] * k, scaleY: 1 - s.y[hit.tier] * k };
}

/** The squash is over (fight ms). */
export function nativeCityImpactSquashMs(victim: NativeCityFighter, t: NativeCityImpactFeelTuning = TUNING): number {
  return t.squash.ms[victim];
}

/**
 * 강타 이상이 몸을 그림자에서 띄우는 높이(월드 px, ≥ 0): 멈춤이 풀린 첫 프레임에 꼭대기로 튀어 `hop.ms[victim]` 의
 * `staccato.hop.holdShare` 동안 붙들고 `staccato.hop.tail` 한 칸 뒤 내려앉는다(반 사인 없음). 쿠마는 `kumaScale` 배.
 * 갑옷이 먹은 한 방·모션 감소면 0.
 */
export function nativeCityImpactHop(hit: NativeCityImpactHit, fightMs: number, bodyPx: number, reduced = false,
  t: NativeCityImpactFeelTuning = TUNING): number {
  const h = t.hop, height = h.height[hit.tier], st = NATIVE_CITY_COMBAT.feel.staccato;
  if (reduced || hit.armored || hit.grounded || !(height > 0) || !(fightMs > 0)) return 0;
  const ms = Math.max(1, h.ms[hit.victim]);
  if (fightMs >= ms) return 0;
  const level = nativeCityStaccatoHold(fightMs, nativeCityStaccatoHoldMs(ms, st.hop.holdShare), st.hop.tail, st.recoverStepMs);
  return height * bodyPx * (hit.victim === "kuma" ? h.kumaScale : 1) * level;
}

/**
 * 때린 주먹의 밀어붙임(화면 px, ≥ 0, 타격 방향으로): 접촉 프레임부터 `px[tier]` 를 꽉 채운 채 멈춤 내내 굳어 있고(파고드는
 * 곡선 없음), 싸움 시계가 움직이는 첫 프레임에 끊긴다 — 되튐(`nativeCityReboundCurve`)이 그 자리를 잇는다. 모션 감소면 0.
 */
export function nativeCityFollowThroughPx(tier: NativeCityImpactTier, screenMs: number, fightMs: number, reduced = false,
  t: NativeCityImpactFeelTuning = TUNING): number {
  if (reduced || !(screenMs >= 0) || fightMs > 0) return 0;
  return t.followThrough.px[tier];
}

/**
 * The attacker's rebound after a landed blow (0..1 of its push-back): nothing while the hit stop holds (fight clock 0), the full
 * key on the first frame the clock moves, held for `riseMs`, then home over `fallMs` in held steps of `feel.staccato.recoverStepMs`
 * (staccato, 2026-10-11 — no ease between the keys). Shared by both fighters.
 */
export function nativeCityReboundCurve(fightMs: number, riseMs: number, fallMs: number): number {
  if (!(fightMs > 0)) return 0;
  if (fightMs < riseMs) return 1;
  const u = Math.min(1, nativeCityStaccatoTime(fightMs - riseMs, NATIVE_CITY_COMBAT.feel.staccato.recoverStepMs) / Math.max(1, fallMs));
  return 1 - u * u * (3 - 2 * u);
}

/** Contact catch → recoil accent → settle. Fight time holds this at zero throughout the shared hit stop. */
export function nativeCityDashReboundCurve(fightMs: number): number {
  const t = NATIVE_CITY_COMBAT.kuma.dash.contact;
  if (!(fightMs > t.catchMs)) return 0;
  if (fightMs < t.catchMs + t.recoilHoldMs) return 1;
  const u = Math.max(0, Math.min(1, (fightMs - t.catchMs - t.recoilHoldMs) / Math.max(1, t.settleMs)));
  return (1 - u) ** 3;
}


export class NativeCityBodyFeel {
  screenMs = 0;
  fightMs = 0;

  /**
   * `flashOnly`: the striking body's own flash (KUMA's dash 쾅) — the caller draws no hop for it. `grade`: the arena's lighter grade for
   * light and heavy blows (`NATIVE_CITY_ARENA_IMPACT_GRADE`, 2026-10-23 arena audit); absent: the village's.
   */
  constructor(readonly hit: NativeCityImpactHit, readonly flashOnly = false, readonly grade: NativeCityImpactGrade = "village") {}

  tick(screenDtMs: number, fightDtMs: number): void {
    this.screenMs += screenDtMs;
    this.fightMs += fightDtMs;
  }

  flash(reduced: boolean): NativeCityImpactFlash | null { return nativeCityImpactFlash(this.hit, this.screenMs, reduced, TUNING, this.grade); }

  hop(bodyPx: number, reduced: boolean): number { return nativeCityImpactHop(this.hit, this.fightMs, bodyPx, reduced); }

  get over(): boolean {
    return this.screenMs >= nativeCityImpactFlashMs(this.hit.tier)
      && this.fightMs >= Math.max(nativeCityImpactSquashMs(this.hit.victim), TUNING.hop.ms[this.hit.victim]);
  }
}

/** One landed blow's rebound on the striker. */
export interface NativeCityReboundSpec {
  /** The unit screen direction he is pushed back along (against the blow). */
  readonly screen: readonly [number, number];
  /** The push-back at its fullest (screen px). */
  readonly px: number;
  /** The fist's follow-through inside the freeze (`nativeCityFollowThroughPx`) at this tier; null: none. */
  readonly followTier: NativeCityImpactTier | null;
  /** The charge's rebound (`nativeCityDashReboundCurve`: catch, recoil hold, settle) instead of the hit lag's rise and fall. */
  readonly dash?: boolean;

  readonly bounce?: boolean;
  /** That lean (deg) and how long it holds (fight ms); absent: `feel.tells.armor.recoilDeg` / `recoilMs`. */
  readonly recoilDeg?: number;
  readonly recoilMs?: number;
}


export class NativeCityRebound implements NativeCityReboundSpec {
  readonly screen: readonly [number, number];
  readonly px: number;
  readonly followTier: NativeCityImpactTier | null;
  readonly dash: boolean;
  readonly bounce: boolean;
  readonly recoilDeg: number | undefined;
  readonly recoilMs: number | undefined;
  screenMs = 0;
  fightMs = 0;

  constructor(spec: NativeCityReboundSpec) {
    this.screen = spec.screen; this.px = spec.px; this.followTier = spec.followTier;
    this.dash = spec.dash === true; this.bounce = spec.bounce === true;
    this.recoilDeg = spec.recoilDeg; this.recoilMs = spec.recoilMs;
  }

  tick(screenDtMs: number, fightDtMs: number): void {
    this.fightMs += fightDtMs;
    this.screenMs += screenDtMs;
  }

  /** The push along `screen` now (screen px): the rebound at its key less the fist still pressing on. */
  pushPx(reduced: boolean): number {
    const follow = this.bounce || this.followTier === null ? 0 : nativeCityFollowThroughPx(this.followTier, this.screenMs, this.fightMs, reduced);
    const { pushbackRiseMs, pushbackFallMs } = NATIVE_CITY_COMBAT.feel.hitLag;
    return (this.dash ? nativeCityDashReboundCurve(this.fightMs) : nativeCityReboundCurve(this.fightMs, pushbackRiseMs, pushbackFallMs)) * this.px
      - follow;
  }

  /** Fight ms the rebound lasts. */
  get endMs(): number {
    const contact = NATIVE_CITY_COMBAT.kuma.dash.contact, lag = NATIVE_CITY_COMBAT.feel.hitLag;
    return this.dash ? contact.catchMs + contact.recoilHoldMs + contact.settleMs : lag.pushbackRiseMs + lag.pushbackFallMs;
  }

  get over(): boolean { return this.fightMs >= this.endMs; }
}

/** One camera kick (screen space): `dir` is the blow's unit screen direction. */
export interface NativeCityCameraKick {
  readonly tier: NativeCityImpactTier;
  readonly dir: readonly [number, number];
  /** The share of the tier's shake that runs along `dir` (screen px) and how long. */
  readonly shakePx: number;
  readonly shakeMs: number;
  /**
   * A lean instead of the tier's nudge and zoom (KUMA's dash, `kuma.dash.cameraLead`): the camera eases `px` toward `dir` over
   * `inMs` and back over `outMs`, with no zoom pulse.
   */
  readonly lead?: { readonly px: number; readonly inMs: number; readonly outMs: number };
  /**
   * A punch instead of the tier's zoom pulse (`feel.tells`: the string's ender, the dash's eye glint): `zoom` over `ms` (half in,
   * half out) and a swing `swingPx` screen px across the blow, one wave decaying over `ms` — the 3D card camera cannot roll, this
   * reads as one.
   */
  readonly punch?: { readonly zoom: number; readonly ms: number; readonly swingPx?: number };

  readonly zoomScale?: number;
  /**
   * A push-in that HOLDS (2026-10-19, the counter's "삥~ → 팡", `kuma.rhythm.counter.accent.focus`): the zoom eases in over `inMs`, then
   * stays — until the next kick arrives (the heel's contact: the view drops it, the pop back out is the 팡) or `maxMs`. No nudge, no shake.
   */
  readonly focus?: { readonly zoom: number; readonly inMs: number; readonly maxMs: number };
}

/**
 * 한 방의 흔들림을 나눈다: `directionalShare` 는 타격 방향 킥(`kick`)으로, 나머지는 리그의 흔들림(`isoPx`). 화면 방향이 없으면
 * 전부 리그 몫이고 킥은 없다.
 */
export function nativeCityCameraKickPlan(tier: NativeCityImpactTier, screenDir: readonly [number, number], shakePx: number, shakeMs: number,
  t: NativeCityImpactFeelTuning = TUNING): { readonly isoPx: number; readonly kick: NativeCityCameraKick | null } {
  const length = Math.hypot(screenDir[0], screenDir[1]);
  if (!(length > 1e-6)) return { isoPx: shakePx, kick: null };
  const share = clamp01(t.camera.directionalShare), directional = Math.max(0, shakePx) * share;
  return { isoPx: Math.max(0, shakePx) - directional,
    kick: { tier, dir: [screenDir[0] / length, screenDir[1] / length], shakePx: directional, shakeMs: Math.max(0, shakeMs) } };
}

/**
 * 킥 한 프레임(`ageMs` 화면 시간): 카메라 중심의 화면 px 오프셋(타격 쪽으로 `nudgePx` 들어갔다 돌아오기 + 타격 방향 감쇠 진동)과
 * 줌 배율(`zoomPulse` 를 `zoomMs` 동안 반 올리고 반 내림). 끝났으면 null.
 */
export function nativeCityCameraKickAt(kick: NativeCityCameraKick, ageMs: number, t: NativeCityImpactFeelTuning = TUNING):
  { readonly dx: number; readonly dy: number; readonly zoom: number } | null {
  const c = t.camera, age = Math.max(0, ageMs), lead = kick.lead, punch = kick.punch, focus = kick.focus;
  if (focus) {
    if (age >= focus.maxMs) return null;
    const u = clamp01(age / Math.max(1, focus.inMs));
    return { dx: 0, dy: 0, zoom: 1 + focus.zoom * (1 - (1 - u) ** 3) };
  }
  const inMs = lead ? lead.inMs : c.nudgeInMs, outMs = lead ? lead.outMs : c.nudgeOutMs, zoomMs = lead ? 0 : punch ? punch.ms : c.zoomMs;
  const life = Math.max(inMs + outMs, zoomMs, kick.shakeMs);
  if (age >= life) return null;
  const nudgeIn = clamp01(age / Math.max(1, inMs)), nudgeOut = clamp01((age - inMs) / Math.max(1, outMs));
  const nudge = (lead ? lead.px : c.nudgePx[kick.tier]) * (1 - (1 - nudgeIn) ** 2) * (1 - nudgeOut * nudgeOut * (3 - 2 * nudgeOut));
  const su = kick.shakeMs > 0 ? age / kick.shakeMs : 1;
  const shake = su < 1 ? kick.shakePx * (1 - su) ** 2 * Math.cos(2 * Math.PI * c.shakeHz * age / 1000) : 0;
  const zu = age / Math.max(1, zoomMs);
  const zoom = 1 + (!lead && zu < 1 ? (punch ? punch.zoom : c.zoomPulse[kick.tier] * (kick.zoomScale ?? 1)) * Math.sin(Math.PI * zu) : 0);
  const along = nudge + shake;
  // The punch's cross swing: one wave across the blow, decaying with the zoom.
  const across = punch && zu < 1 ? (punch.swingPx ?? 0) * Math.sin(2 * Math.PI * zu) * (1 - zu) : 0;
  return { dx: kick.dir[0] * along - kick.dir[1] * across, dy: kick.dir[1] * along + kick.dir[0] * across, zoom };
}


export function nativeCityHurtVignetteAlpha(tier: NativeCityImpactTier, ageMs: number, reduced = false,
  t: NativeCityImpactFeelTuning = TUNING): number {
  const v = t.vignette, age = Math.max(0, ageMs);
  if (age >= v.inMs + v.fadeMs) return 0;
  const k = age < v.inMs ? age / Math.max(1, v.inMs) : (1 - (age - v.inMs) / Math.max(1, v.fadeMs)) ** 2;
  return v.alpha[tier] * k * (reduced ? v.reducedScale : 1);
}

export function nativeCityHurtVignetteMs(t: NativeCityImpactFeelTuning = TUNING): number { return t.vignette.inMs + t.vignette.fadeMs; }

/** A pad's dual rumble for one blow (magnitudes 0..1). Null under reduced motion or when it would be silent. */
export interface NativeCityRumble { readonly durationMs: number; readonly strong: number; readonly weak: number }

export function nativeCityImpactRumble(tier: NativeCityImpactTier, armored: boolean, reduced = false,
  t: NativeCityImpactFeelTuning = TUNING): NativeCityRumble | null {
  if (reduced) return null;
  const r = t.rumble, k = armored ? r.armoredScale : 1;
  const strong = clamp01(r.strong[tier] * k), weak = clamp01(r.weak[tier] * k), durationMs = Math.max(0, Math.round(r.ms[tier]));
  return durationMs > 0 && strong + weak > 0 ? { durationMs, strong, weak } : null;
}

/**
 * HP 막대 하나의 깎임 꼬리. `chip` 은 밝은 꼬리 끝(HP 단위), `waitMs` 는 빠지기 시작할 때까지 남은 시간, `shakeMs` 는 흔들림
 * 경과(맞은 순간 0). 맞을 때마다 꼬리는 그 자리에서 다시 기다리고, HP 가 오르면 곧장 따라 오른다.
 */
export interface NativeCityHpChip {
  readonly chip: number;
  readonly last: number;
  /** Where the drain started (HP) and ms left before it starts (negative: ms into the drain). */
  readonly from: number;
  readonly waitMs: number;
  readonly shakeMs: number;
}

export function createNativeCityHpChip(hp: number): NativeCityHpChip {
  return { chip: hp, last: hp, from: hp, waitMs: 0, shakeMs: Number.POSITIVE_INFINITY };
}

/**
 * One frame: a drop in `hp` holds the chip where it was (the old HP, or the tail of an earlier blow still showing), waits
 * `chipDelayMs`, then eases it down to `hp` over `chipDrainMs`; a rise snaps it up with the HP.
 */
export function stepNativeCityHpChip(state: NativeCityHpChip, hp: number, dtMs: number,
  t: NativeCityImpactFeelTuning = TUNING): NativeCityHpChip {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0, bar = t.hpBar;
  if (hp > state.last || hp >= state.chip) return { chip: hp, last: hp, from: hp, waitMs: 0, shakeMs: state.shakeMs + dt };
  if (hp < state.last) {
    const chip = Math.max(state.chip, state.last);
    return { chip, last: hp, from: chip, waitMs: bar.chipDelayMs, shakeMs: 0 };
  }
  const waitMs = state.waitMs - dt;
  if (waitMs > 0) return { ...state, waitMs, shakeMs: state.shakeMs + dt };
  const u = clamp01(-waitMs / Math.max(1, bar.chipDrainMs)), eased = 1 - (1 - u) ** 2;
  return { chip: u >= 1 ? hp : state.from + (hp - state.from) * eased, last: hp, from: state.from, waitMs, shakeMs: state.shakeMs + dt };
}

/** The bar's horizontal shake now (screen px); 0 under reduced motion or once it settled. */
export function nativeCityHpChipShakePx(state: NativeCityHpChip, reduced = false, t: NativeCityImpactFeelTuning = TUNING): number {
  const bar = t.hpBar;
  if (reduced || !(state.shakeMs < bar.shakeMs)) return 0;
  const u = state.shakeMs / Math.max(1, bar.shakeMs);
  return bar.shakePx * (1 - u) ** 2 * Math.sin(2 * Math.PI * bar.shakeHz * state.shakeMs / 1000);
}
