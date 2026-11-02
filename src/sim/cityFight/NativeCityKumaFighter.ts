import { createKumaPatrol, stepKumaPatrol, type KumaPatrolPlan, type KumaPatrolState } from "./NativeCityKumaPatrol";
import { createKumaCombat, kumaCombatEngaged, NATIVE_CITY_KUMA_MOVES, type KumaArtFacing, type KumaCombatEvent, type KumaCombatHit, type KumaCombatHitOptions, type KumaCombatInput, type KumaCombatState, type KumaTuning } from "./NativeCityKumaCombatState";
import { kumaCombatGrounded, kumaCombatGuarding, kumaCombatLying, kumaCombatHit, kumaCombatOpenChance, kumaCombatParry, kumaCombatVulnerable, kumaStrikeLanded } from "./NativeCityKumaHit";
import { kumaAuthoredReachStrides, kumaStrikeRound } from "./NativeCityKumaSwing";
import { kumaDashRestart } from "./NativeCityKumaDash";
import { kumaSkillKind } from "./NativeCityKumaSkill";
import { kumaAirHeightAfter, kumaAirLaunch } from "./NativeCityKumaAir";
import type { NativeCityKumaAirTuning } from "./NativeCityCombatTuning";
import { kumaAirSpec } from "./NativeCityKumaAirChase";
import { kumaCombatCounterGauge } from "./NativeCityKumaCounter";
import { kumaCarryCutSuper, kumaPressOn, stepKumaCombat } from "./NativeCityKumaCombat";
import { kumaStrikeDirection } from "./NativeCityKumaGeometry";
import type { NativeCityKumaFightOps } from "./NativeCityFightFrame";
import type { CityPoint, NativeCityDefinition } from "../../world/NativeCityDefinition";
import { nativeCityActorStepBlocked, nativeCityFootprintRadius, type NativeCityFootprint } from "../NativeCityActorCollision";
import { nativeCityBodyStep, nativeCityMeleeReach, stepNativeCityKnockedBody, type NativeCityKnock } from "./NativeCityMelee";
import { duelHpKnockScale } from "../duel/DuelKnockback";
import { cityFightMeterGain } from "./CityFightMeter";
import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind, type NativeCityKumaGrade, type NativeCityMeleeTier } from "./NativeCityCombatTuning";
import { nativeCityKumaGrade } from "./NativeCityExchange";
import type { VillageFacing } from "../VillageFacing";



/** A blow's push in flight: plan direction, its length (plan units) and the fight ms it has run; `launch`: on the launch curve. */
export type NativeCityKumaKnockback = NativeCityKnock;

/** What his frame says happened (`stepNativeCityKumaFighter`): his fight's events, his launch's wall splat among them. */
export type NativeCityKumaFighterEvent = KumaCombatEvent;

/** His launch hit the end of the stage line (a wall, the ground's edge, a body): where, along what, and how much was left (strides). */
export type NativeCityKumaWallEvent = Extract<KumaCombatEvent, { readonly kind: "knock-wall" }>;

export interface NativeCityKumaFighterState {
  readonly patrol: KumaPatrolState;
  readonly combat: KumaCombatState;
  readonly knockback: NativeCityKumaKnockback | null;
  /** One stride (plan units) in the last frame's projection (`nativeCityStepUnits`); 0 before his first step. */
  readonly stepUnits: number;
  /** The last frame's (orbit-rotated) projection; null before his first step — the blows wait for it. */
  readonly projection: NativeCityDefinition["projection"] | null;
  /** His footprint radius (plan units) at the last frame's stride; 0 before his first step. */
  readonly footprintRadius: number;

  readonly here: boolean;
  /**
   * His down clock (`combat.modeMs`) when his knockdown or KO flight splatted on the line's end (2026-10-20 review): the drawn fall plays on
   * unchanged and lands when it always did; only the flight's lift comes down from the height it hit at to the ground by then
   * (`duelWallFallLift`). Absent: no splat in this fall; every new hit or flight clears it. (It replaced a skip of the fall's clock
   * that, cornered, jumped the whole drawn fall in one frame.)
   */
  readonly downWallMs: number | undefined;
  /**
   * His KO flight sprang back off the rope at `downWallMs` (2026-10-24, a fighter bout's `koRebound` — `nativeCityKumaFighterKoRebound`):
   * the flight's lift rises `liftBodies` more over the rebound and comes down to the ground at the drawn fall's impact
   * (`nativeCityKoLift`). Absent: no rebound; cleared with `downWallMs`.
   */
  readonly downRebound: number | undefined;
}

/**
 * What his art says to the rules (the view reads it off his pack; a test hands constants). Facing-keyed lengths are closures: the
 * step asks them at the heading he is in when the frame's fight step starts.
 */
export interface NativeCityKumaArtBridge {
  /** His swing's fight timing at a heading (`kumaFightTiming`); null until the fight art is in — he does not swing without it. */
  readonly timing: KumaCombatInput["timing"];
  /** Which heading his pack draws a clip at (`kumaPackArtFacing`); absent: the four diagonals. */
  readonly artFacing?: KumaArtFacing;
  /** The walk's screen pace (px/s) and one walk cycle's screen stride (px), the art's own (`kumaWalkStride`). */
  readonly pacePxPerSec: number;
  readonly stridePx: number;
  /** One run cycle at run pace (screen px, `kumaRunStridePx`). Asked only while he fights: the patrol never needs his run art. */
  readonly runStridePx: () => number;
  /** Fight ms from a knockdown blow to his drawn fall's lying step at that heading; null without a drawn fall (`exchangeFx.ko.launchMs`). */
  readonly fallMs: (facing: VillageFacing) => number | null;
  /** How long a poise break holds him at that heading (`kumaBreakMs`; the authored default keys without art). */
  readonly breakMs: (facing: VillageFacing) => number;
  /** His get-up's length at that heading (the hit clip's recover frames; 500 without art). */
  readonly getUpMs: (facing: VillageFacing) => number;
  /** A flinch's default length (a flinch carries its own, the chain's computed one or the ender's). Absent: `kuma.hurt.fallbackFlinchMs`. */
  readonly hurtMs?: number;
  /**
   * Fight ms from the KO blow to his body meeting the ground at that heading (the drawn fall's ground-impact step); absent or null: the
   * procedural launch (`exchangeFx.ko.launchMs`). Only the fight's finale reads it (`nativeCityKumaFightOps`).
   */
  readonly koImpactMs?: (facing: VillageFacing) => number | null;
  /**
   * His dash as drawn at that heading (`KumaDashLanding`: the roll-and-rise, or the bowling tackle when `special` asks for it): its pop-out
   * after a strike and its strike's reach; absent / null: the old dash.
   */
  readonly dashLanding?: KumaCombatInput["dashLanding"];
}

/** One frame of the fighter (the view's frame input, already reduced to what the rules read). */
export interface NativeCityKumaFighterInput {
  readonly plan: KumaPatrolPlan;
  /** His fight tuning: KUMA's, or a test fighter's over it (its reaches measured off his clips). */
  readonly tuning: KumaTuning;
  /** Screen ms this frame: the patrol's clock. */
  readonly dtMs: number;
  /** Time stops (dialogue, hidden or unfocused window): patrol and fight both hold. */
  readonly frozen: boolean;
  /** The reduced-motion setting holds the patrol only; a fight still runs. */
  readonly reducedMotion?: boolean;
  /** Hit stop: the fight clock and knockback hold for this frame. */
  readonly hitStopped?: boolean;
  /** The fight clock's speed this frame; 1 by default. */
  readonly timeScale?: number;
  /** His knockback's clock speed this frame (`DuelClock.knockScale` — no release ramp); absent: `timeScale`. */
  readonly knockTimeScale?: number;
  /** He is an enemy in the visit's faction table. */
  readonly hostile: boolean;

  readonly player: CityPoint | null;

  readonly playerRadius?: number;

  readonly playerSteered?: boolean;

  readonly playerGuardMs?: number;
  /** The opponent cannot strike first now (`KumaCombatInput.opponentOpen` — the fighter-against-fighter bout fills it in). */
  readonly opponentOpen?: boolean;
  /** The opponent thrown up (`KumaCombatInput.opponentAir` — the bout fills it in for his air chase). */
  readonly opponentAir?: KumaCombatInput["opponentAir"];
  /** The bout AI's reads (`KumaCombatInput.opponentSwing` / `opponentDown` / `superLocked` — 2026-10-23, `boutAi`). */
  readonly opponentSwing?: KumaCombatInput["opponentSwing"];
  readonly opponentDown?: boolean;
  readonly superLocked?: boolean;
  /** A high shot is coming at him (`KumaCombatInput.highShotComing` — the bout fills it in for 이토's matrix, 2026-10-25). */
  readonly highShotComing?: boolean;
  /** Plan units behind him to the line's end (`KumaCombatInput.backRoomUnits` — the bout AI's vault, 2026-10-23 2차). */
  readonly backRoomUnits?: number;
  /** Plan units behind the other to the line's end (`KumaCombatInput.beyondRoomUnits` — a through-dash's way out, `roomBeyondStrides`). */
  readonly beyondRoomUnits?: number;
  /** This frame takes his summon cast (`KumaCombatInput.summons` — the session fills it in on a stage); absent: he never casts. */
  readonly summons?: KumaCombatInput["summons"];
  /** A person controls him this frame (`KumaCombatInput.control`, 2026-10-22, the competitive engine); absent: the AI. */
  readonly control?: KumaCombatInput["control"];
  /** The other bodies in his view (none when he is elsewhere): he steps round them and his patrol holds rather than step into one. */
  readonly blockers: readonly NativeCityFootprint[];
  readonly walkable?: (from: CityPoint, to: CityPoint) => boolean;
  readonly route?: (from: CityPoint, to: CityPoint) => readonly CityPoint[] | null;
  /** The side-scroll stage: every step and its result snapped onto the fight's line (absent: free). */
  readonly line?: (point: CityPoint) => CityPoint;
  readonly projection: NativeCityDefinition["projection"];
  readonly stepUnits: number;
  readonly footprintRadius: number;
  readonly art: NativeCityKumaArtBridge;
}


export interface NativeCityKumaBlow extends KumaCombatHitOptions {
  readonly damage: number;
  /** The attacker's feet. */
  readonly from: CityPoint;
  readonly push: CityPoint;
  readonly tier: NativeCityMeleeTier;

  readonly launch?: { readonly strides: number; readonly curve: boolean; readonly guardShare: number };
  /** His push grows as his HP runs out (`knockback.hpScale`, `NativeCityKumaReceive.hpKnock`). Absent: off (the headless bout). */
  readonly hpKnock?: boolean;
  /** × the push he slides on the ground (2026-10-22 4차, a bout's ice — `CityFightBoutTraces`). Absent: 1. Not the air's pushes; under 1 not a KO's. */
  readonly pushScale?: number;
  /**
   * It builds no meter of his (`super.gainTaken`, 2026-10-23): an awakening's follow-up blow — the super was one blow, its scripted blows after
   * it are not more (eleven of them filled a third of his meter).
   */
  readonly meterless?: boolean;
}

/** A blow's outcome: the next state, the rule result (`KumaCombatHit`) and the knockback it started (null: none). */
export interface NativeCityKumaFighterHit {
  readonly state: NativeCityKumaFighterState;
  readonly hit: KumaCombatHit;
  readonly knockback: NativeCityKumaKnockback | null;
}

/** Standing at his post's first point with `hp` (his tuning's), nothing measured yet. */
export function createNativeCityKumaFighter(plan: KumaPatrolPlan, hp: number): NativeCityKumaFighterState {
  const patrol = createKumaPatrol(plan);
  return Object.freeze({ patrol, combat: createKumaCombat(patrol.point, hp), knockback: null, stepUnits: 0, projection: null, footprintRadius: 0,
    here: false, downWallMs: undefined, downRebound: undefined });
}


export function nativeCityKumaFighterPresent(state: NativeCityKumaFighterState): boolean {
  return state.projection !== null && state.here;
}


export function nativeCityKumaFighterThreat(state: NativeCityKumaFighterState): NativeCityKumaActionKind | null {
  const combat = state.combat;
  return combat.mode === "dash" ? "dash" : combat.mode === "attack" ? combat.action ?? null : null;
}


export function nativeCityKumaFighterGrade(state: NativeCityKumaFighterState): NativeCityKumaGrade | null {
  const combat = state.combat;
  if (combat.mode === "dash") return combat.dash?.phase === "windup" || combat.dash?.phase === "travel" ? nativeCityKumaGrade("dash") : null;
  return combat.mode === "attack" && combat.action && combat.hitsFired < Math.max(1, combat.attackHits) ? nativeCityKumaGrade(combat.action) : null;
}

/**
 * He still fights (2026-10-20 — his summons stay out while this holds, `CityFightSummons`): engaged and not walking home, HP left (a
 * knockdown keeps them out, his KO ends them).
 */
export function nativeCityKumaFighterFighting(state: NativeCityKumaFighterState): boolean {
  const combat = state.combat;
  return kumaCombatEngaged(combat) && combat.mode !== "return" && combat.hp > 0;
}

/** Where his feet are (plan): the fight's point while engaged, else the patrol's. */
export function nativeCityKumaFighterPoint(state: NativeCityKumaFighterState): CityPoint {
  return kumaCombatEngaged(state.combat) ? state.combat.point : state.patrol.point;
}

/** The fight clock this frame: held by a freeze or a hit stop, else screen ms × `timeScale`. */
export function nativeCityKumaFightDt(frame: { readonly dtMs: number; readonly frozen: boolean; readonly hitStopped?: boolean;
  readonly timeScale?: number }): number {
  return frame.frozen || frame.hitStopped ? 0 : Math.max(0, frame.dtMs) * Math.max(0, frame.timeScale ?? 1);
}

function freeze(state: NativeCityKumaFighterState): NativeCityKumaFighterState { return Object.freeze(state); }

/**
 * `combat` standing at `at`: the same state when `at` is bit for bit where he stands (a snap onto the line he already stands on — most
 * steps), else a copy there. Skipping the copy changes no value (2026-10-30, as `createKumaCombat`).
 */
function standingAt(combat: KumaCombatState, at: CityPoint): KumaCombatState {
  return Object.is(at[0], combat.point[0]) && Object.is(at[1], combat.point[1]) ? combat : { ...combat, point: at };
}

function knockbackAlong(direction: CityPoint, units: number, launch = false): NativeCityKumaKnockback | null {
  return units > 0 ? Object.freeze({ direction, units, elapsedMs: 0, ...(launch ? { launch } : {}) }) : null;
}

/**
 * One frame. The fight runs whenever he is engaged (or just challenged), the reduced-motion setting notwithstanding: a challenge
 * starts the fight from where the patrol stands; the fight's "home" event (back at the post) puts the patrol back there, paused and
 * facing outward; the knockback runs on the fight clock after the fight's own step; with a stage line every step and its result are
 * held on it. Out of the fight the patrol walks — and never steps into a body (the leg holds, same target, idle feet). The returned
 * events are the fight step's (`KumaCombatEvent`), none out of the fight.
 */
export function stepNativeCityKumaFighter(state: NativeCityKumaFighterState, input: NativeCityKumaFighterInput)
  : { readonly state: NativeCityKumaFighterState; readonly events: readonly NativeCityKumaFighterEvent[] } {
  const { plan, art, projection, stepUnits, footprintRadius, blockers } = input, here = input.player !== null;
  const fightDt = nativeCityKumaFightDt(input);
  let patrol = state.patrol, combat = state.combat, knockback = state.knockback;
  let downWallMs = state.downWallMs, downRebound = state.downRebound;
  // A zero clock must also hold state transitions: the second block queues his counter, but the guard contact pose lasts
  // through the shared freeze. Running the state machine at dt=0 used to start the attack while both bodies were stopped.
  if (input.frozen || input.hitStopped) return { state: freeze({ ...state, combat: { ...combat, movedPx: 0 },
    stepUnits, projection, footprintRadius, here }), events: [] };
  let events: readonly NativeCityKumaFighterEvent[] = [];
  if (kumaCombatEngaged(combat) || input.hostile) {
    if (!kumaCombatEngaged(combat)) combat = { ...combat, point: patrol.point, facing: patrol.facing };
    const home = plan.points[patrol.target]?.at ?? patrol.point;
    // The side-scroll stage: every step and its result snapped onto the fight's line (none: free).
    const line = input.line ?? ((point: CityPoint) => point);
    const fallMs = art.fallMs(combat.facing), fallImpactMs = art.koImpactMs?.(combat.facing) ?? null;
    // A knockdown, and the KO blow's flight (`knockback.ko`, 2026-10-20), fly until his drawn fall meets the ground.
    if (knockback && (combat.knockdown || combat.hp <= 0) && combat.mode === "down" && knockback.elapsedMs === 0 && knockback.flightMs === undefined) {
      const landMs = art.koImpactMs?.(combat.facing) ?? NATIVE_CITY_COMBAT.exchangeFx.ko.launchMs;
      // Hit stop already supplied the catch. Unweighting and flight start together on its first released tick. The KO's flight leaves
      // fast (`knockback.ko.flightEase`).
      // A fighter's own slide after it (`KumaFighterOverrides.downSlide`, 2026-10-22 5차 — the penguin on the ice).
      const slide = input.tuning.downSlide;
      knockback = { ...knockback, flightMs: Math.max(1, landMs), ...(combat.hp <= 0 ? { flightEase: NATIVE_CITY_COMBAT.knockback.ko.flightEase } : {}),
        ...(slide ? { slide: { afterMs: Math.max(1, landMs), units: (combat.hp <= 0 ? slide.koStrides : slide.strides) * stepUnits, ms: slide.ms } } : {}) };
      downWallMs = undefined;
      downRebound = undefined;
    }
    const step = stepKumaCombat(combat, {
      dtMs: fightDt, hostile: input.hostile, player: input.player,
      projection, stepUnits,
      contactUnits: footprintRadius + (input.playerRadius ?? nativeCityFootprintRadius("player", stepUnits)),
      pacePxPerSec: art.pacePxPerSec, stridePx: art.stridePx, runStridePx: art.runStridePx(),
      artFacing: art.artFacing,
      timing: art.timing,
      dashLanding: art.dashLanding,
      // A knockdown lies from where his drawn fall reaches its lying step.
      fallMs: fallMs ?? undefined,
      // The air combo's landing picks the fall up at its ground impact (`rhythm.launch.air`).
      fallImpactMs: fallImpactMs ?? undefined,
      // A flinch carries its own length (`hurtMs`, the chain's computed one or the ender's); this is the default.
      hurtMs: art.hurtMs ?? input.tuning.hurt.fallbackFlinchMs,
      breakMs: art.breakMs(combat.facing),
      getUpMs: art.getUpMs(combat.facing),
      move: (from, to) => line(nativeCityBodyStep(from, line(to), footprintRadius, blockers, input.walkable)),
      moveGhost: (from, to) => line(nativeCityBodyStep(from, line(to), footprintRadius, [], input.walkable)),
      playerSteered: input.playerSteered === true,
      // Every key every step, absent ones `undefined` (a null air or a missing summon/control as before, when they were left out): one input
      // shape, read fast all through the fight step (2026-10-30, as `createKumaCombat`).
      playerGuardMs: input.playerGuardMs,
      opponentOpen: input.opponentOpen,
      opponentAir: input.opponentAir || undefined,
      opponentSwing: input.opponentSwing,
      opponentDown: input.opponentDown,
      superLocked: input.superLocked,
      highShotComing: input.highShotComing,
      backRoomUnits: input.backRoomUnits,
      beyondRoomUnits: input.beyondRoomUnits,
      summons: input.summons || undefined,
      control: input.control || undefined,
      route: (from, to) => input.route?.(from, to) ?? null,
      home,
    }, input.tuning);
    // blow or parry cut is spent (he earned that: `kumaCarryCutSuper`).
    const carried = kumaCarryCutSuper(combat, step.state);
    combat = standingAt(carried, line(carried.point));
    // A person's held guard is up whenever he is back in his neutral (out of a flinch too), down otherwise (`KumaControl.guard`).
    // Handed back to the AI (F8 mid-bout): the person's guard and his whiffs' kiting count go with him — the AI never holds a guard, and a
    // person's whiffs must not make the AI's first swing a lunge.
    if (input.control) combat = { ...combat, controlGuard: combat.mode === "chase" && input.control.guard, kiteCount: 0 };
    else if (combat.controlGuard) combat = { ...combat, controlGuard: false };
    events = step.events;
    if (events.some(event => event.kind === "home")) {
      // Back at the post: the patrol picks up where it stood, facing outward.
      patrol = { ...patrol, point: home, mode: "pause", pauseLeftMs: plan.points[patrol.target]?.pauseMs ?? 0, alert: false, movedPx: 0 };
    }
    // hand eases back (2026-10-19, game-animator).
    const knockDt = input.knockTimeScale === undefined ? fightDt : nativeCityKumaFightDt({ ...input, timeScale: input.knockTimeScale });
    const knocked = stepKnockback(combat, knockback, knockDt, stepUnits, footprintRadius, blockers, input.walkable, input.line);
    ({ combat, knockback } = knocked);
    if (knocked.downWallMs !== undefined) downWallMs = knocked.downWallMs;
    if (input.line) combat = standingAt(combat, input.line(combat.point));
    if (knocked.wall) events = [...events, knocked.wall];
  }
  if (!kumaCombatEngaged(combat)) {
    const before = patrol;
    const next = stepKumaPatrol(plan, before, {
      dtMs: input.dtMs, player: input.player, projection, stepUnits, pacePxPerSec: art.pacePxPerSec, stridePx: art.stridePx,
      frozen: input.frozen || input.reducedMotion === true,
    });
    // He never steps into a body: hold the leg (same target, idle feet) until the way is clear.
    patrol = nativeCityActorStepBlocked(before.point, next.point, footprintRadius, blockers)
      ? { ...before, alert: next.alert, facing: next.mode === before.mode ? next.facing : before.facing, movedPx: 0 } : next;
  }
  return { state: freeze({ patrol, combat, knockback, stepUnits, projection, footprintRadius, here, downWallMs, downRebound }), events };
}

/**
 * The knockback's travel over `dtMs` of fight clock (the curve's remaining length before minus after — a launch on its own curve), a body
 * step along its direction (held on the stage `line`); it ends when nothing remains. Nothing moves while the fight clock holds. A launch
 * or a down flight (a knockdown's, the KO's — `knockback.ko`) that this frame makes less than half its way (a wall, the line's end, a body)
 * with at least `knockback.launch.wallMinStrides` still to go ends there: `wall`. A down flight's splat also gives `downWallMs` (his down
 * clock then): the fall keeps its clock, only its lift comes down from there.
 */
function stepKnockback(combat: KumaCombatState, knock: NativeCityKumaKnockback | null, dtMs: number, stepUnits: number, radius: number,
  blockers: readonly NativeCityFootprint[], walkable?: (from: CityPoint, to: CityPoint) => boolean, line?: (point: CityPoint) => CityPoint)
  : { readonly combat: KumaCombatState; readonly knockback: NativeCityKumaKnockback | null; readonly wall?: NativeCityKumaWallEvent;
    readonly downWallMs?: number } {
  if (!knock || dtMs <= 0) return { combat, knockback: knock };
  const step = stepNativeCityKnockedBody(combat.point, knock, dtMs, stepUnits, radius, blockers, walkable, line);
  let next = combat;
  if (step.travel > 0) {
    next = { ...combat, point: step.point };
    const left = step.leftUnits - Math.max(0, step.moved), spec = NATIVE_CITY_COMBAT.knockback.launch;
    // A launch, or a down flight (the KO blow's — `knockback.ko` — or a knockdown's), cut short by the line's end splats on it.
    const down = combat.mode === "down" && knock.flightMs !== undefined;
    // A KO's rope rebound only stops where it is stopped (`rebound` — one splat per fall).
    const flying = knock.rebound !== true && (knock.launch === true || (combat.hp <= 0 && knock.flightMs !== undefined) || down);
    if (flying && step.moved < 0.5 * step.travel && left >= spec.wallMinStrides * stepUnits) {
      // A down flight cut short comes down from where it hit (2026-10-20, game-animator: he climbed the post, hung, then dropped in a
      // frame): its clock runs on — the drawn fall whole, its impact when it always was — and the view lowers its lift from here.
      return { combat: next, knockback: null, wall: Object.freeze({ kind: "knock-wall", point: step.point, direction: knock.direction,
        strides: stepUnits > 0 ? left / stepUnits : 0 }),
        ...(down ? { downWallMs: next.modeMs } : {}) };
    }
  }
  return { combat: next, knockback: step.knock };
}

/**
 * The push a landed blow gives him (plan units): his guard's small shove (`kuma.guard.pushStrides`); the KO's flight (`knockback.ko.strides`);
 * his attack armour's small step when it absorbed it (`kuma.rhythm.armor.pushStrides`, 2026-10-19 — none before); else a light / heavy stride push (`knockback.lightStrides` / `heavyStrides` — the break pushes like a heavy
 * blow, a counter jab still like a jab so the chain stays in reach) × the broken body's `poise.break.knockbackScale` × the opening
 * counter's `knockback.counterScale` (only the opening one: the chain and the breaking hit push like their own tier). The string's
 * ender skids him back at least `kuma.hurt.enderKnockbackStrides` — drawn in the held recoil, never an idle slide.
 */
function hitKnockbackUnits(result: KumaCombatHit, tier: NativeCityMeleeTier, stepUnits: number, tuning: KumaTuning,
  launch?: NativeCityKumaBlow["launch"]): number {
  // its own finale and the poise break its own beat (the punish chain must still reach the broken body); on the broken body the jab /
  // straight push like a broken body (`poise.break.knockbackScale`) and the string's ender — the tie whip — flies its whole length.
  if (result.blocked) return Math.max(tuning.guard.pushStrides, (launch?.strides ?? 0) * (launch?.guardShare ?? 0)) * stepUnits;
  // The ground blow (`kuma.rhythm.down`) pushes nothing: he lies where he fell.
  if (result.ground) return 0;
  // The KO blow sends him flying (`knockback.ko`, 2026-10-20 — the Rivals reference: he used to lie down where he stood). The flight runs to
  // his drawn fall's ground impact (`stepNativeCityKumaFighter`) and splats on the stage line's end.
  // A launching KO blow (a summon's launch, the tie whip) flies its own length when that is longer (2026-10-20 review: the roadster's KO flew
  // shorter than its plain hit).
  if (result.defeated) return Math.max(NATIVE_CITY_COMBAT.knockback.ko.strides, launch?.strides ?? 0) * stepUnits;
  if (launch && !result.armored && !result.defeated && !result.broke) {
    const scale = result.onBroken && !result.ender ? NATIVE_CITY_COMBAT.poise.break.knockbackScale : 1;
    return Math.max(hitKnockbackUnits(result, tier, stepUnits, tuning), launch.strides * scale * stepUnits);
  }
  const absorbed = result.armored, k = NATIVE_CITY_COMBAT.knockback;
  const heavy = tier === "heavy" || result.broke || result.defeated;
  const scale = (result.onBroken ? NATIVE_CITY_COMBAT.poise.break.knockbackScale : 1)
    * (result.counter && !result.chained && !result.broke ? k.counterScale : 1);
  // His armour takes the blow whole but still gives a step (`kuma.rhythm.armor.pushStrides`, 2026-10-19): his move goes on, a little further off.
  let units = absorbed ? (tuning.rhythm?.armor.pushStrides ?? 0) * stepUnits : (heavy ? k.heavyStrides : k.lightStrides) * scale * stepUnits;
  if (result.ender && !absorbed && !result.broke && !result.defeated) {
    units = Math.max(units, tuning.hurt.enderKnockbackStrides * stepUnits);
  }
  return units;
}

/**
 * A blow on him (`kumaCombatHit`: damage, poise, armour, counter, guard, break, knockdown, KO) and, when it landed, the knockback
 * along `push` it starts (`hitKnockbackUnits`; replacing the one in flight, none when absorbed). A blow that did not land changes
 * nothing; before his first step (no projection) nothing lands.
 */
export function nativeCityKumaFighterHit(state: NativeCityKumaFighterState, blow: NativeCityKumaBlow,
  tuning: KumaTuning): NativeCityKumaFighterHit {
  const projection = state.projection;
  if (!projection) {
    return { state, knockback: null, hit: { state: state.combat, hit: false, defeated: false, staggered: false, damage: 0, armored: false,
      counter: false, broke: false, onBroken: false, chained: false, blocked: false, ender: false, knockdown: false } };
  }
  const { damage, from, push, tier, launch, hpKnock, pushScale, meterless, ...options } = blow;
  // His own tuning judges the blow (guard, armour, hurt — a skinned fighter's over KUMA's); the shared poise and counter window are the file's.
  const result = kumaCombatHit(state.combat, damage, from, projection, options, tuning);
  if (!result.hit) return { state, hit: result, knockback: null };
  // it holds him where he stands; only the burst's last contact pushes, as the single jab did, and the string stays in reach. Not on his
  // armour: the bounce ends the burst there, and the armour's step (`armor.pushStrides`) is the blow's only push (2026-10-19).
  const setup = options.stringCount === 0 && !result.blocked && !result.armored && !result.broke && !result.defeated;
  // spike none — the flight is up and down; a KO in the air flies its own way.
  const airSpec = tuning.rhythm?.launch.air;
  const airPush = result.air === undefined || result.defeated || !airSpec ? null
    : result.air === "launch" ? airSpec.pushStrides : result.air === "juggle" ? airSpec.hitPushStrides : 0;
  if (airPush !== null) {
    const knockback = knockbackAlong(push, airPush * state.stepUnits);
    const combat = tuning.superOff !== true && meterless !== true && result.damage > 0 ? { ...result.state, meter: cityFightMeterGain(result.state.meter, "taken") } : result.state;
    return { state: freeze({ ...state, combat, knockback, downWallMs: undefined, downRebound: undefined }), hit: { ...result, state: combat }, knockback };
  }
  const base = setup ? 0 : hitKnockbackUnits(result, tier, state.stepUnits, tuning, launch);
  // The string's ender or a heavy blow pushes further as his HP runs out (`knockback.hpScale`, 2026-10-20); the string's other contacts
  // keep theirs so the chain still reaches. Grown past `launchFromStrides` it flies on the launch curve (its wall splat).
  const hpSpec = NATIVE_CITY_COMBAT.knockback.hpScale;
  const grows = hpKnock === true && base > 0 && !result.blocked && !result.armored && !result.defeated && !result.broke && result.ground !== true
    && result.follow !== true && (result.ender || tier === "heavy");
  // The KO's flight keeps its length on a string's mid contact (2026-10-23 arena audit 3차 — a bout's string scale cut 3 strides to 1.2 on
  // a fifth of the KOs); the ice's longer slide still carries it.
  const scale = result.defeated ? Math.max(1, pushScale ?? 1) : Math.max(0, pushScale ?? 1);
  const units = (grows ? base * duelHpKnockScale(result.state.hp / Math.max(1e-9, tuning.hp), hpSpec) : base) * scale;
  // On the launch curve only when the launch is what moves him (not his guard's slide, nor a longer push of his own), or his grown push.
  const flies = (launch?.curve === true && !result.blocked && !result.armored && !result.defeated && !result.broke
    && base <= launch.strides * state.stepUnits + 1e-9) || (grows && units >= hpSpec.launchFromStrides * state.stepUnits);
  const knockback = knockbackAlong(push, units, flies);
  // A blow he takes builds his meter (`super.gainTaken`, 2026-10-20) — not one his guard took.
  const combat = tuning.superOff !== true && meterless !== true && !result.blocked && result.damage > 0
    ? { ...result.state, meter: cityFightMeterGain(result.state.meter, "taken") } : result.state;
  return { state: freeze({ ...state, combat, knockback, downWallMs: undefined, downRebound: undefined }), hit: { ...result, state: combat }, knockback };
}

/**
 * His string's contact landed and pushed the body `units` along `toward` (2026-10-22, the competitive engine's stage 7 — a fighter bout's
 * string follow): he steps after it the same way, so the next contact of his string is still in reach. Nothing before his first step.
 */
export function nativeCityKumaFighterFollow(state: NativeCityKumaFighterState, toward: CityPoint, units: number): NativeCityKumaFighterState {
  const step = knockbackAlong(toward, units);
  return step && state.projection ? freeze({ ...state, knockback: step }) : state;
}

/**
 * His flight in a flinch splatted on the line's end (`wall`, 2026-10-22 5차 — a fighter bout's wall bounce, 사용자 추천 3번 "벽에 닿으면 튕겨
 * 나와 한 대 더"): he springs off it back toward the middle, `strides` along the line and up `liftBodies` on the bout's air (`air`), open
 * as a launched body is (the air chase may follow; a ground blow meets the low body). Not a KO's flight, not a knockdown's, not a body
 * already up. Nothing before his first step.
 */
export function nativeCityKumaFighterWallBounce(state: NativeCityKumaFighterState, wall: NativeCityKumaWallEvent,
  bounce: { readonly strides: number; readonly liftBodies: number }, air: NativeCityKumaAirTuning | undefined): NativeCityKumaFighterState {
  const c = state.combat;
  if (!air || !state.projection || c.hp <= 0 || c.mode !== "hurt" || c.air) return state;
  const back: CityPoint = [-wall.direction[0], -wall.direction[1]];
  return freeze({ ...state, combat: { ...c, modeMs: 0, retaliate: true, followOpen: true, air: kumaAirLaunch({ ...air, liftBodies: bounce.liftBodies }) },
    knockback: knockbackAlong(back, bounce.strides * state.stepUnits, true) });
}

/**
 * His KO flight splatted on the rope (`wall`, 2026-10-24 — a fighter bout's `koRebound`, 관전 감사: a third of the KOs came at the rope and lay
 * down where they hit it): he springs back off it toward the middle, `strides` along the line over what is left of his drawn fall (to
 * `impactMs`, its ground impact), his lift rising `liftBodies` more (`downRebound` — the view's `nativeCityKoLift`); `strides` 0: the
 * lift only, where he hit the rope. A body in the way stops him there with no second splat. Not with less than `minMs` of the fall left,
 * not twice in one fall, not a body that is not down and out. Nothing before his first step.
 */
export function nativeCityKumaFighterKoRebound(state: NativeCityKumaFighterState, wall: NativeCityKumaWallEvent,
  rebound: { readonly strides: number; readonly liftBodies: number; readonly minMs: number }, impactMs: number | undefined,
  slide?: { readonly koStrides: number; readonly ms: number }): NativeCityKumaFighterState {
  const c = state.combat;
  if (!state.projection || c.hp > 0 || c.mode !== "down" || state.downRebound !== undefined || impactMs === undefined) return state;
  const left = impactMs - c.modeMs;
  if (!(left >= rebound.minMs)) return state;
  const back: CityPoint = [-wall.direction[0], -wall.direction[1]];
  // No way back (`strides` 0 — the other body right there): the rope's give only pops him up where he hit it. His own slide after a KO
  // flight (`downSlide` — the penguin on the ice) goes on after the rebound (2026-10-24: the rebound's new push dropped it).
  const units = rebound.strides * state.stepUnits;
  const slid = slide ? { afterMs: Math.max(1, left), units: slide.koStrides * state.stepUnits, ms: slide.ms } : null;
  const knock = units > 0 || slid ? Object.freeze({ direction: back, units, elapsedMs: 0, flightMs: left,
    flightEase: NATIVE_CITY_COMBAT.knockback.ko.flightEase, rebound: true as const, ...(slid ? { slide: slid } : {}) }) : null;
  return freeze({ ...state, knockback: knock, downWallMs: c.modeMs, downRebound: rebound.liftBodies });
}

/**
 * His swing met the other fighter's (2026-10-22 5차, a fighter bout's clash — `CityFightBoutRules.clash`): cut into the parry's recoil for
 * `recoilMs` (no poise lost, never the groggy break), shoved `pushStrides` along `push`. No damage; `meter`: his meter gains a guarded
 * blow's share (`super` — a clash builds toward the super that goes through). Nothing before his first step.
 */
export function nativeCityKumaFighterClash(state: NativeCityKumaFighterState, from: CityPoint, push: CityPoint, recoilMs: number,
  pushStrides: number, meter: boolean, artFacing?: KumaArtFacing): NativeCityKumaFighterState {
  const projection = state.projection;
  if (!projection) return state;
  const result = kumaCombatParry(state.combat, from, projection, { groggy: false, poise: 0, ...(artFacing ? { artFacing } : {}) });
  if (!result.parried || result.broke) return state;
  const combat = { ...result.state, recoilMs, ...(meter ? { meter: cityFightMeterGain(result.state.meter, "blocked") } : {}) };
  return freeze({ ...state, combat, knockback: knockbackAlong(push, pushStrides * state.stepUnits) });
}


export function nativeCityKumaFighterParry(state: NativeCityKumaFighterState, from: CityPoint, push: CityPoint,
  options: { readonly groggy: boolean; readonly artFacing?: KumaArtFacing })
  : { readonly state: NativeCityKumaFighterState; readonly parried: boolean; readonly broke: boolean } {
  const projection = state.projection;
  if (!projection) return { state, parried: false, broke: false };
  const result = kumaCombatParry(state.combat, from, projection, { groggy: options.groggy, poise: NATIVE_CITY_COMBAT.parry.poiseDrain,
    artFacing: options.artFacing });
  if (!result.parried) return { state, parried: false, broke: result.broke };
  const knockback = knockbackAlong(push, NATIVE_CITY_COMBAT.parry.kumaPushStrides * state.stepUnits);
  return { state: freeze({ ...state, combat: result.state, knockback }), parried: true, broke: result.broke };
}


export function nativeCityKumaFighterStrikeLanded(state: NativeCityKumaFighterState, attackId: number, hitIndex: number,
  clock: { readonly attackId: number; readonly hitsMs: readonly number[] } | null, blocked = false): NativeCityKumaFighterState {
  let combat = kumaStrikeLanded(state.combat, attackId, hitIndex, blocked);
  const at = clock && clock.attackId === attackId ? clock.hitsMs[hitIndex] : undefined;
  if (at !== undefined && combat.mode === "attack") combat = { ...combat, modeMs: Math.min(combat.modeMs, at) };
  return combat === state.combat ? state : freeze({ ...state, combat });
}


export function nativeCityKumaFighterDashConnected(state: NativeCityKumaFighterState,
  art: Pick<NativeCityKumaArtBridge, "timing" | "artFacing" | "dashLanding">)
  : { readonly state: NativeCityKumaFighterState; readonly impactMs: number | null } {
  const projection = state.projection;
  if (!projection) return { state, impactMs: null };
  const restart = kumaDashRestart(state.combat, state.combat.lastPlayer, { projection, timing: art.timing, artFacing: art.artFacing,
    ...(art.dashLanding ? { dashLanding: art.dashLanding } : {}) });
  return { state: freeze({ ...state, combat: restart.state }), impactMs: restart.impactMs };
}


export function nativeCityKumaFighterGrabCaught(state: NativeCityKumaFighterState): NativeCityKumaFighterState {
  const combat = state.combat;
  if (combat.mode !== "attack" || combat.action !== "grab" || combat.grab) return state;
  return freeze({ ...state, combat: { ...combat, grab: { beats: 0 } } });
}


export function nativeCityKumaFighterPressOn(state: NativeCityKumaFighterState): NativeCityKumaFighterState {
  const combat = kumaPressOn(state.combat);
  return combat === state.combat ? state : freeze({ ...state, combat });
}


export function nativeCityKumaFightOps(art: NativeCityKumaArtBridge, tuning: KumaTuning)
  : NativeCityKumaFightOps<NativeCityKumaFighterState> {
  return {
    tuning,
    present: nativeCityKumaFighterPresent,
    vulnerable: state => kumaCombatVulnerable(state.combat),
    point: nativeCityKumaFighterPoint,
    radius: state => state.footprintRadius,
    guarding: state => kumaCombatGuarding(state.combat, tuning),
    threatGrade: nativeCityKumaFighterGrade,
    reachExtraStrides: (state, action) => nativeCityKumaFighterReachExtraStrides(state, action, tuning),
    slamKnocksDown: state => tuning.slamShockwave !== undefined || state.combat.mode === "attack" && state.combat.special === "buttSlam",
    // The drawn fall's ground impact (a splat on the line's end does not move it — `downWallMs`).
    koImpactMs: state => art.koImpactMs?.(state.combat.facing) ?? undefined,
    receiveHit: (state, blow) => {
      const { chainBeat: _beat, ...string } = blow.string;
      const taken = nativeCityKumaFighterHit(state, { damage: blow.damage, from: blow.from, push: blow.push, tier: blow.tier, poise: blow.poise,
        pierce: blow.pierce, ...(blow.throughArmor ? { throughArmor: true } : {}), ...(blow.ranged ? { ranged: true } : {}), artFacing: art.artFacing, axis: blow.axis, ...string,
        ...(blow.launch ? { launch: blow.launch } : {}),
        ...(blow.hpKnock ? { hpKnock: true } : {}), ...(blow.pushScale !== undefined ? { pushScale: blow.pushScale } : {}),
        ...(blow.meterless ? { meterless: true } : {}) }, tuning);
      return { kuma: taken.state, hit: taken.hit, knockbackUnits: taken.state.knockback?.units ?? 0 };
    },
    strikeLanded: (state, landing) => {
      // His swing's clock as it was when the contact landed (the view's `attackClock()`): the timing of the swing he is in, at his heading.
      const combat = state.combat;
      const timing = combat.mode === "attack" && combat.action ? art.timing(combat.action, combat.facing, combat.windupScale, combat.special) : null;
      const landed = nativeCityKumaFighterStrikeLanded(state, landing.attackId, landing.hitIndex,
        timing ? { attackId: combat.attackId, hitsMs: timing.hitsMs } : null, landing.blocked ?? false);
      return tuning.superOff === true || landed === state || landing.attackId === landed.combat.superAttack ? landed
        : freeze({ ...landed, combat: { ...landed.combat, meter: cityFightMeterGain(landed.combat.meter, landing.blocked ? "blocked" : "hit") } });
    },
    receiveParry: (state, from, push, groggy) => {
      const parried = nativeCityKumaFighterParry(state, from, push, { groggy, artFacing: art.artFacing });
      return { kuma: parried.state, parried: parried.parried, broke: parried.broke };
    },
    dashConnected: state => {
      const restart = nativeCityKumaFighterDashConnected(state, art);
      return { kuma: restart.state, impactMs: restart.impactMs };
    },
    pressOn: nativeCityKumaFighterPressOn,
    grabCaught: nativeCityKumaFighterGrabCaught,
    rematch: (state, point, facing) => nativeCityKumaFighterRematch(state, tuning.hp, point, facing),
    grounded: state => kumaCombatGrounded(state.combat),
    lying: state => kumaCombatLying(state.combat),
    air: state => {
      const air = state.combat.air, spec = kumaAirSpec(tuning);
      return air && spec && state.combat.hp > 0 ? { heightBodies: air.heightBodies, hitsLeft: air.bounced || air.hits < spec.maxHits,
        heightAfter: ms => kumaAirHeightAfter(air, ms, spec), ...(air.bounced ? { bounced: true } : {}) } : null;
    },
    openChance: (state, kind) => {
      const combat = kumaCombatOpenChance(state.combat, kind, tuning);
      return combat === state.combat ? state : freeze({ ...state, combat });
    },
    counterGauge: state => {
      const combat = state.combat;
      if (!tuning.rhythm?.counter || combat.mode !== "attack" || !combat.action) return null;
      const timing = art.timing(combat.action, combat.facing, combat.windupScale, combat.special);
      return kumaCombatCounterGauge(combat, timing?.hitsMs ?? null, tuning);
    },
    spendCounter: state => state.combat.counterSpentId === state.combat.attackId ? state
      : freeze({ ...state, combat: { ...state.combat, counterSpentId: state.combat.attackId } }),
  };
}

/**
 * His swing's reach beyond body contact (strides) as the fight judges it: the butt slam's landing shockwave while he is on a leap
 * (`native-city-kuma-moves.json` buttSlam `shockwaveReachExtraStrides`, round his landing point); a drawn swing's contact as drawn (the iron
 * ball's, `KumaCombatState.swingReach`); the drawn dash's strike (the rising ball); else his measured one (`tuning.reachExtraStrides`), else
 * `kuma.strikes`.
 */
export function nativeCityKumaFighterReachExtraStrides(state: NativeCityKumaFighterState, action: NativeCityKumaActionKind,
  tuning: KumaTuning): number {
  const combat = state.combat;
  // A skill's leap (the burrow) comes up with its own reach (`swingReach`, below).
  if (action === "slam" && combat.mode === "attack" && combat.leap && kumaSkillKind(combat.special) === null) {
    return NATIVE_CITY_KUMA_MOVES.buttSlam.shockwaveReachExtraStrides;
  }
  // A drawn swing's contact reaches as drawn (the ball): the contact just fired (`hitsFired` counts it).
  const drawn = combat.mode === "attack" ? combat.swingReach : null;
  if (drawn && drawn.length > 0 && action !== "dash") return drawn[Math.max(0, Math.min(drawn.length - 1, combat.hitsFired - 1))]!;
  if (action === "dash" && combat.mode === "dash" && combat.dash?.reachExtraStrides != null) return combat.dash.reachExtraStrides;
  return kumaAuthoredReachStrides(action, tuning);
}


export interface NativeCityKumaStrikeZone {
  readonly action: NativeCityKumaActionKind;
  readonly origin: CityPoint;
  readonly direction: CityPoint;
  /** Plan units from `origin` to the farthest feet it strikes. */
  readonly reach: number;
  readonly round: boolean;
  readonly coneHalfAngleDeg: number;
}

export function nativeCityKumaFighterStrikeZone(state: NativeCityKumaFighterState, playerRadius: number,
  tuning: KumaTuning): NativeCityKumaStrikeZone | null {
  const combat = state.combat, projection = state.projection;
  // The summon cast has no contact of its own (its object is told by the summon view).
  if (combat.mode !== "attack" || !combat.action || combat.action === "summon" || projection === null) return null;
  const action = combat.action;
  return { action, origin: combat.leap?.to ?? combat.point, direction: kumaStrikeDirection(projection, combat.direction, combat.facing),
    reach: nativeCityMeleeReach(state.footprintRadius, playerRadius, state.stepUnits, nativeCityKumaFighterReachExtraStrides(state, action, tuning)),
    round: kumaStrikeRound(combat, action, combat.hitsFired, tuning), coneHalfAngleDeg: NATIVE_CITY_COMBAT.melee.coneHalfAngleDeg };
}


export function nativeCityKumaFighterRematch(state: NativeCityKumaFighterState, hp: number, point?: CityPoint, facing?: VillageFacing)
  : NativeCityKumaFighterState {
  const at = point ?? nativeCityKumaFighterPoint(state);
  const face = facing ?? (kumaCombatEngaged(state.combat) ? state.combat.facing : state.patrol.facing);
  return freeze({ ...state, combat: { ...createKumaCombat(at, hp), facing: face }, patrol: { ...state.patrol, point: at, facing: face, movedPx: 0 },
    knockback: null, downWallMs: undefined, downRebound: undefined });
}
