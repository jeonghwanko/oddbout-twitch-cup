import type { SimEvent, Vec2 } from "../../sim/types";
import { easeOutBack, easeOutCubic } from "../art/easing";
import { PALETTE } from "../art/palette.ts";

/**
 * 대미지 숫자("대미지 폰트") — 맞은 순간 숫자가 크게 박혔다가 제자리로 내려앉고, 호를 그리며 떠올라 사라진다.
 *
 * 표시 단위: sim 피해 그대로다(경비·플레이어 HP 단위, 소수 첫째 자리). 평타 "1", 피니셔 "2",
 * 금고지기에게 들어간 강타 "6"(체력 12 의 절반). 플레이어는 HUD 체력 행(`현재/최대`)과 같은 "-1".
 * 부풀린 표시 배율(×100)은 쓰지 않는다 — 체력 막대·HUD 와 단위가 갈리면 숫자가 가짜로 읽힌다
 * (2026-09-26 메인 세션 리뷰). 무게는 숫자의 크기가 아니라 글자의 크기·색·배경·흔들림이 말한다.
 *
 * 티어가 크기·색·수명·흔들림을 정하고, 무거운 티어만 뒤에 생성 원화 배경(잉크·금박 폭발 / 진홍 잉크)을 깐다.
 * Phaser 를 모른다 — 뷰(`DamageNumberView`)가 이 표와 곡선을 그대로 그린다.
 */

export type DamageNumberTier =
  | "absorbed"
  | "light"
  | "heavy"
  | "dash"
  | "finisher"
  | "counter"
  | "boss-ko"
  | "player"
  | "player-heavy";

/**
 * 숫자 뒤 받침. `wax` 는 절차로 그린 둥근 밀랍 봉인(예고장 봉인과 같은 버건디·상아 테) — 남색 12각 폭발
 * 원화(`burst`)는 경비 머리만 한 크기로 쓰러진 몸 위에 36 프레임 넘게 앉아 결판 자세를 가렸다(2026-09-27).
 * `burst` 는 옛 리플레이·도구 호환으로만 남는다.
 */
export type DamageNumberBacking = "wax" | "burst" | "hurt" | null;

export interface DamageNumberStyle {
  /** 월드 px. 보스전 배율(≈1.45–1.7)에서 화면 약 1.6배로 보인다. */
  readonly fontPx: number;
  /** 글자 채움 세로 그라데이션(위 → 아래). */
  readonly fillTop: number;
  readonly fillBottom: number;
  readonly stroke: number;
  readonly strokePx: number;
  readonly lifeMs: number;
  /** 수명 동안 떠오르는 높이(월드 px). 플레이어는 튀어 올랐다 떨어진다(`fall`). */
  readonly risePx: number;
  /** 맞은 쪽(밀려나는 방향)으로 흐르는 거리. */
  readonly driftPx: number;
  /** 박히는 순간의 배율 → `popMs` 에 1 아래로 눌렸다가 되튄다. */
  readonly popFrom: number;
  readonly popMs: number;
  readonly shakePx: number;
  readonly shakeMs: number;
  readonly backing: DamageNumberBacking;
  /** 배경 원화 지름(월드 px). */
  readonly backingPx: number;
  /** 배경 원화의 최대 불투명도. */
  readonly backingAlpha: number;
  /** 플레이어 피격: 위로 튄 뒤 아래로 떨어진다. */
  readonly fall: boolean;
  /** 기울기(rad). 맞은 쪽으로 기울어 속도가 읽힌다. */
  readonly tiltRad: number;
}

const INK = PALETTE.outline;
const WINE = 0x3a0610;

/**
 * 티어별 모양. 형태(크기·배경·흔들림)가 1차 신호이고 색은 보조다 — 색각 이상에서도 무게가 갈린다.
 * 치명(처벌·쓰러뜨림)은 표가 아니라 `criticalDamageNumberStyle` 이 한 단 키운다.
 */
export const DAMAGE_NUMBER_STYLES: Readonly<Record<DamageNumberTier, DamageNumberStyle>> = Object.freeze({
  // 경직 저항이 먹은 타격: 작고 회색빛. "들어갔지만 안 밀렸다".
  absorbed: { fontPx: 13, fillTop: 0xe7e2f2, fillBottom: PALETTE.dim, stroke: INK, strokePx: 3, lifeMs: 420, risePx: 18, driftPx: 6, popFrom: 1.35, popMs: 70, shakePx: 0, shakeMs: 0, backing: null, backingPx: 0, backingAlpha: 0, fall: false, tiltRad: 0.04 },
  // 평타 1·2타: 상아 → 금. 짧고 가볍게 — 480 → 300(2026-09-27): "1" 이 약 550ms 남아 다음 타의 숫자와 겹쳤다.
  light: { fontPx: 17, fillTop: PALETTE.fxWarmCream, fillBottom: PALETTE.fxWarmGold, stroke: INK, strokePx: 4, lifeMs: 300, risePx: 22, driftPx: 8, popFrom: 1.6, popMs: 80, shakePx: 0, shakeMs: 0, backing: null, backingPx: 0, backingAlpha: 0, fall: false, tiltRad: 0.06 },
  // 강타(V): 주황 호박. 더 크게 박히고 한 번 흔들린다.
  heavy: { fontPx: 22, fillTop: PALETTE.hotGold, fillBottom: 0xff8a2a, stroke: INK, strokePx: 5, lifeMs: 560, risePx: 26, driftPx: 12, popFrom: 1.7, popMs: 80, shakePx: 2, shakeMs: 90, backing: null, backingPx: 0, backingAlpha: 0, fall: false, tiltRad: 0.08 },
  // 대시: 청록. 옆으로 길게 미끄러진다.
  dash: { fontPx: 20, fillTop: 0xf2fdff, fillBottom: 0x8fe8ff, stroke: INK, strokePx: 5, lifeMs: 540, risePx: 18, driftPx: 24, popFrom: 1.7, popMs: 80, shakePx: 1.5, shakeMs: 70, backing: null, backingPx: 0, backingAlpha: 0, fall: false, tiltRad: 0.1 },
  // 3타 피니셔: 둥근 밀랍 봉인 위에. 박힘은 1.6 — 1.9 는 첫 프레임에 두꺼운 테두리·그림자가 검은 판으로 뭉쳤다(VFX 리뷰).
  // 받침 64 → 38(×0.6, 2026-09-27): 머리만 한 받침이 쓰러진 몸을 덮었다.
  finisher: { fontPx: 26, fillTop: PALETTE.fxWarmCream, fillBottom: PALETTE.accent, stroke: INK, strokePx: 6, lifeMs: 700, risePx: 28, driftPx: 10, popFrom: 1.6, popMs: 90, shakePx: 3, shakeMs: 130, backing: "wax", backingPx: 38, backingAlpha: 1, fall: false, tiltRad: 0.07 },
  counter: { fontPx: 25, fillTop: PALETTE.fxWarmCream, fillBottom: PALETTE.loot, stroke: INK, strokePx: 6, lifeMs: 680, risePx: 26, driftPx: 10, popFrom: 1.6, popMs: 90, shakePx: 3, shakeMs: 120, backing: "wax", backingPx: 37, backingAlpha: 1, fall: false, tiltRad: 0.06 },
  // 금고지기 결판: 전투에서 가장 큰 숫자. 받침은 숫자보다 조금만 크게(60) — 80 은 폭발이 주인공이 돼
  // 쓰러지는 몸·이름표를 덮었다(VFX 리뷰 defeat/016–045). 700ms 면 슬로모 hold 와 release 앞부분을 덮는다.
  "boss-ko": { fontPx: 36, fillTop: PALETTE.fxWarmCream, fillBottom: PALETTE.accent, stroke: INK, strokePx: 7, lifeMs: 700, risePx: 30, driftPx: 8, popFrom: 1.8, popMs: 100, shakePx: 4, shakeMs: 180, backing: "wax", backingPx: 36, backingAlpha: 1, fall: false, tiltRad: 0.05 },
  // 플레이어 피격: 흰 → 연분홍 글자를 진홍 받침 위에(빨강 위 빨강은 안 읽혔다). 위로 튀었다가 떨어진다.
  player: { fontPx: 18, fillTop: PALETTE.white, fillBottom: 0xffb3c1, stroke: WINE, strokePx: 4, lifeMs: 560, risePx: 18, driftPx: 12, popFrom: 1.7, popMs: 80, shakePx: 2.5, shakeMs: 110, backing: "hurt", backingPx: 34, backingAlpha: 0.8, fall: true, tiltRad: 0.1 },
  "player-heavy": { fontPx: 21, fillTop: PALETTE.white, fillBottom: 0xffb3c1, stroke: WINE, strokePx: 5, lifeMs: 620, risePx: 22, driftPx: 14, popFrom: 1.8, popMs: 80, shakePx: 3.5, shakeMs: 150, backing: "hurt", backingPx: 42, backingAlpha: 0.8, fall: true, tiltRad: 0.12 },
})

/** 치명(처벌 타격·쓰러뜨림): 한 단 크게, 흔들림을 더하고, 배경이 없던 티어엔 밀랍 봉인을 깐다. */
export function criticalDamageNumberStyle(style: DamageNumberStyle): DamageNumberStyle {
  return {
    ...style,
    fontPx: Math.round(style.fontPx * 1.15),
    popFrom: style.popFrom + 0.15,
    shakePx: Math.max(style.shakePx, 2.5),
    shakeMs: Math.max(style.shakeMs, 110),
    lifeMs: style.lifeMs + 60,
    backing: style.backing ?? "wax",
    // 받침은 글자의 1.44 배(옛 2.4 배 × 0.6). 3.4 배는 처벌 강타 받침이 피니셔보다 커져 무게 순서가 뒤집혔다.
    backingPx: style.backing === null ? Math.round(style.fontPx * CRITICAL_BACKING_SHARE) : style.backingPx,
    backingAlpha: style.backing === null ? 1 : style.backingAlpha,
  };
}

/**
 * 티어의 무게(같은 몸에서 더 무거운 숫자가 박히면 가벼운 앞 숫자를 걷는다 — 결판은 혼자 선다). 저택·마을 뷰가 함께 읽는다.
 */
export const DAMAGE_NUMBER_TIER_WEIGHT: Readonly<Record<DamageNumberTier, number>> = Object.freeze({
  absorbed: 0, light: 1, dash: 2, heavy: 2, counter: 3, finisher: 3, "boss-ko": 4, player: 1, "player-heavy": 2,
});

export interface DamageNumberSpec {
  readonly tier: DamageNumberTier;
  readonly critical: boolean;
  readonly label: string;
  /** 숫자가 박히는 월드 좌표(접촉점 위). */
  readonly at: Vec2;
  /** 흐르는 방향(맞은 몸이 밀려나는 쪽). */
  readonly facing: -1 | 1;
  /** 같은 몸에 쌓이는 숫자를 위로 비키게 하는 열쇠. */
  readonly targetId: string;
  /** 몸 중심에서 옆으로 비키는 거리(월드 px). 뷰가 화면 가장자리를 보고 쪽을 고른다. */
  readonly sidePx: number;
}

/** 치명 받침 지름 ÷ 글자 크기. */
const CRITICAL_BACKING_SHARE = 1.44;

/**
 * 공개 결투 상대(금고지기)의 숫자가 박히는 높이(발바닥 기준, 머리 옆). 호출자가 키 배율을 곱한다.
 * 머리 바로 위는 보스 이름표·체력 막대 자리다 — 거기 박으면 결판 숫자가 머리와 막대를 덮었다.
 */
export const DAMAGE_NUMBER_LIFT_PX = 54;
/**
 * 표준 경비의 숫자 높이: 머리 꼭대기(서 있는 키 32 × 2.475 ≈ 79px)에서 40px 위. 머리 옆(54)에 박으면 피니셔
 * 받침이 쓰러지는 몸 위에 36 프레임 넘게 앉았다(2026-09-27 C-C-C 캡처). 옆으로 비키는 거리는 그대로라 머리 위
 * 상태 기호(눈)와 나란히 선다.
 */
export const DAMAGE_NUMBER_GUARD_LIFT_PX = 79 + 40;
export const DAMAGE_NUMBER_SIDE_PX = 24;
/** 금고지기처럼 큰 몸은 더 옆으로 비킨다 — 쓰러지는 몸통을 숫자가 덮지 않게. */
export const DAMAGE_NUMBER_BOSS_SIDE_PX = 44;
/** 플레이어 숫자는 머리 위로 — 옆에 박으면 곧바로 이어지는 반격 자세를 가린다. */
export const DAMAGE_NUMBER_PLAYER_LIFT_PX = 64;
/** 화면 가장자리와 숫자 사이의 최소 여백(월드 px). */
export const DAMAGE_NUMBER_VIEW_MARGIN_PX = 8;

/** HUD 체력 행과 같은 반올림(소수 첫째 자리). 0.05 아래는 0.1 로 올린다 — 들어간 피해가 "0" 으로 보이면 안 된다. */
function formatHp(damage: number): string {
  return `${Math.max(0.1, Number(Math.max(0, damage).toFixed(1)))}`;
}

export function formatPlayerDamage(damage: number): string {
  return `-${formatHp(damage)}`;
}

export function formatEnemyDamage(damage: number): string {
  return formatHp(damage);
}

export interface DamageNumberViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 숫자가 박히는 쪽: 맞은 몸이 밀려나는 쪽(때린 사람을 가리지 않는다). 그쪽 화면 가장자리까지
 * 여유가 없으면 반대쪽으로 비킨다 — 벽에 몰린 보스의 숫자가 화면 밖으로 잘렸다(메인 세션 리뷰).
 */
export function damageNumberSide(
  at: Vec2,
  facing: -1 | 1,
  view: DamageNumberViewRect,
  reachPx: number,
): -1 | 1 {
  const room = facing === 1 ? view.x + view.width - at.x : at.x - view.x;
  return room < reachPx ? (facing === 1 ? -1 : 1) : facing;
}

/** 숫자 중심을 화면 안으로 끌어들인다(반폭·반높이 + 여백). 화면이 숫자보다 좁으면 가운데. */
export function clampDamageNumberToView(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  view: DamageNumberViewRect,
  marginPx = DAMAGE_NUMBER_VIEW_MARGIN_PX,
): Vec2 {
  const clamp = (value: number, min: number, max: number) => (min > max ? (min + max) / 2 : Math.min(max, Math.max(min, value)));
  return {
    x: clamp(x, view.x + halfWidth + marginPx, view.x + view.width - halfWidth - marginPx),
    y: clamp(y, view.y + halfHeight + marginPx, view.y + view.height - halfHeight - marginPx),
  };
}

/**
 * 이번 스텝의 사건에서 숫자를 뽑는다. 적은 `CombatHit.damage`, 플레이어는 `PlayerDamaged.damage` 만 믿는다 —
 * 피해가 없거나 0 인 사건(막힘·스침·티어만 있는 옛 리플레이)은 숫자를 띄우지 않는다.
 */
export function damageNumberSpecs(
  events: readonly SimEvent[],
  encounterBoss: (guardId: string) => boolean = () => false,
  victimScale: (guardId: string) => number = () => 1,
): DamageNumberSpec[] {
  const defeated = new Set<string>();
  const countered = new Set<string>();
  // 금고지기 결판(`KeeperKeyStolen`)은 숫자를 띄우지 않는다 — 날아가는 열쇠와 쓰러지는 몸이 결말을 말한다.
  // 결판 숫자는 열쇠 궤적 위에 떠 흰 번쩍임을 하나 더 얹었다(2026-09-27 보스 필름 리뷰).
  const disarmed = new Set<string>();
  let struckTier: string | undefined;
  let struckFacing: -1 | 1 | undefined;
  for (const event of events) {
    if (event.kind === "CombatDefeated") defeated.add(event.guardId);
    if (event.kind === "PerfectCounter") countered.add(event.guardId);
    if (event.kind === "KeeperKeyStolen") disarmed.add(event.guardId);
    if (event.kind === "PlayerStruck") {
      struckTier = event.tier;
      struckFacing = event.facing === -1 ? -1 : event.facing === 1 ? 1 : undefined;
    }
  }
  const specs: DamageNumberSpec[] = [];
  for (const event of events) {
    if (event.kind === "CombatHit") {
      if (event.damage === undefined || !(event.damage > 0) || disarmed.has(event.guardId)) continue;
      const ko = defeated.has(event.guardId);
      const boss = encounterBoss(event.guardId);
      const tier: DamageNumberTier = ko && boss ? "boss-ko"
        : countered.has(event.guardId) ? "counter"
          : event.tier === "finisher" ? "finisher"
            : event.absorbed === true ? "absorbed"
              : event.tier === "heavy" ? "heavy"
                : event.tier === "dash" ? "dash"
                  : "light";
      const lift = boss ? DAMAGE_NUMBER_LIFT_PX * victimScale(event.guardId) : DAMAGE_NUMBER_GUARD_LIFT_PX;
      specs.push({
        tier,
        // 치명 가산은 평타·강타·대시에만. 피니셔·반격·결판은 이미 가장 무거운 모양이라 곱하면 화면을 덮는다.
        critical: (tier === "light" || tier === "heavy" || tier === "dash") && (event.punish || ko),
        label: formatEnemyDamage(event.damage),
        at: { x: event.at.x, y: event.at.y - lift },
        facing: event.facing === -1 ? -1 : 1,
        targetId: event.guardId,
        sidePx: boss ? DAMAGE_NUMBER_BOSS_SIDE_PX : DAMAGE_NUMBER_SIDE_PX,
      });
    } else if (event.kind === "PlayerDamaged") {
      if (!(event.damage > 0)) continue;
      const heavy = struckTier === "heavy" || struckTier === "dash";
      specs.push({
        tier: heavy ? "player-heavy" : "player",
        critical: false,
        label: formatPlayerDamage(event.damage),
        at: { x: event.at.x, y: event.at.y - DAMAGE_NUMBER_PLAYER_LIFT_PX },
        facing: struckFacing ?? 1,
        targetId: "player",
        sidePx: 8,
      });
    }
  }
  return specs;
}

export function damageNumberStyle(spec: Pick<DamageNumberSpec, "tier" | "critical">): DamageNumberStyle {
  const base = DAMAGE_NUMBER_STYLES[spec.tier];
  return spec.critical ? criticalDamageNumberStyle(base) : base;
}

export interface DamageNumberFrame {
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly alpha: number;
  readonly rotation: number;
  /** 배경 원화. alpha 0 이면 숨긴다. */
  readonly backingScale: number;
  readonly backingAlpha: number;
  readonly backingRotation: number;
}

/** 박힌 뒤 눌리는 바닥 배율. 1 아래로 한 번 눌렸다 되튀어야 "쾅" 하고 앉는다. */
const POP_SQUASH = 0.86;
const SETTLE_MS = 90;
/** 모션 감소: 박힘·흔들림·호를 지우고 제자리에서 짧게 뜨고 사라진다. */
const REDUCED = Object.freeze({ popFrom: 1.15, riseRatio: 0.35, lifeRatio: 0.8 });

/**
 * `ageMs` 시각의 숫자 한 장. 순수 함수 — 같은 나이·방향이면 같은 그림이다(흔들림도 16ms 박자로 결정적).
 * `stackIndex` 는 같은 몸에 먼저 뜬 살아 있는 숫자 수 — 그만큼 위에서 시작해 겹치지 않는다.
 */
export function damageNumberFrame(
  style: DamageNumberStyle,
  ageMs: number,
  facing: -1 | 1,
  stackIndex = 0,
  reducedMotion = false,
): DamageNumberFrame | null {
  const lifeMs = reducedMotion ? style.lifeMs * REDUCED.lifeRatio : style.lifeMs;
  if (ageMs < 0 || ageMs >= lifeMs) return null;
  const p = ageMs / lifeMs;
  const popFrom = reducedMotion ? REDUCED.popFrom : style.popFrom;
  let scale: number;
  if (ageMs < style.popMs) {
    scale = popFrom + (POP_SQUASH - popFrom) * easeOutCubic(ageMs / style.popMs);
  } else if (ageMs < style.popMs + SETTLE_MS) {
    scale = POP_SQUASH + (1 - POP_SQUASH) * easeOutBack((ageMs - style.popMs) / SETTLE_MS);
  } else {
    scale = 1;
  }
  // 마지막 30% 에 사라지며 살짝 줄어든다.
  const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  scale *= 0.85 + 0.15 * fade;
  const rise = style.risePx * (reducedMotion ? REDUCED.riseRatio : 1);
  const stackPx = stackIndex * style.fontPx * 0.9;
  let dy: number;
  if (style.fall && !reducedMotion) {
    // 위로 튀었다(35% 에 정점) 떨어진다 — 포물선. 끝에서는 시작점보다 조금 아래.
    const peak = 0.35;
    const u = p / peak;
    dy = p < peak ? -rise * (2 * u - u * u) : -rise + rise * 1.4 * ((p - peak) / (1 - peak)) ** 2;
  } else {
    dy = -rise * easeOutCubic(p);
  }
  const drift = reducedMotion ? 0 : facing * style.driftPx * easeOutCubic(p);
  let shakeX = 0;
  let shakeY = 0;
  if (!reducedMotion && style.shakeMs > 0 && ageMs < style.shakeMs) {
    const decay = 1 - ageMs / style.shakeMs;
    const beat = Math.floor(ageMs / 16);
    shakeX = (beat % 2 === 0 ? 1 : -1) * style.shakePx * decay;
    shakeY = (beat % 3 === 0 ? -1 : 0.5) * style.shakePx * 0.6 * decay;
  }
  // 받침은 첫 프레임부터 거의 다 큰 채로 선다(0.85 → 1.1). 0.35 에서 자라면 숫자보다 두 프레임 늦게 읽혔다.
  const backingIn = Math.min(1, ageMs / 90);
  const backingAlpha = style.backing === null ? 0
    : style.backingAlpha * (p < 0.45 ? 1 : Math.max(0, 1 - (p - 0.45) / 0.4)) * (reducedMotion ? 0.7 : 1);
  return {
    dx: drift + shakeX,
    dy: dy - stackPx + shakeY,
    scale,
    alpha: Math.max(0, Math.min(1, fade)),
    rotation: reducedMotion ? 0 : -facing * style.tiltRad * (1 - 0.5 * p),
    backingScale: reducedMotion ? 1 : 0.85 + 0.25 * easeOutBack(backingIn) + 0.1 * p,
    backingAlpha,
    backingRotation: reducedMotion ? 0 : facing * (0.25 * easeOutCubic(p) - 0.12),
  };
}
