/**
 * 브라우저 렌더 루프의 단일 프레임레이트 계약.
 *
 * sim은 별도의 `SIM_STEP_MS`로 60Hz 결정론을 유지한다. 이 설정은 Phaser가 화면을
 * 갱신하는 빈도만 제한해 고주사율 모니터의 불필요한 GPU 사용과 발열을 줄인다.
 */
export const RENDER_FRAME_RATE = Object.freeze({
  target: 60,
  limit: 60,
  forceSetTimeOut: false,
  smoothStep: true,
} as const);
