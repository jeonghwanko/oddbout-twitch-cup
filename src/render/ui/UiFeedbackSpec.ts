import { clamp01, lerp } from "../../sim/geom";
import { easeInOutCubic, easeOutBack, easeOutBackWith, easeOutCubic } from "../art/easing";

/**
 * UI 반응의 수치와 곡선. Phaser 를 모르는 순수 모듈이라 헤드리스로 단언한다.
 *
 * 버튼 하나가 "눌렸다"고 읽히는 박자는 네 겹이다: 올라서면 몸이 살짝 떠오르고(리프트)
 * 황동 꺾쇠가 바깥에서 조여 들며 빛이 한 번 훑고 지나간다(호버). 누르면 몸이 눌렸다가
 * 튕겨 오르고, 흰 심이 금빛으로 식으며 인장 테가 밀려나고 불티가 좌우로 튄다(프레스). 꺼진 버튼은 붉게 떨며
 * 거절한다(리젝트). 키보드·패드의 포커스는 호버와 같은 말을 한다.
 *
 * 화면은 `UiFeedback.ts` 가 이 표를 읽어 그린다. 숫자를 그 파일에 다시 적지 않는다.
 */
export const UI_FEEDBACK = Object.freeze({
  hover: Object.freeze({
    /** 몸이 떠오르는 배율. 1.02 아래는 큰 화면에서 보이지 않고, 1.05 위는 옆 칸을 침범한다. */
    lift: 1.035,
    /** 큰 카드는 배율 대신 커지는 픽셀로 제한한다 — 400px 카드가 14px 부풀면 옆 카드를 덮는다. */
    liftMaxGrowPx: 8,
    inMs: 170,
    /** 줄지은 버튼을 훑을 때 앞 버튼이 빨리 비켜 준다. */
    outMs: 110,
    /**
     * 꺾쇠가 이 거리 밖에서 날아와 `frameOutset` 에 앉는다. 탭 간격 8px·카드 간격 6px 을
     * 넘지 않아야 옆 칸 위에 앉지 않는다.
     */
    frameOutsetFrom: 8,
    frameOutset: 3,
    /** 머무는 동안의 숨. 멈춘 UI 도 살아 있어 보이게 하되, 가만히 둘 때 초조하지 않을 만큼 느리게. */
    breatheAmplitude: 1,
    breathePeriodMs: 1_600,
    glowAlpha: 0.04,
    /** 꺾쇠의 넘침 정점에서 빛줄기가 출발해 한 박자로 읽힌다. */
    sheenDelayMs: 50,
    sheenMs: 260,
    sheenAlpha: 0.12,
    /** 빛줄기 폭(px, 카드 크기와 무관한 가는 금선)과 기울기(수평 이동량 / 높이). */
    sheenWidthPx: 18,
    sheenSlant: 0.6,
  }),
  press: Object.freeze({
    squash: 0.95,
    squashMaxShrinkPx: 12,
    squashMs: 33,
    /** 손을 뗀 뒤 튕겨 오르는 시간과 넘침 세기. 3 이면 약 18% 넘쳐 작은 배율 차이도 반동으로 보인다. */
    releaseMs: 220,
    releaseOvershoot: 3,
    /** 키보드 확정처럼 떼는 순간이 없는 누름은 이만큼 눌렀다가 스스로 튕긴다. `hero` 는 더 오래 눌러 무게를 준다. */
    tapHoldMs: 50,
    heroTapHoldMs: 90,
    /** 첫 프레임의 흰 심 — 누른 그 프레임이 가장 밝다. 그 뒤 금빛으로 식는다. */
    flashCoreAlpha: 0.35,
    flashCoreMs: 40,
    flashAlpha: 0.28,
    /** 최댓값을 한 프레임 붙든다. 화면 전체 히트스톱 대신 UI 가 쓰는 "멈춤". */
    flashHoldMs: 16,
    flashMs: 110,
    /** 섬광이 모서리 노치 밖으로 새지 않게 안쪽으로 줄인다. */
    flashInsetPx: 3,
    /**
     * 인장 테: 버튼 사각형이 바깥으로 밀려나며 사라진다. 원형 파문은 사각 버튼과 형태 언어가
     * 맞지 않고 위아래 패널로 번진다.
     */
    ringMs: 240,
    ringOutsetPx: 10,
    ringWidth: 4,
    ringEndWidth: 1.5,
    /** 메아리 테는 누름음의 둘째 크리스털(46ms)에 맞춘다. */
    ringEchoDelayMs: 46,
    ringEchoScale: 0.55,
    /** 불티: 버튼 좌우 가장자리에서 부채꼴로 튀는 마름모 조각. 세기는 수가 아니라 크기·비거리를 키운다. */
    sparkCount: 7,
    sparkMs: 200,
    sparkTravelMin: 26,
    sparkTravelMax: 48,
    sparkSizeMin: 3,
    sparkSizeMax: 5,
    /** 수평에서 벌어지는 부채 반각(라디안, ±35°). */
    sparkFan: 0.61,
    /** 아래로 떨어지는 약한 중력(px/s²). */
    sparkGravity: 240,
    /** 꺾쇠가 몸에 붙었다가 제자리로 튕기는 시간. */
    framePunchMs: 220,
    /** 누름이 버튼을 다시 그린 뒤 새 버튼이 호버를 이어받는 동안은 등장 연출·틱을 생략한다. */
    continuityMs: 400,
  }),
  reject: Object.freeze({
    /** "밀어 봤는데 안 들어감" — 살짝 눌렸다가 떤다. */
    squash: 0.98,
    squashMs: 30,
    shakePx: 5,
    shakeMs: 240,
    shakeCycles: 3,
    flashAlpha: 0.2,
    tintMs: 280,
  }),
  /** 다시 그려진 버튼을 "같은 자리"로 보는 중심·크기 허용 오차(px). 선택 강조로 1~2px 커지는 것까지 받는다. */
  slotTolerancePx: 4,
  /** 호버 소리의 최소 간격. 줄지어 선 버튼을 쓸고 지나가도 딸깍 소리가 뭉개지지 않는다. */
  hoverSoundCooldownMs: 45,
  intensity: Object.freeze({ subtle: 0.6, standard: 1, hero: 1.5 }),
});

export type UiFeedbackIntensity = keyof typeof UI_FEEDBACK.intensity;

export interface UiRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface UiPoint {
  readonly x: number;
  readonly y: number;
}

/** 시작 시각·목표값·길이·곡선으로 정해지는 한 구간. 트윈 매니저 없이 매 프레임 값을 읽는다. */
export interface UiCurve {
  readonly from: number;
  readonly to: number;
  readonly startMs: number;
  readonly durMs: number;
  /** `spring` 은 손을 뗀 반동 — 보통 `back` 보다 크게 넘친다. */
  readonly ease: "out" | "back" | "spring" | "inOut";
}

export function curveAt(curve: UiCurve, nowMs: number): number {
  if (curve.durMs <= 0) return curve.to;
  const t = clamp01((nowMs - curve.startMs) / curve.durMs);
  const e = curve.ease === "back" ? easeOutBack(t)
    : curve.ease === "spring" ? easeOutBackWith(t, UI_FEEDBACK.press.releaseOvershoot)
      : curve.ease === "inOut" ? easeInOutCubic(t) : easeOutCubic(t);
  return lerp(curve.from, curve.to, e);
}

export function curveDone(curve: UiCurve, nowMs: number): boolean {
  return nowMs - curve.startMs >= curve.durMs;
}

/** 지금 값에서 새 목표로 이어 가는 구간. 끊긴 트윈이 제자리로 튀지 않는다. */
export function retarget(current: number, to: number, nowMs: number, durMs: number, ease: UiCurve["ease"]): UiCurve {
  return { from: current, to, startMs: nowMs, durMs, ease };
}

/** 호버·포커스 동안 몸이 향하는 배율. 모션 감소·꺼진 버튼은 떠오르지 않는다. */
export function restingLift(
  bounds: UiRect,
  active: boolean,
  enabled: boolean,
  reducedMotion: boolean,
  /** 버튼이 직접 고른 호버 배율(타이틀 활자 메뉴처럼 크기 변화가 곧 반응인 곳). 픽셀 상한을 받지 않는다. */
  override: number | null = null,
): number {
  if (reducedMotion || !active || !enabled) return 1;
  if (override !== null) return override;
  const { lift, liftMaxGrowPx } = UI_FEEDBACK.hover;
  return 1 + Math.min(lift - 1, liftMaxGrowPx / longestSide(bounds));
}

/** 누른 동안의 배율. 떠오른 배율과 같은 규칙으로 큰 카드일수록 덜 눌린다. */
export function pressedScale(bounds: UiRect, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const { squash, squashMaxShrinkPx } = UI_FEEDBACK.press;
  return 1 - Math.min(1 - squash, squashMaxShrinkPx / longestSide(bounds));
}

function longestSide(bounds: UiRect): number {
  return Math.max(1, bounds.width, bounds.height);
}

/** 머무는 동안 꺾쇠의 숨. 0 에서 시작해 부드럽게 오간다. */
export function breatheOffset(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const { breatheAmplitude, breathePeriodMs } = UI_FEEDBACK.hover;
  return breatheAmplitude * (0.5 - 0.5 * Math.cos((2 * Math.PI * Math.max(0, elapsedMs)) / breathePeriodMs));
}

/** 거절 떨림의 수평 오프셋. 줄어드는 사인이라 끝에서 정확히 0 에 멈춘다. */
export function rejectShakeOffset(elapsedMs: number, reducedMotion: boolean): number {
  const { shakePx, shakeMs, shakeCycles } = UI_FEEDBACK.reject;
  if (reducedMotion || elapsedMs < 0 || elapsedMs >= shakeMs) return 0;
  const t = elapsedMs / shakeMs;
  return shakePx * Math.sin(2 * Math.PI * shakeCycles * t) * (1 - t);
}

/** 키보드·패드 확정이 스스로 튕기기 전까지 눌러 두는 시간. */
export function tapHoldMs(intensity: number): number {
  return intensity > UI_FEEDBACK.intensity.standard ? UI_FEEDBACK.press.heroTapHoldMs : UI_FEEDBACK.press.tapHoldMs;
}

export interface SparkRay {
  readonly angle: number;
  readonly travel: number;
  readonly size: number;
}

/**
 * 불티의 방향·비거리·크기. 좌우 두 부채(수평 ±35°)에 번갈아 싣는다 — 사각 버튼에서는
 * 옆으로 튀어야 형태가 맞고, 사방 균등 분포는 로딩 스피너 눈금으로 읽힌다.
 * `Math.random` 없이 `salt` 로 결정하되 누를 때마다 모양이 바뀐다.
 */
export function sparkRays(salt: number, intensity: number): readonly SparkRay[] {
  const p = UI_FEEDBACK.press;
  const rays: SparkRay[] = [];
  for (let index = 0; index < p.sparkCount; index += 1) {
    const side = (index + salt) % 2 === 0 ? 0 : Math.PI;
    const spread = (hash01(salt * 31 + index * 7 + 1) * 2 - 1) * p.sparkFan;
    rays.push({
      angle: side + spread,
      travel: lerp(p.sparkTravelMin, p.sparkTravelMax, hash01(salt * 17 + index * 13 + 5)) * intensity,
      size: lerp(p.sparkSizeMin, p.sparkSizeMax, hash01(salt * 23 + index * 11 + 3)) * Math.min(intensity, 1.3),
    });
  }
  return rays;
}

function hash01(value: number): number {
  const x = Math.sin(value * 12.9898) * 43_758.5453;
  return x - Math.floor(x);
}

/** `origin` 에서 `angle` 로 나아가 사각형을 벗어나는 거리. 불티는 버튼 가장자리에서 출발한다. */
export function rayExitDistance(rect: UiRect, origin: UiPoint, angle: number): number {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const ox = Math.min(rect.x + rect.width, Math.max(rect.x, origin.x));
  const oy = Math.min(rect.y + rect.height, Math.max(rect.y, origin.y));
  const tx = dx > 1e-9 ? (rect.x + rect.width - ox) / dx : dx < -1e-9 ? (rect.x - ox) / dx : Infinity;
  const ty = dy > 1e-9 ? (rect.y + rect.height - oy) / dy : dy < -1e-9 ? (rect.y - oy) / dy : Infinity;
  return Math.max(0, Math.min(tx, ty)) + Math.hypot(ox - origin.x, oy - origin.y);
}

export interface PressRing {
  /** 버튼 사각형에서 바깥으로 밀려난 거리(px). */
  readonly outset: number;
  readonly width: number;
  readonly alpha: number;
}

export interface PressShard {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly angle: number;
  readonly alpha: number;
}

export interface PressBurstFrame {
  /** 첫 프레임의 흰 심. */
  readonly coreAlpha: number;
  /** 흰 심 뒤로 식어 가는 금빛. */
  readonly flashAlpha: number;
  readonly rings: readonly PressRing[];
  readonly shards: readonly PressShard[];
  readonly done: boolean;
}

/**
 * 누른 순간부터 `elapsedMs` 뒤의 섬광·인장 테·불티 한 장.
 * 누른 프레임이 가장 밝고 크며(0~16ms 최댓값 유지), 240ms 안에 모두 사라진다.
 * 모션 감소에서는 번지는 움직임(테·불티)을 빼고 제자리 섬광만 짧게 남긴다.
 */
export function pressBurstFrame(
  elapsedMs: number,
  bounds: UiRect,
  origin: UiPoint,
  intensity: number,
  salt: number,
  reducedMotion: boolean,
  flashPeak: number = UI_FEEDBACK.press.flashAlpha,
): PressBurstFrame {
  const p = UI_FEEDBACK.press;
  const held = Math.max(0, elapsedMs - p.flashHoldMs);
  const coreAlpha = elapsedMs < p.flashCoreMs ? p.flashCoreAlpha * (1 - held / Math.max(1, p.flashCoreMs - p.flashHoldMs)) : 0;
  const flashAlpha = flashPeak * (1 - easeOutCubic(clamp01(held / (p.flashMs - p.flashHoldMs))));
  const flashDone = elapsedMs >= p.flashMs;
  if (reducedMotion) return { coreAlpha, flashAlpha, rings: [], shards: [], done: flashDone };

  const rings: PressRing[] = [];
  const ring = (delayMs: number, scale: number, peakAlpha: number): void => {
    const t = clamp01((elapsedMs - delayMs) / p.ringMs);
    if (elapsedMs < delayMs || t >= 1) return;
    rings.push({
      outset: p.ringOutsetPx * intensity * scale * easeOutCubic(t),
      width: lerp(p.ringWidth, p.ringEndWidth, t),
      alpha: peakAlpha * (1 - t) ** 1.5,
    });
  };
  ring(0, 1, 0.95);
  ring(p.ringEchoDelayMs, p.ringEchoScale, 0.45);

  const shards: PressShard[] = [];
  const sparkT = clamp01(elapsedMs / p.sparkMs);
  if (sparkT < 1) {
    const e = easeOutCubic(sparkT);
    const seconds = elapsedMs / 1_000;
    for (const ray of sparkRays(salt, intensity)) {
      const start = rayExitDistance(bounds, origin, ray.angle);
      const distance = start + ray.travel * e;
      shards.push({
        x: origin.x + Math.cos(ray.angle) * distance,
        y: origin.y + Math.sin(ray.angle) * distance + 0.5 * p.sparkGravity * seconds * seconds,
        size: ray.size * (1 - 0.6 * sparkT),
        angle: ray.angle,
        alpha: 1 - sparkT * sparkT,
      });
    }
  }
  const done = flashDone && elapsedMs >= Math.max(p.ringMs, p.ringEchoDelayMs + p.ringMs, p.sparkMs);
  return { coreAlpha, flashAlpha, rings, shards, done };
}

/** 꺾쇠가 대상에서 떨어진 거리. 누름 순간 몸에 붙었다가 탄력 있게 제자리로 돌아간다. */
export function framePunchOutset(elapsedMs: number, restOutset: number, reducedMotion: boolean): number {
  const { framePunchMs } = UI_FEEDBACK.press;
  if (reducedMotion || elapsedMs < 0 || elapsedMs >= framePunchMs) return restOutset;
  const snapMs = framePunchMs * 0.2;
  if (elapsedMs < snapMs) return lerp(restOutset, 0, easeOutCubic(elapsedMs / snapMs));
  return lerp(0, restOutset, easeOutBack((elapsedMs - snapMs) / (framePunchMs - snapMs)));
}

/**
 * 호버에 들어설 때 한 번 훑고 지나가는 빛줄기. 기울어진 띠를 대상 사각형에 잘라 준다.
 * 진행이 0 이면 왼쪽 밖, 1 이면 오른쪽 밖이라 시작·끝에 빈 조각이 남지 않는다.
 */
export function sheenPolygon(bounds: UiRect, progress: number): readonly UiPoint[] {
  const { sheenWidthPx, sheenSlant } = UI_FEEDBACK.hover;
  const band = sheenWidthPx;
  const slant = bounds.height * sheenSlant;
  const travel = bounds.width + band + slant;
  const left = bounds.x - band - slant + travel * clamp01(progress);
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;
  const band4: UiPoint[] = [
    { x: left + slant, y: top },
    { x: left + slant + band, y: top },
    { x: left + band, y: bottom },
    { x: left, y: bottom },
  ];
  const clipped = clipPolygonToRect(band4, bounds);
  // 모서리에 닿기만 한 조각(넓이 0)은 그리지 않는다.
  return polygonArea(clipped) < 0.5 ? [] : clipped;
}

function polygonArea(points: readonly UiPoint[]): number {
  let twice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Sutherland–Hodgman. 볼록 다각형을 축 정렬 사각형 안으로 자른다. */
export function clipPolygonToRect(points: readonly UiPoint[], rect: UiRect): readonly UiPoint[] {
  const edges: readonly ((p: UiPoint) => number)[] = [
    (p) => p.x - rect.x,
    (p) => rect.x + rect.width - p.x,
    (p) => p.y - rect.y,
    (p) => rect.y + rect.height - p.y,
  ];
  let output: readonly UiPoint[] = points;
  for (const inside of edges) {
    const input = output;
    const next: UiPoint[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index]!;
      const previous = input[(index + input.length - 1) % input.length]!;
      const currentIn = inside(current);
      const previousIn = inside(previous);
      if (currentIn >= 0) {
        if (previousIn < 0) next.push(intersect(previous, current, previousIn, currentIn));
        next.push(current);
      } else if (previousIn >= 0) {
        next.push(intersect(previous, current, previousIn, currentIn));
      }
    }
    output = next;
    if (output.length === 0) break;
  }
  return output;
}

function intersect(a: UiPoint, b: UiPoint, da: number, db: number): UiPoint {
  const t = da / (da - db);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 꺾쇠 팔 길이. 작은 칩에서는 짧아져 네 모서리가 서로 닿지 않는다. */
export function bracketArm(bounds: UiRect): number {
  return Math.max(5, Math.min(16, bounds.width * 0.22, bounds.height * 0.42));
}

/**
 * 대상 중심(`pivot`)을 고정한 채 배율 `k` 를 준 자리. 원점이 모서리인 글자·컨테이너도
 * 제 중심에서 커지고 줄어든다.
 */
export function scaleAboutPivot(rest: UiPoint, pivot: UiPoint, k: number): UiPoint {
  return { x: pivot.x + (rest.x - pivot.x) * k, y: pivot.y + (rest.y - pivot.y) * k };
}

/**
 * 두 테두리가 같은 버튼 자리인가. 클릭·커서 이동이 버튼을 다시 그리면 같은 자리에 새 오브젝트가
 * 선다 — 그것은 새 호버가 아니라 같은 호버의 연속이라 등장 연출·틱을 되풀이하지 않는다.
 */
export function sameSlot(a: UiRect, b: UiRect): boolean {
  const tolerance = UI_FEEDBACK.slotTolerancePx;
  return Math.abs(a.x + a.width / 2 - (b.x + b.width / 2)) <= tolerance
    && Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) <= tolerance
    && Math.abs(a.width - b.width) <= tolerance * 2
    && Math.abs(a.height - b.height) <= tolerance * 2;
}

/** 테두리 안의 기준점(0..1). 가운데면 제자리에서, 왼쪽이면 왼쪽 끝을 붙든 채 오른쪽으로 커진다. */
export interface UiAnchor {
  readonly x: number;
  readonly y: number;
}

export const CENTER_ANCHOR: UiAnchor = Object.freeze({ x: 0.5, y: 0.5 });

/** 쉬는 테두리를 기준점에서 `k` 배 한 테두리. 꺾쇠·빛이 커진 몸을 감쌀 때 쓴다. */
export function scaleRectAbout(rect: UiRect, k: number, anchor: UiAnchor = CENTER_ANCHOR): UiRect {
  const ax = rect.x + rect.width * anchor.x;
  const ay = rect.y + rect.height * anchor.y;
  return { x: ax + (rect.x - ax) * k, y: ay + (rect.y - ay) * k, width: rect.width * k, height: rect.height * k };
}

/**
 * 떠오른(배율 `k`·수평 떨림 `shakeX`) 몸의 테두리에서 쉬는 자리의 테두리를 되찾는다.
 * 기준점은 배율이 바뀌어도 제자리이므로 그 점을 붙든 채 크기만 `k` 로 나눈다. 쉬는 테두리를
 * 얼려 두면 부모 컨테이너가 트윈으로 움직여도 꺾쇠가 따라가지 못한다.
 */
export function restingBounds(scaled: UiRect, k: number, shakeX: number, anchor: UiAnchor = CENTER_ANCHOR): UiRect {
  const safeK = k > 1e-6 ? k : 1;
  const ax = scaled.x - shakeX + scaled.width * anchor.x;
  const ay = scaled.y + scaled.height * anchor.y;
  const width = scaled.width / safeK;
  const height = scaled.height / safeK;
  return { x: ax - width * anchor.x, y: ay - height * anchor.y, width, height };
}

/** 몸짓이 몸에 준 값(자리·배율)과, 그 사이 씬이 직접 바꾼 값을 가르는 장부 한 줄. */
export interface RestTrack {
  /** 몸짓을 뺀 쉬는 자리·배율. 씬이 옮기면 그만큼 함께 옮긴다. */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  /** 중심 고정 배율의 기준점(부모 좌표). 씬이 옮기면 함께 옮긴다. */
  pivotX: number;
  pivotY: number;
  /** 지난 프레임에 몸짓이 실제로 써 넣은 값. 아직 쓰지 않았으면 null. */
  applied: { x: number; y: number; scaleX: number; scaleY: number; k: number } | null;
}

/**
 * 이번 프레임에 써 넣을 자리·배율. 지난번에 써 넣은 값과 지금 값이 다르면 그 차이는 씬(레이아웃·
 * 트윈·창 크기 보정)이 준 것이므로 쉬는 자리에 흡수한다 — 몸짓은 "자기가 준 차이"만 소유하고,
 * 끝나면 씬이 마지막으로 둔 자리로 돌아간다.
 */
export function trackRest(
  track: RestTrack,
  current: { readonly x: number; readonly y: number; readonly scaleX: number; readonly scaleY: number },
  k: number,
  shakeX: number,
): { x: number; y: number; scaleX: number; scaleY: number } {
  const applied = track.applied;
  if (applied !== null) {
    const dx = current.x - applied.x;
    const dy = current.y - applied.y;
    if (dx !== 0 || dy !== 0) {
      track.x += dx;
      track.y += dy;
      track.pivotX += dx;
      track.pivotY += dy;
    }
    if (current.scaleX !== applied.scaleX && applied.k > 1e-6) track.scaleX = current.scaleX / applied.k;
    if (current.scaleY !== applied.scaleY && applied.k > 1e-6) track.scaleY = current.scaleY / applied.k;
  }
  const at = scaleAboutPivot({ x: track.x, y: track.y }, { x: track.pivotX, y: track.pivotY }, k);
  const next = { x: at.x + shakeX, y: at.y, scaleX: track.scaleX * k, scaleY: track.scaleY * k };
  track.applied = { ...next, k };
  return next;
}
