/**
 * 경비 판정의 큰 행동 상태와 강제 전이 규칙.
 *
 * `GuardPlanner`는 매 스텝의 이동 의도를 계산하고, 이 모듈은 포획·경직·각성처럼
 * 그 의도보다 우선하는 상태 전이를 결정한다. 화면도 같은 상태 의미를 읽을 수 있게
 * 상태별 이동 가능 여부와 주의 대상을 함께 둔다.
 */

import { archetypeOf, type GuardArchetypeId } from "./GuardArchetypes";
import type { Tuning } from "./tuning";
import { clamp01 } from "./geom";

export const GUARD_MODE_IDS = Object.freeze([
  "patrol",
  "scan",
  "investigate",
  "search",
  "chase",
  "capture-recovery",
  "recapture-windup",
  "recapture-chase",
  "pratfall",
] as const);

export type GuardMode = (typeof GUARD_MODE_IDS)[number];

export type GuardModeFamily = "routine" | "investigation" | "pursuit" | "capture" | "disabled";
export type GuardLocomotionRule = "planned" | "rooted";
export type GuardAttentionRule = "route" | "stimulus" | "target" | "locked";
/** UI가 이미지 ID를 추측하지 않고 상태의 플레이 의미만 번역하기 위한 표현 계약. */
export type GuardFeedbackCue =
  | "none"
  | "scanning"
  | "searching"
  | "pursuing"
  | "capture-recovery"
  | "recapture-warning"
  | "dazed";
export type GuardFeedbackProgress =
  | "none"
  | "scan"
  | "search-dwell"
  | "capture-recovery"
  | "recapture-windup";
export type GuardFeedbackPriority = "none" | "intent" | "urgent";

export interface GuardModeRule {
  readonly family: GuardModeFamily;
  /** 이 상태 자체가 이동을 허용하는가. 공격·상호작용 같은 추가 제약은 호출부가 더한다. */
  readonly locomotion: GuardLocomotionRule;
  /** 애니메이션·UI가 해석할 현재 주의 대상. */
  readonly attention: GuardAttentionRule;
  /** 외력 경직이 들어왔을 때 포획 연출을 보존할지, 넘어짐으로 전환할지. */
  readonly staggeredMode: "preserve" | "pratfall";
  /** 머리 위 한 칸이 알려야 할 플레이 의미. 실제 아틀라스 프레임은 app 계층이 고른다. */
  readonly feedbackCue: GuardFeedbackCue;
  /** 진행 호가 어느 상태 시간을 읽어야 하는가. */
  readonly feedbackProgress: GuardFeedbackProgress;
  /** 전투·지각 아이콘과 겹칠 때 이 상태 표현을 먼저 보여야 하는가. */
  readonly feedbackPriority: GuardFeedbackPriority;
}

/** 렌더가 경비 전체 상태를 의존하지 않고 같은 진행률 규칙을 읽기 위한 최소 계약. */
export interface GuardFeedbackProgressState {
  readonly mode: GuardMode;
  readonly archetypeId: GuardArchetypeId;
  readonly moving: boolean;
  readonly scanMs: number;
  readonly searchDwellMs: number;
  readonly staggerMs: number;
}

export const GUARD_MODE_RULES = Object.freeze({
  patrol: rule("routine", "planned", "route", "pratfall", "none", "none", "none"),
  scan: rule("routine", "rooted", "route", "pratfall", "scanning", "scan", "intent"),
  investigate: rule("investigation", "planned", "stimulus", "pratfall", "searching", "none", "intent"),
  search: rule("investigation", "planned", "stimulus", "pratfall", "searching", "search-dwell", "intent"),
  chase: rule("pursuit", "planned", "target", "pratfall", "pursuing", "none", "intent"),
  "capture-recovery": rule(
    "capture", "rooted", "locked", "preserve", "capture-recovery", "capture-recovery", "urgent",
  ),
  "recapture-windup": rule(
    "capture", "rooted", "target", "preserve", "recapture-warning", "recapture-windup", "urgent",
  ),
  "recapture-chase": rule("pursuit", "planned", "target", "pratfall", "pursuing", "none", "intent"),
  pratfall: rule("disabled", "rooted", "locked", "preserve", "dazed", "none", "urgent"),
} satisfies Record<GuardMode, GuardModeRule>);

export type GuardModeSignal =
  | { readonly kind: "planned"; readonly mode: GuardMode }
  | { readonly kind: "awoke" }
  | { readonly kind: "alerted" }
  | { readonly kind: "body-contact" }
  | { readonly kind: "contact-broken" }
  | { readonly kind: "recapture-primed" }
  | { readonly kind: "disengaged" }
  | { readonly kind: "staggered" };

/**
 * 우선순위 판정 하나를 상태 하나로 환원한다.
 *
 * 외부 시스템은 `mode: "chase"` 같은 대입 대신 어떤 사건이 일어났는지를 넘긴다.
 * 그러면 포획 상태 보존처럼 현재 상태에 의존하는 예외가 호출부마다 복제되지 않는다.
 */
export function transitionGuardMode(current: GuardMode, signal: GuardModeSignal): GuardMode {
  switch (signal.kind) {
    case "planned": return signal.mode;
    case "awoke": return "search";
    case "alerted": return "chase";
    case "body-contact": return "chase";
    case "contact-broken": return "capture-recovery";
    case "recapture-primed": return "recapture-windup";
    case "disengaged": return "patrol";
    case "staggered":
      return GUARD_MODE_RULES[current].staggeredMode === "preserve" ? current : "pratfall";
  }
}

export function guardModeRule(mode: GuardMode): GuardModeRule {
  return GUARD_MODE_RULES[mode];
}

export function guardModeAllowsTranslation(mode: GuardMode): boolean {
  return guardModeRule(mode).locomotion === "planned";
}

/** 머리 위 링과 상단 전술 HUD가 공유하는 상태 진행률 SSOT. */
export function guardFeedbackProgressOf(
  guard: GuardFeedbackProgressState,
  tuning: Tuning,
): number | null {
  switch (guardModeRule(guard.mode).feedbackProgress) {
    case "none":
      return null;
    case "scan": {
      const durationMs = archetypeOf(guard.archetypeId).scanDurationMs;
      return durationMs <= 0 ? null : clamp01(1 - guard.scanMs / durationMs);
    }
    case "search-dwell":
      return guard.moving || guard.searchDwellMs <= 0
        ? null
        : clamp01(1 - guard.searchDwellMs / Math.max(1, tuning.guard.searchDwellMs));
    case "capture-recovery":
      return clamp01(1 - guard.staggerMs / Math.max(1, tuning.guard.captureEscapeStaggerMs));
    case "recapture-windup":
      return clamp01(1 - guard.staggerMs / Math.max(1, tuning.guard.recaptureWindupMs));
  }
}

function rule(
  family: GuardModeFamily,
  locomotion: GuardLocomotionRule,
  attention: GuardAttentionRule,
  staggeredMode: GuardModeRule["staggeredMode"],
  feedbackCue: GuardFeedbackCue,
  feedbackProgress: GuardFeedbackProgress,
  feedbackPriority: GuardFeedbackPriority,
): GuardModeRule {
  return Object.freeze({
    family,
    locomotion,
    attention,
    staggeredMode,
    feedbackCue,
    feedbackProgress,
    feedbackPriority,
  });
}
