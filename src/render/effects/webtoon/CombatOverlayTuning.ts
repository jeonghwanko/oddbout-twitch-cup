/**
 * The fight overlays' tuning (`src/world/native-city-fight-overlay.json`) typed, and the small pure pieces every overlay shares:
 * the capped overlay clock, the prologue's camera kick, the photosensitivity-capped flash and the design-frame fit.
 *
 * Numbers live in the JSON (with notes); this file only gives them a shape so a typo in the JSON is a compile error. Another
 * encounter (the mansion keeper, a rival) brings its own JSON of the same shape through its `CombatEncounterConfig`.
 */
import overlay from "../../../world/native-city-fight-overlay.json";
import { clamp } from "../../../sim/geom";
import type { SlamTiming } from "./InkStrokeReveal";
import { PROLOGUE_FLASH_MAX_ALPHA } from "./TitleWebtoonPrologueTimeline";

export interface FightOverlayRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * One intro variant's beats (READY → FIGHT!, `CombatIntroTimeline`). Times are BEAT ms from the intro's first frame (the beat clock
 * holds through each stamp's hit-stop, `CombatIntroTimeline.introBeatMs`); `readyStopMs` / `fightStopMs` (the hit-stops) and
 * `exitDurMs` are screen ms. FIGHT! drops so that it lands as the backpedal ends (`backFromMs + backMs`).
 */
export interface FightIntroBeats {
  /** READY starts its drop. */
  readonly readyMs: number;
  /** The opening backpedal (`NativeCityFightBackpedal`): its start and length. */
  readonly backFromMs: number;
  readonly backMs: number;
  readonly readyStopMs: number;
  readonly fightStopMs: number;
  /** READY is knocked flat and out over this much of FIGHT!'s drop. */
  readonly readyOutMs: number;
  /** From FIGHT!'s impact to the release (its rebound and settle, then a short beat). */
  readonly fightHoldMs: number;
  readonly exitDurMs: number;
}

/** The intro letters' 쾅 (beat ms) — `CombatIntroTimeline.stampPoseAt`. */
export interface IntroStampTiming {
  readonly dropMs: number;
  readonly fromScale: number;
  readonly fromAngleDeg: number;
  readonly recoilDeg: number;
  readonly squashX: number;
  readonly squashY: number;
  readonly overX: number;
  readonly overY: number;
  readonly reboundMs: number;
  readonly settleMs: number;
}

/** One intro letter's impact strength (screen ms, design px; the world's thump in screen px). */
export interface IntroStampStrength {
  readonly shakePx: number;
  readonly shakeMs: number;
  readonly splatScale: number;
  readonly flashAlpha: number;
  /** The world camera's thump on the impact frame (the scene's fight shake: screen px, mostly vertical) and how long it rings. */
  readonly worldShakePx: number;
  readonly worldShakeMs: number;
}

export interface FightOverlayLetterSpot {
  readonly x: number;
  readonly y: number;
  readonly sizePx: number;
}

export interface FightVictoryPanel extends FightOverlayRect {
  readonly id: string;
  readonly tiltDeg: number;
  readonly letterbox: number;
}

export interface FightOverlayTuning {
  readonly frame: { readonly w: number; readonly h: number };
  readonly clock: { readonly maxStepMs: number; readonly captureTimeoutMs: number };
  readonly kick: { readonly kickDeg: number; readonly kickMs: number };
  readonly letters: {
    readonly strokeRatio: number;
    readonly strokeMinPx: number;
    readonly rimRatio: number;
    readonly shadowRatio: number;
    readonly skewX: number;
    readonly bakeScale: number;
    readonly slam: SlamTiming;
    readonly splat: { readonly count: number; readonly radiusRatio: number; readonly alpha: number; readonly ms: number };
  };
  readonly skipGlyph: { readonly marginPx: number; readonly heightPx: number; readonly fontPx: number; readonly alpha: number };
  readonly intro: {
    readonly loadTimeoutMs: number;
    readonly full: FightIntroBeats;
    readonly short: FightIntroBeats;
    readonly reduced: { readonly fadeMs: number; readonly backMs: number; readonly shortBackMs: number; readonly holdMs: number;
      readonly shortHoldMs: number };
    /** The opening spacing beyond the first swing's reach, and the probe step for walls / bodies behind them (`NativeCityFightBackpedal`). */
    readonly backpedal: { readonly marginStrides: number; readonly probeStrides: number };
    /** A rematch out of the defeat card's ink: how fast the ink clears off the world (screen ms). */
    readonly inkClearMs: number;
    readonly stamp: IntroStampTiming;
    readonly stamps: { readonly shakeStepMs: number; readonly ready: IntroStampStrength; readonly fight: IntroStampStrength };
    readonly exit: { readonly letterGrow: number; readonly letterLiftPx: number };
    readonly ready: FightOverlayLetterSpot;
    readonly fight: FightOverlayLetterSpot;
    readonly focusLines: { readonly count: number; readonly innerFrac: number; readonly seed: number; readonly alpha: number;
      readonly widthPx: number };
    readonly flash: { readonly ms: number };
  };
  readonly victory: {
    readonly afterLandMs: number;
    readonly crackMs: number;
    readonly paperInMs: number;
    readonly popAtMs: number;
    readonly popStaggerMs: number;
    readonly popMs: number;
    readonly popOvershoot: number;
    readonly popOffsetPx: number;
    readonly popFromScale: number;
    readonly contentZoomFrom: number;
    readonly holdZoom: number;
    readonly koMs: number;
    readonly stampMs: number;
    readonly skipFromMs: number;
    readonly holdEndMs: number;
    readonly crashMs: number;
    readonly coverFrom: number;
    readonly crashPull: number;
    readonly crashZoom: number;
    readonly framePx: number;
    readonly gutterShadowPx: number;
    readonly panels: readonly FightVictoryPanel[];
    readonly shock: { readonly headHeightPx: number; readonly shakeDeg: number; readonly shakeMs: number; readonly focusLines: number;
      readonly focusInner: number; readonly seed: number };
    readonly impact: { readonly captureWidthFrac: number; readonly focusY: number };
    readonly caption: { readonly fontPx: number; readonly padX: number; readonly padY: number };
    readonly ko: FightOverlayLetterSpot;
    readonly stamp: FightOverlayLetterSpot & { readonly tiltDeg: number; readonly fromScale: number; readonly dropMs: number;
      readonly settleMs: number; readonly borderPx: number; readonly padX: number; readonly padY: number; readonly seed: number };
    readonly flash: { readonly alpha: number; readonly ms: number };
    readonly reduced: { readonly fadeMs: number; readonly koMs: number; readonly stampMs: number; readonly holdEndMs: number };
  };
  readonly defeat: {
    readonly lieBeatMs: number;
    readonly inkMs: number;
    readonly inkAlpha: number;
    readonly downMs: number;
    readonly kumaMs: number;
    readonly bubbleMs: number;
    readonly cardMs: number;
    readonly slideMs: number;
    readonly popMs: number;
    readonly popOvershoot: number;
    readonly armMs: number;
    readonly fillMs: number;
    readonly exitMs: number;
    readonly skipFromMs: number;
    readonly rematchStrides: number;
    readonly blobs: { readonly count: number; readonly seed: number; readonly radiusPx: number };
    readonly down: FightOverlayRect & { readonly tiltDeg: number; readonly captureWidthFrac: number; readonly focusY: number };
    readonly kuma: FightOverlayRect & { readonly tiltDeg: number; readonly bustHeightPx: number; readonly focusLines: number;
      readonly focusInner: number; readonly seed: number };
    readonly bubble: { readonly x: number; readonly y: number; readonly maxW: number; readonly fontPx: number; readonly padX: number;
      readonly padY: number; readonly tailToX: number; readonly tailToY: number };
    readonly card: { readonly x: number; readonly y: number; readonly optionW: number;
      readonly optionH: number; readonly gapPx: number; readonly fontPx: number; readonly keyFontPx: number };
    readonly reduced: { readonly fadeMs: number; readonly cardMs: number };
  };
}

/** The city KUMA fight's overlay tuning (the JSON is the source; this is its typed view). */
export const NATIVE_CITY_FIGHT_OVERLAY: FightOverlayTuning = overlay;

/**
 * An overlay's own screen clock: a frame advances it by at most `clock.maxStepMs`, so a hitch or a tab coming back plays the
 * next beat late instead of skipping it. Never runs backwards.
 */
export class FightOverlayClock {
  private value = 0;

  constructor(private readonly maxStepMs: number) {}

  get ms(): number { return this.value; }

  step(dtMs: number): number {
    const step = Number.isFinite(dtMs) ? clamp(dtMs, 0, Math.max(0, this.maxStepMs)) : 0;
    this.value += step;
    return step;
  }

  /** Jumps forward (a skip) — never back. */
  jumpTo(ms: number): void {
    if (Number.isFinite(ms) && ms > this.value) this.value = ms;
  }
}

/**
 * The prologue's camera kick: each slam at `slamsMs` tilts the comic layer `kickDeg` (alternating −, +, − …) and eases back to
 * level over `kickMs`. Degrees; 0 under reduced motion (the caller passes no slams).
 */
export function fightKickDeg(slamsMs: readonly number[], ms: number, kick: FightOverlayTuning["kick"]): number {
  let deg = 0;
  slamsMs.forEach((at, index) => {
    const since = ms - at;
    if (since >= 0 && since < kick.kickMs) deg += (index % 2 === 1 ? 1 : -1) * kick.kickDeg * (1 - since / kick.kickMs);
  });
  return deg;
}

/**
 * A full-screen warm flash after each moment in `atMs` (fading over `durMs` from `alpha`). Whatever the tuning says it never
 * exceeds the title prologue's photosensitivity cap, and two flashes never add up — the stronger wins.
 */
export function fightFlashAt(atMs: readonly number[], ms: number, alpha: number, durMs: number): number {
  let best = 0;
  for (const at of atMs) {
    if (ms >= at && ms < at + durMs && durMs > 0) best = Math.max(best, alpha * (1 - (ms - at) / durMs));
  }
  return Math.min(PROLOGUE_FLASH_MAX_ALPHA, Math.max(0, best));
}

/** Design frame → visible view scale (contain: the whole 1280×720 frame is always on screen). */
export function fightFrameScale(viewW: number, viewH: number, frame: FightOverlayTuning["frame"]): number {
  if (!(viewW > 0) || !(viewH > 0) || !(frame.w > 0) || !(frame.h > 0)) return 1;
  return Math.min(viewW / frame.w, viewH / frame.h);
}
