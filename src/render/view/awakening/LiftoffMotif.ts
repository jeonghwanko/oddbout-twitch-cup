import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.liftoff;

export const LIFTOFF = Object.freeze({
  /** The launch: its plume `lengthBodies` under him, smoke puffs rolling out `smokeBodies`, over `lifeMs`. */
  launch: { lengthBodies: 1.6, smokeBodies: 1.9, puffs: 14, lifeMs: 900 },
  /** The satellites: `count` in a line across the sky (`fromViews` → `toViews` of the view), drifting `driftViewsPerSec`. */
  train: { count: 12, y: 0.24, slope: -0.05, spacingViews: 0.05, driftViewsPerSec: 0.06 },
  /** The booster: `widthBodies` × `heightBodies`, seen falling `fallMs` (fight ms) before the spike. */
  booster: { widthBodies: 0.26, heightBodies: 1.5, fallMs: 300 },
  /** The tower: `heightBodies` tall, `gapBodies` past him; its arms closing over `closeMs`. */
  tower: { heightBodies: 2.2, gapBodies: 0.95, widthBodies: 0.3, closeMs: 200, riseMs: 220 },
  stamp: { atMs: 320, size: 0.07, fromScale: 2, stampMs: 120 },
  holdMs: 850,
});

const L = LIFTOFF;

/** A puff of smoke: a soft heap of three grey discs, its sunlit top paler. */
function puff(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha: number): void {
  if (!(alpha > 0.01) || r <= 0) return;
  g.fillStyle(C.smoke, 0.55 * alpha).fillCircle(x, y, r).fillCircle(x - r * 0.55, y + r * 0.2, r * 0.7).fillCircle(x + r * 0.6, y + r * 0.15, r * 0.65);
  g.fillStyle(C.smokeLight, 0.5 * alpha).fillCircle(x - r * 0.15, y - r * 0.3, r * 0.55);
}

/** The booster, nose up, its bottom at (x, y), `w` × `hh`: a white body shaded on one side, its interstage band, grid fins, engine bells. */
function booster(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, hh: number, alpha: number): void {
  const top = y - hh, r = w / 2;
  g.fillStyle(C.hull, alpha).fillRect(x - r, top + r * 0.5, w, hh - r * 0.5).fillEllipse(x, top + r * 0.5, w, r);
  g.fillStyle(C.hullShade, alpha).fillRect(x + r * 0.35, top + r * 0.5, r * 0.65, hh - r * 0.5);
  for (let i = 1; i < 6; i++) g.fillStyle(C.hullShade, 0.6 * alpha).fillRect(x - r, top + hh * i / 6, w, Math.max(1, w * 0.03));
  g.fillStyle(C.band, alpha).fillRect(x - r, top + hh * 0.08, w, hh * 0.07);
  // The grid fins, folded out at its top.
  for (const side of [-1, 1]) {
    const fx = x + side * r * 1.05, fy = top + hh * 0.12;
    g.fillStyle(C.band, alpha).fillRect(fx - (side < 0 ? r * 0.55 : 0), fy - r * 0.25, r * 0.55, r * 0.5);
    g.lineStyle(Math.max(1, w * 0.03), C.hullShade, alpha).strokeRect(fx - (side < 0 ? r * 0.55 : 0), fy - r * 0.25, r * 0.55, r * 0.5);
  }
  // The engines under it.
  for (const u of [-0.55, 0, 0.55]) g.fillStyle(C.band, alpha).fillTriangle(x + u * r - r * 0.25, y, x + u * r + r * 0.25, y, x + u * r, y - r * 0.4);
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view;
  if (!contact) return;
  const h = contact.at.h, ground = contact.at.y;
  if (contact.blocked) { c.light.ring(contact.at.x, ground, h * (0.3 + 1.2 * over(contact.ageMs, 400)), C.flame, (1 - over(contact.ageMs, 400)) * fade, 0.3); return; }
  // The stomp's three-point landing ring.
  const sk = over(contact.ageMs, 420);
  c.light.ring(shot.caster.x, shot.caster.y, h * (0.3 + 1.4 * easeOutCubic(sk)), C.flame, (1 - sk) * fade, 0.28);
  // The launch: a plume under him, smoke rolling out along the ground.
  const launch = markOf(shot, "launch");
  if (launch) {
    const Lc = L.launch, k = over(launch.ageMs, Lc.lifeMs), x = launch.at.x, burn = 1 - easeInCubic(Math.min(1, k * 1.6));
    for (let i = 0; i < Lc.puffs; i++) {
      const dir = i % 2 === 0 ? 1 : -1, d = h * Lc.smokeBodies * easeOutCubic(k) * (0.3 + 0.7 * jitter(i, 3));
      puff(c.under, x + dir * d, ground - h * 0.08 - h * 0.3 * jitter(i, 4) * k, h * (0.1 + 0.14 * k) * (0.7 + 0.5 * jitter(i, 5)), (1 - easeInCubic(k)) * fade);
    }
    c.bodies("both");
    const target = shot.target;
    c.light.cone(target.x, target.y, Math.PI / 2, h * Lc.lengthBodies * (0.6 + 0.4 * burn), h * 0.7, C.flame, burn * fade);
    c.light.ray(target.x, target.y, Math.PI / 2, h * Lc.lengthBodies * 0.8, h * 0.12, C.flameCore, burn * fade);
    c.light.glow(x, ground, h * 2.4, C.flame, 0.4 * burn * fade, 0.3);
    c.cue("liftoff", "shake", 9);
  }
  // The satellites crossing the sky; each air blow is one of them beaming down on him.
  const T = L.train, on = launch ? over(launch.ageMs, 300) * fade : 0;
  const train: { x: number; y: number }[] = [];
  for (let i = 0; i < T.count; i++) {
    const u = (0.1 + i * T.spacingViews + shot.ms / 1000 * T.driftViewsPerSec) % 1.1;
    const x = v.x + v.width * u, y = v.y + v.height * (T.y + T.slope * u);
    train.push({ x, y });
    c.light.glow(x, y, h * 0.09, PALETTE.white, 0.9 * on);
  }
  for (const mark of marksOf(shot, "air")) {
    const k = over(mark.ageMs, 180);
    if (k >= 1) continue;
    const sat = train[(3 + mark.nth * 2) % train.length]!, tx = mark.at.x, ty = mark.at.y - h * 0.5;
    const angle = Math.atan2(ty - sat.y, tx - sat.x), length = Math.hypot(tx - sat.x, ty - sat.y);
    c.light.ray(sat.x, sat.y, angle, length * 1.05, h * 0.07, C.beam, (1 - k) * fade);
    c.light.flare(sat.x, sat.y, h * 0.4, C.beam, (1 - k) * fade);
    c.light.flare(tx, ty, h * 0.7 * (1 - k), C.beam, (1 - k) * fade, k * 2);
  }
  // The booster coming down on him, its engines burning upward, then its blast.
  const follow = shot.follow, spikeAt = follow?.beats.find(beat => beat.kind === "spike")?.atMs ?? null, spike = markOf(shot, "spike");
  const B = L.booster, bw = h * B.widthBodies, bh = h * B.heightBodies, target = shot.target;
  if (spikeAt !== null && shot.progress !== null && !spike && shot.progress >= spikeAt - B.fallMs) {
    const k = easeInCubic(over(shot.progress - (spikeAt - B.fallMs), B.fallMs)), y = v.y - h * 0.2 + (target.y - h * 0.4 - v.y + h * 0.2) * k;
    booster(c.paint, target.x, y + bh, bw, bh, fade);
    c.light.cone(target.x, y + bh, Math.PI / 2, h * 0.9, h * 0.6, C.flame, fade);
  }
  if (spike) {
    const k = over(spike.ageMs, 520);
    if (k < 0.35) booster(c.paint, spike.at.x, spike.at.y - h * 0.1, bw, bh, (1 - k / 0.35) * fade);
    c.light.flare(spike.at.x, spike.at.y - h * 0.3, h * 2.6 * (1 - 0.5 * k), C.flameCore, (1 - k) * fade);
    c.light.ring(spike.at.x, spike.at.y, h * (0.3 + 2 * easeOutCubic(k)), C.flame, (1 - k) * fade, 0.3);
    for (let i = 0; i < 8; i++) puff(c.paint, spike.at.x + (i - 3.5) * h * 0.32 * easeOutCubic(k), spike.at.y - h * 0.08, h * 0.12 * (0.6 + k), (1 - k) * fade);
    c.cue("booster", "shake", 13);
  }
  // The tower's arms closing on him lying there — "인수 완료".
  const down = markOf(shot, "down");
  if (down) {
    const W = L.tower, rise = easeOutBack(over(down.ageMs, W.riseMs)), close = easeOutCubic(over(down.ageMs - W.riseMs * 0.5, W.closeMs));
    const tw = h * W.widthBodies, base = ground + h * 0.05, out = over(down.ageMs - 650, 200), alpha = (1 - out) * fade, th = h * W.heightBodies * rise;
    // Beside him on his far side, kept inside the view.
    const tx = Math.min(v.right - tw, Math.max(v.x + tw, down.at.x + side * h * W.gapBodies));
    c.paint.fillStyle(C.tower, alpha).fillRect(tx - tw / 2, base - th, tw, th);
    c.paint.lineStyle(Math.max(1, tw * 0.08), C.towerLine, alpha);
    for (let y = base - th; y < base - tw; y += tw) {
      c.paint.lineBetween(tx - tw / 2, y, tx + tw / 2, y + tw);
      c.paint.lineBetween(tx + tw / 2, y, tx - tw / 2, y + tw);
    }
    // Two arms reaching over him from the tower, closing.
    const reach = (Math.abs(tx - down.at.x) + h * 0.5) * (0.4 + 0.6 * close);
    for (const [dy, open] of [[-0.42, 1], [-0.18, -1]] as const) {
      const y = ground + h * dy + open * (1 - close) * h * 0.25;
      c.paint.fillStyle(C.tower, alpha).fillRect(side > 0 ? tx - reach : tx, y - h * 0.035, reach, h * 0.07);
    }
    c.light.flare(down.at.x, ground - h * 0.3, h * 1.1 * Math.exp(-Math.max(0, down.ageMs - W.riseMs * 0.5 - W.closeMs) / 140), C.flameCore, alpha);
    const S = L.stamp, s = over(down.ageMs - S.atMs, S.stampMs), vh = v.height / shot.perPx;
    if (down.ageMs >= S.atMs) c.word(0, down.at.x - side * h * 0.35, ground - h * 1.2, vh * S.size, { scale: S.fromScale + (1 - S.fromScale) * easeOutBack(s),
      alpha: easeOutCubic(s) * alpha, color: PALETTE.white, stroke: C.towerLine });
    c.cue("catch", "shake", 8);
  }
}

/** Reduced motion: the stars only (the sky). */
function drawReduced(): void {}

export const LIFTOFF_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.flameCore,
  holdMs: L.holdMs,
  skyInMs: 360,
  words: locale => [t(locale, "fight.superStage.acquired")],
  draw,
  drawReduced,
  // He calls it in on his phone (his summon) while the satellites strike.
  casterClip: shot => {
    const launch = markOf(shot, "launch"), spike = markOf(shot, "spike");
    return launch && !spike ? { clip: "summon", ms: launch.ageMs, loop: true } : null;
  },
});
