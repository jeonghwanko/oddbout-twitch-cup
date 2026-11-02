import Phaser from "phaser";
import { CSS, PALETTE } from "./palette";
import type { ObjectiveGroundLayer } from "../effects/ObjectiveGroundFx";

/**
 * 전용 파일이 필요 없는 보조 텍스처만 Graphics로 생성한다.
 * 환경·상호작용 오브젝트와 캐릭터는 `public/art/`의 WebP를 사용한다.
 */

export const TEX = {
  bubble: "tex-bubble",
  lampGlow: "tex-lamp-glow",
  titleCardScrim: "tex-title-card-scrim",
  ropeFxLight: "tex-rope-fx-light",
  stageVignette: "tex-stage-vignette",
  stageBacklight: "tex-stage-backlight",
  verticalFalloff: "tex-vertical-falloff",
  flatGoldFill: "tex-flat-gold-fill",
} as const;

/** 감쇠 텍스처의 중심 → 가장자리 알파 정거장. `[비율, 알파]`. */
type RadialStops = readonly (readonly [number, number])[];

/** 등불: 중심이 세고 빠르게 죽는다. 빛은 퍼지는 것이 아니라 한 점에서 새어 나온다. */
const LAMP_GLOW_STOPS: RadialStops = Object.freeze([
  [0, 0.95], [0.12, 0.68], [0.38, 0.24], [0.72, 0.055], [1, 0],
] as const);

/**
 * 도착 표제 뒤의 가독성 그늘: 가운데가 넓고 평평하다.
 *
 * 등불 감쇠를 그대로 쓰면 글줄의 절반이 이미 투명해져 남색 문짝 위에서 다시 묻힌다.
 * 글자를 덮는 구간은 거의 일정한 농도로 두고, 마지막 1/4 에서만 완전히 사라지게 한다 —
 * 그래야 원화 위에 네모난 판이 아니라 그늘 한 겹으로 읽힌다.
 */
const TITLE_CARD_SCRIM_STOPS: RadialStops = Object.freeze([
  [0, 1], [0.45, 0.86], [0.74, 0.34], [1, 0],
] as const);

export function createGraphicsTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/**
 * 도형 타원처럼 경계가 보이지 않는 감쇠 텍스처. 런타임 생성이라 별도 래스터 파일이 없다.
 *
 * 기본은 tint용 흰 마스크이며, Canvas에서 광색이 필요한 경우 색을 직접 굽는다.
 */
function softRadialTexture(scene: Phaser.Scene, key: string, size: number, stops: RadialStops, color: number = PALETTE.white): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, size, size);
  if (texture === null) return;
  const context = texture.getContext();
  const centre = size / 2;
  const gradient = context.createRadialGradient(centre, centre, 0, centre, centre, centre);
  const rgb = `${(color >> 16) & 255},${(color >> 8) & 255},${color & 255}`;
  for (const [offset, alpha] of stops) gradient.addColorStop(offset, `rgba(${rgb},${alpha})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.refresh();
}

/**
 * 샹들리에 줄타기 박자의 가산 빛. `(1 - d)²` 감쇠 — 효과 실험실과 시트 CLI 의 래스터라이저가
 * 같은 곡선을 그려야 실험실에서 맞춘 빛 세기가 게임에서도 같다.
 */
const ROPE_FX_LIGHT_STOPS: RadialStops = Object.freeze([
  [0, 1], [0.25, 0.5625], [0.5, 0.25], [0.75, 0.0625], [1, 0],
] as const);

export function buildRopeFxLightTexture(scene: Phaser.Scene): string {
  softRadialTexture(scene, TEX.ropeFxLight, 64, ROPE_FX_LIGHT_STOPS);
  return TEX.ropeFxLight;
}

/**
 * 무대 비네트: 가운데는 비고 가장자리만 짙어진다. 화면 비율로 늘려 쓰면 타원이 된다.
 * 가운데 절반은 완전히 투명해야 배우가 서는 전투 면의 명도를 건드리지 않는다.
 */
const STAGE_VIGNETTE_STOPS: RadialStops = Object.freeze([
  [0, 0], [0.5, 0], [0.72, 0.28], [0.88, 0.62], [1, 0.86],
] as const);

/**
 * 무대 역광: 점광원처럼 가운데만 밝으면 두 배우가 벌어졌을 때 빛이 빈 자리에 떨어진다.
 * 반경 1/3 까지 거의 평평하게 유지해 간격이 벌어져도 양쪽이 절반 가까운 빛을 받는다.
 */
const STAGE_BACKLIGHT_STOPS: RadialStops = Object.freeze([
  [0, 1], [0.35, 0.8], [0.65, 0.35], [1, 0],
] as const);

export function buildStageBacklightTexture(scene: Phaser.Scene): string {
  softRadialTexture(scene, TEX.stageBacklight, 128, STAGE_BACKLIGHT_STOPS);
  return TEX.stageBacklight;
}

export function buildStageVignetteTexture(scene: Phaser.Scene): string {
  softRadialTexture(scene, TEX.stageVignette, 256, STAGE_VIGNETTE_STOPS);
  return TEX.stageVignette;
}

/** 위는 투명, 아래로 갈수록 짙어지는 세로 감쇠. 바닥 판석의 앞쪽을 어둡게 떨어뜨린다. */
export function buildVerticalFalloffTexture(scene: Phaser.Scene): string {
  const key = TEX.verticalFalloff;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 4, 128);
  if (texture === null) return key;
  const context = texture.getContext();
  const gradient = context.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.18)");
  gradient.addColorStop(1, "rgba(255,255,255,1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 128);
  texture.refresh();
  return key;
}

/**
 * 좌우 양끝만 `featherPx` 에 걸쳐 0→1 로 풀리는 흰 가로 띠. 세로로 늘려 판정 사각형의 그늘로 쓴다
 * (`LevelView` 어둠 구역). 폭마다 한 장 — 같은 폭의 구역은 텍스처를 나눠 쓴다.
 */
export function buildHorizontalFeatherTexture(scene: Phaser.Scene, width: number, featherPx: number): string {
  const key = `tex-h-feather-${width}-${featherPx}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, width, 4);
  if (texture === null) return key;
  const context = texture.getContext();
  const gradient = context.createLinearGradient(0, 0, width, 0);
  const ramp = Math.min(0.5, featherPx / width);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(ramp, "rgba(255,255,255,1)");
  gradient.addColorStop(1 - ramp, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, 4);
  texture.refresh();
  return key;
}

export function buildLampGlowTexture(scene: Phaser.Scene): void {
  softRadialTexture(scene, TEX.lampGlow, 128, LAMP_GLOW_STOPS);
}

/** Canvas도 WebGL과 같은 광색을 보도록 tint 대신 텍스처에 색을 굽는다. */
export function buildColoredLampGlowTexture(scene: Phaser.Scene, color: number): string {
  const key = `${TEX.lampGlow}-${color.toString(16)}`;
  softRadialTexture(scene, key, 128, LAMP_GLOW_STOPS, color);
  return key;
}

/**
 * 도착 표제(`LocationTitleCardView`)가 글줄 뒤에 까는 그늘 마스크.
 *
 * 표제 카드는 여섯 씬에서 뜨고 그 중 넷은 이 텍스처를 만드는 다른 이유가 없으므로,
 * 카드 뷰가 만들어질 때마다 한 번 부른다 — 이미 있으면 즉시 돌아온다.
 */
export function buildTitleCardScrimTexture(scene: Phaser.Scene): void {
  softRadialTexture(scene, TEX.titleCardScrim, 128, TITLE_CARD_SCRIM_STOPS);
}

/**
 * 플랫 주 버튼의 단색 금 판. 이미지 프레임 버튼(`frameButton`)이 늘려 쓴다.
 * 흰 마스크에 tint 를 입히면 Canvas 렌더러에서 흰 판이 되므로 색을 직접 굽는다.
 */
export function buildFlatGoldFillTexture(scene: Phaser.Scene): void {
  createGraphicsTexture(scene, TEX.flatGoldFill, 8, 8, (g) => {
    g.fillStyle(PALETTE.dialogueGoldBright, 1);
    g.fillRect(0, 0, 8, 8);
  });
}

/** 외곽선이 있는 둥근 사각형. 만화풍 실루엣의 기본 단위. */
function outlinedRoundRect(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: number,
): void {
  g.fillStyle(PALETTE.outline, 1);
  g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, radius + 2);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, radius);
}

export function buildPlaceholderTextures(scene: Phaser.Scene): void {
  buildLampGlowTexture(scene);

  // 말풍선 바탕.
  createGraphicsTexture(scene, TEX.bubble, 22, 18, (g) => {
    outlinedRoundRect(g, 2, 1, 18, 13, 5, PALETTE.eyeWhite);
    g.fillStyle(PALETTE.outline, 1);
    g.fillTriangle(9, 14, 15, 14, 10, 18);
    g.fillStyle(PALETTE.eyeWhite, 1);
    g.fillTriangle(10, 13, 14, 13, 11, 16);
  });
}

/** 타이틀 원화 위 왼쪽 활자용 스크림. 원화 대체가 아닌 공유 절차 텍스처다. */
export function ensureTitleCopyVeil(scene: Phaser.Scene): string {
    const key = "title-copy-veil-jewel-clear";
  if (scene.textures.exists(key)) return key;
  // NPOT 폭과 투명한 끝 여백은 선형 샘플링에서 반대편 불투명 픽셀이 말려오는 선을 막는다.
    const texture = scene.textures.createCanvas(key, 258, 258)!;
  const context = texture.context;
  const gradient = context.createLinearGradient(0, 0, 250, 0);
    gradient.addColorStop(0, `${CSS.navyInk}8c`);
    gradient.addColorStop(0.45, `${CSS.navyInk}66`);
    gradient.addColorStop(0.75, `${CSS.navyInk}21`);
  gradient.addColorStop(1, `${CSS.navyInk}00`);
  context.fillStyle = gradient;
    context.fillRect(0, 0, 258, 258);
    // Fade out over the foreground jewels rather than tinting the entire left half.
    const vertical = context.createLinearGradient(0, 0, 0, 258);
    vertical.addColorStop(0, "rgba(255,255,255,0.55)");
    vertical.addColorStop(0.17, "rgba(255,255,255,0.8)");
    vertical.addColorStop(0.50, "rgba(255,255,255,1)");
    vertical.addColorStop(0.76, "rgba(255,255,255,0.9)");
    vertical.addColorStop(0.86, "rgba(255,255,255,0.4)");
    vertical.addColorStop(0.95, "rgba(255,255,255,0.06)");
    vertical.addColorStop(1, "rgba(255,255,255,0)");
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = vertical;
    context.fillRect(0, 0, 258, 258);
    context.globalCompositeOperation = "source-over";
  texture.refresh();
  texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

function cssRgba(color: number, alpha: number): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;
}

/**
 * 목표 유물 접지 VFX(`ObjectiveGroundFxView`)의 층별 감쇠 텍스처. 색을 구워 Canvas에서도 tint 없이 같은 빛이 난다.
 * 모든 층은 감쇠 그라데이션이다 — 외곽선이 생기는 도형을 쓰지 않는다.
 */
export function buildObjectiveGroundFxTexture(scene: Phaser.Scene, layer: ObjectiveGroundLayer, color: number): string {
  const key = `objective-ground-fx-${layer}-${color.toString(16)}`;
  if (scene.textures.exists(key)) return key;
  const size = layer === "mote" ? 32 : layer === "shaft" ? 64 : 128;
  const texture = scene.textures.createCanvas(key, size, size);
  if (texture === null) return key;
  const context = texture.getContext();
  const half = size / 2;
  if (layer === "shaft") {
    // 아래가 밝고 위로 사라지는 기둥 × 좌우 가장자리 감쇠.
    const vertical = context.createLinearGradient(0, size, 0, 0);
    vertical.addColorStop(0, cssRgba(color, 1));
    vertical.addColorStop(0.35, cssRgba(color, 0.42));
    vertical.addColorStop(1, cssRgba(color, 0));
    context.fillStyle = vertical;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = "destination-in";
    const horizontal = context.createLinearGradient(0, 0, size, 0);
    horizontal.addColorStop(0, "rgba(0,0,0,0)");
    horizontal.addColorStop(0.5, "rgba(0,0,0,1)");
    horizontal.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = horizontal;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = "source-over";
  } else if (layer === "mote") {
    // 부드러운 점이 먼저 읽히고 네 갈래는 보석 반짝임 정도로만 얹는다.
    const dot = context.createRadialGradient(half, half, 0, half, half, half);
    dot.addColorStop(0, cssRgba(color, 1));
    dot.addColorStop(0.22, cssRgba(color, 0.6));
    dot.addColorStop(0.55, cssRgba(color, 0.12));
    dot.addColorStop(1, cssRgba(color, 0));
    context.fillStyle = dot;
    context.fillRect(0, 0, size, size);
    context.fillStyle = cssRgba(color, 0.45);
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      context.beginPath();
      context.moveTo(half - dx * half, half - dy * half);
      context.lineTo(half + dy * 1.4, half + dx * 1.4);
      context.lineTo(half + dx * half, half + dy * half);
      context.lineTo(half - dy * 1.4, half - dx * 1.4);
      context.closePath();
      context.fill();
    }
  } else {
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    const stops: readonly (readonly [number, number])[] = layer === "ripple"
      // 가운데가 빈 넓은 고리 — 선이 아니라 빛의 띠라서 안쪽·바깥쪽 모두 서서히 사라진다.
      ? [[0, 0], [0.3, 0], [0.6, 0.38], [0.78, 0.24], [1, 0]]
      : layer === "core"
        ? [[0, 1], [0.25, 0.55], [0.6, 0.2], [1, 0]]
        : [[0, 0.7], [0.3, 0.4], [0.62, 0.2], [0.85, 0.05], [1, 0]];
    for (const [offset, alpha] of stops) gradient.addColorStop(offset, cssRgba(color, alpha));
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  texture.refresh();
  return key;
}
