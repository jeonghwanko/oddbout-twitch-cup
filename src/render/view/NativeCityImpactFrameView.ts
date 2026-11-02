import type Phaser from "phaser";
import { combatImpactFrameActorTint, combatImpactFramePhase, combatImpactFramePrims } from "../effects/CombatImpactFrame";
import { NATIVE_CITY_IMPACT_FRAME_TONE as TONE, nativeCityImpactFrameAge, nativeCityImpactFrameAllowed, type NativeCityImpactFrameKind } from "../effects/NativeCityImpactFrame";
import { RopeFxPhaserRenderer } from "../effects/RopeFxPhaserRenderer";
import { COMBAT_FOCUS_LINES, combatFocusLinePrims, type CombatFocusLinesWeight } from "../effects/CombatFocusLines";
import { ROPE_FX_INK } from "../effects/RopeTraversalFx";
import { VILLAGE_DEPTHS } from "../depths";
import { PALETTE } from "../art/palette";
import { cityFightLightTexture } from "./CityFightLightKit";

export type { NativeCityImpactFrameKind } from "../effects/NativeCityImpactFrame";

/** Over the whole world (and its foreground), under the comic letters (`SfxLetterView`) and the name plates. */
const PLATE_DEPTH = VILLAGE_DEPTHS.ambientFx + 1;
const SILHOUETTE_DEPTH = VILLAGE_DEPTHS.ambientFx + 1.5;
const BAND_DEPTH = VILLAGE_DEPTHS.ambientFx + 2;
/** The arena's light at the blow (over the plate) and the silhouettes' rims (just under them). */
const GLOW_DEPTH = PLATE_DEPTH + 0.1;
const RIM_DEPTH = SILHOUETTE_DEPTH - 0.1;
/** The rims' four copies, one per direction. */
const RIM_DIRECTIONS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * The plate's two fighters told apart (2026-10-23 arena audit — b09 #1903, b01 #2274: both neon yellow, one blob; the dark plate swallowed
 * dark clothes): the striker a dark silhouette with a light rim, the struck the gold one with a dark rim (`rimPx` CSS px), and the blow's
 * point lit by a soft glow `bodies` of the struck's height across under them.
 */
export interface NativeCityImpactFrameCorners {
  readonly strikerTint: number;
  readonly struckTint: number;
  readonly strikerRim: number;
  readonly struckRim: number;
  readonly rimPx: number;
  readonly glow: { readonly tint: number; readonly alpha: number; readonly bodies: number };
}

/** The arena's AI duel's corners on the plate (`NativeCityFightSinksSpec.arena`). */
export const ARENA_IMPACT_FRAME_CORNERS: NativeCityImpactFrameCorners = Object.freeze({
  strikerTint: PALETTE.navyInk, struckTint: PALETTE.combatNeonYellow, strikerRim: PALETTE.fxWarmCream, struckRim: PALETTE.navyInk, rimPx: 2,
  glow: Object.freeze({ tint: PALETTE.fxWarmAmber, alpha: 0.55, bodies: 2.4 }),
});

/** What the city lends the frame. Getters: this frame's camera, line width and fighters. */
export interface NativeCityImpactFrameHost {
  /** The world camera (its `worldView` is what the plate covers). */
  readonly camera: () => Phaser.Cameras.Scene2D.Camera;
  /** World px per screen (logical) px. */
  readonly linePx: () => number;

  readonly actors: () => readonly (Phaser.GameObjects.Image | null | undefined)[];
  /** The two silhouettes told apart and the blow's point lit (the arena's AI duel); absent: both the tone's one colour. */
  readonly corners?: NativeCityImpactFrameCorners;
}

/**
 * 도시 대결의 예고장 임팩트 프레임(저택 `CombatImpactFrame` 도형 그대로): 결판성 한 방(반격 첫 방·균형 붕괴·넉다운 = 짧게, KO = 온전히)에
 * 종이 판이 화면을 덮고 두 배우가 잉크 실루엣으로 서며 접점에 열쇠구멍이 뚫리고, 색이 돌아오는 첫 프레임에 섬광띠가 한 번
 * 긋는다. 시계는 화면 시간(히트스톱 안에서 끝난다). 실루엣·판 객체는 미리 만든다 — 월드 카메라 전용(씬이 UI 카메라보다 먼저
 * 만든다). 3D 카드 모드에서도 판·실루엣은 Phaser 층이라 카드 위에 그려진다.
 */
export class NativeCityImpactFrameView {
  private readonly plate: RopeFxPhaserRenderer;
  private readonly front: RopeFxPhaserRenderer;
  private readonly silhouettes: Phaser.GameObjects.Image[] = [];
  private active: { readonly kind: NativeCityImpactFrameKind; readonly at: readonly [number, number]; readonly facing: -1 | 1;
    readonly seed: number; readonly victim?: Phaser.GameObjects.Image | null; readonly bodyPx: number; readonly struck?: number;
    ageMs: number } | null = null;
  /** The corners' rims (four copies a silhouette) and the light at the blow (`NativeCityImpactFrameHost.corners`); empty without. */
  private readonly rims: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Image | null = null;
  private clockMs = 0;
  private lastMs: Record<NativeCityImpactFrameKind, number> = { short: Number.NEGATIVE_INFINITY, full: Number.NEGATIVE_INFINITY };
  private serial = 0;
  /** The edge focus lines (`CombatFocusLines`): the opening counter's, or the KO's after its band. Screen ms. */
  private focusLines: { readonly at: readonly [number, number]; readonly bodyPx: number; readonly weight: CombatFocusLinesWeight;
    readonly seed: number; ageMs: number } | null = null;
  private readonly lines: RopeFxPhaserRenderer;

  constructor(scene: Phaser.Scene, private readonly host: NativeCityImpactFrameHost) {
    this.plate = new RopeFxPhaserRenderer(scene, PLATE_DEPTH, PLATE_DEPTH, "native-city-impact-plate", PLATE_DEPTH, 1);
    this.front = new RopeFxPhaserRenderer(scene, BAND_DEPTH, BAND_DEPTH, "native-city-impact-band", BAND_DEPTH, 1);
    this.lines = new RopeFxPhaserRenderer(scene, PLATE_DEPTH, PLATE_DEPTH, "native-city-focus-lines", PLATE_DEPTH, 1);
    for (let i = 0; i < 2; i++) {
      this.silhouettes.push(scene.add.image(0, 0, "__DEFAULT").setDepth(SILHOUETTE_DEPTH).setVisible(false).setName("native-city-impact-silhouette"));
    }
    if (host.corners) {
      for (let i = 0; i < 2 * RIM_DIRECTIONS.length; i++) {
        this.rims.push(scene.add.image(0, 0, "__DEFAULT").setDepth(RIM_DEPTH).setVisible(false).setName("native-city-impact-rim"));
      }
      this.glow = scene.add.image(0, 0, cityFightLightTexture(scene, "puff")).setDepth(GLOW_DEPTH).setBlendMode("ADD").setVisible(false)
        .setName("native-city-impact-glow");
    }
  }

  /** The plate covers the screen now (the damage numbers wait for it to lift — `NativeCityFloatTextView`). */
  get plateShowing(): boolean { return this.active !== null; }


  trigger(at: readonly [number, number], facing: -1 | 1, kind: NativeCityImpactFrameKind, reducedMotion: boolean,
    victim?: Phaser.GameObjects.Image | null, bodyPx = 0, struck?: number): boolean {
    if (!nativeCityImpactFrameAllowed(kind, this.clockMs - this.lastMs[kind], reducedMotion)) return false;
    // A full frame also resets the short one's clock (one plate per cooldown either way).
    this.lastMs[kind] = this.clockMs;
    if (kind === "full") this.lastMs.short = this.clockMs;
    this.active = { kind, at, facing, seed: (this.serial += 1) * 7919, ageMs: 0, bodyPx, ...(victim !== undefined ? { victim } : {}),
      ...(struck !== undefined ? { struck } : {}) };
    return true;
  }

  /**
   * The edge focus lines at `at` (world px of the contact) around a body `bodyPx` tall: ink wedges from the screen edge with the middle
   * left empty, `COMBAT_FOCUS_LINES.holdMs`, then cut. None under reduced motion. A KO's full frame throws its own after the band.
   */
  focus(at: readonly [number, number], bodyPx: number, weight: CombatFocusLinesWeight, reducedMotion: boolean): void {
    if (reducedMotion) return;
    this.focusLines = { at, bodyPx, weight, seed: (this.serial += 1) * 4241, ageMs: 0 };
  }

  /** One frame of screen time: the plate, the actors' silhouettes on it, the band, the focus lines. */
  update(dtMs: number): void {
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    this.clockMs += dt;
    this.drawFocusLines(dt);
    const frame = this.active;
    if (frame) frame.ageMs += dt;
    const age = frame ? nativeCityImpactFrameAge(frame.kind, frame.ageMs) : null;
    if (!frame || age === null) {
      // The KO's plate gives way to its focus lines (after the band — one punctuation at a time).
      if (frame?.kind === "full" && frame.bodyPx > 0) this.focus(frame.at, frame.bodyPx, "ko", false);
      this.active = null;
      this.plate.draw([], 0); this.front.draw([], 0);
      for (const image of [...this.silhouettes, ...this.rims]) image.setVisible(false);
      this.glow?.setVisible(false);
      return;
    }
    const camera = this.host.camera(), view = camera.worldView;
    const prims = combatImpactFramePrims(age, { at: { x: frame.at[0], y: frame.at[1] }, facing: frame.facing },
      { x: view.x, y: view.y, width: view.width, height: view.height }, frame.seed, this.host.linePx(), TONE);
    this.plate.draw(prims.plate, prims.plate.length);
    this.front.draw(prims.front, prims.front.length);
    // The fighters stand on the plate as flat silhouettes (paper: ink; the inversion: warm gold); colour returns with the band.
    const tint = combatImpactFrameActorTint(combatImpactFramePhase(age), TONE);
    const actors = frame.victim !== undefined ? [this.host.actors()[0], frame.victim] : this.host.actors();
    // The arena's corners: who struck and who was struck, each its own colour and rim (the struck is known from `trigger`).
    const corners = tint !== null && frame.struck !== undefined ? this.host.corners ?? null : null, rimPx = (corners?.rimPx ?? 0) * this.host.linePx();
    this.silhouettes.forEach((image, i) => {
      const actor = actors[i];
      for (let d = 0; d < RIM_DIRECTIONS.length; d++) this.rims[i * RIM_DIRECTIONS.length + d]?.setVisible(false);
      if (tint === null || !actor || !actor.visible || !actor.texture) { image.setVisible(false); return; }
      const struck = corners !== null && i === frame.struck;
      const own = corners ? struck ? corners.struckTint : corners.strikerTint : tint;
      const pose = (piece: Phaser.GameObjects.Image, dx: number, dy: number) => piece.setTexture(actor.texture.key, actor.frame.name)
        .setOrigin(actor.originX, actor.originY).setFlipX(actor.flipX).setScale(actor.scaleX, actor.scaleY).setAngle(actor.angle)
        .setPosition(actor.x + dx, actor.y + dy);
      pose(image, 0, 0).setTintFill(own).setVisible(true);
      if (corners) RIM_DIRECTIONS.forEach(([dx, dy], d) => {
        const rim = this.rims[i * RIM_DIRECTIONS.length + d];
        if (rim) pose(rim, dx * rimPx, dy * rimPx).setTintFill(struck ? corners.struckRim : corners.strikerRim).setVisible(true);
      });
    });
    // The blow's point lit under them, so the dark striker reads against it.
    if (this.glow) {
      const size = corners ? frame.bodyPx * corners.glow.bodies : 0;
      this.glow.setVisible(corners !== null && size > 0);
      if (corners && size > 0) this.glow.setPosition(frame.at[0], frame.at[1]).setDisplaySize(size, size).setTint(corners.glow.tint).setAlpha(corners.glow.alpha);
    }
  }

  private drawFocusLines(dt: number): void {
    const lines = this.focusLines;
    if (lines) lines.ageMs += dt;
    if (!lines || lines.ageMs >= COMBAT_FOCUS_LINES.holdMs) { this.focusLines = null; this.lines.draw([], 0); return; }
    const view = this.host.camera().worldView;
    const prims = combatFocusLinePrims(lines.ageMs, { x: lines.at[0], y: lines.at[1] }, lines.bodyPx,
      { x: view.x, y: view.y, width: view.width, height: view.height }, lines.seed, lines.weight, ROPE_FX_INK, this.host.linePx());
    this.lines.draw(prims, prims.length);
  }

  destroy(): void {
    this.lines.destroy();
    this.plate.destroy();
    this.front.destroy();
    for (const image of [...this.silhouettes, ...this.rims]) image.destroy();
    this.glow?.destroy();
  }
}
