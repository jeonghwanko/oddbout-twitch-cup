// 근접 전투 소리의 공용 박자 — 샘플 한 박의 모양, 파일 안 정점, 접촉에 맞추는 앞당김, 연타 음높이 걸음. 잠입 전투(`CombatAudio`)와
// 마을·무투장 대결(`CityFightAudio`)이 함께 쓴다. 두 편집표를 나눈 까닭: 무투장 페이지가 잠입 규칙 모듈을 받지 않게(2026-10-30).



export interface CombatSampleBeat {
  readonly key: string;
  readonly gain: number;
  readonly delayMs: number;
  readonly rate?: number;
  readonly attackMs?: number;
  readonly offsetMs?: number;
}

/** 파일 안 정점 시각(ms). `combat-*.ogg` 를 다시 만들면 함께 잰다(test/combat-audio.test.ts). */
export const COMBAT_SFX_PEAK_MS = Object.freeze({
  swingLight: 27,
  swingHeavy: 94,
  charge: 308,
});

/** 휘두름 정점을 접촉보다 이만큼 앞에 둔다. 공기 소리가 먼저, 살이 나중이다. */
export const SWING_LEAD_MS = 18;
/** 강타 차징의 끝(정점)을 접촉보다 이만큼 앞에 둔다. 그 사이를 휘두름이 채운다. */
export const CHARGE_LEAD_MS = 70;
/** 타격 과도음을 살리는 페이드인. 기본 8ms는 "퍽" 의 크랙을 깎는다. */
export const TRANSIENT_ATTACK_MS = 1;
/** 포효 튕김 "쿵" 의 페이드인. 크랙을 일부러 깎아 막 너머에서 먹힌 소리로 만든다. */
export const ROAR_REBUFF_ATTACK_MS = 18;
/** 쓰러진 몸이 바닥에 닿는 시각(ms). 타격음과 겹치지 않게 뒤로 뺀다. */
export const BODY_FALL_DELAY_MS = 210;

/**
 * 사슬 평타의 박자별 소리. 1·2타가 같은 파일 풀에서 음높이만 달라 복사본으로 들렸다(2026-09-27 C-C-C 캡처).
 * 음량이 .82 → .9 → 피니셔 1.0 으로 계단지고, 2타에는 강타 샘플을 낮게 늘인 몸통 "쿵" 을 밑에 깐다 —
 * 스트레이트가 몸에 박힌다. 새 파일 없이 기존 샘플만 쓴다.
 */
export const LIGHT_CHAIN_HIT_SOUND = Object.freeze({
  gain: Object.freeze({ 1: 0.82, 2: 0.9 } as const),
  bodyThump: Object.freeze({ gain: 0.42, rate: 0.72, delayMs: 8 }),
});

/**
 * 연타가 같은 샘플의 복사처럼 들리지 않게 음높이를 조금씩 흔든다. 난수 대신 순번으로 정해
 * 녹화·테스트가 같은 소리를 낸다.
 */
const RATE_WALK = Object.freeze([1, 0.955, 1.04, 0.975, 1.02]);

export function combatRate(variant: number): number {
  return RATE_WALK[((variant % RATE_WALK.length) + RATE_WALK.length) % RATE_WALK.length]!;
}

export function pickVariant<T>(list: readonly T[], variant: number): T {
  return list[((variant % list.length) + list.length) % list.length]!;
}
