import { clamp01 } from "../geom";
import type { DuelContactMotion } from "../duel/DuelImpact";
import { nativeCityPlayerCancelTuning, nativeCityPlayerContactTuning } from "./NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityPlayerAirMove, type NativeCityPlayerAirTuning, type NativeCityPlayerJumpTuning, type NativeCityMeleeTier,
  type NativeCityPlayerActionKind } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";



/** The heel drop's jump in a swing (fight ms): he leaves the ground at `takeoffMs` and the heel meets it at `contactMs`. */
export interface NativeCityPlayerJump {
  readonly takeoffMs: number;
  readonly contactMs: number;
  /** An air move (`player.air`, 2026-10-21): its contact in the air, the landing after it. Absent: the heel drop (it lands on its contact). */
  readonly air?: NativeCityPlayerAirArc;
}


export interface NativeCityPlayerAirArc {
  readonly move: NativeCityPlayerAirMove;
  readonly fromBodies: number;
  readonly apexBodies: number;
  readonly apexMs: number;
  readonly landMs: number;
  readonly travelUnits: number;
}

/** Fight ms ↔ clip ms knots (`NativeCityClipWarp` — the render's tempo warp, data only). */
export interface NativeCitySwingWarp {
  readonly art: readonly number[];
  readonly fight: readonly number[];
}

/** Attack-owned contact semantics. A receiver chooses its own pose without knowing the attacker or move name. */
export type NativeCityContactMotion = DuelContactMotion;
export interface NativeCitySwingContact {
  readonly motion: NativeCityContactMotion;
  /** End of anticipation, in this swing's fight clock. Weight transfer accelerates from here into contact. */
  readonly releaseMs: number;
  /** Visual contact height as a fraction of the receiver's body. Does not change hit judgment. */
  readonly fxHeight?: number;
  /**
   * Visual contact inset as a fraction of the receiver's body: how far the burst sits back from the receiver's centre toward the
   * attacker (`feel.fx.contactInset` when absent). Does not change hit judgment.
   */
  readonly fxInset?: number;
}

/** A swing's beats (fight ms), art-derived (`nativeCityPlayerActionTimeline`). */
export interface NativeCityPlayerSwingTimeline {
  /** Fight ms the swing lasts. */
  readonly totalMs: number;
  /** Fight ms of its contacts. */
  readonly hitsMs: readonly number[];
  /** Authored contact holds carry physical follow-through (e.g. a tie pushing a body). Never consume them during hitstop. */
  readonly preserveContactHold?: boolean;
  /** 원화 클립에서 온 박자인가(아니면 자리표시자). */
  readonly art: boolean;
  /** 접촉 칸마다 그려진 멈춤 길이(원화 시퀀스 칸 길이, 배속 없이). 자리표시자는 비어 있다. */
  readonly contactHoldsMs: readonly number[];
  /** Its first contact's index in the action's tables (damage, tier, poise, pierce, lunge): a chain swing's segment, else 0. */
  readonly firstHit: number;
  /** Input-chain segment, independent of how many contacts that swing contains. */
  readonly chainSegment?: number;
  /** It ends a string (the hook, V): C / V wait for its end instead of cutting it. */
  readonly ender: boolean;

  readonly warp: NativeCitySwingWarp;
  /**
   * Per contact, its reach beyond body contact (strides) read off the art (`melee.reachFromArt` — the rubber arm, the tie, the whip, the
   * heel). Absent (the diagonals' fists, the placeholder): `melee.reachExtraStrides`.
   */
  readonly reachExtraStrides?: readonly number[];
  /** Local contacts read from the attack's own clip, independent of the opposing character. */
  readonly contacts?: readonly NativeCitySwingContact[];
  /** A real jump (the side heel drop, `player.actions.attack.jump`): its takeoff and landing contact. Absent: on the ground. */
  readonly jump?: NativeCityPlayerJump;
  /** V's charge (2026-10-18): the fight ms the clock holds at (the drawn crouch) while V is down. Absent: it never charges. */
  readonly charge?: { readonly holdAtMs: number };
  /** The pack clip it is drawn from when not the kind's own (an air move's, `player.air` — `airC`, `airV`, `airStomp`). Absent: the kind's clip. */
  readonly clip?: "airC" | "airV" | "airStomp";
  /** An air clip's drawn landing (clip ms, its `keys.land` step): played from the moment his feet touch down. Absent: none drawn. */
  readonly landArtMs?: number;
}

/** A charging swing's hold (`timeline.charge`): fight ms V has been down since the swing began, and whether it was let go. */
export interface NativeCityPlayerCharge {
  readonly heldMs: number;
  readonly released: boolean;
}

/** One running swing. `facing`: the heading it is drawn at (the strike axis); `direction`: the plan direction it is judged along. */
export interface NativeCityPlayerSwing {
  readonly kind: NativeCityPlayerActionKind;
  readonly facing: VillageFacing;
  readonly direction: CityPoint;
  readonly attackId: number;
  readonly stepUnits: number;
  readonly timeline: NativeCityPlayerSwingTimeline;
  readonly elapsedMs: number;
  readonly hitsFired: number;
  /** Contacts (local) that landed on a body (the cancel comes sooner after a hit than after a whiff). */
  readonly landed: readonly boolean[];
  /** 그림만 앞당기는 시간(원화 ms): 히트스톱이 그려진 접촉 멈춤을 먹은 만큼(판정·박자는 그대로). */
  readonly displaySkipMs: number;
  /**
   * Plan units of step-in / jump travel given so far. A step's travel is what the curve reaches beyond it — a hit-lag hold rewinds
   * `elapsedMs` to the contact, and travel already given past it (the sliding tackle's skid) must not be given twice.
   */
  readonly lungedUnits: number;
  /**
   * Fight ms he stood free (no swing) before this swing began (`chain.idleMs` at its start). The jab's cut (`kuma.rhythm.jabCut`) takes a
   * swing begun from a free stance after the tell — an answer, not a mash already rolling. Absent: unknown (never an answer).
   */
  readonly freeBeforeMs?: number;
  /** V's charge (`timeline.charge`), null for a swing that never charges. */
  readonly charge: NativeCityPlayerCharge | null;
  /** His super (`super`, 2026-10-20): the meter spent on an instant full-charge V — its contacts hit `super.damageScale` harder. */
  readonly super?: boolean;
}


export interface NativeCityPlayerSwingState {
  readonly current: NativeCityPlayerSwing | null;
  readonly serial: number;
}

/**
 * What may cut a swing at its cancel point: another swing (C / V), or a walk (`other`). A defensive press (`defense`: X's dodge or
 * vault, Z's guard / parry, ←← backstep) cuts it at once, from its first frame (2026-10-18, user: "회피·반격·카운터는 캔슬되고 나가야").
 */
export type NativeCityCancelBy = "swing" | "other" | "defense" | "air";

export interface NativeCityPlayerContact {
  /** 몇 번째 접촉(0부터) — 동작의 표(피해·티어·균형·관통) 번호. 연타면 토막 번호다. */
  readonly hitIndex: number;
  /** 이 휘두름 안의 몇 번째 접촉(`timeline.hitsMs` 번호). */
  readonly localIndex: number;
  readonly damage: number;
  readonly tier: NativeCityMeleeTier;

  readonly charge?: number;

  readonly super?: boolean;
}

export interface NativeCityPlayerSwingStep {
  readonly state: NativeCityPlayerSwingState;
  /** 이번 갱신에서 새로 닿은 접촉(순서대로). 짧은 dt 를 건너뛰어도 빠지지 않는다. */
  readonly contacts: readonly NativeCityPlayerContact[];
  /** 이번 갱신에 앞으로 내디딜 평면 거리. */
  readonly lungeUnits: number;
  /** 이번 갱신으로 동작이 끝났다. */
  readonly finished: boolean;
}

/** The presentation's easing a step-in follows (0..1 → 0..1, `easeOutCubic`): passed in, never re-defined here. */
export type NativeCityLungeCurve = (u: number) => number;

const swingState = (current: NativeCityPlayerSwing | null, serial: number): NativeCityPlayerSwingState =>
  Object.freeze({ current: current ? Object.freeze(current) : null, serial });

export function createNativeCityPlayerSwing(): NativeCityPlayerSwingState {
  return swingState(null, 0);
}

/** The swing's attack id now (between swings: the last one's). */
export function nativeCityPlayerSwingAttackId(state: NativeCityPlayerSwingState): number {
  return state.current?.attackId ?? state.serial;
}

/**
 * A new swing (a new attack id). `timeline`: its beats at the heading it is drawn at (`nativeCityPlayerActionTimeline`). `released`: a
 * charging swing whose key is already up (a tap, or a press let go while it waited in the queue) — it fires as soon as the crouch is reached.
 */
export function startNativeCityPlayerSwing(state: NativeCityPlayerSwingState, swing: { readonly kind: NativeCityPlayerActionKind;
  readonly facing: VillageFacing; readonly direction: CityPoint; readonly stepUnits: number; readonly timeline: NativeCityPlayerSwingTimeline;
  readonly freeBeforeMs?: number; readonly released?: boolean; readonly super?: boolean })
  : NativeCityPlayerSwingState {
  const serial = state.serial + 1, { timeline } = swing;
  // His super (`super`, 2026-10-20): the charge already full and let go — the kick comes as soon as the crouch is reached. Since 2026-10-21
  // (the staged super) it starts `super.crouchLeadMs` short of the crouch: the 100 ms walk down into it held the blow back after the cut-in.
  const full = swing.super === true ? NATIVE_CITY_COMBAT.player.actions[swing.kind].charge?.fullMs ?? 0 : 0;
  const start = swing.super === true && timeline.charge ? Math.max(0, timeline.charge.holdAtMs - NATIVE_CITY_COMBAT.super.crouchLeadMs) : 0;
  return swingState({ kind: swing.kind, facing: swing.facing, direction: swing.direction, attackId: serial, stepUnits: swing.stepUnits, timeline,
    elapsedMs: start, hitsFired: 0, landed: Object.freeze(timeline.hitsMs.map(() => false)), displaySkipMs: 0, lungedUnits: 0,
    ...(swing.freeBeforeMs !== undefined ? { freeBeforeMs: swing.freeBeforeMs } : {}),
    charge: timeline.charge ? Object.freeze({ heldMs: full, released: swing.released === true || swing.super === true }) : null,
    ...(swing.super === true ? { super: true } : {}) }, serial);
}

/** V is still down on a charging swing (its clock holds at the crouch once it gets there). */
export function nativeCityPlayerSwingCharging(state: NativeCityPlayerSwingState): boolean {
  const charge = state.current?.charge;
  return charge !== null && charge !== undefined && !charge.released;
}

/**
 * How charged a swing is (0..1): V held from the crouch (`timeline.charge.holdAtMs`) to `charge.fullMs` from the press, linearly — a tap
 * (let go before the crouch) is 0. A swing that never charges: 0.
 */
export function nativeCityPlayerChargeLevel(swing: Pick<NativeCityPlayerSwing, "charge" | "timeline"> | null | undefined): number {
  const hold = swing?.timeline.charge?.holdAtMs, charge = swing?.charge, spec = NATIVE_CITY_COMBAT.player.actions.attack.charge;
  if (hold === undefined || !charge || !spec) return 0;
  return clamp01((charge.heldMs - hold) / Math.max(1, spec.fullMs - hold));
}

/**
 * What a charge level (0..1) multiplies a V's damage or poise drain by: 1 for a tap, `fullScale` at a full charge, along the square of the
 * level (game-animator 2026-10-18: a half charge must not be nearly as good as a full one).
 */
export function nativeCityPlayerChargeScale(level: number, fullScale: number): number {
  const l = clamp01(level);
  return 1 + (fullScale - 1) * l * l;
}

/** V let go: a charging swing's clock moves on to the kick. No-op otherwise. */
export function releaseNativeCityPlayerSwingCharge(state: NativeCityPlayerSwingState): NativeCityPlayerSwingState {
  const swing = state.current;
  if (!swing?.charge || swing.charge.released) return state;
  return swingState({ ...swing, charge: Object.freeze({ ...swing.charge, released: true }) }, state.serial);
}

/**
 * The running swing is no longer a string's ender for the cancel (`kuma.rhythm.launch`, 2026-10-18): its launch can be followed, so C cuts it
 * at its cancel point like a chain hit (the chase then closes in). Nothing else about it changes.
 */
export function releaseNativeCityPlayerSwingEnder(state: NativeCityPlayerSwingState): NativeCityPlayerSwingState {
  const swing = state.current;
  if (!swing || !swing.timeline.ender) return state;
  return swingState({ ...swing, timeline: Object.freeze({ ...swing.timeline, ender: false }) }, state.serial);
}

export function cancelNativeCityPlayerSwing(state: NativeCityPlayerSwingState): NativeCityPlayerSwingState {
  return state.current ? swingState(null, state.serial) : state;
}

/**
 * Contacts after `localIndex` that a step passed but did not judge (a landed contact ends the frame's contacts) fire again on the next
 * steps: `hitsFired` steps back to just after it (2026-10-12 review: a long frame over two contacts dropped the second).
 */
export function deferNativeCityPlayerSwingContacts(state: NativeCityPlayerSwingState, localIndex: number): NativeCityPlayerSwingState {
  const swing = state.current;
  if (!swing || swing.hitsFired <= localIndex + 1) return state;
  return swingState({ ...swing, hitsFired: localIndex + 1 }, state.serial);
}

/** The contact `localIndex` of this swing landed on a body (blocked by a guard counts): its cancel comes at `afterHitMs`. */
export function markNativeCityPlayerSwingLanded(state: NativeCityPlayerSwingState, localIndex: number): NativeCityPlayerSwingState {
  const swing = state.current;
  if (!swing || !(localIndex >= 0 && localIndex < swing.landed.length)) return state;
  const landed = swing.landed.slice();
  landed[localIndex] = true;
  return swingState({ ...swing, landed: Object.freeze(landed) }, state.serial);
}


export function nativeCityPlayerSwingCancelAtMs(state: NativeCityPlayerSwingState, by: NativeCityCancelBy): number | null {
  const swing = state.current;
  if (!swing) return null;
  // An air move (`jump.air`): in the air only the next air move cuts it (after its contact landed); anything else waits for the landing.
  const air = swing.timeline.jump?.air;
  if (air) {
    const last = swing.timeline.hitsMs.length - 1, contact = swing.timeline.hitsMs[last];
    const landed = last >= 0 && swing.hitsFired > last && swing.landed[last] === true && contact !== undefined;
    if (by === "air" && landed && !swing.timeline.ender) return contact + nativeCityPlayerCancelTuning(swing.kind).afterHitMs;
    return air.landMs;
  }
  if (by === "defense") return 0;
  // A charge not yet let go gives way at once to a dodge, a guard or a backstep (never to another swing — a walk is refused by the frame).
  if (swing.charge && !swing.charge.released) return by === "swing" ? null : 0;
  const last = swing.timeline.hitsMs.length - 1;
  if (last < 0 || swing.hitsFired <= last) return null;
  if ((by === "swing" || by === "air") && swing.timeline.ender) return null;
  const spec = nativeCityPlayerCancelTuning(swing.kind);
  return swing.timeline.hitsMs[last]! + (swing.landed[last] ? spec.afterHitMs : spec.afterWhiffMs);
}

/**
 * Fight ms the swing ends: its clip's length — or, when its last contact WHIFFED, not before that contact + `cancel.afterWhiffMs` (the
 * last drawn step holds): a whiff commits him as long as the rules say, even past a short clip (the sliding tackle's 559 ms against 260 +
 * 600 — 2026-10-12 review: its whiff released sooner than its hit).
 */
export function nativeCityPlayerSwingEndMs(swing: Pick<NativeCityPlayerSwing, "kind" | "timeline" | "hitsFired" | "landed">): number {
  const { timeline } = swing, last = timeline.hitsMs.length - 1;
  if (last < 0 || swing.hitsFired <= last || swing.landed[last]) return timeline.totalMs;
  return Math.max(timeline.totalMs, timeline.hitsMs[last]! + nativeCityPlayerCancelTuning(swing.kind).afterWhiffMs);
}

/** The swing may be cut by `by` now. */
export function nativeCityPlayerSwingCancellable(state: NativeCityPlayerSwingState, by: NativeCityCancelBy): boolean {
  const at = nativeCityPlayerSwingCancelAtMs(state, by);
  return at !== null && state.current !== null && state.current.elapsedMs >= at - 1e-9;
}

/**
 * 역경직: 맞힌 접촉의 순간(`ms`)으로 시계를 되돌린다. 뒤따르는 히트스톱(`freezeMs`) 동안 그 칸(주먹이 몸에 닿은 칸)을 붙들고, 풀리면
 * 거기서 팔로스루로 이어진다 — 멈춤 동안 주먹이 몸을 뚫고 지나가지 않는다.
 */
export function holdNativeCityPlayerSwing(state: NativeCityPlayerSwingState, ms: number, freezeMs = 0): NativeCityPlayerSwingState {
  const swing = state.current;
  if (!swing || !Number.isFinite(ms)) return state;
  const elapsedMs = Math.min(swing.elapsedMs, Math.max(0, ms));
  // The freeze already held the contact frame on screen: once it lets go, that frame stays only what is left of its drawn
  // hold (at least `contactHoldMinMs`) and the rest goes to the follow-through. Display only — the swing's clock is untouched.
  const index = swing.timeline.hitsMs.indexOf(ms);
  const hold = index >= 0 ? swing.timeline.contactHoldsMs[index] ?? 0 : 0;
  const min = NATIVE_CITY_COMBAT.feel.hitLag.contactHoldMinMs;
  // A multi-contact string must not display its next contact before that contact is judged.
  const skip = swing.timeline.preserveContactHold || swing.timeline.hitsMs.length > 1 ? 0
    : Math.max(0, Math.min(Math.max(0, freezeMs), hold - min));
  return swingState({ ...swing, elapsedMs, displaySkipMs: swing.displaySkipMs + skip },
    state.serial);
}

/**
 * 시작부터 `elapsedMs` 까지 내디딘 평면 거리. `firstHit`: 이 휘두름 첫 접촉의 표 번호(연타 토막). `leadMs`: 내딛기 시작이 접촉보다
 * 앞서는 시간(휘두름 시작 안으로 줄인다). `curve`: 표현 쪽 이징(`easeOutCubic`).
 */
export function nativeCityPlayerLungeUnits(kind: NativeCityPlayerActionKind, hitsMs: readonly number[], elapsedMs: number, stepUnits: number,
  firstHit: number, leadMs: number, curve: NativeCityLungeCurve, contacts?: readonly NativeCitySwingContact[], chainSegment?: number): number {
  const spec = nativeCityPlayerContactTuning(kind, hitsMs.length, chainSegment);
  // `lungeEase: "out"` (the sliding tackle): full speed off the release, slowing into the contact — still moving at it
  // (`lungeEndSpeedShare` of the average speed).
  const action = NATIVE_CITY_COMBAT.player.actions[kind], easeOut = action.lungeEase === "out";
  const endShare = Math.max(0, Math.min(1, action.lungeEndSpeedShare ?? 0));
  let units = 0;
  hitsMs.forEach((hitMs, index) => {
    const lead = Math.max(1, Math.min(leadMs, hitMs));
    const slot = chainSegment !== undefined && hitsMs.length > 1 ? index : firstHit + index;
    const strides = spec.lungeStrides[slot] ?? spec.lungeStrides.at(-1) ?? 0;
    const contact = contacts?.[index];
    // Planted anticipation, then accelerating weight transfer; art, movement and the hit judge use this same clock.
    const progress = contact ? clamp01((elapsedMs - contact.releaseMs) / Math.max(1, hitMs - contact.releaseMs))
      : clamp01((elapsedMs - (hitMs - lead)) / lead);
    const shaped = easeOut ? endShare * progress + (1 - endShare) * (1 - (1 - progress) * (1 - progress)) : progress * progress;
    units += strides * stepUnits * (contact ? shaped : curve(progress));
  });
  // The skid past the last contact (`skidStrides` over `skidMs`, eased out).
  const lastHit = hitsMs.at(-1), skid = action.skidStrides ?? 0, skidMs = action.skidMs ?? 0;
  if (lastHit !== undefined && skid > 0 && skidMs > 0 && elapsedMs > lastHit) {
    const u = clamp01((elapsedMs - lastHit) / skidMs);
    units += skid * stepUnits * (1 - (1 - u) * (1 - u));
  }
  return units;
}

/**
 * The jump's height (body heights, ≥ 0) `elapsedMs` into the swing, on top of the drawn cells' own height — a variable-gravity arc
 * (2026-10-11, user: "체공시간이 느껴지는 포물선, 등속이라 어색"): 0 before the takeoff; rising `riseMs` under strong gravity (fast off the
 * ground, slowing to 0 at `apexBodies`); floating `hangMs` under low gravity (sinking only `apexDip` of the apex — the hang is felt, never a
 * flat hold); then falling the rest under a stronger gravity, still accelerating at the contact; 0 from the contact on (feet on the ground).
 * Height and speed are continuous at every seam.
 */
export function nativeCityPlayerJumpLift(jump: NativeCityPlayerJump | undefined, elapsedMs: number,
  t: NativeCityPlayerJumpTuning | undefined = NATIVE_CITY_COMBAT.player.actions.attack.jump): number {
  if (jump?.air) return nativeCityPlayerAirLift(jump, elapsedMs);
  if (!jump || !t || !Number.isFinite(elapsedMs)) return 0;
  const air = jump.contactMs - jump.takeoffMs, ms = elapsedMs - jump.takeoffMs;
  if (!(air > 0) || ms <= 0 || ms >= air) return 0;
  const rise = Math.min(t.riseMs, air), hang = Math.min(t.hangMs, air - rise), fall = air - rise - hang, h = t.apexBodies;
  if (ms < rise) { const u = ms / Math.max(1e-6, rise); return h * (1 - (1 - u) * (1 - u)); }
  const dip = h * Math.max(0, Math.min(0.5, t.apexDip ?? 0));
  if (ms < rise + hang || !(fall > 0)) { const s = hang > 0 ? (ms - rise) / hang : 1; return h - dip * s * s; }
  // The fall: from the end of the float (height y0, already sinking at v0) to the ground at the contact under constant gravity g.
  const y0 = h - dip, v0 = hang > 0 ? 2 * dip / hang : 0, g = Math.max(0, 2 * (y0 - v0 * fall) / (fall * fall));
  const f = ms - rise - hang;
  return Math.max(0, y0 - v0 * f - 0.5 * g * f * f);
}

/**
 * An air move's height (body heights) `elapsedMs` into it (`jump.air`): `fromBodies` until the takeoff, rising and slowing (ease-out) to the
 * apex, then a gravity fall (accelerating, ½gt² — the arc's `landMs` was solved from it) to the ground at `landMs`; 0 after.
 */
export function nativeCityPlayerAirLift(jump: NativeCityPlayerJump, elapsedMs: number): number {
  const air = jump.air;
  if (!air || !Number.isFinite(elapsedMs) || elapsedMs >= air.landMs) return 0;
  if (elapsedMs <= jump.takeoffMs) return air.fromBodies;
  if (elapsedMs < air.apexMs) {
    const u = (elapsedMs - jump.takeoffMs) / Math.max(1e-6, air.apexMs - jump.takeoffMs);
    return air.fromBodies + (air.apexBodies - air.fromBodies) * (1 - (1 - u) * (1 - u));
  }
  const v = (elapsedMs - air.apexMs) / Math.max(1e-6, air.landMs - air.apexMs);
  return Math.max(0, air.apexBodies * (1 - v * v));
}


export function nativeCityPlayerSwingAirLift(state: NativeCityPlayerSwingState): number {
  const swing = state.current, jump = swing?.timeline.jump;
  return swing && jump?.air ? nativeCityPlayerAirLift(jump, swing.elapsedMs) : 0;
}

/**
 * An air move's beats (`player.air`, 2026-10-21) from the drawn swing it is thrown as (`base`: its own air clip, else the C chain's
 * `c.segment` / V / the jab): its one contact retimed to `move.contactMs` (the drawn steps before it squeezed or stretched, the rest
 * shifted), no charge, its contact's motion (the air C rising into him, the spike and the stomp down), and the arc — the air C's feet at
 * `contactBodies` at the contact, still rising `hangMs`, then the fall; the spike and the stomp a small rise over `fromBodies` to their
 * top, then the dive (`diveScale` × the fall). The swing lasts to the landing.
 */
export function nativeCityPlayerAirTimeline(base: NativeCityPlayerSwingTimeline, move: NativeCityPlayerAirMove,
  arc: { readonly fromBodies: number; readonly contactBodies: number; readonly travelUnits: number },
  t: NativeCityPlayerAirTuning): NativeCityPlayerSwingTimeline {
  const spec = t[move], contact = Math.max(1, spec.contactMs), drawn = base.hitsMs[0] ?? contact;
  // Fight → clip knots: before the drawn contact scaled to the new contact, after it shifted by the same amount.
  const k = contact / Math.max(1e-6, drawn);
  let fight = base.warp.fight.map(ms => ms <= drawn ? ms * k : ms + contact - drawn), art = base.warp.art;
  const g = Math.max(1e-6, t.gravityBodiesPerSec2) / 1e6;
  let takeoffMs: number, apexMs: number, apex: number, fall: number;
  if (move === "c") {
    takeoffMs = Math.min(t.c.takeoffMs, contact - 1);
    apexMs = contact + Math.max(0, t.c.hangMs);
    // The ease-out rise reaches 1 − (1 − u)² of its height at the contact: the apex that puts his feet at `contactBodies` then.
    const u = (contact - takeoffMs) / Math.max(1e-6, apexMs - takeoffMs), reached = 1 - (1 - u) * (1 - u);
    apex = Math.max(arc.contactBodies, arc.contactBodies / Math.max(1e-6, reached));
    fall = Math.sqrt(2 * apex / g);
  } else {
    const dv = t[move];
    takeoffMs = 0;
    apexMs = Math.min(dv.apexMs, contact - 1);
    // The dive from the apex reaches `contactBodies` at the contact: apex − ½·g·(contact − apex)². Rise at least `riseBodies`, at most
    // `maxRiseBodies`, over where he started.
    const dive = g * Math.max(0.1, dv.diveScale), from = Math.max(0, arc.fromBodies), d = contact - apexMs;
    apex = Math.min(from + Math.max(0, dv.maxRiseBodies), Math.max(from + Math.max(0, dv.riseBodies), arc.contactBodies + 0.5 * dive * d * d));
    fall = Math.sqrt(2 * apex / dive);
    // The dive must still be in the air at the contact.
    fall = Math.max(fall, contact - apexMs + 1);
  }
  const landMs = apexMs + fall;
  // A drawn landing (`landArtMs`): the cells from the contact to it stretched over the flight down, the landing crouch from the touchdown
  // for `landHoldMs` (2026-10-21 game-animator: the air cell snapped to the stance on the landing).
  const contactArt = warpAt(base.warp.fight, base.warp.art, drawn), artEnd = base.warp.art.at(-1) ?? 0;
  const landHold = Math.max(0, t.landHoldMs), drawnLand = base.landArtMs;
  const landed = drawnLand !== undefined && drawnLand > contactArt + 1e-6 && drawnLand < artEnd && landMs > contact;
  if (landed) {
    const before = base.warp.fight.flatMap((ms, i) => ms < drawn - 1e-9 ? [i] : []);
    art = [...before.map(i => base.warp.art[i]!), contactArt, drawnLand, artEnd];
    fight = [...before.map(i => base.warp.fight[i]! * k), contact, landMs, landMs + landHold];
  }
  const contactHold = base.contactHoldsMs[0];
  // The air C rises into him; the spike and the stomp come down on him.
  const contacts: readonly NativeCitySwingContact[] = [{ motion: move === "c" ? "rising" : "downward", releaseMs: Math.max(0, contact - 60) }];
  return Object.freeze({ totalMs: landed ? landMs + landHold : Math.max(landMs, base.totalMs + contact - drawn), hitsMs: [contact], art: base.art,
    ...(base.preserveContactHold ? { preserveContactHold: true } : {}),
    contactHoldsMs: contactHold === undefined ? [] : [contactHold], firstHit: base.firstHit,
    ...(base.chainSegment !== undefined ? { chainSegment: base.chainSegment } : {}), ...(base.clip ? { clip: base.clip } : {}),
    ender: move !== "c", warp: { art, fight },
    ...(base.reachExtraStrides?.[0] !== undefined ? { reachExtraStrides: [base.reachExtraStrides[0]] } : {}),
    contacts,
    jump: { takeoffMs, contactMs: contact, air: { move, fromBodies: Math.max(0, arc.fromBodies), apexBodies: apex, apexMs, landMs,
      travelUnits: Math.max(0, arc.travelUnits) } } });
}

/** Piecewise-linear `to` at `x` over the knots `from` (clamped to the ends): a swing warp read either way. */
function warpAt(from: readonly number[], to: readonly number[], x: number): number {
  if (from.length === 0) return 0;
  if (x <= from[0]!) return to[0]!;
  for (let i = 1; i < from.length; i++) {
    if (x <= from[i]!) {
      const span = from[i]! - from[i - 1]!;
      return span > 1e-9 ? to[i - 1]! + (to[i]! - to[i - 1]!) * (x - from[i - 1]!) / span : to[i]!;
    }
  }
  return to.at(-1)!;
}

/** The jump's forward travel (plan units) from the start to `elapsedMs`: `travelStrides` at an even pace from the takeoff to the contact. */
export function nativeCityPlayerJumpTravelUnits(jump: NativeCityPlayerJump, elapsedMs: number, stepUnits: number,
  t: NativeCityPlayerJumpTuning | undefined = NATIVE_CITY_COMBAT.player.actions.attack.jump): number {
  // An air move travels its own length (`air.travelUnits`) at an even pace to the contact.
  if (jump.air) return jump.air.travelUnits * clamp01((elapsedMs - jump.takeoffMs) / Math.max(1e-6, jump.contactMs - jump.takeoffMs));
  if (!t) return 0;
  const air = Math.max(1e-6, jump.contactMs - jump.takeoffMs), x = clamp01((elapsedMs - jump.takeoffMs) / air);
  // Fast off the ground, slowest around the apex, fast into the slam (speed 1 + k·cos 2πx around the average; ends exactly at 1).
  const k = Math.max(0, Math.min(0.9, t.travelEase ?? 0));
  return t.travelStrides * stepUnits * (x + k * Math.sin(2 * Math.PI * x) / (2 * Math.PI));
}

/** `dtMs` (fight ms) of the swing: the contacts it passes (each once), this frame's step-in, and whether it ended. */
export function stepNativeCityPlayerSwing(state: NativeCityPlayerSwingState, dtMs: number, lungeCurve: NativeCityLungeCurve): NativeCityPlayerSwingStep {
  const swing = state.current;
  if (!swing) return { state, contacts: [], lungeUnits: 0, finished: false };
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  const before = swing.elapsedMs;
  const { timeline, kind } = swing, spec = NATIVE_CITY_COMBAT.player.actions[kind];
  // The charge (`timeline.charge`): while V is down the clock stops at the crouch and the held time grows; past `maxHoldMs` it lets go itself.
  let charge = swing.charge, after = before + dt;
  if (charge && !charge.released && timeline.charge) {
    const heldMs = charge.heldMs + dt, max = spec.charge?.maxHoldMs ?? Number.POSITIVE_INFINITY;
    charge = Object.freeze({ heldMs: Math.min(heldMs, max), released: heldMs >= max });
    if (!charge.released) after = Math.min(after, Math.max(before, timeline.charge.holdAtMs));
  }
  const level = charge ? nativeCityPlayerChargeLevel({ charge, timeline }) : null;
  const scale = level === null ? 1 : nativeCityPlayerChargeScale(level, spec.charge?.full.damageScale ?? 1);
  const contactSpec = nativeCityPlayerContactTuning(kind, timeline.hitsMs.length, timeline.chainSegment);
  // An air move scores its own contact (`player.air.<move>`), not the ground chain's tables.
  const airMove = timeline.jump?.air?.move, airSpec = airMove ? NATIVE_CITY_COMBAT.player.air?.[airMove] : undefined;
  const contacts: NativeCityPlayerContact[] = [];
  let hitsFired = swing.hitsFired;
  while (hitsFired < timeline.hitsMs.length && after >= timeline.hitsMs[hitsFired]!) {
    const localIndex = hitsFired++, hitIndex = timeline.firstHit + localIndex;
    const slot = timeline.chainSegment !== undefined && timeline.hitsMs.length > 1 ? localIndex : hitIndex;
    contacts.push({ hitIndex, localIndex, damage: (airSpec?.damage ?? contactSpec.damage[slot] ?? contactSpec.damage.at(-1) ?? 0) * scale
      * (swing.super ? NATIVE_CITY_COMBAT.super.damageScale : 1),
      tier: airSpec?.tier ?? contactSpec.tiers[slot] ?? contactSpec.tiers.at(-1) ?? "light",
      ...(level === null ? {} : { charge: level }), ...(swing.super ? { super: true } : {}) });
  }
  const lead = spec.lungeLeadMs / Math.max(1e-6, kind === "combo" ? NATIVE_CITY_COMBAT.tempo.player.chainRate : NATIVE_CITY_COMBAT.tempo.player.heavyRate);
  // A jump flies its own even travel from the takeoff to the contact instead of the step-in. The travel is what the curve reaches beyond
  // what was already given (`lungedUnits`): a hit-lag hold rewinds the clock, never the body.
  const jump = timeline.jump;
  const reached = jump ? nativeCityPlayerJumpTravelUnits(jump, after, swing.stepUnits)
    : nativeCityPlayerLungeUnits(kind, timeline.hitsMs, after, swing.stepUnits, timeline.firstHit, lead, lungeCurve, timeline.contacts, timeline.chainSegment);
  const lungeUnits = Math.max(0, reached - swing.lungedUnits), lungedUnits = Math.max(swing.lungedUnits, reached);
  const finished = after >= nativeCityPlayerSwingEndMs({ ...swing, hitsFired });
  const next = finished ? swingState(null, state.serial) : swingState({ ...swing, elapsedMs: after, hitsFired, lungedUnits, charge }, state.serial);
  return { state: next, contacts, lungeUnits, finished };
}
