import type Phaser from "phaser";
import { PALETTE } from "../../art/palette";
import { ARENA_DEPTHS } from "../../depths";
import type { ArenaRingRopes } from "./ArenaGround";

/**
 * The pinball's ropes (2026-10-26, 사용자: "로프 핀볼 전투 패턴에서 가상의 로프를 이펙트로 그려주면, 로프 핀볼 스킬이 이해가 잘 될 것 같아"): the
 * ring picture paints its ropes along the back only, so the body a pinball throws at a corner bounced off nothing. While a pinball runs, the
 * three ropes from that corner post's pads toward the camera (the ring's side ropes — the near post is off the picture) fade in in the
 * ring's own colours, fading out toward the camera. The body thrown into them bows them out around its middle; let go, they spring back past
 * straight and settle (a damped spring — the twang that throws him back). Screen time, held through the hit stops. Reduced motion: the bow
 * follows the body without swinging past.
 */
export const ARENA_PINBALL_ROPE = Object.freeze({
  /**
   * A rope's width (body heights — as thick as the picture's ropes at the post), its glow's width over it and the glow's alpha, its white
   * core's share of its width. (First take, 2026-10-26: 0.014 read as wires beside the picture's ropes.)
   */
  widthBodies: 0.03, glowScale: 2.4, glowAlpha: 0.28, coreShare: 0.3,
  /**
   * The near ends step into the ring (the side ropes run toward the camera): all three alike, parallel like the picture's ropes. (First take:
   * fanned out from the post, they hung like loose strings.)
   */
  leanBodies: 0.35,
  /** The last share of each rope fades out toward the camera. */
  nearFadeShare: 0.35,
  /**
   * How far a body on the ropes bows them out (body heights), and over what height around its middle (half-width, body heights) — wide
   * enough that the bend shows above and below the body hiding its middle.
   */
  pressBodies: 0.3, spanBodies: 0.85,
  /** The bow's spring (per second²) and damping (per second): let go, it swings a third past straight and settles in about half a second. */
  stiffness: 520, damping: 14,
  /** Fades in as the pinball starts; out `fadeOutMs` once `lingerMs` have passed after it ended (the last throw lands first). */
  fadeInMs: 120, lingerMs: 700, fadeOutMs: 260,
  samples: 24,
  /** The spring's step (ms): a long frame is stepped in pieces. */
  stepMs: 8,
});

/** What the pinball shows the ropes this frame: its corner post on screen (0 the left, 1 the right), the thrown body's middle and whether he is on them. */
export interface ArenaPinballRopeState {
  readonly post: 0 | 1;
  readonly bodyY: number;
  readonly pressed: boolean;
}

export class ArenaPinballRopeView {
  private readonly g: Phaser.GameObjects.Graphics;
  private post: 0 | 1 | null = null;
  private bodyY = 0;
  private alpha = 0;
  /** Screen ms since the pinball ended (null while it runs). */
  private endedMs: number | null = null;
  /** The bow out (px) and its speed (px per second). */
  private bow = 0;
  private speed = 0;

  constructor(scene: Phaser.Scene, private readonly ropes: ArenaRingRopes) {
    this.g = scene.add.graphics().setDepth(ARENA_DEPTHS.pinballRope).setName("arena-pinball-rope");
  }

  get objects(): readonly Phaser.GameObjects.GameObject[] { return [this.g]; }

  /** One frame (`dtMs` screen time, 0 in a hit stop): the pinball's state, null while none runs; `bodyPx` a body's height. */
  update(state: ArenaPinballRopeState | null, bodyPx: number, dtMs: number, reduced: boolean): void {
    const R = ARENA_PINBALL_ROPE, dt = Math.max(0, dtMs);
    if (state) {
      if (state.post !== this.post && this.alpha <= 0) { this.bow = 0; this.speed = 0; }
      this.post = state.post;
      this.bodyY = state.bodyY;
      this.endedMs = null;
      this.alpha = Math.min(1, this.alpha + dt / R.fadeInMs);
    } else if (this.post !== null) {
      this.endedMs = (this.endedMs ?? 0) + dt;
      if (this.endedMs > R.lingerMs) this.alpha = Math.max(0, this.alpha - dt / R.fadeOutMs);
    }
    const target = state?.pressed ? R.pressBodies * bodyPx : 0;
    if (reduced) { this.bow = target; this.speed = 0; }
    else {
      for (let left = dt; left > 0; left -= R.stepMs) {
        const s = Math.min(R.stepMs, left) / 1000;
        this.speed += (R.stiffness * (target - this.bow) - R.damping * this.speed) * s;
        this.bow += this.speed * s;
      }
    }
    this.draw(bodyPx);
  }

  private draw(bodyPx: number): void {
    const g = this.g.clear(), R = ARENA_PINBALL_ROPE, post = this.post;
    if (post === null || this.alpha <= 0) {
      if (this.alpha <= 0) { this.post = null; this.endedMs = null; this.bow = 0; this.speed = 0; }
      return;
    }
    const { faces, pads, depthPx } = this.ropes, inward = post === 0 ? 1 : -1, face = faces[post];
    const width = R.widthBodies * bodyPx, span = R.spanBodies * bodyPx, colors = [PALETTE.arenaRopePink, PALETTE.arenaRopeCyan, PALETTE.arenaRopePink];
    pads.forEach((top, i) => {
      const bottomX = face + inward * R.leanBodies * bodyPx, bottomY = top + depthPx;
      // Bowed out (away from the ring) around the body's middle, the ends held where they are tied.
      const points = Array.from({ length: R.samples + 1 }, (_, k) => {
        const t = k / R.samples, y = top + (bottomY - top) * t, near = (y - this.bodyY) / span;
        const bump = near * near < 1 ? (1 - near * near) ** 2 : 0;
        return { x: face + (bottomX - face) * t - inward * this.bow * bump * Math.sin(Math.PI * t), y, t };
      });
      const color = colors[i % colors.length]!;
      for (let k = 1; k < points.length; k += 1) {
        const a = points[k - 1]!, b = points[k]!, fade = this.alpha * Math.min(1, (1 - a.t) / R.nearFadeShare);
        g.lineStyle(width * R.glowScale, color, R.glowAlpha * fade).lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(width, color, fade).lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(width * R.coreShare, PALETTE.white, 0.85 * fade).lineBetween(a.x, a.y, b.x, b.y);
      }
    });
  }

  destroy(): void { this.g.destroy(); }
}
