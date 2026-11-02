import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind } from "./NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { NATIVE_CITY_KUMA_MOVES, toChase, type KumaCombatInput, type KumaCombatState, type KumaCombatStep, type KumaDash,
  type KumaSpecialMove, type KumaTuning } from "./NativeCityKumaCombatState";
import { kumaActionFacing, kumaGap, kumaScreenDelta, kumaStepPx, kumaWalkPhase, unit } from "./NativeCityKumaGeometry";
import { kumaAuthoredReachStrides, kumaSuperSwing } from "./NativeCityKumaSwing";
import { kumaSkillDashTuning, kumaSkillFeintDecides, kumaSkillKind, kumaSkillSlideShare, kumaSkillSpec, kumaSkillSuperForm, kumaSkillThrough } from "./NativeCityKumaSkill";
import { kumaSkillLaunches } from "./NativeCityKumaAirChase";

/** KUMA형 파이터의 돌진(2026-10-13, `NativeCityKumaPatrol`에서 나눔): 도망 판정, 웅크림·질주·제동, 들어간 뒤의 재시작. */




export function kumaPlayerOutside(state: KumaCombatState, player: CityPoint, input: Pick<KumaCombatInput, "contactUnits" | "stepUnits">,
  t: KumaTuning): boolean {
  return kumaGap(state, player, input) > t.dash.fleeRadiusStrides * input.stepUnits;
}


export function kumaPlayerEvading(state: KumaCombatState, player: CityPoint, input: Pick<KumaCombatInput, "stepUnits">,
  t: KumaTuning): boolean {
  const [vx, vy] = state.playerVel, speed = Math.hypot(vx, vy);
  if (speed < 1e-12 || speed * 1000 < Math.max(0, t.dash.evadeMinStridesPerSec) * input.stepUnits) return false;
  const toward = unit([state.point[0] - player[0], state.point[1] - player[1]]);
  return !toward || vx * toward[0] + vy * toward[1] < t.dash.approachShare * speed;
}


export function kumaPlayerGettingAway(state: KumaCombatState, player: CityPoint | null,
  input: Pick<KumaCombatInput, "contactUnits" | "stepUnits" | "playerSteered">, wasInside: boolean, t: KumaTuning): boolean {
  const spec = t.dash;
  if (!player || !spec || input.playerSteered !== true) return false;
  if (!kumaPlayerOutside(state, player, input, t) || kumaGap(state, player, input) > spec.maxStrides * input.stepUnits) return false;
  return wasInside || state.mode === "attack" && state.fleeOutsideAtStart || kumaPlayerEvading(state, player, input, t);
}

/** The modes his flight time (`fleeMs`) adds up in: where a flight can still be dashed at, and his swing (it goes on into the stand). */
const FLIGHT_MODES: ReadonlySet<KumaCombatState["mode"]> = new Set(["chase", "cooldown", "abort", "attack"]);


export function kumaFleeMs(state: KumaCombatState, inside: boolean, gettingAway: () => boolean, dt: number): number {
  if (inside) return 0;
  if (state.mode === "dash") return state.fleeMs ?? 0;
  if (!FLIGHT_MODES.has(state.mode)) return 0;
  return (state.fleeMs ?? 0) + (gettingAway() ? dt : 0);
}


export function kumaFled(state: KumaCombatState, player: CityPoint | null, input: Pick<KumaCombatInput, "contactUnits" | "stepUnits" | "playerSteered">,
  wasInside: boolean, t: KumaTuning): boolean {
  if (!t.dash || state.dashCooldownMs > 0 || state.restart || !kumaPlayerGettingAway(state, player, input, wasInside, t)) return false;
  return state.mode === "attack" || (state.fleeMs ?? 0) >= Math.max(0, t.dash.fleeGraceMs);
}


export function enterDash(s: KumaCombatState, player: CityPoint, input: KumaCombatInput, t: KumaTuning, resume: NativeCityKumaActionKind,
  resumeCounts: boolean, windupMs = t.dash.windupMs, skill: KumaSpecialMove | null = null): KumaCombatStep {
  const aim = unit([player[0] - s.point[0], player[1] - s.point[1]]) ?? s.direction;
  // Point-blank, the crouch is long enough to read and answer; from afar the short crouch still catches a runner.
  const close = kumaGap(s, player, input) <= t.dash.closeRangeStrides * input.stepUnits;
  if (close) windupMs = Math.max(windupMs, t.dash.closeWindupMs);
  const facing = kumaActionFacing(input.projection, aim, "dash", input.artFacing) ?? s.facing;
  const attackId = s.attackId + 1, from: CityPoint = [s.point[0], s.point[1]], target: CityPoint = [player[0], player[1]];
  // A dash skill (`KumaTuning.skill` slide / flight / feint, 2026-10-22) is its own special: no bowling, no drawn landing.
  const bowl = !skill && (s.farMs ?? 0) >= NATIVE_CITY_KUMA_MOVES.specials.bowling.afterFarMs ? input.dashLanding?.(facing, "bowl") ?? null : null;
  const special: KumaSpecialMove | null = skill ?? (bowl?.move === "bowl" ? "bowl" : null);
  const drawn = skill ? null : bowl ?? input.dashLanding?.(facing) ?? null;
  return { state: { ...s, mode: "dash", modeMs: 0, action: null, attackId, hitsFired: 0, attackHits: 1, lastLandedHit: -1, lastHurtHit: -1,
    direction: aim, facing, movedPx: 0, committed: false, trackedPx: 0, lunge: false, kiteCount: 0, running: false, openingMs: 0,
    lastGap: Number.NaN, counterChain: false, restart: false, dashCooldownMs: t.dash.cooldownMs, reversal: false, wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0,
    leap: null, special: null, swingReach: null, swingRadial: null, farMs: special && !skill ? 0 : s.farMs ?? 0,
    dash: { phase: "windup", phaseMs: 0, windupMs: Math.max(0, windupMs), from, target, aim, heading: aim, travelled: 0, slid: 0,
      struck: false, resume, resumeCounts, speedShare: 0, travelMs: 0, pop: null, special, reachExtraStrides: drawn?.reachExtraStrides ?? null } },
  events: [{ kind: "dash-start", attackId, from, target, resume }] };
}

/** `from` turned toward `to` by at most `maxDeg` (plan unit vectors). */
function turnToward(from: CityPoint, to: CityPoint, maxDeg: number): CityPoint {
  const angle = Math.atan2(from[0] * to[1] - from[1] * to[0], from[0] * to[0] + from[1] * to[1]);
  const limit = Math.max(0, maxDeg) * Math.PI / 180, turn = Math.max(-limit, Math.min(limit, angle));
  return [from[0] * Math.cos(turn) - from[1] * Math.sin(turn), from[0] * Math.sin(turn) + from[1] * Math.cos(turn)];
}

/** The dash's reach, feet to feet (body contact + the drawn dash's reach, else his authored one — `kumaAuthoredReachStrides`). */
function dashReachUnits(input: Pick<KumaCombatInput, "contactUnits" | "stepUnits">, t: KumaTuning, dash?: KumaDash | null): number {
  const extra = dash?.reachExtraStrides ?? kumaAuthoredReachStrides("dash", t);
  return input.contactUnits + Math.max(0, extra) * input.stepUnits + 1e-9;
}

/** His top dash speed in screen px/s (`dash.topSpeedStrides`, a stride measured on the screen horizontal like `kumaStepPx`). */
export function kumaDashTopSpeedPx(input: Pick<KumaCombatInput, "projection" | "stepUnits">, t: KumaTuning): number {
  return Math.max(0, t.dash.topSpeedStrides) * kumaStepPx(input);
}

/** Share of top speed `ms` into the charge: an ease-in burst to full speed over `dash.accelMs`. */
export function kumaDashSpeedShare(ms: number, t: KumaTuning): number {
  const accel = Math.max(0, t.dash.accelMs);
  if (accel <= 0) return 1;
  const u = Math.max(0, Math.min(1, ms / accel));
  return u * u;
}


function dashIntercept(from: CityPoint, player: CityPoint, vel: CityPoint, input: KumaCombatInput, t: KumaTuning): CityPoint {
  const top = kumaDashTopSpeedPx(input, t);
  let at: CityPoint = player;
  for (let i = 0; i < 3; i++) {
    const delta: CityPoint = [at[0] - from[0], at[1] - from[1]], length = Math.hypot(delta[0], delta[1]);
    const pxPerUnit = length > 1e-9 ? Math.hypot(...kumaScreenDelta(input.projection, delta)) / length : 0;
    const ms = top > 1e-9 && pxPerUnit > 1e-9 ? Math.min(Math.max(0, t.dash.predictMaxMs), length * pxPerUnit / top * 1000) : 0;
    at = [player[0] + vel[0] * ms, player[1] + vel[1] * ms];
  }
  return at;
}


export function stepKumaDash(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning, dt: number): KumaCombatStep {
  const skill = kumaSkillKind(s.dash?.special);
  // A dash skill runs on its own numbers (`kumaSkillDashTuning`); a feint decides its stop before its branch (a person's second press).
  if (skill && s.dash) {
    t = kumaSkillDashTuning(t, s.dash, s.skillMarks);
    const decided = kumaSkillFeintDecides(s, s.dash, input, t);
    if (decided.dash !== s.dash) s = { ...s, dash: decided.dash, ...(decided.took ? { skillPress: (s.skillPress ?? 0) + 1 } : {}) };
  }
  const spec = t.dash, d = s.dash;
  if (!d) return { state: toChase({ ...s, dash: null }), events: [] };
  const phaseMs = d.phaseMs + dt;
  if (d.phase === "windup") {
    const player = input.player, aim = player ? unit([player[0] - s.point[0], player[1] - s.point[1]]) ?? d.aim : d.aim;
    const facing = player ? kumaActionFacing(input.projection, aim, "dash", input.artFacing) ?? s.facing : s.facing;
    const target: CityPoint = player ? [player[0], player[1]] : d.target;
    const turned = { ...s, facing, direction: aim, dash: { ...d, phaseMs, aim, heading: aim, target, from: s.point } };
    if (phaseMs < d.windupMs) return { state: turned, events: [] };
    const predicted = player ? dashIntercept(s.point, player, s.playerVel, input, t) : target;
    const line = unit([predicted[0] - s.point[0], predicted[1] - s.point[1]]) ?? aim;
    const lead = Math.max(0, spec.leadStrides) * input.stepUnits;
    const locked: KumaDash = { ...turned.dash, phase: "travel", phaseMs: 0, aim: line, heading: line,
      target: [predicted[0] + line[0] * lead, predicted[1] + line[1] * lead] };
    return stepKumaDash({ ...turned, direction: line, dash: locked }, input, t, phaseMs - d.windupMs);
  }
  if (d.phase === "pop") {
    // The bowling tackle pops out and lands, then restarts the cut attack (a hit) or stands (a block).
    const pop = d.pop;
    if (pop && phaseMs < pop.ms) return { state: { ...s, dash: { ...d, phaseMs, speedShare: 0 } }, events: [] };
    const restart = pop?.restart ? kumaRestartAttack(s, pop.restart.action, pop.restart.counts, input.player, input) : null;
    return { state: restart ?? { ...s, mode: "cooldown", modeMs: 0, dash: null, movedPx: 0, backedUnits: 0 }, events: [] };
  }
  if (d.phase === "recover") {
    return { state: phaseMs >= spec.whiffRecoverMs ? toChase({ ...s, dash: null, action: null }) : { ...s, dash: { ...d, phaseMs, speedShare: 0 } },
      events: [] };
  }
  const top = kumaDashTopSpeedPx(input, t);
  if (d.phase === "slide") {
    // A dash skill's strike that landed or was blocked: he gets up (its open stand), no pop-out and no restart.
    if (skill && d.struck && s.lastLandedHit >= 0 && !kumaSkillThrough(skill, t)) {
      return { state: { ...s, movedPx: 0, dash: { ...d, phase: "recover", phaseMs: 0, speedShare: 0 } }, events: [] };
    }
    // A strike that landed or was blocked stops him here (a landed one has already restarted the cut attack).
    if (d.struck && s.lastLandedHit >= 0) {
      // A drawn dash finishes its strike (the swing's follow, the ball's popout and stomp) before he stands.
      const landing = input.dashLanding?.(s.facing, d.special) ?? null;
      if (landing) return { state: { ...s, movedPx: 0, dash: { ...d, phase: "pop", phaseMs: 0, speedShare: 0, pop: { ms: landing.popMs, restart: null } } }, events: [] };
      return { state: { ...s, mode: "cooldown", modeMs: 0, dash: null, movedPx: 0, backedUnits: 0 }, events: [] };
    }
    // The brake: from top speed down to a stop over brakeMs, skidding at most skidStrides.
    const left = Math.max(0, spec.skidStrides * input.stepUnits - d.slid);
    const share = Math.max(0, 1 - (d.phaseMs + dt / 2) / Math.max(1, spec.brakeMs));
    const pxPerUnit = Math.hypot(...kumaScreenDelta(input.projection, d.heading));
    const units = pxPerUnit > 1e-9 ? Math.min(left, top * share * dt / 1000 / pxPerUnit) : left;
    const ghost = input.moveGhost ?? input.move;
    const next = units > 0 ? ghost(s.point, [s.point[0] + d.heading[0] * units, s.point[1] + d.heading[1] * units]) : s.point;
    const moved = Math.hypot(next[0] - s.point[0], next[1] - s.point[1]);
    const done = left - moved <= 1e-6 || share <= 0 || units > 0 && moved < units * 0.25;
    const movedPx = Math.hypot(...kumaScreenDelta(input.projection, [next[0] - s.point[0], next[1] - s.point[1]]));
    return { state: { ...s, point: next, movedPx, dash: done ? { ...d, phase: "recover", phaseMs: 0, slid: d.slid + moved, speedShare: 0 }
      : { ...d, phaseMs, slid: d.slid + moved, speedShare: share } }, events: [] };
  }
  const player = input.player, vel = s.playerVel, reach = dashReachUnits(input, t, d);
  const ahead = player ? dashIntercept(s.point, player, vel, input, t) : null;
  const toward = ahead ? unit([ahead[0] - s.point[0], ahead[1] - s.point[1]]) : null;
  const heading = toward ? turnToward(d.aim, toward, spec.homingDeg) : d.heading;
  // The slide's super form (2026-10-22 4차, `superSkill.passes`): runs through the body still to come after this one.
  const superForm = kumaSkillSuperForm(d.special), passing = (d.passesLeft ?? 0) > 0, pass = d.pass ?? 0;
  const strike = (state: KumaCombatState, travelled: number, share: number): KumaCombatStep => {
    // A dash his full meter bought (`superAction: "dash"`, 2026-10-22) strikes as his super: its damage scaled, the contact flagged. A run
    // of his super slide before its last strikes with `passAction`'s first contact (a light blow that keeps the body there for the next).
    const action = "dash" as const, passAction = passing ? t.superSkill?.passAction : undefined;
    const hit = passAction ? t.actions[passAction] : t.actions.dash, superHit = kumaSuperSwing(state);
    const look = player ? unit([player[0] - state.point[0], player[1] - state.point[1]]) ?? heading : heading;
    // The flight strikes once in passing and flies on to its end (`skill` flight); so does a slide through the body (`passThrough`).
    const through = kumaSkillThrough(skill, t, superForm);
    const phase = through ? "travel" as const : "slide" as const;
    // A launching skill throws the body up (`NativeCityKumaAirChase`) — the super slide's last run only.
    const air = !passing && kumaSkillLaunches({ special: d.special ?? null }, t);
    return { state: { ...state, hitsFired: pass + 1, fleeMs: 0, dash: { ...d, phase, phaseMs: through ? phaseMs : 0, heading, travelled, struck: true,
      speedShare: share } },
      events: [{ kind: "strike", action, attackId: state.attackId, hitIndex: pass,
        damage: (hit.damage[0] ?? 0) * (superHit ? NATIVE_CITY_COMBAT.super.damageScale : 1), tier: hit.tier, direction: look,
        facing: state.facing, ...(superHit ? { super: true as const } : {}), ...(air ? { air: "launch" as const } : {}),
        ...(passing ? { pass: true as const } : {}) }] };
  };
  const maxUnits = Math.max(0, spec.maxTravelStrides) * input.stepUnits;
  // The feint stops at its branch point (`branchShare` of the way to contact with where it locked on at launch, its lead off): no contact,
  // its open stand draws the stop.
  const toContact = Math.max(0, Math.hypot(d.target[0] - d.from[0], d.target[1] - d.from[1]) - Math.max(0, spec.leadStrides) * input.stepUnits - reach);
  if (skill === "feint" && d.feintStop === true && d.travelled >= Math.max(0, kumaSkillSpec(t, "feint")?.branchShare ?? 0.5) * Math.min(maxUnits, toContact) - 1e-9) {
    return { state: { ...s, movedPx: 0, dash: { ...d, phase: "recover", phaseMs: 0, heading, speedShare: 0 } }, events: [] };
  }
  // The flight strikes once (`struck`): after that it only flies on (a slide through the body too).
  const through = kumaSkillThrough(skill, t, superForm);
  const contactOpen = !(through && d.struck);
  if (contactOpen && player && Math.hypot(player[0] - s.point[0], player[1] - s.point[1]) <= reach) return strike({ ...s, movedPx: 0 }, d.travelled, d.speedShare);
  const travelMs = d.travelMs + dt;
  // The slide slows on the floor along its run (`endSpeedShare`).
  // A slide through the body runs on at its top speed once it struck (out the far side, then the air chase turns back).
  const share = through && d.struck ? 1
    : kumaDashSpeedShare(d.travelMs + dt / 2, t) * (skill === "slide" ? kumaSkillSlideShare(d.travelled, maxUnits, t) : 1);
  const left = Math.max(0, maxUnits - d.travelled);
  const pxPerUnit = Math.hypot(...kumaScreenDelta(input.projection, heading));
  const units = pxPerUnit > 1e-9 ? Math.min(left, top * share * dt / 1000 / pxPerUnit) : left;
  const want: CityPoint = [s.point[0] + heading[0] * units, s.point[1] + heading[1] * units];
  if (player && contactOpen) {
    const p0: CityPoint = [player[0] - vel[0] * dt, player[1] - vel[1] * dt];
    const r0: CityPoint = [s.point[0] - p0[0], s.point[1] - p0[1]], r1: CityPoint = [want[0] - player[0], want[1] - player[1]];
    const dr: CityPoint = [r1[0] - r0[0], r1[1] - r0[1]], span = dr[0] * dr[0] + dr[1] * dr[1];
    const u = span > 1e-12 ? Math.max(0, Math.min(1, -(r0[0] * dr[0] + r0[1] * dr[1]) / span)) : 0;
    const closest: CityPoint = [r0[0] + dr[0] * u, r0[1] + dr[1] * u];
    if (Math.hypot(closest[0], closest[1]) <= reach) {
      const contactAt = input.move(s.point, [player[0] + closest[0], player[1] + closest[1]]);
      const moved = Math.hypot(contactAt[0] - s.point[0], contactAt[1] - s.point[1]);
      const movedPx = Math.hypot(...kumaScreenDelta(input.projection, [contactAt[0] - s.point[0], contactAt[1] - s.point[1]]));
      return strike({ ...s, point: contactAt, movedPx }, d.travelled + moved, share);
    }
  }
  // The flight passes through bodies (walls only); a slide through the body once it struck.
  const ghost = skill === "flight" || through && d.struck;
  const next = units > 0 ? (ghost ? input.moveGhost ?? input.move : input.move)(s.point, want) : s.point;
  const moved = Math.hypot(next[0] - s.point[0], next[1] - s.point[1]);
  const movedPx = Math.hypot(...kumaScreenDelta(input.projection, [next[0] - s.point[0], next[1] - s.point[1]]));
  const travelled = d.travelled + moved;
  const at = { ...s, point: next, movedPx, phase: kumaWalkPhase(s.phase, movedPx, input.runStridePx ?? input.stridePx * t.chase.runPaceScale) };
  const blocked = units > 1e-9 && moved < units * 0.25;
  // His super slide's next run (`superSkill.passes`): past the body by `turnStrides`, at a wall or at its run's end, he spins
  // round on his belly toward the body and runs again — the contact open again, from a standing start (the view draws the spin, `keys.turn`).
  if (passing && player) {
    const past = (next[0] - player[0]) * heading[0] + (next[1] - player[1]) * heading[1];
    if (past >= Math.max(0, t.superSkill?.turnStrides ?? t.airChase?.passStrides ?? 0) * input.stepUnits || left - moved <= 1e-6 || blocked) {
      const back = unit([player[0] - next[0], player[1] - next[1]]) ?? [-heading[0], -heading[1]] as CityPoint;
      const facing = kumaActionFacing(input.projection, back, "dash", input.artFacing) ?? at.facing;
      return { state: { ...at, facing, direction: back, dash: { ...d, phase: "travel", phaseMs: 0, from: next, target: [player[0], player[1]],
        aim: back, heading: back, travelled: 0, travelMs: 0, struck: false, speedShare: 0, passesLeft: (d.passesLeft ?? 1) - 1, pass: pass + 1 } },
      events: [] };
    }
  }
  // past him to its end and lands (its open stand), never skids.
  const passed = !through && player !== null && (player[0] - next[0]) * heading[0] + (player[1] - next[1]) * heading[1] < 0;
  if (left - moved <= 1e-6 || blocked || passed) {
    return { state: { ...at, dash: { ...d, phase: blocked || skill === "flight" ? "recover" : "slide", phaseMs: 0, heading, travelled, travelMs,
      speedShare: share } }, events: [] };
  }
  return { state: { ...at, dash: { ...d, phaseMs, heading, travelled, travelMs, speedShare: share } }, events: [] };
}


export function kumaDashRestart(state: KumaCombatState, player: CityPoint | null,
  input: Pick<KumaCombatInput, "projection" | "timing" | "artFacing" | "dashLanding">): { readonly state: KumaCombatState; readonly impactMs: number | null } {
  const dash = state.dash;
  // A dash skill neither restarts a cut swing nor pops out: its own step takes the strike on (`stepKumaDash`).
  if (state.mode !== "dash" || !dash || kumaSkillKind(dash.special)) return { state, impactMs: null };
  const landing = input.dashLanding?.(state.facing, dash.special) ?? null;
  if (landing) {
    const direction = (player && unit([player[0] - state.point[0], player[1] - state.point[1]])) ?? state.direction;
    const facing = kumaActionFacing(input.projection, direction, dash.resume, input.artFacing) ?? state.facing;
    const timing = input.timing(dash.resume, facing);
    return { state: { ...state, movedPx: 0, dash: { ...dash, phase: "pop", phaseMs: 0, speedShare: 0,
      pop: { ms: landing.popMs, restart: timing ? { action: dash.resume, counts: dash.resumeCounts } : null } } },
    impactMs: timing ? landing.popMs + (timing.hitsMs[0] ?? 0) : null };
  }
  const restarted = kumaRestartAttack(state, dash.resume, dash.resumeCounts, player, input);
  if (!restarted) {
    return { state: { ...state, mode: "cooldown", modeMs: 0, dash: null, movedPx: 0, lastLandedHit: 0, wakeGuard: false, backedUnits: 0 }, impactMs: null };
  }
  return { state: restarted, impactMs: input.timing(restarted.action ?? dash.resume, restarted.facing)?.hitsMs[0] ?? null };
}


function kumaRestartAttack(state: KumaCombatState, action: NativeCityKumaActionKind, counts: boolean, player: CityPoint | null,
  input: Pick<KumaCombatInput, "projection" | "timing" | "artFacing">): KumaCombatState | null {
  const direction = (player && unit([player[0] - state.point[0], player[1] - state.point[1]])) ?? state.direction;
  const facing = kumaActionFacing(input.projection, direction, action, input.artFacing) ?? state.facing;
  const timing = input.timing(action, facing);
  if (!timing) return null;
  const armed = state.superArmed === true ? { superAttack: state.attackId + 1, superArmed: false } : {};
  return { ...state, ...armed, mode: "attack", modeMs: 0, action, attacks: state.attacks + (counts ? 1 : 0), attackId: state.attackId + 1,
    hitsFired: 0, direction, facing, movedPx: 0, attackHits: timing.hitsMs.length, lastLandedHit: -1, lastHurtHit: -1, counterChain: false, committed: false,
    trackedPx: 0, lunge: false, restart: true, fleeOutsideAtStart: false, dash: null, running: false, windupScale: 1, reversal: false, leap: null,
    special: null, swingReach: timing.move?.reachExtraStrides ?? null, swingRadial: timing.move?.radial ?? null,
    slams: (state.slams ?? 0) + (action === "slam" ? 1 : 0), jabCut: false, windupSlow: 1 };
}
