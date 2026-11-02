import { easeInCubic, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over, petalPoints } from "./AwakeningDraw";

/**
 * 버팀 「끝까지 버팀」(2026-10-23 — 기획 4.16, 눈을 질끈 감고 덜덜 떠는 밈 강아지, "살살 해 줄래? …안 되는구나."): 겁에 질려 휘두른 것이 이긴다.
 * 그의 둘레에 떨림 획이 끊임없이 일고, 덜덜 카운터 다섯(제자리)마다 식은땀이 튀고 코발트 파편이 터진다. 필사의 온몸 밀치기가 그를 날리고(띄우기),
 * 놀라 넘어지며 엉덩방아로 누른다(누움) — 머리 위로 작은 별이 돈다. 이기고도 놀란 얼굴(그의 승리 칸).
 */
const C = AWAKENING_COLORS.tremble;

export const TREMBLE = Object.freeze({
  /** The shaking strokes round him: `count` pairs, `reachBodies` out, re-cut every `frameMs`. */
  shake: { count: 6, reachBodies: 0.62, frameMs: 45 },
  /** The sweat: `drops` per blow, flung `reachBodies` over `lifeMs`. */
  sweat: { drops: 5, reachBodies: 0.8, lifeMs: 420 },
  holdMs: 820,
});

const T = TREMBLE;

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, down = markOf(shot, "down");
  // His shaking: short paired strokes either side of him, re-cut every frame of the tremble — until it is over.
  const shaking = down ? 1 - over(down.ageMs, 200) : 1, frame = Math.floor(shot.ms / T.shake.frameMs);
  for (let i = 0; i < T.shake.count; i++) {
    const s = i % 2 === 0 ? -1 : 1, y = caster.y - h * (0.3 + 0.5 * jitter(i, frame)), x = caster.x + s * h * (T.shake.reachBodies * 0.6 + 0.12 * jitter(i + 7, frame));
    c.ink.lineStyle(2.4 * shot.perPx, C.ink, 0.8 * shaking * fade).lineBetween(x, y - h * 0.06, x + s * h * 0.05, y + h * 0.04);
    c.ink.lineBetween(x + s * h * 0.06, y - h * 0.05, x + s * h * 0.11, y + h * 0.05);
  }
  // Each counter: cold sweat flung off him, cobalt shards bursting off the other.
  for (const mark of marksOf(shot, "hold")) {
    const k = over(mark.ageMs, T.sweat.lifeMs);
    if (k >= 1) continue;
    for (let i = 0; i < T.sweat.drops; i++) {
      const a = -Math.PI / 2 + (jitter(i, mark.nth + 140) - 0.5) * 2.4, d = h * T.sweat.reachBodies * easeOutCubic(k);
      const x = caster.x + Math.cos(a) * d, y = caster.y - h * 0.85 + Math.sin(a) * d + h * 0.6 * k * k;
      c.paint.fillStyle(C.sweat, (1 - easeInCubic(k)) * fade).fillPoints(petalPoints(x, y, h * 0.09, h * 0.07, a + Math.PI), true);
    }
    for (let i = 0; i < 7; i++) {
      const a = (jitter(i, mark.nth + 150) - 0.5) * 2.4 + (side > 0 ? 0 : Math.PI), d = h * 0.9 * easeOutCubic(k), sx = mark.at.x + Math.cos(a) * d, sy = mark.at.y - h * 0.5 + Math.sin(a) * d;
      c.paint.fillStyle(C.cobalt, (1 - k) * fade).fillTriangle(sx, sy, sx + h * 0.07, sy - h * 0.03, sx + h * 0.02, sy + h * 0.06);
    }
    c.light.flare(mark.at.x, mark.at.y - h * 0.5, h * 0.55 * (1 - k), C.cobaltLight, (1 - k) * fade, mark.nth);
    c.cue(`counter${mark.nth}`, "shake", 4);
  }
  // The desperate shove: a cobalt blast off him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const k = over(launch.ageMs, 480);
    c.light.ring(launch.at.x, launch.at.y - h * 0.5, h * (0.2 + 1.6 * easeOutCubic(k)), C.cobaltLight, (1 - k) * fade, 1);
    c.light.flare(launch.at.x, launch.at.y - h * 0.5, h * 2 * (1 - k), PALETTE.white, (1 - k) * fade);
    c.cue("shove", "shake", 12);
  }
  // The pratfall on him lying there: a dust ring, little stars wheeling over him.
  if (down) {
    const k = over(down.ageMs, 500);
    c.light.ring(down.at.x, ground, h * (0.3 + 1.2 * easeOutCubic(k)), C.cobaltLight, (1 - k) * fade, 0.25);
    for (let i = 0; i < 4; i++) {
      const a = down.ageMs * 0.01 + i * Math.PI / 2, x = down.at.x + Math.cos(a) * h * 0.4, y = ground - h * 0.55 + Math.sin(a) * h * 0.1;
      c.light.flare(x, y, h * 0.22, C.dizzy, (1 - over(down.ageMs - 500, 250)) * fade, a);
    }
    c.cue("pratfall", "punch", 1.02);
  }
}

export const TREMBLE_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.cobaltLight,
  holdMs: T.holdMs,
  skyInMs: 280,
  draw,
  // He counters with his eyes shut (his skill), and is as surprised as anyone to win (his victory).
  casterClip: shot => {
    const down = markOf(shot, "down"), launch = markOf(shot, "launch");
    if (down) return { clip: "victory", ms: down.ageMs, loop: true };
    if (launch) return { clip: "superSkill", ms: launch.ageMs + 200, loop: false };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 ? { clip: "skill", ms: shot.contact.ageMs, loop: true } : null;
  },
});
