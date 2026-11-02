import { t } from "../../../app/i18n";
import { easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over } from "./AwakeningDraw";

/**
 * 시큰둥 「여기까지라고」(2026-10-23 — 기획 4.19, 무표정 한마디로 끝나는 그럼피 캣 밈, "…또 왔어? 여기까지만 와."): 일부러 메마르게 간다 — 하늘이
 * 흐린 회색으로 가라앉고 화려한 빛은 거의 없다. 첫 박자에 바닥에 빛나는 선이 그어지고 "탁!"(제자리), 두 번 하악대며 화난 김(제자리), 어둠 속
 * 노란 눈 두 개가 번뜩인다. 냥펀치 한 번(띄우기), 선 너머에 누운 그를 앞발로 톡(누움) — 그리고 큰 글자 하나, "싫어."
 */
const C = AWAKENING_COLORS.thatsFar;

export const THATS_FAR = Object.freeze({
  /** The line on the floor: drawn across `widthBodies` over `drawMs` at the first blow, between them. */
  line: { widthBodies: 1.6, drawMs: 180 },
  /** The glare: his eyes `up` his body, `apart`, flaring at each blow. */
  eyes: { up: 0.72, apart: 0.07, forward: 0.08 },
  /** The hiss: `puffs` of steam per hiss over `lifeMs`. */
  hiss: { puffs: 6, lifeMs: 600 },
  /** "싫어.": `size` view heights at `y` of the view, after `atMs` from the tap, a dry stamp (no bounce). */
  word: { size: 0.12, y: 0.32, atMs: 220, inMs: 60 },
  holdMs: 1000,
});

const F = THATS_FAR;

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, holds = marksOf(shot, "hold"), first = holds[0];
  // The line, drawn on the floor at the first blow ("탁!").
  if (first) {
    const k = easeOutCubic(over(first.ageMs, F.line.drawMs)), x = caster.x + side * h * 0.55, w = h * F.line.widthBodies * k;
    c.under.fillStyle(C.line, 0.9 * fade).fillRect(x - h * 0.025, ground - h * 0.06, h * 0.05, h * 0.14);
    c.light.streak(x, ground + h * 0.01, Math.PI / 2 + 0.25 * side, w * 0.25, h * 0.04, C.line, fade);
    c.light.streak(x, ground, 0.12, w, h * 0.03, C.line, 0.8 * fade);
  }
  c.bodies("both");
  // The glare: two yellow eyes flaring at each blow, his face in the grey.
  const E = F.eyes, glare = Math.max(0, ...holds.map(mark => Math.exp(-mark.ageMs / 260)));
  for (const s of [-1, 1]) c.light.flare(caster.x + side * h * E.forward + s * h * E.apart, caster.y - h * E.up, h * 0.18 * (1 + glare), C.eye, (0.5 + 0.5 * glare) * fade);
  // The hisses (the second and third blows): puffs of angry steam off him.
  for (const mark of holds.slice(1)) {
    const k = over(mark.ageMs, F.hiss.lifeMs);
    if (k >= 1) continue;
    for (let i = 0; i < F.hiss.puffs; i++) {
      const a = -Math.PI / 2 + side * (0.4 + 0.7 * jitter(i, mark.nth + 170)), d = h * 0.6 * easeOutCubic(k);
      c.paint.fillStyle(C.steam, 0.55 * (1 - k) * fade).fillCircle(caster.x + side * h * 0.2 + Math.cos(a) * d, caster.y - h * 0.8 + Math.sin(a) * d, h * (0.05 + 0.1 * k));
    }
    c.cue(`hiss${mark.nth}`, "shake", 4);
  }
  // The swat: one clean white arc.
  const launch = markOf(shot, "launch");
  if (launch) {
    const k = over(launch.ageMs, 300);
    c.light.streak(launch.at.x - side * h * 0.2, launch.at.y - h * 0.6, -0.9 * side, h * 1.3, h * 0.05, PALETTE.white, (1 - k) * fade);
  }
  // The tap on him lying there, then "싫어." — a dry stamp, no bounce.
  const down = markOf(shot, "down");
  if (down) {
    c.light.flare(down.at.x, ground - h * 0.15, h * 0.3 * Math.exp(-down.ageMs / 90), PALETTE.white, fade);
    const W = F.word, k = over(down.ageMs - W.atMs, W.inMs);
    if (down.ageMs >= W.atMs) {
      c.word(0, v.centerX, v.y + v.height * W.y, v.height / shot.perPx * W.size, { alpha: easeOutCubic(k) * fade, color: PALETTE.white, stroke: C.ink,
        scale: 1.06 - 0.06 * easeOutBack(k) });
      c.cue("no", "shake", 3);
    }
  }
}

export const THATS_FAR_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.eye,
  holdMs: F.holdMs,
  skyInMs: 380,
  words: locale => [t(locale, "fight.superStage.no")],
  draw,
  // He barely moves: his shove (his skill) once, then his arms crossed (his victory).
  casterClip: shot => {
    const first = markOf(shot, "hold");
    if (!shot.contact || shot.contact.blocked || !first) return null;
    return first.ageMs < 520 ? { clip: "skill", ms: first.ageMs + 120, loop: false } : { clip: "victory", ms: first.ageMs - 520, loop: true };
  },
});
