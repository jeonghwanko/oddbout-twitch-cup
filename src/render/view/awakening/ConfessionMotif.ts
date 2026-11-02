import { t } from "../../../app/i18n";
import { mixColor } from "../../art/ColorMix";
import { easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { bell, jitter, markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.confession;

export const CONFESSION = Object.freeze({
  /** The dark: in over `inMs` from the contact, `alpha` deep; the lights back on over `onMs` from the cuffs. */
  dark: { inMs: 90, alpha: 0.93, onMs: 260 },
  /** The bulb: `cordViews` of the view down from its top, swinging `swayRad` at rest, kicked `kickRad` by each blow (dying over `kickMs`). */
  bulb: { cordViews: 0.3, periodMs: 920, swayRad: 0.07, kickRad: 0.3, kickMs: 650, size: 0.2, coneBodies: 1.9, flashMs: 110 },
  /** The blows' words: stamped from `fromScale` over `stampMs`, `size` view heights, held `holdMs`, out over `outMs`; where round him. */
  word: { size: 0.12, fromScale: 1.9, stampMs: 80, holdMs: 380, outMs: 160,
    spots: [[-0.55, -1.05], [0.5, -1.3], [-0.05, -0.75]] as readonly (readonly [number, number])[] },
  /** The door: `heightBodies` tall, opened to `widthBodies` over `openMs`, `gapBodies` past where he stood; `rays` shafts into the room. */
  door: { heightBodies: 1.75, widthBodies: 0.62, gapBodies: 1.3, openMs: 190, rays: 5 },
  /** The cuffs: `ringBodies` across, snapped shut over `snapMs` (from `fromScale`, turned `fromDeg`), gone over `outMs` after `keepMs`. */
  cuffs: { ringBodies: 0.16, snapMs: 130, fromScale: 1.7, fromDeg: 50, keepMs: 380, outMs: 160 },
  holdMs: 800,
});

const K = CONFESSION;

/** The bulb's swing (radians) now: its rest sway and each blow's kick, dying away. */
function swing(shot: CityFightAwakeningShot): number {
  const B = K.bulb, w = Math.PI * 2 / B.periodMs;
  let angle = B.swayRad * Math.sin(w * shot.ms);
  for (const mark of marksOf(shot, "hold")) angle += (mark.nth % 2 === 0 ? 1 : -1) * B.kickRad * Math.exp(-mark.ageMs / B.kickMs) * Math.sin(w * mark.ageMs + Math.PI / 2);
  return angle;
}

/** The lights back on (0..1): from the cuffs, or once a contact with no follow-up has played. */
function lightsOn(shot: CityFightAwakeningShot): number {
  const cuffs = markOf(shot, "down");
  if (cuffs) return over(cuffs.ageMs, K.dark.onMs);
  if (shot.endedMs !== null && !markOf(shot, "launch")) return over(shot.endedMs - 200, K.dark.onMs);
  return 0;
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact;
  if (!contact) return;
  const v = shot.view, h = contact.at.h, ground = contact.at.y, fade = shot.fade;
  const dark = (contact.blocked ? 0.55 * bell(over(contact.ageMs, 420)) : over(contact.ageMs, K.dark.inMs) * (1 - lightsOn(shot))) * fade;
  // The room: dark over everything of the stage, the two bodies dim in the bulb's warm light.
  if (dark > 0.01) {
    c.under.fillStyle(C.room, K.dark.alpha * dark).fillRect(v.x - 4, v.y - 4, v.width + 8, v.height + 8);
    c.bodies("both", { tint: mixColor(PALETTE.white, C.dimBody, dark) });
  }
  // The bulb: from the top of the view over the two of them.
  const mid = (shot.caster.x + contact.at.x) / 2, cord = v.height * K.bulb.cordViews, a = swing(shot);
  const bx = mid + Math.sin(a) * cord, by = v.y + Math.cos(a) * cord;
  const flash = Math.max(0, ...marksOf(shot, "hold").map(mark => Math.exp(-mark.ageMs / K.bulb.flashMs)), Math.exp(-contact.ageMs / K.bulb.flashMs));
  const flicker = 0.88 + 0.12 * jitter(Math.floor(shot.ms / 70), 3);
  const lit = dark * flicker * (1 + 1.4 * flash);
  if (dark > 0.01) {
    c.paint.lineStyle(2.2 * shot.perPx, C.cord, dark).lineBetween(mid, v.y - 4, bx, by - h * 0.06);
    c.paint.fillStyle(C.socket, dark).fillRect(bx - h * 0.035, by - h * 0.1, h * 0.07, h * 0.06);
    const down = Math.PI / 2 - a * 0.5, reach = ground - by + h * 0.25;
    c.light.cone(bx, by, down, reach * 1.15, h * K.bulb.coneBodies, C.bulb, 0.34 * lit);
    c.light.glow(bx + Math.tan(-a * 0.5) * reach, ground, h * K.bulb.coneBodies * 1.6, C.bulb, 0.32 * lit, 0.22);
    c.light.glow(bx, by, h * K.bulb.size * 2.4, C.bulb, 0.45 * lit);
    c.light.flare(bx, by, h * K.bulb.size * (1 + 0.6 * flash), C.bulbCore, Math.min(1, lit));
    // Dust in the cone after each blow.
    for (const mark of marksOf(shot, "hold")) {
      for (let i = 0; i < 7; i++) {
        const k = over(mark.ageMs, 900), x = mark.at.x + (jitter(i, mark.nth + 11) - 0.5) * h * 1.2, y = mark.at.y - h * (0.3 + 0.9 * jitter(i, mark.nth + 5)) - k * h * 0.25;
        c.light.glow(x, y, h * 0.035, C.bulbCore, 0.5 * bell(k) * dark);
      }
    }
  }
  // 퍽! 쿵! 짝!: each held blow's word by him, a hot flash at his chest and a jolt.
  const holds = marksOf(shot, "hold"), vh = v.height / shot.perPx;
  holds.forEach(mark => {
    const W = K.word, k = over(mark.ageMs, W.stampMs), out = over(mark.ageMs - W.holdMs, W.outMs), spot = W.spots[mark.nth % W.spots.length]!;
    c.word(mark.nth % 3, mark.at.x + spot[0] * h * shot.side, mark.at.y + spot[1] * h, vh * W.size,
      { scale: W.fromScale + (1 - W.fromScale) * easeOutBack(k), alpha: easeOutCubic(k) * (1 - out) * fade, angle: (jitter(mark.nth, 7) - 0.5) * 16 });
    const hot = Math.exp(-mark.ageMs / 90);
    c.light.flare(mark.at.x, mark.at.y - h * 0.6, h * 0.9 * (0.6 + hot), C.bulbCore, hot * fade, jitter(mark.nth, 2));
    c.cue(`hold${mark.nth}`, "shake", 7);
  });
  // A contact with no follow-up (blocked, the village): one "퍽!" in the flicker.
  if (!contact.blocked && holds.length === 0 && shot.endedMs !== null && !markOf(shot, "launch")) {
    const W = K.word, k = over(contact.ageMs - 120, W.stampMs);
    if (contact.ageMs >= 120) c.word(0, contact.at.x, contact.at.y - h * 1.05, vh * W.size,
      { scale: W.fromScale + (1 - W.fromScale) * easeOutBack(k), alpha: easeOutCubic(k) * (1 - lightsOn(shot)) * fade });
  }
  // The door: a slit of light opening on the far side, its leaf swinging in dark, shafts of light into the room — he is thrown out through it.
  const launch = markOf(shot, "launch");
  if (launch) {
    const D = K.door, open = easeOutCubic(over(launch.ageMs, D.openMs)), glow = open * (1 - lightsOn(shot)) * fade;
    const dx = contact.at.x + shot.side * h * D.gapBodies, w = h * D.widthBodies * open, dh = h * D.heightBodies, top = ground - dh;
    if (glow > 0.01) {
      // The opening: warm light, brighter toward its middle (stacked added light), a hot edge on its frame.
      c.front.fillStyle(C.door, 0.42 * glow).fillRect(dx - w / 2, top, w, dh);
      c.front.fillStyle(C.bulbCore, 0.3 * glow).fillRect(dx - w * 0.3, top + dh * 0.04, w * 0.6, dh * 0.96);
      c.light.streak(dx, top + dh / 2, Math.PI / 2, dh * 1.25, w * 0.9, C.door, 0.6 * glow, C.bulbCore);
      c.light.glow(dx, top + dh * 0.5, dh * 1.6, C.door, 0.32 * glow);
      // The leaf, swung open into the room on its hinge side: a dark slab in perspective.
      const hinge = dx - shot.side * w / 2, leaf = h * D.widthBodies * 0.55 * open;
      c.paint.fillStyle(C.room, 0.95 * glow).fillPoints([{ x: hinge, y: top }, { x: hinge - shot.side * leaf, y: top + dh * 0.08 },
        { x: hinge - shot.side * leaf, y: ground + dh * 0.04 }, { x: hinge, y: ground }], true);
      c.paint.lineStyle(1.5 * shot.perPx, C.socket, glow).strokeRect(dx - w / 2, top, w, dh);
      // Shafts of light into the room, toward the caster, dust in them.
      for (let i = 0; i < D.rays; i++) {
        const t = (i + 0.5) / D.rays, angle = (shot.side > 0 ? Math.PI : 0) + shot.side * (-0.12 + 0.22 * t) * -1;
        c.light.cone(dx, top + dh * (0.25 + 0.6 * t), angle, h * (2.4 + 0.8 * jitter(i, 31)), dh * 0.5, C.door, 0.16 * glow);
      }
      for (let i = 0; i < 10; i++) {
        const k = (launch.ageMs / 1800 + jitter(i, 41)) % 1, x = dx - shot.side * h * (0.2 + 2.2 * jitter(i, 42)), y = top + dh * (0.2 + 0.7 * jitter(i, 43)) - k * h * 0.2;
        c.light.glow(x, y, h * 0.03, C.bulbCore, 0.6 * bell(k) * glow);
      }
      c.light.streak(dx, ground, 0, w + h * 2.4, h * 0.05, C.doorFloor, 0.4 * glow);
    }
    c.cue("door", "shake", 10);
  }
  // The cuffs: two gold rings snapping shut on him lying there; the detective's badge glints.
  const cuffs = markOf(shot, "down");
  if (cuffs) {
    const F = K.cuffs, k = over(cuffs.ageMs, F.snapMs), s = F.fromScale + (1 - F.fromScale) * easeOutBack(k), r = h * F.ringBodies * s / 2;
    const cx = cuffs.at.x + shot.side * h * 0.1, cy = cuffs.at.y - h * 0.12, turn = (1 - k) * F.fromDeg * Math.PI / 180;
    const alpha = easeOutCubic(k) * (1 - over(cuffs.ageMs - F.keepMs, F.outMs)) * fade;
    for (const side of [-1, 1] as const) {
      const x = cx + side * r * 1.15 * Math.cos(turn), y = cy + side * r * 1.15 * Math.sin(turn);
      c.ink.lineStyle(r * 0.62, C.cuffDark, alpha).strokeEllipse(x, y, r * 2, r * 1.4);
      c.ink.lineStyle(r * 0.36, PALETTE.fxWarmGold, alpha).strokeEllipse(x, y, r * 2, r * 1.4);
    }
    c.ink.lineStyle(r * 0.22, PALETTE.fxWarmGold, alpha).lineBetween(cx - r * 0.35, cy, cx + r * 0.35, cy);
    const click = Math.exp(-Math.max(0, cuffs.ageMs - F.snapMs * 0.7) / 140);
    c.light.flare(cx, cy, h * 0.7 * click, PALETTE.hotGold, click * alpha);
    const badge = bell(over(cuffs.ageMs - 260, 420));
    c.light.flare(shot.caster.x + shot.side * h * 0.08, shot.caster.y - h * 0.62, h * 0.32, PALETTE.hotGold, badge * fade, 0.4);
  }
}

/** Reduced motion: the dark (still) and the cuffs, faded. */
function drawReduced(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact;
  if (!contact || contact.blocked) return;
  const v = shot.view, dark = 0.8 * (1 - lightsOn(shot)) * shot.fade;
  if (dark > 0.01) {
    c.under.fillStyle(C.room, dark).fillRect(v.x - 4, v.y - 4, v.width + 8, v.height + 8);
    c.bodies("both", { tint: mixColor(PALETTE.white, C.dimBody, dark) });
  }
}

export const CONFESSION_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: null,
  color: C.stamp,
  holdMs: K.holdMs,
  words: locale => [t(locale, "fight.superStage.blackout1"), t(locale, "fight.superStage.blackout2"),
    t(locale, "fight.superStage.blackout3")],
  draw,
  drawReduced,
  // In the dark he beats on (his string looping) until the door; then he stands, dusting off.
  casterClip: shot => {
    const launch = markOf(shot, "launch");
    return shot.contact && !shot.contact.blocked && !launch && shot.marks.length > 0 ? { clip: "combo", ms: shot.contact.ageMs, loop: true } : null;
  },
});
