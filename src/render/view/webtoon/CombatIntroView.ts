import type Phaser from "phaser";
import type { Locale } from "../../../app/Locale";
import { PALETTE } from "../../art/palette";
import { COMBAT_INTRO_LETTERS, introFlashAt, introFocusLinesAt, introInkAt, introKickDeg, introLetterAt, introShakeAt, introSplatAt,
  type CombatIntroDirector, type CombatIntroLetter } from "../../effects/webtoon/CombatIntroTimeline";
import type { CombatEncounterConfig } from "../../effects/webtoon/CombatEndingDirector";
import { bakeCallLetter, buildKeyGlyph, drawFocusLines, drawSplat, type BakedLetter } from "./CombatWebtoonArt";
import type { CombatOverlayStage } from "./CombatOverlayStage";
import { artTextureKey } from "../../art/ArtFallback";

export interface CombatIntroViewOptions {
  readonly encounter: CombatEncounterConfig;
  readonly director: CombatIntroDirector;
  readonly locale: Locale;
  /** The skip key's glyph label (keyboard key or pad button). */
  readonly skipLabel: string;
  /** A click anywhere (the skip). */
  readonly onSkip: () => void;
}

interface LetterView {
  readonly letter: CombatIntroLetter;
  readonly image: Phaser.GameObjects.Image;
  readonly scale: number;
  /** Design-frame y of the letter's spot (the exit lifts it from here). */
  readonly y: number;
  readonly splat: Phaser.GameObjects.Graphics;
}

/**
 * The fight start (`CombatIntroDirector` beats, 2026-10-10 READY → FIGHT!): letters only, over the live world — the fighters back off
 * to the opening spacing underneath (`NativeCityFightBackpedal`, driven by the scene). READY stamps (쾅!) and holds; FIGHT! drops onto
 * its spot as the spacing is reached (쾅!!, edge focus lines), knocking READY flat; each impact freezes the letters (hit-stop) while
 * they jolt, kick and flash; then FIGHT! punches up and fades, the fight already running. No scrim: only a rematch's defeat ink,
 * clearing fast. A keycap glyph shows the skip; a click anywhere skips too.
 *
 * Layers (from `stage.depth`): the rematch's ink, focus lines + splats + letters, flash, glyph, click blocker.
 */
export class CombatIntroView {
  private readonly ink: Phaser.GameObjects.Rectangle;
  private readonly letterRoot: Phaser.GameObjects.Container;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private readonly glyph: { readonly root: Phaser.GameObjects.Container; readonly width: number; readonly height: number };
  private readonly blocker: Phaser.GameObjects.Zone;
  private readonly focusLines: Phaser.GameObjects.Graphics;
  private readonly letters: LetterView[] = [];

  constructor(private readonly stage: CombatOverlayStage, private readonly options: CombatIntroViewOptions) {
    const scene = stage.scene, tuning = options.encounter.tuning, I = tuning.intro, frame = tuning.frame;
    this.ink = stage.top(scene.add.rectangle(0, 0, 1, 1, PALETTE.webtoonInk).setOrigin(0).setAlpha(0).setName("combat-intro-ink"), 0);
    this.letterRoot = stage.top(scene.add.container(0, 0).setName("combat-intro-letters"), 0.3);
    const letterFrame = scene.add.container(-frame.w / 2, -frame.h / 2).setName("combat-intro-letters-frame");
    this.letterRoot.add(letterFrame);
    // The edge focus lines, under the letters.
    const halfDiagonal = Math.hypot(frame.w, frame.h) / 2, F = I.focusLines;
    this.focusLines = scene.add.graphics({ x: frame.w / 2, y: frame.h / 2 }).setVisible(false).setName("combat-intro-focus-lines");
    drawFocusLines(this.focusLines, 0, 0, halfDiagonal * F.innerFrac, halfDiagonal * 1.3, F.count, F.seed, PALETTE.webtoonInk, F.alpha, F.widthPx);
    letterFrame.add(this.focusLines);
    for (const letter of COMBAT_INTRO_LETTERS) {
      const spot = I[letter];
      const splat = scene.add.graphics({ x: spot.x, y: spot.y }).setVisible(false).setName(`combat-intro-splat-${letter}`);
      drawSplat(splat, spot.sizePx * tuning.letters.splat.radiusRatio, tuning.letters.splat.count, F.seed + (letter === "ready" ? 3 : 9), PALETTE.webtoonInk);
      const baked = this.letter(letter, spot.sizePx);
      const image = scene.add.image(spot.x, spot.y, baked?.key ?? "__DEFAULT").setVisible(false).setName(`combat-intro-letter-${letter}`);
      letterFrame.add([splat, image]);
      if (baked) this.letters.push({ letter, image, scale: baked.scale, y: spot.y, splat });
    }
    this.flash = stage.top(scene.add.rectangle(0, 0, 1, 1, PALETTE.webtoonFlash).setOrigin(0).setAlpha(0).setName("combat-intro-flash"), 0.4);
    const G = tuning.skipGlyph;
    this.glyph = buildKeyGlyph(scene, options.skipLabel, G.heightPx, G.fontPx, true, "combat-intro-skip");
    stage.top(this.glyph.root.setAlpha(G.alpha), 0.5);
    this.blocker = stage.top(scene.add.zone(0, 0, 1, 1).setOrigin(0).setName("combat-intro-blocker"), 0.6);
    this.blocker.setInteractive().on("pointerdown", (_pointer: Phaser.Input.Pointer, _x: number, _y: number,
      event: Phaser.Types.Input.EventData) => { event.stopPropagation(); options.onSkip(); });
    this.render();
  }

  /** Poses everything for the director's current beat. */
  render(): void {
    const stage = this.stage, director = this.options.director, s = director.schedule, ms = director.ms;
    const tuning = this.options.encounter.tuning, W = stage.width, H = stage.height, k = stage.frameScale;
    const loading = director.phase === "load";
    // Full-bleed layers: a rematch's defeat ink clearing off the world, the impact flash.
    stage.place(this.ink, -W * 0.1, -H * 0.1).setSize(W * 1.2, H * 1.2)
      .setAlpha(loading ? (director.fromInk ? 1 : 0) : introInkAt(s, ms, director.fromInk, tuning));
    stage.place(this.flash, 0, 0).setSize(W, H).setAlpha(loading ? 0 : introFlashAt(s, ms, tuning));
    stage.place(this.blocker, 0, 0).setSize(W, H);
    const G = tuning.skipGlyph;
    stage.place(this.glyph.root, W - G.marginPx - this.glyph.width, H - G.marginPx - this.glyph.height).setVisible(director.holdsFight);
    this.blocker.setVisible(director.holdsFight);
    if (this.blocker.input) this.blocker.input.enabled = director.holdsFight;
    // The letters, kicked and jolted about the view centre.
    const kick = loading ? 0 : introKickDeg(s, ms, tuning) * Math.PI / 180;
    const shake = loading ? { x: 0, y: 0 } : introShakeAt(s, ms, tuning);
    stage.place(this.letterRoot, W / 2 + shake.x * k, H / 2 + shake.y * k).setScale(k).setRotation(kick);
    this.letterRoot.setVisible(!loading && ms < s.endMs);
    if (loading) return;
    const lines = introFocusLinesAt(s, ms);
    this.focusLines.setVisible(lines.alpha > 0).setAlpha(lines.alpha).setScale(lines.scale);
    for (const view of this.letters) {
      const pose = introLetterAt(s, view.letter, ms, tuning), splat = introSplatAt(s, view.letter, ms, tuning);
      view.image.setVisible(pose.alpha > 0).setAlpha(pose.alpha).setScale(view.scale * pose.scaleX, view.scale * pose.scaleY)
        .setAngle(pose.angleDeg).setY(view.y - pose.liftPx);
      view.splat.setVisible(splat.alpha > 0).setAlpha(splat.alpha).setScale(Math.max(0.001, splat.scale));
    }
  }

  destroy(): void { this.stage.destroy(); }

  /** The drawn letter when the art pass has it, else the code font baked once (READY / FIGHT! are Latin: the lettering font). */
  private letter(letter: CombatIntroLetter, sizePx: number): BakedLetter | null {
    const scene = this.stage.scene, { catalog, letters, tuning } = this.options.encounter, id = letters[letter], locale = this.options.locale;
    const drawn = catalog.letter(id, locale);
    if (drawn && artTextureKey(scene, drawn.key, "decorative") !== null) {
      const source = scene.textures.get(drawn.key).getSourceImage() as { height: number };
      return { key: drawn.key, scale: sizePx * 1.25 / Math.max(1, source.height) };
    }
    return bakeCallLetter(scene, `combat-letter-${this.options.encounter.id}-${locale}-${id}`, catalog.letterText(id, locale), sizePx, tuning);
  }
}
