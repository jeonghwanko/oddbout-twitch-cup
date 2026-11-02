import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { burst, markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.poleVault;

export const POLE_VAULT = Object.freeze({
  /** The vault's dotted arc: `dots` brass dots from his feet to `topBodies` over the struck body, drawn in over `drawMs`, gone by `lifeMs`. */
  arc: { dots: 14, topBodies: 1.6, drawMs: 260, lifeMs: 900, dotBodies: 0.035 },
  /** A word: `size` view heights, stamped from `fromScale` over `stampMs`, held `holdMs`. */
  word: { size: 0.075, fromScale: 2, stampMs: 90, holdMs: 420 },
  /** The dust: a flat ring on the ground out to `reachBodies` over `ringMs`. */
  dust: { reachBodies: 1.3, ringMs: 460, squash: 0.28 },
  holdMs: 900,
  /**
   * His own flight (2026-10-25 동작 검수 — he flew his air combo standing on the floor): up `liftBodies` over `riseMs` from the launch
   * (ease-out), `leadBodies` toward the other at the top, down over `fallMs` from the spike (ease-in), his landing held `landHoldMs` before
   * the victory.
   */
  flight: { liftBodies: 0.9, leadBodies: 0.35, riseMs: 180, fallMs: 120, landHoldMs: 260 },
});

const P = POLE_VAULT;

function dust(c: CityFightAwakeningCanvas, x: number, ground: number, h: number, ageMs: number, fade: number, scale = 1): void {
  const k = over(ageMs, P.dust.ringMs);
  if (k >= 1) return;
  c.light.ring(x, ground, h * (0.25 + P.dust.reachBodies * scale * easeOutCubic(k)), C.dust, (1 - k) * fade, P.dust.squash);
  c.light.glow(x, ground, h * 0.9 * scale * (1 - k * 0.5), C.dust, (1 - k) * fade * 0.4, P.dust.squash);
}

function stamp(c: CityFightAwakeningCanvas, index: number, x: number, y: number, vh: number, ageMs: number, fade: number, angle: number): void {
  const W = P.word, k = over(ageMs, W.stampMs), out = over(ageMs - W.holdMs, 160);
  if (out >= 1) return;
  c.word(index, x, y, vh * W.size, { scale: W.fromScale + (1 - W.fromScale) * easeOutBack(k), alpha: easeOutCubic(k) * (1 - out) * fade,
    color: C.word, stroke: C.ink, angle });
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, vh = v.height / shot.perPx;
  // The cane comes down: dust round the struck body's feet.
  dust(c, contact.at.x, ground, h, contact.ageMs, fade);
  if (contact.ageMs < 200) burst(c.ink, contact.at.x, contact.at.y - h * 0.5, 9, h * 0.25, h * 0.55, h * 0.03, C.ink, (1 - contact.ageMs / 200) * fade, 1);
  // The poke: a small brass ring on his chest.
  for (const mark of marksOf(shot, "hold")) {
    const k = over(mark.ageMs, 300);
    if (k < 1) c.light.ring(mark.at.x, mark.at.y - h * 0.55, h * (0.15 + 0.35 * easeOutCubic(k)), C.brass, (1 - k) * fade);
  }
  // "노익장!" and the vault: a dotted brass arc from his feet up over the struck body.
  const launch = markOf(shot, "launch");
  if (launch) {
    stamp(c, 0, caster.x, caster.y - h * 1.35, vh, launch.ageMs, fade, -7 * side);
    const A = P.arc, drawn = easeOutCubic(over(launch.ageMs, A.drawMs)), gone = over(launch.ageMs - A.lifeMs, 260);
    if (gone < 1) {
      const x0 = caster.x, x1 = launch.at.x, top = ground - h * A.topBodies;
      for (let i = 0; i < A.dots; i++) {
        const k = i / (A.dots - 1);
        if (k > drawn) break;
        const x = x0 + (x1 - x0) * k, y = ground - (ground - top) * Math.sin(Math.PI * Math.min(1, k * 0.85 + 0.075));
        c.light.glow(x, y, h * A.dotBodies * 2.2, C.brass, (1 - gone) * fade);
      }
    }
    c.cue("vault", "punch", 1.03);
  }
  // Two cane taps up there: little brass stars on him.
  for (const mark of marksOf(shot, "air")) {
    if (mark.ageMs < 160) burst(c.ink, mark.at.x, mark.at.y - h * 0.4, 6, h * 0.12, h * 0.3, h * 0.025, C.brass, (1 - mark.ageMs / 160) * fade, mark.nth + 3);
  }
  // The butt drop: "털썩!", a big dust ring, the floor shakes.
  const spike = markOf(shot, "spike");
  if (spike) {
    dust(c, spike.at.x, ground, h, spike.ageMs, fade, 1.4);
    stamp(c, 1, spike.at.x + side * h * 0.2, ground - h * 0.95, vh, spike.ageMs, fade, 6 * side);
    c.cue("spike", "shake", 9);
  }
  // He sits on him lying there: one last puff of dust.
  const down = markOf(shot, "down");
  if (down) {
    dust(c, down.at.x, ground, h * 0.8, down.ageMs, fade);
    c.cue("down", "punch", 1.02);
  }
}

export const POLE_VAULT_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.stamp,
  holdMs: P.holdMs,
  skyInMs: 260,
  words: locale => [t(locale, "fight.superStage.oldTimer"), t(locale, "fight.superStage.plop")],
  draw,
  // The vault, the taps and the butt drop are his air combo's cells, flown up there with the body he threw up; then his pompous victory
  // over him lying there.
  casterClip: shot => {
    const down = markOf(shot, "down"), launch = markOf(shot, "launch"), spike = markOf(shot, "spike"), fl = P.flight;
    if (down && down.ageMs >= fl.landHoldMs) return { clip: "victory", ms: down.ageMs - fl.landHoldMs, loop: true };
    if (!launch) return null;
    const up = easeOutCubic(over(launch.ageMs, fl.riseMs)), drop = spike ? easeInCubic(over(spike.ageMs, fl.fallMs)) : 0;
    return { clip: "airCombo", ms: launch.ageMs, loop: false, liftBodies: fl.liftBodies * up * (1 - drop), towardBodies: fl.leadBodies * up * (1 - drop) };
  },
});
