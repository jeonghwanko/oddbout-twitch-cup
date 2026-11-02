import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { bell, curve, jitter, markOf, marksOf, over, petalPoints, ribbon } from "./AwakeningDraw";

/**
 * 야장사단 유메 「천근추 낙화장」(2026-10-23 — 기획 4.2, 무협 영화의 꽃잎 속 소매 무공): 접촉에 보랏빛 새벽 하늘 아래 꽃잎이 흩날리기 시작한다.
 * 비단 소매가 리본처럼 네 번 휘감았다 풀리고(제자리), 선풍퇴의 꽃잎 회오리가 그를 띄우고, 공중의 소매 채찍 셋(그녀의 공중 잔상), 천근추 —
 * 위에서 꽃잎 기둥이 수직으로 떨어져 꽂는다(내려꽂기). 마지막은 누운 이마에 작은 딱밤 하나 — 손가락 끝 섬광 뒤 꽃잎 고리가 크게 터진다.
 */
const C = AWAKENING_COLORS.blossom;

export const BLOSSOM = Object.freeze({
  /** The falling petals: `count` over the view from the contact, `fallViewsPerSec`, `sizeBodies` long. */
  petals: { count: 42, fallViewsPerSec: 0.16, sizeBodies: 0.07 },
  /** A sleeve: a silk ribbon `widthBodies` wide, unfurled over `drawMs`, gone over `outMs`. */
  sleeve: { widthBodies: 0.11, drawMs: 90, outMs: 230 },
  /** The whirlwind at the launch: `count` petals on a rising helix `heightBodies` tall over `lifeMs`. */
  whirl: { count: 28, heightBodies: 2.6, lifeMs: 700 },
  /** The drop: a column of petals `fallMs` (fight ms) before the spike. */
  drop: { fallMs: 220, count: 22 },
  /** The flick: its spark, then the ring of petals `ringBodies` out over `ringMs`. */
  flick: { ringBodies: 1.6, ringMs: 620, count: 26, wordSize: 0.07 },
  holdMs: 800,
});

const Y = BLOSSOM;


function petal(c: CityFightAwakeningCanvas, x: number, y: number, size: number, angle: number, alpha: number): void {
  if (!(alpha > 0.01)) return;
  const shape = petalPoints(x, y, size, size * 0.62, angle);
  c.paint.fillStyle(C.petal, alpha).fillPoints(shape, true);
  c.paint.fillStyle(C.petalLight, 0.7 * alpha).fillPoints(petalPoints(x, y, size * 0.6, size * 0.3, angle), true);
}

/** A silk sleeve from (ax, ay) curving through (bx, by) to (cx, cy), unfurled `k`, fading `out`. */
function sleeve(c: CityFightAwakeningCanvas, h: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, k: number, out: number,
  fade: number): void {
  const points = curve(ax, ay, bx, by, cx, cy, easeOutCubic(k), 20), w = h * Y.sleeve.widthBodies, alpha = (1 - easeInCubic(out)) * fade;
  ribbon(c.paint, points, t => w * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.15))), C.silk, 0.9 * alpha);
  ribbon(c.paint, points, t => w * 0.35 * Math.sin(Math.PI * t), C.silkLight, 0.85 * alpha);
  const tip = points[points.length - 1]!;
  c.light.flare(tip.x, tip.y, h * 0.35, C.petal, alpha * (1 - k * 0.5));
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, v = shot.view, side = shot.side;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, caster = shot.caster;
  // The petals drifting down over the stage from the contact.
  const P = Y.petals, on = over(contact.ageMs, 300) * fade;
  for (let i = 0; i < P.count; i++) {
    const fall = (contact.ageMs / 1000 * P.fallViewsPerSec * (0.7 + 0.6 * jitter(i, 2)) + jitter(i, 3)) % 1;
    const x = v.x + v.width * ((jitter(i, 4) + 0.08 * Math.sin(contact.ageMs * 0.002 + i)) % 1), y = v.y + v.height * fall;
    petal(c, x, y, h * P.sizeBodies * (0.7 + 0.6 * jitter(i, 5)), contact.ageMs * 0.003 * (jitter(i, 6) - 0.5) * 4 + i, 0.75 * on);
  }
  // The sleeves on him standing: four silk ribbons lashing, each curving the other way.
  for (const mark of marksOf(shot, "hold")) {
    const k = over(mark.ageMs, Y.sleeve.drawMs), out = over(mark.ageMs - Y.sleeve.drawMs, Y.sleeve.outMs);
    if (out >= 1) continue;
    const up = mark.nth % 2 === 0 ? -1 : 1, hy = caster.y - h * 0.62, ty = mark.at.y - h * (0.4 + 0.12 * mark.nth % 3);
    sleeve(c, h, caster.x + side * h * 0.2, hy, (caster.x + mark.at.x) / 2, hy + up * h * 0.6, mark.at.x + side * h * 0.35, ty, k, out, fade);
    c.light.flare(mark.at.x, ty, h * 0.6 * Math.exp(-mark.ageMs / 80), PALETTE.white, fade);
  }
  // The whirlwind kick: petals on a rising helix round him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const W = Y.whirl, k = over(launch.ageMs, W.lifeMs);
    for (let i = 0; i < W.count; i++) {
      const t = i / W.count, rise = easeOutCubic(Math.min(1, k * 1.5)) * t, a = launch.ageMs * 0.012 + t * Math.PI * 6;
      const x = launch.at.x + Math.cos(a) * h * (0.25 + 0.3 * t), y = launch.at.y - h * W.heightBodies * rise + Math.sin(a) * h * 0.08;
      petal(c, x, y, h * 0.09, a + Math.PI / 2, (1 - easeInCubic(k)) * fade);
    }
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * W.heightBodies, h * 0.28, C.silk, 0.5 * bell(k) * fade);
    c.cue("whirl", "shake", 7);
  }
  // The air lashes: her afterimage beside him up there, a silk arc through him.
  for (const mark of marksOf(shot, "air")) {
    const k = over(mark.ageMs, Y.sleeve.drawMs), out = over(mark.ageMs - Y.sleeve.drawMs, Y.sleeve.outMs);
    if (out >= 1) continue;
    const y = mark.at.y - h * 0.5, from = mark.at.x - side * h * 0.9;
    c.figure("caster", "airCombo", mark.ageMs + mark.nth * 140, true, from, mark.at.y + h * 0.15, 0.55 * (1 - out) * fade,
      { tint: C.silkLight, add: true, layer: "front" });
    sleeve(c, h, from, y - h * 0.3, mark.at.x, y - h * (mark.nth % 2 === 0 ? 0.9 : -0.5), mark.at.x + side * h * 0.7, y + h * 0.1, k, out, fade);
  }
  // The thousand-pound drop: a column of petals falling onto him from above, then a ring of petals along the ground.
  const follow = shot.follow, dropAt = follow?.beats.find(beat => beat.kind === "spike")?.atMs ?? null, spike = markOf(shot, "spike");
  if (dropAt !== null && shot.progress !== null && !spike && shot.progress >= dropAt - Y.drop.fallMs) {
    const k = over(shot.progress - (dropAt - Y.drop.fallMs), Y.drop.fallMs), target = shot.target;
    for (let i = 0; i < Y.drop.count; i++) {
      const y = v.y + (target.y - v.y) * Math.min(1, easeInCubic(k) + jitter(i, 8) * 0.25 - 0.1);
      petal(c, target.x + (jitter(i, 9) - 0.5) * h * 0.4, y, h * 0.1, Math.PI / 2 + (jitter(i, 10) - 0.5), fade);
    }
    c.light.ray(target.x, v.y, Math.PI / 2, (target.y - v.y) * easeInCubic(k), h * 0.3, C.silk, 0.6 * fade);
  }
  if (spike) {
    const k = over(spike.ageMs, 520);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, d = h * 1.4 * easeOutCubic(k);
      petal(c, spike.at.x + Math.cos(a) * d, spike.at.y + Math.sin(a) * d * 0.25, h * 0.1, a, (1 - k) * fade);
    }
    c.light.ring(spike.at.x, spike.at.y, h * (0.3 + 1.4 * easeOutCubic(k)), C.silk, (1 - k) * fade, 0.25);
    c.cue("drop", "shake", 11);
  }
  // The flick: a tiny spark on his brow, "딱!", then the ring of petals bursting out of it.
  const flick = markOf(shot, "down");
  if (flick) {
    const F = Y.flick, x = flick.at.x - side * h * 0.35, y = flick.at.y - h * 0.12, k = over(flick.ageMs - 60, F.ringMs);
    c.light.flare(x, y, h * 0.35 * Math.exp(-flick.ageMs / 90), PALETTE.white, fade);
    for (let i = 0; i < F.count; i++) {
      const a = jitter(i, 12) * Math.PI * 2, d = h * F.ringBodies * easeOutCubic(k) * (0.6 + 0.4 * jitter(i, 13));
      if (k > 0) petal(c, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.55, h * 0.1, a, (1 - easeInCubic(k)) * fade);
    }
    const s = over(flick.ageMs, 90), vh = v.height / shot.perPx;
    c.word(0, x + side * h * 0.1, y - h * 0.45, vh * F.wordSize, { scale: 1.8 - 0.8 * easeOutBack(s), alpha: easeOutCubic(s) * (1 - over(flick.ageMs - 520, 180)) * fade,
      color: C.petalLight, stroke: C.ink });
    c.cue("flick", "punch", 1.02);
  }
}

/** Reduced motion: still petals round him. */
function drawReduced(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact;
  if (!contact || contact.blocked) return;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    petal(c, contact.at.x + Math.cos(a) * contact.at.h * 0.9, contact.at.y - contact.at.h * 0.5 + Math.sin(a) * contact.at.h * 0.6, contact.at.h * 0.1, a, shot.fade);
  }
}

export const BLOSSOM_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.stamp,
  holdMs: Y.holdMs,
  skyInMs: 320,
  words: locale => [t(locale, "fight.superStage.flick")],
  draw,
  drawReduced,
  // Her sleeves lash (her string) on him standing; she stands while her afterimage flies.
  casterClip: shot => {
    const launch = markOf(shot, "launch");
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "combo", ms: shot.contact.ageMs, loop: true } : null;
  },
});
