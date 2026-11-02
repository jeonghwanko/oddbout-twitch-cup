import { clamp01 } from "../../sim/geom";

export interface AudioDynamicsProfile {
  readonly thresholdDb: number;
  readonly kneeDb: number;
  readonly ratio: number;
  readonly attackSeconds: number;
  readonly releaseSeconds: number;
}

/**
 * 볼륨·게인 전용 정규화.
 *
 * 공용 `clamp01` 과 달리 비유한값을 0 으로 떨어뜨린다. 설정에서 깨진 값이 들어오면
 * `NaN` 게인이 WebAudio 노드를 조용히 먹통으로 만들기 때문이다 — 소리가 안 나는데
 * 예외도 안 나서 원인을 찾기 어렵다. 그래서 여기만 다른 계약을 이름으로 드러낸다.
 * `SfxPlayer` 의 사용자 음량과 `AudioEngine` 의 루프 게인이 이 하나를 같이 쓴다.
 */
export function clampVolume(value: number): number {
  return Number.isFinite(value) ? clamp01(value) : 0;
}

/** WebAudio 그래프와 테스트가 함께 소비하는 최종 믹스 SSOT. */
export const AUDIO_MIX = Object.freeze({
  effectsBusGain: 0.28,
  sampleAttackSeconds: 0.008,
  sampleReleaseSeconds: 0.055,
  loopFadeInSeconds: 2,
  /**
   * 첫 타이틀 웹툰 프롤로그가 곡을 여는 어택. 컷이 곡의 첫 박(파일 시작)부터 박자에 붙으므로 2초 페이드 대신
   * 클릭만 막는 짧은 상승으로 연다(`AudioEngine.armLoopAttack`). 곧바로 시작하지 못하면 평소 페이드를 쓴다.
   */
  loopDownbeatAttackSeconds: 0.02,
  /**
   * 소리를 내던 루프를 완전히 멈출 때(컷신 진입·잠입 종료)의 짧은 꼬리. 딱 끊으면
   * 파형 중간에서 잘려 클릭음이 난다. 곡 교체는 이 값이 아니라 `loopFadeInSeconds`
   * 로 교차한다 — 새 곡이 올라오는 길이만큼 옛 곡이 물러난다.
   */
  loopStopFadeSeconds: 0.12,
  loopGainSmoothingSeconds: 0.16,
  effectsDynamics: Object.freeze({
    thresholdDb: -20,
    kneeDb: 16,
    ratio: 3.5,
    attackSeconds: 0.008,
    releaseSeconds: 0.2,
  } satisfies AudioDynamicsProfile),
  ambienceDynamics: Object.freeze({
    thresholdDb: -26,
    kneeDb: 18,
    ratio: 5,
    attackSeconds: 0.035,
    releaseSeconds: 0.45,
  } satisfies AudioDynamicsProfile),
});
