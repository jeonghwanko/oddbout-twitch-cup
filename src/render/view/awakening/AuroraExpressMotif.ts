import type Phaser from "phaser";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over, ribbon } from "./AwakeningDraw";


const C = AWAKENING_COLORS.auroraExpress;

export const AURORA_EXPRESS = Object.freeze({
  /** The aurora: `curtains` ribbons across the top of the view, waving every `waveMs`. */
  aurora: { curtains: 3, topViews: 0.2, depthViews: 0.18, waveMs: 2600 },
  /** The ice sheet: `widthViews` × `depthBodies` round their feet, spread over `inMs` from the super's start. */
  ice: { widthViews: 1.1, depthBodies: 0.22, inMs: 260, shines: 5 },
  /** The pillar: `heightBodies` tall, `widthBodies` wide, grown over `growMs`, gone over `lifeMs`. */
  pillar: { heightBodies: 1.6, widthBodies: 0.42, growMs: 120, lifeMs: 620 },
  /** The ice block round him lying there: grown over `growMs`, cracked at `crackMs`, shattered at `breakMs`. */
  block: { growMs: 140, crackMs: 320, breakMs: 520, shards: 12 },
  holdMs: 820,
});

const A = AURORA_EXPRESS;

/** A six-armed snowflake of light at (x, y), `r` across. */
function flake(c: CityFightAwakeningCanvas, x: number, y: number, r: number, alpha: number, turn: number): void {
  for (let i = 0; i < 3; i++) c.light.streak(x, y, turn + i * Math.PI / 3, r * 2, r * 0.12, C.ice, alpha, PALETTE.white);
}

/** A hexagonal ice column, its base on (x, y). */
function column(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, hh: number, alpha: number): void {
  const top = y - hh, cap = w * 0.25;
  g.fillStyle(C.iceDeep, 0.75 * alpha).fillPoints([{ x: x - w / 2, y }, { x: x - w / 2, y: top + cap }, { x, y: top }, { x: x + w / 2, y: top + cap }, { x: x + w / 2, y }], true);
  g.fillStyle(C.ice, 0.85 * alpha).fillPoints([{ x: x - w * 0.15, y }, { x: x - w * 0.15, y: top + cap * 0.6 }, { x, y: top }, { x: x + w / 2, y: top + cap }, { x: x + w / 2, y }], true);
  g.fillStyle(PALETTE.white, 0.7 * alpha).fillRect(x + w * 0.05, top + cap, w * 0.08, hh - cap * 1.2);
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const fade = shot.fade, v = shot.view, side = shot.side, caster = shot.caster, contact = shot.contact;
  const h = caster.h, ground = contact?.at.y ?? caster.y, mid = (caster.x + shot.target.x) / 2, on = over(shot.ms, A.ice.inMs) * fade;
  // The aurora's curtains, waving across the top of the view.
  const W = A.aurora;
  for (let i = 0; i < W.curtains; i++) {
    const points: Phaser.Types.Math.Vector2Like[] = [];
    for (let s = 0; s <= 20; s++) {
      const u = s / 20, wave = Math.sin(u * 5 + shot.ms / W.waveMs * Math.PI * 2 + i * 1.7) * v.height * 0.035;
      points.push({ x: v.x + v.width * u, y: v.y + v.height * (W.topViews + i * 0.06) + wave });
    }
    ribbon(c.back, points, t => v.height * W.depthViews * (0.4 + 0.6 * Math.sin(Math.PI * t)), i % 2 === 0 ? C.aurora : C.auroraBlue, 0.22 * on);
  }
  // The ice sheet under them, its shine sliding.
  const I = A.ice, iw = v.width * I.widthViews * easeOutCubic(over(shot.ms, I.inMs)), depth = h * I.depthBodies;
  c.under.fillStyle(C.iceDeep, 0.5 * on).fillEllipse(mid, ground, iw, depth);
  c.under.fillStyle(PALETTE.oddboutIce, 0.45 * on).fillEllipse(mid, ground - depth * 0.08, iw * 0.92, depth * 0.7);
  for (let i = 0; i < I.shines; i++) {
    const u = ((shot.ms / 1800 + i / I.shines) % 1 - 0.5) * iw * 0.85;
    c.light.streak(mid + u, ground - depth * 0.05, -0.1, depth * 1.6, depth * 0.08, PALETTE.oddboutIceShine, 0.5 * on);
  }
  c.bodies("both");
  if (!contact || contact.blocked) return;
  // The pillar out of the ice under him — behind his body (2026-10-23 arena audit, b07 #1444–1454: painted over him it hid him).
  const launch = markOf(shot, "launch");
  if (launch) {
    const P = A.pillar, grow = easeOutBack(over(launch.ageMs, P.growMs)), out = over(launch.ageMs - P.growMs, P.lifeMs);
    if (out < 1) column(c.under, launch.at.x, ground + depth * 0.2, h * P.widthBodies, h * P.heightBodies * grow, (1 - easeInCubic(out)) * fade);
    c.light.glow(launch.at.x, ground - h * 0.5, h * 2, C.ice, 0.4 * (1 - out) * fade);
    c.cue("pillar", "shake", 8);
  }
  // The shards: ice flying in at him up there, a snowflake at each.
  for (const mark of marksOf(shot, "air")) {
    const k = over(mark.ageMs, 200);
    if (k >= 1) continue;
    const a = (jitter(mark.nth, 120) - 0.5) * 1.6 + (side > 0 ? Math.PI : 0), tx = mark.at.x, ty = mark.at.y - h * 0.5;
    c.light.streak(tx + Math.cos(a) * h * 0.6 * (1 - k), ty + Math.sin(a) * h * 0.6 * (1 - k), a, h * 0.9, h * 0.05, C.ice, (1 - k) * fade);
    flake(c, tx, ty, h * 0.35 * (1 - 0.5 * k), (1 - k) * fade, mark.nth);
  }
  // The belly flop: his afterimage sliding down out of the sky onto him, then the splash of ice.
  const follow = shot.follow, spikeAt = follow?.beats.find(beat => beat.kind === "spike")?.atMs ?? null, spike = markOf(shot, "spike");
  if (spikeAt !== null && shot.progress !== null && !spike && shot.progress >= spikeAt - 240) {
    const k = easeInCubic(over(shot.progress - (spikeAt - 240), 240)), target = shot.target;
    c.figure("caster", "skill", shot.ms, true, target.x - side * h * 0.8 * (1 - k), v.y + (target.y - h * 0.3 - v.y) * k, 0.8 * fade,
      { tint: C.ice, add: true, layer: "front", scale: 1.1 });
  }
  if (spike) {
    const k = over(spike.ageMs, 480);
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * jitter(i, 121), d = h * 1.4 * easeOutCubic(k);
      c.paint.fillStyle(C.ice, (1 - k) * fade).fillTriangle(spike.at.x + Math.cos(a) * d, ground + Math.sin(a) * d * 0.8, spike.at.x + Math.cos(a) * d + h * 0.06,
        ground + Math.sin(a) * d * 0.8 - h * 0.1, spike.at.x + Math.cos(a) * d + h * 0.1, ground + Math.sin(a) * d * 0.8);
    }
    c.light.ring(spike.at.x, ground, h * (0.3 + 1.6 * easeOutCubic(k)), C.ice, (1 - k) * fade, 0.25);
    c.cue("flop", "shake", 12);
  }
  // The ice block round him lying there: it closes, cracks, breaks.
  const down = markOf(shot, "down");
  if (down) {
    const B = A.block, grow = easeOutBack(over(down.ageMs, B.growMs)), broken = down.ageMs >= B.breakMs, x = down.at.x, bw = h * 1.3 * grow, bh = h * 0.55 * grow;
    if (!broken) {
      c.paint.fillStyle(C.ice, 0.45 * fade).fillRect(x - bw / 2, ground - bh, bw, bh);
      c.paint.lineStyle(2 * shot.perPx, PALETTE.white, 0.8 * fade).strokeRect(x - bw / 2, ground - bh, bw, bh);
      if (down.ageMs >= B.crackMs) {
        const crack = over(down.ageMs - B.crackMs, B.breakMs - B.crackMs);
        for (let i = 0; i < 4; i++) {
          const a = jitter(i, 122) * Math.PI * 2;
          c.ink.lineStyle(1.6 * shot.perPx, PALETTE.white, fade).lineBetween(x, ground - bh / 2, x + Math.cos(a) * bw * 0.45 * crack, ground - bh / 2 + Math.sin(a) * bh * 0.45 * crack);
        }
      }
    } else {
      const k = over(down.ageMs - B.breakMs, 500);
      for (let i = 0; i < B.shards; i++) {
        const a = -Math.PI * jitter(i, 123), d = h * 1.2 * easeOutCubic(k), sx = x + Math.cos(a) * d, sy = ground - bh / 2 + Math.sin(a) * d + h * 0.8 * k * k;
        c.paint.fillStyle(C.ice, 0.8 * (1 - k) * fade).fillTriangle(sx, sy, sx + h * 0.1, sy - h * 0.05, sx + h * 0.04, sy + h * 0.09);
      }
      c.light.flare(x, ground - bh / 2, h * 1.6 * Math.exp(-(down.ageMs - B.breakMs) / 140), PALETTE.white, fade);
      c.cue("break", "shake", 8);
    }
  }
}

export const AURORA_EXPRESS_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.ice,
  holdMs: A.holdMs,
  skyInMs: 300,
  draw,
  // He watches it slide (his belly slide) and poses over the broken ice (his victory).
  casterClip: shot => {
    const down = markOf(shot, "down");
    if (down) return { clip: "victory", ms: down.ageMs, loop: true };
    return null;
  },
});
