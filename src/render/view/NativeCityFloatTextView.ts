import type Phaser from "phaser";
import { cssHex, FONT } from "../art/palette";
import { VILLAGE_DEPTHS } from "../depths";
import { COMBAT_STATUS_TAGS, combatStatusStyle, type CombatStatusId, type CombatStatusLabelKey } from "../effects/CombatStatusTag";
import {
  clampDamageNumberToView,
  DAMAGE_NUMBER_TIER_WEIGHT,
  damageNumberFrame,
  damageNumberSide,
  damageNumberStyle,
  type DamageNumberStyle,
  type DamageNumberTier,
} from "../effects/DamageNumberPresentation";
import type { NativeCityHitNumber } from "../effects/NativeCityFloatText";
import { holdUnderCeiling } from "./WorldCeiling";

/** What the float text reads from the village each frame. */
export interface NativeCityFloatTextHost {
  /** The world camera: its view keeps the text on the screen. */
  readonly camera: () => Phaser.Cameras.Scene2D.Camera;
  /** World px under one screen px (the text's size and travel are set in screen px). */
  readonly worldPxPerScreenPx: () => number;
  /** The ink impact frame's plate covers the screen: new text waits for it to lift, the text already up hides under it. */
  readonly plateShowing: () => boolean;
  /** A status label in the current locale. */
  readonly label: (key: CombatStatusLabelKey) => string;
  /**
   * The highest world y a number or label may show at now (the arena's face HUD floor, 2026-10-24 — its awakening numbers floated up into
   * the HUD); absent: the view's top.
   */
  readonly ceiling?: () => number;
}

/**
 * Where a float lands: `at` (world px — the contact for a number, the head for a status), the side it leans to (`side`: the pushed body's
 * side on screen — it never covers the attacker), how far beside the point (`sidePx`, world px) and whose body it is (`body`: "player" or
 * the enemy's id — floats on one body stack, a heavier number retires the lighter ones there).
 */
export interface NativeCityFloatPlace {
  readonly at: readonly [number, number];
  readonly side: -1 | 1;
  readonly sidePx: number;
  readonly body: string;
  /** Its size and travel over the village's (absent: 1) — the arena frames its bodies about twice as big, its numbers read small beside them. */
  readonly scale?: number;
  /** Its whole life (screen ms) instead of its tier's — its pop, rise and fade squeezed into it (absent: the tier's). */
  readonly lifeMs?: number;
  /**
   * A new number on the same body pushes the ones still up this many screen px higher (they rise out of its way, 2026-10-23 arena audit —
   * b04 #1538–1560: "2" then "3" on one spot read "23") instead of stacking it over them. Absent: the village's stacking.
   */
  readonly pushPx?: number;
}

interface Live {
  readonly text: Phaser.GameObjects.Text;
  readonly kind: "number" | "status";
  readonly tier: DamageNumberTier | null;
  readonly status: CombatStatusId | null;
  readonly label: string;
  readonly style: DamageNumberStyle;
  readonly place: NativeCityFloatPlace;
  readonly stackIndex: number;
  /** Village world px per style px (the heist table's world px drawn at ~1.5 zoom), fixed at birth. */
  unit: number;
  origin: readonly [number, number];
  side: -1 | 1;
  /** View clock ms it was born; null while it waits for the impact plate to lift. */
  bornMs: number | null;
  retireAtMs: number;
  /** How far later numbers pushed it up (world px): eased toward `liftTo`. */
  lift: number;
  liftTo: number;
}

/** Pooled text objects (made now — world camera only: the scene makes them before the UI camera takes the world's ignore list). */
const SLOTS = 10;
/** The code font is set this big and scaled to the float's size (crisp at any zoom; the text-size setting scales this base). */
const BASE_FONT_PX = 64;
/** The heist's number table is in world px seen at ~1.5 zoom: the village draws a style px as this many screen px. */
const SCREEN_PX_PER_STYLE_PX = 1.5;
/** Floats on one body within this many ms stack above the earlier ones. */
const STACK_WINDOW_MS = 360;
/** A retired number (a heavier one landed on the same body) clears in this long. */
const RETIRE_MS = 80;
/** A pushed number eases up to its new place with this time constant (screen ms). */
const PUSH_EASE_MS = 35;

/**
 * 마을 대결의 대미지 숫자·상태 글자(2026-10-18). 무엇을 띄울지는 `NativeCityFloatText`, 모양·곡선은 저택 대미지 폰트
 * (`DamageNumberPresentation`)와 상태 표(`CombatStatusTag`)가 소유하고 여기는 그리기만 한다 — 받침 원화 없이 글자만(Pretendard 굵게,
 * 세로 그라데이션, 잉크 테두리).
 *
 * 시계는 화면 시간이다: 히트스톱 안에서도 박히고 떠오른다(만화 효과음 글자와 같다). 결판의 잉크 임팩트 판이 깔린 동안은 새 글자가
 * 태어나지 않고 판이 걷힌 뒤에 박힌다(저택 규칙 — 두 색으로 뒤집힌 한 컷 위의 원색 숫자는 컷을 깬다). 글자는 화면 밖으로 나가지
 * 않는다: 자리를 고를 때 가장자리 반대쪽으로 비키고, 매 프레임 화면 안으로 끌어들인다.
 */
export class NativeCityFloatTextView {
  private readonly slots: Phaser.GameObjects.Text[] = [];
  private live: Live[] = [];
  private clockMs = 0;

  constructor(scene: Phaser.Scene, private readonly host: NativeCityFloatTextHost) {
    for (let i = 0; i < SLOTS; i++) {
      this.slots.push(scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: `${BASE_FONT_PX}px`, fontStyle: "bold",
        align: "center", padding: { x: 8, y: 8 } })
        .setOrigin(0.5, 0.62).setResolution(2).setDepth(VILLAGE_DEPTHS.fightFloatText).setVisible(false).setName("native-city-float-text"));
    }
    // Under the ceiling as the camera draws (the scene moves its camera after this view's update).
    const ceiling = host.ceiling;
    if (ceiling) this.release = holdUnderCeiling(scene, () => this.slots, ceiling);
  }

  private release: (() => void) | null = null;

  /** Every pooled object (the scene's world list). */
  get objects(): readonly Phaser.GameObjects.GameObject[] { return this.slots; }

  /** A damage number at `place`. A heavier number retires the lighter ones on the same body (a finisher stands alone). */
  number(number: NativeCityHitNumber, place: NativeCityFloatPlace): void {
    const weight = DAMAGE_NUMBER_TIER_WEIGHT[number.tier];
    for (const item of this.live) {
      if (item.kind !== "number" || item.place.body !== place.body || item.tier === null) continue;
      const previous = DAMAGE_NUMBER_TIER_WEIGHT[item.tier];
      if (previous < weight || (weight >= 3 && previous <= weight)) item.retireAtMs = Math.min(item.retireAtMs, this.clockMs);
    }
    this.spawn("number", number.tier, null, number.label, damageNumberStyle(number), place);
  }

  /** A status label (`CombatStatusTag`) at `place`. */
  status(id: CombatStatusId, place: NativeCityFloatPlace): void {
    this.spawn("status", null, id, this.host.label(COMBAT_STATUS_TAGS[id].labelKey), combatStatusStyle(id), place);
  }

  /** One frame of screen time (`dtMs`). */
  update(dtMs: number, reducedMotion: boolean): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    this.clockMs += dt;
    const plate = this.host.plateShowing(), view = this.host.camera().worldView, ease = reducedMotion ? 1 : 1 - Math.exp(-dt / PUSH_EASE_MS);
    for (let i = this.live.length - 1; i >= 0; i--) {
      const item = this.live[i]!;
      if (item.bornMs === null) {
        if (plate) { item.text.setVisible(false); continue; }
        this.bear(item);
      }
      const frame = damageNumberFrame(item.style, this.clockMs - item.bornMs!, item.side, item.stackIndex, reducedMotion);
      const retire = this.clockMs < item.retireAtMs ? 1 : 1 - (this.clockMs - item.retireAtMs) / RETIRE_MS;
      if (frame === null || retire <= 0) { this.free(i); continue; }
      if (plate) { item.text.setVisible(false); continue; }
      const scale = frame.scale * item.style.fontPx * item.unit / BASE_FONT_PX;
      const width = Number.isFinite(item.text.width) ? item.text.width : 0, height = Number.isFinite(item.text.height) ? item.text.height : 0;
      item.lift += (item.liftTo - item.lift) * ease;
      const at = clampDamageNumberToView(item.origin[0] + frame.dx * item.unit, item.origin[1] + frame.dy * item.unit - item.lift,
        width * scale / 2, height * scale / 2, view);
      item.text.setVisible(true).setPosition(at.x, at.y).setScale(scale).setAlpha(frame.alpha * retire).setRotation(frame.rotation);
    }
  }

  /** E2E · diagnostics: the floats up now. */
  snapshot(): readonly { readonly kind: "number" | "status"; readonly label: string; readonly tier: string | null; readonly body: string;
    readonly visible: boolean }[] {
    return this.live.map(item => ({ kind: item.kind, label: item.label, tier: item.tier ?? item.status, body: item.place.body,
      visible: item.text.visible }));
  }

  destroy(): void {
    this.release?.();
    this.live = [];
    for (const text of this.slots) text.destroy();
    this.slots.length = 0;
  }

  private spawn(kind: Live["kind"], tier: DamageNumberTier | null, status: CombatStatusId | null, label: string, style: DamageNumberStyle,
    place: NativeCityFloatPlace): void {
    if (this.slots.length === 0) return;
    // A free slot, else the oldest float gives its own up.
    const busy = new Set(this.live.map(item => item.text));
    let text = this.slots.find(slot => !busy.has(slot));
    if (!text) { text = this.live[0]!.text; this.live.shift(); }
    const stacked = this.live.filter(item => item.kind === kind && item.place.body === place.body
      && item.retireAtMs === Number.POSITIVE_INFINITY && (item.bornMs === null || this.clockMs - item.bornMs < STACK_WINDOW_MS));
    // Pushing: the new one takes the spot, the ones still up rise out of its way.
    if (place.pushPx !== undefined) {
      const push = place.pushPx * Math.max(1e-6, this.host.worldPxPerScreenPx());
      for (const item of this.live) if (item.kind === kind && item.place.body === place.body) item.liftTo += push;
    }
    const stackIndex = place.pushPx !== undefined ? 0 : stacked.length;
    // The stroke is set on the base font: its share of the glyph stays the table's at any size.
    text.setText(label).setStroke(cssHex(style.stroke), style.strokePx * BASE_FONT_PX / style.fontPx)
      .setShadow(0, Math.max(1, Math.round(style.strokePx * 0.45)) * BASE_FONT_PX / style.fontPx, cssHex(style.stroke), 0, true, true)
      .setVisible(false);
    const gradient = text.context.createLinearGradient(0, 0, 0, text.height);
    gradient.addColorStop(0.18, cssHex(style.fillTop));
    gradient.addColorStop(0.82, cssHex(style.fillBottom));
    text.setFill(gradient);
    const item: Live = { text, kind, tier, status, label, style: place.lifeMs !== undefined ? { ...style, lifeMs: place.lifeMs } : style, place,
      stackIndex, unit: 1, origin: place.at, side: place.side, bornMs: null, retireAtMs: Number.POSITIVE_INFINITY, lift: 0, liftTo: 0 };
    if (!this.host.plateShowing()) this.bear(item);
    this.live.push(item);
  }

  /** Its birth (now, or once the impact plate lifted): its size and its side picked against the screen as it is now. */
  private bear(item: Live): void {
    const unit = SCREEN_PX_PER_STYLE_PX * Math.max(1e-6, this.host.worldPxPerScreenPx()) * Math.max(0.1, item.place.scale ?? 1);
    const view = this.host.camera().worldView;
    const { at, side, sidePx } = item.place;
    const reach = sidePx + (item.style.driftPx + item.style.fontPx * 1.5) * unit;
    item.side = damageNumberSide({ x: at[0], y: at[1] }, side, view, reach);
    item.origin = [at[0] + item.side * sidePx, at[1]];
    item.unit = unit;
    item.bornMs = this.clockMs;
  }

  private free(index: number): void {
    const [item] = this.live.splice(index, 1);
    item?.text.setVisible(false);
  }
}
