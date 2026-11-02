import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.noPassing;

export const NO_PASSING = Object.freeze({
  /** The beacons: two from the top corners, `periodMs` a turn. */
  beacon: { periodMs: 700, alpha: 0.32, widthBodies: 2 },
  /** The barrier: `heightBodies` over the feet, `stripes` stripes, dropped over `dropMs`. */
  barrier: { heightBodies: 0.75, stripes: 9, widthBodies: 1.6, dropMs: 220 },
  /** A sign: `radiusBodies`, stamped from `fromScale` over `stampMs`, held to the fade. */
  sign: { radiusBodies: 0.22, fromScale: 2, stampMs: 110 },
  /** The ticket: `widthBodies` × `heightBodies`, slapped on over `slapMs`. */
  ticket: { widthBodies: 0.42, heightBodies: 0.56, slapMs: 140, size: 0.045 },
  holdMs: 820,
});

const N = NO_PASSING;

/** A no-entry sign: a red disc, its white bar. */
function sign(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha: number, perPx: number): void {
  g.fillStyle(PALETTE.white, alpha).fillCircle(x, y, r * 1.1);
  g.fillStyle(C.red, alpha).fillCircle(x, y, r);
  g.fillStyle(PALETTE.white, alpha).fillRect(x - r * 0.65, y - r * 0.16, r * 1.3, r * 0.32);
  g.lineStyle(1.5 * perPx, C.ink, alpha).strokeCircle(x, y, r * 1.1);
}

/** The barrier and the signs stand until a beat after the uppercut (1 → 0). */
function launchedBarrier(shot: CityFightAwakeningShot): number {
  const launch = markOf(shot, "launch");
  return launch ? 1 - over(launch.ageMs - 450, 250) : 1;
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, on = over(contact.ageMs, 180) * fade;
  // The beacons turning.
  const B = N.beacon;
  for (const corner of [-1, 1]) {
    const ox = corner < 0 ? v.x + v.width * 0.06 : v.right - v.width * 0.06, a = Math.PI / 2 + 0.7 * Math.sin(shot.ms / B.periodMs * Math.PI * 2 + (corner > 0 ? Math.PI : 0));
    c.backLight.cone(ox, v.y + v.height * 0.12, a, v.height, h * B.widthBodies, C.beacon, B.alpha * on);
    c.light.flare(ox, v.y + v.height * 0.12, h * 0.4, C.beacon, on * (0.6 + 0.4 * Math.sin(shot.ms * 0.02)));
  }
  // The barrier between them.
  const R = N.barrier, drop = easeOutBack(over(contact.ageMs, R.dropMs)), bx = (caster.x + contact.at.x) / 2, bw = h * 0.1, bh = h * R.heightBodies;
  const top = ground - bh - (1 - drop) * h, up = launchedBarrier(shot) * on;
  c.under.fillStyle(PALETTE.white, up).fillRect(bx - h * R.widthBodies / 2, top, h * R.widthBodies, bw);
  for (let i = 0; i < R.stripes; i += 2) c.under.fillStyle(C.red, up).fillRect(bx - h * R.widthBodies / 2 + i * h * R.widthBodies / R.stripes, top, h * R.widthBodies / R.stripes, bw);
  for (const end of [-1, 1]) c.under.fillStyle(C.ink, up).fillRect(bx + end * h * R.widthBodies * 0.42 - bw * 0.2, top, bw * 0.4, bh);
  c.bodies("both");
  // "딱!": a sign stamped over him at each pinch — taken down a beat after the uppercut throws him.
  const signsDown = launchedBarrier(shot);
  for (const mark of marksOf(shot, "hold")) {
    const S = N.sign, k = over(mark.ageMs, S.stampMs), r = h * S.radiusBodies * (S.fromScale + (1 - S.fromScale) * easeOutBack(k));
    sign(c.ink, mark.at.x + (mark.nth - 1) * h * 0.42, mark.at.y - h * 1.15, r, easeOutCubic(k) * signsDown * fade, shot.perPx);
    c.light.flare(mark.at.x, mark.at.y - h * 0.5, h * 0.7 * Math.exp(-mark.ageMs / 90), PALETTE.white, fade);
    c.cue(`pinch${mark.nth}`, "shake", 6);
  }
  // The pincer's uppercut and its slam.
  const launch = markOf(shot, "launch"), spike = markOf(shot, "spike");
  if (launch) {
    const k = over(launch.ageMs, 400);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2.2, h * 0.25, C.red, (1 - easeInCubic(k)) * fade);
  }
  if (spike) {
    const k = over(spike.ageMs, 420);
    c.light.ring(spike.at.x, ground, h * (0.3 + 1.5 * easeOutCubic(k)), C.beacon, (1 - k) * fade, 0.25);
    c.cue("slam", "shake", 11);
  }
  // The ticket slapped onto him lying there.
  const down = markOf(shot, "down");
  if (down) {
    const T = N.ticket, k = over(down.ageMs, T.slapMs), s = 1.8 - 0.8 * easeOutBack(k), w = h * T.widthBodies * s, th = h * T.heightBodies * s;
    const x = down.at.x + side * h * 0.1, y = ground - h * 0.32, alpha = easeOutCubic(k) * (1 - over(down.ageMs - 520, 180)) * fade;
    c.ink.fillStyle(C.paper, alpha).fillRect(x - w / 2, y - th / 2, w, th);
    c.ink.fillStyle(C.red, alpha).fillRect(x - w / 2, y - th / 2, w, th * 0.22);
    for (let i = 0; i < 3; i++) c.ink.fillStyle(C.ink, 0.5 * alpha).fillRect(x - w * 0.35, y + th * (-0.05 + i * 0.13), w * 0.7, th * 0.04);
    c.word(0, x, y - th / 2 + th * 0.11, v.height / shot.perPx * T.size, { color: PALETTE.white, stroke: C.red, alpha, scale: s });
    c.cue("ticket", "shake", 6);
  }
}

export const NO_PASSING_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.red,
  holdMs: N.holdMs,
  skyInMs: 260,
  words: locale => [t(locale, "fight.superStage.ticket")],
  draw,
  // His pincers snap (his skill) on each "딱!", then he stands guard (his victory).
  casterClip: shot => {
    const down = markOf(shot, "down"), launch = markOf(shot, "launch");
    if (down) return { clip: "victory", ms: down.ageMs, loop: true };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "skill", ms: shot.contact.ageMs, loop: true } : null;
  },
});
