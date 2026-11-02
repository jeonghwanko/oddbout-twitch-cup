import type { SimEvent } from "../../sim/types";
import { easeInCubic, easeOutCubic } from "../art/easing";

/**
 * 전투 슬로모 — 결판 한 방에만 거는 "멈춤 → 느림 → 풀림" 박자.
 *
 * 지금까지 전투는 히트스톱(완전 정지)과 정속 둘뿐이라 모든 타격이 같은 템포로 흘렀다. 여기서는
 * 히트스톱이 끝난 **뒤에** 잠깐 시간을 늦췄다가(hold) 부드럽게 정속으로 되돌린다(release).
 *
 *   접촉 ─ 히트스톱(정지, CombatPresentation) ─ 슬로모 hold(scale) ─ release(ease → 1) ─ 정속
 *
 * 합성 규칙
 * - sim 의 `dtMs` 는 건드리지 않는다. 씬이 벽시계 → 고정 스텝 누산기 사이의 프레임 델타에 이 배율을
 *   곱한다(`GameSpeed` 와 같은 자리, 곱으로 합성). 같은 입력은 같은 스텝 열을 만든다 — 결정적이다.
 * - 히트스톱과 싸우지 않는다: 히트스톱이 남아 있는 동안 슬로모 시계는 흐르지 않고 배율은 1 이다.
 *   그래야 히트스톱 잔량이 늦춰진 델타로 깎여 정지가 길어지지 않는다. 슬로모 도중 새 타격이
 *   히트스톱을 걸면 슬로모는 그 정지 동안 멈췄다가 이어진다.
 * - 시계는 게임 속도 어시스트가 곱해진 "화면 ms" 로 흐른다(슬로모 배율은 곱하지 않는다).
 *
 * Phaser 를 모른다. 씬(`HeistScene`)이 배율을 읽고, 화면 처리(`CombatSlowMoView`)가 강도를 읽는다.
 */

export type CombatSlowMoCause =
  | "perfect-dodge"
  | "finisher"
  | "defeat"
  | "counter"
  | "finisher-ko"
  | "boss-ko";

export interface CombatSlowMoBeat {
  /** hold 동안의 시간 배율(0‥1). */
  readonly scale: number;
  /** 배율을 붙드는 화면 ms. */
  readonly holdMs: number;
  /**
   * 배율이 1 로 돌아오는 화면 ms(easeOutCubic). easeInOutCubic 은 release 앞 25% 동안 배율이 거의 안 올라
   * hold 가 실효로 약 540ms 로 늘었다(애니메이터 리뷰).
   */
  readonly releaseMs: number;
  /** 화면 가장자리 먹 번짐의 최대 불투명도(0‥1). */
  readonly vignette: number;
  /** 월드 채도를 빼는 양(0‥1, ColorMatrix saturate 의 음수). */
  readonly desaturate: number;
  /**
   * 같은 원인이 다시 걸리려면 지난 발동 뒤 이만큼(화면 ms) 지나야 한다. 0 이면 늘 건다.
   * 3타 사슬·반격은 1초에 한 번도 나온다 — 매번 늦추면 템포 대비가 아니라 늘어짐이 된다.
   */
  readonly cooldownMs: number;
  /**
   * 채찍(2026-10-19 쿠마전 반격 — 사용자: "삥~ 하고 순간적으로 엄청 슬로우 걸렸다가 팡!!! … 가속도 감속도가 적어"): 있으면 release 는
   * 배율을 1 로 천천히 올리지 않고 이 배율(1 초과)로 단번에 튀었다가 release 동안 1 로 가라앉는다(easeInCubic — 빠른 채로 오래 간다).
   */
  readonly whipRate?: number;
}

/**
 * 원인별 박자. 아래로 갈수록 무겁다(결판일수록 더 느리고 더 길다). 결판 뒤 정속 복귀까지 벽시계로
 * hold + release 가 더해진다 — 금고지기 결판이 약 0.9초로 가장 길다.
 */
export const COMBAT_SLOW_MO: Readonly<Record<CombatSlowMoCause, CombatSlowMoBeat>> = Object.freeze({
  // 완벽 회피: 반격 판단을 줄 만큼만 살짝. 반격 창은 sim 시간이라 벽시계로 약 60ms 늘어난다.
  "perfect-dodge": { scale: 0.55, holdMs: 90, releaseMs: 140, vignette: 0.32, desaturate: 0.12, cooldownMs: 700 },
  // 3타 사슬 완주(쓰러뜨리지 않음): 짧은 한 박자.
  finisher: { scale: 0.4, holdMs: 110, releaseMs: 170, vignette: 0.42, desaturate: 0.18, cooldownMs: 900 },
  // 일반 경비 쓰러뜨림(피니셔 아님).
  defeat: { scale: 0.4, holdMs: 150, releaseMs: 200, vignette: 0.5, desaturate: 0.2, cooldownMs: 600 },
  counter: { scale: 0.35, holdMs: 150, releaseMs: 200, vignette: 0.62, desaturate: 0.25, cooldownMs: 0 },
  // 피니셔로 쓰러뜨림 — 예고장 임팩트 프레임이 걸리는 그 한 방.
  "finisher-ko": { scale: 0.3, holdMs: 200, releaseMs: 260, vignette: 0.75, desaturate: 0.28, cooldownMs: 0 },
  // 금고지기 결판. 전투에서 한 번뿐이다. 쓰러짐 동작은 KO 뒤 sim 약 300ms 에 무릎이 꺾인다 — hold 를
  // 짧게(280) 두고 release 를 길게(520, easeOutCubic) 늘려 꺾이고 넘어지는 동작이 배율 0.5–0.8 구간에
  // 걸리게 한다. 0.22/420/480 은 선 채로 멈춘 보스만 느리게 보여 주고 넘어짐은 정속으로 지나갔다(리뷰).
  // 채도는 0.32 까지만 뺀다 — 0.5 는 떨어진 열쇠(보상)와 두 배우까지 회색으로 만들었다.
  // 비행(sim 520ms)의 정점(`keyFlight.apexAt` 40% ≈ 208ms)이 붙든 구간 안에 앉는다. 400ms 에 풀려 잡는 순간은
  // 배율 0.9 이상(거의 정속) + 잡기 히트스톱이다(`hitStop.keyCaught`). 420/380 은 정점이 풀리는 중(약 0.9)에 왔다.
  "boss-ko": { scale: 0.3, holdMs: 700, releaseMs: 400, vignette: 0.9, desaturate: 0.32, cooldownMs: 0 },
});

/** 모션 감소: 시간 조작 자체는 멀미 요인이 아니지만 대비를 낮춘다 — 덜 느리게, 더 짧게, 채도는 그대로. */
const REDUCED_MOTION = Object.freeze({ minScale: 0.6, durationRatio: 0.6, vignetteRatio: 0.6 });

const CAUSE_RANK: Readonly<Record<CombatSlowMoCause, number>> = Object.freeze({
  "perfect-dodge": 0,
  finisher: 1,
  defeat: 2,
  counter: 3,
  "finisher-ko": 4,
  "boss-ko": 5,
});

/**
 * 이 스텝의 사건 중 가장 무거운 슬로모 원인. 하나의 판정이 여러 사건을 내도(피니셔 CombatHit +
 * ComboFinisherLaunched + CombatDefeated) 박자는 하나다.
 *
 * `encounterBoss` 는 호출자가 준다(`isEncounterBoss`) — 이 파일은 sim 규칙을 가져오지 않는다.
 */
export function combatSlowMoCause(
  events: readonly SimEvent[],
  encounterBoss: (guardId: string) => boolean = () => false,
): CombatSlowMoCause | null {
  let best: CombatSlowMoCause | null = null;
  const consider = (cause: CombatSlowMoCause): void => {
    if (best === null || CAUSE_RANK[cause] > CAUSE_RANK[best]) best = cause;
  };
  const finisherHits = new Set<string>();
  for (const event of events) {
    if (event.kind === "CombatHit" && event.tier === "finisher") finisherHits.add(event.guardId);
    if (event.kind === "ComboFinisherLaunched") finisherHits.add(event.guardId);
  }
  for (const event of events) {
    switch (event.kind) {
      case "CombatDefeated":
        if (encounterBoss(event.guardId)) consider("boss-ko");
        else consider(finisherHits.has(event.guardId) ? "finisher-ko" : "defeat");
        break;
      case "PerfectCounter":
        consider("counter");
        break;
      case "ComboFinisherLaunched":
        consider("finisher");
        break;
      case "CombatHit":
        if (event.tier === "finisher") consider("finisher");
        break;
      case "PerfectDodge":
        consider("perfect-dodge");
        break;
      default:
        break;
    }
  }
  return best;
}

/** 모션 감소를 반영한 박자. */
export function combatSlowMoBeat(cause: CombatSlowMoCause, reducedMotion: boolean): CombatSlowMoBeat {
  const beat = COMBAT_SLOW_MO[cause];
  if (!reducedMotion) return beat;
  return {
    ...beat,
    scale: Math.max(beat.scale, REDUCED_MOTION.minScale),
    holdMs: Math.round(beat.holdMs * REDUCED_MOTION.durationRatio),
    releaseMs: Math.round(beat.releaseMs * REDUCED_MOTION.durationRatio),
    vignette: beat.vignette * REDUCED_MOTION.vignetteRatio,
  };
}

/** 박자 하나의 `ageMs` 시각 배율. hold 동안 scale, release 동안 easeInOutCubic 으로 1 까지. */
export function combatSlowMoScaleAt(beat: CombatSlowMoBeat, ageMs: number): number {
  if (ageMs < 0) return 1;
  if (ageMs < beat.holdMs) return beat.scale;
  const releaseAge = ageMs - beat.holdMs;
  if (releaseAge >= beat.releaseMs) return 1;
  const t = beat.releaseMs <= 0 ? 1 : releaseAge / beat.releaseMs;
  if (beat.whipRate !== undefined && beat.whipRate > 1) return beat.whipRate + (1 - beat.whipRate) * easeInCubic(t);
  return beat.scale + (1 - beat.scale) * easeOutCubic(t);
}

/**
 * 화면 처리 강도(0‥1). hold 에 들어서며 90ms 에 차오르고, release 동안 배율과 함께 빠진다.
 * 먹 번짐이 첫 프레임에 툭 켜지면 슬로모가 아니라 화면 전환으로 읽힌다.
 */
export function combatSlowMoIntensityAt(beat: CombatSlowMoBeat, ageMs: number): number {
  if (ageMs < 0) return 0;
  const rise = Math.min(1, ageMs / 90);
  const scale = combatSlowMoScaleAt(beat, ageMs);
  const depth = beat.scale >= 1 ? 0 : (1 - scale) / (1 - beat.scale);
  return Math.max(0, Math.min(1, rise * depth));
}

/** 박자의 "남은 무게" — 새 박자가 이것보다 무거울 때만 갈아 끼운다. */
function remainingWeight(beat: CombatSlowMoBeat, ageMs: number): number {
  const left = Math.max(0, beat.holdMs + beat.releaseMs / 2 - Math.max(0, ageMs));
  return (1 - beat.scale) * left;
}

export interface CombatSlowMoSnapshot {
  readonly cause: CombatSlowMoCause | null;
  readonly timeScale: number;
  readonly intensity: number;
  readonly ageMs: number;
}

/**
 * 슬로모 시계. 씬이 프레임마다 `advance(화면 ms, 히트스톱 중인가)` 를 부르고 `timeScale` 을 읽는다.
 * 사건은 `trigger` 로 넣는다(같은 프레임의 히트스톱 누적과 함께).
 */
export class CombatSlowMoClock {
  private beat: CombatSlowMoBeat | null = null;
  private cause: CombatSlowMoCause | null = null;
  private ageMs = 0;
  private clockMs = 0;
  private frozen = false;
  /**
   * 정지가 풀린 첫 프레임. 이 프레임만 정속으로 흘려 sim 을 한 스텝 밀어 준다 — 느린 배율로 바로 들어가면
   * 누산기가 한 스텝(16.67ms)을 채우는 동안 3–4 프레임이 더 멈춰, 히트스톱이 사실상 약 67ms 늘었다.
   */
  private kick = false;
  private readonly lastStartMs = new Map<CombatSlowMoCause, number>();

  reset(): void {
    this.beat = null;
    this.cause = null;
    this.ageMs = 0;
    this.frozen = false;
  }

  /** 이번 스텝의 사건을 읽는다. 걸었으면 원인을 돌려준다. */
  push(events: readonly SimEvent[], reducedMotion: boolean, encounterBoss?: (guardId: string) => boolean): CombatSlowMoCause | null {
    const cause = combatSlowMoCause(events, encounterBoss);
    if (cause === null) return null;
    return this.trigger(cause, reducedMotion) ? cause : null;
  }

  trigger(cause: CombatSlowMoCause, reducedMotion: boolean): boolean {
    const next = combatSlowMoBeat(cause, reducedMotion);
    const last = this.lastStartMs.get(cause);
    if (next.cooldownMs > 0 && last !== undefined && this.clockMs - last < next.cooldownMs) return false;
    if (this.beat !== null && remainingWeight(next, 0) < remainingWeight(this.beat, this.ageMs)) return false;
    this.beat = next;
    this.cause = cause;
    this.ageMs = 0;
    this.lastStartMs.set(cause, this.clockMs);
    return true;
  }

  /**
   * 한 프레임을 흘린다. `hitStopActive` 면 박자 나이는 멈춘다(정지 → 느림 순서를 지킨다).
   * `deltaMs` 는 게임 속도가 곱해진 화면 ms 다 — 슬로모 배율을 곱하지 않은 값.
   */
  advance(deltaMs: number, hitStopActive: boolean): void {
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this.clockMs += dt;
    this.frozen = hitStopActive;
    this.kick = false;
    if (this.beat === null || hitStopActive) return;
    this.kick = this.ageMs === 0 && dt > 0;
    this.ageMs += dt;
    if (this.ageMs >= this.beat.holdMs + this.beat.releaseMs) {
      this.beat = null;
      this.cause = null;
      this.ageMs = 0;
    }
  }

  /** 프레임 델타에 곱할 배율. 히트스톱 중·박자 없음이면 1. */
  get timeScale(): number {
    if (this.beat === null || this.frozen || this.kick) return 1;
    return combatSlowMoScaleAt(this.beat, this.ageMs);
  }

  /** 화면 처리 강도(0‥1). 히트스톱 중에도 이미 차오른 강도는 유지한다. */
  get intensity(): number {
    if (this.beat === null) return 0;
    return combatSlowMoIntensityAt(this.beat, this.ageMs);
  }

  get activeBeat(): CombatSlowMoBeat | null {
    return this.beat;
  }

  snapshot(): CombatSlowMoSnapshot {
    return { cause: this.cause, timeScale: this.timeScale, intensity: this.intensity, ageMs: Math.round(this.ageMs) };
  }
}
