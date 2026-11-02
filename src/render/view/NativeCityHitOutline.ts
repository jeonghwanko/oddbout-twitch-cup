import type Phaser from "phaser";
import { NATIVE_CITY_COMBAT } from "../../sim/cityFight/NativeCityCombatTuning";
import { PALETTE } from "../art/palette";
import { villageActorFxDepth } from "../depths";

/** The four copies sit this far out round the body, one per direction. */
const DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Their 3D card anchor sits this many world px behind the body's feet, so the card view sorts them behind its card. */
const BEHIND_PX = 3;

/** `copies` round `pose`, `r` world px out, flat `color`, at the actor fx depth `step` and the card anchor `behind` px back. */
function place(copies: readonly Phaser.GameObjects.Sprite[], pose: NativeCityOutlinePose, color: number, r: number, step: -1 | -2,
  behind: number): void {
  const depth = villageActorFxDepth(pose.depth, step);
  copies.forEach((copy, i) => {
    const [dx, dy] = DIRECTIONS[i]!, ox = dx * r, oy = dy * r;
    copy.setTexture(pose.texture, pose.frame).setOrigin(pose.originX, pose.originY).setFlipX(pose.flipX)
      .setScale(pose.scaleX, pose.scaleY).setAngle(pose.angle).setPosition(pose.x + ox, pose.y + oy).setDepth(depth)
      .setTintFill(color);
    if (pose.alpha !== undefined) copy.setAlpha(pose.alpha);
    copy.setVisible(true).setData("spatialAnchor", { x: pose.feetX + ox, y: pose.feetY - behind });
  });
}

/** One drawn state of a body the copies trace (its cell and rig, world px), and its feet: the 3D card anchor a hop leaves on the ground. */
export interface NativeCityOutlinePose {
  readonly texture: string; readonly frame: string | number; readonly flipX: boolean;
  readonly originX: number; readonly originY: number; readonly scaleX: number; readonly scaleY: number; readonly angle: number;
  readonly x: number; readonly y: number; readonly depth: number;
  readonly feetX: number; readonly feetY: number;
  /** The body's alpha, copied onto the copies; absent: they keep their own. */
  readonly alpha?: number;
}

/**
 * 몸 둘레의 평평한 테 하나(2026-10-18 — 맞은 몸의 먹 외곽선과 쿠마의 갑옷·빈틈 테가 따로 그리던 것을 하나로): 지금 프레임을 그대로 뜬
 * 네 장을 상하좌우로 밀어 한 색으로 채우고 몸 바로 뒤에 둔다(3D 카드 모드에서는 그 카드 바로 뒤 카드). 슬롯은 미리 만든다 — 월드 카메라 전용.
 *
 * `draw`: 맞은 몸의 채움 섬광 동안(1–2 프레임) 그 실루엣 둘레의 먹 외곽선(`feel.impact.flash.outlinePx` 화면 px). 밝은 광장 바닥(휘도 ~221)
 * 위에서 금빛·상아로 채워진 몸이 바닥에 녹아 사라지지 않게 한다. `drawPose`: 색과 폭은 부르는 쪽이 정한다(쿠마의 `feel.tells` 갑옷·빈틈
 * 테 — `NativeCityKumaView` 의 `drawRims`).
 */
export class NativeCityHitOutline {
  private readonly copies: Phaser.GameObjects.Sprite[] = [];
  /** The ink ring round the coloured one (`inked`): four more copies a step further out and further back. */
  private readonly inkCopies: Phaser.GameObjects.Sprite[] = [];

  /**
   * `inked`: the coloured ring can carry an ink line round it (`drawPose`'s `ink`) — the village HUD's own grammar (a colour with a navy
   * 1 px line round it, 2026-10-18); without it a mid colour sank into the pale paving (2026-10-19 user: 갑옷 외곽선이 잘 안 보인다).
   */
  constructor(scene: Phaser.Scene, name: string, inked = false) {
    for (let i = 0; i < DIRECTIONS.length; i++) this.copies.push(scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName(name));
    if (inked) for (let i = 0; i < DIRECTIONS.length; i++) {
      this.inkCopies.push(scene.add.sprite(0, 0, "__DEFAULT").setVisible(false).setName(`${name}-ink`));
    }
  }

  /** Bodies for the 3D card view (cards just behind the struck body's), plain sprites otherwise. */
  get objects(): readonly Phaser.GameObjects.Sprite[] { return [...this.inkCopies, ...this.copies]; }

  /**
   * Outlines `body` this frame when `on` (its fill flash shows), `worldPxPerScreenPx` world px per screen px; otherwise hides. Call
   * after the body's pose for the frame is final (position, scale, angle, hop).
   */
  draw(body: Phaser.GameObjects.Sprite | null | undefined, on: boolean, worldPxPerScreenPx: number): void {
    const px = NATIVE_CITY_COMBAT.feel.impact.flash.outlinePx;
    if (!on || !body || !body.visible || !body.texture || !(px > 0)) { this.hide(); return; }
    const world = Number.isFinite(worldPxPerScreenPx) && worldPxPerScreenPx > 0 ? worldPxPerScreenPx : 1;
    // A hop lifts the body off its feet (`spatialAnchor`): the copies keep the same feet.
    const anchor = body.getData("spatialAnchor") as { readonly x: number; readonly y: number } | undefined;
    this.drawPose({ texture: body.texture.key, frame: body.frame.name, flipX: body.flipX, originX: body.originX, originY: body.originY,
      scaleX: body.scaleX, scaleY: body.scaleY, angle: body.angle, x: body.x, y: body.y, depth: body.depth,
      feetX: anchor?.x ?? body.x, feetY: anchor?.y ?? body.y, alpha: body.alpha }, PALETTE.webtoonInk, px * world);
  }

  /**
   * The four copies of `pose`, `radiusWorldPx` out round it, flat-filled `color`, just behind it; with `ink` (an `inked` outline) four
   * more `ink.widthWorldPx` further out, flat `ink.color`, one step further back — the line that keeps the ring off the floor.
   */
  drawPose(pose: NativeCityOutlinePose, color: number, radiusWorldPx: number,
    ink?: { readonly color: number; readonly widthWorldPx: number }): void {
    place(this.copies, pose, color, radiusWorldPx, -1, BEHIND_PX);
    if (ink && ink.widthWorldPx > 0 && this.inkCopies.length > 0) {
      place(this.inkCopies, pose, ink.color, radiusWorldPx + ink.widthWorldPx, -2, BEHIND_PX + 1);
    } else for (const copy of this.inkCopies) if (copy.visible) copy.setVisible(false);
  }

  hide(): void {
    for (const copy of [...this.copies, ...this.inkCopies]) if (copy.visible) copy.setVisible(false);
  }

  destroy(): void {
    for (const copy of [...this.copies, ...this.inkCopies]) copy.destroy();
    this.copies.length = 0;
    this.inkCopies.length = 0;
  }
}
