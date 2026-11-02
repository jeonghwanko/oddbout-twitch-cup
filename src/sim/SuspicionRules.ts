import type { SuspicionTier, Vec2 } from "./types";
import type { Tuning } from "./tuning";
import { clamp } from "./geom";

/**
 * 의심 미터와 4단 상태 기계.
 *
 * 공정성 불가침 규칙 두 가지가 이 모듈의 존재 이유다.
 *   1. 어떤 콘이든 진입하는 순간 즉시 coneEntryBump 를 받는다.
 *      보이지 않는 누적으로 발각되는 일이 없어야 한다.
 *   2. 티어 하한 잠금이 있다. 한 번 의심받으면 즉시 원래대로 돌아가지 않으므로
 *      "기다렸다 지나간다" 가 실제 시간 비용을 치른다.
 */

export interface SuspicionState {
  readonly meter: number;
  readonly tier: SuspicionTier;
  /** 현재 티어의 하한이 풀릴 때까지 남은 시간. */
  readonly tierLockMs: number;
  /** 마지막 자극 이후 경과. 감쇠 지연 판정에 쓴다. */
  readonly sinceStimulusMs: number;
  /** 직전 프레임에 시야 안에 있었는가. 콘 진입 순간을 잡는다. */
  readonly wasExposed: boolean;
  /** 최종 목격/청취 위치. 수색의 목적지. */
  readonly lastKnown: Vec2 | null;
  /** 현재 추적을 시작한 직접 목격 위치. 소음으로 움직이지 않는 추적 이탈 반경의 중심. */
  readonly pursuitOrigin: Vec2 | null;
}

export interface SuspicionInput {
  /** VisionRules.sample 의 노출도. */
  readonly exposure: number;
  /** NoisePlanner 가 계산한 이번 스텝의 청취 강도 합. */
  readonly heard: number;
  /** 들린 소리에 유인(휘파람·투척)이 있었는가. */
  readonly heardLure: boolean;
  /** 노출·청취가 있을 때의 위치. */
  readonly stimulusAt: Vec2 | null;
  /** 다른 경비에서 전파된 의심량. */
  readonly propagated: number;
}

export interface SuspicionResult {
  readonly state: SuspicionState;
  readonly tierChanged: boolean;
}

export function createSuspicion(): SuspicionState {
  return {
    meter: 0,
    tier: "calm",
    tierLockMs: 0,
    // Infinity는 JSON 직렬화에서 null이 되어 저장·진단 스냅샷을 손상시킨다.
    // 충분히 큰 유한값이면 "감쇠 지연은 이미 지났다"는 의미를 그대로 보존한다.
    sinceStimulusMs: Number.MAX_SAFE_INTEGER,
    wasExposed: false,
    lastKnown: null,
    pursuitOrigin: null,
  };
}

/**
 * 미터를 최소 minMeter 까지 밀어 올리고 그 지점을 기억시킨다.
 *
 * 시야·소음 같은 지속 자극이 아니라, 한 번에 확정되는 사건(몸에 뭔가 맞았다)을
 * 의심으로 옮기는 통로다. 미터를 밖에서 직접 만지는 곳이 여기 하나뿐이어야
 * 티어 계산과 잠금 규칙이 한 군데에 남는다.
 */
export function bump(
  state: SuspicionState,
  minMeter: number,
  at: Vec2 | null,
  tuning: Tuning,
): SuspicionState {
  const meter = clamp(Math.max(state.meter, minMeter), 0, tuning.suspicion.max);
  const tier = tierOf(meter, tuning);
  const locked = tier === "curious" || tier === "alert";
  return {
    ...state,
    meter,
    tier,
    lastKnown: at ?? state.lastKnown,
    sinceStimulusMs: 0,
    tierLockMs: locked
      ? Math.max(
          state.tierLockMs,
          tier === "alert" ? tuning.suspicion.alertFloorLockMs : tuning.suspicion.curiousFloorLockMs,
        )
      : state.tierLockMs,
  };
}

/**
 * 의심 미터를 최소 minMeter에 붙들되 새 자극으로 기록하지 않는다.
 *
 * 영구 경계처럼 상태 하한만 유지해야 하는 규칙이 bump를 매 프레임 호출하면
 * 마지막 직접 자극 시각도 매번 0으로 돌아가 동료 경보가 영원히 재전파된다.
 */
export function holdAtLeast(
  state: SuspicionState,
  minMeter: number,
  tuning: Tuning,
): SuspicionState {
  const meter = clamp(Math.max(state.meter, minMeter), 0, tuning.suspicion.max);
  return {
    ...state,
    meter,
    tier: tierOf(meter, tuning),
  };
}

/**
 * 플레이어가 추적 시작 목격점의 수색 반경 경계에 도달했을 때 추적 기억을 지운다.
 * 영구 경계는 본인의 경계 하한만 보존하고 더는 달아난 플레이어를 수색하지 않는다.
 */
export function disengage(
  state: SuspicionState,
  permanentAlert: boolean,
  tuning: Tuning,
): SuspicionState {
  const meter = permanentAlert ? tuning.suspicion.alertThreshold : tuning.suspicion.floor;
  return {
    ...state,
    meter,
    tier: tierOf(meter, tuning),
    tierLockMs: 0,
    sinceStimulusMs: Number.MAX_SAFE_INTEGER,
    wasExposed: false,
    lastKnown: null,
    pursuitOrigin: null,
  };
}

export function tierOf(meter: number, tuning: Tuning): SuspicionTier {
  const s = tuning.suspicion;
  if (meter >= s.spottedThreshold) return "spotted";
  if (meter >= s.alertThreshold) return "alert";
  if (meter >= s.curiousThreshold) return "curious";
  return "calm";
}

/** 티어가 강등될 때 미터가 떨어질 수 있는 하한. 히스테리시스의 실체. */
function tierFloor(tier: SuspicionTier, tuning: Tuning): number {
  const s = tuning.suspicion;
  switch (tier) {
    case "spotted":
    case "alert":
      return s.alertThreshold;
    case "curious":
      return s.curiousThreshold;
    default:
      return 0;
  }
}

function lockMsFor(tier: SuspicionTier, tuning: Tuning): number {
  const s = tuning.suspicion;
  switch (tier) {
    case "spotted":
    case "alert":
      return s.alertFloorLockMs;
    case "curious":
      return s.curiousFloorLockMs;
    default:
      return 0;
  }
}

export function step(
  state: SuspicionState,
  input: SuspicionInput,
  tuning: Tuning,
  dtMs: number,
): SuspicionResult {
  const s = tuning.suspicion;
  const dt = dtMs / 1000;
  const exposed = input.exposure > 0;

  let meter = state.meter;
  let lastKnown = state.lastKnown;
  let pursuitOrigin = state.pursuitOrigin;
  let sinceStimulusMs = state.sinceStimulusMs;

  // 콘 진입 즉시 부여. 이 한 줄이 "보이지 않는 누적으로 죽지 않는다"를 보장한다.
  if (exposed && !state.wasExposed) {
    meter += s.coneEntryBump;
  }

  if (exposed) {
    meter += input.exposure * s.baseGainPerSec * dt;
    sinceStimulusMs = 0;
    if (input.stimulusAt !== null) {
      lastKnown = input.stimulusAt;
      if (pursuitOrigin === null) pursuitOrigin = input.stimulusAt;
    }
  }

  if (input.heard > 0) {
    meter += input.heard * s.noiseGain;
    sinceStimulusMs = 0;
    if (input.stimulusAt !== null) lastKnown = input.stimulusAt;
    // 유인은 들린 순간 반드시 확인하러 가게 만든다. 거리에 따른 감쇠는
    // 얼마나 크게 반응하는지만 정하고, 반응 여부를 정하지는 않는다.
    // 콘 진입 즉시 bump 를 주는 것과 같은 종류의 규칙이다.
    if (input.heardLure) meter = Math.max(meter, s.curiousThreshold);
  }

  if (input.propagated > 0) {
    meter += input.propagated;
  }

  // 동료의 경보는 의심량을 올리지만 새 시각·청각 자극은 아니다. 직접 자극이
  // 끊긴 시간은 계속 흘러야 서로의 경보만 되받아 수색이 영구 유지되지 않는다.
  if (!exposed && input.heard <= 0) {
    sinceStimulusMs += dtMs;
    // 전파를 받은 바로 그 프레임에는 증가와 감쇠를 동시에 적용하지 않는다.
    // 다만 감쇠 지연 시계는 초기화하지 않으므로 다음 무자극 프레임부터 이어진다.
    if (input.propagated <= 0) {
      const alerted = state.tier === "alert" || state.tier === "spotted";
      const delay = alerted ? s.alertDecayDelayMs : s.calmDecayDelayMs;
      if (sinceStimulusMs >= delay) {
        const rate = alerted ? s.alertDecayPerSec : s.calmDecayPerSec;
        meter -= rate * dt;
      }
    }
  }

  meter = clamp(meter, s.floor, s.max);

  // 티어 하한 잠금. 잠금이 남아 있는 동안은 현재 티어 아래로 못 내려간다.
  const tierLockMs = Math.max(0, state.tierLockMs - dtMs);
  if (tierLockMs > 0) {
    meter = Math.max(meter, tierFloor(state.tier, tuning));
  }

  const tier = tierOf(meter, tuning);
  if (tier === "calm" && !exposed) pursuitOrigin = null;
  const tierChanged = tier !== state.tier;
  // 승격했을 때만 잠금을 새로 건다. 강등에는 잠금을 걸지 않는다.
  const escalated = tierChanged && rank(tier) > rank(state.tier);

  return {
    state: {
      meter,
      tier,
      tierLockMs: escalated ? lockMsFor(tier, tuning) : tierLockMs,
      sinceStimulusMs,
      wasExposed: exposed,
      lastKnown,
      pursuitOrigin,
    },
    tierChanged,
  };
}

export function rank(tier: SuspicionTier): number {
  switch (tier) {
    case "spotted":
      return 3;
    case "alert":
      return 2;
    case "curious":
      return 1;
    default:
      return 0;
  }
}

/** 각성한 경비만 위를 본다. 이 규칙이 샹들리에 곡예 루트를 성립시킨다. */
export function pitchLimitFor(tier: SuspicionTier, tuning: Tuning): number {
  return tier === "calm" ? tuning.vision.calmPitchLimitDeg : tuning.vision.alertPitchLimitDeg;
}

/** 각성할수록 콘이 길어진다. 상태 변화가 화면에서 즉시 읽혀야 한다. */
export function rangeMultiplierFor(tier: SuspicionTier): number {
  switch (tier) {
    case "spotted":
      return 1.4;
    case "alert":
      return 1.4;
    case "curious":
      return 1.2;
    default:
      return 1;
  }
}
