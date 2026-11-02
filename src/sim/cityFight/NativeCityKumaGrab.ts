import { knockbackStopMs } from "../KnockbackCurve";
import { nativeCityKnockbackCurve } from "./NativeCityMelee";
import { NATIVE_CITY_KUMA_MOVES, type KumaCombatTiming, type KumaTuning } from "./NativeCityKumaCombatState";

/**
 * KUMA형 파이터의 붉은 잡기(출입 금지 잡기, 2026-10-14 — docs/Plan/2026-10-14-kuma-triangle-grab): 박자는 `native-city-kuma-moves.json` ballGrab 의
 * 칸 목록(예비 → 잡음 → 조이기 두 번 → 들기 → 던지기 / 헛잡기 휘청)에서, 규칙 수치는 `native-city-combat.json` kuma.grab·kuma.strikes.grab 에서
 * 읽는다. 원화가 아직 없어도 규칙은 이 박자로 돈다(뷰가 대역 칸을 세운다).
 */

/** One drawn step of a move (`[cell, ms, shake?, 'hit'?]`). */
type KumaGrabStep = readonly [string, number, (readonly number[] | null)?, string?];

/** The grab's beats (fight ms): the catch from the swing's start, the rest from the catch. */
export interface KumaGrabBeats {
  /** The catch — his one contact — from the swing's start (the end of the windup steps). */
  readonly catchMs: number;
  /** The squeezes (small damage ticks), from the catch. */
  readonly squeezeMs: readonly number[];
  /** The lift starts, from the catch. */
  readonly liftMs: number;

  readonly throwMs: number;
  /** The caught branch's whole length, from the catch. */
  readonly holdMs: number;
  /** The whiff's open stumble (the counter window), from the catch. */
  readonly whiffMs: number;
}

const stepsOf = (value: unknown): readonly KumaGrabStep[] => (Array.isArray(value) ? value : []) as readonly KumaGrabStep[];
const sumMs = (steps: readonly KumaGrabStep[]): number => steps.reduce((sum, step) => sum + Math.max(0, step[1]), 0);

const beatsByMove = new Map<string, KumaGrabBeats>();


export function kumaGrabBeats(name: string = "ballGrab"): KumaGrabBeats {
  const known = beatsByMove.get(name);
  if (known) return known;
  const move = (NATIVE_CITY_KUMA_MOVES as unknown as Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>)[name];
  if (!move || !Array.isArray(move.caughtSteps)) throw new Error(`no grab move ${name} in native-city-kuma-moves.json`);
  const caught = stepsOf(move.caughtSteps), hits: number[] = [];
  let at = 0, liftMs: number | null = null;
  for (const [cell, ms, , mark] of caught) {
    if (mark === "hit") hits.push(at);
    if (liftMs === null && (cell === "gr-lift" || mark === "lift")) liftMs = at;
    at += Math.max(0, ms);
  }
  const throwMs = hits.at(-1) ?? at;
  const beats: KumaGrabBeats = Object.freeze({ catchMs: sumMs(stepsOf(move.steps)), squeezeMs: Object.freeze(hits.slice(0, -1)), liftMs: liftMs ?? throwMs,
    throwMs, holdMs: Math.max(at, throwMs), whiffMs: sumMs(stepsOf(move.whiffSteps)) });
  beatsByMove.set(name, beats);
  return beats;
}

/**
 * The grab's fight timing where it is drawn (the art bridge asks only there): one contact, the catch; the swing lasts to the end of the
 * whiff's stumble (a catch runs on to `grab.holdMs` instead); its reach and start (`strikes.grab`, `grab.startStrides`)
 * ride as a drawn move's. The windup is never sped up (`attack.windupRates`): its long red hold is the read.
 */
export function kumaGrabTiming(t: KumaTuning): KumaCombatTiming {
  const grab = kumaGrabBeats(t.grab.move);
  return { totalMs: grab.catchMs + grab.whiffMs, hitsMs: [grab.catchMs], grab,
    move: { name: "ballGrab", reachExtraStrides: [t.reachExtraStrides?.grab ?? t.strikes.grab.reachExtraStrides],
      radial: [false], startStrides: t.grab.startStrides } };
}

/** How long the throw flies (fight ms): its `throwStrides` on the launch curve until it stops (the landing). */
export function kumaGrabThrowFlightMs(t: KumaTuning): number {
  return knockbackStopMs(Math.max(0, t.grab.throwStrides), nativeCityKnockbackCurve(1, true));
}
