/** Presentation supplies the curve; the duel owns the age and both fighters' time. */
export interface DuelSlowMoBeat {
  readonly scale: number;
  readonly holdMs: number;
  readonly releaseMs: number;
  readonly vignette: number;
  readonly desaturate: number;
  readonly cooldownMs: number;
  /** The release snaps above 1 and settles (`CombatSlowMoBeat.whipRate` — the counter's "삥~ → 팡"). Absent: it eases up to 1. */
  readonly whipRate?: number;
}

/**
 * The release after a freeze (2026-10-17, user: "팔을 뻗어서 물건이 닿을 때부터는 느려지거나 경직 + 역경직이 걸리고 다시 손이 들어올 때 점점
 * 가속도로 돌아오고"): both clocks restart at `fromRate` and ease in (accelerating, quadratically) to 1 over `perFreeze` × the freeze
 * that let go, at most `maxMs` of screen time. A short freeze (a blow his armour ate) gets a short release. None inside a slow-mo, and
 * only after a freeze asked with `ease` (`freezeDuelClock`).
 */
export interface DuelReleaseRamp { readonly fromRate: number; readonly perFreeze: number; readonly maxMs: number }

export interface DuelClock {
  readonly hitStopMs: number;
  readonly scale: number;
  /**
   * This frame's fight ms per screen ms WITHOUT the release ramp (2026-10-19, game-animator: the struck body must fly off at full speed the
   * moment the freeze lets go — only the striker's hand eases back). The knocked body's travel reads it; everything else reads `scale`.
   */
  readonly knockScale: number;
  readonly slowMo: { readonly beat: DuelSlowMoBeat; readonly ageMs: number } | null;
  /** The freeze being held (the longest one asked since it began): its release ramp's length follows it. */
  readonly freezeMs: number;
  /** The release ramp running: its length and the screen ms left of it. */
  readonly rampMs: number;
  readonly rampLeftMs: number;
  readonly ms: number;
}

const sanitized = (dtMs: number): number => Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
export const DUEL_FREEZE_RESIDUE_EPSILON_MS = 1;

/** A frame can spend part of its screen time frozen and run on the remaining time. */
export function consumeDuelFreeze(remainingMs: number, dtMs: number) {
  const dt = sanitized(dtMs);
  const stoppedMs = Math.min(dt, remainingMs);
  const remaining = remainingMs - stoppedMs;
  return { remainingMs: remaining < DUEL_FREEZE_RESIDUE_EPSILON_MS ? 0 : remaining, stoppedMs, freeMs: dt - stoppedMs };
}

/** Concurrent contacts hold both bodies for the longest beat, never their sum. */
export function extendDuelFreeze(remainingMs: number, incomingMs: number): number {
  return Math.max(remainingMs, incomingMs);
}

export function createDuelClock(): DuelClock {
  return Object.freeze({ hitStopMs: 0, scale: 1, knockScale: 1, slowMo: null, freezeMs: 0, rampMs: 0, rampLeftMs: 0, ms: 0 });
}

/** The ramp's fight time from its start to `u` (0..1) of it, per ms of ramp: ∫ fromRate + (1 − fromRate)·v² dv. */
const rampArea = (u: number, fromRate: number) => fromRate * u + (1 - fromRate) * u * u * u / 3;

/**
 * `baseRate`: the fight's own playback speed under everything else (2026-10-19, user: 마을 전투 애니메이션 20% 느리게 — 0.8). The
 * freeze stays screen time; the free time, the slow-mo and the release ramp all run at it. Default 1.
 */
export function stepDuelClock(clock: DuelClock, input: { readonly dtMs: number; readonly slowMoScale: number;
  readonly releaseRamp: DuelReleaseRamp; readonly baseRate?: number }) {
  const dt = sanitized(input.dtMs), ramp = input.releaseRamp;
  const freeze = consumeDuelFreeze(clock.hitStopMs, dt);
  const hitStopMs = freeze.remainingMs, free = freeze.freeMs;
  let { freezeMs, rampMs, rampLeftMs } = clock;
  if (freeze.stoppedMs > 0 && hitStopMs === 0) {
    rampMs = Math.max(0, Math.min(ramp.maxMs, ramp.perFreeze * freezeMs));
    rampLeftMs = rampMs;
    freezeMs = 0;
  }
  let scale = 1, slowMo = clock.slowMo;
  const slow = clock.slowMo;
  if (slow && free > 0) {
    scale = input.slowMoScale;
    const ageMs = slow.ageMs + free;
    slowMo = ageMs >= slow.beat.holdMs + slow.beat.releaseMs ? null : Object.freeze({ beat: slow.beat, ageMs });
  }
  // The free time on the fight clock: the part inside the release ramp runs slow and speeds up, the rest at 1.
  let run = free;
  if (rampLeftMs > 0 && free > 0) {
    // Slow motion keeps the collapse/KO's weight: no ramp inside it.
    if (slow) rampLeftMs = 0;
    else {
      const seg = Math.min(free, rampLeftMs), u0 = 1 - rampLeftMs / rampMs, u1 = Math.min(1, u0 + seg / rampMs);
      run = rampMs * (rampArea(u1, ramp.fromRate) - rampArea(u0, ramp.fromRate)) + (free - seg);
      rampLeftMs = rampLeftMs - seg < DUEL_FREEZE_RESIDUE_EPSILON_MS / 1000 ? 0 : rampLeftMs - seg;
    }
  }
  const fightDt = run * scale * Math.max(0, input.baseRate ?? 1);
  const fightScale = dt > 0 ? fightDt / dt : 1;
  const knockScale = dt > 0 ? free * scale * Math.max(0, input.baseRate ?? 1) / dt : 1;
  return { clock: Object.freeze({ hitStopMs, scale: fightScale, knockScale, slowMo, freezeMs, rampMs, rampLeftMs, ms: clock.ms + fightDt }),
    fightDt, fightScale, free };
}

/**
 * Both bodies stop `ms` (the longest overlapping freeze wins). `ease`: the release ramp follows this freeze (the attacker's blow that
 * landed — `DuelReleaseRamp`); a freeze without it lets go at once (a body launched by the blow flies off at speed).
 */
export function freezeDuelClock(clock: DuelClock, ms: number, ease = true): DuelClock {
  // The freeze the ramp follows: the longest eased one asked since the hold began (a new hold after a release starts over).
  const freezeMs = Math.max(clock.hitStopMs > 0 ? clock.freezeMs : 0, ease ? sanitized(ms) : 0);
  return Object.freeze({ ...clock, hitStopMs: extendDuelFreeze(clock.hitStopMs, ms), freezeMs, scale: 0, knockScale: 0 });
}

/** No release ramp (2026-10-21, the crisp clock): a freeze lets go at full speed. */
export const DUEL_NO_RELEASE_RAMP: DuelReleaseRamp = Object.freeze({ fromRate: 1, perFreeze: 0, maxMs: 0 });

/** Both bodies stop `ms` MORE — added after the freeze being held, not folded into it like `freezeDuelClock` (a read hold after a hit's freeze). */
export function holdDuelClock(clock: DuelClock, ms: number): DuelClock {
  const hold = sanitized(ms);
  return hold > 0 ? Object.freeze({ ...clock, hitStopMs: clock.hitStopMs + hold, scale: 0, knockScale: 0 }) : clock;
}

export function slowDuelClock(clock: DuelClock, beat: DuelSlowMoBeat): DuelClock {
  return Object.freeze({ ...clock, slowMo: Object.freeze({ beat, ageMs: 0 }) });
}
