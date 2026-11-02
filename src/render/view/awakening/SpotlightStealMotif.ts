import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { mixColor } from "../../art/ColorMix";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { bell, jitter, markOf, marksOf, over, starPoints } from "./AwakeningDraw";

/**
 * 브라보우 「시선 강탈」(2026-10-23 — 기획 4.15, 도지 밈의 알록달록한 감탄 글자): 접촉에 금빛 스포트라이트가 그에게 꽂히고, 그가 포즈를 잡는 동안
 * 카메라 플래시가 터지며 박자마다 감탄 글자가 하나씩 흩어진다 — "와우", "아주 펀치", "매우 메달"(제자리 셋, 같은 글꼴에 파스텔 색). 메달 어퍼(띄우기),
 * 내리꽂기, 누운 그 위로 거대한 금메달이 떨어져 금빛 반짝임이 터진다(누움).
 *
 * 메달(2026-10-23 다시 그림 — 사용자 "입체적, 세련되게, 이펙트로"): 원화 없이 도형으로 그린다. 리본 고리에 매달려 돌며 떨어지고(동전 두께가 보인다),
 * 왼쪽 위에서 오는 빛 하나로 테두리 경사·오목한 면·볼록한 면·면이 갈린 양각 별을 칠한다. 앉은 뒤 광택이 면을 쓸고 지나가고 테두리 끝에서 반짝인다.
 */
const C = AWAKENING_COLORS.spotlightSteal;
const WORD_COLOURS = [C.pastelPink, C.pastelGreen, C.pastelBlue, C.pastelYellow] as const;

export const SPOTLIGHT_STEAL = Object.freeze({
  /** The spotlight on him: `widthBodies` at his feet, swung onto him over `swingMs` from the contact. */
  spot: { widthBodies: 1.7, swingMs: 220, alpha: 0.5 },
  /** The words: `size` view heights, round the stage at `spots`, stamped over `stampMs`, held `holdMs`. */
  words: { size: 0.06, stampMs: 120, holdMs: 900, spots: [[0.22, 0.34], [0.72, 0.42], [0.42, 0.28]] as readonly (readonly [number, number])[] },
  /**
   * The medal: `radiusBodies`, dropping `dropMs` onto him lying there while it spins on its ribbon (`spinTurns` turns, face-on `spinMs` after the
   * drop starts), then a small `hop` (radius shares) over `hopMs`. Its make, as radius shares: the coin's `thickness`, the rim's inner edge
   * `rim`, the face's `face`, the star's `star` radii. The sheen sweeps the face from `sweepAtMs` over `sweepMs` and rests at `sheenRest`
   * (face radii from its centre, toward the light); the rim's glint twinkles at `glintAtMs`. `sparkles` burst as it lands. It goes
   * `outAtMs` after the down beat over `outMs`.
   */
  medal: {
    radiusBodies: 0.36, dropMs: 160, spinTurns: 1.5, spinMs: 460, hop: 0.16, hopMs: 220,
    thickness: 0.13, rim: 0.84, face: 0.76, star: [0.5, 0.21] as readonly [number, number], beads: 28,
    sweepAtMs: 300, sweepMs: 380, sheenRest: -0.42, glintAtMs: 560,
    sparkles: { count: 10, reachBodies: 1.1, lifeMs: 620 },
    outAtMs: 760, outMs: 180,
  },
  holdMs: 850,
});

const S = SPOTLIGHT_STEAL;

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, vh = v.height / shot.perPx;
  // The spotlight, swung onto him (he steals it).
  const swing = easeOutCubic(over(contact.ageMs, S.spot.swingMs)), ox = caster.x - side * v.width * 0.15, angle = Math.atan2(caster.y - v.y, caster.x - ox);
  const aim = Math.PI / 2 + (angle - Math.PI / 2) * swing;
  c.backLight.cone(ox, v.y - h * 0.2, aim, (ground - v.y) * 1.25, h * S.spot.widthBodies, C.gold, S.spot.alpha * fade);
  c.light.glow(caster.x, ground, h * S.spot.widthBodies * 1.3, C.gold, 0.35 * swing * fade, 0.2);
  // The flashes and the words, one each blow.
  for (const mark of marksOf(shot, "hold")) {
    for (let i = 0; i < 3; i++) {
      const f = over(mark.ageMs - i * 50, 150);
      if (f > 0 && f < 1) c.light.flare(v.x + v.width * jitter(mark.nth * 3 + i, 130), v.y + v.height * (0.2 + 0.35 * jitter(mark.nth * 3 + i, 131)), h * 0.32,
        PALETTE.white, (1 - f) * fade, f);
    }
    const W = S.words, spot = W.spots[mark.nth % W.spots.length]!, k = over(mark.ageMs, W.stampMs), out = over(mark.ageMs - W.holdMs, 200);
    c.word(mark.nth % 3, v.x + v.width * spot[0], v.y + v.height * spot[1], vh * W.size, { color: WORD_COLOURS[mark.nth % WORD_COLOURS.length],
      stroke: C.ink, scale: 1.6 - 0.6 * easeOutBack(k), alpha: easeOutCubic(k) * (1 - out) * fade, angle: (jitter(mark.nth, 132) - 0.5) * 24 });
    c.light.flare(mark.at.x, mark.at.y - h * 0.55, h * 0.6 * Math.exp(-mark.ageMs / 90), C.gold, fade);
    c.cue(`flash${mark.nth}`, "shake", 4);
  }
  // The medal uppercut and the slam.
  const launch = markOf(shot, "launch"), spike = markOf(shot, "spike");
  if (launch) {
    const k = over(launch.ageMs, 420);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2.3, h * 0.28, C.gold, (1 - easeInCubic(k)) * fade);
    c.light.flare(launch.at.x, launch.at.y - h * 0.8, h * 1.4 * (1 - k), PALETTE.white, (1 - k) * fade);
  }
  if (spike) {
    const k = over(spike.ageMs, 420);
    c.light.ring(spike.at.x, ground, h * (0.3 + 1.4 * easeOutCubic(k)), C.gold, (1 - k) * fade, 0.25);
    c.cue("spike", "shake", 10);
  }
  // The gold medal dropping onto him lying there, spinning on its ribbon; gold sparkles bursting as it lands.
  const down = markOf(shot, "down");
  if (down) drawMedalDrop(c, down.ageMs, down.at.x, v.y, ground, h, fade);
}

/** A point on screen. */
type Pt = { readonly x: number; readonly y: number };

/** Where the light comes from (upper left): the unit vector toward it, and its angle. */
const LIGHT = Object.freeze({ x: -0.6, y: -0.8, angle: Math.atan2(-0.8, -0.6) });

/** The medal's fall, landing and glints `ms` after the down beat, over (x, ground) from the view's top `top`. */
function drawMedalDrop(c: CityFightAwakeningCanvas, ms: number, x: number, top: number, ground: number, h: number, fade: number): void {
  const M = S.medal, r = h * M.radiusBodies, k = over(ms, M.dropMs), landed = ms - M.dropMs;
  const alpha = fade * (1 - over(ms - M.outAtMs, M.outMs));
  if (!(alpha > 0.003)) return;
  const hop = landed > 0 ? r * M.hop * bell(over(landed, M.hopMs)) : 0;
  const y = top + (ground - h * 0.3 - top) * easeInCubic(k) - hop;
  // Its shadow on him and the floor, closing in as it falls.
  c.under.fillStyle(C.ink, 0.32 * k * alpha).fillEllipse(x, ground + h * 0.02, r * (1.1 + 0.6 * k), r * 0.32);
  // Spinning on its loop: the face turns about the upright axis (cos), the rim's thickness shows as it turns (sin).
  const turn = M.spinTurns * Math.PI * 2 * (1 - easeOutCubic(over(ms, M.spinMs)));
  drawMedal(c.paint, x, y, r, Math.cos(turn), Math.sin(turn), alpha, landed > 0 ? over(landed - M.sweepAtMs, M.sweepMs) : 0);
  if (landed < 0) return;
  // Landing: the flare, a thin gold ring, the sparkles.
  c.light.flare(x, y, h * 1.8 * Math.exp(-landed / 150), C.gold, alpha);
  c.light.ring(x, y, r * (1.1 + 1.6 * easeOutCubic(over(landed, 420))), C.gold, 0.7 * (1 - over(landed, 420)) * alpha, 0.55);
  const P = M.sparkles, burst = over(landed, P.lifeMs);
  if (burst < 1) {
    for (let i = 0; i < P.count; i++) {
      const a = (i + 0.5 * jitter(i, 140)) / P.count * Math.PI * 2, reach = h * P.reachBodies * (0.6 + 0.4 * jitter(i, 141)) * easeOutCubic(burst);
      const sx = x + Math.cos(a) * reach, sy = y + Math.sin(a) * reach * 0.7 + h * 0.35 * burst * burst;
      twinkle(c.front, sx, sy, h * (0.05 + 0.04 * jitter(i, 142)) * (1 - 0.5 * burst), a * 0.3, (1 - burst) * alpha);
    }
  }
  c.cue("medal", "shake", 9);
  // The glint at the rim's lit edge as the sheen leaves it.
  const g = over(landed - M.glintAtMs, 260);
  if (g > 0 && g < 1) {
    const gx = x + LIGHT.x * r * 0.86, gy = y + LIGHT.y * r * 0.86;
    c.light.flare(gx, gy, r * 0.9 * bell(g), PALETTE.white, alpha, g * 0.8);
    twinkle(c.front, gx, gy, r * 0.32 * bell(g), g * 0.8, alpha);
  }
}

/** A four-point twinkle (gold, a white core) `size` tall at (x, y), turned `rotation`. */
function twinkle(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, rotation: number, alpha: number): void {
  if (!(alpha > 0.003) || !(size > 0.2)) return;
  g.fillStyle(C.gold, alpha).fillPoints(starPoints(x, y, 4, size, size * 0.2, rotation), true);
  g.fillStyle(PALETTE.white, alpha).fillPoints(starPoints(x, y, 4, size * 0.55, size * 0.12, rotation), true);
}

/**
 * The medal at (x, y), radius `r`, turned on its upright axis (`cos`, `sin` of the turn — its back shows while `cos` < 0), on its ribbon.
 * Lit from the upper left: the rim bevelled (lit edge, shaded edge), a ring of beads, the face sunk into the rim and domed, an engraved ring,
 * the star raised in ten lit and shaded facets (its front only), the sheen at `sweep` (0..1 across the face, then at rest).
 */
function drawMedal(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, cos: number, sin: number, alpha: number, sweep: number): void {
  const M = S.medal, wide = Math.abs(cos), front = cos >= 0;
  /** A point of the face (radius shares) on screen: its x squeezed by the turn. */
  const at = (u: number, v: number): Pt => ({ x: x + u * r * wide, y: y + v * r });
  const disc = (u: number, v: number, rad: number, color: number, a = 1) => {
    const p = at(u, v);
    g.fillStyle(color, a * alpha).fillEllipse(p.x, p.y, rad * r * wide * 2, rad * r * 2, 48);
  };
  drawRibbon(g, x, y, r, alpha);
  // The coin's thickness: its rim surface drawn back to the far face, darker away.
  const depth = M.thickness * r * sin;
  if (Math.abs(depth) > 0.5) {
    for (let i = 6; i >= 1; i--) {
      g.fillStyle(mixColor(C.goldShade, C.goldEdge, i / 6), alpha).fillEllipse(x + depth * i / 6, y, Math.max(1, r * wide * 2), r * 2, 48);
    }
  }
  if (wide < 0.04) return;
  // The rim: shaded (the base), lit toward the light, its body between — a bevel with a lit and a shaded edge.
  const d = 0.04;
  disc(0, 0, 1, C.goldShade);
  disc(LIGHT.x * d, LIGHT.y * d, 1 - d, C.goldLight);
  disc(-LIGHT.x * d * 0.3, -LIGHT.y * d * 0.3, 1 - 1.7 * d, C.goldMid);
  // The beads round the rim, each lit on its upper left.
  if (wide > 0.3) {
    const beadR = 0.028, ring = (1 + M.rim) / 2 - 0.01;
    for (let i = 0; i < M.beads; i++) {
      const a = i / M.beads * Math.PI * 2, u = Math.cos(a) * ring, v = Math.sin(a) * ring;
      disc(u - LIGHT.x * beadR * 0.3, v - LIGHT.y * beadR * 0.3, beadR, C.goldShade, 0.85);
      disc(u + LIGHT.x * beadR * 0.25, v + LIGHT.y * beadR * 0.25, beadR * 0.8, C.goldLight);
    }
  }
  // The well: the face sunk in the rim — its inner wall shaded toward the light, lit away from it.
  const w = 0.035;
  disc(0, 0, M.rim, C.goldShade);
  disc(-LIGHT.x * w, -LIGHT.y * w, M.rim - w, C.goldLight);
  // The face, domed: rings from its dark edge to a light crown toward the light.
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const k = i / (steps - 1);
    disc(LIGHT.x * M.face * 0.28 * k, LIGHT.y * M.face * 0.28 * k, M.face * (1 - 0.82 * k), mixColor(C.faceDark, C.faceLight, k ** 0.8));
  }
  // The engraved ring: a shaded cut, lit on its far lip.
  const engrave = M.face * 0.88;
  g.lineStyle(Math.max(1, r * 0.018), C.goldShade, 0.75 * alpha).strokeEllipse(x, y, engrave * r * wide * 2, engrave * r * 2, 48);
  const lip = at(-LIGHT.x * 0.012, -LIGHT.y * 0.012);
  g.lineStyle(Math.max(1, r * 0.012), C.goldLight, 0.6 * alpha).strokeEllipse(lip.x, lip.y, engrave * r * wide * 2, engrave * r * 2, 48);
  if (front) drawRaisedStar(g, at, alpha);
  // The sheen: a broad soft band and a thin bright one across the face, swept from the far side toward the light's, resting near it.
  const rest = M.sheenRest, offset = sweep < 1 ? 1.3 - (1.3 - rest) * easeOutCubic(sweep) : rest;
  sheen(g, at, M.face, offset, 0.24, 0.22 * alpha);
  sheen(g, at, M.face, offset + 0.27, 0.06, 0.32 * alpha);
  // The rim's lit edge, a thin bright arc on the upper left.
  const arc: Pt[] = [];
  for (let i = 0; i <= 14; i++) {
    const a = LIGHT.angle - 0.75 + 1.5 * i / 14;
    arc.push(at(Math.cos(a) * 0.955, Math.sin(a) * 0.955));
  }
  g.lineStyle(Math.max(1, r * 0.03), PALETTE.white, 0.55 * alpha).strokePoints(arc, false);
}

/** The star raised off the face: its shadow, then ten facets — each tip split down its middle, lit by how much it faces the light. */
function drawRaisedStar(g: Phaser.GameObjects.Graphics, at: (u: number, v: number) => Pt, alpha: number): void {
  const [outer, inner] = S.medal.star, n = 5;
  const tip = (i: number) => { const a = -Math.PI / 2 + i * Math.PI * 2 / n; return { a, u: Math.cos(a) * outer, v: Math.sin(a) * outer }; };
  const notch = (i: number) => { const a = -Math.PI / 2 + (i + 0.5) * Math.PI * 2 / n; return { a, u: Math.cos(a) * inner, v: Math.sin(a) * inner }; };
  const shadow: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = tip(i), m = notch(i);
    shadow.push(at(t.u - LIGHT.x * 0.045, t.v - LIGHT.y * 0.045), at(m.u - LIGHT.x * 0.045, m.v - LIGHT.y * 0.045));
  }
  g.fillStyle(C.goldShade, 0.55 * alpha).fillPoints(shadow, true);
  const centre = at(0, 0);
  for (let i = 0; i < n; i++) {
    const t = tip(i), after = notch(i), before = notch(i - 1);
    for (const side of [before, after]) {
      const facing = Math.cos((t.a + side.a) / 2 - LIGHT.angle), lit = 0.5 + 0.5 * facing;
      const p = at(t.u, t.v), q = at(side.u, side.v);
      g.fillStyle(mixColor(C.goldDeep, C.starLight, lit), alpha).fillTriangle(centre.x, centre.y, p.x, p.y, q.x, q.y);
    }
  }
}

/** A band of sheen across the face (radius `face`): along the light's diagonal, `offset` face radii from the centre, `width` wide. */
function sheen(g: Phaser.GameObjects.Graphics, at: (u: number, v: number) => Pt, face: number, offset: number, width: number,
  alpha: number): void {
  if (!(alpha > 0.003)) return;
  // The face as a polygon, cut to the band between two lines across the light's direction.
  let poly: { u: number; v: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const a = i / 40 * Math.PI * 2;
    poly.push({ u: Math.cos(a) * face, v: Math.sin(a) * face });
  }
  const nx = -LIGHT.x, ny = -LIGHT.y;
  poly = clip(poly, nx, ny, (offset - width / 2) * face, 1);
  poly = clip(poly, nx, ny, (offset + width / 2) * face, -1);
  if (poly.length < 3) return;
  g.fillStyle(PALETTE.white, alpha).fillPoints(poly.map(p => at(p.u, p.v)), true);
}

/** `poly` cut to the side of the line n·p = c that `keep` (+1: n·p ≥ c, −1: n·p ≤ c) names (Sutherland–Hodgman, one plane). */
function clip(poly: readonly { u: number; v: number }[], nx: number, ny: number, c: number, keep: 1 | -1): { u: number; v: number }[] {
  const out: { u: number; v: number }[] = [], side = (p: { u: number; v: number }) => keep * (nx * p.u + ny * p.v - c);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!, sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t });
    }
  }
  return out;
}

/**
 * The ribbon the medal hangs from (it does not turn with it): two straps in a V up out of a gold bar over the loop — each with its fold shaded
 * on the inner side, its outer edge lit and a thin gold stripe down it — fading out toward their tops (`fadeFrom` of their length), and the loop.
 */
function drawRibbon(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha: number): void {
  const barY = y - r * 1.16, topY = y - r * 2.5, fadePieces = 16, fadeFrom = 0.55;
  const strap = (dir: -1 | 1, base: number, dark: number, light: number) => {
    const bx = x + dir * r * 0.13, tx = x + dir * r * 0.66, half = r * 0.19, top = r * 0.23;
    const along = (p: Pt, q: Pt, k: number): Pt => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
    // The strap's corners: inner and outer at its foot (over the bar) and its top.
    const footIn = { x: bx - dir * half, y: barY }, footOut = { x: bx + dir * half, y: barY };
    const headIn = { x: tx - dir * top, y: topY }, headOut = { x: tx + dir * top, y: topY };
    // Across the strap at `a` (0 inner .. 1 outer), `t` (0 foot .. 1 top) along it.
    const point = (a: number, t: number) => along(along(footIn, headIn, t), along(footOut, headOut, t), a);
    const band = (a0: number, a1: number, t0: number, t1: number, color: number, a: number) =>
      g.fillStyle(color, a).fillPoints([point(a0, t0), point(a1, t0), point(a1, t1), point(a0, t1)], true);
    // Solid up to `fadeFrom`, then in thin pieces fading out (fine enough that the steps do not show).
    for (let i = -1; i < fadePieces; i++) {
      const t0 = i < 0 ? 0 : fadeFrom + (1 - fadeFrom) * i / fadePieces, t1 = i < 0 ? fadeFrom : fadeFrom + (1 - fadeFrom) * (i + 1) / fadePieces;
      const a = alpha * (i < 0 ? 1 : 1 - (i + 0.5) / fadePieces);
      band(0, 1, t0, t1, base, a);
      // The fold: its inner third in shade; the gold stripe down its middle; the lit outer edge.
      band(0, 0.34, t0, t1, dark, a);
      band(0.55, 0.63, t0, t1, C.gold, 0.9 * a);
      band(0.9, 1, t0, t1, light, 0.85 * a);
    }
  };
  strap(-1, C.ribbonA, C.ribbonADark, C.ribbonALight);
  strap(1, C.ribbonB, C.ribbonBDark, C.ribbonBLight);
  // The bar the straps fold over, and the loop down to the medal.
  const barW = r * 0.62, barH = r * 0.12;
  g.fillStyle(C.goldShade, alpha).fillRoundedRect(x - barW / 2, barY - barH / 2 + r * 0.015, barW, barH, barH / 2);
  g.fillStyle(C.goldMid, alpha).fillRoundedRect(x - barW / 2, barY - barH / 2, barW, barH * 0.86, barH / 2);
  g.fillStyle(C.goldLight, 0.9 * alpha).fillRoundedRect(x - barW * 0.42, barY - barH * 0.38, barW * 0.84, barH * 0.22, barH * 0.11);
  const loopY = y - r * 1.05;
  g.lineStyle(Math.max(1, r * 0.07), C.goldShade, alpha).strokeEllipse(x, loopY, r * 0.26, r * 0.2);
  g.lineStyle(Math.max(1, r * 0.035), C.goldLight, alpha).strokeEllipse(x - r * 0.01, loopY - r * 0.012, r * 0.24, r * 0.18);
}

export const SPOTLIGHT_STEAL_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.gold,
  holdMs: S.holdMs,
  skyInMs: 260,
  words: locale => [t(locale, "fight.superStage.wow"), t(locale, "fight.superStage.suchPunch"), t(locale, "fight.superStage.veryMedal")],
  draw,
  // He poses for the cameras (his victory) while it all lands — then poses again over the medal.
  casterClip: shot => (shot.contact && !shot.contact.blocked && shot.marks.length > 0 ? { clip: "victory", ms: shot.contact.ageMs, loop: true } : null),
});
