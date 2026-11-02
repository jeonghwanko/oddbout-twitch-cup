import type { SimEvent } from "../../sim/types";
import { easeOutBack, easeOutCubic } from "../art/easing";
import { PALETTE } from "../art/palette";

/**
 * 연타 수 — 사슬(1/3·2/3·3/3)을 넘어 끊기지 않고 이어진 명중 수를 화면 오른쪽에 크게 센다.
 *
 * 사슬 표시(발밑 "n/3")는 sim 콤보를 그대로 읽는 판정 정보이고, 이것은 순수한 보상이다 — sim 은
 * 모른다. 맞힌 뒤 `windowMs` 안에 다시 맞히면 이어지고, 맞으면(PlayerDamaged) 즉시 끊긴다.
 * 두 번째 명중부터 보인다(한 대는 연타가 아니다). 설명 문장은 없다 — 숫자와 짧은 단위뿐이다.
 */
export const COMBAT_HIT_COUNTER = Object.freeze({
  /** 마지막 명중 뒤 이어 칠 수 있는 화면 ms. 평타 사슬 한 바퀴(약 1.1초)보다 넉넉하다. */
  windowMs: 1_900,
  minVisible: 2,
  /** 명중마다 숫자가 박히는 곡선. */
  popFrom: 1.7,
  popMs: 90,
  settleMs: 110,
  shakePx: 3,
  shakeMs: 110,
  /** 끊겼을 때 숫자가 가라앉으며 사라지는 시간. */
  breakMs: 320,
  /** 결판(피니셔·반격·쓰러뜨림) 명중은 한 번 더 크게. 2.2 는 화면 오른쪽 끝에서 잘렸다. */
  finisherPopFrom: 1.8,
  /** 결판 명중 때 숫자 뒤 금박 폭발이 번쩍이는 시간. 420ms 는 발밑 3/3·대미지 받침과 별 셋이 겹쳤다. */
  finisherFlashMs: 200,
});

/** 명중 수에 따라 오르는 색 단계. 형태(크기)도 함께 오른다. */
export const COMBAT_HIT_COUNTER_TIERS = Object.freeze([
  { from: 2, fillTop: PALETTE.fxWarmCream, fillBottom: PALETTE.fxWarmGold, scale: 1 },
  { from: 5, fillTop: PALETTE.hotGold, fillBottom: 0xff8a2a, scale: 1.12 },
  { from: 10, fillTop: 0xffe2b0, fillBottom: 0xff5a3a, scale: 1.24 },
  { from: 20, fillTop: PALETTE.fxWarmCream, fillBottom: 0xff2e6d, scale: 1.36 },
] as const);

export type CombatHitCounterTier = (typeof COMBAT_HIT_COUNTER_TIERS)[number];

export function combatHitCounterTier(count: number): CombatHitCounterTier {
  let tier: CombatHitCounterTier = COMBAT_HIT_COUNTER_TIERS[0];
  for (const candidate of COMBAT_HIT_COUNTER_TIERS) if (count >= candidate.from) tier = candidate;
  return tier;
}

export interface CombatHitCounterFrame {
  readonly count: number;
  readonly visible: boolean;
  readonly scale: number;
  readonly alpha: number;
  readonly shakeX: number;
  readonly dy: number;
  /** 남은 이어 칠 시간 비율(0‥1) — 숫자 아래 가는 게이지. */
  readonly windowRatio: number;
  readonly tier: CombatHitCounterTier;
  /** 마지막 명중이 결판이었는가(배경 폭발을 한 번 번쩍인다). */
  readonly finisherFlash: number;
  readonly broken: boolean;
}

/** 이 스텝의 명중 수와 결판 여부. 피해가 실린 CombatHit 만 센다(막힘·스침 제외). */
export function combatHitCounterInput(events: readonly SimEvent[]): { readonly hits: number; readonly finisher: boolean; readonly struck: boolean } {
  let hits = 0;
  let finisher = false;
  let struck = false;
  const decisive = new Set<string>();
  for (const event of events) {
    if (event.kind === "CombatDefeated" || event.kind === "PerfectCounter" || event.kind === "ComboFinisherLaunched") decisive.add(event.guardId);
    if (event.kind === "PlayerDamaged") struck = true;
  }
  for (const event of events) {
    if (event.kind !== "CombatHit" || event.damage === undefined || !(event.damage > 0)) continue;
    hits += 1;
    if (event.tier === "finisher" || decisive.has(event.guardId)) finisher = true;
  }
  return { hits, finisher, struck };
}

/**
 * 연타 시계. 화면 ms 로 흐른다(슬로모에 늘어지지 않는다 — 보상 숫자는 현실 시간으로 읽혀야 한다).
 * 히트스톱 동안은 창이 줄지 않는다: 멈춤이 길수록 연타가 끊기는 모순을 막는다.
 */
export class CombatHitCounterClock {
  /** `windowMs`: how long after a hit the next one still joins (the heist's `COMBAT_HIT_COUNTER.windowMs`; the village fight's is shorter). */
  constructor(private readonly windowMs: number = COMBAT_HIT_COUNTER.windowMs) {}

  private count = 0;
  private sinceHitMs = Number.POSITIVE_INFINITY;
  private popAgeMs = Number.POSITIVE_INFINITY;
  private finisherPop = false;
  private brokenCount = 0;
  private breakAgeMs = Number.POSITIVE_INFINITY;

  reset(): void {
    this.count = 0;
    this.sinceHitMs = Number.POSITIVE_INFINITY;
    this.popAgeMs = Number.POSITIVE_INFINITY;
    this.brokenCount = 0;
    this.breakAgeMs = Number.POSITIVE_INFINITY;
  }

  push(events: readonly SimEvent[]): void {
    const input = combatHitCounterInput(events);
    this.pushRaw(input.hits, input.finisher, input.struck);
  }


  pushRaw(hits: number, finisher: boolean, struck: boolean): void {
    if (struck) this.breakCombo();
    if (hits <= 0) return;
    if (this.sinceHitMs > this.windowMs) this.count = 0;
    this.count += hits;
    this.sinceHitMs = 0;
    this.popAgeMs = 0;
    this.finisherPop = finisher;
    this.breakAgeMs = Number.POSITIVE_INFINITY;
  }

  advance(deltaMs: number, hitStopActive: boolean): void {
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this.popAgeMs += dt;
    this.breakAgeMs += dt;
    if (this.count === 0) return;
    if (!hitStopActive) this.sinceHitMs += dt;
    if (this.sinceHitMs > this.windowMs) this.breakCombo();
  }

  get hits(): number {
    return this.count;
  }

  frame(reducedMotion: boolean): CombatHitCounterFrame {
    const c = COMBAT_HIT_COUNTER;
    if (this.count < c.minVisible) {
      if (this.brokenCount >= c.minVisible && this.breakAgeMs < c.breakMs) {
        const t = this.breakAgeMs / c.breakMs;
        return {
          count: this.brokenCount, visible: true, scale: 1 - 0.12 * t, alpha: 1 - easeOutCubic(t), shakeX: 0,
          dy: reducedMotion ? 0 : 14 * easeOutCubic(t), windowRatio: 0, tier: combatHitCounterTier(this.brokenCount),
          finisherFlash: 0, broken: true,
        };
      }
      return { count: this.count, visible: false, scale: 1, alpha: 0, shakeX: 0, dy: 0, windowRatio: 0, tier: combatHitCounterTier(this.count), finisherFlash: 0, broken: false };
    }
    const popFrom = reducedMotion ? 1.12 : this.finisherPop ? c.finisherPopFrom : c.popFrom;
    let scale = 1;
    if (this.popAgeMs < c.popMs) scale = popFrom + (0.88 - popFrom) * easeOutCubic(this.popAgeMs / c.popMs);
    else if (this.popAgeMs < c.popMs + c.settleMs) scale = 0.88 + 0.12 * easeOutBack((this.popAgeMs - c.popMs) / c.settleMs);
    const shake = !reducedMotion && this.popAgeMs < c.shakeMs
      ? (Math.floor(this.popAgeMs / 16) % 2 === 0 ? 1 : -1) * c.shakePx * (1 - this.popAgeMs / c.shakeMs) * (this.finisherPop ? 1.6 : 1)
      : 0;
    return {
      count: this.count,
      visible: true,
      scale,
      alpha: 1,
      shakeX: shake,
      dy: 0,
      windowRatio: Math.max(0, 1 - this.sinceHitMs / this.windowMs),
      tier: combatHitCounterTier(this.count),
      finisherFlash: this.finisherPop ? Math.max(0, 1 - this.popAgeMs / c.finisherFlashMs) : 0,
      broken: false,
    };
  }

  private breakCombo(): void {
    if (this.count >= COMBAT_HIT_COUNTER.minVisible) {
      this.brokenCount = this.count;
      this.breakAgeMs = 0;
    }
    this.count = 0;
    this.sinceHitMs = Number.POSITIVE_INFINITY;
  }
}
