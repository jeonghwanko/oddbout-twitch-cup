import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import { jitter, markOf, marksOf, over } from "./AwakeningDraw";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";


const C = AWAKENING_COLORS.burrowRush;

export const BURROW_RUSH = Object.freeze({
  /** The holes: `count` across `spanViews` of the view on the feet line, opened over `openMs` one after another. */
  holes: { count: 6, spanViews: 0.8, widthBodies: 0.5, openMs: 120, everyMs: 50 },
  /** A gopher popping out: up `riseBodies` over `riseMs`, back down after `stayMs`. */
  pop: { riseBodies: 0.9, riseMs: 120, stayMs: 260, scale: 0.7 },
  /** The dirt: `clods` per burst, flying `reachBodies` over `lifeMs`. */
  dirt: { clods: 9, reachBodies: 1, lifeMs: 520 },
  stamp: { size: 0.065, fromScale: 2, stampMs: 110 },
  holdMs: 800,
});

const B = BURROW_RUSH;

/** A burst of dirt clods out of (x, y). */
function dirt(g: Phaser.GameObjects.Graphics, x: number, y: number, h: number, k: number, salt: number, alpha: number): void {
  for (let i = 0; i < B.dirt.clods; i++) {
    const a = -Math.PI * (0.1 + 0.8 * jitter(i, salt)), d = h * B.dirt.reachBodies * easeOutCubic(k) * (0.5 + 0.5 * jitter(i, salt + 1));
    g.fillStyle(i % 3 === 0 ? C.dirtLight : C.dirt, alpha * (1 - easeInCubic(k))).fillCircle(x + Math.cos(a) * d, y + Math.sin(a) * d + h * 1.2 * k * k,
      h * 0.04 * (0.6 + 0.8 * jitter(i, salt + 2)));
  }
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, mid = (shot.caster.x + contact.at.x) / 2;
  // The row of holes along the ground, opening one after another.
  const H = B.holes, holes: number[] = [];
  for (let i = 0; i < H.count; i++) {
    const x = mid + (i - (H.count - 1) / 2) / (H.count - 1) * v.width * H.spanViews, open = easeOutBack(over(contact.ageMs - i * H.everyMs, H.openMs));
    holes.push(x);
    if (open <= 0) continue;
    c.under.fillStyle(C.dirt, fade).fillEllipse(x, ground, h * H.widthBodies * 1.25 * open, h * 0.16 * open);
    c.under.fillStyle(C.hole, fade).fillEllipse(x, ground, h * H.widthBodies * open, h * 0.1 * open);
  }
  c.bodies("both");
  // The dirt column under him at the launch.
  const launch = markOf(shot, "launch");
  if (launch) {
    const k = over(launch.ageMs, B.dirt.lifeMs);
    dirt(c.paint, launch.at.x, ground, h * 1.4, k, 3, fade);
    c.light.ray(launch.at.x, ground, -Math.PI / 2, h * 2, h * 0.3, C.dirtLight, 0.5 * (1 - k) * fade);
    c.cue("launch", "shake", 8);
  }
  // The air blows: a gopher out of a hole each, leaping at him, dirt off the hole.
  for (const mark of marksOf(shot, "air")) {
    const P = B.pop, hole = holes[(mark.nth * 2 + 1) % holes.length]!, k = over(mark.ageMs, P.riseMs), back = over(mark.ageMs - P.riseMs - P.stayMs, P.riseMs);
    if (back >= 1) continue;
    const rise = h * P.riseBodies * easeOutBack(k) * (1 - easeInCubic(back));
    c.figure("caster", "entrance", mark.ageMs, true, hole, ground - rise + h * 0.25, fade, { scale: P.scale, flip: hole > mark.at.x, layer: "under" });
    dirt(c.paint, hole, ground, h, over(mark.ageMs, B.dirt.lifeMs), 10 + mark.nth, fade);
    c.light.flare(mark.at.x, mark.at.y - h * 0.5, h * 0.6 * (1 - k), PALETTE.white, (1 - k) * fade, mark.nth);
  }
  // The spike: dirt bursting under where he lands.
  const spike = markOf(shot, "spike");
  if (spike) {
    const k = over(spike.ageMs, B.dirt.lifeMs);
    dirt(c.paint, spike.at.x, ground, h * 1.6, k, 40, fade);
    c.light.ring(spike.at.x, ground, h * (0.3 + 1.3 * easeOutCubic(k)), C.dirtLight, (1 - k) * fade, 0.25);
    c.cue("spike", "shake", 11);
  }
  // The last one, out from under him lying there — "출구!".
  const down = markOf(shot, "down");
  if (down) {
    const P = B.pop, k = over(down.ageMs, P.riseMs), x = down.at.x + side * h * 0.1;
    c.under.fillStyle(C.hole, fade).fillEllipse(x, ground + h * 0.02, h * 0.5, h * 0.1);
    c.figure("caster", "entrance", down.ageMs, true, x, ground - h * 0.6 * easeOutBack(k) + h * 0.2, fade, { scale: P.scale, layer: "front" });
    dirt(c.paint, x, ground, h * 1.3, over(down.ageMs, B.dirt.lifeMs), 60, fade);
    const S = B.stamp, s = over(down.ageMs - 60, S.stampMs);
    c.word(0, x, ground - h * 1.25, v.height / shot.perPx * S.size, { scale: S.fromScale + (1 - S.fromScale) * easeOutBack(s),
      alpha: easeOutCubic(s) * fade * (1 - over(down.ageMs - 650, 150)), color: C.gopher, stroke: C.hole });
    c.cue("exit", "punch", 1.02);
  }
}

export const BURROW_RUSH_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.gopher,
  holdMs: B.holdMs,
  skyInMs: 300,
  words: locale => [t(locale, "fight.superStage.exit")],
  draw,
  // He digs on (his skill) while the others pop out, and cheers over the last hole (his victory).
  casterClip: shot => {
    const down = markOf(shot, "down"), launch = markOf(shot, "launch");
    if (down) return { clip: "victory", ms: down.ageMs, loop: true };
    return launch ? { clip: "skill", ms: launch.ageMs, loop: true } : null;
  },
});
