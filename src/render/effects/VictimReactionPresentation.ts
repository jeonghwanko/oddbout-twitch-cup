import type { PresentationTier } from "./CombatPresentation";
import { ROPE_FX_RAMPS } from "./RopeTraversalFx";
import { PALETTE } from "../art/palette";
import { COMBAT_FLOOR_SKID } from "./CombatHitFx";
import { knockbackRemainingPx, knockbackStopMs, type KnockbackCurve } from "./KnockbackCurve";

/**
 * 맞은 몸의 반응 한 프레임. Phaser 를 모르는 순수 함수라 경비와 플레이어가 같은 곡선을 쓴다.
 *
 * 이전 인라인 구현은 `sin(t·π)` 대칭 곡선이라 밀려난 속도와 같은 속도로 제자리에 돌아왔다.
 * 그래서 아무리 큰 넉백도 "떨림"으로만 보였다. 여기서는 45ms 안에 튕겨 나갔다가
 * easeOutCubic 으로 천천히 회수한다 — 나간 거리와 돌아오는 시간이 다를 때만 밀림으로 읽힌다.
 */

export type VictimReactionTier = PresentationTier | "block" | "rebuff";

export interface VictimHit {
  readonly tier: VictimReactionTier;
  /** 피격자가 밀려나는 방향(+1 = 화면 오른쪽). 벽꿍이면 벽을 향한 방향이다. */
  readonly facing: -1 | 1;
  /** sim 이 실제로 이 타격에 밀어낸 거리. 렌더는 그만큼 뒤에서 출발해 따라잡는다. */
  readonly knockbackPx: number;
  readonly wallHit: boolean;
  /** 경직 저항이 경직을 먹은 타격. 반응을 줄이고 색을 금색으로 바꿔 "버텼다"를 보여 준다. */
  readonly absorbed: boolean;
  /**
   * 사슬 평타의 박자(같은 스텝의 `ComboConfirmed`). 평타만 읽는다 — 잽(1)과 스트레이트(2)가 흰 채움·
   * 고개 꺾임이 달라야 두 타격이 복사본으로 안 읽힌다(`LIGHT_CHAIN_REACTION`). 없으면 1타로 본다.
   */
  readonly chainBeat?: 1 | 2;
}

export interface VictimReactionFrame {
  /** 타격 방향의 즉시 반동(px). */
  readonly recoilX: number;
  /** 결정론적 고주파 떨림(px). `Math.random` 을 쓰지 않아 리플레이에서 같은 그림이 나온다. */
  readonly jitterX: number;
  /** 넉백 따라잡기 지연(px). 호출부가 넘긴 값을 그대로 돌려준다. */
  readonly lagX: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly angleDeg: number;
  /**
   * @deprecated 늘 null 이다. 흰 플래시와 외곽선은 이제 화면 시간으로 흐르는 겹침
   * (`victimFlashLayers` → `CombatImpactFrameView.flashVictim`)이 그린다. 이 곡선의 시계(`tMs`)는
   * 히트스톱 동안 멈춰, 여기서 칠하면 흰색이 히트스톱 + 플래시 내내 남았다(잽 약 190ms, 강타 약
   * 370ms — 쓰러지는 몸이 흰 덩어리로 가려졌다). 뷰의 `setTintFill(hitFrame.tint)` 줄은 지워도 된다.
   */
  readonly tint: number | null;
}

export interface VictimReactionSpec {
  readonly recoilPx: number;
  readonly durationMs: number;
  readonly shakeAmpPx: number;
  readonly shakeHz: number;
  readonly shakeMs: number;
  /** 흰 플래시 길이(화면 ms, 타격 프레임부터). 히트스톱과 무관하게 이만큼만 희다. */
  readonly flashMs: number;
  readonly squash: number;
  readonly angleDeg: number;
  /** 넉백 지연 감쇠 시간 상수(ms). 작을수록 첫 프레임에 멀리 나간다(`KnockbackCurve`). */
  readonly knockbackTauMs: number;
  /**
   * 넉백이 서기 직전의 최저 속도(px/ms). 지수 꼬리를 잘라 `knockbackStopMs` 에 한 번에 선다 — 빠르게
   * 나가서 단호하게 멈춘다(2026-09-26: 옛 순수 지수 곡선은 강타 44px 가 400ms 넘게 기어갔다).
   */
  readonly knockbackStopPxPerMs: number;
  /** sim 이 넉백 거리를 안 줬을 때 쓰는 기본값(px). `tuning.tierImpulse` 와 같은 수치. */
  readonly knockbackPx: number;
  /** 최대 반동에서 버티는 시간(ms). 강타·대시는 한 프레임, 피니셔는 세 프레임 붙잡는다. */
  readonly peakHoldMs: number;
}

const FINISHER: VictimReactionSpec = {
  // 38 → 4(2026-09-27 C-C-C 캡처): 반동 38px 가 몸을 sim 위치(58px) 너머로 날렸다가 230ms 동안 24px 를
  // 접촉 프레임의 몸 꺾임만 남긴다 — 되돌아오는 미끄럼 없이 넉백 곡선이 선 자리에서 멈춤 박자로 선다.
  recoilPx: 4,
  durationMs: 460,
  shakeAmpPx: 4.6,
  shakeHz: 20,
  shakeMs: 200,
  // 50 → 33: 히트스톱(150ms) 첫 두 프레임만 희다. 세 프레임이면 멈춘 접촉 자세가 흰 덩어리로 읽혔다.
  flashMs: 33,
  squash: 0.16,
  angleDeg: 14,
  // 90 → 80: 96px 가 첫 프레임에 20% 넘게 나가고 약 190ms 에 선다(58px 일 때와 같은 출발 판독).
  knockbackTauMs: 80,
  knockbackStopPxPerMs: 0.12,
  knockbackPx: 96,
  peakHoldMs: 50,
};

/** 반격은 피니시와 같은 언어를 쓰되 한 단계 낮다 — 결말이 아니라 기회이기 때문이다. */
const COUNTER_SCALE = 0.9;
/** 반격의 반동(px). 피니셔 반동이 4px 로 줄기 전의 결판 반동 38 × 0.9. */
const COUNTER_RECOIL_PX = 38 * COUNTER_SCALE;

export const VICTIM_REACTION_BY_TIER: Record<VictimReactionTier, VictimReactionSpec> = Object.freeze({
  // 평타(2026-09-27 C-C-C 캡처 실측): 흰 채움(33ms)이 잽 히트스톱(50ms)과 겹쳐 멈춘 접촉 프레임이 흰 덩어리였고,
  // 따뜻한 꼬리 [.5,.3,.15](warm[2])가 초록 제복을 올리브로 물들였다. 흰 채움은 결판 몫이라 평타는 두 박자 모두
  // 0(`LIGHT_CHAIN_REACTION`), 꼬리도 없다 — 밝기만 얹은 warm[0] 꼬리(.18)조차 몸을 씻어 반투명하게 보였다(최종 필름
  // 보스 +10/+26, 경비 +29). 몸 반동은 줄이고(8 → 4 — 거리는 sim 넉백이 소유한다) 고개 꺾임·눌림을 키워 "맞았다"는
  // 몸과 그려진 hurt-light 가 말한다.
  light: {
    recoilPx: 4,
    durationMs: 160,
    shakeAmpPx: 2.5,
    shakeHz: 26,
    shakeMs: 110,
    flashMs: 0,
    squash: 0.08,
    angleDeg: 8,
    knockbackTauMs: 45,
    knockbackStopPxPerMs: 0.06,
    knockbackPx: 12,
    peakHoldMs: 0,
  },
  heavy: {
    recoilPx: 26,
    durationMs: 360,
    shakeAmpPx: 4.0,
    shakeHz: 22,
    shakeMs: 170,
    // 흰 채움 없음(최종 필름: 17ms 한 프레임도 보스 강타·벽꿍·경비 강타에서 몸 전체가 희게 떴다 — 흰색은 결판·KO
    // 몫이다). 몸 색은 외곽선(`VICTIM_FLASH_OUTLINE`)이 말한다 — 몸 위에 얹는 색은 코트를 물들이거나 씻었다.
    flashMs: 0,
    squash: 0.12,
    angleDeg: 11,
    knockbackTauMs: 70,
    knockbackStopPxPerMs: 0.12,
    knockbackPx: 44,
    peakHoldMs: 17,
  },
  dash: {
    recoilPx: 24,
    durationMs: 350,
    shakeAmpPx: 3.6,
    shakeHz: 24,
    shakeMs: 150,
    // 흰 채움 없음, 외곽선만(흰색은 결판 몫 — 차가운 cool[2] 꼬리는 몸을 푸른 유령으로 씻었다).
    flashMs: 0,
    squash: 0.10,
    angleDeg: 12,
    knockbackTauMs: 80,
    knockbackStopPxPerMs: 0.14,
    knockbackPx: 68,
    peakHoldMs: 17,
  },
  finisher: FINISHER,
  counter: {
    // 반격은 sim 이 밀지 않는다(제자리에 박힌다) — 반동이 유일한 움직임이라 피니셔의 옛 반동(38px)을 그대로 쓴다.
    recoilPx: COUNTER_RECOIL_PX,
    durationMs: FINISHER.durationMs * COUNTER_SCALE,
    shakeAmpPx: FINISHER.shakeAmpPx * COUNTER_SCALE,
    shakeHz: FINISHER.shakeHz * COUNTER_SCALE,
    shakeMs: FINISHER.shakeMs * COUNTER_SCALE,
    // 플래시는 줄이지 않는다 — 50ms(세 프레임)보다 짧으면 결판의 흰 프레임이 한 칸으로 무너진다.
    flashMs: 50,
    squash: FINISHER.squash * COUNTER_SCALE,
    angleDeg: FINISHER.angleDeg * COUNTER_SCALE,
    knockbackTauMs: 90,
    knockbackStopPxPerMs: 0.12,
    knockbackPx: 44,
    peakHoldMs: FINISHER.peakHoldMs,
  },
  // 막기는 타격이 아니라 버팀이다. 몸은 거의 안 움직이고 금색만 짧게 튄다.
  block: {
    recoilPx: 2,
    durationMs: 180,
    shakeAmpPx: 1.2,
    shakeHz: 26,
    shakeMs: 90,
    // 버팀은 흰 외곽선 한 프레임(`VICTIM_FLASH_OUTLINE.blockFrames`).
    flashMs: 0,
    squash: 0.03,
    angleDeg: 2,
    knockbackTauMs: 45,
    knockbackStopPxPerMs: 0.06,
    knockbackPx: 0,
    peakHoldMs: 0,
  },
  rebuff: {
    recoilPx: 9,
    durationMs: 220,
    shakeAmpPx: 0,
    shakeHz: 26,
    shakeMs: 0,
    flashMs: 0,
    squash: 0.04,
    angleDeg: 3,
    knockbackTauMs: 45,
    knockbackStopPxPerMs: 0.06,
    knockbackPx: 0,
    peakHoldMs: 17,
  },
});

/**
 * 사슬 평타의 박자별 덮어쓰기. 1타(잽)는 고개만 8° 튕기고, 2타(스트레이트)는 12° 로 머리가 뒤로 꺾이며 더 밀린다 —
 * 같은 평타 표를 두 타가 나눠 쓰면 복사본으로 읽혔다. 흰 채움은 두 박자 모두 없다(2026-09-27 — 흰색은 결판 몫,
 * 2타의 17ms 흰 프레임은 평타마다 번쩍였다). 넉백 기본값은 `tuning.combat.tierImpulse.light.chainBeatKnockbackPx` 와 같다.
 */
export const LIGHT_CHAIN_REACTION: Readonly<Record<1 | 2, Partial<VictimReactionSpec>>> = Object.freeze({
  1: Object.freeze({ flashMs: 0, angleDeg: 8, knockbackPx: 12 }),
  2: Object.freeze({ flashMs: 0, angleDeg: 12, knockbackPx: 22 }),
});

/** 이 타격이 쓰는 반응 표. 평타는 사슬 박자로 한 번 더 고른다. */
export function victimReactionSpec(hit: Pick<VictimHit, "tier" | "chainBeat">): VictimReactionSpec {
  const spec = VICTIM_REACTION_BY_TIER[hit.tier];
  if (hit.tier !== "light" || hit.chainBeat === undefined) return spec;
  return { ...spec, ...LIGHT_CHAIN_REACTION[hit.chainBeat] };
}

/** 반동이 최대에 도달하는 시간. 이 구간만 급격하고 나머지는 전부 회수다. */
const RECOIL_RISE_MS = 45;
/** 경직 저항이 먹은 타격의 반응 배율. 0 이면 "안 맞았다"로 읽히므로 흔적은 남긴다. */
export const ABSORBED_SCALE = 0.35;
/** 벽에 부딪힌 한 프레임의 되튐(px). */
const WALL_BOUNCE_PX = 3;
const WALL_BOUNCE_MS = 18;

export const VICTIM_FLASH_OUTLINE = Object.freeze({
  /** 외곽선 두께(화면 논리 px). */
  px: 2,
  stepMs: 17,
  /** 외곽선이 서 있는 프레임 수. 평타 사슬은 짧게. */
  hitFrames: 4,
  lightFrames: 2,
  hurtFrames: 4,
  blockFrames: 1,

  hurtFillMs: 33,
  hitColor: PALETTE.combatNeonYellow,
  hurtColor: PALETTE.combatNeonOrange,
  blockColor: PALETTE.white,
});
/**
 * 모션 감소에서 남기는 반동 배율.
 *
 * 0 으로 접으면 "맞았다"가 화면에서 사라져 전투가 읽히지 않는다. 멀미의 주범인
 * 고주파 떨림(`jitterX`)과 화면 기울기(`angleDeg`)만 빼고, 방향이 읽히는 반동은 절반 남긴다.
 */
export const REDUCED_MOTION_RECOIL_SCALE = 0.5;
/**
 * 멈춤 박자: 넉백이 멈추는 순간(`knockbackStopMsOf` — 몸이 실제로 서는 시각) 몸이 한 번 더 짧게 눌려
 * "바닥에 섰다"를 말한다. 바닥 미끄럼의 멈춤 고리(`CombatHitFx` skid)가 퍼지기 시작하는 시각과 같다
 * (둘 다 히트스톱이 풀린 뒤부터 센다). 눌림 폭은 티어 `squash` 의 비율, 길이는 화면 ms. 강타·대시·
 * 피니셔 중 실제로 밀린(≥ `COMBAT_FLOOR_SKID.minPx`) 타격만.
 */
export const VICTIM_SETTLE_BEAT = Object.freeze({ squashShare: 0.45, durationMs: 80 });

/** 이보다 작은 지연은 0 으로 접는다 — 반올림된 px 로는 어차피 안 보인다. */
const LAG_EPSILON_PX = 0.4;

export const NEUTRAL_VICTIM_REACTION_FRAME: VictimReactionFrame = Object.freeze({
  recoilX: 0,
  jitterX: 0,
  lagX: 0,
  scaleX: 1,
  scaleY: 1,
  angleDeg: 0,
  tint: null,
});

export function victimReactionDurationMs(tier: VictimReactionTier): number {
  return VICTIM_REACTION_BY_TIER[tier].durationMs;
}

/** sim 이 넉백 거리를 안 실어 준 사건의 폴백. */
export function defaultKnockbackPx(tier: VictimReactionTier): number {
  return VICTIM_REACTION_BY_TIER[tier].knockbackPx;
}

/**
 * 피격 프레임의 렌더 변형. `tMs` 는 타격 이후 경과 시간, `lagPx` 는 호출부가 관리하는
 * 넉백 따라잡기 지연이다(이 함수는 상태를 갖지 않는다).
 *
 * `reducedMotion` 은 카메라만의 설정이 아니다 — 맞은 몸이 떨고 기울어지는 것도 같은
 * 멀미의 원인이라, 경비·플레이어 뷰가 자기 설정을 그대로 여기까지 내려보낸다.
 */
export function victimReactionFrame(
  hit: VictimHit,
  tMs: number,
  lagPx: number,
  reducedMotion = false,
): VictimReactionFrame {
  const spec = victimReactionSpec(hit);
  const t = Math.max(0, tMs);
  if (t >= spec.durationMs) return { ...NEUTRAL_VICTIM_REACTION_FRAME, lagX: lagPx };

  const soften = (hit.absorbed ? ABSORBED_SCALE : 1)
    * (reducedMotion ? REDUCED_MOTION_RECOIL_SCALE : 1);
  const bouncePx = hit.wallHit && t < WALL_BOUNCE_MS ? WALL_BOUNCE_PX : 0;
  const recoilX = hit.facing * (spec.recoilPx * recoilEnvelope(t, spec.durationMs, spec.peakHoldMs) + bouncePx) * soften;
  const jitterX = reducedMotion
    ? 0
    : spec.shakeAmpPx
      * Math.exp(-3.2 * t / spec.shakeMs)
      * Math.sin(2 * Math.PI * spec.shakeHz * t / 1000)
      * soften;
  const squashDecay = Math.exp(-4 * t / spec.durationMs) + victimSettleSquash(hit, t, reducedMotion);
  const angleDeg = reducedMotion
    ? 0
    : hit.facing
      * spec.angleDeg
      * Math.exp(-3 * t / spec.durationMs)
      * Math.cos(Math.PI * t / (2 * spec.shakeMs))
      * soften;

  return {
    recoilX,
    jitterX,
    lagX: lagPx,
    // 눌린 만큼 옆으로 퍼진다. 부피가 유지되어야 고무가 아니라 몸으로 보인다.
    scaleX: 1 + 0.6 * spec.squash * squashDecay,
    scaleY: 1 - spec.squash * squashDecay,
    angleDeg,
    tint: null,
  };
}

/** 모션 감소에서 남기는 멈춤 박자 눌림 배율. */
const REDUCED_SETTLE_SCALE = 0.5;

/** 바닥 미끄럼(`CombatHitFx` skid)이 있는 티어. 멈춤 박자는 고리와 짝이라 이 티어에만 있다. */
const SETTLE_BEAT_TIERS: ReadonlySet<VictimReactionTier> = new Set(["heavy", "dash", "finisher"]);

/**
 * 멈춤 박자의 눌림(티어 squash 에 곱하는 0..squashShare). 넉백이 멈추는 시각에 반 사인 한 번.
 * 바닥 미끄럼이 있는 티어(강타·대시·피니셔)만, 흡수·짧은 밀림은 0. 모션 감소에서는 절반으로 남긴다 —
 * 떨림·기울기가 아니라 착지 판독이지만, 몸이 한 번 더 출렁이는 양은 줄인다.
 */
export function victimSettleSquash(hit: VictimHit, tMs: number, reducedMotion = false): number {
  if (!SETTLE_BEAT_TIERS.has(hit.tier) || hit.absorbed || Math.abs(hit.knockbackPx) < COMBAT_FLOOR_SKID.minPx) return 0;
  const u = (tMs - knockbackStopMsOf(hit.tier, hit.knockbackPx)) / VICTIM_SETTLE_BEAT.durationMs;
  if (u <= 0 || u >= 1) return 0;
  return VICTIM_SETTLE_BEAT.squashShare * Math.sin(Math.PI * u) * (reducedMotion ? REDUCED_SETTLE_SCALE : 1);
}

/** 맞은 몸에 얹는 색 한 겹. `atMs`(타격 프레임부터의 화면 ms)에 태어나 `stepMs` 마다 다음 알파로. */
export interface VictimFlashLayer {
  readonly atMs: number;
  readonly color: number;
  /** 가산 겹침인가. 지금 층은 모두 보통 합성이다(흰 채움·외곽선). */
  readonly additive: boolean;
  readonly alphas: readonly number[];
  readonly stepMs: number;
  /** 있으면 단색 채움이 아니라 몸 둘레의 외곽선(이 두께, 화면 논리 px) — 몸을 상하좌우로 민 단색 복제를 몸 뒤에 둔다. */
  readonly outlinePx?: number;
}


export type VictimFlashWho = "guard" | "player";


export function victimFlashLayers(hit: VictimHit, reducedMotion = false, who: VictimFlashWho = "guard"): readonly VictimFlashLayer[] {
  const O = VICTIM_FLASH_OUTLINE, spec = victimReactionSpec(hit);
  const rim = (atMs: number, color: number, frames: number): VictimFlashLayer =>
    ({ atMs, color, additive: false, alphas: Array.from({ length: frames }, () => 1), stepMs: O.stepMs, outlinePx: O.px });
  if (hit.absorbed || hit.tier === "block") return [rim(0, O.blockColor, O.blockFrames)];
  const player = who === "player";
  const fillMs = player ? Math.max(spec.flashMs, O.hurtFillMs) : spec.flashMs;
  const fill: VictimFlashLayer[] = fillMs > 0 ? [{ atMs: 0, color: ROPE_FX_RAMPS.warm[0]!, additive: false, alphas: [1], stepMs: fillMs }] : [];
  const color = player ? O.hurtColor : O.hitColor;
  if (reducedMotion) return fill.length > 0 ? fill : [rim(0, color, 1)];
  return [...fill, rim(fillMs, color, player ? O.hurtFrames : hit.tier === "light" ? O.lightFrames : O.hitFrames)];
}


export const VICTIM_WHITE_FILL_TIERS: ReadonlySet<VictimReactionTier> = new Set<VictimReactionTier>(["finisher", "counter"]);

/** 한 순간의 피격 색(시트·실험실·테스트용). 겹칠 층이 없으면 null. */
export function victimFlashAt(
  hit: VictimHit,
  wallAgeMs: number,
  reducedMotion = false,
  who: VictimFlashWho = "guard",
): { readonly color: number; readonly additive: boolean; readonly alpha: number; readonly outline: boolean } | null {
  for (const layer of victimFlashLayers(hit, reducedMotion, who)) {
    const age = wallAgeMs - layer.atMs;
    if (age < 0) continue;
    const alpha = layer.alphas[Math.floor(age / Math.max(1, layer.stepMs))];
    if (alpha !== undefined) return { color: layer.color, additive: layer.additive, alpha, outline: layer.outlinePx !== undefined };
  }
  return null;
}

/** 티어의 넉백 곡선(`KnockbackCurve`). 바닥 미끄럼(`CombatHitFx` skid)도 같은 두 값을 쓴다. */
export function knockbackCurveOf(tier: VictimReactionTier): KnockbackCurve {
  const spec = VICTIM_REACTION_BY_TIER[tier];
  return { tauMs: spec.knockbackTauMs, stopPxPerMs: spec.knockbackStopPxPerMs };
}

/** `px` 를 밀린 몸이 서는 시각(히트스톱이 풀린 뒤부터, ms). */
export function knockbackStopMsOf(tier: VictimReactionTier, px: number): number {
  return knockbackStopMs(px, knockbackCurveOf(tier));
}

/**
 * 넉백 지연의 다음 값: 빠르게 나가서 단호하게 선다(`KnockbackCurve`). 프레임마다 불러 화면 좌표가
 * sim 좌표를 따라잡게 한다. 닫힌 식이라 dt 를 쪼개 불러도 같은 곳에 선다.
 */
export function nextKnockbackLag(
  lagPx: number,
  dtMs: number,
  tier: VictimReactionTier,
): number {
  if (lagPx === 0) return 0;
  const remaining = knockbackRemainingPx(lagPx, dtMs, knockbackCurveOf(tier));
  return remaining < LAG_EPSILON_PX ? 0 : Math.sign(lagPx) * remaining;
}

/**
 * 히트스톱 동안 대시 돌진 따라잡기의 시정수(ms). 접촉 프레임 한 번에 90px 가 약 5.6px 로 접힌다.
 * 30ms 일 때는 멈춤 안에서도 몸이 52px 를 미끄러져 "멈춘 세계에서 혼자 미끄러짐" 으로 읽혔다
 * (2026-09-25 애니메이터 2차 리뷰) — 돌진은 한 프레임에 도착하고 멈춤은 도착한 자세를 붙잡는다.
 *
 * 히트스톱은 배우의 자세만 붙잡는다. 돌진 따라잡기까지 붙잡으면 멈춤이 풀린 뒤 몸이
 * 약 75px 얼음 미끄럼을 탄다(2026-09-25 애니메이터 리뷰). 맞은 쪽 넉백 지연은 계속 멈춘다 —
 * "이미 들어간 공격자 + 아직 안 밀린 상대" 가 멈춤 동안의 그림이고, 풀리면서 상대만 날아간다.
 */
export const LUNGE_HITSTOP_CATCH_UP_TAU_MS = 6;

/**
 * 맞힌 대시가 멈춤 안에서 남겨 두는 돌진 거리(px). 멈춤이 풀리는 순간 발뒤꿈치로 버티는 제동 컷(P3)
 * 위에서 이만큼 짧게 미끄러져(두세 프레임, `DASH_LUNGE_CATCH_UP`) 선다 — 가속(돌진)·경직(멈춤) 뒤의
 * 감속이다. 0 이면 90px 가 멈춤 안에서 다 끝나 풀린 뒤 제동이 없었다(2026-09-26 애니메이터 리뷰).
 * 몸 겹침도 그만큼 준다(돌진은 상대 앞에서 멈추지만 멈춤 동안 주먹이 상대 몸을 파고들었다).
 */
export const LUNGE_SKID_RESERVE_PX = 12;

/**
 * 헛친 대시(멈춤 없음)의 돌진 따라잡기. 공격자는 맞은 몸보다 가볍게 튀어 나가 빨리 선다: 90px 를 첫
 * 프레임에 약 32px, 약 92ms 에 끝낸다 — 발뒤꿈치로 버티는 제동 컷(P3, 접촉 +40..+130ms) 안에서 몸이 선다.
 * 예전(대시 넉백 τ 120 지수)은 가드 컷이 된 뒤에도 몸이 계속 미끄러졌다(2026-09-26).
 */
export const DASH_LUNGE_CATCH_UP: KnockbackCurve = Object.freeze({ tauMs: 45, stopPxPerMs: 0.3 });

/** 헛친 대시의 몸이 돌진 끝에 서는 시각(접촉부터, ms). 제동 먼지가 이 순간에 인다. */
export function dashLungeSettleMs(px: number): number {
  return knockbackStopMs(px, DASH_LUNGE_CATCH_UP);
}

/**
 * 공격자 돌진 지연의 다음 값. 히트스톱 중(`hitStopped`)에는 벽시계 `dtMs` 로 빠르게 접고,
 * 그 밖에서는 `DASH_LUNGE_CATCH_UP` 으로 튀어 나가 선다.
 */
export function nextLungeLag(lagPx: number, dtMs: number, hitStopped: boolean): number {
  if (lagPx === 0) return 0;
  if (!hitStopped) {
    const remaining = knockbackRemainingPx(lagPx, dtMs, DASH_LUNGE_CATCH_UP);
    return remaining < LAG_EPSILON_PX ? 0 : Math.sign(lagPx) * remaining;
  }
  // 멈춤 안에서는 마지막 `LUNGE_SKID_RESERVE_PX` 앞에서 선다 — 그 몇 px 는 풀린 뒤 제동 컷 위에서 미끄러져 끝난다.
  const reserve = Math.sign(lagPx) * Math.min(Math.abs(lagPx), LUNGE_SKID_RESERVE_PX);
  const next = reserve + (lagPx - reserve) * Math.exp(-Math.max(0, dtMs) / LUNGE_HITSTOP_CATCH_UP_TAU_MS);
  return Math.abs(next) < LAG_EPSILON_PX ? 0 : next;
}

/**
 * 타격 프레임의 초기 지연.
 *
 * sim 좌표는 이미 넉백이 끝난 위치다. 렌더가 그 자리에서 시작하면 순간이동으로 보이므로
 * 맞기 전 위치(= 밀린 거리만큼 뒤)에서 출발시켜 이징으로 따라잡게 한다.
 * 벽꿍은 sim 이 실제로 이동한 거리를 `knockbackPx` 로 주므로 같은 식이 그대로 맞는다.
 */
export function initialKnockbackLag(hit: VictimHit): number {
  const px = Math.abs(hit.knockbackPx);
  return px === 0 ? 0 : -hit.facing * px;
}

/**
 * 45ms 급상승 → (피니셔만) 최대 반동에서 `peakHoldMs` 버팀 → easeOutCubic 회수.
 * 나가는 시간과 돌아오는 시간이 달라야 밀림으로 읽힌다.
 */
function recoilEnvelope(t: number, durationMs: number, peakHoldMs: number): number {
  if (t < RECOIL_RISE_MS) {
    const rise = t / RECOIL_RISE_MS;
    return 1 - (1 - rise) * (1 - rise);
  }
  if (t < RECOIL_RISE_MS + peakHoldMs) return 1;
  const returnMs = Math.max(1, durationMs - RECOIL_RISE_MS - peakHoldMs);
  const k = Math.min(1, (t - RECOIL_RISE_MS - peakHoldMs) / returnMs);
  const inverted = 1 - k;
  return inverted * inverted * inverted;
}
