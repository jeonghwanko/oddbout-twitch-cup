/**
 * Fight start overlay (pure): the READY → FIGHT! round start (2026-10-10, KOF grammar — 사용자 결정: 컷인 패널·VS·결투! 없이 살아 있는
 * 화면 위에 글자만 박는다) — beats, poses and the playback state machine.
 *
 * SysML v1.6 기반 설명용 요약 — `stm` CombatIntro. 화살표 = 전이 사건, `[ ]` = 가드, `/` = 진입 동작.
 *
 * ```
 * [load] --(the intro's own drawn letters ready | loadTimeoutMs)--> [play] / 싸움 정지 유지
 * [load] --(skip)--> [done] / 싸움 시작
 * [play] READY 쾅! + 뒷걸음(backFromMs..+backMs) → 간격 도달 = FIGHT! 쾅!! → 짧은 박자 --(releaseMs)--> [exit] / 싸움 시작 (released)
 * [play] --(skip)--> [exit] / 싸움 즉시 시작, 뒷걸음은 끝 자리로
 * [exit] letters punch up and fade --(endMs)--> [done]
 * ```
 *
 * The world shows underneath (no scrim, no cut-ins): both fighters back off to the opening spacing while READY holds
 * (`introBackpedalAt` — the progress the world's `NativeCityFightBackpedal` turns into positions and a reversed walk). FIGHT! lands on
 * the frame the spacing is reached. A rematch out of the defeat card's ink starts under the ink, which clears fast (`introInkAt`).
 *
 * Two clocks. The director's clock is SCREEN ms; the beats in the tuning are BEAT ms. Each stamp's hit-stop freezes the beat clock
 * (`introBeatMs`), so the letters AND the backpedal hold still on the impact frame while the screen-time effects — shake, flash,
 * kick, ink splat, focus-line burst, the world's thump — keep going. The fight is frozen (`holdsFight`) until the exit starts (or a
 * skip), not until the letters are gone: the fighters already move while they clear.
 *
 * Reduced motion: no stamp, hit-stop, shake, kick or flash — READY fades in, the backpedal (positioning) still plays, FIGHT! fades in
 * as it ends, both fade out as the fight goes. Every value is a function of the clock and the tuning (never an unseeded random).
 */
import { clamp01, lerp } from "../../../sim/geom";
import { easeOutCubic, easeOutExpo, smoothstep01 } from "../../art/easing";
import { spanProgress, type TitlePrologueSound } from "./TitleWebtoonPrologueTimeline";
import { FightOverlayClock, fightFlashAt, fightKickDeg, NATIVE_CITY_FIGHT_OVERLAY, type FightIntroBeats,
  type FightOverlayTuning, type IntroStampTiming } from "./CombatOverlayTuning";

export type CombatIntroVariant = "full" | "short";
export type CombatIntroLetter = "ready" | "fight";
export const COMBAT_INTRO_LETTERS: readonly CombatIntroLetter[] = Object.freeze(["ready", "fight"]);

/** One hit-stop on the beat clock: the beat holds at `atBeatMs` for `ms` screen ms. */
export interface IntroHitStop {
  readonly atBeatMs: number;
  readonly ms: number;
}

export interface CombatIntroSchedule extends FightIntroBeats {
  readonly variant: CombatIntroVariant;
  readonly reduced: boolean;
  /** Beat ms: the backpedal is over — the spacing is reached and FIGHT! lands (reduced: FIGHT! starts fading in). */
  readonly backEndMs: number;
  /** Beat ms: FIGHT! starts its drop (it lands on `backEndMs`). */
  readonly fightMs: number;
  /** Beat ms: FIGHT! has settled. */
  readonly settledMs: number;
  /** Screen ms: the fight is let go and the letters start clearing (reduced: the fade-out starts). */
  readonly releaseMs: number;
  /** Screen ms: the letters are gone. */
  readonly endMs: number;
  /** Screen ms the letters take to clear (reduced: the fade). */
  readonly outMs: number;
  /** Screen ms of each stamp's impact frame (the hit-stop starts there; reduced: where each letter starts fading in). */
  readonly impactMs: { readonly ready: number; readonly fight: number };
  /** The hit-stops in beat order (none under reduced motion). */
  readonly hitStops: readonly IntroHitStop[];
  /** Reduced motion: the letters' fade. */
  readonly fadeMs: number;
}

export function combatIntroSchedule(variant: CombatIntroVariant, reduced: boolean,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): CombatIntroSchedule {
  const short = variant === "short", beats = short ? tuning.intro.short : tuning.intro.full;
  const R = tuning.intro.reduced, T = tuning.intro.stamp;
  if (reduced) {
    // No drop or hit-stop: READY fades in at 0, the backpedal runs `backMs`, FIGHT! fades in as it ends, the hold, the fade-out.
    const backMs = short ? R.shortBackMs : R.backMs, holdMs = short ? R.shortHoldMs : R.holdMs;
    const releaseMs = backMs + holdMs;
    return Object.freeze({ ...beats, readyMs: 0, backFromMs: 0, backMs, fightHoldMs: holdMs, variant, reduced, backEndMs: backMs,
      fightMs: backMs, settledMs: backMs + R.fadeMs, releaseMs, endMs: releaseMs + R.fadeMs, outMs: R.fadeMs,
      impactMs: Object.freeze({ ready: 0, fight: backMs }), hitStops: Object.freeze([]), fadeMs: R.fadeMs });
  }
  const backEndMs = beats.backFromMs + beats.backMs, fightMs = backEndMs - T.dropMs;
  const hitStops = Object.freeze([
    { atBeatMs: beats.readyMs + T.dropMs, ms: Math.max(0, beats.readyStopMs) },
    { atBeatMs: backEndMs, ms: Math.max(0, beats.fightStopMs) },
  ].sort((a, b) => a.atBeatMs - b.atBeatMs));
  const toScreen = (beatMs: number): number => screenOf(hitStops, beatMs);
  const releaseMs = toScreen(backEndMs + beats.fightHoldMs);
  return Object.freeze({ ...beats, variant, reduced, backEndMs, fightMs, settledMs: backEndMs + T.reboundMs + T.settleMs, releaseMs,
    endMs: releaseMs + beats.exitDurMs, outMs: beats.exitDurMs,
    impactMs: Object.freeze({ ready: toScreen(beats.readyMs + T.dropMs), fight: toScreen(backEndMs) }), hitStops, fadeMs: R.fadeMs });
}

function screenOf(hitStops: readonly IntroHitStop[], beatMs: number): number {
  let shift = 0;
  for (const stop of hitStops) if (stop.atBeatMs < beatMs) shift += stop.ms;
  return beatMs + shift;
}

/** Screen ms → beat ms: the beat clock holds still through each hit-stop (and runs with the screen everywhere else). */
export function introBeatMs(s: CombatIntroSchedule, screenMs: number): number {
  let shift = 0;
  for (const stop of s.hitStops) {
    const at = stop.atBeatMs + shift;
    if (screenMs < at) break;
    if (screenMs < at + stop.ms) return stop.atBeatMs;
    shift += stop.ms;
  }
  return screenMs - shift;
}

/** Beat ms → the first screen ms the beat clock reaches it. */
export function introScreenMs(s: CombatIntroSchedule, beatMs: number): number {
  return screenOf(s.hitStops, beatMs);
}

/** How far the letters have cleared (0 until the release, 1 when they are gone). Linear in screen ms. */
export function introExitAt(s: CombatIntroSchedule, ms: number): number {
  return spanProgress(ms, s.releaseMs, s.outMs);
}

/**
 * The backpedal's progress (0..1, linear on the beat clock — it holds through READY's hit-stop like everything the beat clock
 * moves; the world eases it, `nativeCityBackpedalAt`). 1 from the spacing on (FIGHT!'s impact).
 */
export function introBackpedalAt(s: CombatIntroSchedule, ms: number): number {
  return spanProgress(introBeatMs(s, ms), s.backFromMs, s.backMs);
}

export type CombatIntroPhase = "ready" | "fight" | "hold" | "exit" | "done";

export function combatIntroPhaseAt(s: CombatIntroSchedule, ms: number): CombatIntroPhase {
  if (ms >= s.endMs) return "done";
  if (ms >= s.releaseMs) return "exit";
  const beat = introBeatMs(s, ms);
  if (beat < s.fightMs) return "ready";
  return beat < s.settledMs ? "fight" : "hold";
}

/** A rematch out of the defeat card's ink: the ink over the world (1 → 0, fast, screen time). 0 when not from ink. */
export function introInkAt(s: CombatIntroSchedule, ms: number, fromInk: boolean,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  if (!fromInk) return 0;
  return s.reduced ? 1 - spanProgress(ms, 0, s.fadeMs) : 1 - easeOutCubic(spanProgress(ms, 0, tuning.intro.inkClearMs));
}

export interface StampPose {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly angleDeg: number;
  readonly alpha: number;
}

/**
 * The 쾅 (beat ms from the drop's start): invisible before, drops from `fromScale` accelerating (ease-in) and tilted, lands
 * flattened (`squashX` × `squashY` — the frame the hit-stop holds), rebounds past 1 to `overX` × `overY` (ease-out), settles to
 * exactly 1 (smoothstep). `slamPoseAt` (shared with the title and the victory page) is left as it is.
 */
export function stampPoseAt(ms: number, T: IntroStampTiming): StampPose {
  if (!(ms > 0)) return { scaleX: T.fromScale, scaleY: T.fromScale, angleDeg: T.fromAngleDeg, alpha: 0 };
  if (ms < T.dropMs) {
    const p = ms / T.dropMs, e = p * p, scale = lerp(T.fromScale, 1, e);
    return { scaleX: scale, scaleY: scale, angleDeg: lerp(T.fromAngleDeg, T.recoilDeg, e), alpha: Math.min(1, p / 0.35) };
  }
  const q = ms - T.dropMs, angleDeg = T.recoilDeg * (1 - easeOutCubic(spanProgress(q, 0, T.reboundMs + T.settleMs)));
  if (q < T.reboundMs) {
    const r = q / T.reboundMs, e = 1 - (1 - r) ** 2;
    return { scaleX: lerp(T.squashX, T.overX, e), scaleY: lerp(T.squashY, T.overY, e), angleDeg, alpha: 1 };
  }
  if (q < T.reboundMs + T.settleMs) {
    const e = smoothstep01((q - T.reboundMs) / T.settleMs);
    return { scaleX: lerp(T.overX, 1, e), scaleY: lerp(T.overY, 1, e), angleDeg, alpha: 1 };
  }
  return { scaleX: 1, scaleY: 1, angleDeg: 0, alpha: 1 };
}

export interface IntroLetterPose extends StampPose {
  /** Design px the letter has risen (the exit's punch up). */
  readonly liftPx: number;
}

/**
 * READY / FIGHT!: each stamps on the beat clock (held through the hit-stops). READY is knocked flat and out while FIGHT! drops onto
 * its spot (`readyOutMs`, beat); on the exit FIGHT! punches up and fades. Reduced motion: READY fades in, crossfades to FIGHT! as the
 * backpedal ends, which fades out with the release.
 */
export function introLetterAt(s: CombatIntroSchedule, letter: CombatIntroLetter, ms: number,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): IntroLetterPose {
  if (s.reduced) {
    const alpha = letter === "ready"
      ? Math.min(spanProgress(ms, 0, s.fadeMs), 1 - spanProgress(ms, s.backEndMs, s.fadeMs * 0.5))
      : Math.min(spanProgress(ms, s.backEndMs, s.fadeMs), 1 - spanProgress(ms, s.releaseMs, s.fadeMs));
    return { scaleX: 1, scaleY: 1, angleDeg: 0, alpha, liftPx: 0 };
  }
  const X = tuning.intro.exit, beat = introBeatMs(s, ms);
  const pose = stampPoseAt(beat - (letter === "ready" ? s.readyMs : s.fightMs), tuning.intro.stamp);
  const out = introExitAt(s, ms), punch = out * out, grow = 1 + X.letterGrow * punch;
  if (letter === "ready") {
    // Flattened under FIGHT!'s drop: wider, much lower, gone by the time it lands.
    const k = spanProgress(beat, s.fightMs, s.readyOutMs);
    return { scaleX: pose.scaleX * (1 + 0.12 * k), scaleY: pose.scaleY * (1 - 0.55 * k), angleDeg: pose.angleDeg,
      alpha: pose.alpha * (1 - k) * (1 - out), liftPx: 0 };
  }
  return { scaleX: pose.scaleX * grow, scaleY: pose.scaleY * grow, angleDeg: pose.angleDeg, alpha: pose.alpha * (1 - out),
    liftPx: X.letterLiftPx * punch };
}

/** The ink splat behind a letter: bursts on the impact frame (screen time — it spreads through the hit-stop), fading over `letters.splat.ms`. */
export function introSplatAt(s: CombatIntroSchedule, letter: CombatIntroLetter, ms: number,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): { readonly scale: number; readonly alpha: number } {
  if (s.reduced) return { scale: 1, alpha: 0 };
  const at = s.impactMs[letter];
  if (ms < at || ms >= s.endMs) return { scale: 0, alpha: 0 };
  const k = spanProgress(ms, at, tuning.letters.splat.ms);
  return { scale: lerp(0.6, 1.1, easeOutCubic(k)) * tuning.intro.stamps[letter].splatScale,
    alpha: tuning.letters.splat.alpha * (1 - k) * (1 - introExitAt(s, ms)) };
}

/** The edge focus lines: they burst in on FIGHT!'s impact (screen time) and fly out with the exit. Reduced: they fade with FIGHT!. */
export function introFocusLinesAt(s: CombatIntroSchedule, ms: number): { readonly scale: number; readonly alpha: number } {
  if (s.reduced) return { scale: 1, alpha: clamp01(introLetterAt(s, "fight", ms).alpha) };
  if (ms < s.impactMs.fight || ms >= s.endMs) return { scale: 1, alpha: 0 };
  const k = easeOutExpo(spanProgress(ms, s.impactMs.fight, 140)), out = introExitAt(s, ms);
  return { scale: lerp(1.35, 1, k) * (1 + 0.3 * out * out), alpha: k * (1 - out) };
}

/**
 * The stamps' jolt (design px, screen time): from each impact frame the letters jolt `shakePx` (down first), flipping every
 * `shakeStepMs` (vertical every step, horizontal every other) and decaying to exactly 0 after `shakeMs`. None when reduced.
 */
export function introShakeAt(s: CombatIntroSchedule, ms: number,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): { readonly x: number; readonly y: number } {
  if (s.reduced) return { x: 0, y: 0 };
  const S = tuning.intro.stamps, stepMs = Math.max(1, S.shakeStepMs);
  let x = 0, y = 0;
  for (const letter of COMBAT_INTRO_LETTERS) {
    const strength = S[letter], since = ms - s.impactMs[letter];
    if (since < 0 || since >= strength.shakeMs) continue;
    const amp = strength.shakePx * (1 - since / strength.shakeMs) ** 2, step = Math.floor(since / stepMs);
    y += amp * (step % 2 === 0 ? 1 : -1);
    x += 0.45 * amp * (Math.floor(step / 2) % 2 === 0 ? 1 : -1);
  }
  return { x, y };
}

/** The letter layer's tilt (deg) — the prologue's kick on each impact frame (screen time). */
export function introKickDeg(s: CombatIntroSchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  return s.reduced ? 0 : fightKickDeg([s.impactMs.ready, s.impactMs.fight], ms, tuning.kick);
}

/** The warm flash on each impact frame (screen time; FIGHT! brighter; photosensitivity-capped, never summed). */
export function introFlashAt(s: CombatIntroSchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  if (s.reduced) return 0;
  const S = tuning.intro.stamps, durMs = tuning.intro.flash.ms;
  return Math.max(fightFlashAt([s.impactMs.ready], ms, S.ready.flashAlpha, durMs), fightFlashAt([s.impactMs.fight], ms, S.fight.flashAlpha, durMs));
}

/** The overlays' sounds: the title prologue's voices (`titlePrologueCue`) and the rubber stamp's thud (`stampThud`). */
export type CombatOverlaySound = TitlePrologueSound | "stamp";

export interface CombatOverlaySoundCue {
  readonly atMs: number;
  readonly kind: CombatOverlaySound;
  readonly pitch: number;
}

/**
 * The intro's sound beats (screen ms; the prologue's voices): READY's slam on its impact frame, FIGHT!'s lower slam doubled with the
 * deep thump on its own, a glint as FIGHT!'s hit-stop lets go and a whoosh as the letters punch out (the release).
 */
export function introSoundCues(s: CombatIntroSchedule): readonly CombatOverlaySoundCue[] {
  const list: CombatOverlaySoundCue[] = s.reduced
    ? [{ atMs: 0, kind: "pop", pitch: 0.9 }, { atMs: s.impactMs.fight, kind: "slam", pitch: 0.9 }]
    : [
      { atMs: s.impactMs.ready, kind: "slam", pitch: 0.85 },
      { atMs: s.impactMs.fight, kind: "slam", pitch: 0.68 },
      { atMs: s.impactMs.fight, kind: "thump", pitch: 1 },
      { atMs: s.impactMs.fight + s.fightStopMs, kind: "glint", pitch: 1 },
      { atMs: s.releaseMs, kind: "whoosh", pitch: 1.15 },
    ];
  return Object.freeze(list.sort((a, b) => a.atMs - b.atMs));
}

/** The stamps' impact frames in order (screen ms) — the scene thumps the world camera on each. None under reduced motion. */
export function introImpacts(s: CombatIntroSchedule): readonly { readonly atMs: number; readonly letter: CombatIntroLetter }[] {
  return s.reduced ? [] : Object.freeze([{ atMs: s.impactMs.ready, letter: "ready" as const }, { atMs: s.impactMs.fight, letter: "fight" as const }]);
}

/**
 * The intro's playback. `load` waits for the intro's own lazily loaded pieces (or its timeout) with the fight already frozen; `play`
 * runs the beats and lets the fight go at `releaseMs` (the exit start) while the letters clear until `endMs`; a skip lets the fight
 * go at once and jumps to the exit (the backpedal to its end). `holdsFight` is what the scene's freeze reads every frame.
 */
export class CombatIntroDirector {
  readonly schedule: CombatIntroSchedule;
  private readonly clock: FightOverlayClock;
  private readonly cues: readonly CombatOverlaySoundCue[];
  private readonly impacts: readonly { readonly atMs: number; readonly letter: CombatIntroLetter }[];
  private cueIndex = 0;
  private impactIndex = 0;
  private landed: CombatIntroLetter[] = [];
  private loadMs = 0;
  private phaseValue: "load" | "play" | "done" = "load";
  private releasedFlag = false;
  private skippedFlag = false;

  constructor(variant: CombatIntroVariant, reduced: boolean, readonly fromInk: boolean,
    private readonly tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY) {
    this.schedule = combatIntroSchedule(variant, reduced, tuning);
    this.clock = new FightOverlayClock(tuning.clock.maxStepMs);
    this.cues = introSoundCues(this.schedule);
    this.impacts = introImpacts(this.schedule);
  }

  get phase(): "load" | "play" | "done" { return this.phaseValue; }
  get ms(): number { return this.clock.ms; }
  get skipped(): boolean { return this.skippedFlag; }
  /** The fight stays frozen: loading, or playing before the exit starts and no skip let it go. */
  get holdsFight(): boolean { return this.phaseValue !== "done" && !this.releasedFlag; }
  /** Still drawing something (the letters clear on after the fight was let go). */
  get active(): boolean { return this.phaseValue !== "done"; }
  /** The backpedal's progress (0..1): 0 while loading, the beat clock's while playing, 1 once it is over, skipped or done. */
  get backpedal(): number {
    if (this.phaseValue === "done") return 1;
    return this.phaseValue === "load" ? 0 : introBackpedalAt(this.schedule, this.clock.ms);
  }

  /** One frame: `artReady` — the intro's own lazily requested pieces are in (or failed). Returns the sound cues that fall in this frame. */
  update(dtMs: number, artReady: boolean): readonly CombatOverlaySoundCue[] {
    if (this.phaseValue === "done") return [];
    if (this.phaseValue === "load") {
      this.loadMs += Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
      if (!artReady && this.loadMs < this.tuning.intro.loadTimeoutMs) return [];
      this.phaseValue = "play";
      return this.drainCues();
    }
    this.clock.step(dtMs);
    if (this.clock.ms >= this.schedule.releaseMs) this.releasedFlag = true;
    if (this.clock.ms >= this.schedule.endMs) this.finish();
    return this.drainCues();
  }

  /** The stamps that landed since the last call (their impact frames — the world's thump), oldest first. */
  consumeImpacts(): readonly CombatIntroLetter[] {
    const landed = this.landed;
    this.landed = [];
    return landed;
  }

  /** Any skip input: during the load the intro is dropped; during play the fight goes now and the letters clear away. */
  skip(): boolean {
    if (this.phaseValue === "done" || this.releasedFlag) return false;
    this.skippedFlag = true;
    this.releasedFlag = true;
    if (this.phaseValue === "load") { this.finish(); return true; }
    this.clock.jumpTo(this.schedule.releaseMs);
    // The cues and impacts the jump passed over stay silent; the exit's own cue (at releaseMs) is the beat the skip lands on.
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex]!.atMs < this.clock.ms) this.cueIndex++;
    while (this.impactIndex < this.impacts.length && this.impacts[this.impactIndex]!.atMs < this.clock.ms) this.impactIndex++;
    return true;
  }

  /** Ends now (scene shutdown, a view change). */
  finish(): void {
    this.phaseValue = "done";
    this.releasedFlag = true;
  }

  private drainCues(): readonly CombatOverlaySoundCue[] {
    while (this.impactIndex < this.impacts.length && this.impacts[this.impactIndex]!.atMs <= this.clock.ms) {
      const impact = this.impacts[this.impactIndex++]!;
      if (this.clock.ms - impact.atMs <= 250) this.landed.push(impact.letter);
    }
    const due: CombatOverlaySoundCue[] = [];
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex]!.atMs <= this.clock.ms) due.push(this.cues[this.cueIndex++]!);
    // A long-stalled frame does not fire a pile of old cues at once.
    return due.filter(cue => this.clock.ms - cue.atMs <= 250);
  }
}
