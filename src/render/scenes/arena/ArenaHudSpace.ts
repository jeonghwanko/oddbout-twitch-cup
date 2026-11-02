import Phaser from "phaser";
import type { FixedCameraSpace } from "../../FixedCameraSpace";
import type { SceneScope } from "../../lifecycle/SceneScope";
import { cssHudScaleFor, RENDER_SCALE } from "../../RenderScale";
import { ARENA_DEPTHS } from "../../depths";
import { CITY_FIGHT_SUPER_CUT_IN } from "../../view/CityFightSuperCutIn";

export type ArenaScreenSpace = Pick<FixedCameraSpace, "add" | "setLogicalPosition" | "width" | "height">;

/** CSS-sized HUD inside the existing UI camera. Fight cinematics retain their own coordinate space. */
export class ArenaHudSpace implements ArenaScreenSpace {
  private readonly root: Phaser.GameObjects.Container;
  private zoom = 1;
  /** The HUD's alpha through a super's staging (`quiet`). */
  private shown = 1;

  constructor(private readonly scene: Phaser.Scene, scope: SceneScope, private readonly parent: FixedCameraSpace) {
    this.root = parent.add(scene.add.container(0, 0).setDepth(ARENA_DEPTHS.hud).setName("arena-responsive-hud"));
    scope.on(scene.scale, Phaser.Scale.Events.RESIZE, this.sync);
    this.sync();
  }

  get width(): number { return this.parent.width / this.zoom; }
  get height(): number { return this.parent.height / this.zoom; }

  add<T extends Parameters<FixedCameraSpace["add"]>[0]>(object: T): T {
    this.root.add(object);
    object.setScrollFactor(0);
    this.resolveText(object);
    return object;
  }

  /**
   * A super's staging (2026-10-21 — the arena's HP bars, names, seconds and buttons sat on its letterbox, so it did not read; since
   * 2026-10-24 its awakening's staging after the flash too): while `on` the HUD fades out as the letterbox comes in (`bars.inMs`) and back
   * as it goes (`bars.outMs`) — a fighting game's cinematic hides its HUD. Returns the HUD's alpha (the stage bands follow it: the super's
   * letterbox replaces them).
   */
  quiet(on: boolean, dtMs: number): number {
    const bars = CITY_FIGHT_SUPER_CUT_IN.bars, step = Math.max(0, dtMs) / (on ? bars.inMs : bars.outMs);
    this.shown = on ? Math.max(0, this.shown - step) : Math.min(1, this.shown + step);
    this.root.setAlpha(this.shown);
    return this.shown;
  }

  setLogicalPosition<T extends Parameters<FixedCameraSpace["add"]>[0]>(object: T, x: number, y: number): T {
    object.setPosition(x, y);
    return object;
  }

  private readonly sync = (): void => {
    const { width, height } = this.scene.scale.displaySize;
    if (width <= 0 || height <= 0) return;
    this.zoom = this.parent.width * cssHudScaleFor(width, height) / width;
    this.root.setScale(this.zoom);
    this.parent.setLogicalPosition(this.root, 0, 0);
    this.root.each((object: Phaser.GameObjects.GameObject) => this.resolveText(object));
  };

  private resolveText(object: Phaser.GameObjects.GameObject): void {
    if (object instanceof Phaser.GameObjects.Text) object.setResolution(Math.max(RENDER_SCALE, RENDER_SCALE * this.zoom));
  }
}
