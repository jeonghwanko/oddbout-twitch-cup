import type { Tuning } from "./tuning";

/**
 * 플레이어 어시스트. 설정 화면에서 켜고 끄는 네 가지 도움이다 — 모두 기본 끔.
 *
 * 둘로 나뉜다.
 * - **게임 속도**는 sim 을 건드리지 않는다. 같은 스텝이 같은 입력으로 같은 수만큼 돌고, 벽시계만
 *   느리게 흐른다(`app/GameSpeed`). 그래서 도중에 바꿔도 되고 리플레이와 무관하다.
 * - **나머지 셋**은 튜닝 변환이다. `composeRun` 이 런을 짤 때 한 번 적용하고, 리플레이 번들이
 *   완성된 튜닝을 통째로 싣기 때문에 재생은 어시스트 설정을 몰라도 같은 결과를 낸다.
 *   런 도중에 바꾸면 다음 잠입(또는 다시 시작)부터 적용된다.
 *
 * 보상 불이익은 없다. 대신 런 기록(`RunPlayLog.assists`)과 리플레이 메타데이터에 켜진
 * 어시스트를 남겨 밸런스 데이터가 도움받은 런을 가려낼 수 있게 한다.
 */

export const GAME_SPEEDS = [1, 0.85, 0.7] as const;
export type GameSpeed = (typeof GAME_SPEEDS)[number];

export interface AssistOptions {
  readonly gameSpeed: GameSpeed;
  /** 경비 의심이 천천히 오르고, 붙잡히기 직전·포박 몸부림 창이 길다. */
  readonly lenientDetection: boolean;
  /** 플레이어가 받는 피해 절반. */
  readonly reducedDamage: boolean;
  /** 탈출·봉쇄 시간 제한 ×1.5. */
  readonly relaxedTimer: boolean;
}

export const NO_ASSISTS: AssistOptions = Object.freeze({
  gameSpeed: 1,
  lenientDetection: false,
  reducedDamage: false,
  relaxedTimer: false,
});

/**
 * 어시스트 효과량의 유일한 소유자. 값을 바꾸면 여기만 바꾼다.
 *
 * 의심 **증가량**만 줄이고 임계값(호기심 < 경계 < 발각)은 건드리지 않는다 — 단계 사이의
 * 순서가 곧 경비 행동 규칙이라 그 사다리를 옮기면 특정 단계를 영영 못 밟는 경비가 생긴다.
 * 콘 진입 즉시 bump(`coneEntryBump`)도 그대로 둔다. "보이지 않는 누적으로 죽지 않는다"는
 * 공정성 신호라 도움 모드에서 오히려 더 중요하다.
 */
export const ASSIST_EFFECTS = Object.freeze({
  /** 시야 노출 초당 증가와 소음 증가에 곱한다. */
  suspicionGainMul: 0.6,
  /** 몸 접촉 → 포박까지의 유지 시간(`guard.captureHoldMs`)과 포박 QTE 창(`run.struggleWindowMs`). */
  captureWindowMul: 1.5,
  /**
   * 받는 피해 배수. 체력은 이미 1/1000 단위로 반올림된 소수다(`PlayerHealthRules.damage`).
   * 0.5 는 이진수로 정확하므로 1 피해 → 0.5, 3 피해 → 1.5 가 오차 없이 쌓인다 —
   * 두 번 맞아야 한 칸이 빠진다. 올림(ceil)은 1 피해 공격을 전혀 줄이지 못해 기각했다.
   */
  damageTakenMul: 0.5,
  /** 런 시간·봉쇄 진입 시점·시간 초과 뒤 출구 셔터 간격. 비율이 같아야 국면 순서가 유지된다. */
  timerMul: 1.5,
});

/** 기록용 태그. 게임 속도는 가장 느리게 쓴 값을 남긴다. */
export const ASSIST_TAGS = [
  "gameSpeed85",
  "gameSpeed70",
  "lenientDetection",
  "reducedDamage",
  "relaxedTimer",
] as const;
export type AssistTag = (typeof ASSIST_TAGS)[number];

export function isAssistTag(value: unknown): value is AssistTag {
  return typeof value === "string" && (ASSIST_TAGS as readonly string[]).includes(value);
}

export function isGameSpeed(value: unknown): value is GameSpeed {
  return GAME_SPEEDS.some((speed) => speed === value);
}

/** 튜닝에 들어가는 어시스트만. 게임 속도는 튜닝이 아니다. */
export function tuningAssistTags(assist: AssistOptions): readonly AssistTag[] {
  return Object.freeze([
    ...(assist.lenientDetection ? ["lenientDetection" as const] : []),
    ...(assist.reducedDamage ? ["reducedDamage" as const] : []),
    ...(assist.relaxedTimer ? ["relaxedTimer" as const] : []),
  ]);
}

export function gameSpeedTag(speed: GameSpeed): AssistTag | null {
  if (speed === 0.7) return "gameSpeed70";
  if (speed === 0.85) return "gameSpeed85";
  return null;
}

/** 기록 순서를 `ASSIST_TAGS` 순서로 고정한다. 같은 조합은 언제나 같은 배열이다. */
export function runAssistTags(tuningTags: readonly AssistTag[], slowestSpeed: GameSpeed): readonly AssistTag[] {
  const speed = gameSpeedTag(slowestSpeed);
  const present = new Set<AssistTag>([...tuningTags, ...(speed === null ? [] : [speed])]);
  return Object.freeze(ASSIST_TAGS.filter((tag) => present.has(tag)));
}

/**
 * 완성된 런 튜닝에 어시스트를 입힌다. 꺼져 있으면 **같은 객체**를 돌려준다 — 기본 튜닝은
 * 바이트 단위로 그대로여야 기존 리플레이·밸런스 기록과 비교가 성립한다.
 */
export function assistTuning(tuning: Tuning, assist: AssistOptions): Tuning {
  if (!assist.lenientDetection && !assist.reducedDamage && !assist.relaxedTimer) return tuning;
  const effects = ASSIST_EFFECTS;
  let next = tuning;
  if (assist.lenientDetection) {
    next = {
      ...next,
      suspicion: {
        ...next.suspicion,
        baseGainPerSec: next.suspicion.baseGainPerSec * effects.suspicionGainMul,
        noiseGain: next.suspicion.noiseGain * effects.suspicionGainMul,
      },
      guard: { ...next.guard, captureHoldMs: Math.round(next.guard.captureHoldMs * effects.captureWindowMul) },
      run: { ...next.run, struggleWindowMs: Math.round(next.run.struggleWindowMs * effects.captureWindowMul) },
    };
  }
  if (assist.reducedDamage) {
    next = {
      ...next,
      combat: {
        ...next.combat,
        playerDamageTakenMul: (next.combat.playerDamageTakenMul ?? 1) * effects.damageTakenMul,
      },
    };
  }
  if (assist.relaxedTimer) {
    next = {
      ...next,
      run: {
        ...next.run,
        durationMs: Math.round(next.run.durationMs * effects.timerMul),
        lockdownAt: Math.round(next.run.lockdownAt * effects.timerMul),
        exitShutterMs: Math.round(next.run.exitShutterMs * effects.timerMul),
      },
    };
  }
  return next;
}
