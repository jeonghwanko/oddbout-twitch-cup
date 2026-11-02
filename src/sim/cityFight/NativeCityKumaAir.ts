import type { NativeCityKumaAirTuning } from "./NativeCityCombatTuning";



/** His body in the air (`KumaCombatState.air`). */
export interface KumaAir {
  /** His feet above the stage line (body heights, ≥ 0). */
  readonly heightBodies: number;
  /** Vertical speed (body heights per fight ms; up is +). */
  readonly vy: number;
  /** Air hits taken in this juggle (the launch and the spike not counted). */
  readonly hits: number;
  /** An air V drove him down: the ground bounces him once (`spike`). */
  readonly spiked: boolean;
  /** He bounced off the ground (after the spike): the next touch of it is the landing. */
  readonly bounced: boolean;
  /** Fight ms since the last thing that threw him (the launch, an air hit, the spike, the bounce): the view's pose clock. */
  readonly sinceMs: number;
}

/** The rise's gravity (body heights per fight ms²): what takes the launch to `liftBodies` in `riseMs`. */
export function kumaAirRiseGravity(t: NativeCityKumaAirTuning): number {
  const rise = Math.max(1, t.riseMs);
  return 2 * Math.max(0, t.liftBodies) / (rise * rise);
}

/** The fall's gravity: the rise's × `fallScale`. */
export function kumaAirFallGravity(t: NativeCityKumaAirTuning): number {
  return kumaAirRiseGravity(t) * Math.max(0.1, t.fallScale);
}

/** The speed that rises `bodies` more under the rise's gravity. */
function riseSpeed(bodies: number, t: NativeCityKumaAirTuning): number {
  return Math.sqrt(2 * kumaAirRiseGravity(t) * Math.max(0, bodies));
}

/** The launch (`kuma.rhythm.launch.air`): off the ground, up to `liftBodies`. */
export function kumaAirLaunch(t: NativeCityKumaAirTuning): KumaAir {
  return Object.freeze({ heightBodies: 0, vy: riseSpeed(t.liftBodies, t), hits: 0, spiked: false, bounced: false, sinceMs: 0 });
}


export function kumaAirJuggle(air: KumaAir, t: NativeCityKumaAirTuning, liftBodies?: number): KumaAir {
  if (air.bounced) return Object.freeze({ ...air, hits: air.hits + 1, sinceMs: 0 });
  const lift = liftBodies ?? t.hitLiftBodies[Math.min(air.hits, t.hitLiftBodies.length - 1)] ?? 0;
  return Object.freeze({ ...air, vy: Math.max(air.vy, riseSpeed(lift, t)), hits: air.hits + 1, sinceMs: 0 });
}


export function kumaAirSpike(air: KumaAir, t: NativeCityKumaAirTuning): KumaAir {
  return Object.freeze({ ...air, vy: -Math.max(0, t.spike.speedBodiesPerSec) / 1000, spiked: true, sinceMs: 0 });
}

/** The spiked body's bounce, up and down again (fight ms): the view flies the drawn fall's cells between its impact and its lying step over it. */
export function kumaAirBounceMs(t: NativeCityKumaAirTuning): number {
  const h = Math.max(0, t.spike.bounceBodies);
  return Math.sqrt(2 * h / Math.max(1e-12, kumaAirRiseGravity(t))) + Math.sqrt(2 * h / Math.max(1e-12, kumaAirFallGravity(t)));
}


export function kumaAirLow(air: KumaAir, t: NativeCityKumaAirTuning): boolean {
  return air.heightBodies <= t.groundReachBodies + 1e-9;
}

/** One stretch of a flight with no ground touch: height and speed after `ms` (exact under the rise / fall gravities). */
function fly(height: number, vy: number, ms: number, t: NativeCityKumaAirTuning): { readonly height: number; readonly vy: number } {
  const up = kumaAirRiseGravity(t), down = kumaAirFallGravity(t);
  let h = height, v = vy, left = Math.max(0, ms);
  if (v > 0 && left > 0) {
    const toApex = v / Math.max(1e-12, up);
    if (left <= toApex) return { height: h + v * left - 0.5 * up * left * left, vy: v - up * left };
    h += v * toApex - 0.5 * up * toApex * toApex; v = 0; left -= toApex;
  }
  return { height: h + v * left - 0.5 * down * left * left, vy: v - down * left };
}

/** Fight ms from (height, vy) until his feet meet the ground (Infinity if never — he cannot rise forever). */
function msToGround(height: number, vy: number, t: NativeCityKumaAirTuning): number {
  const up = kumaAirRiseGravity(t), down = kumaAirFallGravity(t);
  let h = Math.max(0, height), v = vy, ms = 0;
  if (v > 0) { const toApex = v / Math.max(1e-12, up); h += v * toApex - 0.5 * up * toApex * toApex; v = 0; ms = toApex; }
  // h + v·x − ½·down·x² = 0 with v ≤ 0.
  const a = 0.5 * down, b = -v, disc = b * b + 4 * a * h;
  return ms + (a > 1e-12 ? (-b + Math.sqrt(Math.max(0, disc))) / (2 * a) : (b > 1e-12 ? h / b : Number.POSITIVE_INFINITY));
}

/** His height `ms` fight ms from now if nothing hits him (0 once he would touch the ground — before a bounce). */
export function kumaAirHeightAfter(air: KumaAir, ms: number, t: NativeCityKumaAirTuning): number {
  if (ms >= msToGround(air.heightBodies, air.vy, t)) return 0;
  return Math.max(0, fly(air.heightBodies, air.vy, ms, t).height);
}

/**
 * `dtMs` of fight clock in the air: the flight; a spiked body that meets the ground bounces once (`bounced` this step); any other touch of
 * the ground is the landing (`air` null).
 */
export function stepKumaAir(air: KumaAir, dtMs: number, t: NativeCityKumaAirTuning)
  : { readonly air: KumaAir | null; readonly bounced: boolean } {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  if (dt <= 0) return { air, bounced: false };
  const touch = msToGround(air.heightBodies, air.vy, t);
  if (dt < touch) {
    const next = fly(air.heightBodies, air.vy, dt, t);
    return { air: Object.freeze({ ...air, heightBodies: Math.max(0, next.height), vy: next.vy, sinceMs: air.sinceMs + dt }), bounced: false };
  }
  if (!air.spiked || air.bounced) return { air: null, bounced: false };
  // The spiked body bounces once: up `bounceBodies` from the ground, the rest of the step in that flight.
  const left = dt - touch, v0 = riseSpeed(t.spike.bounceBodies, t);
  const next = fly(0, v0, left, t);
  return { air: Object.freeze({ ...air, heightBodies: Math.max(0, next.height), vy: next.vy, bounced: true, sinceMs: left }), bounced: true };
}
