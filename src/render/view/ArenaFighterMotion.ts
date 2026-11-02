import { CITY_FIGHT_EXCHANGES } from "../../sim/cityFight/bout/CityFightBoutExchange";
import { clamp01 } from "../../sim/geom";
import { easeOutCubic, smoothstep01 } from "../art/easing";

/**
 * The arena AI duel's body motion (2026-10-23 arena audit, game-animator reviews A–C): drawing only, over the beats and cells the rules
 * already chose. The village fight never gets it (`NativeCityKumaProfile.arenaMotion` is absent there): its drawing and goldens stay. Reduced
 * motion turns off every offset, tilt and stretch here and keeps only the cell choices (the alternating hurt cells, the KO's first cell).
 *
 * - `anticipation`: the windup before a combo / slam's first contact (it stood as one still for ~0.5 s). Over its first `pullShare` the body
 *   eases back `pullBodies` body heights and squashes to `squashY`, holds, springs from `springMs` before the contact to `pushBodies` past
 *   its rest with a `stretchY` stretch, and settles home over `settleMs` after it. A swing cut or cancelled lets go over `releaseMs`.
 * - `hurt`: each blow picks the other hurt cell (light: cells 0 / 1, heavy: 2 / 3 — inside the cells there are) and shoves the body away from
 *   the striker, held `holdMs`, back over `returnMs` (a jab moved nothing).
 * - `cut`: a swing cut by a blow (the iron ball jumped from overhead to behind his back in one frame) holds its swing cell for `holdMs`,
 *   then the flinch starts tipped back `tiltDeg` and shoved `pushBodies`, easing out over `spanMs` — inertia.
 * - `corner`: inside `nearStrides` (faded in over `fadeStrides`) each body gets its corner's outline, `rimScreenPx` screen px — who is who in a
 *   same-colour or black-suited pair. Where they overlap the struck body draws in front by `frontPx` of y-sort: just enough for its outline to
 *   sit over the other body, less than the step a body's own front effects take.
 * - `cast`: the caster of an awakening sank into its dark stage (vfx review P1-6, the black-suited parody b05 #1742–1788) — lit `lift` brighter
 *   with his corner outline on from his super's cut-in through his follow-up and its acting clip.
 */
export interface ArenaFighterMotionSpec {
  readonly anticipation: {
    readonly pullShare: number; readonly pullBodies: number; readonly squashY: number;
    readonly springMs: number; readonly pushBodies: number; readonly stretchY: number;
    readonly settleMs: number; readonly releaseMs: number;
  };
  readonly hurt: { readonly lightPushBodies: number; readonly heavyPushBodies: number; readonly holdMs: number; readonly returnMs: number };
  readonly cut: { readonly holdMs: number; readonly spanMs: number; readonly tiltDeg: number; readonly pushBodies: number };
  readonly corner: { readonly nearStrides: number; readonly fadeStrides: number; readonly rimScreenPx: number; readonly frontPx: number };
  /** While he casts his awakening: an additive copy of his cell at `lift` (his brightness × (1 + lift)) and his corner outline whole. */
  readonly cast: { readonly lift: number };
}

/** A body's lead off its drawn cell: `back` body heights away from the rival (negative: toward him), `stretchY` its height's scale. */
export interface ArenaBodyLead { readonly back: number; readonly stretchY: number }

export const ARENA_NO_LEAD: ArenaBodyLead = Object.freeze({ back: 0, stretchY: 1 });

/**
 * The two-beat anticipation `t` fight ms into a swing whose first contact is at `firstMs`: the slow pull back and squash, held, the spring
 * forward and stretch over the last `springMs`, then settling home after the contact.
 */
export function arenaAnticipationLead(t: number, firstMs: number, spec: ArenaFighterMotionSpec["anticipation"]): ArenaBodyLead {
  if (!(firstMs > 0) || !Number.isFinite(t) || t <= 0) return ARENA_NO_LEAD;
  const pullEnd = firstMs * clamp01(spec.pullShare), springStart = Math.max(pullEnd, firstMs - Math.max(0, spec.springMs));
  const pulled = { back: spec.pullBodies, stretchY: spec.squashY };
  if (t < pullEnd) {
    const k = smoothstep01(t / pullEnd);
    return { back: pulled.back * k, stretchY: 1 + (pulled.stretchY - 1) * k };
  }
  if (t < springStart) return pulled;
  if (t < firstMs) {
    const k = easeOutCubic(clamp01((t - springStart) / Math.max(1, firstMs - springStart)));
    return { back: pulled.back + (-spec.pushBodies - pulled.back) * k, stretchY: pulled.stretchY + (spec.stretchY - pulled.stretchY) * k };
  }
  const k = 1 - smoothstep01((t - firstMs) / Math.max(1, spec.settleMs));
  return k <= 0 ? ARENA_NO_LEAD : { back: -spec.pushBodies * k, stretchY: 1 + (spec.stretchY - 1) * k };
}

/** A lead let go `ms` fight ms ago (the swing cut, cancelled or ended): eased home over `releaseMs`. */
export function arenaLeadRelease(from: ArenaBodyLead, ms: number, releaseMs: number): ArenaBodyLead {
  const k = 1 - smoothstep01(ms / Math.max(1, releaseMs));
  return k <= 0 ? ARENA_NO_LEAD : { back: from.back * k, stretchY: 1 + (from.stretchY - 1) * k };
}


export function arenaHurtCells(stepFrames: readonly number[], recoil: number, staggerEnd: number): number[] {
  const stance = stepFrames[0], cells: number[] = [];
  const last = Math.min(stepFrames.length - 1, Math.max(recoil, staggerEnd));
  for (let i = Math.max(0, recoil); i <= last; i++) {
    const frame = stepFrames[i];
    if (frame !== undefined && frame !== stance && !cells.includes(frame)) cells.push(frame);
  }
  return cells;
}

/**
 * The hurt cell of blow `count` (0, 1, 2 …): a light blow takes cell 0 or 1 in turn, a heavy one 2 or 3 — kept inside the cells there are —
 * and never the cell on screen now (`shown`) when the other one differs: a flinch that already went on to its stagger cell snaps back to
 * its recoil, so every blow changes the drawing.
 */
export function arenaHurtCell(cells: readonly number[], count: number, heavy: boolean, shown: number | null = null): number | null {
  if (cells.length === 0) return null;
  const turn = ((Math.floor(count) % 2) + 2) % 2, at = (i: number) => cells[Math.min(cells.length - 1, (heavy ? 2 : 0) + i)]!;
  const first = at(turn), other = at(1 - turn);
  return first === shown && other !== shown ? other : first;
}

/** The blow's shove on the struck body `ms` fight ms after its contact (body heights away from the striker): out at once, held, back. */
export function arenaHurtPush(ms: number, heavy: boolean, spec: ArenaFighterMotionSpec["hurt"]): number {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  const px = heavy ? spec.heavyPushBodies : spec.lightPushBodies;
  if (ms <= spec.holdMs) return px;
  return px * (1 - smoothstep01((ms - spec.holdMs) / Math.max(1, spec.returnMs)));
}

/**
 * A cut swing's inertia `screenMs` after the cut (screen time — the cut lands in the blow's freeze): whether its swing cell still holds, and
 * the lean away from the striker (degrees, body heights back) easing out over `spanMs`.
 */
export function arenaCutInertia(screenMs: number, spec: ArenaFighterMotionSpec["cut"]): { readonly holdCell: boolean; readonly deg: number;
  readonly back: number } | null {
  if (!Number.isFinite(screenMs) || screenMs < 0 || screenMs >= spec.spanMs) return null;
  const k = 1 - smoothstep01(screenMs / Math.max(1, spec.spanMs));
  return { holdCell: screenMs < spec.holdMs, deg: spec.tiltDeg * k, back: spec.pushBodies * k };
}

/** The corner outline's alpha at `strides` between the two bodies' feet: full inside `nearStrides`, gone `fadeStrides` past it. */
export function arenaCornerRimAlpha(strides: number, spec: ArenaFighterMotionSpec["corner"]): number {
  if (!Number.isFinite(strides)) return 0;
  return 1 - clamp01((strides - spec.nearStrides) / Math.max(1e-6, spec.fadeStrides));
}

/**
 * Which body draws in front where they overlap: one vaulting over the other (3, `arenaFrontMode`), else the struck one (2), else the striking
 * one (1), else neither (0).
 */
export function arenaFrontRank(mode: string): 0 | 1 | 2 | 3 {
  if (mode === "vault") return 3;
  return mode === "hurt" || mode === "break" || mode === "parried" || mode === "down" ? 2 : mode === "attack" || mode === "dash" ? 1 : 0;
}

/** This corner draws in front of the other: the higher rank, the right corner on a tie (the order the two were drawn in before). */
export function arenaDrawsInFront(mine: string, rival: string, corner: 0 | 1): boolean {
  const a = arenaFrontRank(mine), b = arenaFrontRank(rival);
  return a !== b ? a > b : corner === 1;
}

/**
 * Which mode the front sort reads (`arenaDrawsInFront`): a body vaulting over the other (`KumaCombatState.vault`, 2026-10-23 2차) draws in
 * front of him whatever he does — the vault's own rank — and so does a cross's winner while his strike shows (2026-10-25 — the loser drawn
 * over it read as the one cut); else his mode.
 */
export function arenaFrontMode(combat: { readonly mode: string; readonly vault?: unknown;
  readonly exchange?: { readonly slashMs: number | null; readonly finalSlash: boolean } | null }): string {
  const slash = combat.exchange?.slashMs ?? null;
  return combat.vault || slash !== null && (combat.exchange!.finalSlash || slash < CITY_FIGHT_EXCHANGES.cross.slashMs) ? "vault" : combat.mode;
}

/** His backstep drawn as his evade clip (`NativeCityKumaView` — the arena's): the back half on its progress, then the return on its clock. */
export interface ArenaEvade {
  /** `back`: stepping back (`progress` 0..1 of the step's units); `return`: the step ended, `returnMs` fight ms of the clip's rest since. */
  readonly phase: "back" | "return";
  readonly progress: number;
  readonly returnMs: number;
}


export function arenaEvadeBackEndMs(steps: readonly { readonly frame: number; readonly durationMs: number }[]): number {
  const seen: number[] = [];
  let at = 0;
  for (const step of steps) {
    if (!seen.includes(step.frame)) {
      if (seen.length === 2) return at;
      seen.push(step.frame);
    }
    at += Math.max(0, step.durationMs);
  }
  return at;
}

/**
 * The evade clip's ms now (2026-10-23 2차 — the backstep drew the walk run backwards, a slide): its first two cells over the step back's
 * progress (the rules' step is ~0.2–0.3 s, the clip's back half 0.2–0.4 s), then its return played on from there. Null: the clip is over.
 */
export function arenaEvadeArtMs(evade: ArenaEvade, backEndMs: number, totalMs: number): number | null {
  if (evade.phase === "back") return Math.max(0, Math.min(backEndMs - 1, clamp01(evade.progress) * backEndMs));
  const ms = backEndMs + Math.max(0, evade.returnMs);
  return ms < totalMs ? ms : null;
}


export function arenaVaultFlipLift(ms: number, takeoffMs: number, apexMs: number, landMs: number): number {
  if (!(ms > takeoffMs) || !(ms < landMs)) return 0;
  if (ms <= apexMs) { const u = clamp01((ms - takeoffMs) / Math.max(1, apexMs - takeoffMs)); return 1 - (1 - u) * (1 - u); }
  const u = clamp01((ms - apexMs) / Math.max(1, landMs - apexMs));
  return 1 - u * u;
}

/** The vault's falling tuck (its clip's `keys.fall` step, drawn ~0.7 body over the ground): the share of that float let down `ms` into it (u²). */
export function arenaVaultFallShare(ms: number, fallStartMs: number, fallMs: number): number {
  if (!(ms > fallStartMs)) return 0;
  const u = clamp01((ms - fallStartMs) / Math.max(1, fallMs));
  return u * u;
}
