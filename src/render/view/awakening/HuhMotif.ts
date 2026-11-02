import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { burst, markOf, marksOf, over } from "./AwakeningDraw";

/**
 * 어리둥 「방금 그거 뭐야」(2026-10-23 — 기획 4.21, 눈이 커진 고양이와 메아리치는 "허?" 밈, "…어? 지금 싸우는 거야?"): 다른 캐릭터와 반대로 하늘이
 * 밝게 하얘진다. "어?"(제자리, 카메라가 확 다가선다), "어??"(제자리) — 그의 머리 둘레에 놀람 획이 서고 메아리 고리가 퍼진다. 높이 물러났다가
 * 두 앞발로 덮치고(띄우기), 내리누르고(내려꽂기), 누운 그 위로 메아리 고리 세 겹과 "?!"(누움).
 */
const C = AWAKENING_COLORS.huh;

export const HUH = Object.freeze({
  /** A "어?": `size` view heights over him, stamped from `fromScale` over `stampMs`, held `holdMs`. */
  word: { size: 0.09, fromScale: 2.2, stampMs: 90, holdMs: 380 },
  /** The echo: `rings` rings out of his head `everyMs` apart, out to `reachBodies` over `ringMs`. */
  echo: { rings: 3, everyMs: 110, reachBodies: 1.3, ringMs: 520 },
  /** The surprise strokes round his head. */
  strokes: { count: 10, innerBodies: 0.28, outerBodies: 0.5 },
  holdMs: 850,
});

const H = HUH;

/** The echo rings out of (x, y) from `ageMs`. */
function echo(c: CityFightAwakeningCanvas, x: number, y: number, h: number, ageMs: number, fade: number): void {
  for (let i = 0; i < H.echo.rings; i++) {
    const k = over(ageMs - i * H.echo.everyMs, H.echo.ringMs);
    if (k > 0 && k < 1) c.light.ring(x, y, h * (0.2 + H.echo.reachBodies * easeOutCubic(k)), C.ring, (1 - k) * (1 - i * 0.25) * fade);
  }
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, vh = v.height / shot.perPx, head = { x: caster.x + side * h * 0.05, y: caster.y - h * 0.8 };
  // "어?" and "어??": the word over him, the strokes round his head, the echo, the camera rushing in.
  for (const mark of marksOf(shot, "hold")) {
    const W = H.word, k = over(mark.ageMs, W.stampMs), out = over(mark.ageMs - W.holdMs, 150);
    c.word(mark.nth === 0 ? 0 : 1, head.x - side * h * 0.2, head.y - h * 0.55, vh * W.size, { scale: W.fromScale + (1 - W.fromScale) * easeOutBack(k),
      alpha: easeOutCubic(k) * (1 - out) * fade, color: C.word, stroke: C.ink, angle: -8 * side });
    if (out < 1) burst(c.ink, head.x, head.y, H.strokes.count, h * H.strokes.innerBodies, h * H.strokes.outerBodies, h * 0.03, C.ink, (1 - out) * fade, mark.nth);
    echo(c, head.x, head.y, h, mark.ageMs, fade);
    c.light.flare(mark.at.x, mark.at.y - h * 0.5, h * 0.6 * Math.exp(-mark.ageMs / 90), PALETTE.white, fade);
    c.cue(`huh${mark.nth}`, "punch", 1.025);
  }
  // The two-paw pounce: two paw marks of light on him, then the drive down.
  const launch = markOf(shot, "launch"), spike = markOf(shot, "spike");
  if (launch) {
    const k = over(launch.ageMs, 360);
    for (const s of [-1, 1]) c.light.flare(launch.at.x + s * h * 0.15, launch.at.y - h * 0.6, h * 0.5 * (1 - k), C.ring, (1 - easeInCubic(k)) * fade);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2, h * 0.22, C.ring, (1 - k) * fade);
  }
  if (spike) {
    const k = over(spike.ageMs, 420);
    c.light.ring(spike.at.x, ground, h * (0.3 + 1.4 * easeOutCubic(k)), C.ring, (1 - k) * fade, 0.25);
    c.cue("spike", "shake", 10);
  }
  // "?!" over him lying there, three echoes.
  const down = markOf(shot, "down");
  if (down) {
    echo(c, down.at.x, ground - h * 0.3, h * 1.3, down.ageMs, fade);
    const k = over(down.ageMs, 100);
    c.word(2, down.at.x, ground - h * 1.1, vh * 0.11, { scale: 2 - easeOutBack(k), alpha: easeOutCubic(k) * fade * (1 - over(down.ageMs - 650, 160)), color: C.word, stroke: C.ink });
    c.cue("what", "punch", 1.025);
  }
}

export const HUH_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.ring,
  holdMs: H.holdMs,
  skyInMs: 220,
  words: locale => [t(locale, "fight.superStage.huh"), `${t(locale, "fight.superStage.huh").replace(/\?$/, "")}??`, "?!"],
  draw,
  // He leaps back high (his skill) and pounces; he stands there puzzled over him (his victory).
  casterClip: shot => {
    const down = markOf(shot, "down"), launch = markOf(shot, "launch");
    if (down) return { clip: "victory", ms: down.ageMs, loop: true };
    const second = marksOf(shot, "hold")[1];
    return second && !launch ? { clip: "skill", ms: second.ageMs, loop: false } : null;
  },
});
