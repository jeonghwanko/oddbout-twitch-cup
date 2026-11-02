import type Phaser from "phaser";
import { applyPlayerTextScale, playerSettingsFor } from "../../accessibility/AccessibilityRuntime";
import type { ArenaScreenSpace } from "./ArenaHudSpace";
import { ARENA_DEPTHS } from "../../depths";
import { cssHex, FONT, PALETTE, TYPE } from "../../art/palette";
import { keyHintRow, type KeyHintItem } from "../../view/KeycapArt";
import { uiFeedback } from "../../ui/UiFeedback";
import { arenaFightHudLayout, arenaHpBarHeight } from "./ArenaFightLayout";

/** One move's key chip under the fight: its key on the device in use and its short name (`ActionLabels`). */
export interface ArenaHudKey {
  readonly key: string;
  readonly label: string;
}

/** One frame of the arena's own HUD (the fighters' faces, HP and meters are the face HUD's — `ArenaFaceHud`). */
export interface ArenaHudFrame {
  /** The moves' key chips along the bottom; empty while the talk is up or the AI plays him. */
  readonly keys: readonly ArenaHudKey[];
  /** The control switch's word (직접 조종 · AI 조종) and its key. */
  readonly autoLabel: string;
  readonly autoKey: string;
  readonly autoAvailable: boolean;
  /** The fight overlays own the screen (intro, victory page, defeat card): the HUD steps aside. */
  readonly hidden: boolean;
  /** The `?` (every status icon with its line) shows: the bout is on (before it — under the challenge talk — the status card has nothing to say). */
  readonly statusHelp: boolean;
  /** The control chip's top (HUD px); absent: the top margin. The duel screen puts it under its face HUD (a portrait rises over the top right). */
  readonly autoTop?: number;
}

/** A press on the `?` (the scene's status card) and on the control chip. */
export interface ArenaHudActions {
  readonly help: () => void;
  readonly auto: () => void;
}

/** The `?` disc's radius and the gap between the key chips' rows (HUD px). */
const HELP_RADIUS = 13;
const KEY_ROW_GAP = 8;

/**
 * The arena's HUD in the village HUD's CSS scale and flat type (2026-10-20 game layout — 사용자: "플랫한, 간단 명확하게", "상하단에 작게 있는
 * 설명 문구는 제거"). The two HP bars are the shared bar on both corners (the AI duel's too — 사용자: "무투장에서 상단 UI가 다른데, 통일할 수
 * 없어???"); this view adds the control switch as a chip (its key, its word) at the top right, the `?` as a disc between the bars, and the
 * moves as key chips along the bottom — no round label, no sentence of help. Hidden while the fight's overlays show.
 */
export class ArenaHudView {
  private readonly helpDisc: Phaser.GameObjects.Arc;
  private readonly help: Phaser.GameObjects.Text;
  private readonly autoBack: Phaser.GameObjects.Rectangle;
  private autoRow: Phaser.GameObjects.Container | null = null;
  private autoKey = "";
  private keyRows: Phaser.GameObjects.Container[] = [];
  private keysKey = "";

  constructor(private readonly scene: Phaser.Scene, private readonly space: ArenaScreenSpace, actions: ArenaHudActions) {
    const style = { fontFamily: FONT.hudSans, color: cssHex(PALETTE.white), stroke: cssHex(PALETTE.navyInk), strokeThickness: 3 };
    // `?`: a small navy disc with a white rim between the two bars — every status icon with its line.
    this.helpDisc = space.add(scene.add.circle(0, 0, HELP_RADIUS, PALETTE.navyInk, 0.85).setStrokeStyle(1.5, PALETTE.white, 0.8)
      .setDepth(ARENA_DEPTHS.hud).setName("arena-hud-help-disc").setInteractive({ useHandCursor: true }));
    this.help = space.add(scene.add.text(0, 0, "?", { ...style, strokeThickness: 0, fontSize: TYPE.body, fontStyle: "bold" })
      .setOrigin(0.5).setDepth(ARENA_DEPTHS.hud).setName("arena-hud-help"));
    this.helpDisc.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); actions.help(); });
    // The control switch: one flat navy chip (its key chip and its word) — pressing it anywhere flips the control.
    this.autoBack = space.add(scene.add.rectangle(0, 0, 120, 36, PALETTE.navyInk, 0.85).setOrigin(1, 0).setDepth(ARENA_DEPTHS.hud)
      .setName("arena-hud-auto").setInteractive({ useHandCursor: true }));
    this.autoBack.on("pointerdown", (_p: unknown, _x: number, _y: number, event: Phaser.Types.Input.EventData) => { event.stopPropagation(); actions.auto(); });
    applyPlayerTextScale(scene, this.help);
    uiFeedback(this.helpDisc, { visuals: [this.helpDisc, this.help], frame: false, burst: false, intensity: "subtle" });
    uiFeedback(this.autoBack, { visuals: [this.autoBack], frame: false, burst: false, intensity: "subtle" });
  }

  update(frame: ArenaHudFrame): void {
    const shown = !frame.hidden;
    const autoShown = shown && frame.autoAvailable;
    this.helpDisc.setVisible(shown && frame.statusHelp);
    this.help.setVisible(shown && frame.statusHelp);
    this.autoBack.setVisible(autoShown);
    this.autoRow?.setVisible(autoShown);
    for (const row of this.keyRows) row.setVisible(shown && frame.keys.length > 0);
    if (!shown) return;
    const textScale = playerSettingsFor(this.scene).textScale;
    const layout = arenaFightHudLayout(this.space.width, this.space.height, textScale);
    const { margin, columnWidth, barY: top } = layout, barHeight = arenaHpBarHeight;
    this.placeAuto(frame, frame.autoTop ?? layout.metaY, this.space.width - margin, columnWidth);
    this.placeKeys(frame.keys, layout.footerY, layout.footerWidth);
    // Status help gets its own slot in the centre gutter, clear of both HP bars and their status rows.
    this.space.setLogicalPosition(this.helpDisc, this.space.width / 2, top + barHeight / 2);
    this.space.setLogicalPosition(this.help, this.space.width / 2, top + barHeight / 2);
  }

  /** The control chip at the top right (`right` its right edge): drawn again when its word or key changes. */
  private placeAuto(frame: ArenaHudFrame, y: number, right: number, maxWidth: number): void {
    const signature = `${frame.autoKey}\u0000${frame.autoLabel}`;
    if (signature !== this.autoKey) {
      this.autoKey = signature;
      this.autoRow?.destroy();
      this.autoRow = this.space.add(keyHintRow(this.scene, [{ keys: [frame.autoKey], label: frame.autoLabel }], 0, 0,
        { fontFamily: FONT.hudSans, fontSize: TYPE.label, fontStyle: "bold", color: cssHex(PALETTE.white) }).container
        .setDepth(ARENA_DEPTHS.hud).setName("arena-hud-auto-row").setVisible(this.autoBack.visible));
    }
    const row = this.autoRow!;
    row.setScale(Math.min(1, (maxWidth - 24) / Math.max(1, row.width)));
    const width = row.width * row.scaleX + 24, height = Math.max(36, row.height * row.scaleY + 12);
    // A shape's setSize also resizes its own hit rectangle.
    if (this.autoBack.width !== width || this.autoBack.height !== height) this.autoBack.setSize(width, height);
    this.space.setLogicalPosition(this.autoBack, right, y);
    this.space.setLogicalPosition(row, right - width / 2, y + height / 2);
  }

  /**
   * The moves' key chips centred along the bottom (`bottom` the last row's foot): one row, or two halves when one does not fit `width`;
   * shrunk only if a half still does not. Drawn again when a key or word changes (a rebind, the pad, another fight's moves).
   */
  private placeKeys(keys: readonly ArenaHudKey[], bottom: number, width: number): void {
    const signature = `${width}\u0000${keys.map(item => `${item.key}\u0001${item.label}`).join("\u0000")}`;
    if (signature !== this.keysKey) {
      this.keysKey = signature;
      for (const row of this.keyRows) row.destroy();
      this.keyRows = [];
      const items: KeyHintItem[] = keys.map(item => ({ keys: [item.key], label: item.label }));
      const style = { fontFamily: FONT.hudSans, fontSize: TYPE.body, fontStyle: "bold", color: cssHex(PALETTE.white),
        stroke: cssHex(PALETTE.navyInk), strokeThickness: 3 };
      const build = (part: readonly KeyHintItem[]) => this.space.add(keyHintRow(this.scene, part, 0, 0, style).container
        .setDepth(ARENA_DEPTHS.hud).setName("arena-hud-keys"));
      if (items.length > 0) {
        const whole = build(items);
        if (whole.width <= width || items.length < 2) this.keyRows = [whole];
        else {
          whole.destroy();
          const half = Math.ceil(items.length / 2);
          this.keyRows = [build(items.slice(0, half)), build(items.slice(half))];
        }
      }
      for (const row of this.keyRows) row.setScale(Math.min(1, width / Math.max(1, row.width)));
    }
    let y = bottom;
    for (const row of [...this.keyRows].reverse()) {
      const height = row.height * row.scaleY;
      this.space.setLogicalPosition(row, this.space.width / 2, y - height / 2);
      y -= height + KEY_ROW_GAP;
    }
  }
}
