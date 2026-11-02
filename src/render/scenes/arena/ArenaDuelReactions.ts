import { nativeCityKumaFighterPoint, type NativeCityKumaFighterState } from "../../../sim/cityFight/NativeCityKumaFighter";
import type { CityFightBoutClash, CityFightBoutHit } from "../../../sim/cityFight/bout/CityFightFighterBout";
import type { CityPoint } from "../../../world/NativeCityDefinition";

/**
 * What the AI duel's corners did between two drawn frames that the arena acts out with no rule of its own (2026-10-24 effect pass 3·4 — user:
 * 액션성·캐릭터 개성·코믹). Read off the bout's states and contacts; it never enters the rules or the digest.
 * - `whiff`: his melee swing ended with nothing met (no contact, guarded or not, no clash) — sweat on him, the swing's wind ahead of him.
 * - `fumed`: his second guarded blow in a row (`blockStreak` within `streakGapMs`) — the anger vein on him.
 * - `caught`: struck in his own swing before it met anything (the cut swing) — the shock lines over him.
 * - `scuff`: his feet pushed the floor — a dash's launch and its braking skid, a backstep's push-off and landing, a vault's landing, a blow's
 *   ground push — the slide dust at his feet along `direction`.
 * A mark (`whiff`, `fumed`, `caught`) waits `markGapMs` after the same mark on the same corner; a scuff `scuffGapMs` after his last.
 */
export type ArenaDuelReaction =
  | { readonly kind: "whiff"; readonly corner: 0 | 1; readonly point: CityPoint; readonly direction: CityPoint }
  | { readonly kind: "fumed" | "caught"; readonly corner: 0 | 1 }
  | { readonly kind: "scuff"; readonly corner: 0 | 1; readonly point: CityPoint; readonly direction: CityPoint };

export const ARENA_DUEL_REACTIONS = Object.freeze({
  markGapMs: 1_500,
  blockStreak: 2,
  streakGapMs: 2_500,
  /** A blow's ground push raises dust from this long a push on (strides). */
  skidMinStrides: 0.6,
  scuffGapMs: 120,
});

type States = readonly [NativeCityKumaFighterState, NativeCityKumaFighterState];
type Corner = 0 | 1;
interface Swing { readonly id: number; contacted: boolean }

/** A plain melee swing: a quick cut, a string, a heavy or a grab — not a cast, a skill, a super, an air chase. */
function meleeSwing(state: NativeCityKumaFighterState): boolean {
  const c = state.combat, special = c.special ?? null;
  return c.mode === "attack" && (c.action === "fast" || c.action === "combo" || c.action === "slam" || c.action === "grab")
    && (special === null || special === "buttSlam");
}

/** A swing's own contact (not a summon's, an awakening beat's or a grab's squeeze or throw). */
function swingContact(hit: CityFightBoutHit): boolean {
  return hit.summon === undefined && hit.followUp === undefined && (hit.grab === undefined || hit.grab === "catch") && hit.trip !== true;
}

export class ArenaDuelReactions {
  private prev: States | null = null;
  private readonly swings: [Swing | null, Swing | null] = [null, null];
  private readonly blocks: [{ n: number; atMs: number }, { n: number; atMs: number }] = [{ n: 0, atMs: -1e9 }, { n: 0, atMs: -1e9 }];
  private readonly marks = new Map<string, number>();
  private readonly scuffs: [number, number] = [-1e9, -1e9];

  /** This frame's states (after its steps), the contacts and clashes its steps made and its fight ms: what to act out. */
  observe(states: States, hits: readonly CityFightBoutHit[], clashes: readonly CityFightBoutClash[], ms: number): ArenaDuelReaction[] {
    const out: ArenaDuelReaction[] = [], prev = this.prev;
    this.prev = states;
    for (const c of [0, 1] as const) {
      const s = states[c];
      if (meleeSwing(s) && this.swings[c]?.id !== s.combat.attackId) this.swings[c] = { id: s.combat.attackId, contacted: false };
    }
    if (clashes.length > 0) for (const swing of this.swings) if (swing) swing.contacted = true;
    for (const hit of hits) {
      if (!swingContact(hit)) continue;
      const striker = (1 - hit.target) as Corner, victim = hit.target, swing = this.swings[striker];
      if (swing) swing.contacted = true;
      // Struck in his own swing before it met anything.
      const theirs = this.swings[victim];
      if (!hit.blocked && theirs && !theirs.contacted && prev && meleeSwing(prev[victim]) && prev[victim].combat.attackId === theirs.id) {
        theirs.contacted = true;
        this.mark(out, "caught", victim, ms);
      }
      const run = this.blocks[striker];
      if (!hit.blocked) { run.n = 0; continue; }
      run.n = ms - run.atMs <= ARENA_DUEL_REACTIONS.streakGapMs ? run.n + 1 : 1;
      run.atMs = ms;
      if (run.n >= ARENA_DUEL_REACTIONS.blockStreak) { run.n = 0; this.mark(out, "fumed", striker, ms); }
    }
    if (!prev) return out;
    for (const c of [0, 1] as const) {
      const was = prev[c], now = states[c], swing = this.swings[c];
      // His swing is over: it ran out (not cut) with nothing met.
      if (swing && meleeSwing(was) && was.combat.attackId === swing.id && !(meleeSwing(now) && now.combat.attackId === swing.id)) {
        this.swings[c] = null;
        const mode = now.combat.mode;
        if (!swing.contacted && (mode === "cooldown" || mode === "chase" || mode === "idle")) {
          const before = this.marks.get(`whiff:${c}`);
          if (before === undefined || ms - before >= ARENA_DUEL_REACTIONS.markGapMs) {
            this.marks.set(`whiff:${c}`, ms);
            out.push({ kind: "whiff", corner: c, point: nativeCityKumaFighterPoint(now), direction: was.combat.direction });
          }
        }
      }
      const scuff = this.scuff(was, now);
      if (scuff && ms - this.scuffs[c] >= ARENA_DUEL_REACTIONS.scuffGapMs) {
        this.scuffs[c] = ms;
        out.push({ kind: "scuff", corner: c, point: nativeCityKumaFighterPoint(now), direction: scuff });
      }
    }
    return out;
  }

  private mark(out: ArenaDuelReaction[], kind: "fumed" | "caught", corner: Corner, ms: number): void {
    const before = this.marks.get(`${kind}:${corner}`);
    if (before !== undefined && ms - before < ARENA_DUEL_REACTIONS.markGapMs) return;
    this.marks.set(`${kind}:${corner}`, ms);
    out.push({ kind, corner });
  }

  /** The direction his feet pushed the floor between the two frames, else null. */
  private scuff(was: NativeCityKumaFighterState, now: NativeCityKumaFighterState): CityPoint | null {
    const a = was.combat, b = now.combat, back = (d: CityPoint): CityPoint => [-d[0], -d[1]];
    // A dash: its launch kicks the floor back, its braking skid pushes it ahead.
    const wasPhase = a.mode === "dash" ? a.dash?.phase ?? null : null, phase = b.mode === "dash" ? b.dash?.phase ?? null : null;
    if (phase !== wasPhase && phase === "travel") return back(b.direction);
    if (phase !== wasPhase && phase === "slide") return b.direction;
    // A backstep: the push-off and the landing.
    const wasStep = (a.backstep ?? 0) > 0, step = (b.backstep ?? 0) > 0;
    if (step !== wasStep) {
      const [ax, ay] = nativeCityKumaFighterPoint(was), [bx, by] = nativeCityKumaFighterPoint(now), away: CityPoint = [bx - ax, by - ay];
      return Math.hypot(away[0], away[1]) > 1e-9 ? (step ? back(away) : away) : null;
    }
    // A vault's landing, along the vault.
    if (a.vault && !b.vault) return [a.vault.to[0] - a.vault.from[0], a.vault.to[1] - a.vault.from[1]];
    // A blow's ground push (a new push, not a flight), long enough to skid.
    const k = now.knockback, was0 = was.knockback;
    if (k && !k.flightMs && (!was0 || k.elapsedMs < was0.elapsedMs) && k.units >= ARENA_DUEL_REACTIONS.skidMinStrides * Math.max(1e-9, now.stepUnits)) {
      return k.direction;
    }
    // A flight's slide begins (the KO's, after its landing).
    if (k?.slide && was0?.slide && was0.elapsedMs < k.slide.afterMs && k.elapsedMs >= k.slide.afterMs) return k.direction;
    return null;
  }
}
