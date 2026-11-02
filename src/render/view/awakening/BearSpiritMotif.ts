import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { burst, jitter, markOf, marksOf, over } from "./AwakeningDraw";

/**
 * 쿠마 「곰의 철퇴」(2026-10-23 — 기획 4.1, "이 탈, 장식 아니다."): 탈의 눈이 붉게 켜지고, 그의 등 뒤로 빛으로 된 거대한 곰이 일어선다. 빛 곰이
 * 앞발로 세 번 할퀴고(제자리 박자 — 세 줄 발톱 자국), 올려 쳐 띄우고, 하늘에서 불씨 꼬리를 단 쇠공이 떨어져 그를 꽂는다(내려꽂기). 누운 몸에
 * 빛 곰이 앞발을 내리찍어 땅에 거대한 발자국과 균열을 남기고(누움) 사라진다.
 */
const C = AWAKENING_COLORS.bearSpirit;

export const BEAR_SPIRIT = Object.freeze({
  /** The mask's eyes: up his body, apart, glowing in over `inMs` from the super's start. */
  eyes: { up: 0.86, apart: 0.07, forward: 0.06, inMs: 260 },
  /** The light bear: `heightBodies` tall behind him, risen over `riseMs` from the contact, gone over `outMs` after the paw print. */
  bear: { heightBodies: 1.75, back: 0.3, riseMs: 320, outMs: 520 },
  /** A claw swipe: three marks `spreadBodies` apart, `lengthBodies` long, drawn in over `drawMs`, held to `lifeMs`. */
  claw: { spreadBodies: 0.13, lengthBodies: 1.25, drawMs: 70, lifeMs: 460, angles: [-38, 34, -64] as readonly number[] },
  /** The iron ball: `radiusBodies`, seen falling `fallMs` (fight ms) before the spike, from above the view. */
  ball: { radiusBodies: 0.32, fallMs: 260 },
  /** The paw print: `widthBodies` across, stamped over `stampMs`. */
  paw: { widthBodies: 1.05, stampMs: 150 },
  holdMs: 1100,
});

const B = BEAR_SPIRIT;

/**
 * The light bear: a spirit of fire light round its base (x, y), `size` tall, facing `side`, its near paw raised `raise` (0 down .. 1 high) —
 * soft glows heaped into its shape (body, shoulders, head, ears, snout, the raised arm and paw), a hot rim along its head and ears, claws on
 * the paw, red eyes.
 */
function bear(c: CityFightAwakeningCanvas, x: number, y: number, size: number, side: 1 | -1, raise: number, alpha: number, perPx: number): void {
  if (!(alpha > 0.01)) return;
  const L = c.backLight, at = (u: number, v: number) => ({ x: x + u * side * size, y: y - v * size });
  const body = at(0, 0.36), shoulder = at(0.02, 0.6), head = at(0.06, 0.82), snout = at(0.2, 0.79);
  L.glow(body.x, body.y, size * 0.78, C.bear, 0.42 * alpha, 1.15);
  L.glow(shoulder.x, shoulder.y, size * 0.72, C.bear, 0.36 * alpha, 0.62);
  L.glow(head.x, head.y, size * 0.4, C.ember, 0.55 * alpha);
  L.glow(snout.x, snout.y, size * 0.17, C.hot, 0.4 * alpha);
  for (const u of [-0.07, 0.17]) { const ear = at(u, 0.98); L.glow(ear.x, ear.y, size * 0.14, C.ember, 0.6 * alpha); }
  // The raised arm, the paw and its claws.
  const from = at(0.2, 0.62), paw = at(0.4 + 0.1 * raise, 0.6 + 0.4 * raise);
  for (let i = 0; i <= 4; i++) { const t = i / 4; L.glow(from.x + (paw.x - from.x) * t, from.y + (paw.y - from.y) * t, size * 0.2, C.bear, 0.4 * alpha); }
  L.glow(paw.x, paw.y, size * 0.22, C.ember, 0.55 * alpha);
  for (let i = -1; i <= 1; i++) {
    const a = -Math.PI / 2 + side * (0.5 + 0.28 * i) - (side > 0 ? 0 : Math.PI) * 0;
    c.light.streak(paw.x + Math.cos(a) * size * 0.1 * side, paw.y + Math.sin(a) * size * 0.09, a, size * 0.14, size * 0.025, C.ember, 0.8 * alpha, C.hot);
  }
  // A hot rim along the top of its head and ears.
  c.back.lineStyle(2.4 * perPx, C.hot, 0.75 * alpha).beginPath().arc(head.x, head.y, size * 0.17, Math.PI * 1.08, Math.PI * 1.92).strokePath();
  for (const u of [-0.07, 0.17]) {
    const ear = at(u, 0.98);
    c.back.lineStyle(2 * perPx, C.hot, 0.7 * alpha).beginPath().arc(ear.x, ear.y, size * 0.055, Math.PI * 1.1, Math.PI * 1.9).strokePath();
  }
  // Its eyes.
  for (const u of [0.03, 0.12]) { const eye = at(u, 0.84); c.light.flare(eye.x, eye.y, size * 0.08, C.eye, alpha); }
}

/** Three claw marks through (x, y) along `angle` (degrees), drawn `k` of the way, fading `out`. */
function claws(c: CityFightAwakeningCanvas, x: number, y: number, h: number, angleDeg: number, k: number, out: number, fade: number): void {
  const a = angleDeg * Math.PI / 180, nx = -Math.sin(a), ny = Math.cos(a), length = h * B.claw.lengthBodies;
  for (let i = -1; i <= 1; i++) {
    const ox = x + nx * i * h * B.claw.spreadBodies, oy = y + ny * i * h * B.claw.spreadBodies;
    const sx = ox - Math.cos(a) * length / 2, sy = oy - Math.sin(a) * length / 2, drawn = length * easeOutCubic(k);
    const mx = sx + Math.cos(a) * drawn / 2, my = sy + Math.sin(a) * drawn / 2;
    c.light.streak(mx, my, a, drawn, h * 0.05 * (1 - 0.4 * out), C.ember, (1 - out) * fade, C.hot);
  }
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const fade = shot.fade, caster = shot.caster, h = caster.h, side = shot.side, contact = shot.contact;
  // The mask's eyes, red, from the super's start.
  const E = B.eyes, eyes = over(shot.ms, E.inMs) * fade, ex = caster.x + side * h * E.forward, ey = caster.y - h * E.up;
  for (const s of [-1, 1]) c.light.flare(ex + s * h * E.apart, ey, h * 0.22 * (0.85 + 0.15 * Math.sin(shot.ms * 0.02)), C.eye, eyes);
  if (!contact) return;
  // The light bear risen behind him.
  const paw = markOf(shot, "down"), gone = paw ? over(paw.ageMs - 260, B.bear.outMs) : 0;
  const rise = easeOutBack(over(contact.ageMs, B.bear.riseMs)) * (1 - easeInCubic(gone)) * fade;
  if (rise > 0.01 && !contact.blocked) {
    const holds = marksOf(shot, "hold"), last = holds[holds.length - 1];
    const swipe = last ? Math.exp(-last.ageMs / 120) : 0, raise = paw ? 1 - over(paw.ageMs, 120) : 1 - swipe;
    bear(c, caster.x - side * h * B.bear.back, caster.y, h * B.bear.heightBodies * (0.6 + 0.4 * rise), side, raise, Math.min(1, rise), shot.perPx);
  }
  // The claw swipes on him standing.
  for (const mark of marksOf(shot, "hold")) {
    const k = over(mark.ageMs, B.claw.drawMs), out = over(mark.ageMs - B.claw.drawMs, B.claw.lifeMs - B.claw.drawMs);
    if (out >= 1) continue;
    const angle = B.claw.angles[mark.nth % B.claw.angles.length]! * side;
    claws(c, mark.at.x, mark.at.y - h * 0.55, h, angle, k, easeInCubic(out), fade);
    c.light.flare(mark.at.x, mark.at.y - h * 0.55, h * 0.8 * Math.exp(-mark.ageMs / 80), C.hot, fade);
    for (let i = 0; i < 6; i++) {
      const t = over(mark.ageMs, 420), a = (jitter(i, mark.nth + 3) - 0.5) * 2.2 - Math.PI / 2 + side * 0.6;
      c.light.glow(mark.at.x + Math.cos(a) * h * 0.9 * t, mark.at.y - h * 0.55 + Math.sin(a) * h * 0.7 * t + h * 0.3 * t * t, h * 0.06, C.ember, (1 - t) * fade);
    }
    c.cue(`claw${mark.nth}`, "shake", 6);
  }
  // The uppercut: a column of embers off the ground under him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const k = over(launch.ageMs, 520), x = launch.at.x, y = launch.at.y;
    c.light.ray(x, y, -Math.PI / 2, h * 2.4 * easeOutCubic(Math.min(1, k * 2)), h * 0.35, C.ember, (1 - k) * fade, C.hot);
    burst(c.front, x, y - h * 0.05, 9, h * 0.15, h * 0.9 * easeOutCubic(k), h * 0.07, C.ember, 0.8 * (1 - k) * fade, 5, 0.35);
    c.cue("launch", "shake", 8);
  }
  // The iron ball: seen falling from above the view onto him, its trail of embers; its landing a flash and a ring.
  const follow = shot.follow, spikeAt = follow?.beats.find(beat => beat.kind === "spike")?.atMs ?? null, spike = markOf(shot, "spike");
  const r = h * B.ball.radiusBodies, target = shot.target;
  if (spikeAt !== null && shot.progress !== null && !spike && shot.progress >= spikeAt - B.ball.fallMs) {
    const k = easeInCubic(over(shot.progress - (spikeAt - B.ball.fallMs), B.ball.fallMs));
    const fromX = target.x - side * h * 0.8, fromY = shot.view.y - r * 2, x = fromX + (target.x - fromX) * k, y = fromY + (target.y - h * 0.5 - fromY) * k;
    const angle = Math.atan2(target.y - h * 0.5 - fromY, target.x - fromX);
    c.light.ray(x, y, angle + Math.PI, h * 2.2, r * 1.1, C.ember, 0.75 * fade, C.hot);
    c.paint.fillStyle(C.iron, fade).fillCircle(x, y, r);
    c.paint.lineStyle(r * 0.18, C.ember, 0.9 * fade).strokeCircle(x, y, r * 0.92);
    c.light.glow(x, y, r * 3.5, C.ember, 0.4 * fade);
  }
  if (spike) {
    const k = over(spike.ageMs, 480), x = spike.at.x, y = spike.at.y;
    c.light.flare(x, y - h * 0.3, h * 2.2 * (1 - k * 0.5), C.hot, (1 - k) * fade);
    c.light.ring(x, y, h * (0.3 + 1.9 * easeOutCubic(k)), C.ember, (1 - k) * fade, 0.3);
    if (k < 0.6) {
      const out = over(spike.ageMs, 300);
      c.paint.fillStyle(C.iron, (1 - out) * fade).fillCircle(x, y - r * 0.6, r);
      c.paint.lineStyle(r * 0.18, C.ember, (1 - out) * fade).strokeCircle(x, y - r * 0.6, r * 0.92);
    }
    c.cue("spike", "shake", 12);
  }
  // The paw print stamped on the ground by him lying, the cracks running out of it.
  if (paw) {
    const P = B.paw, k = over(paw.ageMs, P.stampMs), s = 1.6 - 0.6 * easeOutBack(k), w = h * P.widthBodies * s, x = paw.at.x, y = paw.at.y;
    const glow = (0.6 + 0.4 * Math.exp(-paw.ageMs / 200)) * easeOutCubic(k) * fade;
    c.front.fillStyle(C.ember, 0.45 * glow).fillEllipse(x, y + w * 0.03, w * 0.62, w * 0.2);
    for (let i = 0; i < 4; i++) {
      const u = (i - 1.5) * 0.24;
      c.front.fillStyle(C.ember, 0.5 * glow).fillEllipse(x + u * w, y - w * 0.12 - Math.abs(u) * w * -0.08, w * 0.17, w * 0.08);
    }
    burst(c.front, x, y, 10, w * 0.4, w * 1.2, h * 0.05, C.hot, 0.6 * glow * (1 - over(paw.ageMs, 900)), 17, 0.25);
    c.light.flare(x, y - h * 0.15, h * 1.5 * Math.exp(-paw.ageMs / 160), C.hot, fade);
    c.cue("paw", "shake", 12);
  }
}

/** Reduced motion: the light bear standing still behind him. */
function drawReduced(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  if (!shot.contact || shot.contact.blocked) return;
  const h = shot.caster.h;
  bear(c, shot.caster.x - shot.side * h * B.bear.back, shot.caster.y, h * B.bear.heightBodies, shot.side, 0.5, shot.fade, shot.perPx);
}

export const BEAR_SPIRIT_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.stamp,
  holdMs: B.holdMs,
  skyInMs: 320,
  draw,
  drawReduced,
  // He swings his iron ball through the claws (the bear behind him swipes with him), then stands.
  casterClip: shot => {
    const launch = markOf(shot, "launch");
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "ballSwing", ms: shot.contact.ageMs, loop: true } : null;
  },
});
