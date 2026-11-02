import { PALETTE } from "../art/palette";


export const DECISIVE_FRAME_GLSL = /* glsl */ `
uniform float uMode;
uniform float uNightTime;
uniform vec4 uNightGrid;
uniform vec3 uNightDeep;
uniform vec3 uNightHigh;
uniform vec3 uNightCloud;
uniform vec3 uNightStar;
uniform float uPitch;
uniform float uSteps;
uniform float uSolid;
uniform float uBlur;
uniform vec2 uCenter;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uSilhouette;
uniform vec3 uSilInk;
float decisiveLuma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float nightHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nightNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nightHash(i), nightHash(i + vec2(1.0, 0.0)), f.x), mix(nightHash(i + vec2(0.0, 1.0)), nightHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float nightBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float nightBayer4(vec2 a) { return nightBayer2(0.5 * a) * 0.25 + nightBayer2(a); }
// The night: uNightGrid = (dither dot px, cloud block px, star cell px, cloud drift px per second), all device px.
vec3 decisiveNight(sampler2D tex, vec2 uv, vec2 fragCoord) {
  float l = decisiveLuma(texture2D(tex, uv).rgb);
  vec3 col = mix(uNightDeep, uNightHigh, smoothstep(0.08, 0.95, l) * 0.6);
  // The clouds: a slow noise sampled once per block (blocky like the reference's dither patches), stepped to 4 densities, dithered.
  vec2 drift = vec2(uNightTime * uNightGrid.w, uNightTime * uNightGrid.w * 0.18);
  vec2 block = floor((fragCoord + drift) / uNightGrid.y);
  float cloud = nightNoise(block * 0.22) * 0.7 + nightNoise(block * 0.61 + 7.3) * 0.3;
  float density = floor(clamp((cloud - 0.42) * 2.6, 0.0, 1.0) * 4.0) / 4.0;
  float speck = step(nightBayer4((fragCoord + drift) / uNightGrid.x), density - 0.01);
  col = mix(col, uNightCloud, speck * 0.42);
  // The stars: one per cell at a hashed spot, a plus of two short bars, twinkling.
  vec2 cell = floor(fragCoord / uNightGrid.z);
  float h = nightHash(cell);
  if (h > 0.62) {
    vec2 spot = (cell + 0.2 + 0.6 * vec2(nightHash(cell + 3.1), nightHash(cell + 5.7))) * uNightGrid.z;
    vec2 d = abs(fragCoord - spot);
    float arm = uNightGrid.x * (h > 0.9 ? 1.6 : 0.9), thin = uNightGrid.x * 0.34;
    float plus = max(step(d.x, thin) * step(d.y, arm), step(d.y, thin) * step(d.x, arm));
    float twinkle = 0.45 + 0.55 * sin(uNightTime * (3.0 + 5.0 * h) + h * 40.0);
    col = mix(col, uNightStar, plus * clamp(twinkle, 0.0, 1.0));
  }
  return col;
}
vec3 decisiveFrame(sampler2D tex, vec2 uv, vec2 fragCoord) {
  if (uMode > 3.5) return decisiveNight(tex, uv, fragCoord);
  if (uMode > 2.5) {
    float l = decisiveLuma(texture2D(tex, uv).rgb);
    return mix(uSilInk, uPaper, smoothstep(uSilhouette.x, uSilhouette.y, l) * uSilhouette.z);
  }
  if (uMode > 1.5) {
    vec2 d = uv - uCenter;
    vec3 town = vec3(0.0);
    for (int i = 0; i < 8; i++) town += texture2D(tex, uCenter + d * (1.0 - uBlur * float(i) / 7.0)).rgb;
    float l = decisiveLuma(town / 8.0);
    vec2 p = fragCoord / uPitch;
    p = vec2(p.x + p.y, p.y - p.x) * 0.70710678;
    float r = sqrt(clamp(1.0 - l, 0.0, 1.0)) * 0.72;
    float dist = length(fract(p) - 0.5);
    float ink = 1.0 - smoothstep(r - 0.08, r + 0.08, dist);
    ink = max(ink, 1.0 - smoothstep(uSolid - 0.03, uSolid + 0.03, l));
    return mix(uPaper, uInk, ink);
  }
  float n = 1.0 - decisiveLuma(texture2D(tex, uv).rgb);
  float q = floor(n * uSteps + 0.5) / uSteps;
  return mix(uInk, uPaper, q);
}
`;

/** `uMode` of each shader. */
export const DECISIVE_FRAME_MODE = Object.freeze({ negative: 1, screentone: 2, silhouette: 3, night: 4 } as const);

/**
 * The night's grid (logical px; the pass multiplies by the pixel ratio): the dither dot, the cloud block it steps in, the star cell (one
 * star at most each), the clouds' drift per second.
 */
export const DECISIVE_FRAME_NIGHT = Object.freeze({ ditherPx: 3, blockPx: 26, starCellPx: 46, driftPxPerSec: 22 });

/** The night's colours (`uNightDeep` / `High` / `Cloud` / `Star`): the deep sky, the moonlit highs, the clouds' dither, the stars. */
export const DECISIVE_FRAME_NIGHT_COLORS = Object.freeze({
  deep: PALETTE.villageMoonFill, high: PALETTE.villageMoonlight, cloud: PALETTE.villageMoonShade, star: PALETTE.titleMoonMote,
});

/** A palette colour as the sRGB triple the shader writes as-is (the drawn frame is read and written in sRGB, no colour management). */
export function decisiveFrameSrgb(hex: number): readonly [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}
