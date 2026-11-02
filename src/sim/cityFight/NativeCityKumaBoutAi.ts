import type { CityPoint } from "../../world/NativeCityDefinition";
import type { KumaBoutAiTuning, KumaCombatInput, KumaCombatState, KumaTuning } from "./NativeCityKumaCombatState";
import { kumaGap, kumaScreenFacing, kumaWalkPhase, unit, walkToward } from "./NativeCityKumaGeometry";
import { kumaSkillDue, kumaSkillSpec } from "./NativeCityKumaSkill";

/**
 * The fighter-against-fighter bout's AI rhythm (2026-10-23 arena audit — `KumaFighterOverrides.boutAi`, `city-tournament.json` bout.ai).
 * The audit of 3,036 headless bouts: both corners free together 4.7 % of the time, 37 % of the swings started within 0.1 s of the other's,
 * 39 % were cut before a contact, 4.7 % of the blows met a guard (all of them a wake-up's) — a turn-based trade with no footsies and no
 * defence. This adds the neutral between the swings: a measure before a swing, room after a string on him or after a knockdown, and a read
 * of the other's windup (a raised guard or a step back). Every pick is seeded (`kumaBoutAiShare`): the same bout replays.
 */

/** A seeded share in [0, 1) for bout AI pick `key` (its own scramble, salted by his corner's `windupSalt` — the two corners read apart). */
export function kumaBoutAiShare(key: number, t: Pick<KumaTuning, "windupSalt">): number {
  let h = Math.imul((Math.floor(key) + (t.windupSalt ?? 0) * 977 + 104723) | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x4d73b5c9);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

const pick = (range: readonly [number, number], u: number) => range[0] + (range[1] - range[0]) * u;

/**
 * His read of the other's swing (`react`): once per swing, `fromMs`..`toMs` into its windup with no contact out yet — `guardShare` of them
 * his guard goes up until that swing is over (`aiGuard`), `backstepShare` he steps back (`backstep`). A guard whose swing ended comes down.
 */
export function kumaBoutReact(s: KumaCombatState, input: KumaCombatInput, ai: KumaBoutAiTuning, t: KumaTuning): KumaCombatState {
  const swing = input.opponentSwing ?? null;
  let next = s.aiGuard != null && !(swing && swing.attackId === s.aiGuard) ? { ...s, aiGuard: null } : s;
  if (!swing || swing.contacted || swing.ms < ai.react.fromMs || swing.ms > ai.react.toMs || next.reacted === swing.attackId) return next;
  const u = kumaBoutReactShare(swing.attackId, t);
  next = { ...next, reacted: swing.attackId };
  // Cornered with a vault (2026-10-23 2차): over the swing to the other side.
  const vault = kumaBoutVault(next, input, ai, t, swing.attackId);
  if (vault) return vault;
  // A stance skill (counter, brace) is his answer to a swing: no plain guard over it (`kumaSkillDue` reads the same swing). So is the matrix
  // to a high shot (2026-10-25, 이토 — he leans back from the aim instead of raising his guard).
  const stance = kumaBoutStanceAnswer(next, t, input);
  // The matrix leans back from the shot where he stands: neither a guard nor a step back (`kumaSkillDue` starts it).
  if (kumaSkillSpec(t, "matrix") && stance) return next;
  const guard = { ...next, aiGuard: swing.attackId, neutral: null, backstep: 0 };
  if (!stance && u < ai.react.guardShare) return guard;
  if (u < ai.react.guardShare + ai.react.backstepShare) {
    // On the ropes there is no room for the step (2026-10-23 2차 — it ended in a frame or two and he swung: a flicker of the dodge): a guard.
    const step = ai.react.backstepStrides * input.stepUnits;
    if (input.backRoomUnits !== undefined && input.backRoomUnits < step) return stance ? next : guard;
    return { ...next, backstep: step, neutral: null, aiGuard: null };
  }
  return next;
}

/** His seeded pick for the other's swing `attackId` (`kumaBoutReact`): under the guard share a guard, then under both a step back. */
function kumaBoutReactShare(attackId: number, t: KumaTuning): number {
  return kumaBoutAiShare(attackId * 7 + 3, t);
}

/**
 * His skill is his answer to the swing he reads (`kumaSkillDue`'s moment): a stance (counter, brace), or the matrix into a high shot when it
 * is due now (its cadence, its seeded share — else his guard or step back as anyone's).
 */
function kumaBoutStanceAnswer(s: KumaCombatState, t: KumaTuning, input: KumaCombatInput): boolean {
  if (t.skill?.kind === "counter" || t.skill?.kind === "brace") return true;
  return kumaSkillSpec(t, "matrix") !== undefined && input.highShotComing === true && input.player !== null
    && kumaSkillDue(s, input.player, input, t, "matrix");
}

/** He will answer the other's swing `attackId` (a guard, a step back — `kumaBoutReact`'s pick, read ahead). */
function kumaBoutWillReact(s: KumaCombatState, attackId: number, t: KumaTuning, ai: KumaBoutAiTuning, input: KumaCombatInput): boolean {
  const stance = kumaBoutStanceAnswer(s, t, input);
  return kumaBoutReactShare(attackId, t) < (stance ? 0 : ai.react.guardShare) + ai.react.backstepShare;
}

/**
 * His vault over the other (`KumaFighterOverrides.vault`, `react.vaultShare`): cornered (`backRoomUnits` under `cornerStrides`), his seeded pick
 * for the swing `attackId` under the share — he leaves from where he stands to land `passStrides` past the other's far side. Null: no vault.
 */
function kumaBoutVault(s: KumaCombatState, input: KumaCombatInput, ai: KumaBoutAiTuning, t: KumaTuning, attackId: number): KumaCombatState | null {
  const player = input.player, room = input.backRoomUnits;
  if (!t.vault || !player || room === undefined || room > ai.react.cornerStrides * input.stepUnits) return null;
  if (kumaBoutAiShare(attackId * 7 + 5, t) >= ai.react.vaultShare) return null;
  const toward = unit([player[0] - s.point[0], player[1] - s.point[1]]);
  if (!toward) return null;
  const past = input.contactUnits + ai.react.passStrides * input.stepUnits;
  return { ...s, vault: { ms: 0, totalMs: t.vault.ms, from: s.point, to: [player[0] + toward[0] * past, player[1] + toward[1] * past] },
    aiGuard: null, backstep: 0, neutral: null, running: false, movedPx: 0 };
}

/** His vault's travel: front-loaded over the other's head (smoothstep), the drawn clip's handstand at the middle. */
export function kumaBoutVaultPoint(vault: NonNullable<KumaCombatState["vault"]>): CityPoint {
  const k = Math.max(0, Math.min(1, vault.ms / Math.max(1, vault.totalMs))), e = k * k * (3 - 2 * k);
  return [vault.from[0] + (vault.to[0] - vault.from[0]) * e, vault.from[1] + (vault.to[1] - vault.from[1]) * e];
}

/** He walks `units` straight away from `player`, still facing him, his walk played backwards, at `paceScale` × his walk pace. */
function walkBack(s: KumaCombatState, player: CityPoint, input: KumaCombatInput, units: number, paceScale: number, dt: number)
  : { readonly state: KumaCombatState; readonly moved: number } {
  const away = unit([s.point[0] - player[0], s.point[1] - player[1]]);
  if (!away || !(units > 1e-9) || !(dt > 0)) return { state: { ...s, movedPx: 0 }, moved: 0 };
  const step = walkToward(s, [s.point[0] + away[0] * units, s.point[1] + away[1] * units], input, input.pacePxPerSec * Math.max(0, paceScale), units, dt);
  const moved = Math.hypot(step.point[0] - s.point[0], step.point[1] - s.point[1]);
  return { state: { ...s, point: step.point, movedPx: step.movedPx, phase: kumaWalkPhase(s.phase, step.movedPx, input.stridePx, true) }, moved };
}

/**
 * His neutral in the chase (`boutAi`): a read of the other's swing, his step back, room for a body down, then the measure's hold. `hold`:
 * he stays (the chase waits this step); else `state` goes on into the chase as before.
 */
export function kumaBoutAiChase(s0: KumaCombatState, player: CityPoint, input: KumaCombatInput, t: KumaTuning, ai: KumaBoutAiTuning, dt: number)
  : { readonly state: KumaCombatState; readonly hold: boolean } {
  // His vault in flight: over the other, untouchable (`kumaCombatVulnerable`), on its own clock.
  if (s0.vault) {
    const vault = { ...s0.vault, ms: s0.vault.ms + Math.max(0, dt) };
    if (vault.ms >= vault.totalMs) {
      const landed: KumaCombatState = { ...s0, point: vault.to, vault: null, movedPx: 0 };
      const facing = kumaScreenFacing(input.projection, [player[0] - vault.to[0], player[1] - vault.to[1]]);
      return { state: { ...landed, facing: facing ?? landed.facing }, hold: true };
    }
    return { state: { ...s0, vault, point: kumaBoutVaultPoint(vault), movedPx: 0 }, hold: true };
  }
  const s = kumaBoutReact(s0, input, ai, t);
  const toward = unit([player[0] - s.point[0], player[1] - s.point[1]]);
  const faced: KumaCombatState = { ...s, facing: (toward && kumaScreenFacing(input.projection, toward)) ?? s.facing,
    direction: toward ?? s.direction, running: false, movedPx: 0 };
  const backPace = t.spacing?.backPaceScale ?? 1;
  // His guard up through the swing he read; a vault he just took off on.
  if (s.aiGuard != null) return { state: faced, hold: true };
  if (s.vault) return { state: s, hold: true };
  // A swing he will answer, seen before his reaction time: he does not start his own into it (2026-10-23 — 37 % of the swings started
  // within 0.1 s of the other's; the race, not a read, decided them).
  const swing = input.opponentSwing ?? null;
  if (swing && !swing.contacted && swing.ms < ai.react.fromMs && s.reacted !== swing.attackId && kumaBoutWillReact(s, swing.attackId, t, ai, input)) {
    return { state: faced, hold: true };
  }
  // One he lets play out (`react.yieldShare`, 2026-10-24): no swing of his own into it until its contact fires — its recovery is his opening.
  // Not a high shot his matrix answers (2026-10-25): that he leans back from at once.
  if (swing && !swing.contacted && !(kumaSkillSpec(t, "matrix") && kumaBoutStanceAnswer(s, t, input))
    && kumaBoutAiShare(swing.attackId * 7 + 9, t) < ai.react.yieldShare) return { state: faced, hold: true };
  // His step back from it.
  if ((s.backstep ?? 0) > 1e-9) {
    const back = walkBack(faced, player, input, s.backstep!, ai.react.backstepPaceScale, dt);
    return { state: { ...back.state, backstep: back.moved > 1e-9 ? Math.max(0, s.backstep! - back.moved) : 0 }, hold: true };
  }
  // The other down or rising: room (`afterDownStrides` beyond contact), facing him — no swing into the get-up.
  if (input.opponentDown === true) {
    const want = ai.retreat.afterDownStrides * input.stepUnits - kumaGap(s, player, input);
    return { state: want > 1e-9 ? walkBack(faced, player, input, want, backPace, dt).state : faced, hold: true };
  }
  const neutral = s.neutral;
  if (!neutral) return { state: s, hold: false };
  // An opening ends the measure: he goes in at once.
  if (input.opponentOpen === true && neutral.backUnits <= 1e-9) return { state: { ...s, neutral: null }, hold: false };
  if (neutral.backUnits > 1e-9) {
    const back = walkBack(faced, player, input, neutral.backUnits, backPace, dt);
    const left = back.moved > 1e-9 ? Math.max(0, neutral.backUnits - back.moved) : 0;
    return { state: { ...back.state, neutral: { leftMs: neutral.leftMs, backUnits: left } }, hold: true };
  }
  const leftMs = neutral.leftMs - Math.max(0, dt);
  return leftMs > 0 ? { state: { ...faced, neutral: { leftMs, backUnits: 0 } }, hold: true } : { state: { ...s, neutral: null }, hold: false };
}

/**
 * His measure before the swing he is about to start from the chase (`measure`): once per attack count, `share` of them he first stands
 * `holdMs` [min, max] where he is (just outside the swing's start, `marginStrides`). Null: he goes in.
 */
export function kumaBoutMeasure(s: KumaCombatState, t: KumaTuning, ai: KumaBoutAiTuning): KumaCombatState | null {
  if (kumaBoutAiShare(s.attacks * 5 + 1, t) >= ai.measure.share) return null;
  return { ...s, measured: s.attacks, neutral: { leftMs: pick(ai.measure.holdMs, kumaBoutAiShare(s.attacks * 5 + 2, t)), backUnits: 0 }, movedPx: 0,
    running: false };
}

/**
 * Let go after a string on him (a flinch, a stagger, a parry's recoil): `retreat.share` of the time he backs off `strides` [min, max] and
 * then stands a measure's hold (no retaliation into the other's next swing). Keyed on his attack count and HP (each string a new pick).
 */
export function kumaBoutRetreat(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning): KumaCombatState {
  const ai = t.boutAi;
  if (!ai || input.control) return s;
  const key = s.attacks * 11 + Math.round(s.hp * 97);
  if (kumaBoutAiShare(key + 7, t) >= ai.retreat.share) return s;
  const u = kumaBoutAiShare(key + 5, t);
  return { ...s, neutral: { leftMs: pick(ai.measure.holdMs, u), backUnits: pick(ai.retreat.strides, u) * input.stepUnits }, measured: s.attacks,
    running: false, retaliate: false };
}
