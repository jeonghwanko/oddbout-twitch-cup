import Phaser from "phaser";
import { NATIVE_CITY_COMBAT, type NativeCityBackdropShader } from "../../sim/cityFight/NativeCityCombatTuning";
import { PALETTE } from "../art/palette";
import { DECISIVE_FRAME_GLSL, DECISIVE_FRAME_MODE, DECISIVE_FRAME_NIGHT, DECISIVE_FRAME_NIGHT_COLORS, decisiveFrameSrgb } from "./DecisiveFrameGlsl";

/*
 * 결정타 프레임 셰이더(`DecisiveFrameGlsl`)의 Phaser 후처리판(2026-10-23 저택에서 떼어 냄). 저택은 메인 카메라에(`HeistDecisiveFrame`),
 * 무투장은 배경 층에만(`ArenaGround` — 링 그림과 밤하늘, 각성기의 별밤) 건다. 마을은 three 패스(`NativeCityDecisiveFramePass`)가 같은 셰이더를
 * 쓴다. 수치는 한 원본이다(`feel.screenGrade.backdrop`, 별밤 격자 `DECISIVE_FRAME_NIGHT`·색 `DECISIVE_FRAME_NIGHT_COLORS`).
 */

/** The pipeline's key in the renderer's post pipelines. */
export const DECISIVE_FRAME_POST_KEY = "DecisiveFrame";

const FRAGMENT = /* glsl */ `
#define SHADER_NAME DECISIVE_FRAME_POST_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uAlpha;
varying vec2 outTexCoord;
${DECISIVE_FRAME_GLSL}
void main() {
  vec4 base = texture2D(uMainSampler, outTexCoord);
  gl_FragColor = vec4(mix(base.rgb, decisiveFrame(uMainSampler, outTexCoord, gl_FragCoord.xy), uAlpha), base.a);
}`;

/** The post pipeline's live settings (its owner writes them; `onPreRender` hands them to the shader). */
export interface DecisiveFramePostPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  mode: NativeCityBackdropShader;
  alpha: number;
  /** The screentone's blur centre (uv 0..1, y up). */
  center: readonly [number, number];
  /** Device px per game px (the screentone's pitch and the night's grid are in game px). */
  pitchScale: number;
  /** The night's clock (ms — its clouds drift and its stars twinkle). */
  nightMs: number;
  /** The night's own colours (deep, high, cloud, star — an awakening's sky), else the starry night's. */
  sky: readonly [number, number, number, number] | null;
}

/** The pipeline class, made on first use — a module import must not need Phaser's WebGL classes (the effect tests mock Phaser). */
let pipelineClass: (new (game: Phaser.Game) => DecisiveFramePostPipeline) | null = null;
function decisiveFramePostPipelineClass(): new (game: Phaser.Game) => DecisiveFramePostPipeline {
  pipelineClass ??= class extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline implements DecisiveFramePostPipeline {
    mode: NativeCityBackdropShader = "negative";
    alpha = 0;
    center: readonly [number, number] = [0.5, 0.5];
    pitchScale = 1;
    nightMs = 0;
    sky: readonly [number, number, number, number] | null = null;
    constructor(game: Phaser.Game) {
      super({ game, name: DECISIVE_FRAME_POST_KEY, fragShader: FRAGMENT });
    }
    override onPreRender(): void {
      const b = NATIVE_CITY_COMBAT.feel.screenGrade.backdrop, n = DECISIVE_FRAME_NIGHT, k = this.pitchScale;
      const night = this.sky ? { deep: this.sky[0], high: this.sky[1], cloud: this.sky[2], star: this.sky[3] } : DECISIVE_FRAME_NIGHT_COLORS;
      this.set1f("uMode", DECISIVE_FRAME_MODE[this.mode]);
      this.set1f("uAlpha", this.alpha);
      this.set1f("uPitch", b.screentone.pitchPx * k);
      this.set1f("uSteps", Math.max(1, b.negative.steps));
      this.set1f("uSolid", b.screentone.solidBelow);
      this.set1f("uBlur", b.screentone.zoomBlur);
      this.set2f("uCenter", this.center[0], this.center[1]);
      this.set3f("uInk", ...decisiveFrameSrgb(PALETTE.webtoonInk));
      this.set3f("uPaper", ...decisiveFrameSrgb(PALETTE.paper));
      this.set3f("uSilhouette", b.silhouette.from, b.silhouette.to, b.silhouette.lift);
      this.set3f("uSilInk", ...decisiveFrameSrgb(PALETTE.navyInk));
      this.set1f("uNightTime", this.nightMs / 1000);
      this.set4f("uNightGrid", n.ditherPx * k, n.blockPx * k, n.starCellPx * k, n.driftPxPerSec * k);
      this.set3f("uNightDeep", ...decisiveFrameSrgb(night.deep));
      this.set3f("uNightHigh", ...decisiveFrameSrgb(night.high));
      this.set3f("uNightCloud", ...decisiveFrameSrgb(night.cloud));
      this.set3f("uNightStar", ...decisiveFrameSrgb(night.star));
    }
  };
  return pipelineClass;
}

/** The WebGL renderer with the pipeline registered (once per game), or null (Canvas: the caller keeps its ink sheet). */
export function decisiveFramePostRenderer(scene: Phaser.Scene): Phaser.Renderer.WebGL.WebGLRenderer | null {
  const renderer = scene.game.renderer;
  if (renderer.type !== Phaser.WEBGL) return null;
  const webgl = renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!webgl.pipelines.postPipelineClasses.has(DECISIVE_FRAME_POST_KEY)) {
    webgl.pipelines.addPostPipeline(DECISIVE_FRAME_POST_KEY, decisiveFramePostPipelineClass());
  }
  return webgl;
}

/**
 * The pipeline on `target` (a camera or a game object), attached once and compiled now, off — Phaser's `setPostPipeline` builds a new
 * instance (compiling its shader on first render) and `removePostPipeline` destroys it, so a per-blow attach compiled a GL program on the
 * freeze frame (2026-10-18 audit). Switch it with `active`. Null when it could not be attached.
 */
export function attachDecisiveFramePost(target: { setPostPipeline(key: string): unknown; getPostPipeline(key: string): unknown }):
  DecisiveFramePostPipeline | null {
  target.setPostPipeline(DECISIVE_FRAME_POST_KEY);
  const found = target.getPostPipeline(DECISIVE_FRAME_POST_KEY);
  const pipeline = (Array.isArray(found) ? found[found.length - 1] : found) as DecisiveFramePostPipeline | undefined;
  if (!pipeline) return null;
  pipeline.active = false;
  if (!pipeline.hasBooted) pipeline.bootFX();
  return pipeline;
}
