import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over, petalPoints } from "./AwakeningDraw";

/**
 * 둘둘 「두 뼘 더」(2026-10-23 — 기획 4.20, 단순한 낙서 만화, "한 뼘만 더 가면… 닿겠다!"): 하늘이 크림색 종이가 되고 화면 가장자리에 손그림 만화
 * 칸 테두리가 그어진다. 쭉쭉 넷(제자리)마다 떨리는 낙서 선의 팔이 늘어나 닿고, 용수철처럼 튀는 어퍼(띄우기 — 지그재그 용수철), 공중 둘, 내려치기
 * (내려꽂기), 누운 그 위에 새싹이 피어난다 — "닿았다!"(누움).
 */
const C = AWAKENING_COLORS.doodleReach;

export const DOODLE_REACH = Object.freeze({
  /** The panel border: `inset` of the view, `widthPx` screen px, drawn in over `drawMs`. */
  panel: { inset: 0.03, widthPx: 5, drawMs: 240 },
  /** A doodle arm: wobbling `wobbleBodies` every `wobbleMs`, reaching out over `reachMs`, held `holdMs`. */
  arm: { wobbleBodies: 0.03, wobbleMs: 70, reachMs: 90, holdMs: 160 },
  /** The spring: `coils`, `widthBodies` wide. */
  spring: { coils: 7, widthBodies: 0.22, lifeMs: 520 },
  /** The sprout: grown over `growMs`; the word `size` view heights. */
  sprout: { growMs: 260, size: 0.065 },
  holdMs: 850,
});

const D = DOODLE_REACH;

/** A hand-drawn line from a to b: a few kinks that boil (re-cut every `D.arm.wobbleMs`). */
function scribble(ax: number, ay: number, bx: number, by: number, wobble: number, ms: number, salt: number): Phaser.Types.Math.Vector2Like[] {
  const out: Phaser.Types.Math.Vector2Like[] = [], frame = Math.floor(ms / D.arm.wobbleMs), dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, off = i === 0 || i === 8 ? 0 : (jitter(i + salt * 9, frame) - 0.5) * 2 * wobble;
    out.push({ x: ax + dx * t - dy / len * off, y: ay + dy * t + dx / len * off });
  }
  return out;
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, ink = C.ink;
  // The comic panel's hand-drawn border.
  const P = D.panel, k0 = easeOutCubic(over(contact.ageMs, P.drawMs)), inset = v.width * P.inset, w = P.widthPx * shot.perPx, wob = h * 0.012;
  const corners = [[v.x + inset, v.y + inset + v.height * 0.1], [v.right - inset, v.y + inset + v.height * 0.1], [v.right - inset, v.bottom - inset],
    [v.x + inset, v.bottom - inset]] as const;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i]!, [bx, by] = corners[(i + 1) % 4]!;
    c.ink.lineStyle(w, ink, 0.85 * fade).strokePoints(scribble(ax, ay, ax + (bx - ax) * k0, ay + (by - ay) * k0, wob, shot.ms, i), false);
  }
  // The doodle arms reaching out to him, a little fist at the end.
  for (const mark of marksOf(shot, "hold")) {
    const A = D.arm, k = over(mark.ageMs, A.reachMs), out = over(mark.ageMs - A.reachMs - A.holdMs, 120);
    if (out >= 1) continue;
    const sx = caster.x + side * h * 0.15, sy = caster.y - h * 0.62, tx = mark.at.x + side * h * 0.05, ty = mark.at.y - h * (0.5 + 0.1 * (mark.nth % 2));
    const ex = sx + (tx - sx) * easeOutCubic(k), ey = sy + (ty - sy) * easeOutCubic(k), line = scribble(sx, sy, ex, ey, h * A.wobbleBodies, mark.ageMs, mark.nth);
    c.ink.lineStyle(h * 0.035, ink, (1 - out) * fade).strokePoints(line, false);
    c.ink.lineStyle(h * 0.012, C.green, (1 - out) * fade).strokePoints(line, false);
    c.ink.fillStyle(ink, (1 - out) * fade).fillCircle(ex, ey, h * 0.05);
    if (k >= 1) c.ink.lineStyle(2 * shot.perPx, ink, (1 - out) * fade).strokeCircle(tx, ty, h * (0.12 + 0.1 * over(mark.ageMs - A.reachMs, 120)));
    c.cue(`reach${mark.nth}`, "shake", 4);
  }
  // The spring under him at the launch.
  const launch = markOf(shot, "launch");
  if (launch) {
    const S = D.spring, k = over(launch.ageMs, S.lifeMs), stretch = h * (0.4 + 1.2 * easeOutBack(Math.min(1, k * 2))), points: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i <= S.coils * 2; i++) points.push({ x: launch.at.x + (i % 2 === 0 ? -1 : 1) * h * S.widthBodies / 2 * (i === 0 || i === S.coils * 2 ? 0 : 1),
      y: ground - stretch * i / (S.coils * 2) });
    c.ink.lineStyle(h * 0.03, ink, (1 - easeInCubic(k)) * fade).strokePoints(points, false);
  }
  // The air blows and the spike: little doodle bursts on him.
  for (const mark of [...marksOf(shot, "air"), ...marksOf(shot, "spike")]) {
    const k = over(mark.ageMs, 300);
    if (k >= 1) continue;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + mark.nth, r0 = h * 0.15, r1 = h * (0.3 + 0.25 * easeOutCubic(k));
      c.ink.lineStyle(h * 0.02, ink, (1 - k) * fade).lineBetween(mark.at.x + Math.cos(a) * r0, mark.at.y - h * 0.5 + Math.sin(a) * r0,
        mark.at.x + Math.cos(a) * r1, mark.at.y - h * 0.5 + Math.sin(a) * r1);
    }
  }
  // The sprout on him lying there — "닿았다!".
  const down = markOf(shot, "down");
  if (down) {
    const S = D.sprout, k = easeOutBack(over(down.ageMs, S.growMs)), x = down.at.x, y = ground - h * 0.28;
    c.ink.lineStyle(h * 0.025, C.greenDeep, fade).lineBetween(x, y, x, y - h * 0.3 * k);
    for (const s of [-1, 1]) {
      const leaf = petalPoints(x, y - h * 0.28 * k, h * 0.2 * k, h * 0.12 * k, -Math.PI / 2 + s * 0.9);
      c.ink.fillStyle(C.green, fade).fillPoints(leaf, true);
      c.ink.lineStyle(1.5 * shot.perPx, ink, fade).strokePoints(leaf, true);
    }
    const wk = over(down.ageMs - 120, 110);
    if (down.ageMs >= 120) c.word(0, x, y - h * 0.85, v.height / shot.perPx * S.size, { scale: 1.6 - 0.6 * easeOutBack(wk), alpha: easeOutCubic(wk) * fade,
      color: C.green, stroke: ink, angle: -4 });
    c.cue("sprout", "punch", 1.02);
  }
}

export const DOODLE_REACH_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.greenDeep,
  holdMs: D.holdMs,
  skyInMs: 280,
  words: locale => [t(locale, "fight.superStage.reached")],
  draw,
  // His arms stretch (his skill) at each reach; he cheers at the sprout (his victory).
  casterClip: shot => {
    const down = markOf(shot, "down"), launch = markOf(shot, "launch");
    if (down) return { clip: "victory", ms: down.ageMs, loop: true };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "skill", ms: shot.contact.ageMs, loop: true } : null;
  },
});
