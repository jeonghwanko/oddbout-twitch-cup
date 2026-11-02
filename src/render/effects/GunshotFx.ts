import { easeOutCubic } from "../art/easing";
import { PALETTE } from "../art/palette";
import { fxMix, fxRng } from "./FxRandom";



export type GunTier = "light" | "medium" | "heavy";

/**
 * 총 이펙트의 색: 흰 심(`core`) 둘레의 뜨거운 크림(`hot`)과 화약 금빛(`flame`), 그 바깥 테는 그의 차가운 강철빛(`rim` — 침착한 사수, 남빛 밤의
 * 각성기와 한 계열), 화약 연기(`smoke`·`smokeDeep`), 탄피 놋쇠(`brass`), 튀는 불티(`spark`). 이 이펙트만 쓰는 색이라 여기 둔다
 * (`palette.ts`는 마을 건물 굽기의 원본 해시에 묶여 있다).
 */
export const GUN_FX_COLORS = Object.freeze({
  core: PALETTE.white, hot: 0xfff2cc, flame: 0xffc25a, rim: 0x8fc4ff, smoke: 0xc3c9d4, smokeDeep: 0x7a8291, brass: 0xe8b85a, spark: 0xffda8c,
});

/** The textures the recipe draws with (`GunshotTextures` bakes them). */
export type GunTex = "flash" | "glow" | "tracer" | "ring" | "spark" | "smoke" | "casing" | "line";

/** One sprite of the recipe at its age: texture, centre (its texture's origin), size, rotation, tint, opacity, blend and its layer. */
export interface GunSprite {
  readonly tex: GunTex;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rot: number;
  readonly color: number;
  readonly alpha: number;
  readonly add: boolean;
  /** Behind the shooter's body (the light he stands in) rather than in front of it. */
  readonly behind: boolean;
}

interface TierRecipe {
  /** The muzzle flash: its length (bodies) and the three steps' ms. */
  readonly flash: { readonly length: number; readonly stepsMs: readonly [number, number, number] };
  /** The white core at the muzzle (bodies across), its first two steps only. */
  readonly core: number;
  /** The tracer: its width (bodies), the head's flight ms to the far end, the tail's catch-up ms after the head lands. */
  readonly tracer: { readonly width: number; readonly headMs: number; readonly tailMs: number };
  /** Smoke puffs off the muzzle and how long they curl up. */
  readonly smoke: { readonly puffs: number; readonly ms: number; readonly size: number };
  readonly casing: boolean;
  /** The light behind his body (bodies across), 0 for none. */
  readonly backLight: number;
  /** The impact: core (bodies across), ring's end radius (bodies), sparks, radial speed lines, a second ring. */
  readonly impact: { readonly core: number; readonly ring: number; readonly sparks: number; readonly lines: number; readonly echo: boolean };
}

export const GUNSHOT = Object.freeze({
  tiers: Object.freeze<Record<GunTier, TierRecipe>>({
    light: { flash: { length: 0.3, stepsMs: [17, 33, 34] }, core: 0.16, tracer: { width: 0.018, headMs: 34, tailMs: 70 },
      smoke: { puffs: 1, ms: 320, size: 0.09 }, casing: false, backLight: 0,
      impact: { core: 0.2, ring: 0.16, sparks: 5, lines: 0, echo: false } },
    medium: { flash: { length: 0.42, stepsMs: [17, 34, 40] }, core: 0.22, tracer: { width: 0.026, headMs: 40, tailMs: 100 },
      smoke: { puffs: 2, ms: 420, size: 0.12 }, casing: true, backLight: 0.5,
      impact: { core: 0.26, ring: 0.24, sparks: 7, lines: 4, echo: false } },
    heavy: { flash: { length: 0.62, stepsMs: [20, 50, 50] }, core: 0.32, tracer: { width: 0.038, headMs: 50, tailMs: 150 },
      smoke: { puffs: 3, ms: 560, size: 0.16 }, casing: true, backLight: 0.95,
      impact: { core: 0.36, ring: 0.34, sparks: 10, lines: 7, echo: true } },
  }),
  /** A tracer's longest reach without a body to stop it (bodies). */
  freeReach: 3.2,
  /** A blocked shot's spray (a ricochet off the guard): its share of the tier's sparks and ring. */
  blocked: { sparks: 0.8, ring: 0.6 },
  /** The ring's widening and the sparks' flight (ms), the speed lines' (ms). */
  impactMs: { core: 60, ring: 150, sparks: 170, lines: 130 },
  /** The casing: kicked back and up (bodies a second), its fall (bodies a second squared), spin (deg a second), life (ms). */
  casing: { back: 0.9, up: 1.7, gravity: 7, spinDeg: 1440, ms: 460, size: 0.05 },
  /** A bullet's streak behind it (`gunBulletSprites`): its longest trail (bodies), width (bodies), the head's glow (bodies across). */
  bullet: { trail: 1.6, width: 0.03, glow: 0.2 },
});

/**
 * A firing cell of a fighter's pack (`GunshotFxView`): the shot goes off the frame his body turns to one of `cells` of `clip`. `muzzle` is the
 * muzzle off his drawn feet (body heights forward and up — measured off the art's baked flash, 2026-10-27), `angle` the way the gun points
 * (radians down from level, facing right), `aimGive` how far off that way the line may bend to the other's chest, `freeReach` its reach with
 * nobody there (bodies). `tracer` false: the shot's bullet is its own drawing (the volley's summons) — only the flash and the smoke.
 */
export interface FighterGunCue {
  readonly clip: string;
  readonly cells: readonly string[];
  readonly tier: GunTier;
  readonly muzzle: readonly [number, number];
  readonly angle: number;
  readonly aimGive: number;
  readonly freeReach: number;
  readonly tracer: boolean;
}

export const FIGHTER_GUN_CUES: Readonly<Record<string, readonly FighterGunCue[]>> = Object.freeze({});

/** A shot fired: where the muzzle is, the way it fires (radians, screen), how far its line reaches (px), its weight. */
export interface GunShot {
  readonly kind: "shot";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly reachPx: number;
  readonly bodyPx: number;
  readonly tier: GunTier;
  readonly seed: number;
}

/** A shot landing on a body: the point, the way the bullet flew (radians), the struck body's height, blocked or not. */
export interface GunImpact {
  readonly kind: "impact";
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly bodyPx: number;
  readonly tier: GunTier;
  readonly blocked: boolean;
  readonly seed: number;
}

export type GunEvent = GunShot | GunImpact;

const T = GUNSHOT.tiers, C = GUN_FX_COLORS;
/** Each smoke puff leaves this much after the last (ms), give or take up to the jitter. */
const SMOKE_STAGGER_MS = 40, SMOKE_JITTER_MS = 20;

/** How long an event draws (fight ms). */
export function gunEventLifeMs(event: GunEvent): number {
  const r = T[event.tier];
  if (event.kind === "impact") return Math.max(GUNSHOT.impactMs.sparks, GUNSHOT.impactMs.ring + (r.impact.echo ? 60 : 0));
  return Math.max(r.flash.stepsMs[0] + r.flash.stepsMs[1] + r.flash.stepsMs[2], r.tracer.headMs + r.tracer.tailMs,
    r.smoke.ms + (r.smoke.puffs - 1) * SMOKE_STAGGER_MS + SMOKE_JITTER_MS,
    r.casing ? GUNSHOT.casing.ms : 0);
}

const unit = (ms: number, span: number) => Math.min(1, Math.max(0, ms / Math.max(1, span)));

/** The sprites of `event` at `ageMs` (fight ms since it began). `still`: reduced motion (nothing drifts or spins). */
export function gunEventSprites(event: GunEvent, ageMs: number, still = false): GunSprite[] {
  return event.kind === "shot" ? shotSprites(event, ageMs, still) : impactSprites(event, ageMs);
}

function shotSprites(s: GunShot, age: number, still: boolean): GunSprite[] {
  const r = T[s.tier], h = s.bodyPx, out: GunSprite[] = [], rand = fxRng(fxMix(s.seed, 0x5107));
  const cos = Math.cos(s.angle), sin = Math.sin(s.angle), [a, b, c] = r.flash.stepsMs;
  const jitter = (rand() - 0.5) * 0.2, sizeVar = 0.88 + rand() * 0.24;
  // The light he stands in: a warm bloom behind his body, gone by the flash's last step.
  if (r.backLight > 0 && age < a + b) {
    const k = age < a ? 1 : 1 - (age - a) / b * 0.55;
    out.push({ tex: "glow", x: s.x - cos * h * 0.15, y: s.y - sin * h * 0.15, w: h * r.backLight * k, h: h * r.backLight * k, rot: 0,
      color: C.flame, alpha: 0.55, add: true, behind: true });
  }
  // The flash in three steps: a small hot core; the petals thrown forward; a thin afterglow — then cut.
  if (age < a + b + c) {
    const step = age < a ? 0 : age < a + b ? 1 : 2;
    const len = h * r.flash.length * sizeVar * ([0.5, 1, 1.12] as const)[step];
    const wide = len * ([0.62, 0.55, 0.26] as const)[step];
    out.push({ tex: "flash", x: s.x, y: s.y, w: len, h: wide, rot: s.angle + jitter, color: C.flame, alpha: 1, add: true, behind: false });
    if (step < 2) out.push({ tex: "flash", x: s.x, y: s.y, w: len * 0.62, h: wide * 0.55, rot: s.angle + jitter * 0.5, color: C.hot, alpha: 1,
      add: true, behind: false });
    if (step < 2) {
      const core = h * r.core * (step === 0 ? 1 : 0.7);
      out.push({ tex: "glow", x: s.x, y: s.y, w: core, h: core, rot: 0, color: C.core, alpha: 1, add: true, behind: false });
    }
  }
  // The tracer: its head flies out over `headMs`, its tail chases it over `tailMs` — the line shortens to nothing (no fade).
  const { headMs, tailMs, width } = r.tracer;
  if (age < headMs + tailMs && s.reachPx > 1) {
    const head = s.reachPx * easeOutCubic(unit(age, headMs)), tail = s.reachPx * unit(age - headMs * 0.5, tailMs + headMs * 0.5) ** 1.4;
    const length = head - tail;
    if (length > 1) {
      const hx = s.x + cos * head, hy = s.y + sin * head, thin = 1 - 0.5 * unit(age - headMs, tailMs);
      out.push({ tex: "tracer", x: hx, y: hy, w: length, h: h * width * 3.2 * thin, rot: s.angle, color: C.rim, alpha: 0.75, add: true, behind: false });
      out.push({ tex: "tracer", x: hx, y: hy, w: length, h: h * width * thin, rot: s.angle, color: C.hot, alpha: 1, add: true, behind: false });
      if (age < headMs) out.push({ tex: "glow", x: hx, y: hy, w: h * width * 6, h: h * width * 6, rot: 0, color: C.core, alpha: 1, add: true, behind: false });
    }
  }
  // Smoke curling up off the muzzle: soft puffs drifting up and a little forward, growing and thinning.
  for (let i = 0; i < r.smoke.puffs; i++) {
    const delay = i * SMOKE_STAGGER_MS + rand() * SMOKE_JITTER_MS, k = unit(age - delay, r.smoke.ms), up = rand(), side = rand() - 0.5, spin = (rand() - 0.5) * 2;
    if (age < delay || k >= 1) continue;
    const drift = still ? 0 : easeOutCubic(k);
    const x = s.x + cos * h * (0.05 + 0.18 * drift) + side * h * 0.06 * drift;
    const y = s.y + sin * h * 0.05 - h * (0.06 + 0.22 * up) * drift;
    const size = h * r.smoke.size * (0.7 + 1.5 * drift);
    out.push({ tex: "smoke", x, y, w: size, h: size, rot: spin * drift * 1.4, color: i % 2 === 0 ? C.smoke : C.smokeDeep,
      alpha: 0.5 * (1 - k) ** 1.3, add: false, behind: false });
  }
  // The casing kicked out of the slide: back over his shoulder, spinning, falling.
  if (r.casing && age < GUNSHOT.casing.ms) {
    const K = GUNSHOT.casing, t = age / 1000, back = -Math.sign(cos || 1);
    const x = s.x - cos * h * 0.22 + (still ? 0 : back * K.back * h * t * (0.8 + rand() * 0.4));
    const y = s.y - h * 0.04 + (still ? 0 : (-K.up * t + 0.5 * K.gravity * t * t) * h);
    out.push({ tex: "casing", x, y, w: h * K.size, h: h * K.size * 0.45, rot: still ? 0 : (K.spinDeg * t * Math.PI) / 180, color: C.brass,
      alpha: 1, add: false, behind: false });
  }
  return out;
}

function impactSprites(s: GunImpact, age: number): GunSprite[] {
  const r = T[s.tier].impact, h = s.bodyPx, out: GunSprite[] = [], rand = fxRng(fxMix(s.seed, 0x1aac));
  const M = GUNSHOT.impactMs, B = GUNSHOT.blocked;
  // The core: a white burst at the contact, held its first frames, then pinched in.
  if (!s.blocked && age < M.core) {
    const size = h * r.core * (age < 34 ? 1 : 0.55);
    out.push({ tex: "glow", x: s.x, y: s.y, w: size, h: size, rot: 0, color: C.core, alpha: 1, add: true, behind: false });
    out.push({ tex: "flash", x: s.x, y: s.y, w: size * 1.5, h: size * 0.5, rot: s.angle + Math.PI, color: C.hot, alpha: 1, add: true, behind: false });
  }
  // The ring widening off the contact (two for a heavy shot, the second a beat later).
  for (const [delay, scale] of r.echo ? [[0, 1], [60, 1.45]] as const : [[0, 1]] as const) {
    const k = unit(age - delay, M.ring);
    if (age < delay || k >= 1) continue;
    const radius = h * r.ring * scale * (s.blocked ? B.ring : 1) * (0.25 + 0.75 * easeOutCubic(k));
    out.push({ tex: "ring", x: s.x, y: s.y, w: radius * 2, h: radius * 2 * (s.blocked ? 1 : 0.86), rot: s.angle, color: s.blocked ? C.spark : C.rim,
      alpha: 1 - k * k, add: true, behind: false });
  }
  // Sparks thrown on along the bullet's way (a ricochet off a guard sprays back and up), shrinking to nothing.
  const sparks = Math.round(r.sparks * (s.blocked ? B.sparks : 1));
  for (let i = 0; i < sparks; i++) {
    const spread = (rand() - 0.5) * (s.blocked ? 2.4 : 1.6), dir = (s.blocked ? s.angle + Math.PI : s.angle) + spread;
    const speed = h * (1.6 + rand() * 1.6), life = M.sparks * (0.6 + rand() * 0.4), k = unit(age, life);
    if (k >= 1) continue;
    const dist = speed * (life / 1000) * easeOutCubic(k), len = h * (0.07 + rand() * 0.06) * (1 - k);
    out.push({ tex: "spark", x: s.x + Math.cos(dir) * dist, y: s.y + Math.sin(dir) * dist - (s.blocked ? h * 0.1 * k : 0), w: len, h: len * 0.25,
      rot: dir, color: i % 3 === 0 ? C.core : C.spark, alpha: 1, add: true, behind: false });
  }
  // A heavy shot's radial speed lines, flung out and shortening.
  if (!s.blocked) for (let i = 0; i < r.lines; i++) {
    const dir = (i / r.lines) * Math.PI * 2 + rand() * 0.4, k = unit(age, M.lines);
    if (k >= 1) continue;
    const dist = h * (0.12 + 0.35 * easeOutCubic(k)), len = h * 0.22 * (1 - k);
    out.push({ tex: "line", x: s.x + Math.cos(dir) * dist, y: s.y + Math.sin(dir) * dist, w: len, h: h * 0.012, rot: dir, color: C.hot,
      alpha: 1, add: true, behind: false });
  }
  return out;
}

/**
 * A bullet in flight (the 세 발 volley — `bullet` summons): its head's glow and a two-layer streak back along its way, `trailPx` long (how far it
 * has come, at most `GUNSHOT.bullet.trail` bodies). `angle` is its way (radians).
 */
export function gunBulletSprites(x: number, y: number, angle: number, trailPx: number, bodyPx: number): GunSprite[] {
  const B = GUNSHOT.bullet, h = bodyPx, length = Math.min(trailPx, h * B.trail);
  const out: GunSprite[] = [];
  if (length > 1) {
    out.push({ tex: "tracer", x, y, w: length, h: h * B.width * 3.4, rot: angle, color: C.rim, alpha: 0.7, add: true, behind: false });
    out.push({ tex: "tracer", x, y, w: length * 0.8, h: h * B.width, rot: angle, color: C.hot, alpha: 1, add: true, behind: false });
  }
  out.push({ tex: "glow", x, y, w: h * B.glow, h: h * B.glow * 0.7, rot: angle, color: C.hot, alpha: 1, add: true, behind: false });
  out.push({ tex: "glow", x, y, w: h * B.glow * 0.4, h: h * B.glow * 0.3, rot: angle, color: C.core, alpha: 1, add: true, behind: false });
  return out;
}
