import { clamp01 } from "../../sim/geom";

/**
 * 목표 유물 아래 접지 VFX의 자세 계산. Phaser를 모르는 순수 함수다.
 *
 * 2026-10-02 이전에는 금색 1.6px 타원 외곽선과 가운데 점이었다 — 바닥에 그은 선이라
 * "빛이 고여 있다"가 아니라 "UI 테두리가 깔렸다"로 읽혔다. 지금은 외곽선 없이
 * 가산 합성 빛 웅덩이·뜨거운 심·퍼지는 부드러운 파문·뒤로 서는 빛기둥·떠오르는 금빛
 * 티끌의 다섯 겹으로 만든다. 모든 층은 감쇠 텍스처라 경계선이 없다.
 */

export type ObjectiveGroundLayer = "shaft" | "pool" | "ripple" | "core" | "mote";

/** 한 장의 스프라이트 자세. 좌표는 앵커(유물 발밑) 기준, 크기는 화면 px. */
export interface ObjectiveGroundSprite {
  readonly layer: ObjectiveGroundLayer;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
}

export const OBJECTIVE_GROUND_FX = Object.freeze({
  /** 빛 웅덩이: 옛 타원(54×13)보다 조금 넓되 경계가 없어 더 작아 보인다. */
  poolWidth: 76,
  poolHeight: 20,
  coreWidth: 36,
  coreHeight: 9,
  /** 유물 원화 뒤로 서는 빛기둥. 원화(48px)보다 넓고 높아 양옆·머리 위로 빛이 샌다. */
  shaftWidth: 56,
  shaftHeight: 62,
  /** 웅덩이 호흡 주기. */
  breathMs: 1800,
  /** 파문 하나가 퍼져 사라지는 시간. 두 개가 반 주기씩 엇갈린다. */
  rippleMs: 1900,
  ripples: 2,
  rippleMaxWidth: 100,
  /** 떠오르는 티끌. 원화(48px)에 가리지 않게 웅덩이 가장자리에서 오른다. */
  motes: 7,
  moteLifeMs: 1900,
  moteRisePx: 28,
  moteSizePx: 7,
});

const TAU = Math.PI * 2;

/** 결정론 해시 [0, 1). 같은 시간·같은 티끌이면 항상 같은 자리에서 떠오른다. */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

export interface ObjectiveGroundFxOptions {
  /** 잠긴 진열장 안의 목표: 흐린 웅덩이만 남기고 움직임을 멈춘다 — "집어라"로 읽히면 안 된다. */
  readonly locked: boolean;
  readonly reducedMotion: boolean;
  /**
   * 웅덩이 폭(px). 기본은 유물 원화(48px)에 맞춘 `poolWidth`. 옷장·사다리처럼 넓은 대상은 그 폭만큼 늘인다 —
   * 가로 치수(웅덩이·심·파문·티끌 퍼짐)만 늘고 높이와 빛기둥은 그대로다.
   */
  readonly widthPx?: number;
  /** 원화 뒤로 서는 빛기둥. 목표 유물만 쓴다(기본 켬). */
  readonly shaft?: boolean;
}

/**
 * `timeMs` 시점의 접지 VFX 스프라이트 목록. 배열 순서가 아래 → 위 그리기 순서다.
 * 동작 줄이기·잠김에서는 시간이 흘러도 결과가 변하지 않는다.
 */
export function objectiveGroundFxSprites(timeMs: number, options: ObjectiveGroundFxOptions): ObjectiveGroundSprite[] {
  const fx = OBJECTIVE_GROUND_FX;
  const still = options.reducedMotion || options.locked;
  const breath = still ? 0.5 : 0.5 + 0.5 * Math.sin((timeMs / fx.breathMs) * TAU);
  const dim = options.locked ? 0.55 : 1;
  const sx = Math.max(0.5, (options.widthPx ?? fx.poolWidth) / fx.poolWidth);
  const out: ObjectiveGroundSprite[] = [];

  if (!options.locked && options.shaft !== false) {
    out.push({
      layer: "shaft",
      x: 0,
      y: -fx.shaftHeight / 2 + 2,
      width: fx.shaftWidth * (0.94 + 0.06 * breath),
      height: fx.shaftHeight,
      alpha: 0.26 + 0.1 * breath,
    });
  }

  const poolScale = 0.95 + 0.07 * breath;
  out.push({
    layer: "pool",
    x: 0,
    y: 1,
    width: fx.poolWidth * sx * poolScale,
    height: fx.poolHeight * poolScale,
    alpha: (0.5 + 0.15 * breath) * dim,
  });

  if (!still) {
    for (let index = 0; index < fx.ripples; index += 1) {
      const u = (((timeMs / fx.rippleMs) + index / fx.ripples) % 1 + 1) % 1;
      const grow = 1 - (1 - u) * (1 - u);
      const width = fx.poolWidth * 0.45 + (fx.rippleMaxWidth - fx.poolWidth * 0.45) * grow;
      out.push({
        layer: "ripple",
        x: 0,
        y: 1,
        width: width * sx,
        height: width * (fx.poolHeight / fx.poolWidth),
        // 피어날 때 빠르게 차오르고 퍼지며 잦아든다.
        alpha: 0.38 * clamp01(u / 0.12) * (1 - u) * (1 - u),
      });
    }
  }

  out.push({
    layer: "core",
    x: 0,
    y: 0,
    width: fx.coreWidth * sx * (0.92 + 0.12 * breath),
    height: fx.coreHeight * (0.92 + 0.12 * breath),
    alpha: (0.42 + 0.18 * breath) * dim,
  });

  if (!still) {
    for (let index = 0; index < fx.motes; index += 1) {
      const shifted = timeMs + (index / fx.motes) * fx.moteLifeMs;
      const cycle = Math.floor(shifted / fx.moteLifeMs);
      const u = shifted / fx.moteLifeMs - cycle;
      const spread = hash01(index, cycle) - 0.5;
      const sway = (hash01(index + 31, cycle) - 0.5) * 6;
      const rise = 1 - (1 - u) * (1 - u);
      const twinkle = 0.75 + 0.25 * Math.sin((u * 3 + index * 0.37) * TAU);
      const size = fx.moteSizePx * (0.6 + 0.5 * hash01(index + 57, cycle)) * (1 - 0.45 * u) * twinkle;
      out.push({
        layer: "mote",
        x: spread * fx.poolWidth * sx * 0.95 + sway * u,
        y: -2 - rise * fx.moteRisePx,
        width: size,
        height: size,
        alpha: Math.sin(Math.PI * u) * 0.9,
      });
    }
  }

  return out;
}
