import type Phaser from "phaser";
import { easeInCubic, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over } from "./AwakeningDraw";

/**
 * 퀵캣 「무지개 혜성」(2026-10-23 — 기획 4.17, 무지개 꼬리를 끌며 8비트 우주를 나는 고양이 밈): 다른 캐릭터와 달리 화면 전체가 픽셀 결이다 —
 * 남색 우주에 네모 픽셀 별이 흐르고 깜빡인다. 띄우기는 계단진 여섯 색 무지개 아치, 공중 박자마다 무지개 띠가 화면을 가로질러 그를 꿰뚫고(띠의
 * 머리에 그녀의 잔상), 픽셀 조각이 튄다. 내려꽂기는 위에서 떨어지는 무지개 혜성, 마무리는 누운 몸 위의 무지개 아치와 픽셀 별 폭발이다.
 * 모든 모양은 픽셀 칸(`pixelPx` 화면 px)에 맞춰 찍는다.
 */
const C = AWAKENING_COLORS.rainbow;

export const RAINBOW = Object.freeze({
  /** One pixel of its world (screen px). */
  pixelPx: 5,
  /** The stars: `count`, drifting `driftPerSec` views a second, twinkling every `twinkleMs`. */
  stars: { count: 34, driftPerSec: 0.12, twinkleMs: 140 },
  /** A band of the rainbow: `bandPx` pixels thick; its wave steps `waveStepPx` pixels every `waveLenPx` pixels, flipping each `waveMs`. */
  band: { bandPx: 3, waveLenPx: 9, waveMs: 120 },
  /** An air blow's sweep: across the view in `sweepMs`, its trail held `trailMs` after. */
  sweep: { sweepMs: 150, trailMs: 260, topViews: 0.3 },
  /** The finale's arch: `radiusBodies` across, grown over `growMs`, held `lifeMs`. */
  arch: { radiusBodies: 1.2, growMs: 260, lifeMs: 820 },
  /**
   * The launch's arch from her to him: grown over `growMs`, held `lifeMs`, gone over `outMs` — behind both bodies (2026-10-23 arena audit,
   * b10 #1237–1257: painted over him it hid the gray cat for 330 ms and more; now under 400 ms in all).
   */
  launchArch: { growMs: 140, lifeMs: 200, outMs: 150 },
  holdMs: 800,
});

const R = RAINBOW;

/** A pixel block at (x, y) on the grid of `p` (world px), `n` pixels square. */
function block(g: Phaser.GameObjects.Graphics, p: number, x: number, y: number, n: number, colour: number, alpha: number): void {
  if (!(alpha > 0.003)) return;
  g.fillStyle(colour, Math.min(1, alpha)).fillRect(Math.round(x / p) * p, Math.round(y / p) * p, p * n, p * n);
}

/** A twinkling pixel star (dot → cross → big cross → dot) at (x, y). */
function star(g: Phaser.GameObjects.Graphics, p: number, x: number, y: number, frame: number, colour: number, alpha: number): void {
  const s = [0, 1, 2, 1][frame % 4]!;
  block(g, p, x, y, 1, colour, alpha);
  for (let k = 1; k <= s; k++) {
    block(g, p, x + k * p, y, 1, colour, alpha); block(g, p, x - k * p, y, 1, colour, alpha);
    block(g, p, x, y + k * p, 1, colour, alpha); block(g, p, x, y - k * p, 1, colour, alpha);
  }
}

/** The rainbow's six bands from x0 to x1 along row y (its middle), waving in steps. */
function rainbowBand(g: Phaser.GameObjects.Graphics, p: number, x0: number, x1: number, y: number, ms: number, alpha: number): void {
  const B = R.band, from = Math.min(x0, x1), to = Math.max(x0, x1), seg = p * B.waveLenPx, flip = Math.floor(ms / B.waveMs) % 2;
  for (let x = Math.floor(from / seg) * seg; x < to; x += seg) {
    const w = Math.min(seg, to - x), up = (Math.floor(x / seg) + flip) % 2 === 0 ? -p : 0;
    C.bands.forEach((colour, i) => {
      const yy = Math.round((y + up + (i - 3) * B.bandPx * p) / p) * p;
      g.fillStyle(colour, Math.min(1, alpha)).fillRect(Math.max(x, from), yy, w - Math.max(0, from - x), B.bandPx * p);
    });
  }
}

/** A stepped arch of the six bands round (x, y), `radius` across, grown `k` of the way from its left foot. */
function arch(g: Phaser.GameObjects.Graphics, p: number, x: number, y: number, radius: number, k: number, alpha: number): void {
  const bandW = R.band.bandPx * p;
  C.bands.forEach((colour, i) => {
    const r = radius - i * bandW, steps = Math.max(8, Math.round(r / p / 1.4));
    for (let s = 0; s <= steps * k; s++) {
      const a = Math.PI + Math.PI * s / steps;
      block(g, p, x + Math.cos(a) * r, y + Math.sin(a) * r, R.band.bandPx, colour, alpha);
    }
  });
}

/** Pixel shards flung out of (x, y) `k` of their way. */
function shards(g: Phaser.GameObjects.Graphics, p: number, x: number, y: number, reach: number, k: number, salt: number, alpha: number): void {
  for (let i = 0; i < 12; i++) {
    const a = jitter(i, salt) * Math.PI * 2, d = reach * easeOutCubic(k) * (0.5 + 0.5 * jitter(i, salt + 1));
    block(g, p, x + Math.cos(a) * d, y + Math.sin(a) * d - reach * 0.3 * k * k, i % 3 === 0 ? 2 : 1,
      i % 4 === 0 ? PALETTE.white : C.bands[i % C.bands.length]!, alpha * (1 - easeInCubic(k)));
  }
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const v = shot.view, p = R.pixelPx * shot.perPx, fade = shot.fade, h = shot.target.h;
  // Its sky's pixel stars from the super's start, drifting and twinkling (behind the bodies).
  const S = R.stars, on = over(shot.ms, 300) * fade;
  for (let i = 0; i < S.count; i++) {
    const drift = (jitter(i, 21) * v.width - shot.ms / 1000 * S.driftPerSec * v.width * (0.5 + jitter(i, 22))) % v.width;
    const x = v.x + (drift + v.width) % v.width, y = v.y + jitter(i, 23) * v.height * 0.8;
    star(c.under, p, x, y, Math.floor(shot.ms / S.twinkleMs) + i, i % 5 === 0 ? C.magenta : PALETTE.white, on * (0.5 + 0.5 * jitter(i, 24)));
  }
  c.bodies("both");
  const contact = shot.contact;
  if (!contact) return;
  // The contact: a burst of pixels on him.
  shards(c.ink, p, contact.at.x, contact.at.y - h * 0.55, h * 0.9, over(contact.ageMs, 420), 3, fade);
  // The launch: the arch from her to him, stepped, behind them.
  const launch = markOf(shot, "launch");
  if (launch) {
    const A = R.launchArch, k = over(launch.ageMs, A.growMs), out = over(launch.ageMs - A.lifeMs, A.outMs);
    const x = (shot.caster.x + launch.at.x) / 2, radius = Math.max(h * R.arch.radiusBodies, Math.abs(launch.at.x - shot.caster.x) / 2);
    if (out < 1) arch(c.under, p, x, launch.at.y, radius, k, (1 - out) * fade);
    c.cue("arch", "shake", 6);
  }
  // The air blows: a band sweeping across the view through him, her afterimage at its head, pixels flying off him.
  for (const mark of marksOf(shot, "air")) {
    const W = R.sweep, k = over(mark.ageMs, W.sweepMs), out = over(mark.ageMs - W.sweepMs, W.trailMs);
    if (out >= 1) continue;
    // At his height, kept under the HUD (he flies high).
    const dir = mark.nth % 2 === 0 ? shot.side : -shot.side, y = Math.max(v.y + v.height * R.sweep.topViews, mark.at.y - h * 0.55);
    const start = dir > 0 ? v.x - v.width * 0.1 : v.right + v.width * 0.1, end = dir > 0 ? v.right + v.width * 0.1 : v.x - v.width * 0.1;
    const head = start + (end - start) * easeOutCubic(k), tail = start + (head - start) * easeInCubic(out);
    rainbowBand(c.paint, p, tail, head, y, mark.ageMs, (1 - out) * fade);
    if (k < 1) c.figure("caster", "skill", mark.ageMs, true, head, y + h * 0.45, 0.85 * fade, { flip: dir < 0, layer: "front" });
    shards(c.ink, p, mark.at.x, mark.at.y - h * 0.55, h * 0.7, over(mark.ageMs, 360), 10 + mark.nth, fade);
  }
  // The spike: a comet of the six bands falling onto him from above.
  const spike = markOf(shot, "spike");
  if (spike) {
    const k = over(spike.ageMs + 120, 220), out = over(spike.ageMs - 100, 300), x = spike.at.x, y = spike.at.y - h * 0.4;
    const fromX = x - shot.side * v.height * 0.5, fromY = v.y - h * 0.2;
    for (let i = 0; i <= 14; i++) {
      const t = i / 14 * k, bx = fromX + (x - fromX) * t, by = fromY + (y - fromY) * t;
      C.bands.forEach((colour, b) => block(c.paint, p, bx + (b - 3) * p * 1.2, by - (b - 3) * p * 1.2, 2, colour, (1 - out) * fade));
    }
    star(c.ink, p, x, y, 2, PALETTE.white, (1 - out) * fade);
    shards(c.ink, p, x, spike.at.y - h * 0.2, h * 1.3, over(spike.ageMs, 500), 40, fade);
    c.cue("spike", "shake", 9);
  }
  // The finale: an arch over him lying there, a burst of pixel stars.
  const finale = markOf(shot, "down");
  if (finale) {
    const k = over(finale.ageMs, R.arch.growMs), out = over(finale.ageMs - R.arch.lifeMs * 0.6, 200);
    // Behind him lying there (its bands cut through his body painted over him).
    arch(c.under, p, finale.at.x, finale.at.y, h * 0.9, k, (1 - out) * fade);
    for (let i = 0; i < 10; i++) {
      const s = over(finale.ageMs - i * 40, 700), a = jitter(i, 50) * Math.PI - Math.PI, d = h * (0.8 + 0.9 * jitter(i, 51)) * easeOutCubic(s);
      if (s > 0 && s < 1) star(c.ink, p, finale.at.x + Math.cos(a) * d, finale.at.y - h * 0.3 + Math.sin(a) * d, Math.floor(finale.ageMs / 90) + i,
        i % 2 === 0 ? PALETTE.white : C.magenta, (1 - s) * fade);
    }
  }
}

/** Reduced motion: the arch over him, still. */
function drawReduced(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact;
  if (!contact || contact.blocked) return;
  arch(c.paint, R.pixelPx * shot.perPx, contact.at.x, contact.at.y, contact.at.h * 0.9, 1, shot.fade);
}

export const RAINBOW_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.stamp,
  holdMs: R.holdMs,
  skyInMs: 240,
  draw,
  drawReduced,
  // She flies (her skill) through the blows and poses (her victory) over him lying there.
  casterClip: shot => {
    const launch = markOf(shot, "launch"), finale = markOf(shot, "down");
    if (finale) return { clip: "victory", ms: finale.ageMs, loop: true };
    if (launch) return { clip: "skill", ms: launch.ageMs, loop: true };
    return null;
  },
});
