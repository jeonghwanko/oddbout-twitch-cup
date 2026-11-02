import type { HypeTex } from "./HypeImpactFx";

/**
 * `HypeImpactFx` 스프라이트의 텍스처를 캔버스 2D 로 굽는다(파일 없음 — 로딩 대기·네트워크 실패가 없다).
 * 불꽃 고리만 원화 색이 구워져 있고, 나머지는 흰색이라 색은 틴트로 준다. 밝기 차(뜨거운 심 / 부드러운 가장자리)는
 * 알파로 굽는다 — 가산 합성에서 심은 하얗게 타고 가장자리는 번진다.
 */
export interface HypeTextureSpec {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  /** 스프라이트 원점(0..1). 바늘은 뿌리(왼쪽 끝)에서 뻗는다. */
  readonly origin: readonly [number, number];
}

export const HYPE_TEXTURES: Readonly<Record<HypeTex, HypeTextureSpec>> = Object.freeze({
  glow: { key: "hype-impact-glow", width: 128, height: 128, origin: [.5, .5] },
  needle: { key: "hype-impact-needle", width: 256, height: 32, origin: [0, .5] },
  star: { key: "hype-impact-star", width: 256, height: 256, origin: [.5, .5] },
  ring: { key: "hype-impact-ring", width: 256, height: 256, origin: [.5, .5] },
  spark: { key: "hype-impact-spark", width: 64, height: 16, origin: [.5, .5] },
  crescent: { key: "hype-impact-crescent", width: 128, height: 512, origin: [.89, .5] },
});

type Ctx = CanvasRenderingContext2D;

/** 축(x)을 따라 반폭 `hw(u)` 인 방추. 두 겹: 넓고 흐린 번짐 + 좁고 진한 심. */
function spindle(ctx: Ctx, x0: number, x1: number, cy: number, hw: (u: number) => number, passes: readonly [number, number, number][]): void {
  for (const [scale, alpha, blur] of passes) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,1)";
    ctx.shadowBlur = blur;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      ctx.lineTo(x0 + (x1 - x0) * u, cy - hw(u) * scale);
    }
    for (let i = steps; i >= 0; i--) {
      const u = i / steps;
      ctx.lineTo(x0 + (x1 - x0) * u, cy + hw(u) * scale);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawGlow(ctx: Ctx, w: number): void {
  const c = w / 2, g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [s, a] of [[0, 1], [.14, .92], [.32, .5], [.55, .18], [.78, .05], [1, 0]] as const) g.addColorStop(s, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
}

/** 뿌리 쪽 25% 에서 가장 두껍고 끝은 바늘처럼 뾰족하다. */
function drawNeedle(ctx: Ctx, w: number, h: number): void {
  const hw = (u: number) => u < .22 ? Math.sin((Math.PI / 2) * (u / .22)) ** .7 : (1 - (u - .22) / .78) ** 1.6;
  spindle(ctx, 3, w - 2, h / 2, u => hw(u) * (h * .36), [[1, .45, 6], [.48, 1, 2]]);
}

/** 오목한 네 갈래 별 + 가운데 빛. */
function drawStar(ctx: Ctx, w: number): void {
  const c = w / 2, arm = (u: number) => 15 * (1 - u) ** 2.4;
  ctx.save();
  for (const rot of [0, Math.PI / 2]) {
    ctx.setTransform(Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), c, c);
    for (const dir of [1, -1]) spindle(ctx, 0, dir * (c - 4), 0, arm, [[1.9, .4, 10], [1, 1, 2]]);
  }
  ctx.restore();
  const g = ctx.createRadialGradient(c, c, 0, c, c, 44);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.4, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(c - 44, c - 44, 88, 88);
}

function drawRing(ctx: Ctx, w: number): void {
  const c = w / 2;
  for (const [width, alpha, blur] of [[10, .35, 10], [3.5, 1, 2]] as const) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,1)"; ctx.shadowBlur = blur;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(c, c, c - 14, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/** 앞(오른쪽) 머리가 굵은 불티 줄. 회전은 속도 방향이다. */
function drawSpark(ctx: Ctx, w: number, h: number): void {
  spindle(ctx, 2, w - 2, h / 2, u => Math.sin(Math.PI * u ** .8) ** .8 * h * .34, [[1, .5, 3], [.5, 1, 1]]);
}

/** 가운데가 두꺼운 얇은 초승달. 원점(0.89, .5)이 호의 한가운데 — 접촉점을 지나간다. */
function drawCrescent(ctx: Ctx, h: number): void {
  const cx = -120, cy = h / 2, R = 240, span = 1;
  for (const [scale, alpha, blur] of [[1.8, .4, 10], [1, 1, 2]] as const) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,1)"; ctx.shadowBlur = blur;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const a = -span + (2 * span * i) / steps;
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    for (let i = steps; i >= 0; i--) {
      const u = i / steps, a = -span + 2 * span * u, thick = 22 * Math.sin(Math.PI * u) ** 1.3 * scale;
      ctx.lineTo(cx + Math.cos(a) * (R - thick), cy + Math.sin(a) * (R - thick));
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export function drawHypeTexture(tex: HypeTex, ctx: Ctx): void {
  const { width: w, height: h } = HYPE_TEXTURES[tex];
  ctx.clearRect(0, 0, w, h);
  switch (tex) {
    case "glow": return drawGlow(ctx, w);
    case "needle": return drawNeedle(ctx, w, h);
    case "star": return drawStar(ctx, w);
    case "ring": return drawRing(ctx, w);
    case "spark": return drawSpark(ctx, w, h);
    case "crescent": return drawCrescent(ctx, h);
  }
}
