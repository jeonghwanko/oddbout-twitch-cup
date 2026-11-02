import type Phaser from "phaser";
import { CSS, FONT, PALETTE } from "../art/palette";
import { VILLAGE_DEPTHS } from "../depths";
import { easeOutBackWith } from "../art/easing";
import { BUBBLE_SHIELD, bubbleShieldCracks, bubbleShieldFrame } from "../effects/webtoon/BubbleShield";
import { drawSpeechBubble } from "./webtoon/CombatWebtoonArt";
import { wrapsByLetter } from "../ui/LetterWrap";

/**
 * 도시 대결의 한마디(2026-10-09 전통 공방: 승리 인사 "수고하셨습니다", 쿠마 근무 전환 "지금부터 야근이다!"). 구운 글자 없이 i18n 문자열만.
 * 튀어나오며 커지고(모션 감소면 바로), 끝 160ms 에 사라진다. 월드 카메라 전용(씬이 UI 카메라보다 먼저 만든다).
 *
 * 만화 말풍선(2026-10-16, 사용자 "지금 말풍선이 퀄리티를 너무 떨어뜨린다"): 남색 사각 라벨 대신 종이색 몸통·잉크 외곽선·꼬리, 잉크 글자.
 * `speech` 는 둥근 말풍선(웹툰 판과 같은 `drawSpeechBubble`), `shout` 는 외침의 들쭉날쭉한 버스트(만화 레터링 관례). 꼬리 끝이 말하는 머리다.
 *
 * 방패(2026-10-16, `BubbleShield`): 떠 있는 말풍선 위로 공격이 지나가면 그 공격을 맞는다 — 금이 가고 떨리다 조각난다.
 */
export type NativeCityCombatBubbleStyle = "speech" | "shout";

/** The bubble's shape (screen px at zoom 1): padding round the text, the tail's length to the head, the ink outline, the burst's spikes. */
const BUBBLE_WRAP_PX = 260;
const BUBBLE = Object.freeze({ padX: 14, padY: 9, shoutPadX: 22, shoutPadY: 16, tailPx: 16, outlinePx: 3, spikes: 16, spikePx: 9 });

export class NativeCityCombatBubbleView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  /** The shield's cracks and flying pieces, over the box (same layer, made after it). */
  private readonly shieldInk: Phaser.GameObjects.Graphics;
  private shown: { ageMs: number; readonly durationMs: number } | null = null;
  private shield: { ageMs: number; readonly side: -1 | 1; readonly seed: number } | null = null;
  /** The body's box over the head (local px: the tail tip at 0, 0). */
  private box = { x: 0, y: 0, w: 0, h: 0 };

  constructor(scene: Phaser.Scene, private readonly style: NativeCityCombatBubbleStyle = "speech") {
    this.shape = scene.add.graphics().setName("native-city-combat-bubble-shape");
    this.text = scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontSize: style === "shout" ? 19 : 17, fontStyle: "800",
      color: CSS.paperInk, align: "center", wordWrap: { width: BUBBLE_WRAP_PX } }).setOrigin(0.5, 0.5).setResolution(2);
    this.root = scene.add.container(0, 0, [this.shape, this.text]).setDepth(VILLAGE_DEPTHS.worldLighting).setVisible(false)
      .setName("native-city-combat-bubble");
    this.shieldInk = scene.add.graphics().setDepth(VILLAGE_DEPTHS.worldLighting).setName("native-city-combat-bubble-shield");
  }

  get object(): Phaser.GameObjects.Container { return this.root; }
  get objects(): readonly Phaser.GameObjects.GameObject[] { return [this.root, this.shieldInk]; }
  get visible(): boolean { return this.root.visible; }
  /** How far its body reaches over the tail tip (world px at full size): a caller keeping it under a ceiling puts the tip this far below. */
  get reachPx(): number { return -this.box.y; }

  say(text: string, durationMs: number): void {
    this.text.setWordWrapWidth(BUBBLE_WRAP_PX, wrapsByLetter(text)).setText(text);
    this.drawShape();
    this.shown = { ageMs: 0, durationMs: Math.max(1, durationMs) };
    this.shield = null;
    this.shieldInk.clear();
  }

  /**
   * A blow passed over the bubble (`dodged`) from `side` (-1 left, 1 right of it): it takes the hit — cracks, shakes, breaks `breakInMs`
   * later (the village's dodge: the whole `BUBBLE_SHIELD.breakMs`; the arena's call letter over a rival's line: at once, its words not left
   * under the letter through the hit stop).
   */
  strike(side: -1 | 1, breakInMs: number = BUBBLE_SHIELD.breakMs): void {
    if (!this.shown || this.shield) return;
    const ageMs = BUBBLE_SHIELD.breakMs - Math.min(BUBBLE_SHIELD.breakMs, Math.max(0, breakInMs));
    this.shield = { ageMs, side, seed: (Math.round(this.root.x) * 31 + Math.round(this.root.y)) | 0 };
  }

  /** Each frame: its tail on `head` (world px), popping in and fading out on screen time. */
  update(dtMs: number, head: readonly [number, number], reducedMotion: boolean): void {
    const shown = this.shown;
    if (!shown) return;
    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
    shown.ageMs += dt;
    const shield = this.shield;
    if (shield) { shield.ageMs += dt; this.drawShield(shield, head, reducedMotion); return; }
    if (shown.ageMs >= shown.durationMs) { this.shown = null; this.root.setVisible(false); return; }
    const pop = reducedMotion ? 1 : Math.min(1, shown.ageMs / 110);
    // Ease-back pop about the tail tip (the speaker): 0.6 → a little past 1 → 1.
    const scale = 0.6 + 0.4 * easeOutBackWith(pop, 2.4);
    const fade = shown.ageMs < shown.durationMs - 160 ? 1 : (shown.durationMs - shown.ageMs) / 160;
    this.root.setVisible(true).setPosition(Math.round(head[0]), Math.round(head[1])).setScale(scale).setAlpha(Math.max(0, fade));
  }

  /** The body round the text (paper, an ink outline) with its tail down to the tip at the container's origin. */
  private drawShape(): void {
    const shout = this.style === "shout";
    const w = Math.ceil(this.text.width + 2 * (shout ? BUBBLE.shoutPadX : BUBBLE.padX));
    const h = Math.ceil(this.text.height + 2 * (shout ? BUBBLE.shoutPadY : BUBBLE.padY));
    const x = -w / 2, y = -BUBBLE.tailPx - h;
    this.box = { x, y, w, h };
    this.text.setPosition(0, y + h / 2);
    const g = this.shape.clear();
    if (!shout) {
      // The webtoon page's bubble, its top-left at the box (the tail tip at the head: 0, 0 here).
      g.setPosition(x, y);
      drawSpeechBubble(g, w, h, -x, -y, BUBBLE.outlinePx);
      return;
    }
    // The shout's burst: spikes round an ellipse (seeded by the line's length — the same line keeps its shape), a short wedge tail.
    g.setPosition(0, 0);
    const cx = 0, cy = y + h / 2, rx = w / 2, ry = h / 2, n = BUBBLE.spikes, seed = this.text.text.length;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2, out = i % 2 === 0, jitter = ((Math.imul(seed + i * 7, 0x9e3779b1) >>> 0) % 100) / 100;
      const push = out ? BUBBLE.spikePx * (0.7 + 0.6 * jitter) : -BUBBLE.spikePx * 0.15;
      points.push({ x: cx + Math.cos(a) * (rx + push), y: cy + Math.sin(a) * (ry + push * ry / rx) });
    }
    const tail = [{ x: -9, y: y + h - 4 }, { x: 0, y: 0 }, { x: 9, y: y + h - 4 }];
    g.lineStyle(BUBBLE.outlinePx * 2, PALETTE.webtoonInk).strokePoints(points, true).strokePoints(tail, true);
    g.fillStyle(PALETTE.paper).fillPoints(tail, true).fillPoints(points, true);
  }

  /** The struck bubble: cracks over the body while it shakes, then its pieces fly (`bubbleShieldFrame`); gone after. */
  private drawShield(shield: { ageMs: number; readonly side: -1 | 1; readonly seed: number }, head: readonly [number, number], reduced: boolean): void {
    const g = this.shieldInk.clear(), { w, h } = this.box;
    const frame = bubbleShieldFrame(shield.ageMs, w, h, shield.side, shield.seed, reduced);
    if (!frame) { this.hide(); return; }
    const cx = Math.round(head[0]) + frame.shakeX, cy = Math.round(head[1]) + this.box.y + h / 2;
    if (!frame.broken) {
      this.root.setVisible(true).setPosition(cx, Math.round(head[1])).setScale(1).setAlpha(1);
      g.lineStyle(2, PALETTE.webtoonInk, 1);
      for (const crack of bubbleShieldCracks(w, h, shield.side, frame.grow, shield.seed)) {
        g.beginPath();
        crack.forEach(([x, y], i) => (i === 0 ? g.moveTo(cx + x, cy + y) : g.lineTo(cx + x, cy + y)));
        g.strokePath();
      }
      return;
    }
    this.root.setVisible(false);
    for (const piece of frame.pieces) {
      const c = Math.cos(piece.angle), s = Math.sin(piece.angle);
      const pts = piece.points.map(([x, y]) => ({ x: cx + piece.cx + (x * c - y * s) * piece.scale, y: cy + piece.cy + (x * s + y * c) * piece.scale }));
      g.fillStyle(PALETTE.paper, 1).fillPoints(pts, true);
      g.lineStyle(1.5, PALETTE.webtoonInk, 1).strokePoints(pts, true);
    }
  }

  hide(): void { this.shown = null; this.shield = null; this.root.setVisible(false); this.shieldInk.clear(); }
}
