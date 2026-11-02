import type Phaser from "phaser";
import { clamp01 } from "../../../sim/geom";
import { easeOutCubic } from "../../art/easing";
import { FONT, PALETTE, cssHex } from "../../art/palette";
import { uiFeedback, type UiFeedbackHandle } from "../../ui/UiFeedback";
import { arenaVersusLayout } from "./ArenaFightLayout";
import { ARENA_UI, fitArenaText } from "./ArenaUi";

/**
 * The versus card that asks who wins (2026-10-24, 승자 찍기 — `app/ArenaPicks`): over the ring before READY, the title, the two fighters'
 * front pictures facing each other (a on the left, b on the right, as the ring has them), their names and VS. A press on either takes him;
 * he springs, the other dims, and the card goes. Until a key, the pad or the pointer moves, neither is under the cursor (no fighter is
 * offered first); the pointer over one puts the cursor on him, so 확인 takes the one that looks taken. Presses wait for the card to have come
 * in (none lands on a card he has not seen).
 * No help sentence (the arena's flat game UI): the title is the only words besides the names. Reduced motion: no fade, slide or spring.
 *
 * Its timeline is screen ms; all of it is presentation (the bout waits under it with its seed fixed).
 */

type ArenaVersusCardObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.ScrollFactor;

/** A loaded front picture's texture and size. */
export interface ArenaVersusCardArt { readonly key: string; readonly width: number; readonly height: number }

export interface ArenaVersusCardContent {
  readonly title: string;
  readonly names: readonly [string, string];
  /** Each corner's front picture (null: none — his name carries his side). */
  readonly art: readonly [ArenaVersusCardArt | null, ArenaVersusCardArt | null];
}

/** Screen ms and shares of the card (presentation only). */
export const ARENA_VERSUS_CARD = Object.freeze({
  scrim: 0.74,
  inMs: 220,
  /** How far the pictures slide in from their sides, of the column's width. */
  slideShare: 0.12,
  picked: { holdMs: 320, outMs: 180, pop: 0.07, popMs: 260, dim: 0.28, barShare: 0.36, barPx: 4 },
});

export class ArenaVersusCard {
  private readonly scrim: Phaser.GameObjects.Rectangle;
  private readonly panels: readonly [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Rectangle];
  private readonly arts: readonly [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private readonly names: readonly [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly bar: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly vs: Phaser.GameObjects.Text;
  private readonly hits: readonly [Phaser.GameObjects.Zone, Phaser.GameObjects.Zone];
  private readonly feedback: readonly [UiFeedbackHandle, UiFeedbackHandle];
  private content: ArenaVersusCardContent | null = null;
  private reduced = false;
  private ms = 0;
  private cursor: 0 | 1 | null = null;
  private chosen: 0 | 1 | null = null;
  private chosenMs = 0;
  private size = { width: 1, height: 1, textScale: 1 };
  /** The font size each text was last given at scale 1 (the accessibility runtime scales it; set again only when it changes). */
  private readonly fonts = new Map<Phaser.GameObjects.Text, number>();

  /** Built hidden in the scene's screen space (`add` — the HUD space). `onPress`: a pointer took corner `corner`. */
  constructor(scene: Phaser.Scene, add: <T extends ArenaVersusCardObject>(object: T) => T, onPress: (corner: 0 | 1) => void) {
    this.scrim = add(scene.add.rectangle(0, 0, 1, 1, PALETTE.oddboutInk, 1).setOrigin(0).setName("arena-versus-scrim"));
    const panel = (corner: 0 | 1) => add(scene.add.rectangle(0, 0, 1, 1, PALETTE.white, ARENA_UI.cell).setOrigin(0)
      .setStrokeStyle(1, PALETTE.white, ARENA_UI.rule).setName(`arena-versus-panel-${corner}`));
    this.panels = [panel(0), panel(1)];
    const art = (corner: 0 | 1) => add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5, 1).setFlipX(corner === 1).setName(`arena-versus-art-${corner}`));
    this.arts = [art(0), art(1)];
    const text = (name: string, family: string) => add(scene.add.text(0, 0, "", { fontFamily: family, fontStyle: "bold", color: cssHex(PALETTE.white),
      stroke: cssHex(PALETTE.webtoonInk), strokeThickness: 6, align: "center" }).setOrigin(0.5).setName(name));
    this.names = [text("arena-versus-name-0", FONT.hudSans), text("arena-versus-name-1", FONT.hudSans)];
    this.bar = add(scene.add.rectangle(0, 0, 1, 1, PALETTE.oddboutAcid, 1).setOrigin(0.5, 0).setName("arena-versus-pick-bar"));
    this.title = text("arena-versus-title", FONT.hudSans);
    this.vs = text("arena-versus-vs", FONT.lettering);
    const hit = (corner: 0 | 1) => {
      const zone = add(scene.add.zone(0, 0, 1, 1).setOrigin(0).setName(`arena-versus-hit-${corner}`).setInteractive({ useHandCursor: true }));
      zone.on("pointerdown", () => { if (this.ready && this.chosen === null) onPress(corner); });
      zone.on("pointerover", () => this.focus(corner));
      return zone;
    };
    this.hits = [hit(0), hit(1)];
    const feedback = (corner: 0 | 1) => uiFeedback(this.hits[corner], { visuals: [this.panels[corner]],
      suppressed: () => !this.ready || this.chosen !== null });
    this.feedback = [feedback(0), feedback(1)];
    this.render();
  }

  /** The card is up (shown and not yet gone). */
  get open(): boolean { return this.content !== null && !this.closed; }
  /** A fighter was taken and the card has gone. */
  get closed(): boolean {
    const P = ARENA_VERSUS_CARD.picked;
    return this.chosen !== null && this.chosenMs >= P.holdMs + (this.reduced ? 0 : P.outMs);
  }
  get focused(): 0 | 1 | null { return this.cursor; }
  /** Up and come in: a press may take a fighter. */
  private get ready(): boolean { return this.open && (this.reduced || this.ms >= ARENA_VERSUS_CARD.inMs); }

  show(content: ArenaVersusCardContent, reducedMotion: boolean): void {
    this.content = content; this.reduced = reducedMotion; this.ms = 0; this.cursor = null; this.chosen = null; this.chosenMs = 0;
    for (const corner of [0, 1] as const) {
      const art = content.art[corner];
      if (art) this.arts[corner].setTexture(art.key);
      this.names[corner].setText(content.names[corner]);
    }
    this.title.setText(content.title);
    this.vs.setText("VS");
    this.render();
  }

  /** The keyboard or pad cursor on `corner`. */
  focus(corner: 0 | 1): void {
    if (!this.open || this.chosen !== null) return;
    this.cursor = corner;
    for (const other of [0, 1] as const) this.feedback[other].setFocused(other === corner);
  }

  /** Takes `corner` (once): true when it took him. `keyed`: by a key or the pad (a pointer's press already played its press). */
  choose(corner: 0 | 1, keyed: boolean): boolean {
    if (!this.ready || this.chosen !== null) return false;
    if (keyed) this.feedback[corner].press();
    for (const other of [0, 1] as const) this.feedback[other].setFocused(false);
    this.chosen = corner; this.chosenMs = 0; this.cursor = corner;
    this.render();
    return true;
  }

  /** Where its pieces stand; the scene calls it every frame with the HUD space's size. */
  layout(width: number, height: number, textScale: number): void { this.size = { width, height, textScale }; this.render(); }

  update(dtMs: number): void {
    if (!this.content) return;
    const dt = Math.max(0, dtMs);
    this.ms += dt;
    if (this.chosen !== null) this.chosenMs += dt;
    this.render();
  }

  destroy(): void {
    for (const object of [this.scrim, ...this.panels, ...this.arts, ...this.names, this.bar, this.title, this.vs, ...this.hits]) object.destroy();
  }

  private render(): void {
    const content = this.content, visible = this.open;
    for (const object of [this.scrim, ...this.panels, ...this.arts, ...this.names, this.title, this.vs]) object.setVisible(visible);
    this.bar.setVisible(visible && this.chosen !== null);
    for (const zone of this.hits) zone.setVisible(visible);
    if (!content || !visible) return;
    const T = ARENA_VERSUS_CARD, P = T.picked, { width, height, textScale } = this.size, reduced = this.reduced;
    const L = arenaVersusLayout(width, height, textScale);
    const fadeIn = reduced ? 1 : easeOutCubic(clamp01(this.ms / T.inMs));
    const out = this.chosen === null || reduced ? 0 : clamp01((this.chosenMs - P.holdMs) / P.outMs);
    const alpha = fadeIn * (1 - out);
    this.scrim.setPosition(0, 0).setSize(width, height).setAlpha(T.scrim * alpha);
    this.font(this.title, L.title.font).setPosition(L.title.x, L.title.y).setAlpha(alpha);
    fitArenaText(this.title, L.title.width);
    this.font(this.vs, L.vs.font).setPosition(L.vs.x, L.vs.y).setAlpha(alpha * (this.chosen === null ? 1 : P.dim));
    fitArenaText(this.vs, L.vs.width);
    for (const corner of [0, 1] as const) {
      const box = L.art[corner], nameBox = L.names[corner], hit = L.hits[corner], art = content.art[corner];
      const lost = this.chosen !== null && this.chosen !== corner, won = this.chosen === corner;
      const sideAlpha = alpha * (lost ? P.dim : 1);
      this.panels[corner].setPosition(hit.x, hit.y).setSize(hit.width, hit.height).setAlpha(sideAlpha);
      this.hits[corner].setPosition(hit.x, hit.y).setSize(hit.width, hit.height);
      const name = this.names[corner];
      this.font(name, L.nameFont).setPosition(nameBox.x + nameBox.width / 2, nameBox.y + nameBox.height / 2).setAlpha(sideAlpha);
      fitArenaText(name, nameBox.width - 16);
      const picture = this.arts[corner];
      picture.setVisible(art !== null);
      if (art) {
        const fit = Math.min(box.width / art.width, (box.height - 8) / art.height);
        const pop = won && !reduced ? P.pop * Math.sin(Math.PI * clamp01(this.chosenMs / P.popMs)) : 0;
        const slide = reduced ? 0 : (1 - fadeIn) * box.width * T.slideShare * (corner === 0 ? -1 : 1);
        picture.setScale(fit * (1 + pop)).setPosition(box.x + box.width / 2 + slide, box.y + box.height).setAlpha(sideAlpha);
      }
      if (won) {
        this.bar.setPosition(nameBox.x + nameBox.width / 2, name.y + name.displayHeight / 2 + 4)
          .setSize(nameBox.width * P.barShare, P.barPx).setAlpha(alpha);
      }
    }
  }

  /** `text` at `px` (scale 1) — set only when it changes, so the accessibility runtime's scaled size stays and nothing redraws each frame. */
  private font(text: Phaser.GameObjects.Text, px: number): Phaser.GameObjects.Text {
    if (this.fonts.get(text) !== px) { this.fonts.set(text, px); text.setFontSize(px); }
    return text;
  }
}
