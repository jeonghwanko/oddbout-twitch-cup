import type Phaser from "phaser";
import { FONT, PALETTE, cssHex } from "../art/palette";
import { VILLAGE_DEPTHS } from "../depths";
import { CombatHitCounterClock, type CombatHitCounterFrame } from "../effects/CombatHitCounterPresentation";

/**
 * The 1:1 fight's hit counters (2026-10-20, the Rivals reference — "16x Combo": the run of hits a fighter lands without being hit back).
 * One counter per fighter, at the screen edge on his side of the fight, from his second hit (the heist's hit counter clock and look,
 * `CombatHitCounterClock`): each hit pops it, being hit (or a pause past `windowMs`) breaks it. The village fight, the arena's bout and
 * its AI duel draw it through the same sinks (`NativeCityFightSinks.combo`). A world-layer view placed on the camera's view each frame,
 * like the damage numbers. Its two slots are made with the sinks (before a scene's UI camera takes the world's ignore list — a piece made
 * later showed a second time through the UI camera); a fighter takes a free slot on his first hit. Presentation only.
 *
 * 무투장은 얼굴 HUD 의 말(2026-10-23, 시안 v5 — 사용자: "연타수도 개선해")로 그린다(`look: "arena"`, `ARENA_COMBO`): 금빛 그러데이션 숫자
 * 대신 HP 숫자와 같은 레터링 숫자에 잉크 그림자, 숫자 옆 작은 "연타", 위에 라임 줄 하나 — 이어 칠 시간이 줄면 그 줄이 가장자리 쪽으로 준다.
 * 색은 연타가 쌓일수록 흰색 → 라임 → 핫분홍.
 */

export const CITY_FIGHT_COMBO = Object.freeze({
  /** Screen ms after a hit that the next still joins: shorter than the heist's (a fight's string hits in well under a second). */
  windowMs: 1_200,
  /** Screen px from the view's edge, and the counter's height as a share of the view. */
  edgePx: 64,
  yShare: 0.32,
  numberPx: 64,
  labelPx: 20,
  gaugePx: 84,
});

/** The arena's look (2026-10-23, the face HUD's — mock-up v5): sizes in screen px, the tone each run length takes. */
export const ARENA_COMBO = Object.freeze({
  numberPx: 76,
  labelPx: 20,
  /** The gap between the number and its word, and the word's lift off the number's foot. */
  labelGapPx: 6,
  labelLiftPx: 10,
  /** The lime rule over the number: its full width (the chain's whole window), height and gap above the number's top. */
  ruleW: 56,
  ruleH: 3,
  ruleGapPx: 8,
  /** The rule's gap under the HUD's floor (`topShare`). */
  belowHudPx: 18,
  /** The share of the number's text box above its digits (the lettering font's ascent room): the rule sits on the digits, not the box. */
  inkTopShare: 0.27,
  /** The ink drop under the number, as the HP number's. */
  shadowPx: 4,
  /** A decisive hit's glow round the number while its flash lasts. */
  glowPx: 22,

  tones: Object.freeze([
    Object.freeze({ from: 2, color: PALETTE.white }),
    Object.freeze({ from: 5, color: PALETTE.oddboutAcid }),
    Object.freeze({ from: 10, color: PALETTE.oddboutPink }),
  ]),
});

/** The arena number's tone for a run of `count`. */
export function arenaComboTone(count: number): number {
  let color: number = PALETTE.white;
  for (const tone of ARENA_COMBO.tones) if (count >= tone.from) color = tone.color;
  return color;
}

/** Which look the counters take: the village fight's gold, or the arena's face-HUD lettering. */
export type CityFightComboLook = "village" | "arena";

interface Counter {
  /** The fighter whose run this slot counts (null: free). */
  id: string | null;
  readonly clock: CombatHitCounterClock;
  side: -1 | 1;
  readonly number: Phaser.GameObjects.Text;
  readonly label: Phaser.GameObjects.Text;
  readonly gauge: Phaser.GameObjects.Graphics;
  shown: number;
  tierFrom: number;
  /** The arena look's drawn colour and glow (only a change touches the text). */
  tone: number;
  glow: boolean;
}

export interface CityFightComboCounterSpec {
  readonly camera: () => Phaser.Cameras.Scene2D.Camera;
  /** World px per screen px (the view's zoom). */
  readonly worldPxPerScreenPx: () => number;
  /** The unit word under the number ("연타" / "HITS"). */
  readonly label: () => string;
  /** The arena's look (`ARENA_COMBO`); absent: the village fight's. */
  readonly look?: CityFightComboLook;
  /**
   * The arena's look stands under this share of the view's height (the face HUD's floor — `ArenaFaceHud.floorShare`), `belowHudPx` under it;
   * absent: its foot at `yShare` as the village's.
   */
  readonly topShare?: () => number;
}

export class CityFightComboCounterView {
  private readonly counters: readonly Counter[];

  constructor(scene: Phaser.Scene, private readonly spec: CityFightComboCounterSpec) {
    this.counters = [0, 1].map(index => this.make(scene, index));
  }

  /**
   * `id` landed a hit, standing on screen `side` of his opponent (-1 left); `finisher`: the decisive one pops bigger. Once his run shows, a
   * broken run still fading on that edge goes at once (2026-10-20 review: after a crossover the two numbers stood on one edge).
   */
  land(id: string, side: -1 | 1, finisher = false): void {
    const counter = this.counter(id);
    counter.side = side;
    counter.clock.pushRaw(1, finisher, false);
    if (!counter.clock.frame(true).visible) return;
    for (const other of this.counters) {
      if (other !== counter && other.side === side && other.clock.frame(true).visible) other.clock.reset();
    }
  }

  /** `id` was hit: his run breaks. */
  struck(id: string): void { this.counters.find(counter => counter.id === id)?.clock.pushRaw(0, false, true); }

  /** A new fight: every run starts over, every slot free. */
  reset(): void { for (const counter of this.counters) { counter.clock.reset(); counter.id = null; } }

  /** One frame (screen ms; a hit stop holds the run's window). */
  update(screenDtMs: number, frozen: boolean, reducedMotion: boolean): void {
    for (const counter of this.counters) {
      counter.clock.advance(screenDtMs, frozen);
      this.draw(counter, counter.clock.frame(reducedMotion));
    }
  }

  destroy(): void {
    for (const counter of this.counters) { counter.number.destroy(); counter.label.destroy(); counter.gauge.destroy(); }
  }

  /** `id`'s slot: his own, else a free one, else the one whose run shows nothing now. */
  private counter(id: string): Counter {
    const slot = this.counters.find(counter => counter.id === id) ?? this.counters.find(counter => counter.id === null)
      ?? this.counters.find(counter => !counter.clock.frame(true).visible) ?? this.counters[0]!;
    if (slot.id !== id) { slot.id = id; slot.clock.reset(); }
    return slot;
  }

  private get arena(): boolean { return this.spec.look === "arena"; }

  private make(scene: Phaser.Scene, index: number): Counter {
    const C = CITY_FIGHT_COMBO, depth = VILLAGE_DEPTHS.fightComboCounter, id = `slot${index}`;
    if (this.arena) {
      const A = ARENA_COMBO;
      const number = scene.add.text(0, 0, "", { fontFamily: FONT.lettering, fontSize: `${A.numberPx}px`, color: cssHex(PALETTE.white) })
        .setResolution(2).setDepth(depth).setName(`city-fight-combo-${id}`).setVisible(false);
      number.setShadow(0, A.shadowPx, cssHex(PALETTE.oddboutInk), 0, false, true);
      const label = scene.add.text(0, 0, this.spec.label(), { fontFamily: FONT.hudSans, fontSize: `${A.labelPx}px`, fontStyle: "bold",
        color: cssHex(PALETTE.white) }).setResolution(2).setDepth(depth).setName(`city-fight-combo-label-${id}`).setVisible(false);
      label.setShadow(0, 2, cssHex(PALETTE.oddboutInk), 0, false, true);
      const gauge = scene.add.graphics().setDepth(depth).setName(`city-fight-combo-gauge-${id}`).setVisible(false);
      return { id: null, clock: new CombatHitCounterClock(C.windowMs), side: -1, number, label, gauge, shown: -1, tierFrom: -1, tone: -1, glow: false };
    }
    const number = scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: `${C.numberPx}px`, fontStyle: "bold",
      color: cssHex(PALETTE.hotGold), stroke: cssHex(PALETTE.outline), strokeThickness: 8, padding: { x: 6, y: 6 } })
      .setResolution(2).setDepth(depth).setName(`city-fight-combo-${id}`).setVisible(false);
    number.setShadow(0, 4, cssHex(PALETTE.outline), 0, true, true);
    const label = scene.add.text(0, 0, this.spec.label(), { fontFamily: FONT.hudSans, fontSize: `${C.labelPx}px`, fontStyle: "bold",
      color: cssHex(PALETTE.ui), stroke: cssHex(PALETTE.outline), strokeThickness: 5, padding: { x: 3, y: 3 } })
      .setResolution(2).setDepth(depth).setName(`city-fight-combo-label-${id}`).setVisible(false);
    const gauge = scene.add.graphics().setDepth(depth).setName(`city-fight-combo-gauge-${id}`).setVisible(false);
    return { id: null, clock: new CombatHitCounterClock(C.windowMs), side: -1, number, label, gauge, shown: -1, tierFrom: -1,
      tone: PALETTE.white, glow: false };
  }

  private draw(counter: Counter, frame: CombatHitCounterFrame): void {
    const visible = frame.visible && frame.alpha > 0.01;
    counter.number.setVisible(visible); counter.label.setVisible(visible); counter.gauge.clear().setVisible(visible);
    if (!visible) return;
    if (this.arena) { this.drawArena(counter, frame); return; }
    const C = CITY_FIGHT_COMBO, view = this.spec.camera().worldView, unit = Math.max(1e-6, this.spec.worldPxPerScreenPx());
    const left = counter.side < 0, originX = left ? 0 : 1;
    const x = (left ? view.x + C.edgePx * unit : view.right - C.edgePx * unit) + frame.shakeX * unit;
    const y = view.y + view.height * C.yShare + frame.dy * unit;
    if (frame.count !== counter.shown) { counter.shown = frame.count; counter.number.setText(`${frame.count}`); counter.tierFrom = -1; }
    if (frame.tier.from !== counter.tierFrom) {
      counter.tierFrom = frame.tier.from;
      const gradient = counter.number.context.createLinearGradient(0, 0, 0, counter.number.height);
      gradient.addColorStop(0.2, cssHex(frame.tier.fillTop));
      gradient.addColorStop(0.8, cssHex(frame.tier.fillBottom));
      counter.number.setFill(gradient);
    }
    const label = this.spec.label();
    if (counter.label.text !== label) counter.label.setText(label);
    counter.number.setOrigin(originX, 0.62).setPosition(x, y).setScale(unit * frame.scale * frame.tier.scale).setAlpha(frame.alpha)
      .setTint(frame.broken ? PALETTE.dim : PALETTE.white);
    counter.label.setOrigin(originX, 0).setPosition(x + (left ? 2 : -2) * unit, y + 20 * unit * frame.tier.scale).setScale(unit).setAlpha(frame.alpha);
    const width = C.gaugePx * unit, gaugeY = y + 42 * unit * frame.tier.scale, from = left ? x : x - width;
    counter.gauge.fillStyle(PALETTE.outline, 0.7 * frame.alpha).fillRect(from - unit, gaugeY - unit, width + 2 * unit, 5 * unit);
    counter.gauge.fillStyle(frame.tier.fillBottom, 0.95 * frame.alpha)
      .fillRect(left ? from : from + width * (1 - frame.windowRatio), gaugeY, width * frame.windowRatio, 3 * unit);
  }

  /**
   * The arena's look: "12 연타" at the edge (the word on the inner side of the number on the left edge, the whole pair flush to the right
   * edge on the right), the lime rule over it shrinking to the edge as the chain's window runs out, the number's tone by the run's length;
   * a decisive hit lights it white with a glow of its tone while its flash lasts. A broken run fades grey without its rule.
   */
  private drawArena(counter: Counter, frame: CombatHitCounterFrame): void {
    const A = ARENA_COMBO, view = this.spec.camera().worldView, unit = Math.max(1e-6, this.spec.worldPxPerScreenPx());
    const left = counter.side < 0, edge = left ? view.x + CITY_FIGHT_COMBO.edgePx * unit : view.right - CITY_FIGHT_COMBO.edgePx * unit;
    // Under the HUD: the rule, then the digits from a fixed top (a pop grows them down, away from the HUD — grown up from their foot a pop
    // reached 70 px into it); else the village's height, the number standing on its foot.
    const top = this.spec.topShare?.() ?? null, rested = counter.number.height * unit * frame.tier.scale;
    const digitsTop = top === null ? null : view.y + view.height * top + (A.belowHudPx + A.ruleH + A.ruleGapPx) * unit + frame.dy * unit;
    const foot = digitsTop === null ? view.y + view.height * CITY_FIGHT_COMBO.yShare + frame.dy * unit : digitsTop + rested * (1 - A.inkTopShare);
    const x = edge + frame.shakeX * unit;
    if (frame.count !== counter.shown) { counter.shown = frame.count; counter.number.setText(`${frame.count}`); }
    const tone = arenaComboTone(frame.count), glow = !frame.broken && frame.finisherFlash > 0;
    const color = frame.broken ? PALETTE.dim : glow ? PALETTE.white : tone;
    if (color !== counter.tone) { counter.tone = color; counter.number.setColor(cssHex(color)); }
    if (glow !== counter.glow) {
      counter.glow = glow;
      counter.number.setShadow(0, glow ? 0 : A.shadowPx, cssHex(glow ? tone : PALETTE.oddboutInk), glow ? A.glowPx : 0, false, true);
    }
    const label = this.spec.label();
    if (counter.label.text !== label) counter.label.setText(label);
    // The number grows at the edge (a pop, the run's tier) from its digits' top under the HUD, else from its foot; the word keeps its size
    // beside it on the rested number's foot.
    const scale = unit * frame.scale * frame.tier.scale, numberW = counter.number.width * scale, labelW = counter.label.width * unit;
    const gap = A.labelGapPx * unit, numberX = left ? x : x - labelW - gap;
    if (digitsTop === null) counter.number.setOrigin(left ? 0 : 1, 1).setPosition(numberX, foot);
    else counter.number.setOrigin(left ? 0 : 1, A.inkTopShare).setPosition(numberX, digitsTop);
    counter.number.setScale(scale).setAlpha(frame.alpha);
    counter.label.setOrigin(left ? 0 : 1, 1).setPosition(left ? x + numberW + gap : x, foot - A.labelLiftPx * unit).setScale(unit).setAlpha(frame.alpha);
    if (frame.broken) return;
    const ruleW = A.ruleW * unit * frame.windowRatio, ruleY = foot - rested * (1 - A.inkTopShare) - (A.ruleGapPx + A.ruleH) * unit;
    counter.gauge.fillStyle(PALETTE.oddboutAcid, frame.alpha).fillRect(left ? x : x - ruleW, ruleY, ruleW, A.ruleH * unit);
  }
}
