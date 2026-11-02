import { t } from "../../../app/i18n";
import { clamp01 } from "../../../sim/geom";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningClip, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.resolve;

export const RESOLVE = Object.freeze({
  /** The shot's line: from his muzzle (`muzzleBodies` up his height, `reachBodies` ahead) to the struck body, `lineMs` long. */
  shot: { muzzleBodies: 0.62, reachBodies: 0.32, widthBodies: 0.035, lineMs: 220 },
  /** The aiming ring closing on the struck body: from `fromBodies` to `toBodies` of his height over `closeMs`, held to `holdMs`. */
  ring: { fromBodies: 0.75, toBodies: 0.22, closeMs: 160, holdMs: 260 },
  /** A "탕!": `size` view heights over the muzzle, stamped from `fromScale` over `stampMs`, held `holdMs`. */
  word: { size: 0.07, fromScale: 1.9, stampMs: 80, holdMs: 300 },
  holdMs: 800,
  /**
   * The passes, on the follow-up's fight clock (ms since the contact): out from `outFrom`, through the other at the first beat (`cross[0]`),
   * on `beyondBodies` past him, turned over `turnMs`, back through him at the second beat (`cross[1]`), home by `homeAt`, the held aim to
   * the launch beat. `snapMs` either side of a crossing he draws his point-blank shot cell; `extraShots` more shots on each run (share of it).
   */
  pass: { outFrom: 80, cross: [350, 630] as const, beyondBodies: 0.8, turnMs: 50, homeAt: 760, snapMs: 30, extraShots: [0.45] as const,
    extraMs: 40 },
  /** His cells for the passes (ms into his pack's clips — the runtime's sequence starts): the run's two, the shot, the plant; the aim, the fire. */
  cells: { run: [400, 480] as const, runStepMs: 60, struck: 560, plant: 700, aim: 400, fire: 520, fireHoldMs: 220 },
  /** The X the passes cut: each line `lengthBodies` of the struck's height through his chest at ±`tiltDeg`, `ms` long. */
  slash: { lengthBodies: 1.5, widthBodies: 0.05, tiltDeg: 22, ms: 560 },
});

const R = RESOLVE;

/** One shot at `ageMs` from `from` (his muzzle) to `at` (the struck body's chest): the line, the flash at both ends, the ring closing. */
function shot(c: CityFightAwakeningCanvas, from: { x: number; y: number }, at: { x: number; y: number }, h: number, ageMs: number, fade: number,
  key: string, salt: number): void {
  const k = over(ageMs, R.shot.lineMs);
  if (k < 1) {
    const dx = at.x - from.x, dy = at.y - from.y, length = Math.hypot(dx, dy);
    c.light.streak(from.x, from.y, Math.atan2(dy, dx), length, h * R.shot.widthBodies * (1 - k), C.tracer, (1 - k) * fade);
    c.light.flare(from.x, from.y, h * 0.32 * (1 - k), C.tracer, (1 - k) * fade);
  }
  ringAt(c, at, h, ageMs, fade, salt);
  c.cue(key, "punch", 1.02);
}

/** The aiming ring closing on `at` and the flare where the shot lands. */
function ringAt(c: CityFightAwakeningCanvas, at: { x: number; y: number }, h: number, ageMs: number, fade: number, salt: number): void {
  const close = easeOutCubic(over(ageMs, R.ring.closeMs)), gone = over(ageMs - R.ring.holdMs, 140);
  if (gone >= 1) return;
  const radius = h * (R.ring.fromBodies + (R.ring.toBodies - R.ring.fromBodies) * close);
  c.light.ring(at.x, at.y, radius, C.ring, (1 - gone) * fade * 0.9, 1, salt * 0.6);
  c.light.flare(at.x, at.y, h * 0.4 * Math.exp(-ageMs / 80), PALETTE.white, fade);
}

/** A pass's cut across the struck body: a long line through his chest, drawn in from its ends, thinning to a hair (no fade). */
function slash(c: CityFightAwakeningCanvas, at: { x: number; y: number }, h: number, tilt: number, ageMs: number, fade: number): void {
  const k = over(ageMs, R.slash.ms);
  if (k >= 1) return;
  const draw = easeOutCubic(over(ageMs, 70)), length = h * R.slash.lengthBodies * draw, thin = (1 - k) ** 1.5;
  const x = at.x - Math.cos(tilt) * length / 2, y = at.y - Math.sin(tilt) * length / 2;
  c.light.streak(x, y, tilt, length, h * R.slash.widthBodies * 2.6 * thin, C.ring, 0.55 * fade);
  c.light.streak(x, y, tilt, length, h * R.slash.widthBodies * thin, PALETTE.white, fade);
}

function draw(shotOf: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shotOf.contact, fade = shotOf.fade, side = shotOf.side, v = shotOf.view, caster = shotOf.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, vh = v.height / shotOf.perPx;
  const muzzle = { x: caster.x + side * h * R.shot.reachBodies, y: caster.y - h * R.shot.muzzleBodies };
  const chest = (at: { x: number; y: number; h: number }) => ({ x: at.x, y: at.y - at.h * 0.55 });
  const stamp = (ageMs: number, scale = 1, at = muzzle) => {
    const W = R.word, k = over(ageMs, W.stampMs), out = over(ageMs - W.holdMs, 140);
    if (out >= 1) return;
    c.word(0, at.x + side * h * 0.1, at.y - h * 0.35, vh * W.size * scale, { scale: W.fromScale + (1 - W.fromScale) * easeOutBack(k),
      alpha: easeOutCubic(k) * (1 - out) * fade, color: C.word, stroke: C.ink, angle: -6 * side });
  };
  // The aimed shot (the super's contact) from where he stands.
  shot(c, muzzle, chest(contact.at), h, contact.ageMs, fade, "shot", 0);
  stamp(contact.ageMs, 1.15);
  // Each pass through him: its line across him (the first falling, the second rising — an X), its ring and its "탕!" on him.
  const tilt = (R.slash.tiltDeg * Math.PI) / 180;
  for (const mark of marksOf(shotOf, "hold")) {
    const at = chest(mark.at);
    slash(c, at, h, mark.nth % 2 === 0 ? tilt : -tilt, mark.ageMs, fade);
    ringAt(c, at, h, mark.ageMs, fade, mark.nth + 1);
    stamp(mark.ageMs, 0.9, { x: at.x, y: at.y - h * 0.1 });
    c.cue(`pass${mark.nth}`, "punch", 1.03);
  }
  // Home again, the held two-hand aim: the ring closing on him until the last shot.
  const progress = shotOf.progress, launch = markOf(shotOf, "launch");
  if (!launch && progress !== null && progress >= R.pass.homeAt && shotOf.running) {
    const k = over(progress - R.pass.homeAt, 900 - R.pass.homeAt), at = chest(shotOf.target);
    c.light.ring(at.x, at.y, h * (0.9 - 0.62 * easeInCubic(k)), C.ring, 0.75 * fade, 1, 3.1);
  }
  // The last throws him up: a column of cool light up from him, the night's stars brighter for a moment.
  if (launch) {
    shot(c, muzzle, chest(launch.at), h, launch.ageMs, fade, "shot3", 3);
    stamp(launch.ageMs, 1.3);
    const k = over(launch.ageMs, 520);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2.4, h * 0.26 * (1 - k * 0.6), C.ring, (1 - k) * fade);
    c.light.ring(launch.at.x, launch.at.y - h * 0.5, h * (0.3 + 1.2 * easeOutCubic(k)), C.ring, (1 - k) * fade * 0.7);
    c.cue("launch", "shake", 7);
  }
}

/**
 * What he plays while the follow-up runs (`progress`, its fight clock): out through the other on the gun-kata run, the point-blank shot cell
 * as he crosses (the beat lands then), planted past him, turned, back through him, home; the held aim; the last shot; then his calm victory.
 */
function casterClip(shotOf: CityFightAwakeningShot): CityFightAwakeningClip | null {
  const launch = markOf(shotOf, "launch");
  if (launch) {
    return launch.ageMs < R.cells.fireHoldMs ? { clip: "slam", ms: R.cells.fire, loop: false } : { clip: "victory", ms: launch.ageMs, loop: true };
  }
  const p = shotOf.progress, contact = shotOf.contact, P = R.pass, K = R.cells;
  if (p === null || !contact || contact.blocked || p < P.outFrom) return null;
  const casterH = Math.max(1, shotOf.caster.h), gap = Math.abs(shotOf.target.x - shotOf.caster.x) / casterH, far = gap + P.beyondBodies;
  const [cross1, cross2] = P.cross, turnAt = cross1 + (cross2 - cross1) * 0.32;
  const run = (ms: number) => K.run[Math.floor(ms / K.runStepMs) % 2]!;
  const shooting = (ms: number, from: number, to: number) => Math.abs(ms - cross1) <= P.snapMs || Math.abs(ms - cross2) <= P.snapMs
    || P.extraShots.some(share => Math.abs(ms - (from + (to - from) * share)) <= P.extraMs / 2);
  const cell = (ms: number, from: number, to: number) => shooting(ms, from, to) ? K.struck : run(ms);
  // Out: speeding up to the crossing, easing out past him.
  if (p < cross1) return { clip: "skill", ms: cell(p, P.outFrom, cross1), loop: false, towardBodies: gap * easeInCubic(clamp01((p - P.outFrom) / (cross1 - P.outFrom))) ** 0.75, ghost: true };
  if (p < turnAt) {
    const k = clamp01((p - cross1) / (turnAt - cross1 - P.turnMs));
    // Past him he plants turned back to face him (2026-10-27 film: planted facing on, he fired off the screen).
    const snapping = p - cross1 <= P.snapMs;
    return { clip: "skill", ms: snapping ? K.struck : K.plant, loop: false, towardBodies: gap + P.beyondBodies * easeOutCubic(k), turned: !snapping,
      ghost: k < 1 };
  }
  // Back through him (turned about), home by `homeAt`.
  if (p < cross2) {
    const k = clamp01((p - turnAt) / (cross2 - turnAt));
    return { clip: "skill", ms: cell(p, turnAt, cross2), loop: false, towardBodies: far - P.beyondBodies * easeInCubic(k) ** 0.75, turned: true, ghost: true };
  }
  if (p < P.homeAt) {
    const k = clamp01((p - cross2) / (P.homeAt - cross2));
    return { clip: "skill", ms: p - cross2 <= P.snapMs ? K.struck : run(p), loop: false, towardBodies: gap * (1 - easeOutCubic(k)), turned: true,
      ghost: true };
  }
  // Home: the held two-hand aim until the last beat.
  return shotOf.running ? { clip: "slam", ms: K.aim, loop: false } : null;
}

export const RESOLVE_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.stamp,
  holdMs: R.holdMs,
  skyInMs: 320,
  words: locale => [t(locale, "fight.superStage.shot")],
  draw,
  casterClip,
});
