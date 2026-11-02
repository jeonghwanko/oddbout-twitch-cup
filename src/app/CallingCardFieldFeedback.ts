import type { CallingCard } from "../sim/CallingCardRules";
import { loadRatio, totalWeight } from "../sim/CarryRules";
import { floorOfY, isInDark } from "../sim/MansionLayout";
import type { MansionLayout } from "../sim/MansionLayout";
import type { SimState } from "../sim/simulation";
import type { Tuning } from "../sim/tuning";
import { isInactive } from "../sim/GuardStatusRules";
import type { Locale } from "./Locale";

export type CallingCardFieldTone = "neutral" | "advantage" | "danger";

export interface CallingCardFieldContext {
  readonly inDark: boolean;
  readonly snuffedLampCount: number;
  readonly stolenCount: number;
  /** 전리품·대탈출로 활성화된 추격자 중 현재 왁스에 넘어진 수. */
  readonly trippedPursuerCount: number;
  readonly skill: number;
  readonly cleanRunThreshold: number;
  readonly cleanRunBonus: number;
  readonly loadRatio: number;
  readonly totalWeight: number;
  readonly maxWeight: number;
  readonly remainingRatio: number;
  readonly speedRatio: number;
  readonly inVent: boolean;
  readonly inSignatureRoom?: boolean;
  readonly nearbyCrowdCount?: number;
  readonly onGroundFloor?: boolean;
}

export interface CallingCardFieldFeedback {
  readonly text: string;
  readonly tone: CallingCardFieldTone;
}

/** HUD와 고정 스텝 기록기가 함께 쓰는 예고장 현장 상태 스냅샷. */
export function callingCardFieldContext(
  card: CallingCard | null,
  state: SimState,
  layout: MansionLayout,
  tuning: Tuning,
): CallingCardFieldContext {
  const load = loadRatio(state.carry, tuning);
  const trippedPursuerCount = card?.id === "wax"
    ? state.guards.filter((guard) =>
        !isInactive(guard)
        && guard.contractTripMs > 0
        && layout.guards.some((spawn) =>
          spawn.id === guard.id
          && (spawn.activationLootAnchorId !== undefined || spawn.activationRunPhase !== undefined),
        )
      ).length
    : 0;
  const playerFloor = floorOfY(state.player.y, tuning.world.floorHeightPx);
  const signature = layout.theme?.signatureRoom;
  const inSignatureRoom = signature !== undefined
    && playerFloor === signature.floor
    && state.player.x >= signature.fromX
    && state.player.x <= signature.toX;
  return Object.freeze({
    inDark: isInDark(
      layout,
      { x: state.player.x, y: state.player.y },
      state.mischief.snuffedLamps,
      tuning.mischief.snuffDarkMul,
    ),
    snuffedLampCount: state.mischief.snuffedLamps.length,
    stolenCount: state.run.stolen.length,
    trippedPursuerCount,
    skill: state.run.skill,
    cleanRunThreshold: tuning.skill.cleanRunThreshold,
    cleanRunBonus: tuning.skill.cleanRunBonus,
    loadRatio: load,
    totalWeight: totalWeight(state.carry),
    maxWeight: tuning.carry.maxWeight,
    remainingRatio: state.run.remainingMs / tuning.run.durationMs,
    speedRatio: Math.abs(state.player.vx) / tuning.movement.runSpeed,
    inVent: state.player.pose === "vent",
    inSignatureRoom,
    nearbyCrowdCount: state.crowds.filter((crowd) =>
      crowd.floor === playerFloor && Math.abs(crowd.x - state.player.x) <= 130
    ).length,
    onGroundFloor: playerFloor === layout.bands.length - 1,
  });
}

/** 예고장 효과를 현재 판정 상태에 맞는 한 줄짜리 현장 조언으로 바꾼다. */
export function callingCardFieldFeedback(
  card: CallingCard,
  context: CallingCardFieldContext,
  locale: Locale = "ko",
): CallingCardFieldFeedback {
  if (locale === "en") return englishCallingCardFieldFeedback(card, context);
  switch (card.id) {
    case "midnight":
      return context.inDark
        ? feedback("◆ 계약 활용 · 그림자 속에서 추가 경비를 우회 중", "advantage")
        : feedback("! 계약 경고 · 불빛 아래, 추가 경비에 노출", "danger");
    case "untouched": {
      const skill = Math.round(context.skill);
      const threshold = Math.round(context.cleanRunThreshold);
      return skill >= threshold
        ? feedback(`◆ 품격 확보 ${skill}/${threshold} · 정산 ×${context.cleanRunBonus} 준비`, "advantage")
        : feedback(`◇ 품격 ${skill}/${threshold} · 발각을 피하고 기술을 쌓으시오`, "neutral");
    }
    case "threeminutes": {
      const remaining = percent(context.remainingRatio);
      return remaining <= 30
        ? feedback(`! 시간 ${remaining}% · 속도 이점을 탈출에 쓰시오`, "danger")
        : feedback(`◆ 시간 ${remaining}% · 이동 가속과 적재 부담 완화 중`, "advantage");
    }
    case "lightson":
      return context.snuffedLampCount > 0
        ? feedback(`◆ 계약 역전 · 직접 만든 그림자 ${context.snuffedLampCount}곳`, "advantage")
        : feedback("◇ 자연 그림자 없음 · 등불을 꺼 퇴로 준비", "neutral");
    case "heavier": {
      const load = percent(context.loadRatio);
      const weight = `${Math.round(context.totalWeight)}/${Math.round(context.maxWeight)}kg`;
      return context.loadRatio >= 0.7
        ? feedback(`! 적재 ${load}% · ${weight} · 이동·소음 부담 증가`, "danger")
        : feedback(`◆ 적재 ${load}% · ${weight} · 한계 안에서 더 훔칠 여유`, "advantage");
    }
    case "wax": {
      const speed = percent(context.speedRatio);
      return context.speedRatio >= 0.55
        ? feedback(`! 관성 ${speed}% · 제동을 일찍 시작하시오`, "danger")
        : feedback("◆ 저속 제어 · 짧게 방향 전환 · 추격 증원은 왁스에 약함", "advantage");
    }
    case "stairwatch":
      return context.inVent
        ? feedback("◆ 계약 역이용 · 가속 환기구로 사다리 경비 우회", "advantage")
        : feedback("◇ 사다리마다 경비반장 · 환기구를 찾아 우회하시오", "neutral");
    case "fullhouse":
      return context.inSignatureRoom
        ? feedback(`◆ 만원 객석 · 근처 관객 ${context.nearbyCrowdCount ?? 0}명 뒤로 시야를 끊으시오`, "advantage")
        : feedback("◇ 대표 방 객석에 움직이는 엄폐 6명 · 접촉 소음 주의", "neutral");
    case "roofgreeting":
      return context.onGroundFloor
        ? feedback("◆ 역침투 완주 · 정문 퇴로와 전리품 동선을 확보", "advantage")
        : feedback("◇ 옥상에서 아래로 · 경비반장을 피해 저택을 역주행", "neutral");
    default: {
      const exhaustive: never = card;
      return exhaustive;
    }
  }
}

function englishCallingCardFieldFeedback(
  card: CallingCard,
  context: CallingCardFieldContext,
): CallingCardFieldFeedback {
  switch (card.id) {
    case "midnight":
      return context.inDark
        ? feedback("◆ CONTRACT ACTIVE · Extra guards cannot see you in shadow", "advantage")
        : feedback("! CONTRACT WARNING · Exposed to extra guards in the light", "danger");
    case "untouched": {
      const skill = Math.round(context.skill);
      const threshold = Math.round(context.cleanRunThreshold);
      return skill >= threshold
        ? feedback(`◆ Style secured ${skill}/${threshold} · Settlement ×${context.cleanRunBonus} ready`, "advantage")
        : feedback(`◇ Style ${skill}/${threshold} · Avoid detection and build skill`, "neutral");
    }
    case "threeminutes": {
      const remaining = percent(context.remainingRatio);
      return remaining <= 30
        ? feedback(`! Time ${remaining}% · Spend your speed advantage on the exit`, "danger")
        : feedback(`◆ Time ${remaining}% · Faster movement and lighter load penalty active`, "advantage");
    }
    case "lightson":
      return context.snuffedLampCount > 0
        ? feedback(`◆ CONTRACT TURNED · ${context.snuffedLampCount} shadows made by you`, "advantage")
        : feedback("◇ No natural shadows · snuff lights to prepare your exit", "neutral");
    case "heavier": {
      const load = percent(context.loadRatio);
      const weight = `${Math.round(context.totalWeight)}/${Math.round(context.maxWeight)}kg`;
      return context.loadRatio >= 0.7
        ? feedback(`! Load ${load}% · ${weight} · movement and noise penalty rising`, "danger")
        : feedback(`◆ Load ${load}% · ${weight} · room to steal more`, "advantage");
    }
    case "wax": {
      const speed = percent(context.speedRatio);
      return context.speedRatio >= 0.55
        ? feedback(`! Momentum ${speed}% · brake early`, "danger")
        : feedback("◆ Low-speed control · tap directions · pursuit reinforcements hate wax", "advantage");
    }
    case "stairwatch":
      return context.inVent
        ? feedback("◆ CONTRACT TURNED · Fast vent bypassed ladder guards", "advantage")
        : feedback("◇ Wardens at every ladder · find a vent around them", "neutral");
    case "fullhouse":
      return context.inSignatureRoom
        ? feedback(`◆ Full house · break sight behind ${context.nearbyCrowdCount ?? 0} nearby guests`, "advantage")
        : feedback("◇ 6 moving pieces of cover in the signature room · contact noise", "neutral");
    case "roofgreeting":
      return context.onGroundFloor
        ? feedback("◆ Reverse route complete · front-door exit and loot route secured", "advantage")
        : feedback("◇ From roof to ground · cross the mansion around the warden", "neutral");
    default: {
      const exhaustive: never = card;
      return exhaustive;
    }
  }
}

function percent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function feedback(text: string, tone: CallingCardFieldTone): CallingCardFieldFeedback {
  return Object.freeze({ text, tone });
}
