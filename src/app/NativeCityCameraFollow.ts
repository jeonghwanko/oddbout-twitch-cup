import type { CityPoint } from '../world/NativeCityDefinition';

/**
 * The village camera's follow (2026-10-17, user: a camera walk like an AAA game — smooth follow, a dead zone, a look-ahead; firm in a
 * fight). Every number it uses lives here; `NativeCityOrbit.track` runs it once a frame. Screen values are fractions of the orbit
 * view, so they hold at any zoom.
 *
 * - Smooth follow: a critically damped spring (`smoothDamp`) moves the camera — never 1:1 with the feet, so starts and stops ease.
 * - Dead zone: while he stays this close to the aim the camera does not move (a talk-spot shuffle, a turn on the spot).
 * - Look-ahead: the aim leads the walk by his screen velocity × `leadSec`, eased in and out (`leadSmoothSec`). At 16° a front/back
 *   walk crosses the screen at about 28% of the side pace, so the depth seconds are longer. Walking up the screen leads little —
 *   the 0.78 anchor already shows the street ahead of him — and walking toward the camera leads most (it leaves least room below).
 * - Bounds: how far off the anchor he may ever sit, whatever the spring is doing.
 * `firm` is a fight's or a camera shot's follow: no dead zone, no look-ahead, a spring that only takes the edge off.
 */
export interface NativeCityCameraFollowTuning {
  /** SmoothDamp's smooth time (s): about the time the camera takes to catch up. */
  readonly smoothSec: number;
  /** Half the dead zone around the aim, [x, y] screen fractions. */
  readonly deadZone: readonly [number, number];
  /** Look-ahead seconds of his screen velocity, [x, y]. */
  readonly leadSec: readonly [number, number];
  /** The look-ahead's ease (s) as it grows, and as it lets go after a stop (slower: the drift back to him is gentle). */
  readonly leadSmoothSec: number;
  readonly leadReleaseSec: number;
  /** The look-ahead's reach (screen fractions): sideways, up the screen (walking away), down it (walking toward the camera). */
  readonly lead: { readonly side: number; readonly up: number; readonly down: number };
}

export const NATIVE_CITY_CAMERA_FOLLOW = Object.freeze({
  travel: Object.freeze({ smoothSec: 0.3, deadZone: Object.freeze([0.02, 0.025] as const), leadSec: Object.freeze([0.9, 2] as const),
    leadSmoothSec: 0.6, leadReleaseSec: 0.7, lead: Object.freeze({ side: 0.12, up: 0.03, down: 0.12 }) }) satisfies NativeCityCameraFollowTuning,
  firm: Object.freeze({ smoothSec: 0.07, deadZone: Object.freeze([0, 0] as const), leadSec: Object.freeze([0, 0] as const),
    leadSmoothSec: 0.15, leadReleaseSec: 0.15, lead: Object.freeze({ side: 0, up: 0, down: 0 }) }) satisfies NativeCityCameraFollowTuning,
  /** Screen fractions he may sit off the anchor ([0.55, 0.78]): x 0.35–0.75, y 0.55–0.84. Every profile. */
  bounds: Object.freeze({ left: 0.2, right: 0.2, up: 0.23, down: 0.06 }),
  /** A jump farther than this (plan units, about 0.7 s of walking) is a cut: the camera lands on him. */
  teleportUnits: 6,
  /** The frame time cap (ms), as the orbit's own clock. */
  maxDtMs: 50,
  /**
   * Framing changes that used to land in one frame now ease (SmoothDamp smooth time, s — a step settles in about 2.4× it); reduced
   * motion cuts them. `zoomSec` is a zoom step (+/−, the wheel, 0): an answer to the player's key, so the quickest (≈0.3 s), eased in
   * log zoom so in and out feel alike. `dialogueSec` lifts the frame clear of the dialogue box and `conversationSec` frames a free
   * conversation's two speakers (≈0.35 s, the push-in a talk opens with). `shotSec` blends a scene's framing in and out — Otto's porter
   * tableau and a discovery's push-in (≈0.85 s; 2026-10-18 these were a 900 ms linear ramp and a 350 ms exponential in their own
   * controllers, on their own clocks — now they name a goal and the director eases it on its frame clock).
   */
  transitions: Object.freeze({ zoomSec: 0.12, dialogueSec: 0.15, conversationSec: 0.15, shotSec: 0.36 }),
  /**
   * A run widens the view a little (`zoomOut` of the zoom), so the speed is felt: in over `zoomSec` as he breaks into a run, back
   * over the slower `settleSec` after it (SmoothDamp times, s). A walk's own travel only — never in a fight or a shot, never under
   * reduced motion.
   */
  run: Object.freeze({ zoomOut: 0.06, zoomSec: 0.3, settleSec: 0.4 }),
  /**
   * A camera turn his walk cancels (Q/R, a shot's turn — not a clear-view or landmark turn, which keep going) coasts to a stop over
   * this long from its speed then, slowing to nothing (it travels a third of speed × time), instead of freezing mid-swing.
   */
  turnCoastMs: 280,
});

export type NativeCityCameraFollowProfile = 'travel' | 'firm';

export interface NativeCityCameraFollowState {
  /** His screen offset from the anchor (orbit px at zoom 1); this frame's walk is already in it. */
  readonly lag: CityPoint;
  readonly velocity: CityPoint;
  /** The aim's eased lead ahead of him (orbit px at zoom 1). */
  readonly lead: CityPoint;
  readonly leadVelocity: CityPoint;
}
export const NATIVE_CITY_CAMERA_AT_REST: NativeCityCameraFollowState = Object.freeze({
  lag: [0, 0] as CityPoint, velocity: [0, 0] as CityPoint, lead: [0, 0] as CityPoint, leadVelocity: [0, 0] as CityPoint });

/**
 * Unity's SmoothDamp (Game Programming Gems 4, 1.10): critically damped, the same path at any frame rate. `stopAtGoal` never carries
 * it past the goal (Unity's guard); without it a velocity glides out (the follow's goal moves with it, so a stop at the dead zone's
 * edge would be a dead stop). Returns the new value and velocity.
 */
export function smoothDamp(current: number, goal: number, velocity: number, smoothSec: number, dtSec: number,
  stopAtGoal = true): [number, number] {
  if (!(dtSec > 0)) return [current, velocity];
  if (!(smoothSec > 0)) return [goal, 0];
  const omega = 2 / smoothSec, x = omega * dtSec, decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - goal, temp = (velocity + omega * change) * dtSec;
  let value = goal + (change + temp) * decay, next = (velocity - omega * temp) * decay;
  if (stopAtGoal && change !== 0 && goal - current > 0 === value > goal) { value = goal; next = 0; }
  return [value, next];
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * One frame of the follow. `moved` is his screen move this frame (orbit px at zoom 1) — it sets the look-ahead; `view` is the orbit
 * view size and zoom. The camera corrects only what lies outside the dead zone round the aim (he sits at −lead from the anchor).
 */
export function stepNativeCityCameraFollow(state: NativeCityCameraFollowState, moved: CityPoint, dtMs: number,
  view: { readonly width: number; readonly height: number; readonly zoom: number }, profile: NativeCityCameraFollowProfile,
  reducedMotion = false): NativeCityCameraFollowState {
  const style = NATIVE_CITY_CAMERA_FOLLOW, tuning: NativeCityCameraFollowTuning = style[profile];
  const dt = Math.min(style.maxDtMs, Math.max(0, dtMs)) / 1000;
  const px = (fraction: number, axis: 0 | 1) => fraction * (axis === 0 ? view.width : view.height) / view.zoom;
  const bound = (value: number, axis: 0 | 1) => axis === 0 ? clamp(value, -px(style.bounds.left, 0), px(style.bounds.right, 0))
    : clamp(value, -px(style.bounds.up, 1), px(style.bounds.down, 1));
  if (dt === 0) return { ...state, lag: [bound(state.lag[0], 0), bound(state.lag[1], 1)] };
  // Under reduced motion the camera never runs ahead of him (it still eases and rests in its dead zone).
  const goal: CityPoint = reducedMotion ? [0, 0] : [
    clamp(moved[0] / dt * tuning.leadSec[0], -px(tuning.lead.side, 0), px(tuning.lead.side, 0)),
    clamp(moved[1] / dt * tuning.leadSec[1], -px(tuning.lead.up, 1), px(tuning.lead.down, 1))];
  const lead: [number, number] = [0, 0], leadVelocity: [number, number] = [0, 0];
  const lag: [number, number] = [0, 0], velocity: [number, number] = [0, 0];
  for (const axis of [0, 1] as const) {
    const dead = px(tuning.deadZone[axis], axis), shrinking = Math.abs(goal[axis]) < Math.abs(state.lead[axis]);
    [lead[axis], leadVelocity[axis]] = smoothDamp(state.lead[axis], goal[axis], state.leadVelocity[axis],
      shrinking ? tuning.leadReleaseSec : tuning.leadSmoothSec, dt);
    // A look-ahead letting go (a stop, a turn) never pushes the camera on ahead of where it already looks: it lets go from there,
    // so a stop is the camera easing to a halt and then drifting back to him, not a lurch forward first.
    if (shrinking) {
      const reach = lead[axis] > 0 ? Math.max(goal[axis], Math.min(lead[axis], dead - state.lag[axis]))
        : Math.min(goal[axis], Math.max(lead[axis], -dead - state.lag[axis]));
      if (reach !== lead[axis]) { lead[axis] = reach; leadVelocity[axis] = 0; }
    }
    const error = state.lag[axis] + lead[axis];
    const excess = Math.sign(error) * Math.max(0, Math.abs(error) - dead);
    [lag[axis], velocity[axis]] = smoothDamp(state.lag[axis], state.lag[axis] - excess, state.velocity[axis], tuning.smoothSec, dt,
      false);
    const held = bound(lag[axis], axis);
    if (held !== lag[axis]) { lag[axis] = held; velocity[axis] = 0; }
  }
  return { lag, velocity, lead, leadVelocity };
}

/**
 * One framing value eased toward its goal (`transitions`): a framing's offset from the follow's frame — a lift, a shift, a log
 * zoom. Its goal is 0 while the framing is off, so it eases back out the same way. Reduced motion cuts to the goal.
 */
export class NativeCityCameraEase {
  private velocity = 0;
  constructor(private readonly smoothSec: number, public value = 0) {}
  /** `smoothSec`: this step's own time (an ease quicker one way than the other). */
  step(goal: number, dtMs: number, reducedMotion = false, smoothSec = this.smoothSec): number {
    if (reducedMotion || !Number.isFinite(goal)) return this.snap(Number.isFinite(goal) ? goal : 0);
    [this.value, this.velocity] = smoothDamp(this.value, goal, this.velocity,
      smoothSec, Math.min(NATIVE_CITY_CAMERA_FOLLOW.maxDtMs, Math.max(0, dtMs)) / 1000);
    // A critically damped ease only nears its goal: land on it once the rest is invisible (a thousandth of a pixel or of log zoom).
    if (Math.abs(this.value - goal) < 1e-3 && Math.abs(this.velocity) < 1e-2) return this.snap(goal);
    return this.value;
  }
  snap(value = 0): number { this.value = value; this.velocity = 0; return value; }
}

/** A free conversation's framing offsets — shift x, shift y (world px), log zoom — one ease each. */
export function nativeCityConversationEases(): [NativeCityCameraEase, NativeCityCameraEase, NativeCityCameraEase] {
  const smoothSec = NATIVE_CITY_CAMERA_FOLLOW.transitions.conversationSec;
  return [new NativeCityCameraEase(smoothSec), new NativeCityCameraEase(smoothSec), new NativeCityCameraEase(smoothSec)];
}
