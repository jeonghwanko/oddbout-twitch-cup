import type Phaser from "phaser";
import type { Locale } from "../../app/Locale";
import { clamp01 } from "../../sim/geom";
import type { CityFightFollowUp, CityFightFollowUpBeatKind } from "../../sim/cityFight/CityFightAwakening";
import { easeOutBack, easeOutCubic } from "../art/easing";
import { FONT, PALETTE, cssHex } from "../art/palette";
import { VILLAGE_DEPTHS } from "../depths";
import { nativeCityDisplayDamage } from "../effects/NativeCityFloatText";
import type { NativeCityBackdropFrame } from "../effects/NativeCityScreenGrade";
import { CityFightLightPool, cityFightBodyBox } from "./CityFightLightKit";

/**
 * 각성기 모티프 실행기(2026-10-23 — 사용자: "각성기는 각각의 캐릭터의 개성이 드러나서 매력을 뽐낼 수 있는 스킬", "공용 도구를 만들어서 다른 빛
 * 연출을"; 기획 docs/Plan/2026-10-23-character-awakenings). 캐릭터마다 모티프 하나(`render/view/awakening/*`)가 자기 모양을 그리고, 이 실행기가
 * 공통을 맡는다 —
 *
 * - 시계: 필살기 시작부터의 화면 ms, 접촉(막힘 여부·자리·대미지), 규칙의 이어 치기 시계(`progress`), 들어간 박자(`marks` — 종류·나이·그때 맞은
 *   몸·대미지), 마지막 박자 뒤의 시간. 모티프는 이 "지금의 장면"(`CityFightAwakeningShot`)만 보고 그린다 — 상태를 갖지 않는다.
 * - 끝: 마지막 박자 뒤 `holdMs`, 끊긴 이어 치기(KO), 이어 치기 없는 접촉(짧은 판), 닿지 않은 필살기 — 그 뒤 페이드.
 * - 층(`CityFightAwakeningCanvas`): 몸 뒤 빛, 칠한 막, 두 몸 다시 그리기(몸 뒤에 둔 것 위로 몸을 세운다), 칠한 소품, 앞 빛, 글자.
 *   모두 대미지 숫자·연타 수 아래 깊이다(`VILLAGE_DEPTHS.fightSuperProp` 위).
 * - 하늘: 모티프의 네 색(`sky`)으로 배경 패스의 밤 셰이더를 물들인다(`backdrop` — 그 색을 받는 무대만, `skyColours`).
 * - 시전자의 연기: 모티프가 고른 그의 원화 칸(`casterClip`) — 장면이 그의 몸에 덮는다(규칙은 그가 서 있다).
 * - 합계 도장: 마지막 박자 뒤 맞은 몸 위에 각성기 전체 대미지(접촉 + 박자, 숫자와 같은 HP×10 정수)를 크게 찍는다.
 *
 * 모션 감소: 하늘(멈춤)과 모티프의 `drawReduced`(마무리 한 컷)만 — 흔들림 신호·연타 모양·도장 튀김 없음.
 */

/** A body on screen (world px): its middle x, its feet y, its height. */
export interface CityFightAwakeningBody { readonly x: number; readonly y: number; readonly h: number }

/** The sky a motif lays over the stage (the backdrop pass's night, in its own four colours). */
export interface CityFightAwakeningSky { readonly deep: number; readonly high: number; readonly cloud: number; readonly star: number }

/** The camera beats a motif asks the fight's presenter for (render only): the lean (`lead`, CSS px), a jolt (`split`), a shake, a zoom punch. */
export type CityFightAwakeningCue = "lead" | "split" | "shake" | "punch";

/** A follow-up beat as the staging saw it land. */
export interface CityFightAwakeningMark {
  /** Its index in the follow-up's beats. */
  readonly index: number;
  readonly kind: CityFightFollowUpBeatKind;
  /** Its place among the beats of its kind (0, 1, …). */
  readonly nth: number;
  /** Screen ms since it landed. */
  readonly ageMs: number;
  /** The struck body as it landed. */
  readonly at: CityFightAwakeningBody;
}

/** One frame of an awakening as a motif sees it. */
export interface CityFightAwakeningShot {
  /** Screen ms since the super started (the cut-in). */
  readonly ms: number;
  /** The super's contact: screen ms since, where the struck body stood, guarded; null before it. */
  readonly contact: { readonly ageMs: number; readonly at: CityFightAwakeningBody; readonly blocked: boolean } | null;
  /** The rules' follow-up clock (fight ms since the contact — its last value once over); null before it starts or without one. */
  readonly progress: number | null;
  /** The follow-up is still running. */
  readonly running: boolean;
  /** The beats landed so far, in order. */
  readonly marks: readonly CityFightAwakeningMark[];
  /** Fight ms until the `down` beat while he lies waiting for it, else null. */
  readonly downIn: number | null;
  readonly caster: CityFightAwakeningBody;
  /** The struck body, live (lifted by his flight). */
  readonly target: CityFightAwakeningBody;
  /** From the caster toward the struck along screen x. */
  readonly side: 1 | -1;
  /** The camera's view this frame (world px) and world px per screen px. */
  readonly view: Phaser.Geom.Rectangle;
  readonly perPx: number;
  /** 1 while it plays, down to 0 over its fade. */
  readonly fade: number;
  /** Screen ms since its sequence ended (its last beat, a cut-short or a contact with no follow-up), else null. */
  readonly endedMs: number | null;
  readonly follow: CityFightFollowUp | null;
}

/** A clip of the caster's own pack to draw over his stand (render only): `clip` at `ms`, looped or held on its last cell. */

export interface CityFightAwakeningClip {
  readonly clip: string; readonly ms: number; readonly loop: boolean; readonly liftBodies?: number; readonly towardBodies?: number;
  readonly turned?: boolean; readonly ghost?: boolean;
}

/** A cell of a fighter's own clip to draw elsewhere (the awakening's figures): as his sprite would draw it at `scale`. */
export interface CityFightAwakeningFigure {
  readonly texture: string;
  readonly frame: string | number;
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
  readonly flipX: boolean;
}

/** A character's awakening staging: what it draws, its sky and colour, how long it holds after its last beat, what the caster plays. */
export interface CityFightAwakeningMotif {
  readonly sky: CityFightAwakeningSky | null;
  /** Its colour (the total stamp's). */
  readonly color: number;
  /** Screen ms it holds after its last beat before the fade (its finale's picture). */
  readonly holdMs: number;
  /** Screen ms it holds after a contact with no follow-up (default `CITY_FIGHT_AWAKENING.contactOnlyMs` — a registered fighter's has no follow-up). */
  readonly contactOnlyMs?: number;
  /** Over how many screen ms the sky comes in from the super's start. */
  readonly skyInMs?: number;
  /** Its sky's strength this frame (0..1, before the fade) — default: in over `skyInMs` from the super's start. */
  skyAlpha?(shot: CityFightAwakeningShot): number;
  /** The words it draws in `locale` (`canvas.word` by index). */
  words?(locale: Locale): readonly string[];
  draw(shot: CityFightAwakeningShot, canvas: CityFightAwakeningCanvas): void;
  /** Under reduced motion (the sky is still): its finale's picture faded in and out, no motion. Default: nothing. */
  drawReduced?(shot: CityFightAwakeningShot, canvas: CityFightAwakeningCanvas): void;
  /** What the caster plays over his stand this frame (his own clip), or null (he stands as the rules draw him). */
  casterClip?(shot: CityFightAwakeningShot): CityFightAwakeningClip | null;
}

/** The layers a motif draws on, back to front (all under the fight's numbers and counters). */
export interface CityFightAwakeningCanvas {
  /** Added light behind everything of its own: graphics and the light pool. */
  readonly back: Phaser.GameObjects.Graphics;
  readonly backLight: CityFightLightPool;
  /** Painted, under the bodies' copies (a dark room, a floor, things behind them). */
  readonly under: Phaser.GameObjects.Graphics;
  /** Painted over the bodies (a cage's bars, a book, a sign). */
  readonly paint: Phaser.GameObjects.Graphics;
  /** Added light over the bodies: graphics and the light pool. */
  readonly front: Phaser.GameObjects.Graphics;
  readonly light: CityFightLightPool;
  /** Painted over the light (ink lines, a stamp). */
  readonly ink: Phaser.GameObjects.Graphics;
  /**
   * The two bodies drawn again over `under` (the caster's, the struck's): `fill` paints them flat (a silhouette), `tint` multiplies them
   * (a dim room's light), `alpha` fades them. Draw them when something painted stands behind them.
   */
  bodies(which: "both" | "caster" | "target", options?: { readonly fill?: number; readonly tint?: number; readonly alpha?: number }): void;
  /** A cell of `who`'s own clip drawn at (x, y) (his feet), `alpha`, tinted flat when `fill`; over the bodies (`front`) or behind (`under`). */
  figure(who: "caster" | "target", clip: string, ms: number, loop: boolean, x: number, y: number, alpha: number,
    options?: { readonly fill?: number | null; readonly tint?: number; readonly flip?: boolean; readonly scale?: number; readonly layer?: "under" | "front"; readonly add?: boolean }): void;
  /** One of the motif's words (`words[index]`) at (x, y), `size` screen px tall, its colours, scale, angle, alpha. */
  word(index: number, x: number, y: number, size: number, options?: { readonly color?: number; readonly stroke?: number;
    readonly alpha?: number; readonly scale?: number; readonly angle?: number }): void;
  /** A camera beat, once per `key` in this awakening. */
  cue(key: string, cue: CityFightAwakeningCue, value?: number): void;
}

export const CITY_FIGHT_AWAKENING = Object.freeze({
  /** A super that never lands lets its staging go this long after it started (screen ms). */
  missMs: 3600,
  /** A contact with no follow-up (blocked, none here) ends this long after it (its short version). */
  contactOnlyMs: 650,
  /**
   * No follow-up this long after the super's latest contact (guarded or not): there is none — a string super, a slide super of several runs
   * opens on its last contact, and a string's first may meet his guard (Typhoon's next came 690 ms later).
   */
  noFollowUpMs: 900,
  /** A follow-up cut short (a KO beat) holds this long after its last beat. */
  cutShortMs: 700,
  /** The fade (screen ms). */
  fadeMs: 420,
  /** Under reduced motion it holds this long after the contact. */
  reducedHoldMs: 1100,
  /** The sky comes in over this long by default. */
  skyInMs: 260,
  /**
   * The total stamp: `atMs` after the sequence ended, beside the struck body (`besideBodies` of his height on his far side, `lift` up — the
   * motifs' own words sit over him), kept inside the view; `size` view heights tall, stamped from `fromScale` over `stampMs`, held to the fade.
   */
  stamp: { atMs: 240, besideBodies: 0.95, lift: 0.95, size: 0.085, fromScale: 1.8, stampMs: 140 },
});

/**
 * A stage that keeps both fighters readable through an awakening (2026-10-23 arena audit — the AI duel: the bear spirit and its claws over
 * both bodies, the ice pillar in front of him, the bulb's cone a plank over the caster, skies in the caster's own colour): the motif's back
 * light and its painted floor go behind both fighters (`behindDepth`), added light over a body is drawn at `overBodyAlpha` of its strength, a cone of
 * light (a lamp, a spotlight) goes behind them at most `coneAlpha`, its painted-light layer (`front`: bursts, rings, a dream's haze flash
 * at 0.8) at `frontAlpha` of its strength, and its sky keeps `skySaturation` of its colour with its brightest at most `skyValue` — a night
 * sky's; one bright on purpose (deep colour over `brightSky`) keeps its light (`cityFightReadableSky`).
 */
export const CITY_FIGHT_AWAKENING_READABLE = Object.freeze({ overBodyAlpha: 0.45, coneAlpha: 0.35, frontAlpha: 0.55, skySaturation: 0.6,
  skyValue: 0.2, brightSky: 0.5 });

/** The readable stage's own depth behind both fighters (`ARENA_DEPTHS.awakeningBehind`); absent: drawn over them as the village's. */
export interface CityFightAwakeningReadableStage { readonly behindDepth: number }

/** `color` (0xRRGGBB) with its saturation × `saturation` and its value × `value` (HSV). */
function regrade(color: number, saturation: number, value: number): number {
  const r = (color >> 16 & 0xff) / 255, g = (color >> 8 & 0xff) / 255, b = (color & 0xff) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max * value, s = max > 0 ? (max - min) / max * saturation : 0;
  // HSV: a channel sits (max − c) / (max − min) of the way from the brightest down to the grey floor v·(1 − s).
  const channel = (c: number) => Math.round(255 * clamp01(max - min < 1e-6 ? v : v * (1 - s * (max - c) / (max - min))));
  return channel(r) << 16 | channel(g) << 8 | channel(b);
}

/**
 * A motif's sky graded for the readable stage (`CITY_FIGHT_AWAKENING_READABLE`): deep, high and cloud keep `skySaturation` of their colour
 * and a night sky (its deep colour darker than `brightSky`) is scaled so its brightest is at most `skyValue`; a sky that is bright on
 * purpose (어리둥's white-out, 둘둘's paper — their ink reads on it) keeps its light. The stars only lose colour.
 */
export function cityFightReadableSky(sky: CityFightAwakeningSky): CityFightAwakeningSky {
  const R = CITY_FIGHT_AWAKENING_READABLE, value = (c: number) => Math.max(c >> 16 & 0xff, c >> 8 & 0xff, c & 0xff) / 255;
  const top = Math.max(value(sky.deep), value(sky.high), value(sky.cloud));
  const scale = value(sky.deep) < R.brightSky && top > R.skyValue ? R.skyValue / top : 1;
  return { deep: regrade(sky.deep, R.skySaturation, scale), high: regrade(sky.high, R.skySaturation, scale),
    cloud: regrade(sky.cloud, R.skySaturation, scale), star: regrade(sky.star, R.skySaturation, 1) };
}

const A = CITY_FIGHT_AWAKENING;
const BACK_DEPTH = VILLAGE_DEPTHS.fightSuperProp;
const UNDER_DEPTH = BACK_DEPTH + 0.005;
const BODY_DEPTH = BACK_DEPTH + 0.015;
const PAINT_DEPTH = BACK_DEPTH + 0.02;
const FRONT_DEPTH = BACK_DEPTH + 0.03;
const INK_DEPTH = BACK_DEPTH + 0.04;
const WORD_DEPTH = BACK_DEPTH + 0.045;
const STAMP_DEPTH = WORD_DEPTH + 0.001;
/** A figure behind the bodies' copies, or over them under the front light. */
const FIGURE_UNDER_DEPTH = BODY_DEPTH - 0.001;
const FIGURE_FRONT_DEPTH = FRONT_DEPTH - 0.001;
const FONT_PX = 96;
const FIGURES = 16;
const WORDS = 8;

interface Run {
  readonly motif: CityFightAwakeningMotif;
  readonly reduced: boolean;
  readonly hooks: CityFightAwakeningMotifHooks;
  readonly follow: CityFightFollowUp | null;
  ms: number;
  /** The super's first contact (`ageMs` from it), and screen ms since its latest (a string super lands several — its follow-up opens on its last). */
  contact: { ageMs: number; sinceLastMs: number; at: CityFightAwakeningBody; blocked: boolean; damage: number } | null;
  progress: number | null;
  /** The follow-up's clock was read once (it ran). */
  started: boolean;
  marks: { index: number; kind: CityFightFollowUpBeatKind; nth: number; ageMs: number; at: CityFightAwakeningBody; damage: number }[];
  endedMs: number | null;
  /** Screen ms of the hold before the fade, set as it ended. */
  holdMs: number;
  fadeMs: number | null;
  played: Set<string>;
  lastCaster: CityFightAwakeningBody | null;
  lastTarget: CityFightAwakeningBody | null;
}

/** What the motif reads off the fight (the scene's presenter). */
export interface CityFightAwakeningMotifHooks {
  /** The struck body, live (lifted by his flight). */
  readonly target: () => CityFightAwakeningBody | null;
  /** The caster's body, live. */
  readonly caster: () => CityFightAwakeningBody | null;
  readonly cue: (cue: CityFightAwakeningCue, value?: number) => void;
  /** The rules' follow-up clock (fight ms since the contact), null when there is none (yet / any more). */
  readonly progress: () => number | null;
  readonly downIn: () => number | null;
  /** A cell of a fighter's own clip (0: the caster, 1: the struck) as a figure, or null. */
  readonly figure?: (who: 0 | 1, clip: string, ms: number, loop: boolean) => CityFightAwakeningFigure | null;
}

export class CityFightAwakeningMotifView implements CityFightAwakeningCanvas {
  readonly back: Phaser.GameObjects.Graphics;
  readonly backLight: CityFightLightPool;
  readonly under: Phaser.GameObjects.Graphics;
  readonly paint: Phaser.GameObjects.Graphics;
  readonly front: Phaser.GameObjects.Graphics;
  readonly light: CityFightLightPool;
  readonly ink: Phaser.GameObjects.Graphics;
  private readonly copies: Phaser.GameObjects.Image[] = [];
  private readonly figures: Phaser.GameObjects.Image[] = [];
  private figuresUsed = 0;
  private readonly words: Phaser.GameObjects.Text[] = [];
  private wordsUsed = 0;
  /** The playing motif's words in this locale. */
  private wordTexts: readonly string[] = [];
  private readonly stamp: Phaser.GameObjects.Text;
  private run: Run | null = null;

  /**
   * `actors`: the two fighters' sprites, the caster's first (`CityFightAwakeningStages` orders them); `skyColours`: the stage's backdrop takes
   * a motif's own sky colours (the arena's background layer — the village's town pass keeps its night's).
   */
  constructor(scene: Phaser.Scene, private readonly camera: () => Phaser.Cameras.Scene2D.Camera,
    private readonly actors: () => readonly (Phaser.GameObjects.Sprite | null | undefined)[], private readonly locale: Locale,
    private readonly skyColours: () => boolean, private readonly readable: CityFightAwakeningReadableStage | null = null) {
    const graphics = (depth: number, name: string) => scene.add.graphics().setDepth(depth).setName(name).setVisible(false);
    const image = (depth: number, name: string) => scene.add.image(0, 0, "__DEFAULT").setDepth(depth).setName(name).setVisible(false);
    // The readable stage (the arena's AI duel): its back light and painted floor behind both fighters, in the same order.
    const back = readable ? readable.behindDepth : BACK_DEPTH, backLight = back + 0.001, under = readable ? back + 0.005 : UNDER_DEPTH;
    this.back = graphics(back, "city-fight-awakening-back").setBlendMode("ADD");
    this.backLight = new CityFightLightPool(scene, backLight, 48, "city-fight-awakening-back-light");
    this.under = graphics(under, "city-fight-awakening-under");
    for (let i = 0; i < 2; i++) this.copies.push(image(BODY_DEPTH, "city-fight-awakening-body"));
    this.paint = graphics(PAINT_DEPTH, "city-fight-awakening-paint");
    this.front = graphics(FRONT_DEPTH, "city-fight-awakening-front").setBlendMode("ADD")
      .setAlpha(readable ? CITY_FIGHT_AWAKENING_READABLE.frontAlpha : 1);
    this.light = new CityFightLightPool(scene, FRONT_DEPTH + 0.001, 160, "city-fight-awakening-light");
    // Its spotlights behind both fighters, at most `coneAlpha` (b05 #1766: a plank of light over the caster).
    if (readable) {
      this.light.conesTo(this.backLight, CITY_FIGHT_AWAKENING_READABLE.coneAlpha);
      this.backLight.conesTo(null, CITY_FIGHT_AWAKENING_READABLE.coneAlpha);
    }
    this.ink = graphics(INK_DEPTH, "city-fight-awakening-ink");
    for (let i = 0; i < FIGURES; i++) this.figures.push(image(BODY_DEPTH, "city-fight-awakening-figure"));
    const style = { fontFamily: FONT.hudSans, fontSize: `${FONT_PX}px`, fontStyle: "bold", color: cssHex(PALETTE.white),
      stroke: cssHex(PALETTE.navyInk), strokeThickness: 14 };
    for (let i = 0; i < WORDS; i++) {
      this.words.push(scene.add.text(0, 0, "", style).setOrigin(0.5).setDepth(WORD_DEPTH).setName("city-fight-awakening-word").setVisible(false));
    }
    this.stamp = scene.add.text(0, 0, "", { ...style, strokeThickness: 16 }).setOrigin(0.5).setDepth(STAMP_DEPTH)
      .setName("city-fight-awakening-total").setVisible(false);
  }

  get active(): boolean { return this.run !== null; }

  /** `motif`'s staging starts with the super (`follow`: the caster's follow-up, if any). */
  play(motif: CityFightAwakeningMotif, follow: CityFightFollowUp | null, reducedMotion: boolean, hooks: CityFightAwakeningMotifHooks): void {
    this.stop();
    this.run = { motif, reduced: reducedMotion, hooks, follow, ms: 0, contact: null, progress: null, started: false, marks: [], endedMs: null,
      holdMs: 0, fadeMs: null, played: new Set(), lastCaster: null, lastTarget: null };
    this.wordTexts = motif.words?.(this.locale) ?? [];
  }

  /** A contact of the super landed (`blocked`: guarded) on the struck body; `damage`: the HP it took. The first is its contact; each counts to the total. */
  resolve(blocked: boolean, damage = 0): void {
    const r = this.run;
    if (!r) return;
    // A later contact that lands clean makes it a landed super (a string super's first may meet his guard).
    if (r.contact) { r.contact.sinceLastMs = 0; r.contact.damage += blocked ? 0 : damage; if (!blocked) r.contact.blocked = false; return; }
    const at = this.target(r) ?? { x: 0, y: 0, h: 0 };
    r.contact = { ageMs: 0, sinceLastMs: 0, at, blocked, damage };
  }

  /** Beat `index` of the follow-up landed (`damage`: the HP it took). */
  beat(index: number, damage = 0): void {
    const r = this.run, beat = r?.follow?.beats[index];
    if (!r || !beat) return;
    const nth = r.marks.filter(mark => mark.kind === beat.kind).length;
    r.marks.push({ index, kind: beat.kind, nth, ageMs: 0, at: this.target(r) ?? { x: 0, y: 0, h: 0 }, damage });
    if (index >= r.follow.beats.length - 1) this.end(r, r.motif.holdMs);
  }

  /** What the caster plays over his stand now (his own clip), or null. */
  casterClip(): CityFightAwakeningClip | null {
    const r = this.run;
    if (!r || r.reduced || r.fadeMs !== null) return null;
    return r.motif.casterClip?.(this.shot(r)) ?? null;
  }

  /** The motif's sky over the stage this frame, or null. */
  backdrop(): NativeCityBackdropFrame | null {
    const r = this.run, sky = r?.motif.sky;
    if (!r || !sky || !this.skyColours()) return null;
    const alpha = clamp01(r.motif.skyAlpha ? r.motif.skyAlpha(this.shot(r)) : r.ms / (r.motif.skyInMs ?? A.skyInMs)) * this.fade(r);
    // The readable stage's sky steps back from the fighters (dimmer, greyer — b01 an orange bear under an orange sky).
    const shown = this.readable ? cityFightReadableSky(sky) : sky;
    return alpha > 0.001 ? { alpha, mode: "night", clockMs: r.reduced ? 0 : r.ms, sky: [shown.deep, shown.high, shown.cloud, shown.star] } : null;
  }

  /** One frame on screen ms (it reads through the fight's freezes). */
  update(screenDtMs: number): void {
    const r = this.run;
    if (!r) return;
    const dt = Math.max(0, Number.isFinite(screenDtMs) ? screenDtMs : 0);
    r.ms += dt;
    if (r.contact) { r.contact.ageMs += dt; r.contact.sinceLastMs += dt; }
    for (const mark of r.marks) mark.ageMs += dt;
    if (r.endedMs !== null) r.endedMs += dt;
    const progress = r.contact ? r.hooks.progress() : null;
    if (progress !== null) { r.progress = progress; r.started = true; }
    // The end: a follow-up over before its last beat (a KO cut it short); a contact it never followed; a super that never landed.
    if (r.endedMs === null) {
      if (r.started && progress === null) this.end(r, A.cutShortMs);
      else if (r.contact && !r.started && (!r.follow || r.contact.sinceLastMs >= A.noFollowUpMs)) {
        this.end(r, r.motif.contactOnlyMs ?? A.contactOnlyMs);
      }
      else if (!r.contact && r.ms >= A.missMs) this.end(r, 0);
      if (r.reduced && r.contact && r.contact.ageMs >= A.reducedHoldMs) this.end(r, 0);
    }
    if (r.fadeMs === null && r.endedMs !== null && r.endedMs >= r.holdMs) r.fadeMs = 0;
    else if (r.fadeMs !== null) r.fadeMs += dt;
    if (r.fadeMs !== null && r.fadeMs >= A.fadeMs) { this.stop(); return; }
    this.clear();
    const shot = this.shot(r);
    // The readable stage: added light over either body at `overBodyAlpha` (the claws, a flare on him — he stays readable under it).
    this.light.cover = this.readable ? { boxes: [cityFightBodyBox(shot.caster), cityFightBodyBox(shot.target)],
      maxAlpha: CITY_FIGHT_AWAKENING_READABLE.overBodyAlpha } : null;
    if (r.reduced) r.motif.drawReduced?.(shot, this);
    else {
      r.motif.draw(shot, this);
      this.drawStamp(r, shot);
    }
    this.backLight.end(); this.light.end();
    for (let i = this.figuresUsed; i < this.figures.length; i++) this.figures[i]!.setVisible(false);
    for (let i = this.wordsUsed; i < this.words.length; i++) this.words[i]!.setVisible(false);
  }

  stop(): void { this.run = null; this.clear(); this.backLight.hide(); this.light.hide(); this.hideRest(); }

  destroy(): void {
    for (const piece of [this.back, this.under, this.paint, this.front, this.ink, ...this.copies, ...this.figures, ...this.words, this.stamp]) piece.destroy();
    this.backLight.destroy(); this.light.destroy();
  }

  bodies(which: "both" | "caster" | "target", options: { readonly fill?: number; readonly tint?: number; readonly alpha?: number } = {}): void {
    const actors = this.actors(), alpha = options.alpha ?? 1;
    this.copies.forEach((image, i) => {
      if (which !== "both" && (which === "caster") !== (i === 0)) return;
      const actor = actors[i];
      if (!actor || !actor.visible || !actor.texture) return;
      image.setTexture(actor.texture.key, actor.frame.name).setOrigin(actor.originX, actor.originY).setFlipX(actor.flipX)
        .setScale(actor.scaleX, actor.scaleY).setAngle(actor.angle).setPosition(actor.x, actor.y).setAlpha(actor.alpha * alpha).setVisible(true);
      if (options.fill !== undefined) image.setTintFill(options.fill);
      else if (options.tint !== undefined) image.setTint(options.tint);
      else if (actor.isTinted && actor.tintFill) image.setTintFill(actor.tintTopLeft);
      else if (actor.isTinted) image.setTint(actor.tintTopLeft);
      else image.clearTint();
    });
  }

  figure(who: "caster" | "target", clip: string, ms: number, loop: boolean, x: number, y: number, alpha: number,
    options: { readonly fill?: number | null; readonly tint?: number; readonly flip?: boolean; readonly scale?: number;
      readonly layer?: "under" | "front"; readonly add?: boolean } = {}): void {
    const r = this.run;
    if (!r || !(alpha > 0.003)) return;
    const found = r.hooks.figure?.(who === "caster" ? 0 : 1, clip, ms, loop);
    const image = this.figures[this.figuresUsed];
    if (!found || !image) return;
    this.figuresUsed++;
    image.setTexture(found.texture, found.frame).setOrigin(found.originX, found.originY).setFlipX(options.flip === undefined ? found.flipX : options.flip)
      .setScale(found.scale * (options.scale ?? 1)).setAngle(0).setPosition(x, y).setAlpha(Math.min(1, alpha))
      .setDepth(options.layer === "front" ? FIGURE_FRONT_DEPTH : FIGURE_UNDER_DEPTH).setBlendMode(options.add ? "ADD" : "NORMAL").setVisible(true);
    if (options.fill !== undefined && options.fill !== null) image.setTintFill(options.fill);
    else if (options.tint !== undefined) image.setTint(options.tint);
    else image.clearTint();
  }

  word(index: number, x: number, y: number, size: number, options: { readonly color?: number; readonly stroke?: number;
    readonly alpha?: number; readonly scale?: number; readonly angle?: number } = {}): void {
    const r = this.run, text = this.words[this.wordsUsed], word = this.wordTexts[index];
    if (!r || !text || word === undefined || !((options.alpha ?? 1) > 0.003)) return;
    this.wordsUsed++;
    if (text.text !== word) text.setText(word);
    const px = size * this.perPx();
    text.setPosition(x, y).setScale(px / FONT_PX * (options.scale ?? 1)).setAngle(options.angle ?? 0).setAlpha(options.alpha ?? 1)
      .setColor(cssHex(options.color ?? PALETTE.white)).setStroke(cssHex(options.stroke ?? PALETTE.navyInk), 14).setVisible(true);
  }

  cue(key: string, cue: CityFightAwakeningCue, value?: number): void {
    const r = this.run;
    if (!r || r.reduced || r.played.has(key)) return;
    r.played.add(key);
    r.hooks.cue(cue, value);
  }

  private end(r: Run, holdMs: number): void {
    if (r.endedMs !== null) return;
    r.endedMs = 0; r.holdMs = holdMs;
  }

  private fade(r: Run): number { return r.fadeMs === null ? 1 : 1 - clamp01(r.fadeMs / A.fadeMs); }

  private perPx(): number {
    const camera = this.camera();
    return camera.worldView.width / Math.max(1, camera.width);
  }

  private target(r: Run): CityFightAwakeningBody | null {
    const body = r.hooks.target();
    if (body) r.lastTarget = body;
    return body ?? r.lastTarget;
  }

  private caster(r: Run): CityFightAwakeningBody | null {
    const body = r.hooks.caster();
    if (body) r.lastCaster = body;
    return body ?? r.lastCaster;
  }

  private shot(r: Run): CityFightAwakeningShot {
    const view = this.camera().worldView;
    const fallback = { x: view.centerX, y: view.bottom - view.height * 0.15, h: view.height * 0.3 };
    const target = this.target(r) ?? fallback, caster = this.caster(r) ?? fallback;
    return {
      ms: r.ms, progress: r.progress, running: r.started && r.endedMs === null && r.marks.length < (r.follow?.beats.length ?? 0),
      contact: r.contact ? { ageMs: r.contact.ageMs, at: r.contact.at, blocked: r.contact.blocked } : null,
      marks: r.marks, downIn: r.contact ? r.hooks.downIn() : null, caster, target, side: target.x >= caster.x ? 1 : -1,
      view, perPx: this.perPx(), fade: this.fade(r), endedMs: r.endedMs, follow: r.follow,
    };
  }

  /** The total: the whole awakening's damage over the struck body, stamped in after its sequence ended. */
  private drawStamp(r: Run, shot: CityFightAwakeningShot): void {
    const S = A.stamp, since = (r.endedMs ?? -1) - S.atMs;
    if (!r.contact || r.contact.blocked || r.marks.length === 0 || since < 0) { this.stamp.setVisible(false); return; }
    const total = [r.contact.damage, ...r.marks.map(mark => mark.damage)].filter(hp => hp > 0).reduce((sum, hp) => sum + nativeCityDisplayDamage(hp), 0);
    if (total <= 0) { this.stamp.setVisible(false); return; }
    const k = clamp01(since / S.stampMs), at = r.marks[r.marks.length - 1]!.at, v = shot.view;
    const size = v.height * S.size, x = Math.min(v.right - size * 1.6, Math.max(v.x + size * 1.6, at.x + shot.side * at.h * S.besideBodies));
    this.stamp.setText(String(total)).setPosition(x, Math.max(v.y + v.height * 0.2, at.y - at.h * S.lift))
      .setScale(size / FONT_PX * (S.fromScale + (1 - S.fromScale) * easeOutBack(k)))
      .setAlpha(easeOutCubic(k) * shot.fade).setColor(cssHex(r.motif.color)).setVisible(true);
  }

  private clear(): void {
    for (const g of [this.back, this.under, this.paint, this.front, this.ink]) g.clear().setVisible(true);
    this.backLight.begin(); this.light.begin();
    for (const image of this.copies) image.setVisible(false);
    this.figuresUsed = 0; this.wordsUsed = 0;
  }

  private hideRest(): void {
    for (const piece of [this.back, this.under, this.paint, this.front, this.ink, ...this.copies, ...this.figures, ...this.words, this.stamp]) piece.setVisible(false);
  }
}
