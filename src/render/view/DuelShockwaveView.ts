import Phaser from "phaser";
import { PALETTE } from "../art/palette";

export interface DuelShockwaveDraw {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly ageMs: number;
  readonly ground: boolean;
  readonly seed: number;
}

/** Premultiplied ink + fluorescent pressure bands; transparent centre preserves the actors' contact pose.
 * The narrow front outruns a broken, longer-lived echo. No screen copy, full-screen flash or allocation per hit. */
export const DUEL_SHOCKWAVE_FRAGMENT = `
precision mediump float;
varying vec2 outTexCoord;
uniform float uAge;
uniform float uSeed;
uniform vec3 uInk;
uniform vec3 uYellow;
uniform vec3 uOrange;
uniform vec3 uCore;

float band(float r, float radius, float width) {
  return 1.0 - smoothstep(width, width + 0.012, abs(r - radius));
}
void main() {
  vec2 p = outTexCoord * 2.0 - 1.0;
  float theta = atan(p.y, p.x);
  float r = length(p);
  float t = clamp(uAge / 540.0, 0.0, 1.0);
  float burst = clamp(uAge / 230.0, 0.0, 1.0);
  float expand = 1.0 - pow(1.0 - burst, 2.6);
  float wobble = sin(theta * 7.0 + uSeed) * 0.014 + sin(theta * 13.0 - uSeed) * 0.008;
  float front = 0.12 + expand * 0.72 + wobble * (0.4 + expand);
  float width = mix(0.046, 0.013, burst);
  float fade = (1.0 - smoothstep(0.24, 1.0, burst));
  float breaks = smoothstep(-0.82, -0.42, sin(theta * 5.0 + uSeed + r * 5.0));
  float outline = band(r, front, width + 0.016) * fade * breaks;
  float fill = band(r, front, width) * fade * breaks;
  float core = band(r, front + width * 0.28, width * 0.32) * fade * breaks;

  float echoT = clamp((uAge - 55.0) / 485.0, 0.0, 1.0);
  float echoR = 0.10 + (1.0 - pow(1.0 - echoT, 1.8)) * 0.74 + wobble;
  float echoFade = smoothstep(0.0, 0.06, echoT) * pow(1.0 - echoT, 1.35);
  float echoCut = smoothstep(-0.35, 0.28, sin(theta * 8.0 - uSeed));
  float echo = band(r, echoR, 0.009) * echoFade * echoCut;
  float echoInk = band(r, echoR, 0.020) * echoFade * echoCut;

  // Sparse tapered radial flecks accelerate out, then die well before the echo.
  float spokes = pow(max(0.0, cos(theta * 11.0 + uSeed)), 30.0);
  float fleck = spokes * smoothstep(front + 0.015, front + 0.055, r)
    * (1.0 - smoothstep(front + 0.07, front + 0.17, r)) * fade * 0.8;
  float a = max(max(outline, echoInk * 0.7), fleck);
  // Fade opacity, never the fluorescent pigment toward dark ink.
  float paint = max(fill / max(fade, 0.001), echo / max(echoFade, 0.001));
  vec3 color = mix(uInk, uOrange, paint);
  color = mix(color, uYellow, max(paint * 0.88, fleck / max(fade, 0.001)));
  color = mix(color, uCore, core / max(fade, 0.001) * 0.9);
  a *= 1.0 - smoothstep(0.93, 1.0, r);
  gl_FragColor = vec4(color * a, a);
}`;

const rgb = (color: number) => [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255];
const SIZE = 256;

/** A bounded WebGL-only pool. Existing comic primitives remain the Canvas/reduced-motion fallback. */
export class DuelShockwaveView {
  private readonly pool: Phaser.GameObjects.Shader[] = [];
  private live = 0;
  constructor(scene: Phaser.Scene, private readonly groundDepth: number, private readonly burstDepth: number) {
    if (scene.game?.renderer?.type !== Phaser.WEBGL || !scene.add.shader) return;
    const shader = new Phaser.Display.BaseShader("native-city-blunt-pressure", DUEL_SHOCKWAVE_FRAGMENT, undefined, {
      uAge: { type: "1f", value: 0 }, uSeed: { type: "1f", value: 0 },
      uInk: { type: "3fv", value: rgb(PALETTE.webtoonInk) }, uYellow: { type: "3fv", value: rgb(PALETTE.combatNeonYellow) },
      uOrange: { type: "3fv", value: rgb(PALETTE.combatNeonOrange) }, uCore: { type: "3fv", value: rgb(PALETTE.combatNeonCore) },
    });
    // Allocate before the UI camera takes its ignore snapshot; hidden shaders issue no draw calls.
    for (let i = 0; i < 8; i++) {
      const wave = scene.add.shader(shader, 0, 0, SIZE, SIZE).setVisible(false);
      // Shader.setBlendMode is a Phaser NOOP; select the renderer's normal premultiplied blend directly.
      Object.assign(wave, { blendMode: Phaser.BlendModes.NORMAL });
      this.pool.push(wave);
    }
  }
  draw(commands: readonly DuelShockwaveDraw[]): void {
    if (!this.pool.length) return;
    const active = commands.filter(c => c.ageMs >= 0 && c.ageMs < 540).slice(-this.pool.length);
    this.live = Math.min(active.length, this.pool.length);
    for (let i = 0; i < this.pool.length; i++) {
      const shader = this.pool[i]!, c = active[i];
      shader.setVisible(c !== undefined);
      if (!c) continue;
      shader.setPosition(c.x, c.y).setScale(c.width / SIZE, c.height / SIZE)
        .setDepth(c.ground ? this.groundDepth : this.burstDepth);
      shader.setUniform("uAge.value", c.ageMs).setUniform("uSeed.value", (c.seed % 97) * .37);
    }
  }
  get count(): number { return this.live; }
  destroy(): void { for (const shader of this.pool) shader.destroy(); this.pool.length = 0; this.live = 0; }
}
