import type Phaser from "phaser";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { bell, jitter, markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.disco;
const TILE_COLOURS = [C.magenta, PALETTE.fxWarmGold, C.violet, C.hot] as const;

export const DISCO = Object.freeze({
  /** The floor: tiles `tileBodies` wide in `rows` rows, `depthBodies` deep under the feet line, over `views` of the view; changes every `beatMs`. */
  floor: { tileBodies: 0.34, rows: 3, depthBodies: 0.3, views: 1.3, beatMs: 230, inMs: 220, lit: 0.42 },
  /** The mirror ball: `radiusBodies`, dropping in over `dropMs` to `atViews` down and `acrossViews` in from his side; `facets` × `facets`, `specks` reflections. */
  ball: { radiusBodies: 0.24, dropMs: 420, atViews: 0.27, acrossViews: 0.3, facets: 9, specks: 46, speckSpin: 0.00055 },
  /** The spotlights: three from the top, sweeping `sweepRad`, `widthBodies` wide at the floor. */
  spots: { sweepRad: 0.42, widthBodies: 1.6, alpha: 0.26 },
  /** The tornado at the launch: `rings` rising rings `heightBodies` tall over `lifeMs`. */
  tornado: { rings: 9, heightBodies: 2.7, lifeMs: 820, spinPerMs: 0.012 },
  holdMs: 820,
});

const D = DISCO;

/** Points along an ellipse arc (rx, ry round (x, y)) from `a0` over `span` radians. */
function arc(x: number, y: number, rx: number, ry: number, a0: number, span: number, steps = 18): Phaser.Types.Math.Vector2Like[] {
  const out: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i <= steps; i++) { const a = a0 + span * i / steps; out.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry }); }
  return out;
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, v = shot.view;
  if (!contact) return;
  const h = contact.at.h, ground = contact.at.y, mid = (shot.caster.x + contact.at.x) / 2;
  const on = over(contact.ageMs, D.floor.inMs) * fade, spike = markOf(shot, "spike"), finale = markOf(shot, "down");
  const flashAll = spike ? Math.exp(-spike.ageMs / 180) : 0;
  // The floor: its tiles under the feet line, a new pattern each beat and each blow.
  const F = D.floor, tw = h * F.tileBodies, depth = h * F.depthBodies, half = v.width * F.views / 2;
  const phase = Math.floor(shot.ms / F.beatMs) + shot.marks.length * 7, top = ground - depth * 0.45;
  const cols = Math.ceil(half * 2 / tw);
  for (let row = 0; row < F.rows; row++) {
    const rh = depth / F.rows, y = top + row * rh;
    for (let i = 0; i < cols; i++) {
      const x = mid - half + i * tw, centre = 1 - Math.abs((x + tw / 2 - mid) / half);
      c.under.fillStyle(C.tileDark, 0.92 * on).fillRect(x, y, tw - 1.5 * shot.perPx, rh - 1.5 * shot.perPx);
      c.under.lineStyle(1.2 * shot.perPx, C.tileEdge, 0.9 * on * (0.5 + 0.5 * centre)).strokeRect(x + shot.perPx, y + shot.perPx, tw - 3.5 * shot.perPx, rh - 3.5 * shot.perPx);
      const lit = jitter(i * 5 + row * 3, phase) > 1 - F.lit || flashAll > 0.2;
      if (!lit) continue;
      const colour = TILE_COLOURS[(i + row + phase) % TILE_COLOURS.length]!;
      c.under.fillStyle(colour, (0.75 + 0.25 * flashAll) * on * (0.4 + 0.6 * centre)).fillRect(x + tw * 0.08, y + rh * 0.12, tw * 0.84 - 1.5 * shot.perPx, rh * 0.76);
      c.light.glow(x + tw / 2, y + rh / 2, tw * 1.5, colour, 0.18 * on * centre);
    }
  }
  c.bodies("both");
  // The spotlights: three from the top, sweeping — they meet on him for the finale.
  const S = D.spots, gather = finale ? easeOutCubic(over(finale.ageMs, 360)) : 0;
  const origins = [[v.x + v.width * 0.12, v.y], [v.x + v.width * 0.88, v.y], [mid, v.y]] as const;
  origins.forEach(([ox, oy], i) => {
    const sweep = Math.PI / 2 + S.sweepRad * Math.sin(shot.ms * 0.0021 + i * 2.1) + (i === 0 ? -0.3 : i === 1 ? 0.3 : 0);
    const aim = Math.atan2(shot.caster.y - h * 0.5 - oy, shot.caster.x - ox), angle = sweep + (aim - sweep) * gather;
    const reach = (ground - oy) / Math.max(0.3, Math.sin(angle)) * 1.1;
    c.backLight.cone(ox, oy, angle, reach, h * S.widthBodies * (1 - 0.4 * gather), TILE_COLOURS[i]!, S.alpha * on * (1 + gather));
  });
  // The mirror ball: drops in at the contact, its facets twinkling, its reflections wheeling round the stage.
  const B = D.ball, drop = easeOutBack(over(contact.ageMs, B.dropMs)), r = h * B.radiusBodies;
  // Over his own side of the stage (clear of the HUD's clock at the top middle): he is the one the ball turns for.
  const bx = v.x + v.width * (shot.side > 0 ? B.acrossViews : 1 - B.acrossViews), by = v.y - r * 2 + (v.height * B.atViews + r * 2) * drop;
  c.paint.lineStyle(1.6 * shot.perPx, C.ballLine, on).lineBetween(bx, v.y - 4, bx, by - r);
  c.paint.fillStyle(C.ballShade, on).fillCircle(bx, by, r);
  const turn = shot.ms * 0.0009;
  for (let row = 0; row < B.facets; row++) {
    const lat = -Math.PI / 2 + (row + 0.5) * Math.PI / B.facets, ry = Math.sin(lat) * r, rx = Math.cos(lat) * r, cell = Math.PI * r / B.facets;
    for (let col = 0; col < B.facets * 2; col++) {
      const lon = (col / (B.facets * 2)) * Math.PI * 2 + turn, front = Math.cos(lon);
      if (front <= 0.05) continue;
      const x = bx + Math.sin(lon) * rx, shine = jitter(row * 31 + col, Math.floor(shot.ms / 90));
      c.paint.fillStyle(shine > 0.82 ? PALETTE.white : C.ball, on * (0.45 + 0.55 * front)).fillRect(x - cell * 0.42 * front, by + ry - cell * 0.42,
        cell * 0.84 * front, cell * 0.84);
      if (shine > 0.93) c.light.flare(x, by + ry, r * 0.5, PALETTE.white, on * front);
    }
  }
  c.light.glow(bx, by, r * (3 + 3 * gather), C.magenta, (0.3 + 0.5 * gather) * on);
  for (let i = 0; i < B.specks; i++) {
    const a = jitter(i, 4) * Math.PI * 2 + shot.ms * B.speckSpin * (0.6 + 0.8 * jitter(i, 5)), reach = v.width * (0.15 + 0.5 * jitter(i, 6));
    const x = bx + Math.cos(a) * reach, y = by + Math.abs(Math.sin(a)) * reach * 0.8;
    c.light.glow(x, y, h * 0.05, i % 3 === 0 ? C.magenta : PALETTE.white, 0.7 * on * (0.5 + 0.5 * Math.sin(shot.ms * 0.01 + i)));
  }
  const launch = markOf(shot, "launch");
  if (launch) {
    const T = D.tornado, k = over(launch.ageMs, T.lifeMs), x = launch.at.x;
    for (let i = 0; i < T.rings; i++) {
      const t = i / (T.rings - 1), y = ground - h * T.heightBodies * t * easeOutCubic(Math.min(1, k * 1.6)), rx = h * (0.22 + 0.45 * t), ry = rx * 0.22;
      const alpha = (1 - easeInCubic(k)) * fade * (0.5 + 0.5 * t);
      const spin = launch.ageMs * T.spinPerMs * (1.3 - t * 0.5) + i * 0.7;
      c.front.lineStyle(h * 0.05 * (1 - 0.5 * t), C.magenta, alpha * 0.55).strokePoints(arc(x, y, rx, ry, spin, Math.PI * 1.25), false);
      c.front.lineStyle(h * 0.018, PALETTE.white, alpha * 0.8).strokePoints(arc(x, y, rx, ry, spin + 0.4, Math.PI * 0.6, 10), false);
    }
    c.light.ray(x, ground, -Math.PI / 2, h * T.heightBodies * 1.2, h * 0.3, C.magenta, 0.6 * bell(k) * fade);
    c.cue("tornado", "shake", 8);
  }
  for (const mark of marksOf(shot, "air")) {
    const k = over(mark.ageMs, 260);
    if (k >= 1) continue;
    const colour = mark.nth % 2 === 0 ? C.magenta : PALETTE.hotGold, at = mark.at, cy = at.y - h * 0.55;
    c.light.flare(at.x, cy, h * (0.55 + 0.4 * (1 - k)), colour, (1 - k) * fade, jitter(mark.nth, 9) * Math.PI);
    c.light.ring(at.x, cy, h * (0.2 + 0.5 * easeOutCubic(k)), colour, 0.7 * (1 - k) * fade, 0.45, mark.nth * 0.6);
  }
  // The spike: a corkscrew of light down onto him, a ring along the floor.
  if (spike) {
    const k = over(spike.ageMs, 420), x = spike.at.x;
    c.light.ray(x, spike.at.y - h * 2.6, Math.PI / 2, h * 2.8, h * 0.22, C.magenta, (1 - k) * fade);
    c.light.ring(x, ground, h * (0.3 + 1.6 * easeOutCubic(k)), C.magenta, (1 - k) * fade, 0.24);
    c.light.ring(x, ground, h * (0.2 + 1.1 * easeOutCubic(k)), PALETTE.hotGold, (1 - k) * fade, 0.24);
    c.cue("spike", "shake", 10);
  }
  // The finale: the spotlights on him, the ball flaring, sparkles falling.
  if (finale) {
    const k = over(finale.ageMs, 900);
    c.light.flare(bx, by, r * 6 * bell(Math.min(1, k * 2)), PALETTE.white, fade);
    for (let i = 0; i < 26; i++) {
      const fall = over(finale.ageMs - jitter(i, 12) * 300, 1100);
      if (fall <= 0 || fall >= 1) continue;
      const x = mid + (jitter(i, 13) - 0.5) * v.width * 0.8, y = v.y + v.height * 0.9 * fall;
      c.light.flare(x, y, h * 0.16, TILE_COLOURS[i % TILE_COLOURS.length]!, (1 - fall) * fade, fall * 6 + i);
    }
    c.cue("finale", "punch", 1.02);
  }
}

/** Reduced motion: the floor lit still under them. */
function drawReduced(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, mid = (shot.caster.x + contact.at.x) / 2, w = shot.view.width * 0.7;
  c.under.fillStyle(C.magenta, 0.35 * shot.fade).fillRect(mid - w / 2, contact.at.y - h * 0.08, w, h * 0.2);
  c.bodies("both");
}

export const DISCO_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.stamp,
  holdMs: D.holdMs,
  skyInMs: 300,
  draw,
  drawReduced,
  // He dances through the air blows (his string), corkscrews down on the spike (his slam), and stands for the finale.
  casterClip: shot => {
    const launch = markOf(shot, "launch"), spike = markOf(shot, "spike");
    if (spike && !markOf(shot, "down")) return { clip: "slam", ms: spike.ageMs + 200, loop: false };
    if (launch && !spike) return { clip: "combo", ms: launch.ageMs, loop: true };
    return null;
  },
});
