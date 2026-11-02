import type { CityFightBoutHit } from "../../../sim/cityFight/bout/CityFightFighterBout";
import type { NativeCityKumaFighterState } from "../../../sim/cityFight/NativeCityKumaFighter";
import type { NativeCityImpactTier } from "../../../sim/cityFight/NativeCityCombatTuning";
import type { VillageMeleeCue } from "../../audio/CityFightAudio";
import { combatSlowMoIntensityAt, combatSlowMoScaleAt, type CombatSlowMoBeat } from "../../effects/CombatSlowMo";
import { nativeCityHitStopMs } from "../../effects/NativeCityFightFeel";
import { nativeCityExchangeHitStopMs } from "../../effects/NativeCityExchangeFx";
import type { NativeCityStageCameraFrame } from "../village/NativeCityFightStageFraming";
import type { ArenaFighterMotionSpec } from "../../view/ArenaFighterMotion";

/**
 * 무투장 AI 대결(마을 파이터 둘의 관전 경기)의 화면 손맛(2026-10-20, 사용자: "액션감이 턱없이 부족하고 짜릿함이 없다" — 카메라를 두 선수에
 * 맞춰 당기고, 마을 대결과 같은 타격 등급별 불꽃·히트스톱·흔들림, KO 슬로). 규칙은 건드리지 않는다: 히트스톱·슬로는 경기 스텝을 쌓는
 * 속도만 바꾼다(같은 스텝, 같은 순서 — 결과와 digest 가 그대로다). 불꽃·흔들림의 수치는 마을 대결 레시피(`feel.tiers`,
 * `nativeCityHitStopMs`) 그대로이고, 이 파일은 관전 경기에만 다른 것(카메라 구도, KO 슬로, 막힘의 멈춤)만 갖는다.
 */
export const ARENA_DUEL_FEEL = Object.freeze({
  /**
   * The KO's slow motion after its freeze: 0.6× for 80 ms, back over 140 ms. The ring's colour drains a little through it (`desaturate`,
   * the village finisher's 0.28). (It was 0.25× for 400 ms; once the KO flew — `knockback.ko`, 2026-10-20 game-animator — that held the
   * launched body still, then the release whipped it away. The ink impact frame is the stop — Rivals: freeze, then a full-speed launch — and
   * a light slow is left for the landing's read.)
   */
  koSlowMo: Object.freeze({ scale: 0.6, holdMs: 80, releaseMs: 140, vignette: 0, desaturate: 0.28, cooldownMs: 0 }) satisfies CombatSlowMoBeat,
  /** A heavy blow's punch-in on the camera (CameraRig.impactZoom: factor, rise, fall — game-animator: 2.5 % over 160 ms). */
  heavyPunch: Object.freeze({ zoom: 1.025, riseMs: 60, fallMs: 100 }),
  /**
   * The new moments' own payoff (2026-10-22 5차 — 사용자 추천 1번 "새 장면 전용 연출"; they reused a plain blow's or splat's before):
   * - `clash`: after its freeze a short slow (≈0.2 s at 0.35×), a stronger punch-in and a spark twice as big.
   * - `bounce`: a body springing off the rope (`CityFightBoutBounce`) — its freeze held a beat longer, a punch-in and a sideways shake.
   * - `thirdJuggle`: the three-hit air combo's third air hit (`airCombo3`) — a longer freeze and a punch-in.
   * - `iceTrailEveryMs`: the penguin's sliding down (`KumaFighterOverrides.downSlide`) leaves an ice spray this often (screen ms).
   * Reduced motion: no slow, punch-in or shake (the freezes stay).
   */
  clash: Object.freeze({ slowMo: Object.freeze({ scale: 0.35, holdMs: 120, releaseMs: 100, vignette: 0, desaturate: 0, cooldownMs: 0 }) satisfies CombatSlowMoBeat,
    zoom: 1.045, riseMs: 50, fallMs: 170, sparkScale: 2 }),
  bounce: Object.freeze({ stopMs: 60, zoom: 1.035, riseMs: 50, fallMs: 150, shakePx: 9, shakeMs: 220 }),
  thirdJuggle: Object.freeze({ extraStopMs: 70, zoom: 1.035, riseMs: 40, fallMs: 130 }),
  iceTrailEveryMs: 70,
  /**
   * An awakening's damage numbers over the village's size (2026-10-23): the village's numbers are set in screen px for its small bodies, and
   * this frame draws the bodies about twice as big — a "3" read as a speck by the struck's face.
   */
  awakeningNumberScale: 1.7,
  /**
   * Where a blow lights up between bodies of different sizes (2026-10-23 2차, 감사 C P1-4 — a big striker's jab passed over a small body's
   * head with its spark on that body's chest, b12 #2–6; two swings met with their spark over the small body, #700): a swing's contact at the
   * striker's own `contactHeight` held inside the struck's drawn body, `lowShare`..`highShare` of its height (equal bodies keep theirs —
   * `arenaDuelContactBodies`); two swings meeting at the lower of the two chests (`arenaDuelClashHeightPx`).
   */
  contact: Object.freeze({ lowShare: 0.4, highShare: 0.85 }),
  /**
   * A summon's KO (2026-10-23 2차, 감사 B P2-10 — the penguin's ice block knocked the other out while he himself was being hit, b07
   * #2675–2691: who won?): the KO's push-in and its ink plate centre on the summon, the summon stays on him (the result clears the stage's
   * summons at once) and its summoner is lit (his awakening caster's light and corner outline, `NativeCityKumaView.highlight`) — both for
   * `ownerLightMs` screen ms.
   */
  summonKo: Object.freeze({ ownerLightMs: 700 }),
  /**
   * The cross (2026-10-25 교차 돌파, `CityFightBoutExchange`; numbers after the same day's game-animator review): its crouch lights both pairs
   * of eyes (`glintAheadStrides` in front of him) under a short slow (`startSlow`). A pass with a winner lands its blow at contact — the cut
   * across the struck body (`ArenaCrossSlashView`, `slashLengthStrides` long) and a punch-in (`passZoom` / `finalPassZoom`), a chip's freeze
   * `chipStopMs`, the last one's the heavy blow's with the ink plate's short beat and a slow (`finalSlow`), the camera held through it; a tie
   * only sparks where they cross (`sparkScale`, freeze `passStopMs`). `laneStrides`: the frame holds the whole run's lane (the pass's gap and
   * a margin each side) — the pair's gap closing to nothing and opening again pumped the zoom.
   */
  cross: Object.freeze({
    startSlow: Object.freeze({ scale: 0.4, holdMs: 120, releaseMs: 120, vignette: 0, desaturate: 0, cooldownMs: 0 }) satisfies CombatSlowMoBeat,
    passStopMs: 55, chipStopMs: 55, sparkScale: 1.4, glintHeight: 0.82, glintAheadStrides: 0.1, slashLengthStrides: 2.5,
    passZoom: Object.freeze({ zoom: 1.015, riseMs: 30, fallMs: 90 }), finalPassZoom: Object.freeze({ zoom: 1.035, riseMs: 30, fallMs: 120 }),
    finalSlow: Object.freeze({ scale: 0.35, holdMs: 140, releaseMs: 160, vignette: 0, desaturate: 0.15, cooldownMs: 0 }) satisfies CombatSlowMoBeat,
    laneStrides: 2.4 }),
  /**
   * The rush (2026-10-25, `CityFightBoutRush`): a spark where the fists meet each blow (`sparkScale` of a body — between the two drawn
   * reaches, `fists`) — on the winner's fist, at the loser's guard, once he is pushed — a light shake every other one. It sits at the fists'
   * height (`sparkHeight` of the shorter body — the strings' blows are drawn high; the village's contact height sat at the waist).
   */
  rush: Object.freeze({ sparkScale: 0.8, sparkHeight: 0.74, shakePx: 3, shakeMs: 80 }),
});

/**
 * A swing's contact on the struck (body heights of the struck's drawn body, `ARENA_DUEL_FEEL.contact`): the striker's `contactHeight` of his
 * own drawn height (`strikerPx`), held between `lowShare` and `highShare` of the struck's (`struckPx`).
 */
export function arenaDuelContactBodies(strikerPx: number, struckPx: number, contactHeight: number): number {
  const C = ARENA_DUEL_FEEL.contact, struck = Math.max(1, struckPx);
  const own = contactHeight * Math.max(0, Number.isFinite(strikerPx) ? strikerPx : struck) / struck;
  return Math.max(C.lowShare, Math.min(C.highShare, own));
}

/** Two swings met (`CityFightBoutClash`): the spark's height over the feet (world px) — the lower of the two chests (`contactHeight` up). */
export function arenaDuelClashHeightPx(bodiesPx: readonly number[], contactHeight: number): number {
  const finite = bodiesPx.filter(px => Number.isFinite(px) && px > 0);
  return finite.length === 0 ? 0 : contactHeight * Math.min(...finite);
}

/**
 * The fighters' body motion in the AI duel (2026-10-23 arena audit, game-animator reviews A–C — `ArenaFighterMotion`, handed to each fighter
 * view as `arenaMotion`): numbers in body heights so a small ODDBOUT body and a big parody body move alike.
 * - `anticipation`: the combo / slam windup stood ~0.5 s as one still (b01 #72–94, b05 #42–73, b09 #139–161, b11 #58–80) — pulled back 3 %
 *   with a 0.96 squash over its first 70 %, then sprung 2 % past rest with a 1.03 stretch over the 3 frames before the contact.
 * - `hurt`: one hurt cell held 2 s through a string (b01 #100–224) and a jab moved nothing (b11 #82–150) — ~4–5 px a light blow, ~8 px a heavy
 *   one at the arena's body size, let back over ~0.15–0.2 s.
 * - `cut`: a cut swing jumped its weapon in one frame (b01 #94→96) — the swing cell held one frame, the flinch tipped back 7° and eased out
 *   over 4 frames.
 * - `corner`: same-colour pairs read as one lump (b02, b09 #1889–1915; overlaps b05 #54–90) — 2 px corner outlines inside 1.35 strides.
 * - `cast`: a black-suited caster sank into his awakening's dark stage (b05 #1742–1788) — +35 % brightness and his outline while he casts.
 */
export const ARENA_FIGHTER_MOTION: ArenaFighterMotionSpec = Object.freeze({
  anticipation: Object.freeze({ pullShare: 0.7, pullBodies: 0.03, squashY: 0.96, springMs: 50, pushBodies: 0.02, stretchY: 1.03, settleMs: 90,
    releaseMs: 90 }),
  hurt: Object.freeze({ lightPushBodies: 0.012, heavyPushBodies: 0.02, holdMs: 40, returnMs: 150 }),
  cut: Object.freeze({ holdMs: 16, spanMs: 66, tiltDeg: 7, pushBodies: 0.015 }),
  corner: Object.freeze({ nearStrides: 1.35, fadeStrides: 0.25, rimScreenPx: 2, frontPx: 0.03 }),
  cast: Object.freeze({ lift: 0.35 }),
});

/**
 * 관전 카메라(2026-10-20 — game-animator: 몸이 화면 높이의 31 % 였다 → 약 45 %): 두 선수 중 큰 몸이 화면 높이의 `bodyShare` 로 보이게
 * 당기고, 둘이 벌어지면 사이 + 양쪽 `padBodies` 몸 키가 화면 폭에 들도록 넓힌다(링의 기본 맞춤 × `zoomRange`). 발은 화면 높이의
 * `feetAt` 에 선다(아래 단추 위). 배율·중심은 지수 감쇠로 따라간다(모션 감소: 곧장). KO 에는 쓰러지는 쪽으로 `ko.leadPx` 화면 px 비키며
 * `ko.zoom` 만큼 밀어 들어가 그대로 머문다(모션 감소: 없음). 마을 무대 카메라(`native-city-fighters.json` stage)는 마을 것이라 이
 * 경기의 숫자는 여기 따로 둔다.
 */
export const ARENA_DUEL_CAMERA = Object.freeze({

  bodyShare: 0.45,
  padBodies: 0.9,
  feetAt: 0.87,
  /**
   * The screen's top share kept for the HP bars: a body thrown up (the air combo) is framed below it — the zoom eases out just enough. The
   * old bars' share; the duel screen passes its face HUD's floor instead (`ArenaDuelCameraInput.topShare`, about 0.3 — 2026-10-24: thrown
   * bodies and their afterimages went up to 256 px behind the HUD).
   */
  airTopShare: 0.14,
  /**
   * A span fitted under the HUD keeps this share of room for the rig's punch-ins on a blow (`heavyPunch` / `clash` / `bounce`, up to 4.5 %
   * — 2026-10-24: fitted exactly, a blow's punch pushed the drawing's top back into the HUD).
   */
  punchRoom: 0.045,

  airFollowMs: 120,

  airMinZoomShare: 0.7,
  airFeetMaxAt: 0.97,
  liftFollowMs: 90,
  /**
   * × the ring's fit. At 2.2 the fighters' sheets draw about 1.07× their cells (406 px, measured 2026-10-20 at 1920 × 1080); at 2.8 about
   * 1.36× — the painted cels hold it, a harder pull softens them.
   */
  zoomRange: Object.freeze([1, 2.8] as const),
  /**
   * A phone held upright (2026-10-24 — 사용자: 모바일 세로 화면 대응; the mobile site is locked upright): the screen is as narrow as the pair,
   * so the landscape framing — each side's `padBodies` and the ring fit's `zoomRange` top — left the bodies about 15 % of its height (121 CSS
   * px on a 390 × 844 phone) under a third of HUD and an empty arcade. Under `aspect` (width / height) the sides keep `padBodies` and the pull
   * goes to `zoomMax` × the ring's fit: the bodies about 1.4× as big (150–175 CSS px), the floor where it was, the room over them for the air
   * combos. The texels hold: the upright backbuffer is about the phone's own pixels, so a mobile sheet texel covers ~1.8 of them at the
   * closest pull (the landscape phone's ~1.7 — its backbuffer is upscaled about 2×).
   */
  portrait: Object.freeze({ aspect: 0.8, padBodies: 0.45, zoomMax: 4 }),
  zoomFollowMs: 420,
  centerFollowMs: 240,
  /** Each body's half width (body heights) and the share of the screen width kept clear of an edge — the hard follow. */
  bodyHalfWidth: 0.3,
  edgeShare: 0.06,
  ko: Object.freeze({ zoom: 1.06, inMs: 300, leadPx: 20 }),
});

/** What the duel camera frames this frame (world px): both fighters' feet and the taller body's height. */
export interface ArenaDuelCameraInput {
  readonly feet: readonly [readonly [number, number], readonly [number, number]];
  readonly tallPx: number;
  /** The ring's normal fit at the default zoom (`nativeCityCameraFrame` × `NATIVE_CITY_ZOOM_STYLE.default`). */
  readonly fitZoom: number;
  readonly screen: { readonly width: number; readonly height: number };
  readonly reducedMotion: boolean;
  /** The KO'd corner's feet x (world px) once the KO landed; null before. */
  readonly koVictimX: number | null;
  /**
   * How high a body thrown up (the air combo, 2026-10-22) or jumping after it is drawn now, at most (world px above its feet; 0 / absent: both
   * on the ground): the frame takes it in above the tallest body.
   */
  readonly airPx?: number;
  /**
   * Each body's drawn lift now (world px over its feet — `NativeCityKumaView.drawnLiftPx`): part of the flight's height the frame takes in
   * from the floor. Absent: both on the ground.
   */
  readonly lifts?: readonly [number, number];
  /** The screen's top share the HUD takes (the face HUD's floor, `ArenaFaceHud.floorShare`): a flight is framed under it. Absent: `airTopShare`. */
  readonly topShare?: number;

  readonly reachPx?: number;
  /**
   * A span along the ground to keep framed whatever the gap (world px x, low to high — 2026-10-25 the cross's lane, `ARENA_DUEL_FEEL.cross`):
   * the pair running through each other frame as if they stood at its ends. Absent: the pair alone.
   */
  readonly laneX?: readonly [number, number] | null;
}

/** The duel's camera (pure — the scene hands the frame to its `CameraRig`). */
export class ArenaDuelCamera {
  private eased: { zoom: number; centerX: number; feetY: number } | null = null;
  private koMs = 0;
  /** The lowest body's lift the frame follows (world px), and where its feet sit (share of the screen height). */
  private lift = 0;
  private feetAt: number = ARENA_DUEL_CAMERA.feetAt;

  frame(input: ArenaDuelCameraInput, dtMs: number): NativeCityStageCameraFrame {
    const C = ARENA_DUEL_CAMERA, { width: W, height: H } = input.screen, dt = Math.max(0, Math.min(100, dtMs));
    const [a, b] = input.feet, tall = Math.max(1, input.tallPx), lifts = input.lifts ?? [0, 0];
    const lane = input.laneX ?? null;
    const left = Math.min(a[0], b[0], lane?.[0] ?? Infinity), right = Math.max(a[0], b[0], lane?.[1] ?? -Infinity), feetY = Math.max(a[1], b[1]);
    // The vertical span to frame: from the floor to the top of the highest flight (its peak ahead of it) or drawing.
    const high = Math.max(0, input.airPx ?? 0, lifts[0], lifts[1]);
    const span = Math.max(tall + high, input.reachPx ?? 0) * (1 + C.punchRoom);
    const portrait = W / Math.max(1, H) < C.portrait.aspect, pad = portrait ? C.portrait.padBodies : C.padBodies;
    const groundZoom = Math.max(input.fitZoom * C.zoomRange[0], Math.min(input.fitZoom * (portrait ? C.portrait.zoomMax : C.zoomRange[1]),
      C.bodyShare * H / tall, W / Math.max(1, right - left + 2 * pad * tall)));
    // A flight — or a drawing reaching higher than the ground frame holds under the HUD — keeps its whole span between the feet line and the
    // HUD, zooming out no further than `airMinZoomShare` of the ground's.
    const topShare = Math.max(0, Math.min(C.feetAt - 0.1, input.topShare ?? C.airTopShare));
    const up = high > 0 || span * groundZoom > (C.feetAt - topShare) * H;
    const airFit = up ? (C.feetAt - topShare) * H / span : Number.POSITIVE_INFINITY;
    const zoom = Math.max(input.fitZoom * C.zoomRange[0], groundZoom * (up ? C.airMinZoomShare : 1), Math.min(groundZoom, airFit));
    const target = { zoom, centerX: (left + right) / 2, feetY };
    const from = this.eased ?? target;
    const k = (ms: number) => input.reducedMotion ? 1 : 1 - Math.exp(-dt / Math.max(1, ms));
    const kz = k(target.zoom < from.zoom && airFit <= target.zoom * 1.0001 ? C.airFollowMs : C.zoomFollowMs), kc = k(C.centerFollowMs);
    const next = { zoom: from.zoom + (target.zoom - from.zoom) * kz, centerX: from.centerX + (target.centerX - from.centerX) * kc,
      feetY: from.feetY + (target.feetY - from.feetY) * kc };
    // A pair flying apart (a launch) widens at once: never closer than both bodies plus their edge margins fit.
    const fitsBoth = W * (1 - 2 * C.edgeShare) / Math.max(1, right - left + 2 * C.bodyHalfWidth * tall);
    next.zoom = Math.max(input.fitZoom * C.zoomRange[0], Math.min(next.zoom, fitsBoth));
    // Both bodies inside the edges, at once (the middle of them when they cannot both fit).
    const half = W / 2 / next.zoom, margin = C.bodyHalfWidth * tall + C.edgeShare * W / next.zoom;
    const minCenter = right + margin - half, maxCenter = left - margin + half;
    next.centerX = minCenter > maxCenter ? (left + right) / 2 : Math.max(minCenter, Math.min(maxCenter, next.centerX));
    this.eased = next;
    // The floor on the feet line; a span the zoom could not take in sinks it toward the bottom (its top under the HUD), and only what still
    // does not fit there lifts the frame (world px).
    const kl = k(C.liftFollowMs);
    const feetAtTarget = up ? Math.min(C.airFeetMaxAt, Math.max(C.feetAt, topShare + span * next.zoom / H)) : C.feetAt;
    const excess = up ? Math.max(0, span - (C.airFeetMaxAt - topShare) * H / next.zoom) : 0;
    this.lift += (excess - this.lift) * kl;
    this.feetAt += (feetAtTarget - this.feetAt) * kl;
    const lineY = next.feetY - this.lift, feetAt = this.feetAt;
    let out = { zoom: next.zoom, centerX: next.centerX, centerY: lineY - (feetAt - 0.5) * H / next.zoom };
    if (input.koVictimX !== null && !input.reducedMotion) {
      this.koMs += dt;
      const u = Math.min(1, this.koMs / Math.max(1, C.ko.inMs)), w = 1 - (1 - u) ** 3;
      const zoomed = out.zoom * (1 + (C.ko.zoom - 1) * w), side = Math.sign(input.koVictimX - out.centerX);
      // Zoomed about the feet line (the feet stay where they stood), drifting toward the fallen body.
      out = { zoom: zoomed, centerX: out.centerX + side * C.ko.leadPx * w / zoomed,
        centerY: lineY - (feetAt - 0.5) * H / zoomed };
    } else this.koMs = 0;
    return out;
  }
}

/**
 * How high corner `target`'s body is up in the air now (body heights over his feet, `KumaCombatState.air`; 0 on the ground): a blow that
 * found him there draws its spark, letter and number at his lifted body (2026-10-23 — the air combo's chase and spike burst on the floor
 * under him).
 */
export function arenaDuelAirBodies(snapshot: { readonly states: readonly [NativeCityKumaFighterState, NativeCityKumaFighterState] },
  target: 0 | 1): number {
  return snapshot.states[target].combat.air?.heightBodies ?? 0;
}

/**
 * Where a blow on corner `target` lights up (body heights over his feet): his flight in the rules (`arenaDuelAirBodies`), or — the KO — the
 * body as drawn: the KO lays him down in the rules at once while his drawn fall still comes down from the juggle (2026-10-23 audit: four air
 * KOs of twelve burst on the empty floor under him).
 */
export function arenaDuelBlowAirBodies(snapshot: { readonly states: readonly [NativeCityKumaFighterState, NativeCityKumaFighterState] },
  target: 0 | 1, victim: { readonly drawnLiftPx: number }, bodyPx: number, ko: boolean): number {
  const rules = arenaDuelAirBodies(snapshot, target);
  return ko ? Math.max(rules, victim.drawnLiftPx / Math.max(1, bodyPx)) : rules;
}

/** One landed contact as the duel shows it: the village impact tier, its freeze (ms) and its sound. */
export interface ArenaDuelBlow {
  readonly impact: NativeCityImpactTier;
  readonly stopMs: number;
  readonly cue: VillageMeleeCue;
}

/**
 * A bout contact (`CityFightBoutHit`) as the village fight's recipe draws it: a swing keeps its tier (light 67 ms / heavy 133 ms), a summoned
 * object hits as the village's dash ("쾅!", 140 ms), the blow that knocks out is the KO (187 ms). A blow his swing's armour ate stops half as
 * long (`feel.armoredHitStopScale`) and clangs; a guarded one stops as the village's guard beats (jab 50 / clash 80 ms).
 */
export function arenaDuelBlow(hit: Pick<CityFightBoutHit, "tier" | "blocked" | "summon" | "air">, armored: boolean, ko: boolean): ArenaDuelBlow {
  if (hit.blocked && !ko) {
    return { impact: hit.tier, stopMs: nativeCityExchangeHitStopMs(hit.tier === "heavy" || hit.summon ? "clash" : "jabGuard"), cue: "guardUp" };
  }
  // The air combo (2026-10-22): the launch hits as the dash (the body flies), the spike as the slam (driven down).
  const impact: NativeCityImpactTier = ko ? "ko" : hit.air === "spike" ? "slam" : hit.summon || hit.air === "launch" ? "dash" : hit.tier;
  const cue: VillageMeleeCue = ko ? "ko" : armored ? "hitArmored" : impact === "light" ? "hit" : "hitHeavy";
  return { impact, stopMs: nativeCityHitStopMs(impact, armored && !ko), cue };
}

/**
 * The freeze ladder's top on the arena (2026-10-23 audit — game-animator: "flat at the top": a super's contact froze as a plain heavy, an
 * awakening's beats shorter than a jab, a 6-frame jab freeze on every air juggle hit — the freezes ate 15–26 % of the screen time):
 * - `superMs`: an unguarded super contact holds at least this (14 frames).
 * - `quickMs`: an air juggle hit, and the `quickFrom`-th and later blows of one unbroken string (the same striker, each within `stringGapMs`
 *   fight ms of the last, the other landing none), hold at most this (4 frames).
 * - `followUpMs` / `followUpLastMs`: an awakening follow-up's beats hold at most the first (3 frames), its last beat at least the second
 *   (15 frames) — the sequence runs, its end lands.
 * The KO, a launch and a spike keep theirs.
 */
export const ARENA_DUEL_STOPS = Object.freeze({ superMs: 233, quickMs: 67, quickFrom: 3, stringGapMs: 600, followUpMs: 50, followUpLastMs: 250 });

/** A blow's freeze on the arena's ladder (`ARENA_DUEL_STOPS`): `streak` — the striker's blow count in his unbroken string, this one included. */
export function arenaDuelStopMs(base: number, hit: Pick<CityFightBoutHit, "blocked" | "super" | "air" | "exchange">, ko: boolean, streak: number): number {
  const S = ARENA_DUEL_STOPS;
  if (ko || hit.blocked) return base;
  // A cross's chip in passing (2026-10-25): shorter than the pass's own freeze — the pass is the beat, the chip its echo.
  if (hit.exchange && !hit.exchange.final) return Math.min(base, ARENA_DUEL_FEEL.cross.chipStopMs);
  if (hit.super === true) return Math.max(base, S.superMs);
  if (hit.air === "launch" || hit.air === "spike") return base;
  return hit.air === "juggle" || streak >= S.quickFrom ? Math.min(base, S.quickMs) : base;
}

/** An awakening follow-up beat's freeze on the arena (`ARENA_DUEL_STOPS`): its own, capped short until the last beat, the last held long. */
export function arenaDuelFollowUpStopMs(base: number, last: boolean, ko: boolean): number {
  const S = ARENA_DUEL_STOPS;
  return ko ? base : last ? Math.max(base, S.followUpLastMs) : Math.min(base, S.followUpMs);
}

/** One screen frame of the duel's clock: how much fight time flows (the session steps on it). */
export interface ArenaDuelClockFrame {
  readonly hitStopped: boolean;
  readonly timeScale: number;
  readonly fightDtMs: number;
  /** The KO slow motion's screen desaturation now (0..1). */
  readonly desaturate: number;
}

/**
 * The duel's hit stop and KO slow motion on screen time (pure): a freeze holds whole frames (the fight clock 0 — both bodies stand in the
 * contact), the KO's slow motion starts once its freeze lets go. Reduced motion keeps the freezes (a freeze is not motion — the village
 * rule) and drops the slow motion.
 */
export class ArenaDuelClock {
  private stopMs = 0;
  private slowAgeMs: number | null = null;
  private beat: CombatSlowMoBeat = ARENA_DUEL_FEEL.koSlowMo;

  /** A contact's freeze: the longer one wins. */
  stop(ms: number): void { if (ms > this.stopMs) this.stopMs = ms; }
  /** A slow motion after a freeze: the KO's (`koSlowMo`), or `beat` (the clash's). */
  slow(beat: CombatSlowMoBeat = ARENA_DUEL_FEEL.koSlowMo): void { this.slowAgeMs = 0; this.beat = beat; }
  get stopping(): boolean { return this.stopMs > 0; }

  frame(screenDtMs: number): ArenaDuelClockFrame {
    const dt = Number.isFinite(screenDtMs) ? Math.max(0, screenDtMs) : 0, beat = this.beat;
    if (this.stopMs > 0) {
      this.stopMs = dt > 0 ? Math.max(0, this.stopMs - dt) : this.stopMs;
      return { hitStopped: true, timeScale: 0, fightDtMs: 0, desaturate: this.desaturate(beat) };
    }
    const age = this.slowAgeMs;
    const timeScale = age === null ? 1 : combatSlowMoScaleAt(beat, age), desaturate = this.desaturate(beat);
    if (age !== null) this.slowAgeMs = age + dt >= beat.holdMs + beat.releaseMs ? null : age + dt;
    return { hitStopped: false, timeScale, fightDtMs: dt * timeScale, desaturate };
  }

  private desaturate(beat: CombatSlowMoBeat): number {
    return this.slowAgeMs === null ? 0 : beat.desaturate * combatSlowMoIntensityAt(beat, this.slowAgeMs);
  }
}
