import type { GunTex } from "./GunshotFx";

/**
 * `GunshotFx` 의 텍스처를 캔버스 2D 로 굽는다(파일 없음 — `HypeImpactTextures` 와 같은 방식). 모두 흰색이고 색은 틴트가 준다. 뜨거운 심과
 * 번지는 가장자리는 알파로 굽는다 — 가산 합성에서 심은 하얗게 타고 가장자리는 번진다. 모양은 곡선뿐이다(평면 삼각형·마름모 없음).
 */
export interface GunTextureSpec {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  /** The sprite's origin (0..1): the flash from its root at the muzzle, the tracer from its head. */
  readonly origin: readonly [number, number];
}

export const GUN_TEXTURES: Readonly<Record<GunTex, GunTextureSpec>> = Object.freeze({
  flash: { key: "gun-fx-flash", width: 256, height: 160, origin: [0.06, 0.5] },
  glow: { key: "gun-fx-glow", width: 128, height: 128, origin: [0.5, 0.5] },
  tracer: { key: "gun-fx-tracer", width: 512, height: 32, origin: [1, 0.5] },
  ring: { key: "gun-fx-ring", width: 256, height: 256, origin: [0.5, 0.5] },
  spark: { key: "gun-fx-spark", width: 64, height: 16, origin: [0.5, 0.5] },
  smoke: { key: "gun-fx-smoke", width: 128, height: 128, origin: [0.5, 0.5] },
  casing: { key: "gun-fx-casing", width: 40, height: 18, origin: [0.5, 0.5] },
  line: { key: "gun-fx-line", width: 256, height: 12, origin: [0.5, 0.5] },
});

type Ctx = CanvasRenderingContext2D;

/** A spindle round a CURVED axis: `axis(u)` the centre line, `hw(u)` the half width; soft wide pass then the sharp core. */
function curvedSpindle(ctx: Ctx, axis: (u: number) => readonly [number, number], hw: (u: number) => number,
  passes: readonly (readonly [number, number, number])[]): void {
  const steps = 56;
  for (const [scale, alpha, blur] of passes) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,1)";
    ctx.shadowBlur = blur;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    const side = (u: number, sign: number) => {
      const [x0, y0] = axis(u), [x1, y1] = axis(Math.min(1, u + 1e-3)), [xb, yb] = axis(Math.max(0, u - 1e-3));
      const dx = x1 - xb, dy = y1 - yb, n = Math.hypot(dx, dy) || 1, w = hw(u) * scale * sign;
      return [x0 - (dy / n) * w, y0 + (dx / n) * w] as const;
    };
    for (let i = 0; i <= steps; i++) { const [x, y] = side(i / steps, 1); ctx.lineTo(x, y); }
    for (let i = steps; i >= 0; i--) { const [x, y] = side(i / steps, -1); ctx.lineTo(x, y); }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/**
 * The muzzle bloom: a long centre petal thrown forward and two shorter ones curling out from the muzzle (a flower, not a star), a hot round
 * root at the muzzle (left), a faint ring of fire round the root.
 */
function drawFlash(ctx: Ctx, w: number, h: number): void {
  const root = [w * 0.06, h / 2] as const, cy = h / 2;
  const petal = (length: number, bend: number, spread: number, width: number) => curvedSpindle(ctx,
    u => [root[0] + u * length, cy + spread * u * length * 0.5 + bend * Math.sin(Math.PI * u) * length * 0.18],
    u => width * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.75 * (1 - u) ** 0.55,
    [[2, 0.35, 14], [1, 1, 3]]);
  petal(w * 0.9, 0, 0, h * 0.13);
  petal(w * 0.55, -1, -0.55, h * 0.09);
  petal(w * 0.55, 1, 0.55, h * 0.09);
  petal(w * 0.32, -1, -1.25, h * 0.06);
  petal(w * 0.32, 1, 1.25, h * 0.06);
  const g = ctx.createRadialGradient(root[0] + h * 0.1, cy, 0, root[0] + h * 0.1, cy, h * 0.32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,.7)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawGlow(ctx: Ctx, w: number): void {
  const c = w / 2, g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [s, a] of [[0, 1], [0.16, 0.9], [0.34, 0.48], [0.58, 0.16], [0.8, 0.04], [1, 0]] as const) g.addColorStop(s, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
}

/** The tracer: thick and hot at its head (right), tapering to a hair at its tail (left). */
function drawTracer(ctx: Ctx, w: number, h: number): void {
  curvedSpindle(ctx, u => [2 + u * (w - 6), h / 2], u => h * 0.36 * (u < 0.94 ? u ** 1.8 : 1 - ((u - 0.94) / 0.06) ** 2 * 0.6),
    [[1.6, 0.4, 6], [0.7, 1, 1.5]]);
}

function drawRing(ctx: Ctx, w: number): void {
  const c = w / 2;
  for (const [width, alpha, blur] of [[12, 0.3, 12], [3, 1, 2]] as const) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,1)"; ctx.shadowBlur = blur;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(c, c, c - 16, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

/** A spark: its head (right) fat, its tail a hair. */
function drawSpark(ctx: Ctx, w: number, h: number): void {
  curvedSpindle(ctx, u => [2 + u * (w - 4), h / 2], u => Math.sin(Math.PI * u ** 0.8) ** 0.8 * h * 0.34, [[1, 0.5, 3], [0.5, 1, 1]]);
}

/** A soft puff: overlapping round lobes, dense in the middle, curling at one side. */
function drawSmoke(ctx: Ctx, w: number): void {
  const lobes = [[0.5, 0.52, 0.3], [0.36, 0.44, 0.22], [0.64, 0.42, 0.2], [0.42, 0.64, 0.2], [0.62, 0.62, 0.18], [0.28, 0.3, 0.12]] as const;
  for (const [x, y, r] of lobes) {
    const g = ctx.createRadialGradient(x * w, y * w, 0, x * w, y * w, r * w);
    g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(0.6, "rgba(255,255,255,.28)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  }
}

/** The casing: a small rounded cylinder, its mouth's rim a darker band and a light streak along it (it reads as metal once tinted). */
function drawCasing(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.beginPath(); ctx.roundRect(3, 3, w - 6, h - 6, (h - 6) / 2); ctx.fill();
  ctx.fillStyle = "rgba(150,150,150,1)"; ctx.fillRect(w - 10, 3, 3, h - 6);
  ctx.fillStyle = "rgba(210,210,210,1)"; ctx.fillRect(6, h - 7, w - 16, 2);
}

/** A speed line: thin, pointed at both ends. */
function drawLine(ctx: Ctx, w: number, h: number): void {
  curvedSpindle(ctx, u => [2 + u * (w - 4), h / 2], u => Math.sin(Math.PI * u) ** 0.9 * h * 0.36, [[1.5, 0.35, 3], [0.6, 1, 1]]);
}

export function drawGunTexture(tex: GunTex, ctx: Ctx): void {
  const { width: w, height: h } = GUN_TEXTURES[tex];
  ctx.clearRect(0, 0, w, h);
  switch (tex) {
    case "flash": return drawFlash(ctx, w, h);
    case "glow": return drawGlow(ctx, w);
    case "tracer": return drawTracer(ctx, w, h);
    case "ring": return drawRing(ctx, w);
    case "spark": return drawSpark(ctx, w, h);
    case "smoke": return drawSmoke(ctx, w);
    case "casing": return drawCasing(ctx, w, h);
    case "line": return drawLine(ctx, w, h);
  }
}
