import type Phaser from "phaser";
import { applyPlayerTextScale } from "../../accessibility/AccessibilityRuntime";
import { CSS, FONT, PALETTE, TYPE } from "../../art/palette";
import { frameButton, type FrameButtonHandle, type FrameButtonSpec } from "../../ui/FrameButton";
import type { SceneScope } from "../../lifecycle/SceneScope";
import { cssHudScaleFor } from "../../RenderScale";
import { mainCameraAtOriginZoom } from "../../ResponsiveViewport";
import type { ArenaBracketSegment } from "./ArenaLayout";

/** Match the DOM HUD's readable CSS scale; EXPAND/backbuffer size must not shrink menu text and hit targets. */
export function installArenaMenuViewport(scene: Phaser.Scene, scope: SceneScope, layout: (width: number, height: number) => void): void {
  const resize = (): void => {
    const { width: cssWidth, height: cssHeight } = scene.scale.displaySize;
    if (cssWidth <= 0 || cssHeight <= 0) return;
    const scale = cssHudScaleFor(cssWidth, cssHeight), width = cssWidth / scale, height = cssHeight / scale;
    mainCameraAtOriginZoom(scene, scene.scale.gameSize.width / width);
    layout(width, height);
  };
  scope.on(scene.scale, "resize", resize);
  resize();
}

/**
 * White type and its opacity steps over a dark ground: the arena's screens over navy with one brass primary action (shared with the village
 * HUD), the select screen over the ODDBOUT ink with one acid action (`accent`).
 */
export const ARENA_UI = Object.freeze({ rule: 0.16, muted: 0.72, cell: 0.04, selected: 0.09, disabled: 0.36 });
/** A face at rest, picked or in play; its empty cell (the first scene's bracket, strip and pick screen). */
export const ARENA_FACE = Object.freeze({ rest: 0.62, picked: 1, out: 0.3, cell: ARENA_UI.cell });
/** Phaser's own blank texture: a picture before it is painted. */
export const ARENA_BLANK_TEXTURE = "__DEFAULT";

export function fitArenaText(text: Phaser.GameObjects.Text, width: number): void {
  text.setScale(Math.min(1, width / Math.max(1, text.width)));
}

type ArenaButtonSpec = Pick<FrameButtonSpec, "x" | "y" | "width" | "height" | "name" | "labelName" | "label" | "enabled" | "onActivate" | "onRejected" | "keys">
  & {
    readonly primary?: boolean;
    /** The ODDBOUT select screen's one action (2026-10-22): an acid block with ink words instead of brass with navy (implies `primary`). */
    readonly accent?: boolean;
    /** Over the ring's picture (not the navy board): a secondary button is a solid navy block, or it would vanish on the bright floor. */
    readonly onStage?: boolean;
  };

/** A secondary button's navy block over the ring: at rest and under the pointer. */
const STAGE_BUTTON = Object.freeze({ rest: 0.85, hover: 1 });

export function arenaFlatButton(scene: Phaser.Scene, spec: ArenaButtonSpec): FrameButtonHandle {
  const accent = spec.accent === true, primary = accent || spec.primary === true, stage = !primary && spec.onStage === true;
  const rest = primary ? 1 : stage ? STAGE_BUTTON.rest : ARENA_UI.cell;
  const ink = accent ? CSS.oddboutInk : primary ? CSS.navyInk : CSS.white;
  const button = frameButton(scene, {
    ...spec, textureKey: "__WHITE", alpha: rest, disabledAlpha: primary ? ARENA_UI.disabled : rest,
    labelStyle: { fontFamily: FONT.hudSans, fontSize: TYPE.label, fontStyle: primary || stage ? "bold" : "normal", color: ink, align: "center" },
    hover: { color: ink, restColor: ink, hoverAlpha: primary ? 1 : stage ? STAGE_BUTTON.hover : ARENA_UI.selected },
    feedback: { intensity: "subtle", frame: false, burst: false },
  });
  button.frame.setTint(accent ? PALETTE.oddboutAcid : primary ? PALETTE.dialogueGold : stage ? PALETTE.navyInk : PALETTE.white);
  if (button.label) {
    applyPlayerTextScale(scene, button.label);
    fitArenaText(button.label, spec.width - 32);
  }
  // A key chip row (`keys`): the chip and its word shrink together to the button.
  if (button.labelRow) button.labelRow.setScale(Math.min(1, (spec.width - 24) / Math.max(1, button.labelRow.width)));
  // Keep keyboard focus visible even when reduced motion disables the shared hover lift.
  let enabled = spec.enabled ?? true, focused = false;
  const focus = scene.add.rectangle(spec.x, spec.y + spec.height + 4, spec.width, 2, PALETTE.white)
    .setOrigin(0).setVisible(false);
  button.objects.push(focus);
  const setEnabled = (value: boolean): void => {
    enabled = value;
    button.setEnabled(value);
    (button.label ?? button.labelRow)?.setAlpha(value ? 1 : ARENA_UI.disabled);
    focus.setVisible(focused && value);
  };
  setEnabled(enabled);
  return { ...button, setEnabled, feedback: { ...button.feedback, setFocused(value: boolean): void {
    focused = value;
    focus.setVisible(value && enabled);
    button.feedback.setFocused(value);
  } } };
}

/**
 * The bracket's lines (the select screen's and the archive's): white hairlines, the representative's way (`onPath`) in acid, and the `lit`
 * pieces — decided bouts' winners going on (`arenaWinnerSegments`) — in full white.
 */
export function paintArenaBracketLines(graphics: Phaser.GameObjects.Graphics, segments: readonly ArenaBracketSegment[],
  onPath: (segment: ArenaBracketSegment) => boolean, lit: ReadonlySet<ArenaBracketSegment>): void {
  for (const segment of segments) {
    const path = onPath(segment), bright = path || lit.has(segment);
    graphics.lineStyle(bright ? 2 : 1, path ? PALETTE.oddboutAcid : PALETTE.white, bright ? 1 : ARENA_UI.rule * 2)
      .lineBetween(segment.x1, segment.y1, segment.x2, segment.y2);
  }
}
