import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over } from "./AwakeningDraw";

/**
 * 쿵짝 「앙코르 피날레」(2026-10-23 — 기획 4.18, 실수한 사람을 연주로 퇴장시키는 키보드 캣 밈, "박자 맞춰. 쿵, 짝."): 접촉에 화면을 가로지르는
 * 오선이 그어지고 그는 키타를 친다. 정박의 쿵·짝 넷(제자리)마다 오선 위에 음표가 찍히고 그의 몸에 화음 고리가 터진다. 크레셴도(띄우기 — 오선을
 * 가로지르는 거대한 셈여림 쐐기), 아르페지오 셋(공중 — 오르는 음표), 마지막 화음(내려꽂기). 누운 그를 음표 행렬이 무대 밖으로 밀어낸다(누움 —
 * "연주로 퇴장").
 */
const C = AWAKENING_COLORS.encore;

export const ENCORE = Object.freeze({
  /** The staff: five lines `gapBodies` apart at `y` of the view, drawn across over `drawMs`. */
  staff: { y: 0.3, gapBodies: 0.09, drawMs: 260 },
  /** A note: its head `headBodies` across, stamped in over `popMs`. */
  note: { headBodies: 0.13, popMs: 110 },
  /** The beat words (쿵 / 짝): `size` view heights. */
  word: { size: 0.065, holdMs: 220 },
  /** The play-off: `count` notes streaming past him over `lifeMs`. */
  playOff: { count: 16, lifeMs: 900 },
  holdMs: 820,
});

const E = ENCORE;

/** A note: an oval head (tilted), its stem and flag. */
function note(g: Phaser.GameObjects.Graphics, x: number, y: number, head: number, colour: number, alpha: number, beamed = false): void {
  if (!(alpha > 0.01)) return;
  g.fillStyle(colour, alpha).fillEllipse(x, y, head * 1.3, head * 0.95);
  g.fillStyle(colour, alpha).fillRect(x + head * 0.55, y - head * 3, head * 0.14, head * 3);
  if (beamed) g.fillStyle(colour, alpha).fillTriangle(x + head * 0.69, y - head * 3, x + head * 1.4, y - head * 2.2, x + head * 0.69, y - head * 2.3);
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, vh = v.height / shot.perPx;
  // The staff across the view.
  const S = E.staff, drawn = easeOutCubic(over(contact.ageMs, S.drawMs)), sy = v.y + v.height * S.y, gap = h * S.gapBodies;
  const from = side > 0 ? v.x : v.right, to = from + (side > 0 ? 1 : -1) * v.width * drawn;
  for (let i = 0; i < 5; i++) c.paint.lineStyle(2 * shot.perPx, C.staff, 0.85 * fade).lineBetween(from, sy + i * gap, to, sy + i * gap);
  c.light.streak((from + to) / 2, sy + gap * 2, 0, Math.abs(to - from), gap * 5, C.mint, 0.18 * fade);
  // 쿵 / 짝 on the beat: a note on the staff, a chord ring on him, the beat's word.
  const holds = marksOf(shot, "hold"), N = E.note;
  holds.forEach(mark => {
    const k = over(mark.ageMs, N.popMs), x = v.x + v.width * (0.2 + 0.15 * mark.nth), y = sy + gap * (4 - mark.nth % 2 * 2 - 0.5);
    note(c.paint, side > 0 ? x : v.right - (x - v.x), y, h * N.headBodies * easeOutBack(k), C.staff, fade, mark.nth % 2 === 1);
    for (let i = 0; i < 3; i++) {
      const r = over(mark.ageMs - i * 40, 360);
      if (r > 0 && r < 1) c.light.ring(mark.at.x, mark.at.y - h * 0.5, h * (0.2 + 0.8 * easeOutCubic(r)), C.mint, (1 - r) * fade);
    }
    const wk = over(mark.ageMs, 90), out = over(mark.ageMs - E.word.holdMs, 120);
    if (out < 1) c.word(mark.nth % 2, mark.at.x + (mark.nth % 2 === 0 ? -1 : 1) * h * 0.55, mark.at.y - h * 1.15, vh * E.word.size,
      { scale: 1.7 - 0.7 * easeOutBack(wk), alpha: easeOutCubic(wk) * (1 - out) * fade, color: C.mint, stroke: C.ink });
    c.cue(`beat${mark.nth}`, "shake", 5);
  });
  // The crescendo: a great hairpin opening across the staff, a mint column off him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const k = over(launch.ageMs, 360), out = over(launch.ageMs - 500, 250), x0 = v.x + v.width * 0.15, x1 = x0 + v.width * 0.7 * easeOutCubic(k), y = sy + gap * 7;
    c.paint.lineStyle(4 * shot.perPx, C.staff, (1 - out) * fade).lineBetween(x0, y, x1, y - gap * 2 * easeOutCubic(k)).lineBetween(x0, y, x1, y + gap * 2 * easeOutCubic(k));
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2.4, h * 0.28, C.mint, (1 - easeInCubic(over(launch.ageMs, 420))) * fade);
  }
  // The arpeggio: notes climbing over him up there.
  for (const mark of marksOf(shot, "air")) {
    const k = over(mark.ageMs, 400);
    if (k >= 1) continue;
    note(c.paint, mark.at.x + (mark.nth - 1) * h * 0.3, mark.at.y - h * (0.7 + 0.3 * mark.nth) - h * 0.3 * k, h * 0.11, C.mint, (1 - easeInCubic(k)) * fade, true);
    c.light.flare(mark.at.x, mark.at.y - h * 0.5, h * 0.5 * (1 - k), C.mint, (1 - k) * fade);
  }
  // The last chord: three notes stacked over him, a ring along the floor.
  const spike = markOf(shot, "spike");
  if (spike) {
    const k = over(spike.ageMs, 480);
    for (let i = 0; i < 3; i++) note(c.paint, spike.at.x - h * 0.4, spike.at.y - h * (1.0 + i * 0.16), h * 0.13, C.staff, (1 - easeInCubic(k)) * fade);
    c.light.ring(spike.at.x, ground, h * (0.3 + 1.6 * easeOutCubic(k)), C.mint, (1 - k) * fade, 0.25);
    c.cue("chord", "shake", 10);
  }
  // Played off: a stream of notes sweeping past him lying there, off the stage.
  const down = markOf(shot, "down");
  if (down) {
    const P = E.playOff;
    for (let i = 0; i < P.count; i++) {
      const k = over(down.ageMs - jitter(i, 160) * 260, P.lifeMs * 0.7);
      if (k <= 0 || k >= 1) continue;
      const x = down.at.x - side * h * 1.5 + side * v.width * 0.9 * easeInCubic(k), y = ground - h * (0.2 + 0.9 * jitter(i, 161)) + Math.sin(k * 8 + i) * h * 0.08;
      note(c.paint, x, y, h * 0.1, i % 3 === 0 ? C.mint : C.staff, fade * (1 - k * 0.5), i % 2 === 0);
    }
    c.light.flare(down.at.x, ground - h * 0.2, h * 1.3 * Math.exp(-down.ageMs / 150), C.mint, fade);
    c.cue("playoff", "punch", 1.02);
  }
}

export const ENCORE_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.mint,
  holdMs: E.holdMs,
  skyInMs: 300,
  words: locale => [t(locale, "fight.superStage.boom"), t(locale, "fight.superStage.tss")],
  draw,
  // He plays his keytar through it (his entrance), and nods it off (his victory).
  casterClip: shot => {
    const down = markOf(shot, "down");
    if (down) return { clip: "victory", ms: down.ageMs, loop: true };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 ? { clip: "entrance", ms: shot.contact.ageMs, loop: true } : null;
  },
});
