import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over, ribbon } from "./AwakeningDraw";


const C = AWAKENING_COLORS.countdown;

export const COUNTDOWN = Object.freeze({
  /** The spotlight: from the top over the two of them, `widthBodies` wide at the floor. */
  spot: { widthBodies: 3.2, alpha: 0.42 },
  /** The count: `size` view heights, stamped from `fromScale` over `stampMs`, held `holdMs`; "2" on the `twoAt`-th hook. */
  count: { size: 0.2, fromScale: 2.2, stampMs: 110, holdMs: 420, outMs: 160, twoAt: 4, x: 0.22, y: 0.36 },
  /** The weave: a figure eight `widthBodies` wide round his head, `periodMs` a turn. */
  weave: { widthBodies: 0.9, heightBodies: 0.32, periodMs: 360, lengthTurns: 0.7 },
  /** The crowd's flashes: per hook, in the view's upper half. */
  flashes: { perBlow: 3, lifeMs: 160 },
  holdMs: 820,
});

const K = COUNTDOWN;

/** A point on the figure eight round (x, y) at phase `a`. */
function eight(x: number, y: number, w: number, hh: number, a: number): Phaser.Types.Math.Vector2Like {
  return { x: x + Math.sin(a) * w / 2, y: y + Math.sin(2 * a) * hh / 2 };
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact) return;
  const h = contact.at.h, ground = contact.at.y, mid = (caster.x + contact.at.x) / 2, on = over(shot.ms, 300) * fade;
  // The spotlight over the two of them.
  c.backLight.cone(mid, v.y - h * 0.3, Math.PI / 2, ground - v.y + h * 0.6, h * K.spot.widthBodies, C.spot, K.spot.alpha * on);
  c.light.glow(mid, ground, h * K.spot.widthBodies * 1.1, C.spot, 0.3 * on, 0.18);
  if (contact.blocked) return;
  // The count: "1" at the contact, "2" midway through the hooks, "3" at the uppercut.
  const holds = marksOf(shot, "hold"), launch = markOf(shot, "launch"), vh = v.height / shot.perPx, N = K.count;
  const counts: [number, number][] = [[0, contact.ageMs]];
  const two = holds.find(mark => mark.nth === N.twoAt);
  if (two) counts.push([1, two.ageMs]);
  if (launch) counts.push([2, launch.ageMs]);
  // The latest count only (each takes over from the one before).
  const [index, age] = counts[counts.length - 1]!, k = over(age, N.stampMs), out = over(age - N.holdMs, N.outMs);
  c.word(index, v.x + v.width * (side > 0 ? 1 - N.x : N.x), v.y + v.height * N.y, vh * N.size, { scale: N.fromScale + (1 - N.fromScale) * easeOutBack(k),
    alpha: easeOutCubic(k) * (1 - out) * fade, color: PALETTE.white, stroke: C.glove, angle: -6 * side });
  // The weave: a gold figure eight round his head while the hooks land.
  const W = K.weave, lastHook = holds[holds.length - 1], weaving = holds.length > 0 && !launch ? 1 : lastHook && launch ? 1 - over(launch.ageMs, 200) : 0;
  if (weaving > 0) {
    const hx = caster.x + side * h * 0.05, hy = caster.y - h * 0.82, phase = contact.ageMs / W.periodMs * Math.PI * 2, points: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i <= 24; i++) points.push(eight(hx, hy, h * W.widthBodies, h * W.heightBodies, phase - i / 24 * Math.PI * 2 * W.lengthTurns));
    ribbon(c.front, points, tt => h * 0.07 * (1 - tt), C.weave, 0.7 * weaving * fade);
    const head = points[0]!;
    c.light.flare(head.x, head.y, h * 0.35, C.weave, weaving * fade);
  }
  // The hooks: a flash on him from either side by turns, the crowd's camera flashes going off.
  for (const mark of holds) {
    const k = over(mark.ageMs, 150), from = mark.nth % 2 === 0 ? -1 : 1;
    if (k < 1) {
      const x = mark.at.x + from * h * 0.2, y = mark.at.y - h * (0.5 + 0.15 * (mark.nth % 2));
      c.light.streak(x - from * h * 0.2, y, from * -0.3, h * 0.7, h * 0.06, C.weave, (1 - k) * fade);
      c.light.flare(x, y, h * 0.55 * (1 - k), PALETTE.white, (1 - k) * fade, mark.nth);
    }
    for (let i = 0; i < K.flashes.perBlow; i++) {
      const f = over(mark.ageMs - i * 40, K.flashes.lifeMs);
      if (f <= 0 || f >= 1) continue;
      c.light.flare(v.x + v.width * jitter(mark.nth * 3 + i, 60), v.y + v.height * (0.18 + 0.3 * jitter(mark.nth * 3 + i, 61)), h * 0.3,
        PALETTE.white, (1 - f) * fade, f);
    }
    c.cue(`hook${mark.nth}`, "shake", 4);
  }
  // The uppercut: a gold column up off him.
  if (launch) {
    const k = over(launch.ageMs, 420);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2.6, h * 0.3, C.weave, (1 - easeInCubic(k)) * fade);
    c.light.flare(launch.at.x, launch.at.y - h * 0.7, h * 1.6 * (1 - k), PALETTE.white, (1 - k) * fade);
    c.cue("upper", "punch", 1.02);
  }
  // The overhand: a streak down onto him.
  const spike = markOf(shot, "spike");
  if (spike) {
    const k = over(spike.ageMs, 360);
    c.light.ray(spike.at.x - side * h * 0.8, spike.at.y - h * 1.6, Math.atan2(h * 1.4, side * h * 0.8), h * 1.9, h * 0.16, C.weave, (1 - k) * fade);
    c.light.ring(spike.at.x, spike.at.y, h * (0.3 + 1.2 * easeOutCubic(k)), C.weave, (1 - k) * fade, 0.25);
    c.cue("overhand", "shake", 10);
  }
  // The bell: rings out of the top corner, "땡!".
  const bell = markOf(shot, "down");
  if (bell) {
    const corner = { x: v.x + v.width * (side > 0 ? 0.9 : 0.1), y: v.y + v.height * 0.2 };
    for (let i = 0; i < 3; i++) {
      const k = over(bell.ageMs - i * 110, 600);
      if (k > 0 && k < 1) c.light.ring(corner.x, corner.y, h * (0.2 + 1.4 * easeOutCubic(k)), C.bell, (1 - k) * fade);
    }
    c.paint.fillStyle(C.bell, fade).fillCircle(corner.x, corner.y, h * 0.16);
    c.paint.fillStyle(C.glove, fade).fillCircle(corner.x, corner.y + h * 0.04, h * 0.05);
    const s = over(bell.ageMs, 100);
    c.word(3, corner.x - side * h * 0.6, corner.y + h * 0.35, vh * 0.08, { scale: 1.8 - 0.8 * easeOutBack(s), alpha: easeOutCubic(s) * (1 - over(bell.ageMs - 700, 150)) * fade,
      color: C.bell, stroke: C.glove });
    c.light.flare(bell.at.x, bell.at.y - h * 0.15, h * 1.1 * Math.exp(-bell.ageMs / 120), PALETTE.white, fade);
    c.cue("bell", "shake", 8);
  }
}

export const COUNTDOWN_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.bell,
  holdMs: K.holdMs,
  skyInMs: 260,
  words: locale => ["1", "2", "3", t(locale, "fight.superStage.bell")],
  draw,
  // His hooks (his string) through the weave, the rising uppercut his heavy.
  casterClip: shot => {
    const launch = markOf(shot, "launch"), spike = markOf(shot, "spike");
    if (launch && !spike) return { clip: "slam", ms: launch.ageMs + 200, loop: false };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "combo", ms: shot.contact.ageMs * 1.3, loop: true } : null;
  },
});
