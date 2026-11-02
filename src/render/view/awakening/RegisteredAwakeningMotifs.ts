import { easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import { registeredAccentHot, registeredAccentSky } from "../../art/RegisteredAccent";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { bell, burst, jitter, over } from "./AwakeningDraw";

/**
 * 등록 선수의 각성기(2026-10-28 — 사용자: "이렇게 만들어진 캐릭터들의 움직임을 재미있게"): 에이전트가 만든 선수에게는 손으로 그린 모티프가
 * 없다(각성기 목록은 기본 선수 id 만 안다). 그래서 그의 **자기 원화**와 **초상에서 뽑은 색**(`registeredAccent`)으로 그린다 — 그의 필살기
 * 동작(`combat.style.super`, 없으면 쿠마의 강타)마다 하나:
 *
 * - `slam` 거인: 그의 서기 자세가 등 뒤에서 거대한 빛의 그림자로 일어서고, 접촉에 그 그림자가 강타 자세로 내려찍는다 — 땅 균열, 먼지 기둥, 충격파.
 * - `combo` 난타: 그의 연타 잔상 셋이 겹쳐 서고, 접촉 뒤 맞은 몸 둘레로 별 타격이 차례로 터진다.
 * - `fast` 섬광: 화면을 가로지르는 속도선과 돌진 잔상, 접촉에 그를 꿰뚫는 큰 베기 한 줄.
 * - `dash` 혜성: 그의 몸에 불꽃 고리가 붙고 뒤로 꼬리가 길어지며, 접촉에 혜성처럼 터진다.
 *
 * 규칙은 바꾸지 않는다 — 이어 치기가 없는 접촉 하나의 연출이다(`contactOnlyMs` 뒤 페이드). 하늘은 그의 색의 밤(`registeredAccentSky`).
 */
export type RegisteredAwakeningAction = "slam" | "combo" | "fast" | "dash";

export const REGISTERED_AWAKENING = Object.freeze({
  /** The charge under his feet before the contact: a ring `ringBodies` across, sparks rising `sparkBodies` over `sparkMs`. */
  charge: { ringBodies: 0.9, sparks: 7, sparkBodies: 1.1, sparkMs: 520 },
  /**
   * `slam`: the giant shadow behind him (`scale` × his body, `back` bodies behind, `alpha` — a glow, not a cut-out), risen over `riseMs`, bursting
   * out over `burstMs` on the contact (`burstScale` larger); the cracks `count` rays `reachBodies` long.
   */
  titan: { scale: 1.85, back: 0.45, riseMs: 420, alpha: 0.26, burstMs: 280, burstScale: 1.3, cracks: 9, crackBodies: 1.6, dust: 6, dustBodies: 0.9 },
  /** `combo`: `ghosts` afterimages `gapBodies` apart; after the contact `stars` blows `everyMs` apart round him, `spreadBodies` wide. */
  flurry: { ghosts: 3, gapBodies: 0.32, stars: 6, everyMs: 70, spreadBodies: 0.42, lifeMs: 260 },
  /** `fast`: `lines` speed lines across the view; the slash `lengthBodies` long through him, drawn over `drawMs`. */
  flash: { lines: 9, ghosts: 4, gapBodies: 0.45, lengthBodies: 3.2, drawMs: 60, lifeMs: 420 },
  /** `dash`: the flame ring round him, the tail `tailBodies` long behind; the burst `sparks` pieces. */
  comet: { ringBodies: 0.55, tailBodies: 2.4, sparks: 12, burstMs: 520 },
  /** It holds this long after its contact before the fade (it has no follow-up). */
  contactOnlyMs: 1000,
});

const R = REGISTERED_AWAKENING, INK = AWAKENING_COLORS.registered.ink, DUST = AWAKENING_COLORS.registered.dust;

/** The charge every one shares before the contact: a ring of his colour under his feet, sparks rising off him. */
function charge(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas, accent: number, hot: number): void {
  const caster = shot.caster, h = caster.h, gone = shot.contact ? over(shot.contact.ageMs, 220) : 0, k = over(shot.ms, 260) * (1 - gone) * shot.fade;
  if (!(k > 0.01)) return;
  c.backLight.ring(caster.x, caster.y, h * R.charge.ringBodies * (0.85 + 0.15 * Math.sin(shot.ms * 0.018)), accent, 0.75 * k, 0.24);
  c.backLight.glow(caster.x, caster.y - h * 0.5, h * 1.4, accent, 0.28 * k, 1.3);
  for (let i = 0; i < R.charge.sparks; i++) {
    const t = ((shot.ms + jitter(i, 3) * R.charge.sparkMs) % R.charge.sparkMs) / R.charge.sparkMs;
    const x = caster.x + (jitter(i, 5) - 0.5) * h * 0.7, y = caster.y - h * R.charge.sparkBodies * t;
    c.light.glow(x, y, h * 0.07, i % 2 === 0 ? accent : hot, bell(t) * k);
  }
}

/** The contact every one shares: a flare and a ring on the struck body (a small spark when guarded), the camera's beat. */
function impact(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas, accent: number, hot: number, shake: number): void {
  const contact = shot.contact;
  if (!contact) return;
  const h = contact.at.h, x = contact.at.x, y = contact.at.y - h * 0.55, k = over(contact.ageMs, 420), fade = shot.fade;
  if (contact.blocked) {
    c.light.flare(x, y, h * 0.6 * (1 - k), PALETTE.white, (1 - k) * fade);
    c.light.ring(x, y, h * (0.15 + 0.5 * easeOutCubic(k)), accent, (1 - k) * fade, 1);
    return;
  }
  c.light.flare(x, y, h * 2.2 * Math.exp(-contact.ageMs / 110), PALETTE.white, fade);
  c.light.flare(x, y, h * 1.2 * (1 - k), hot, (1 - k) * fade, contact.ageMs * 0.004);
  c.light.ring(x, y, h * (0.2 + 1.7 * easeOutCubic(k)), accent, (1 - k) * fade, 1);
  c.light.ring(x, y, h * (0.1 + 1.1 * easeOutCubic(over(contact.ageMs - 60, 360))), hot, (1 - k) * 0.8 * fade, 1);
  c.cue("contact", "shake", shake);
  c.cue("punch", "punch", 1.04);
}

/** `slam` — the giant: his own stand rises behind him as a shadow of light, and slams with him. */
function titan(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas, accent: number, hot: number): void {
  const caster = shot.caster, h = caster.h, side = shot.side, contact = shot.contact, fade = shot.fade, T = R.titan;
  // His own stand risen behind him as a glow, breathing; on the contact it bursts out into the blow (larger, gone).
  const rise = easeOutBack(over(shot.ms, T.riseMs)), burstK = contact ? over(contact.ageMs, T.burstMs) : 0;
  const alpha = T.alpha * Math.min(1, rise) * (1 - easeOutCubic(burstK)) * (0.85 + 0.15 * Math.sin(shot.ms * 0.012)) * fade;
  const scale = T.scale * (0.7 + 0.3 * rise) * (1 + (T.burstScale - 1) * easeOutCubic(burstK)), x = caster.x - side * h * T.back;
  c.backLight.glow(x, caster.y - h * T.scale * 0.5, h * T.scale * 1.1, accent, 0.5 * alpha);
  c.figure("caster", "fightIdle", shot.ms, true, x, caster.y, alpha, { fill: accent, scale, layer: "under", add: true });
  charge(shot, c, accent, hot);
  if (!contact || contact.blocked) { impact(shot, c, accent, hot, 6); return; }
  // The cracks along the ground out of where he was struck, the dust thrown up, the ground's wave.
  const ground = contact.at.y, cx = contact.at.x, k = over(contact.ageMs, 180), out2 = over(contact.ageMs - 300, 520);
  for (let i = 0; i < T.cracks; i++) {
    const a = Math.PI * (i / (T.cracks - 1)) + (jitter(i, 21) - 0.5) * 0.25, reach = h * T.crackBodies * (0.6 + 0.4 * jitter(i, 22)) * easeOutCubic(k);
    const ex = cx + Math.cos(a) * reach, ey = ground + Math.sin(a) * reach * 0.18 - h * 0.01;
    c.ink.lineStyle(3.2 * shot.perPx, INK, 0.85 * (1 - out2) * fade).lineBetween(cx, ground, ex, ey);
    c.light.streak((cx + ex) / 2, (ground + ey) / 2, Math.atan2(ey - ground, ex - cx), reach, h * 0.03, accent, 0.9 * (1 - out2) * fade, hot);
  }
  for (let i = 0; i < T.dust; i++) {
    const t = over(contact.ageMs, 640), s = i % 2 === 0 ? -1 : 1, d = h * T.dustBodies * (0.4 + 0.6 * jitter(i, 23)) * easeOutCubic(t);
    c.paint.fillStyle(DUST, 0.55 * (1 - t) * fade).fillEllipse(cx + s * d, ground - h * 0.12 - h * 0.35 * t * jitter(i, 24), h * 0.42 * (0.6 + t), h * 0.24 * (0.6 + t));
  }
  for (let i = 0; i < 2; i++) {
    const t = over(contact.ageMs - i * 110, 520);
    if (t > 0 && t < 1) c.light.ring(cx, ground, h * (0.4 + 2.4 * easeOutCubic(t)), i === 0 ? accent : hot, (1 - t) * fade, 0.22);
  }
  impact(shot, c, accent, hot, 14);
}

/** `combo` — the flurry: his combo's afterimages over him, then blow after blow bursting round the struck body. */
function flurry(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas, accent: number, hot: number): void {
  const caster = shot.caster, h = caster.h, side = shot.side, contact = shot.contact, fade = shot.fade, F = R.flurry;
  const gone = contact ? over(contact.ageMs - 260, 360) : 0, show = over(shot.ms, 200) * (1 - gone) * fade;
  for (let i = 0; i < F.ghosts; i++) {
    const x = caster.x - side * h * F.gapBodies * (i + 1);
    c.figure("caster", "combo", shot.ms + i * 110, true, x, caster.y, 0.32 * show * (1 - i / (F.ghosts + 1)), { fill: accent, layer: "under", add: true });
  }
  charge(shot, c, accent, hot);
  if (!contact || contact.blocked) { impact(shot, c, accent, hot, 5); return; }
  const at = contact.at, cy = at.y - h * 0.55;
  for (let i = 0; i < F.stars; i++) {
    const age = contact.ageMs - i * F.everyMs, k = over(age, F.lifeMs);
    if (age < 0 || k >= 1) continue;
    const x = at.x + (jitter(i, 31) - 0.5) * 2 * h * F.spreadBodies, y = cy + (jitter(i, 32) - 0.5) * 2 * h * F.spreadBodies * 0.8;
    burst(c.ink, x, y, 8, h * 0.08, h * (0.18 + 0.2 * easeOutCubic(k)), 3 * shot.perPx, INK, (1 - k) * 0.9 * fade, i * 0.7);
    c.light.flare(x, y, h * 0.7 * (1 - k), i % 2 === 0 ? accent : hot, (1 - k) * fade, i);
    const a = (jitter(i, 33) - 0.5) * 1.6 + (i % 2 === 0 ? 0.6 : -0.6);
    c.light.streak(x, y, a, h * 0.9 * easeOutCubic(over(age, 50)), h * 0.035, accent, (1 - k) * fade, hot);
    c.cue(`blow${i}`, "shake", 5);
  }
  impact(shot, c, accent, hot, 8);
}

/** `fast` — the flash: speed lines across the view, his dash trailing afterimages, one great cut through the struck body. */
function flash(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas, accent: number, hot: number): void {
  const caster = shot.caster, h = caster.h, side = shot.side, contact = shot.contact, fade = shot.fade, F = R.flash, view = shot.view;
  const gone = contact ? over(contact.ageMs - 200, 380) : 0, show = over(shot.ms, 160) * (1 - gone) * fade;
  for (let i = 0; i < F.lines; i++) {
    const y = caster.y - h * (0.1 + 0.95 * jitter(i, 41)), t = ((shot.ms * 0.004 + jitter(i, 42)) % 1);
    const x = side > 0 ? view.x + view.width * (1 - t) : view.x + view.width * t;
    c.backLight.streak(x, y, 0, view.width * (0.18 + 0.2 * jitter(i, 43)), h * 0.012, accent, 0.55 * show, hot);
  }
  for (let i = 0; i < F.ghosts; i++) {
    const x = caster.x - side * h * F.gapBodies * (i + 1);
    c.figure("caster", "dash", shot.ms, true, x, caster.y, 0.3 * show * (1 - i / F.ghosts), { fill: accent, layer: "under", add: true });
  }
  charge(shot, c, accent, hot);
  if (!contact || contact.blocked) { impact(shot, c, accent, hot, 5); return; }
  const k = over(contact.ageMs, F.drawMs), out = over(contact.ageMs - F.drawMs, F.lifeMs), at = contact.at, cy = at.y - h * 0.55;
  const a = side > 0 ? -0.42 : Math.PI + 0.42, length = h * F.lengthBodies * easeOutCubic(k);
  c.light.streak(at.x, cy, a, length, h * 0.1 * (1 - 0.6 * out), accent, (1 - out) * fade, PALETTE.white);
  c.ink.lineStyle(4 * shot.perPx, INK, 0.8 * (1 - out) * fade)
    .lineBetween(at.x - Math.cos(a) * length / 2, cy - Math.sin(a) * length / 2, at.x + Math.cos(a) * length / 2, cy + Math.sin(a) * length / 2);
  c.cue("cut", "split", 1);
  impact(shot, c, accent, hot, 10);
}

/** `dash` — the comet: a ring of flame on him, a long tail behind, the burst on contact. */
function comet(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas, accent: number, hot: number): void {
  const caster = shot.caster, h = caster.h, side = shot.side, contact = shot.contact, fade = shot.fade, C = R.comet;
  const gone = contact ? over(contact.ageMs - 120, 420) : 0, show = over(shot.ms, 200) * (1 - gone) * fade, mid = caster.y - h * 0.5;
  c.light.ring(caster.x, mid, h * C.ringBodies * (0.9 + 0.1 * Math.sin(shot.ms * 0.03)), accent, 0.85 * show, 1.25, shot.ms * 0.01);
  c.light.glow(caster.x, mid, h * 1.1, hot, 0.35 * show);
  const tail = h * C.tailBodies * Math.min(1, shot.ms / 600);
  c.backLight.streak(caster.x - side * tail / 2, mid, 0, tail, h * 0.5, accent, 0.6 * show, hot);
  // His own dash burning along the tail: two afterimages in his colour.
  for (let i = 1; i <= 2; i++) {
    c.figure("caster", "dash", shot.ms, true, caster.x - side * tail * i / 3, caster.y, 0.34 * show / i, { fill: accent, layer: "under", add: true });
  }
  for (let i = 0; i < 6; i++) {
    const t = ((shot.ms * 0.003 + jitter(i, 51)) % 1), x = caster.x - side * tail * t, y = mid + (jitter(i, 52) - 0.5) * h * 0.5;
    c.light.glow(x, y, h * 0.09 * (1 - t), hot, (1 - t) * show);
  }
  charge(shot, c, accent, hot);
  if (!contact || contact.blocked) { impact(shot, c, accent, hot, 6); return; }
  const k = over(contact.ageMs, C.burstMs), at = contact.at, cy = at.y - h * 0.55;
  for (let i = 0; i < C.sparks; i++) {
    const a = (i / C.sparks) * Math.PI * 2 + jitter(i, 53) * 0.4, d = h * 1.3 * easeOutCubic(k) * (0.6 + 0.4 * jitter(i, 54));
    c.light.streak(at.x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, a, h * 0.3 * (1 - k), h * 0.04, accent, (1 - k) * fade, hot);
  }
  impact(shot, c, accent, hot, 12);
}

const DRAW: Readonly<Record<RegisteredAwakeningAction, (shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas, accent: number, hot: number) => void>> = {
  slam: titan, combo: flurry, fast: flash, dash: comet,
};

/** A registered fighter's awakening for his super `action` in his `accent` colour (0xRRGGBB). */
export function registeredAwakeningMotif(action: RegisteredAwakeningAction, accent: number): CityFightAwakeningMotif {
  const hot = registeredAccentHot(accent), draw = DRAW[action];
  return Object.freeze<CityFightAwakeningMotif>({
    sky: registeredAccentSky(accent),
    color: accent,
    holdMs: R.contactOnlyMs,
    contactOnlyMs: R.contactOnlyMs,
    draw: (shot, c) => draw(shot, c, accent, hot),
    // Reduced motion: the contact's flare and ring, still.
    drawReduced: (shot, c) => {
      const contact = shot.contact;
      if (!contact || contact.blocked) return;
      const h = contact.at.h, y = contact.at.y - h * 0.55, alpha = shot.fade * (1 - over(contact.ageMs, 900));
      c.light.flare(contact.at.x, y, h * 1.2, hot, alpha);
      c.light.ring(contact.at.x, y, h * 1.1, accent, alpha, 1);
    },
  });
}

/** His super's action as the awakening draws it (`combat.style.super`, else KUMA's): a kind it does not draw falls to the slam. */
export function registeredAwakeningAction(action: string | null | undefined): RegisteredAwakeningAction {
  return action === "combo" || action === "fast" || action === "dash" ? action : "slam";
}
