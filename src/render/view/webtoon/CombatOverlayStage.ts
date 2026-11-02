import type Phaser from "phaser";
import type { FixedCameraSpace } from "../../FixedCameraSpace";
import { fightFrameScale, type FightOverlayTuning } from "../../effects/webtoon/CombatOverlayTuning";

type StageObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.ScrollFactor
  & Phaser.GameObjects.Components.Depth;

/**
 * Where a fight overlay draws: the scene's UI camera through its `FixedCameraSpace` (fixed on screen, ignored by the world
 * camera, HiDPI offset kept), stacked from `depth` up. The comic itself is laid out in the 1280×720 design frame and fitted
 * (contain) into the visible view each frame; full-bleed layers (scrims, the paper page, flashes, the input blocker) cover the
 * whole view. Owns everything it creates — `destroy` removes it all (masks included).
 */
export class CombatOverlayStage {
  private readonly owned: Phaser.GameObjects.GameObject[] = [];

  constructor(readonly scene: Phaser.Scene, private readonly space: FixedCameraSpace, readonly depth: number,
    readonly tuning: FightOverlayTuning) {}

  /** Visible view (UI logical px). */
  get width(): number { return this.space.width; }
  get height(): number { return this.space.height; }
  /** Design frame → view scale (contain). */
  get frameScale(): number { return fightFrameScale(this.width, this.height, this.tuning.frame); }

  /** A top-level object on the UI camera at `depth + layer`. */
  top<T extends StageObject>(object: T, layer: number): T {
    this.space.add(object);
    object.setDepth(this.depth + layer);
    this.owned.push(object);
    return object;
  }

  /** Something this overlay owns but that is not on the display list (a mask shape). */
  own<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.owned.push(object);
    return object;
  }

  /** Moves a top-level object to a view position (keeps the space's HiDPI offset). */
  place<T extends StageObject>(object: T, x: number, y: number): T {
    return this.space.setLogicalPosition(object, x, y);
  }

  /** Raw position of a view point for objects that are not registered (mask shapes follow their content this way). */
  rawX(x: number): number { return this.space.x(x); }
  rawY(y: number): number { return this.space.y(y); }

  /** A design-frame point → view point (the comic's centre is the view's centre). */
  viewPoint(designX: number, designY: number): { readonly x: number; readonly y: number } {
    const k = this.frameScale;
    return { x: this.width / 2 + (designX - this.tuning.frame.w / 2) * k, y: this.height / 2 + (designY - this.tuning.frame.h / 2) * k };
  }

  destroy(): void {
    for (const object of this.owned.splice(0)) object.destroy();
  }
}
