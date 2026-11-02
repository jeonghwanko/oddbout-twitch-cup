/**
 * 괴도 무기 개조의 손맛 — 개조 하나의 무게(0..1)에서 멈춤·카메라·섬광·조각·소리를 한 식으로 뽑는다.
 *
 * 18개 개조마다 멈춤·흔들림·줌을 손으로 적으면 서로 어긋난다(당기기가 발차기보다 세게 흔들린다 등).
 * 여기서는 개조의 **등급**(impact·control·stealth)과 **무게** w 하나만 적고, 나머지는 전부 아래 식이 정한다.
 *
 * 식의 근거:
 * - 멈춤은 로그 보간이다. 시간 길이의 체감은 베버–페히너 법칙을 따라 비율로 느껴진다 — 40→80ms 와
 *   80→160ms 가 같은 "한 단"이다. 양 끝은 기존 전투 표에서 왔다: 40ms 는 막힘(`CombatBlocked`),
 *   150ms 는 피니셔(`HIT_STOP_BY_TIER.finisher`). 결과는 60Hz 프레임으로 반올림한다(반 프레임은 안 보인다).
 * - 흔들림도 같은 로그 보간(2px → 10px, 10px 는 반격·금고지기 결판과 같은 전투 최대치)이고, w < 0.5 는 흔들지
 *   않는다. 평타를 흔들지 않는 전투 규칙과 같다 — 약한 사건마다 화면이 떨면 판독이 무너진다.
 * - 펀치 줌은 w³ 이다. 작은 사건에는 거의 0, 결정적인 한 방에만 1.05 안팎(피니셔 1.07 보다 작게)이 붙는다.
 * - 잠입(stealth) 개조는 멈추지도 흔들지도 않는다. 숨는 흐름을 끊는 피드백은 잠입의 적이다 — 대신
 *   차가운(cool) 색, 작은 조각, 낮은 소리로 "조용히 됐다" 를 말한다.
 *
 * 형태는 `WeaponModFx`, 소리는 `render/audio/WeaponModAudio` 가 이 표를 읽는다. sim 판정과 무관하다.
 * FX 시트 CLI 가 node 로 직접 읽으므로 값 import 는 `.ts` 확장자로만 쓴다.
 */

import type { ToolId } from "../../sim/ToolRules.ts";
import type { WeaponModId } from "../../sim/WeaponModRules.ts";
import type { CombatCameraBeat } from "./CombatPresentation.ts";

/** impact: 적을 치는 한 방. control: 적을 묶거나 움직이는 순간. stealth: 들키지 않게 해 주는 조용한 도움. */
export type WeaponModFeelClass = "impact" | "control" | "stealth";

/** 개조 형태의 무늬. 무기마다 실루엣이 달라야 글자 없이 무엇이 터졌는지 읽힌다. */
export type WeaponModMotif =
  | "blade" // 단도: 가늘고 곧은 빛줄기 + 네 갈래 반짝임
  | "blade-quiet" // 단도(잠입): 땅에 박힌 칼날의 짧은 울림 고리
  | "smoke-burst" // 연막: 크게 퍼지는 부드러운 고리 + 끊어진 사슬 조각
  | "smoke-sting" // 연막(눈물): 작은 퍼프 + 떨어지는 방울
  | "smoke-veil" // 연막(장막): 발밑의 눌린 고리
  | "gear-pop" // 유인구: 톱니 고리 + 불꽃
  | "gear-pick" // 유인구 회수: 손에 붙는 작은 반짝임
  | "gear-chirp" // 유인구(도망): 짧은 음표 점
  | "wire-yank" // 와이어: 플레이어 쪽으로 모이는 속도선
  | "wire-kick" // 와이어 킥: 진행 방향 속도선 + 접촉 별
  | "wire-hook" // 와이어(수레): 갈고리 반짝임
  | "mask-slash" // 가면 기습: 금빛 초승달 베기 + 반짝임
  | "mask-shimmer" // 가면(군중): 얼굴 높이의 옅은 반짝임
  | "mask-vanish" // 가면(추격): 안쪽으로 모이는 차가운 반짝임
  | "snare-loop" // 올가미: 발목을 감는 납작한 고리
  | "snare-chain" // 연쇄 올가미: 옆으로 번지는 두 고리
  | "snare-ping"; // 경보 올가미: 멀리서 퍼지는 차가운 파문

export interface WeaponModFeelSpec {
  readonly cls: WeaponModFeelClass;
  /** 0..1 체감 무게. 모든 파생값의 유일한 입력이다. */
  readonly weight: number;
  readonly motif: WeaponModMotif;
  /** 형태가 터지는 높이. 발목(올가미)·몸통·얼굴. 이벤트 좌표(발바닥) 위로 올리는 px. */
  readonly liftPx: number;
  /**
   * 제어 개조가 경비 몸에 직접 닿는가(당기기·올가미·포박 끊기). 몸에 닿는 제어는 한 단 길게(50ms),
   * 떨어진 자리에서 터지는 제어(딱총·눈물 연막·수레)는 짧게(33ms) 멈춘다 — 몸에 안 닿는 사건이 평타만큼
   * 세계를 세우면 입력 지연으로 느껴진다(2026-09-29 애니메이터 리뷰).
   */
  readonly contact?: boolean;
  /**
   * 무게가 실리는 순간. `hit` 은 발동(던짐)과 결과(박힘)가 떨어진 개조 — 던질 때는 짧은 손끝 박자만 주고,
   * 멈춤·카메라 전체는 같은 경비의 다음 `CombatHit`(`viaMod`)이 받는다. 없으면 발동 순간이다.
   */
  readonly payoff?: "hit";
}

/**
 * 개조별 등급·무게. 무게는 "이 순간이 전투의 흐름을 얼마나 바꾸는가" 의 순서다:
 * 결정타(킥 0.9) > 원거리 반격(0.85) > 기습·연쇄(0.8) > 적을 끌어오거나 포박을 끊음(0.7) > 넘어뜨림(0.65)
 * > 터뜨림(0.6) > 공격 끊기(0.55) > 추격 끊기(0.5) > 물건 끌기(0.45) > 잠입 도움(≤ 0.2).
 */
export const WEAPON_MOD_FEEL: Readonly<Record<WeaponModId, WeaponModFeelSpec>> = Object.freeze({
  "dagger-lamp-shot": { cls: "stealth", weight: 0.2, motif: "blade-quiet", liftPx: 0 },
  "dagger-counter-throw": { cls: "impact", weight: 0.85, motif: "blade", liftPx: 26, payoff: "hit" },
  "dagger-ringing-blade": { cls: "stealth", weight: 0.12, motif: "blade-quiet", liftPx: 2 },
  "smoke-escape": { cls: "control", weight: 0.7, motif: "smoke-burst", liftPx: 24, contact: true },
  "smoke-tear-gas": { cls: "control", weight: 0.55, motif: "smoke-sting", liftPx: 34 },
  "smoke-veil-step": { cls: "stealth", weight: 0.05, motif: "smoke-veil", liftPx: 2 },
  "mouse-recover": { cls: "stealth", weight: 0.2, motif: "gear-pick", liftPx: 6 },
  "mouse-firecracker": { cls: "control", weight: 0.6, motif: "gear-pop", liftPx: 6 },
  "mouse-runaway": { cls: "stealth", weight: 0.1, motif: "gear-chirp", liftPx: 6 },
  "wire-pull": { cls: "control", weight: 0.7, motif: "wire-yank", liftPx: 26, contact: true },
  "wire-kick": { cls: "impact", weight: 0.9, motif: "wire-kick", liftPx: 26 },
  "wire-cart-hook": { cls: "control", weight: 0.45, motif: "wire-hook", liftPx: 18 },
  // 등 높이(28px)에서 X 로 벤다 — 발목에 두면 납작한 고리 하나로 읽혔다(2026-09-29 VFX 리뷰).
  "mask-ambush": { cls: "impact", weight: 0.8, motif: "mask-slash", liftPx: 28 },
  "mask-crowd": { cls: "stealth", weight: 0.05, motif: "mask-shimmer", liftPx: 44 },
  // 사라지는 개조다 — 시선에서 빠지는 순간에 세계를 멈추면 거짓말이다(잠입으로 분류).
  "mask-chase": { cls: "stealth", weight: 0.3, motif: "mask-vanish", liftPx: 40 },
  "snare-throw": { cls: "control", weight: 0.65, motif: "snare-loop", liftPx: 3, contact: true },
  "snare-chain": { cls: "impact", weight: 0.8, motif: "snare-chain", liftPx: 3 },
  "snare-alarm": { cls: "stealth", weight: 0.2, motif: "snare-ping", liftPx: 3 },
} satisfies Record<WeaponModId, WeaponModFeelSpec>);

/** 60Hz 한 프레임(ms). */
export const WEAPON_MOD_FRAME_MS = 1000 / 60;

/** 무게 → 체감 곡선의 기준점. 양 끝은 기존 전투 표의 막힘·피니셔·반격이다. */
export const WEAPON_MOD_FEEL_CURVE = Object.freeze({
  /** 이 무게 아래는 멈추지 않는다(잠입 개조의 무게대). */
  hitStopFloorWeight: 0.2,
  hitStopMinMs: 40,
  hitStopMaxMs: 150,

  controlContactStopMs: 50,
  controlRemoteStopMs: 0,
  /**
   * 원거리 반격(반격 단도)이 박히는 순간. 근접 완벽 반격(`HIT_STOP_BY_TIER.counter`)과 같은 사건이라 같은 값이다 —
   * 테스트가 둘의 일치를 고정한다. 카메라도 전투 표의 `counter` 박자를 쓴다.
   */
  counterPayoffStopMs: 140,
  /** 평타(67ms)보다 짧게 멈추는 사건은 흔들지 않는다 — 전투 표의 "평타는 흔들지 않는다" 와 같은 문턱. */
  shakeFloorStopMs: 67,
  /** 밀기가 이만큼 크면 덜컹을 더하지 않는다. 전투 표는 큰 밀기와 큰 덜컹을 한 박자에 겹치지 않는다. */
  jerkPushCeilingPx: 9,
  /** 무게가 결과로 미뤄지는 개조(`payoff: "hit"`)의 발동 순간 멈춤: 손끝 2프레임. */
  releaseStopMs: 33,
  releasePushPx: 3,
  /** 이 무게 아래는 흔들지 않는다. */
  shakeFloorWeight: 0.5,
  shakeMinPx: 2,
  shakeMaxPx: 10,
  shakeBaseMs: 100,
  shakePerWeightMs: 140,
  /** 펀치 줌 = 1 + zoomGain·w³. */
  zoomGain: 0.07,
  /** 모션 감소 멈춤 = 이 비율(전투 `combatHitStopMs` 와 같은 0.45), 최소 24ms. */
  reducedHitStopShare: 0.45,
  reducedHitStopFloorMs: 24,
  /** 밀기 = pushMin + pushGain·w². */
  pushMinPx: 2,
  pushGainPx: 11,
  /** 덜컹은 impact 등급에서만. w 0.6 → 4px, w 1 → 12px. */
  jerkFromWeight: 0.6,
  jerkMinPx: 4,
  jerkMaxPx: 12,
  /** 조각 수 = chipsMin + chipsGain·w. */
  chipsMin: 3,
  chipsGain: 13,
  /**
   * 형태 큐의 수명 상한 = lifeMin + lifeGain·w. 무늬가 그려질 수 있는 가장 긴 시간이며, 무늬마다 실제로 보이는 시간은
   * 각 레시피의 박자(대개 이보다 짧다)가 정한다 — "강할수록 오래 보인다" 를 보장하는 값은 아니다(재검토).
   */
  lifeMinMs: 260,
  lifeGainMs: 340,
  /** 소리 크기 = gainMin + gainGain·w. 잠입 개조는 따로 낮게 둔다. */
  gainMin: 0.45,
  gainGain: 0.55,
  stealthGain: 0.32,
});

const C = WEAPON_MOD_FEEL_CURVE;

/** a..b 를 비율 u(0..1)로 로그 보간한다. 체감이 비율로 느는 양(시간·진폭)에 쓴다. */
export function logLerp(a: number, b: number, u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return a * (b / a) ** t;
}

const snapFrames = (ms: number): number => Math.round(Math.round(ms / WEAPON_MOD_FRAME_MS) * WEAPON_MOD_FRAME_MS);

const reducedStop = (ms: number, reducedMotion: boolean): number =>
  !reducedMotion || ms === 0 ? ms : Math.max(C.reducedHitStopFloorMs, Math.round(ms * C.reducedHitStopShare));

/**
 * 개조의 무게가 실리는 순간(결과)의 세계 멈춤(ms). impact 는 무게에서 로그 보간한 곡선, 제어는 몸에 닿느냐로
 * 두 단, 잠입은 0. 결과는 60Hz 프레임 배수다.
 */
export function weaponModPayoffStopMs(mod: WeaponModId, reducedMotion = false): number {
  const { cls, weight, contact } = WEAPON_MOD_FEEL[mod];
  if (cls === "stealth" || weight < C.hitStopFloorWeight) return 0;
  if (WEAPON_MOD_FEEL[mod].payoff === "hit") return reducedStop(C.counterPayoffStopMs, reducedMotion);
  if (cls === "control") return reducedStop(contact === true ? C.controlContactStopMs : C.controlRemoteStopMs, reducedMotion);
  const u = (weight - C.hitStopFloorWeight) / (1 - C.hitStopFloorWeight);
  return reducedStop(snapFrames(logLerp(C.hitStopMinMs, C.hitStopMaxMs, u)), reducedMotion);
}

/** 개조 발동 사건(`WeaponModTriggered`) 순간의 멈춤. 결과가 뒤로 미뤄지는 개조는 손끝 박자만 준다. */
export function weaponModHitStopMs(mod: WeaponModId, reducedMotion = false): number {
  if (WEAPON_MOD_FEEL[mod].payoff === "hit") return reducedStop(C.releaseStopMs, reducedMotion);
  return weaponModPayoffStopMs(mod, reducedMotion);
}

/** 개조 발동 사건 순간의 카메라. 결과가 뒤로 미뤄지는 개조는 손끝 방향 밀기만 — 절정은 결과가 가진다. */
export function weaponModTriggerCameraBeat(mod: WeaponModId): CombatCameraBeat {
  if (WEAPON_MOD_FEEL[mod].payoff !== "hit") return weaponModCameraBeat(mod);
  return { shakePx: 0, durationMs: 90, rollRad: 0, pushPx: C.releasePushPx, jerkPx: 0, zoom: 1, zoomInMs: 0, zoomOutMs: 0 };
}

/** 개조 하나의 결과(무게가 실리는 순간) 카메라. 전투 카메라(`COMBAT_CAMERA`)와 같은 모양이라 같은 적용기를 쓴다. */
export function weaponModCameraBeat(mod: WeaponModId): CombatCameraBeat {
  const { cls, weight } = WEAPON_MOD_FEEL[mod];
  const durationMs = Math.round(C.shakeBaseMs + C.shakePerWeightMs * weight);
  const stopMs = weaponModPayoffStopMs(mod);
  // 멈추지 않는 사건(잠입·떨어진 제어)은 카메라도 건드리지 않는다 — 멈춤과 카메라는 같은 무게를 말해야 한다.
  if (cls === "stealth" || stopMs === 0) {
    return { shakePx: 0, durationMs, rollRad: 0, pushPx: 0, jerkPx: 0, zoom: 1, zoomInMs: 0, zoomOutMs: 0 };
  }
  const shakePx = weight < C.shakeFloorWeight || stopMs < C.shakeFloorStopMs ? 0
    : Math.round(logLerp(C.shakeMinPx, C.shakeMaxPx, (weight - C.shakeFloorWeight) / (1 - C.shakeFloorWeight)) * 2) / 2;
  const zoom = 1 + C.zoomGain * weight ** 3;
  const pushPx = Math.round(C.pushMinPx + C.pushGainPx * weight * weight);
  const jerkPx = cls === "impact" && weight >= C.jerkFromWeight && pushPx < C.jerkPushCeilingPx
    ? Math.round(C.jerkMinPx + (C.jerkMaxPx - C.jerkMinPx) * (weight - C.jerkFromWeight) / (1 - C.jerkFromWeight)) : 0;
  return {
    shakePx,
    durationMs,
    // 화면 기울기는 결정타만 — 전투 표에서도 대시·피니셔·반격만 굴린다.
    rollRad: cls === "impact" && weight >= 0.85 ? 0.008 : 0,
    pushPx,
    jerkPx,
    zoom: Math.round(zoom * 1000) / 1000,
    zoomInMs: 0,
    zoomOutMs: Math.round(180 + 140 * weight),
  };
}

/** 맞은 몸의 반응 티어. 전투 반응 표(`VICTIM_REACTION_BY_TIER`)의 한 칸을 빌린다. */
export function weaponModVictimTier(mod: WeaponModId): "light" | "heavy" | "dash" {
  const { cls, weight } = WEAPON_MOD_FEEL[mod];
  if (cls === "impact" && weight >= 0.85) return "dash";
  return weight >= 0.6 ? "heavy" : "light";
}

/** 형태 수명(ms)과 조각 수. */
export function weaponModFxLifeMs(mod: WeaponModId): number {
  return Math.round(C.lifeMinMs + C.lifeGainMs * WEAPON_MOD_FEEL[mod].weight);
}

export function weaponModChipCount(mod: WeaponModId): number {
  return Math.round(C.chipsMin + C.chipsGain * WEAPON_MOD_FEEL[mod].weight);
}

/** 소리 크기 배율(0..1). */
export function weaponModGain(mod: WeaponModId): number {
  const { cls, weight } = WEAPON_MOD_FEEL[mod];
  return cls === "stealth" ? C.stealthGain : C.gainMin + C.gainGain * weight;
}

/**
 * 무기마다의 음 — 도(C) 장조 5음 음계에서 **완전5도도 음계 안에 있는 음**(C·D·G·A)만 골랐다(E 는 5도가 B 라 뺐다).
 * 5음 음계는 어떤 두 음을 겹쳐도 반음 충돌이 없어,
 * 두 무기를 연달아 써도 화음으로 들린다. 개조 발동은 이 으뜸음에서 완전5도 위로 "열고",
 * 그 빈틈을 주먹으로 닫는 타격은 옥타브로 "닫는다"(`WeaponModAudio.toolOpeningCashVoices`).
 */
export const WEAPON_TOOL_KEY_HZ: Readonly<Record<ToolId, number>> = Object.freeze({
  // E5 는 완전5도가 B5 — 5음 음계 밖이라 연막의 닫는 옥타브(C6)와 반음으로 부딪혔다. A5(5도 E6)로 옮긴다.
  dagger: 880, // A5
  smoke: 523.25, // C5
  mouse: 783.99, // G5
  wire: 587.33, // D5
  mask: 440, // A4
  snare: 392, // G4
});

/** 완전5도·옥타브 비율(순정률). */
export const PERFECT_FIFTH = 3 / 2;
export const OCTAVE = 2;
