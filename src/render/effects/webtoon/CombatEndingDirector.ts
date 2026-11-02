
import type { StringKey } from "../../../app/i18n";
import { pickLocalized, type Locale, koOrEn } from "../../../app/Locale";
import { clamp01, lerp } from "../../../sim/geom";
import { KUMA_FIGHT_ART, KUMA_FIGHT_LETTERS, kumaFightArtReady, kumaFightLetterArtId, kumaFightLetterPath,
  type KumaFightArtId, type KumaFightLetterId } from "../../../assets/KumaFightArtCatalog";
import { easeInCubic, easeOutBackWith, easeOutCubic, easeOutExpo } from "../../art/easing";
import { slamPoseAt, type SlamPose } from "./InkStrokeReveal";
import { spanProgress } from "./TitleWebtoonPrologueTimeline";
import { FightOverlayClock, fightFlashAt, fightKickDeg, NATIVE_CITY_FIGHT_OVERLAY, type FightOverlayTuning } from "./CombatOverlayTuning";
import type { CombatOverlaySoundCue } from "./CombatIntroTimeline";

// ── 조우 설정 ────────────────────────────────────────────────────────────

/**
 * Keys an encounter's overlay lines may use. They carry no placeholders — the overlays print them as they are (a key with
 * `{name}` would need its params, which `t` enforces). A new encounter widens this with its own prefix.
 */
export type CombatOverlayLineKey = Extract<StringKey, `village.kumaFight.${string}` | `fight.fighter.${string}`
  | "arena.tournament.toBracket" | "arena.tournament.toTown" | "arena.tournament.rematch" | "arena.tournament.toSelect">;

/** One crop of a rival's own sprite frame (frame-local px) and which way that art faces. */
export interface CombatRivalFrameCut {
  readonly key: string;
  readonly frame: number;
  readonly region: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly facesRight: boolean;
}

/**
 * A rival's own frames for the overlay cuts whose drawn piece is missing (a skinned fighter, `NativeCityFighters`): his
 * standing cell (`bust`), a head crop for the shock panel and his recoil cell. Without them the cuts fall back to KUMA's frames.
 */
export interface CombatRivalFrames {
  readonly bust: CombatRivalFrameCut;
  readonly shock: CombatRivalFrameCut | null;
  readonly recoil: CombatRivalFrameCut | null;
}


export type CombatFighterId = "player" | "kuma";

/** Where an encounter's drawn pieces live and which of them are ready. Anything not ready draws its code fallback. */
export interface CombatOverlayArtCatalog {
  /** Texture key + `public/` path of a drawn illustration when it is ready, else null. */
  readonly art: (id: string) => { readonly key: string; readonly path: string } | null;
  /** Texture key + path of a drawn letter in `locale` when it is ready, else null (the view bakes `letterText` in the code font). */
  readonly letter: (id: string, locale: Locale) => { readonly key: string; readonly path: string } | null;
  readonly letterText: (id: string, locale: Locale) => string;
}

export interface CombatEncounterConfig {
  readonly id: string;
  readonly tuning: FightOverlayTuning;
  readonly player: CombatFighterId;
  readonly rival: CombatFighterId;
  readonly catalog: CombatOverlayArtCatalog;
  /** Drawn art ids (catalog ids) for each overlay slot (the intro draws none since its 2026-10-10 READY / FIGHT! pass). */
  readonly art: {
    /** Victory panel C (opaque panel art). */
    readonly decisiveHit: string;
    /** Victory panel B / defeat KUMA panel expression busts (transparent). */
    readonly rivalShock: string;
    readonly rivalAnger: string;
  };
  /** Letter ids: the intro's READY / FIGHT!, the victory's K.O. and stamp. */
  readonly letters: { readonly ready: string; readonly fight: string; readonly ko: string; readonly stamp: string };
  readonly lines: {
    /** Victory panel D caption. */
    readonly calmCaption: CombatOverlayLineKey;
    /** The rival's one-liner on the defeat card, rotating per defeat this visit. */
    readonly defeat: readonly CombatOverlayLineKey[];
    readonly retry: CombatOverlayLineKey;
    readonly leave: CombatOverlayLineKey;
  };
  /** The rival's own frames for cuts without a drawn piece; absent = KUMA's (`kumaCut`). */
  readonly rivalFrames?: CombatRivalFrames;

  readonly heroFrames?: CombatRivalFrames;
}

const kumaArtKey = (id: KumaFightArtId): string => `kuma-fight-${id}`;

/** The KUMA fight's catalog view (`KumaFightArtCatalog`, filled in by the art pass). */
export const KUMA_FIGHT_OVERLAY_CATALOG: CombatOverlayArtCatalog = Object.freeze({
  art: (id: string) => {
    if (!Object.hasOwn(KUMA_FIGHT_ART, id) || !kumaFightArtReady(id)) return null;
    const artId = id as KumaFightArtId;
    return { key: kumaArtKey(artId), path: KUMA_FIGHT_ART[artId] };
  },
  letter: (id: string, locale: Locale) => {
    if (!Object.hasOwn(KUMA_FIGHT_LETTERS, id)) return null;
    const letterId = id as KumaFightLetterId, artId = kumaFightLetterArtId(letterId, koOrEn(locale));
    return kumaFightArtReady(artId) ? { key: `kuma-fight-${artId}`, path: kumaFightLetterPath(letterId, koOrEn(locale)) } : null;
  },
  letterText: (id: string, locale: Locale) => Object.hasOwn(KUMA_FIGHT_LETTERS, id)
    ? pickLocalized(locale, KUMA_FIGHT_LETTERS[id as KumaFightLetterId]) : id,
});

/** The village KUMA duel. */
export const CITY_KUMA_ENCOUNTER: CombatEncounterConfig = Object.freeze({
  id: "city-kuma",
  tuning: NATIVE_CITY_FIGHT_OVERLAY,
  player: "player",
  rival: "kuma",
  catalog: KUMA_FIGHT_OVERLAY_CATALOG,
  art: Object.freeze({ decisiveHit: "decisiveHit", rivalShock: "kumaFaceShock", rivalAnger: "kumaFaceAnger" }),
  letters: Object.freeze({ ready: "ready", fight: "fight", ko: "ko", stamp: "kaltoe" }),
  lines: Object.freeze({
    calmCaption: "village.kumaFight.calmCaption",
    defeat: Object.freeze(["village.kumaFight.defeat.1", "village.kumaFight.defeat.2", "village.kumaFight.defeat.3"] as const),
    retry: "village.kumaFight.retry",
    leave: "village.kumaFight.leave",
  }),
});

// ── 승리 ────────────────────────────────────────────────────────────────

export interface VictorySchedule {
  readonly reduced: boolean;
  readonly crackMs: number;
  /** When each panel (A eyes, B shock, C impact, D calm) starts popping in. */
  readonly popAt: readonly number[];
  readonly popMs: number;
  readonly koMs: number;
  readonly stampMs: number;
  readonly skipFromMs: number;
  readonly holdEndMs: number;
  /** Crash back (reduced: the fade out). */
  readonly crashMs: number;
  readonly endMs: number;
}

export function victorySchedule(reduced: boolean, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): VictorySchedule {
  const V = tuning.victory, R = V.reduced;
  if (reduced) {
    return Object.freeze({ reduced, crackMs: 0, popAt: Object.freeze(V.panels.map(() => 0)), popMs: R.fadeMs, koMs: R.koMs,
      stampMs: R.stampMs, skipFromMs: R.koMs, holdEndMs: R.holdEndMs, crashMs: R.fadeMs, endMs: R.holdEndMs + R.fadeMs });
  }
  return Object.freeze({ reduced, crackMs: V.crackMs, popAt: Object.freeze(V.panels.map((_, index) => V.popAtMs + index * V.popStaggerMs)),
    popMs: V.popMs, koMs: V.koMs, stampMs: V.stampMs, skipFromMs: V.skipFromMs, holdEndMs: V.holdEndMs, crashMs: V.crashMs,
    endMs: V.holdEndMs + V.crashMs });
}

/** Crash-back progress 0..1 (eased in) — 0 before `holdEndMs`. */
function crashAt(s: VictorySchedule, ms: number): number {
  return s.reduced ? spanProgress(ms, s.holdEndMs, s.crashMs) : easeInCubic(spanProgress(ms, s.holdEndMs, s.crashMs));
}

/** How much of the page is still covering the game during the crash (1 until `coverFrom`, then down to 0). */
export function victoryCoverAt(s: VictorySchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  const c = crashAt(s, ms);
  if (s.reduced) return 1 - c;
  const from = tuning.victory.coverFrom;
  return 1 - clamp01((c - from) / Math.max(1e-6, 1 - from));
}

/** The paper page behind the panels (the gutters): in after the crack, out with the crash. */
export function victoryPaperAt(s: VictorySchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  const V = tuning.victory;
  const rise = s.reduced ? spanProgress(ms, 0, s.popMs) : easeOutCubic(spanProgress(ms, s.crackMs - V.paperInMs / 2, V.paperInMs));
  return rise * victoryCoverAt(s, ms, tuning);
}

/** The gutter cracks over the frozen game: grown 0..1 and their opacity (they give way to the paper). Null when not drawn. */
export function victoryCrackAt(s: VictorySchedule, ms: number): { readonly grow: number; readonly alpha: number } | null {
  if (s.reduced) return null;
  const last = (s.popAt.at(-1) ?? 0) + s.popMs;
  if (ms >= last) return null;
  return { grow: Math.max(0.001, easeOutCubic(spanProgress(ms, 0, s.crackMs))), alpha: 1 - spanProgress(ms, s.popAt[0] ?? s.crackMs, last - (s.popAt[0] ?? 0)) };
}

export interface VictoryPanelPose {
  readonly shown: boolean;
  /** Offset from the panel's home (design px). */
  readonly dx: number;
  readonly dy: number;
  readonly angleDeg: number;
  readonly scale: number;
  readonly alpha: number;
  /** Zoom of the panel's content inside its frame (1 = cover). */
  readonly zoom: number;
}

/**
 * Panel `index` of the page: pushed `popOffsetPx` out from the page centre, it snaps home with easeOutBack, untilted to its tilt,
 * 0.96 → 1; its content zooms 1.25 → 1, then pushes in slowly through the hold. The crash pulls it `crashPull` toward the centre,
 * zooming `crashZoom`, fading from `coverFrom`.
 */
export function victoryPanelAt(s: VictorySchedule, index: number, ms: number,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): VictoryPanelPose {
  const V = tuning.victory, panel = V.panels[index];
  const at = s.popAt[index] ?? 0;
  if (!panel || ms < at) return { shown: false, dx: 0, dy: 0, angleDeg: 0, scale: 1, alpha: 0, zoom: 1 };
  const cover = victoryCoverAt(s, ms, tuning);
  if (s.reduced) {
    return { shown: true, dx: 0, dy: 0, angleDeg: panel.tiltDeg, scale: 1, alpha: spanProgress(ms, at, s.popMs) * cover, zoom: 1 };
  }
  const k = spanProgress(ms, at, s.popMs), e = easeOutBackWith(k, V.popOvershoot);
  const cx = panel.x + panel.w / 2 - tuning.frame.w / 2, cy = panel.y + panel.h / 2 - tuning.frame.h / 2;
  const length = Math.hypot(cx, cy) || 1;
  const push = V.popOffsetPx * (1 - e), c = crashAt(s, ms);
  const dx = cx / length * push - cx * V.crashPull * c, dy = cy / length * push - cy * V.crashPull * c;
  const settle = easeOutCubic(clamp01((k - 0.15) / 0.45));
  const hold = spanProgress(ms, at + s.popMs, Math.max(1, s.holdEndMs - at - s.popMs));
  return { shown: true, dx, dy, angleDeg: panel.tiltDeg * clamp01(e), scale: lerp(V.popFromScale, 1, e) * (1 + V.crashZoom * c),
    // Opaque from its first frame (2026-10-17: the fade-in read as a half-transparent panel seeping in over a blank cell).
    alpha: cover, zoom: lerp(V.contentZoomFrom, 1, settle) * (1 + V.holdZoom * hold) };
}

export type VictoryLetter = "ko" | "stamp";


export function victoryLetterAt(s: VictorySchedule, letter: VictoryLetter, ms: number,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): SlamPose {
  const V = tuning.victory, at = letter === "ko" ? s.koMs : s.stampMs;
  const cover = victoryCoverAt(s, ms, tuning);
  if (s.reduced) return { scale: 1, angleDeg: 0, alpha: spanProgress(ms, at, 160) * cover };
  const pose = letter === "ko" ? slamPoseAt(ms - at, tuning.letters.slam)
    : slamPoseAt(ms - at, { dropMs: V.stamp.dropMs, settleMs: V.stamp.settleMs, fromScale: V.stamp.fromScale, fromAngleDeg: -8,
      recoilDeg: 3, squashScale: 0.92 });
  const c = crashAt(s, ms);
  return { scale: pose.scale * (1 + 0.12 * c), angleDeg: pose.angleDeg, alpha: pose.alpha * cover };
}

/** The ink splat under "K.O." (bursts on landing). */
export function victorySplatAt(s: VictorySchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): { readonly scale: number; readonly alpha: number } {
  if (s.reduced) return { scale: 1, alpha: 0 };
  const landed = s.koMs + tuning.letters.slam.dropMs;
  if (ms < landed) return { scale: 0, alpha: 0 };
  const k = spanProgress(ms, landed, tuning.letters.splat.ms);
  return { scale: lerp(0.6, 1.15, easeOutCubic(k)), alpha: tuning.letters.splat.alpha * (1 - k) };
}

/** KUMA's head in panel B shakes ±`shock.shakeDeg` every `shakeMs` while the page holds (his mask cannot gasp). */
export function victoryShockShakeDeg(s: VictorySchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  if (s.reduced) return 0;
  const S = tuning.victory.shock, start = (s.popAt[1] ?? 0) + s.popMs * 0.5;
  if (ms < start || ms >= s.holdEndMs) return 0;
  const decay = 1 - 0.6 * spanProgress(ms, start, s.holdEndMs - start);
  return (Math.floor((ms - start) / Math.max(1, S.shakeMs)) % 2 === 0 ? 1 : -1) * S.shakeDeg * decay;
}

export function victoryKickDeg(s: VictorySchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  return s.reduced ? 0 : fightKickDeg([s.koMs + tuning.letters.slam.dropMs, s.stampMs + tuning.victory.stamp.dropMs], ms, tuning.kick);
}

export function victoryFlashAt(s: VictorySchedule, ms: number, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): number {
  if (s.reduced) return 0;
  return fightFlashAt([s.koMs + tuning.letters.slam.dropMs], ms, tuning.victory.flash.alpha, tuning.victory.flash.ms);
}

export function victorySoundCues(s: VictorySchedule, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): readonly CombatOverlaySoundCue[] {
  const drop = tuning.letters.slam.dropMs;
  const list: CombatOverlaySoundCue[] = s.reduced
    ? [{ atMs: 0, kind: "pop", pitch: 1 }, { atMs: s.koMs, kind: "slam", pitch: 0.8 }, { atMs: s.stampMs, kind: "stamp", pitch: 1 }]
    : [
      { atMs: 0, kind: "slash", pitch: 1 },
      ...s.popAt.map((at, index) => ({ atMs: at, kind: "pop" as const, pitch: 1 + index * 0.12 })),
      { atMs: s.koMs + drop, kind: "slam", pitch: 0.75 },
      { atMs: s.koMs + drop + 30, kind: "thump", pitch: 1 },
      { atMs: s.stampMs + tuning.victory.stamp.dropMs, kind: "stamp", pitch: 1 },
      { atMs: s.holdEndMs, kind: "whoosh", pitch: 1.1 },
    ];
  return Object.freeze(list.sort((a, b) => a.atMs - b.atMs));
}

// ── 패배 ────────────────────────────────────────────────────────────────

export interface DefeatSchedule {
  readonly reduced: boolean;
  readonly inkMs: number;
  readonly downMs: number;
  readonly kumaMs: number;
  readonly bubbleMs: number;
  readonly cardMs: number;
  readonly slideMs: number;
  readonly popMs: number;
  readonly armMs: number;
  readonly fillMs: number;
  readonly exitMs: number;
  readonly skipFromMs: number;
}

export function defeatSchedule(reduced: boolean, tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): DefeatSchedule {
  const D = tuning.defeat;
  return Object.freeze({ reduced, inkMs: reduced ? D.reduced.fadeMs : D.inkMs, downMs: D.downMs, kumaMs: D.kumaMs,
    bubbleMs: D.bubbleMs, cardMs: reduced ? D.reduced.cardMs : D.cardMs, slideMs: reduced ? D.reduced.fadeMs : D.slideMs,
    popMs: reduced ? D.reduced.fadeMs : D.popMs, armMs: D.armMs, fillMs: D.fillMs, exitMs: D.exitMs, skipFromMs: D.skipFromMs });
}

/** The closing after a choice: `retry` fills the screen with ink, `leave` lets the ink recede. 0..1. */
export interface DefeatClosing {
  readonly choice: CombatEndingOutcome;
  readonly progress: number;
}

/** The ink bleeding over the screen: blob growth 0..1 and the flat ink layer's opacity (filled solid by a retry, gone by a leave). */
export function defeatInkAt(s: DefeatSchedule, ms: number, closing: DefeatClosing | null,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): { readonly blob: number; readonly alpha: number } {
  const D = tuning.defeat;
  const k = spanProgress(ms, 0, s.inkMs);
  let alpha = D.inkAlpha * (s.reduced ? k : easeOutCubic(clamp01((k - 0.25) / 0.75)));
  let blob = s.reduced ? 0 : easeOutCubic(k);
  if (closing?.choice === "retry") alpha = lerp(alpha, 1, closing.progress);
  if (closing?.choice === "leave") { alpha *= 1 - closing.progress; blob *= 1 - easeOutCubic(closing.progress); }
  return { blob, alpha };
}

export interface DefeatPanelPose {
  readonly shown: boolean;
  readonly dx: number;
  readonly scale: number;
  readonly alpha: number;
}


export function defeatPanelAt(s: DefeatSchedule, panel: "down" | "kuma", ms: number, closing: DefeatClosing | null,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): DefeatPanelPose {
  const at = panel === "down" ? s.downMs : s.kumaMs;
  if (ms < at) return { shown: false, dx: 0, scale: 1, alpha: 0 };
  const out = closing ? easeInCubic(closing.progress) : 0;
  if (s.reduced) return { shown: true, dx: 0, scale: 1, alpha: spanProgress(ms, at, s.popMs) * (1 - out) };
  if (panel === "down") {
    const k = spanProgress(ms, at, s.slideMs);
    return { shown: true, dx: -tuning.frame.w * 0.75 * (1 - easeOutExpo(k)) - tuning.frame.w * 0.4 * out, scale: 1,
      alpha: clamp01(k * 4) * (1 - out) };
  }
  const k = spanProgress(ms, at, s.popMs);
  return { shown: true, dx: tuning.frame.w * 0.4 * out, scale: lerp(0.72, 1, easeOutBackWith(k, tuning.defeat.popOvershoot)),
    alpha: clamp01(k * 3) * (1 - out) };
}

/** KUMA's speech bubble pops after his panel. */
export function defeatBubbleAt(s: DefeatSchedule, ms: number, closing: DefeatClosing | null,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): { readonly shown: boolean; readonly scale: number; readonly alpha: number } {
  if (ms < s.bubbleMs) return { shown: false, scale: 1, alpha: 0 };
  const out = closing ? easeInCubic(closing.progress) : 0;
  const k = spanProgress(ms, s.bubbleMs, s.popMs);
  if (s.reduced) return { shown: true, scale: 1, alpha: k * (1 - out) };
  return { shown: true, scale: lerp(0.5, 1, easeOutBackWith(k, tuning.defeat.popOvershoot + 0.4)), alpha: clamp01(k * 4) * (1 - out) };
}

/** The choice card rises from below the page (0 → 1) and leaves with the closing. */
export function defeatCardAt(s: DefeatSchedule, ms: number, closing: DefeatClosing | null,
  tuning: FightOverlayTuning = NATIVE_CITY_FIGHT_OVERLAY): { readonly shown: boolean; readonly rise: number; readonly alpha: number } {
  if (ms < s.cardMs) return { shown: false, rise: 0, alpha: 0 };
  const out = closing ? easeInCubic(closing.progress) : 0;
  const k = spanProgress(ms, s.cardMs, s.slideMs);
  if (s.reduced) return { shown: true, rise: 1, alpha: k * (1 - out) };
  return { shown: true, rise: easeOutBackWith(k, tuning.defeat.popOvershoot - 0.6) - out * 0.3, alpha: clamp01(k * 3) * (1 - out) };
}

export function defeatSoundCues(s: DefeatSchedule): readonly CombatOverlaySoundCue[] {
  const list: CombatOverlaySoundCue[] = s.reduced
    ? [{ atMs: s.kumaMs, kind: "pop", pitch: 0.9 }, { atMs: s.cardMs, kind: "pop", pitch: 1.1 }]
    : [
      { atMs: 0, kind: "thump", pitch: 1 },
      { atMs: s.downMs, kind: "whoosh", pitch: 0.85 },
      { atMs: s.kumaMs, kind: "slam", pitch: 0.7 },
      { atMs: s.bubbleMs, kind: "pop", pitch: 0.9 },
      { atMs: s.cardMs, kind: "whoosh", pitch: 1.15 },
    ];
  return Object.freeze(list.sort((a, b) => a.atMs - b.atMs));
}

// ── 진행 ────────────────────────────────────────────────────────────────

export type CombatEndingKind = "victory" | "defeat";
export type CombatEndingOutcome = "retry" | "leave";
export type CombatEndingPhase = "capture" | "play" | "inked" | "done";

/**
 * One ending overlay's playback. Starts in `capture` while the scene copies the frozen frame (or `play` when no capture is
 * needed), then plays the beats. The defeat card's choice: `move` / `select` change the highlighted option once the card is up,
 * `confirm` takes it only `armMs` after the card landed. The fight stays frozen (`holdsFight`) until the victory page is gone,
 * until "돌아가기" is chosen, or — after "다시" — until the next intro takes the screen over from the ink (`inked`).
 */
export class CombatEndingDirector {
  readonly victory: VictorySchedule | null;
  readonly defeat: DefeatSchedule | null;
  private readonly clock: FightOverlayClock;
  private readonly cues: readonly CombatOverlaySoundCue[];
  private cueIndex = 0;
  private captureWaitMs = 0;
  private phaseValue: CombatEndingPhase;
  private choiceIndex: 0 | 1 = 0;
  private outcomeValue: CombatEndingOutcome | null = null;
  private closingMs = 0;

  constructor(readonly encounter: CombatEncounterConfig, readonly kind: CombatEndingKind, readonly reduced: boolean,
    /** Which of the rival's defeat lines this is (this visit's defeat count). */
    readonly defeatIndex = 0, capture = true) {
    const tuning = encounter.tuning;
    this.victory = kind === "victory" ? victorySchedule(reduced, tuning) : null;
    this.defeat = kind === "defeat" ? defeatSchedule(reduced, tuning) : null;
    this.clock = new FightOverlayClock(tuning.clock.maxStepMs);
    this.cues = this.victory ? victorySoundCues(this.victory, tuning) : defeatSoundCues(this.defeat!);
    this.phaseValue = capture ? "capture" : "play";
  }

  get phase(): CombatEndingPhase { return this.phaseValue; }
  get ms(): number { return this.clock.ms; }
  get choice(): 0 | 1 { return this.choiceIndex; }
  get outcome(): CombatEndingOutcome | null { return this.outcomeValue; }
  get active(): boolean { return this.phaseValue !== "done"; }

  get holdsFight(): boolean { return this.phaseValue !== "done" && this.outcomeValue !== "leave"; }
  /** The closing after a choice (null before one). */
  get closing(): DefeatClosing | null {
    if (!this.outcomeValue || !this.defeat) return null;
    const span = this.outcomeValue === "retry" ? this.defeat.fillMs : this.defeat.exitMs;
    return { choice: this.outcomeValue, progress: clamp01(this.closingMs / Math.max(1, span)) };
  }
  /** The rival's one-liner for this defeat. */
  get lineKey(): CombatOverlayLineKey {
    const lines = this.encounter.lines.defeat;
    return lines[((this.defeatIndex % lines.length) + lines.length) % lines.length] ?? this.encounter.lines.retry;
  }
  get cardShown(): boolean { return this.defeat !== null && this.outcomeValue === null && this.clock.ms >= this.defeat.cardMs; }
  /** The card takes a confirm (a fight-mashed key in its first `armMs` does not choose). */
  get cardArmed(): boolean { return this.cardShown && this.clock.ms >= this.defeat!.cardMs + this.defeat!.armMs; }

  /** The scene's copy of the frozen frame came back (or the scene has none to give). */
  acceptCapture(): void {
    if (this.phaseValue === "capture") this.phaseValue = "play";
  }

  update(dtMs: number): readonly CombatOverlaySoundCue[] {
    if (this.phaseValue === "done" || this.phaseValue === "inked") return [];
    if (this.phaseValue === "capture") {
      this.captureWaitMs += Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
      if (this.captureWaitMs < this.encounter.tuning.clock.captureTimeoutMs) return [];
      this.phaseValue = "play";
      return [];
    }
    const step = this.clock.step(dtMs);
    if (this.victory && this.clock.ms >= this.victory.endMs) this.phaseValue = "done";
    if (this.defeat && this.outcomeValue) {
      this.closingMs += step;
      if (this.outcomeValue === "retry" && this.closingMs >= this.defeat.fillMs) this.phaseValue = "inked";
      if (this.outcomeValue === "leave" && this.closingMs >= this.defeat.exitMs) this.phaseValue = "done";
    }
    const due: CombatOverlaySoundCue[] = [];
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex]!.atMs <= this.clock.ms) due.push(this.cues[this.cueIndex++]!);
    return due.filter(cue => this.clock.ms - cue.atMs <= 250);
  }

  /**
   * `skip()` would take now: the victory page before its crash, the defeat build-up before the card (each from its `skipFromMs`).
   * The overlay shows the cutscene skip hint (`CutsceneSkipGate`) only then.
   */
  get skippable(): boolean {
    if (this.phaseValue !== "play") return false;
    const ms = this.clock.ms;
    if (this.victory) return ms >= this.victory.skipFromMs && ms < this.victory.holdEndMs;
    return this.defeat !== null && !this.outcomeValue && ms >= this.defeat.skipFromMs && ms < this.defeat.cardMs;
  }

  /** Skip input: the victory page goes straight to its crash; the defeat build-up jumps to the card. True when it did something. */
  skip(): boolean {
    if (!this.skippable) return false;
    this.jumpTo(this.victory ? this.victory.holdEndMs : this.defeat!.cardMs);
    return true;
  }

  /** Moves the card's highlight (any direction toggles between the two options). True when it changed. */
  move(delta: number): boolean {
    if (!this.cardShown || delta === 0) return false;
    this.choiceIndex = this.choiceIndex === 0 ? 1 : 0;
    return true;
  }

  select(index: 0 | 1): boolean {
    if (!this.cardShown || this.choiceIndex === index) return false;
    this.choiceIndex = index;
    return true;
  }

  /** Takes the highlighted option once the card is armed. Returns the outcome, or null when it is not taken. */
  confirm(): CombatEndingOutcome | null {
    if (!this.cardArmed) return null;
    this.outcomeValue = this.choiceIndex === 0 ? "retry" : "leave";
    this.closingMs = 0;
    return this.outcomeValue;
  }

  /**
   * The taken "retry" closes as "leave" does (the card fades, no ink, no rematch) — a tournament bout, where the first option goes to the
   * bracket instead (2026-10-18). Call right after `confirm`.
   */
  closeAsLeave(): void {
    if (this.outcomeValue === "retry" && this.closingMs === 0) this.outcomeValue = "leave";
  }

  /** Ends now (the next intro took over from the ink, a view change, scene shutdown). */
  finish(): void { this.phaseValue = "done"; }

  private jumpTo(ms: number): void {
    this.clock.jumpTo(ms);
    // Beats the jump passed stay silent.
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex]!.atMs < ms) this.cueIndex++;
  }
}
