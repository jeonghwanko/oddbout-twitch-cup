import type Phaser from "phaser";
import { clamp01 } from "../../../sim/geom";
import { easeOutBack, easeOutCubic } from "../../art/easing";
import { FONT, PALETTE, cssHex } from "../../art/palette";

/**
 * The winner's card (2026-10-20, the Rivals reference — "RONALD WINS!": the winner fills the screen). It replaces the AI duel's small navy
 * result panel: the town dims, an ink band sweeps in from the winner's side, his front picture (`ARENA_CONCEPT_ART`) slides in over it, the
 * drawn KO letter stamps (the victory page's own letter; a decision writes its word) and his name comes up big. The records stay small
 * under the name (the scene's own text, `recordsAnchor`). Reduced motion: the same card, faded in — nothing slides, scales or shakes.
 *
 * Its timeline is screen ms from `show`; all of it is presentation (the bout's result is already recorded).
 */

/** A piece the card hands its screen space (placed and kept off the scroll). */
type FightWinnerCardObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.ScrollFactor;

/** What the card shows. */
export interface FightWinnerCardContent {
  /** The winner's corner: 0 stands on the left (the card comes in from the left), 1 on the right. */
  readonly side: 0 | 1;
  readonly name: string;
  /** The word under the stamp when there is no drawn KO letter (a decision, or the letter not in yet). */
  readonly how: string;
  /** His front picture's loaded texture (null: a registered fighter has none — the name carries the card). */
  readonly art: { readonly key: string; readonly width: number; readonly height: number } | null;
  /** The drawn KO letter's loaded texture (null: write `how`). */
  readonly koLetter: { readonly key: string; readonly width: number; readonly height: number } | null;
}

/** Where on screen the card stands (the HUD space's logical px): its width and height, and the band of it free of the bars and buttons. */
export interface FightWinnerCardFrame {
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly bottom: number;
}

/** Screen ms and shares of the card's timeline (presentation only). */
export const FIGHT_WINNER_CARD = Object.freeze({
  scrim: { alpha: 0.6, inMs: 180 },
  band: { inMs: 260, heightShare: 0.34, tiltShare: 0.08, alpha: 0.94, edgePx: 5 },
  art: { atMs: 90, inMs: 360, heightShare: 0.86, columnShare: 0.29, slideShare: 0.35 },
  stamp: { atMs: 330, inMs: 170, fromScale: 1.9, heightShare: 0.26, tiltDeg: -8 },
  name: { atMs: 420, inMs: 240, sizeShare: 0.085, riseShare: 0.04 },
  records: { atMs: 640 },
});

export class FightWinnerCard {
  private readonly scrim: Phaser.GameObjects.Rectangle;
  private readonly band: Phaser.GameObjects.Graphics;
  private readonly art: Phaser.GameObjects.Image;
  private readonly stamp: Phaser.GameObjects.Image;
  private readonly how: Phaser.GameObjects.Text;
  private readonly name: Phaser.GameObjects.Text;
  private content: FightWinnerCardContent | null = null;
  private reduced = false;
  private ms = 0;
  private stamped = false;
  private frame: FightWinnerCardFrame = { width: 1, height: 1, top: 0, bottom: 1 };

  /**
   * Built hidden in the scene's screen space (`add` — the HUD space), under whatever the scene adds after it. `onStamp`: the stamp lands
   * (its thud).
   */
  constructor(scene: Phaser.Scene, add: <T extends FightWinnerCardObject>(object: T) => T, private readonly onStamp?: () => void) {
    this.scrim = add(scene.add.rectangle(0, 0, 1, 1, PALETTE.navyInk, 1).setOrigin(0).setName("fight-winner-scrim").setVisible(false));
    this.band = add(scene.add.graphics().setName("fight-winner-band").setVisible(false));
    this.art = add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5, 1).setName("fight-winner-art").setVisible(false));
    this.stamp = add(scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5).setName("fight-winner-stamp").setVisible(false));
    const text = (name: string) => add(scene.add.text(0, 0, "", { fontFamily: FONT.hudSans, fontStyle: "bold", color: cssHex(PALETTE.white),
      stroke: cssHex(PALETTE.webtoonInk), strokeThickness: 6 }).setOrigin(0.5).setName(name).setVisible(false));
    this.how = text("fight-winner-how");
    this.name = text("fight-winner-name");
  }

  get shown(): boolean { return this.content !== null; }

  /** Starts the card (once a bout). */
  show(content: FightWinnerCardContent, reducedMotion: boolean): void {
    this.content = content; this.reduced = reducedMotion; this.ms = 0; this.stamped = false;
    if (content.art) this.art.setTexture(content.art.key);
    if (content.koLetter) this.stamp.setTexture(content.koLetter.key);
    this.how.setText(content.koLetter ? "" : content.how);
    this.name.setText(content.name);
    this.render();
  }

  /** Where its pieces stand; the scene calls it every frame with the HUD space's size. */
  layout(frame: FightWinnerCardFrame): void { this.frame = frame; this.render(); }

  /** Advances the timeline (screen ms). */
  update(dtMs: number): void {
    if (!this.content) return;
    this.ms += Math.max(0, dtMs);
    const T = FIGHT_WINNER_CARD;
    if (!this.stamped && this.ms >= T.stamp.atMs + T.stamp.inMs) { this.stamped = true; this.onStamp?.(); }
    this.render();
  }

  /** Where the scene sets the small records line (centre x, top y, its width) and whether it shows yet. */
  recordsAnchor(): { readonly x: number; readonly y: number; readonly width: number; readonly shown: boolean } {
    const { x, nameY, columnWidth } = this.textColumn();
    return { x, y: nameY + this.name.displayHeight / 2 + 12, width: columnWidth, shown: this.content !== null && this.ms >= FIGHT_WINNER_CARD.records.atMs };
  }

  private textColumn(): { readonly x: number; readonly nameY: number; readonly stampY: number; readonly columnWidth: number } {
    const { width, top, bottom } = this.frame, side = this.content?.side ?? 0, T = FIGHT_WINNER_CARD;
    // The words take the half away from the picture.
    const x = side === 0 ? width * (1 - T.art.columnShare - 0.06) : width * (T.art.columnShare + 0.06);
    const mid = (top + bottom) / 2;
    return { x, stampY: mid - (bottom - top) * 0.12, nameY: mid + (bottom - top) * 0.1, columnWidth: width * 0.5 };
  }

  private render(): void {
    const content = this.content, visible = content !== null;
    for (const object of [this.scrim, this.band, this.art, this.stamp, this.how, this.name]) object.setVisible(visible);
    if (!content) return;
    const T = FIGHT_WINNER_CARD, { width, height, top, bottom } = this.frame, ms = this.ms, reduced = this.reduced;
    const towards = content.side === 0 ? -1 : 1;
    const at = (start: number, length: number) => clamp01((ms - start) / Math.max(1, length));
    // The town under ink.
    this.scrim.setPosition(0, 0).setSize(width, height).setAlpha(T.scrim.alpha * at(0, T.scrim.inMs));
    // The band sweeps in from the winner's side (fades in under reduced motion).
    const bandK = at(0, T.band.inMs), slide = reduced ? 0 : (1 - easeOutCubic(bandK)) * width * towards;
    const mid = (top + bottom) / 2, half = (bottom - top) * T.band.heightShare / 2, tilt = width * T.band.tiltShare;
    this.band.clear().setAlpha(reduced ? bandK : 1).setPosition(slide, 0);
    // The band tilts up toward the far side; its gold top edge follows the tilt.
    const topLeft = mid - half + tilt * 0.25, topRight = mid - half - tilt * 0.25, edge = T.band.edgePx;
    this.band.fillStyle(PALETTE.webtoonInk, T.band.alpha);
    this.band.fillPoints([{ x: -tilt, y: topLeft }, { x: width + tilt, y: topRight },
      { x: width + tilt, y: mid + half - tilt * 0.25 }, { x: -tilt, y: mid + half + tilt * 0.25 }], true);
    this.band.fillStyle(PALETTE.hotGold, 1);
    this.band.fillPoints([{ x: -tilt, y: topLeft - edge }, { x: width + tilt, y: topRight - edge },
      { x: width + tilt, y: topRight }, { x: -tilt, y: topLeft }], true);
    // His picture: bottom on the free band's floor, sliding in from his side.
    if (content.art) {
      const artK = at(T.art.atMs, T.art.inMs), artHeight = (bottom - top) * T.art.heightShare;
      const x = content.side === 0 ? width * T.art.columnShare : width * (1 - T.art.columnShare);
      const dx = reduced ? 0 : (1 - easeOutBack(artK)) * width * T.art.slideShare * towards;
      this.art.setVisible(artK > 0).setAlpha(reduced ? artK : Math.min(1, artK * 3)).setDisplaySize(artHeight * content.art.width / content.art.height, artHeight)
        .setPosition(x + dx, bottom);
    } else this.art.setVisible(false);
    // The KO stamp (or the word for a decision): dropped big onto the band, settling with a tilt.
    const column = this.textColumn(), stampK = at(T.stamp.atMs, T.stamp.inMs);
    const stampScale = reduced ? 1 : T.stamp.fromScale + (1 - T.stamp.fromScale) * easeOutCubic(stampK);
    if (content.koLetter) {
      const h = (bottom - top) * T.stamp.heightShare, w = h * content.koLetter.width / content.koLetter.height;
      this.stamp.setVisible(stampK > 0).setAlpha(stampK > 0 ? 1 : 0).setDisplaySize(w * stampScale, h * stampScale)
        .setPosition(column.x, column.stampY).setAngle(T.stamp.tiltDeg);
      this.how.setVisible(false);
    } else {
      this.stamp.setVisible(false);
      this.how.setFontSize(Math.round((bottom - top) * T.stamp.heightShare * 0.7)).setScale(stampScale).setAlpha(stampK > 0 ? 1 : 0)
        .setPosition(column.x, column.stampY).setAngle(T.stamp.tiltDeg);
    }
    // His name, big, rising into place.
    const nameK = at(T.name.atMs, T.name.inMs);
    this.name.setFontSize(Math.max(18, Math.round(height * T.name.sizeShare))).setAlpha(easeOutCubic(nameK));
    this.name.setScale(Math.min(1, column.columnWidth / Math.max(1, this.name.width)));
    this.name.setPosition(column.x, column.nameY + (reduced ? 0 : (1 - easeOutCubic(nameK)) * height * T.name.riseShare));
  }
}
