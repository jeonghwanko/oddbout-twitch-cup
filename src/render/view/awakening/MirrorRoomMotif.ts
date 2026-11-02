import { easeInCubic, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { burst, jitter, markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.mirrorRoom;

export const MIRROR_ROOM = Object.freeze({
  /**
   * The mirrors: `count` panels `widthBodies` × `heightBodies` across `spanViews` of the view, risen over `riseMs` from the contact. His
   * reflection in each: a flat glass silhouette at `reflectionAlpha` (2026-10-23 arena audit, b04 #1522–1546: in his own yellow at 0.3 the
   * reflections read as more of him — no colour of his, fainter).
   */
  mirrors: { count: 6, widthBodies: 0.62, heightBodies: 1.9, spanViews: 0.92, riseMs: 200, reflectionAlpha: 0.2 },
  /** A mirror's shatter: `shards` pieces falling over `fallMs`. */
  shatter: { shards: 9, fallMs: 650 },
  /** The one-inch punch's ring: out to `reachBodies` over `ringMs`. */
  inch: { reachBodies: 2.8, ringMs: 420 },
  holdMs: 800,
});

const R = MIRROR_ROOM;

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, mid = (caster.x + contact.at.x) / 2;
  const holds = marksOf(shot, "hold"), rapid = holds.filter(mark => mark.nth < 6), inch = holds.find(mark => mark.nth === 6) ?? null;
  // The mirrors standing round them; each rapid blow breaks the next one (from the nearest out).
  const M = R.mirrors, rise = easeOutCubic(over(contact.ageMs, M.riseMs)), mw = h * M.widthBodies, mh = h * M.heightBodies;
  const order = Array.from({ length: M.count }, (_, i) => i).sort((a, b) => Math.abs(a - (M.count - 1) / 2) - Math.abs(b - (M.count - 1) / 2));
  for (let i = 0; i < M.count; i++) {
    const x = mid + (i - (M.count - 1) / 2) / (M.count - 1) * v.width * M.spanViews, top = ground - mh * rise;
    const broke = rapid.find(mark => order[mark.nth] === i);
    if (broke) {
      // Its pieces falling.
      const k = over(broke.ageMs, R.shatter.fallMs);
      for (let s = 0; s < R.shatter.shards; s++) {
        const sx = x + (jitter(s, i) - 0.5) * mw, sy = top + mh * jitter(s, i + 9) + (h * 1.2) * k * k * (0.6 + 0.4 * jitter(s, i + 3));
        const r = h * 0.08 * (0.6 + 0.8 * jitter(s, i + 5)), turn = k * 6 * (jitter(s, i + 7) - 0.5);
        c.paint.fillStyle(C.glass, 0.7 * (1 - k) * fade).fillTriangle(sx + Math.cos(turn) * r, sy + Math.sin(turn) * r, sx + Math.cos(turn + 2.2) * r,
          sy + Math.sin(turn + 2.2) * r, sx + Math.cos(turn + 4.1) * r * 0.7, sy + Math.sin(turn + 4.1) * r * 0.7);
        c.light.glow(sx, sy, r * 1.5, PALETTE.white, 0.4 * (1 - k) * fade);
      }
      continue;
    }
    c.under.fillStyle(C.glass, 0.22 * rise * fade).fillRect(x - mw / 2, top, mw, mh * rise);
    // His reflection in it.
    c.figure("caster", "fightIdle", shot.ms + i * 90, true, x, ground, M.reflectionAlpha * rise * fade,
      { fill: C.glass, flip: (i < M.count / 2) === (side > 0), layer: "under" });
    c.under.lineStyle(2.5 * shot.perPx, C.frame, rise * fade).strokeRect(x - mw / 2, top, mw, mh * rise);
    const sheen = (shot.ms / 900 + i * 0.17) % 1;
    c.light.streak(x - mw / 2 + mw * sheen, top + mh * 0.5 * rise, -1.15, mh * 0.9 * rise, mw * 0.08, C.glassLight, 0.5 * rise * fade);
  }
  c.bodies("both");
  // The rapid blows: a yellow line from his fist into him, a spark.
  for (const mark of rapid) {
    const k = over(mark.ageMs, 140);
    if (k >= 1) continue;
    const y = mark.at.y - h * (0.55 + 0.06 * (mark.nth % 3)), from = caster.x + side * h * 0.25;
    c.light.streak((from + mark.at.x) / 2, y, side > 0 ? 0 : Math.PI, Math.abs(mark.at.x - from) * 1.3, h * 0.05, C.flash, (1 - k) * fade);
    c.light.flare(mark.at.x, y, h * 0.55 * (1 - k), C.flash, (1 - k) * fade, mark.nth);
    c.cue(`jab${mark.nth}`, "shake", 3);
  }
  // The one-inch punch: the frame holds, a great ring out of his fist, speed lines across the view.
  if (inch) {
    const k = over(inch.ageMs, R.inch.ringMs), x = inch.at.x - side * h * 0.1, y = inch.at.y - h * 0.55;
    c.light.ring(x, y, h * (0.2 + R.inch.reachBodies * easeOutCubic(k)), C.flash, (1 - k) * fade, 1, 0);
    c.light.ring(x, y, h * (0.1 + R.inch.reachBodies * 0.6 * easeOutCubic(k)), PALETTE.white, (1 - k) * fade, 1, 0);
    c.light.flare(x, y, h * 1.8 * Math.exp(-inch.ageMs / 120), PALETTE.white, fade);
    for (let i = 0; i < 9; i++) {
      const ly = v.y + v.height * (0.15 + 0.75 * jitter(i, 50)), lx = v.x + v.width * jitter(i, 51);
      c.light.streak(lx + side * v.width * 0.3 * k, ly, 0, v.width * 0.45, h * 0.015, PALETTE.white, 0.55 * (1 - k) * fade);
    }
    c.cue("inch", "shake", 14);
  }
  // The flying side kick: a yellow streak up off him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const k = over(launch.ageMs, 380);
    c.light.ray(launch.at.x - side * h * 0.6, launch.at.y - h * 0.3, side > 0 ? -0.6 : Math.PI + 0.6, h * 2.2, h * 0.18, C.flash, (1 - k) * fade);
    burst(c.front, launch.at.x, launch.at.y - h * 0.5, 10, h * 0.2, h * 1.1 * easeOutCubic(k), h * 0.05, C.flash, 0.8 * (1 - k) * fade, 4);
  }
  // The heel stomp on him lying, and the thumb flicking his nose.
  const down = markOf(shot, "down");
  if (down) {
    const k = over(down.ageMs, 450);
    c.light.ring(down.at.x, down.at.y, h * (0.3 + 1.3 * easeOutCubic(k)), C.flash, (1 - k) * fade, 0.25);
    c.light.flare(down.at.x, down.at.y - h * 0.15, h * 1.2 * Math.exp(-down.ageMs / 120), PALETTE.white, fade);
    const nose = over(down.ageMs - 380, 260);
    if (nose > 0 && nose < 1) c.light.flare(caster.x + side * h * 0.1, caster.y - h * 0.86, h * 0.35 * (1 - easeInCubic(nose)), PALETTE.white, fade, nose * 3);
    c.cue("stomp", "shake", 9);
  }
}

export const MIRROR_ROOM_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.flash,
  holdMs: R.holdMs,
  skyInMs: 300,
  draw,
  // His straight blasts (his string, fast) through the mirrors, the flying kick his heavy.
  casterClip: shot => {
    const launch = markOf(shot, "launch"), down = markOf(shot, "down");
    if (launch && !down) return { clip: "slam", ms: launch.ageMs + 250, loop: false };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "combo", ms: shot.contact.ageMs * 1.6, loop: true } : null;
  },
});
