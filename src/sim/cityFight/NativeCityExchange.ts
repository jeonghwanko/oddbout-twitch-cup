import { NATIVE_CITY_COMBAT, type NativeCityCombatTuning, type NativeCityKumaActionKind, type NativeCityKumaBestAnswer, type NativeCityKumaGrade }
  from "./NativeCityCombatTuning";



/** The triangle class of a KUMA-type action (`triangle.classes`): white — Z, gold — X (a block is crushed), red — none (the grab). */
export function nativeCityKumaGrade(action: NativeCityKumaActionKind, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): NativeCityKumaGrade {
  return t.triangle.classes[action];
}

/**
 * The best answer to a KUMA-type action (`triangle.best` by its grade, 2026-10-19 읽기 보상): the only answer that opens his chance — white's
 * ring counter, gold's just evade, red's cut.
 */
export function nativeCityKumaBestAnswer(action: NativeCityKumaActionKind, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): NativeCityKumaBestAnswer {
  return t.triangle.best[nativeCityKumaGrade(action, t)];
}

/**
 * Which defenses a blow answers to, overriding the action's lists (`parry.actions`, `dodge.evades`, the triangle): a host enemy's blow
 * (Otto, `NativeCityEnemyBlow.answers`) keeps the answers it had before the triangle.
 */
export interface NativeCityDefenseAnswers {
  /** The bow-duck's i-frames let it pass. */
  readonly dodge: boolean;
  /** A timed press parries it (a host enemy's parry is a block). */
  readonly parry: boolean;
  /** The vault's i-frames let it pass. */
  readonly vault: boolean;
  /** A guard (block or parry) takes it; false: it goes through the guard (a summoned flying car, 2026-10-20). Absent: it does. */
  readonly guard?: boolean;
}

export type NativeCityDefense = "dodge" | "parry" | "block" | "hit";

export interface NativeCityDefenseInput {
  readonly action: NativeCityKumaActionKind;
  /** He can meet the blow at all: not swinging, staggered, knocked down or bowing (a dodge is judged on its own). */
  readonly free: boolean;
  readonly guardHeld: boolean;
  /** Fight-clock ms since the armed guard press, or null when none is armed. */
  readonly pressAgeMs: number | null;
  /** Fight-clock ms into the current dodge, or null when not dodging. */
  readonly dodgeMs: number | null;
  readonly guardBroken: boolean;
  /** KUMA's feet are inside the guard cone. */
  readonly fromFront: boolean;
  /** The blow's own answers (a host enemy's); absent: the action's (the triangle's lists). */
  readonly answers?: NativeCityDefenseAnswers;
}

/** The armed press is still inside the parry window (`parry.windowMs` before the contact). */
export function nativeCityParryArmed(pressAgeMs: number | null, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): boolean {
  return pressAgeMs !== null && pressAgeMs >= 0 && pressAgeMs <= t.parry.windowMs;
}

/**
 * Fight ms left of the dodge's i-frames `dodgeMs` in, against `action` (null: no swing known — the window alone); 0 outside the window
 * or against a swing the dodge does not evade (`dodge.evades`). The tells read it (`nativeCityFightSimUntouchable`).
 */
export function nativeCityDodgeEvadeLeftMs(dodgeMs: number, action: NativeCityKumaActionKind | null,
  t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): number {
  const [from, to] = t.dodge.invulnerableMs;
  return (action === null || t.dodge.evades.includes(action)) && dodgeMs >= from && dodgeMs <= to ? to - dodgeMs : 0;
}

/** A dodge `dodgeMs` in lets this swing pass over him. */
export function nativeCityDodgeEvades(dodgeMs: number, action: NativeCityKumaActionKind, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): boolean {
  const [from, to] = t.dodge.invulnerableMs;
  return t.dodge.evades.includes(action) && dodgeMs >= from && dodgeMs <= to;
}

export function resolveNativeCityDefense(input: NativeCityDefenseInput, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): NativeCityDefense {
  const answers = input.answers;
  // The red grab: no defense takes it (it catches).
  if (!answers && nativeCityKumaGrade(input.action, t) === "red") return "hit";
  if (input.dodgeMs !== null) {
    const [from, to] = t.dodge.invulnerableMs, inWindow = input.dodgeMs >= from && input.dodgeMs <= to;
    return (answers ? answers.dodge && inWindow : nativeCityDodgeEvades(input.dodgeMs, input.action, t)) ? "dodge" : "hit";
  }
  if (!input.free || input.guardBroken || !input.fromFront || answers?.guard === false) return "hit";
  const armed = nativeCityParryArmed(input.pressAgeMs, t);
  // The timed parry (off since 2026-10-18 — `parry.enabled`): the press only blocks.
  if (armed && t.parry.enabled && (answers ? answers.parry : t.parry.actions.includes(input.action))) return "parry";
  return input.guardHeld || armed ? "block" : "hit";
}

/** The vault's i-frames let this blow pass: a KUMA-type action of a grade in `triangle.vaultPasses`; a host enemy's by its own answers. */
export function nativeCityVaultPasses(action: NativeCityKumaActionKind, answers?: NativeCityDefenseAnswers,
  t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): boolean {
  return answers ? answers.vault : t.triangle.vaultPasses.includes(nativeCityKumaGrade(action, t));
}

/** A block of this KUMA-type contact crushes the guard (a grade in `triangle.guardCrush` — none since 2026-10-18: the gauge empties). */
export function nativeCityGuardCrushes(action: NativeCityKumaActionKind, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): boolean {
  return t.triangle.guardCrush.includes(nativeCityKumaGrade(action, t));
}

/** A parry of this contact drops KUMA straight into the poise break (groggy): the back-hand of a string (spec beat 4). */
export function nativeCityParryGroggy(action: NativeCityKumaActionKind, hitIndex: number, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): boolean {
  return action !== "slam" && hitIndex === t.parry.groggyHitIndex;
}

/**
 * A guard press at `nowMs` (fight clock): it arms the parry window unless the last armed press was less than
 * `parry.pressLockMs` ago (mashing never parries). Returns the armed press time.
 */
export function armNativeCityParry(lastArmedAtMs: number | null, nowMs: number, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): number | null {
  if (lastArmedAtMs !== null && nowMs - lastArmedAtMs < t.parry.pressLockMs) return lastArmedAtMs;
  return nowMs;
}


export interface NativeCityGuardGauge {
  readonly value: number;
  /** Fight ms since the last block (the refill waits `regenDelayMs`). */
  readonly idleMs: number;
  readonly broken: boolean;
}

export function createNativeCityGuardGauge(t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): NativeCityGuardGauge {
  return { value: t.guard.max, idleMs: 0, broken: false };
}

export type NativeCityBlockKind = "light" | "slam" | "dash";

/** One block. `broke`: this block emptied the gauge (no damage still, but the guard breaks). `crush`: a gold contact — it empties it at once. */
export function nativeCityGuardBlock(gauge: NativeCityGuardGauge, kind: NativeCityBlockKind, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT,
  crush = false): { readonly gauge: NativeCityGuardGauge; readonly broke: boolean } {
  const value = crush ? 0 : gauge.value - Math.max(0, t.guard.cost[kind]);
  if (value <= 1e-9) return { gauge: { value: 0, idleMs: 0, broken: true }, broke: true };
  return { gauge: { value, idleMs: 0, broken: gauge.broken }, broke: false };
}

/**
 * A whiffed parry re-press (`parry.whiffCost`, 2026-10-09: a missed parry used to be a free block): it costs guard like a block — the
 * one that empties the gauge breaks the guard. An already broken guard has nothing left to lose. The refill waits again.
 */
export function nativeCityGuardWhiff(gauge: NativeCityGuardGauge, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT)
  : { readonly gauge: NativeCityGuardGauge; readonly broke: boolean } {
  if (gauge.broken) return { gauge, broke: false };
  const value = gauge.value - Math.max(0, t.parry.whiffCost);
  if (value <= 1e-9) return { gauge: { value: 0, idleMs: 0, broken: true }, broke: true };
  return { gauge: { value, idleMs: 0, broken: false }, broke: false };
}

/**
 * A guard press is a RE-PRESS (it can whiff, `parry.whiffCost`) when the guard is up now or was lowered under `parry.whiffLoweredMs`
 * ago (`sinceUpMs`: fight ms since it was last up, null = never). The first raise is free.
 */
export function nativeCityParryRepress(guardUp: boolean, sinceUpMs: number | null, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): boolean {
  return guardUp || sinceUpMs !== null && sinceUpMs < t.parry.whiffLoweredMs;
}

/** Rest: after `regenDelayMs` without a block the gauge refills at `regenPerSec`; a broken guard reopens at `reopenAt`. */
export function stepNativeCityGuardGauge(gauge: NativeCityGuardGauge, dtMs: number, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): NativeCityGuardGauge {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  const g = t.guard, idle = gauge.idleMs + dt;
  if (gauge.value >= g.max && !gauge.broken) return dt > 0 ? { ...gauge, idleMs: idle } : gauge;
  const over = Math.max(0, idle - Math.max(g.regenDelayMs, gauge.idleMs));
  const value = Math.min(g.max, gauge.value + g.regenPerSec * over / 1000);
  return { value, idleMs: idle, broken: gauge.broken && value < g.reopenAt };
}

/**
 * The block kind of a KUMA swing: the slam's ground pound is the heavy one; the dash's body charge costs big and shoves far. (The grab is
 * never blocked; it would read light.)
 */
export function nativeCityBlockKind(action: NativeCityKumaActionKind): NativeCityBlockKind {
  return action === "slam" ? "slam" : action === "dash" ? "dash" : "light";
}

/** The dodge can start: not inside one, and `dodge.cooldownMs` has passed since the last one ended (`sinceEndMs`, null = never). */
export function nativeCityDodgeReady(sinceEndMs: number | null, t: NativeCityCombatTuning = NATIVE_CITY_COMBAT): boolean {
  return sinceEndMs === null || sinceEndMs >= t.dodge.cooldownMs;
}
