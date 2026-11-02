/**
 * 카메라 강조의 시간 곡선. Phaser 트윈 없이 "시작 뒤 경과 시간"만으로 값을 계산한다.
 *
 * 트윈으로 카메라를 흔들면 누가 먼저 `killTweensOf(cam)` 을 부르느냐로 우선순위가 갈렸고,
 * 멈춘 대리 트윈이 롤·밀기를 타격 도중의 값에 얼려 두었다. 곡선을 순수 함수로 두면
 * `CameraRig` 가 매 프레임 한 번 합성하고, fxlab 도 같은 곡선을 그대로 쓴다.
 */

export const CAMERA_ACCENT_COOLDOWN_MS = 2_500;
const ACCENT_ZOOM_MIN = 0.98;
const ACCENT_ZOOM_MAX = 1.025;

/** Decorative zoom never interrupts learning or repeats in a burst of events. */
export function cameraAccentFactor(requested: number, quiet: boolean, elapsedMs: number): number | null {
  if (quiet || elapsedMs < CAMERA_ACCENT_COOLDOWN_MS) return null;
  return Math.max(ACCENT_ZOOM_MIN, Math.min(ACCENT_ZOOM_MAX, requested));
}

export type CameraEase = (t: number) => number;

const EASES: Readonly<Record<string, CameraEase>> = Object.freeze({
  Linear: (t: number) => t,
  "Sine.easeIn": (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  "Sine.easeOut": (t: number) => Math.sin((t * Math.PI) / 2),
  "Sine.easeInOut": (t: number) => 0.5 * (1 - Math.cos(Math.PI * t)),
  "Quad.easeIn": (t: number) => t * t,
  "Quad.easeOut": (t: number) => t * (2 - t),
  "Quad.easeInOut": (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  "Cubic.easeOut": (t: number) => 1 - (1 - t) ** 3,
  "Cubic.easeInOut": (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
});

/** Phaser 이름 그대로의 이징. 모르는 이름은 조용히 선형으로 바꾸지 않고 던진다. */
export function cameraEase(name: string): CameraEase {
  const ease = EASES[name];
  if (ease === undefined) throw new Error(`Unknown camera ease: ${name}`);
  return ease;
}

/** 올라갔다 돌아오는 한 박자. `riseShare` 만큼 오르고 나머지 동안 0 으로 돌아온다. */
export interface AccentPulse {
  readonly peak: number;
  readonly riseMs: number;
  readonly fallMs: number;
  readonly riseEase: CameraEase;
  readonly fallEase: CameraEase;
}

/** 경과 시간에서의 강조 값. 끝났으면 null — 호출부는 채널을 비운다. */
export function accentPulseValue(pulse: AccentPulse, elapsedMs: number): number | null {
  if (elapsedMs < 0) return 0;
  if (elapsedMs < pulse.riseMs) return pulse.peak * pulse.riseEase(elapsedMs / pulse.riseMs);
  const fallElapsed = elapsedMs - pulse.riseMs;
  if (fallElapsed >= pulse.fallMs) return null;
  return pulse.peak * (1 - pulse.fallEase(fallElapsed / pulse.fallMs));
}

/**
 * 펀치 줌: 240ms 에 당기고 `max(480, durationMs)` 에 걸쳐 돌아온다. 값은 배율의 "1 에서 벗어난 양"이다.
 * 예전 `HeistScene.punchZoom` 트윈 체인과 같은 박자다.
 */
export function punchZoomPulse(accent: number, durationMs: number): AccentPulse {
  const ease = cameraEase("Sine.easeInOut");
  return { peak: accent - 1, riseMs: 240, fallMs: Math.max(480, durationMs), riseEase: ease, fallEase: ease };
}

/** 전투 결판 펀치 줌의 상한. 장식 줌(1.025)보다 크지만 화면 판독을 해치지 않는 선. */
export const COMBAT_ZOOM_MAX = 1.08;

/**
 * 전투 펀치 줌: `riseMs` 에 당기고 `fallMs` 에 걸쳐 easeOutCubic 으로 돌아온다(튀지 않는다).
 * 장식 줌 정책(상한 1.025·쿨다운)과 별개인 타격 강조다 — 피니시 한 방에만 쓴다.
 */
export function combatZoomPulse(factor: number, riseMs: number, fallMs: number): AccentPulse {
  const ease = cameraEase("Cubic.easeOut");
  const accent = Math.max(1, Math.min(COMBAT_ZOOM_MAX, factor));
  return { peak: accent - 1, riseMs: Math.max(0, riseMs), fallMs: Math.max(1, fallMs), riseEase: ease, fallEase: ease };
}

/** 롤: 40% 에 기울고 60% 에 걸쳐 수평으로 돌아온다. */
export function rollPulse(rad: number, durationMs: number): AccentPulse {
  const ease = cameraEase("Sine.easeInOut");
  return { peak: rad, riseMs: Math.round(durationMs * 0.4), fallMs: Math.round(durationMs * 0.6), riseEase: ease, fallEase: ease };
}

/** 밀기: 35% 에 타격 방향으로 밀고 65% 에 걸쳐 돌아온다. */
export function pushPulse(px: number, durationMs: number): AccentPulse {
  const ease = cameraEase("Quad.easeOut");
  return { peak: px, riseMs: Math.round(durationMs * 0.35), fallMs: Math.round(durationMs * 0.65), riseEase: ease, fallEase: ease };
}

/** 덜컹: 오르내림 없이 정해진 시간만 붙어 있는 오프셋(문 닫힘의 한 칸 내려앉음). */
export function holdPulse(value: number, durationMs: number): AccentPulse {
  const step: CameraEase = () => 1;
  return { peak: value, riseMs: 0, fallMs: durationMs, riseEase: step, fallEase: () => 0 };
}

/**
 * 화면 px 흔들림 한 번. Phaser `camera.shake` 의 강도는 "카메라 폭 × 배율"에 곱해져, 전투 표의
 * px 를 화면 높이로 나눠 넘기면 1.7 배율 16:9 에서 약 3 배로 흔들렸고 끝날 때까지 줄지 않았다
 * (2026-09-25 보스 필름: 6px 박자가 ±19px). 이 곡선은 진폭이 곧 화면 px 이고 (1−t)² 로 잦아든다.
 */
export interface ScreenShake {
  readonly px: number;
  readonly durationMs: number;
}

/** 흔들림 잡음이 바뀌는 간격(ms). 60fps 한 프레임 — 프레임마다 방향이 새로 뽑힌다. */
export const SCREEN_SHAKE_STEP_MS = 16;
/** 세로 진폭 비율. 옆에서 보는 타격이라 가로가 주가 된다. */
export const SCREEN_SHAKE_Y_SHARE = 0.6;
const shakeDecay = cameraEase("Quad.easeOut");

/**
 * 새 px 흔들림이 진행 중인 흔들림을 대신하는 조건. 남은 진폭이 새 진폭 이하이거나(더 세다)
 * 이미 이만큼 잦아들었으면 갈아 끼운다 — 약한 뒷박자가 센 타격의 흔들림을 끊지 않는다.
 */
const SCREEN_SHAKE_REPLACE_REMAINING = 0.35;

/** 진행 중인 흔들림(`current`, 경과 `elapsedMs`)이 있을 때 `px` 짜리 새 흔들림을 걸지. 리그와 리그 없는 화면이 같은 규칙을 쓴다. */
export function screenShakeReplaces(current: ScreenShake | null, elapsedMs: number, px: number): boolean {
  if (current === null) return true;
  const remaining = screenShakeAmplitude(current, elapsedMs);
  return px >= remaining || remaining <= current.px * SCREEN_SHAKE_REPLACE_REMAINING;
}

/** 경과 시간의 남은 진폭(화면 px). 끝났으면 0. */
export function screenShakeAmplitude(shake: ScreenShake, elapsedMs: number): number {
  if (shake.durationMs <= 0 || elapsedMs >= shake.durationMs) return 0;
  const t = Math.max(0, elapsedMs) / shake.durationMs;
  return shake.px * (1 - shakeDecay(t));
}

/**
 * 결정적 잡음 [0, 1). `Math.random` 을 쓰면 리플레이·테스트·필름이 매번 다른 그림을 낸다.
 * 정수 해시(Wang 계열)라 같은 박자는 언제나 같은 흔들림이다.
 */
function shakeHash(step: number, salt: number): number {
  let h = (Math.imul(step | 0, 0x27d4eb2d) ^ Math.imul(salt, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4_294_967_296;
}

/**
 * 경과 시간의 흔들림 오프셋(화면 px). 끝났으면 null — 호출부는 채널을 비운다.
 * 가로는 프레임마다 방향을 바꿔(최소 55% 진폭) 떨림으로 읽히고, 세로는 부호까지 잡음이다.
 */
export function screenShakeOffset(shake: ScreenShake, elapsedMs: number): { readonly x: number; readonly y: number } | null {
  const amplitude = screenShakeAmplitude(shake, elapsedMs);
  if (amplitude <= 0) return null;
  const step = Math.floor(Math.max(0, elapsedMs) / SCREEN_SHAKE_STEP_MS);
  const side = step % 2 === 0 ? 1 : -1;
  const x = side * amplitude * (0.55 + 0.45 * shakeHash(step, 1));
  const y = amplitude * SCREEN_SHAKE_Y_SHARE * (shakeHash(step, 2) * 2 - 1);
  return { x, y };
}

/** 세로 쿵의 튐 주파수(Hz). 마을 대결의 내려찍기·착지가 땅을 울리는 박자다. */
const SCREEN_THUMP_HZ = 22;

/**
 * 세로 쿵 한 번의 경과 시간 오프셋(화면 px, 세로만). 22Hz 로 위아래로 튀며 (1−t)² 로 잦아든다. 끝났으면 null.
 * 가로 흔들림(`screenShakeOffset`)과 따로 걸려 함께 더해진다.
 */
export function screenThumpOffset(thump: ScreenShake, elapsedMs: number): number | null {
  const amplitude = screenShakeAmplitude(thump, elapsedMs);
  if (amplitude <= 0) return null;
  return amplitude * Math.cos(2 * Math.PI * SCREEN_THUMP_HZ * Math.max(0, elapsedMs) / 1000);
}
