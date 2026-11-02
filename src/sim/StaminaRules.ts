import type { Motion, Pose, SimEvent, Vec2 } from "./types";
import type { Tuning } from "./tuning";
import { clamp } from "./geom";

/**
 * 스태미나 규칙.
 *
 * 스태미나로는 절대 죽지 않는다. 대신 0 이 되면 걷기가 강제되고 헐떡임 소음이 새어나간다.
 * 이것이 탐욕 → 중량 → 스태미나 → 비자발적 소음 → 발각으로 루프를 닫는 고리다.
 */

export interface StaminaState {
  readonly value: number;
  /** 마지막 소모 이후 경과. regenDelayMs 를 넘겨야 회복이 시작된다. */
  readonly sinceDrainMs: number;
  readonly pantingMs: number;
}

export interface StaminaContext {
  readonly pose: Pose;
  readonly motion: Motion;
  readonly loadRatio: number;
  readonly at: Vec2;
  readonly floor: number;
  readonly tuning: Tuning;
  /** 몸 끌기처럼 자세·이동 상태 밖에서 생기는 지속 소모. */
  readonly exertionDrainPerSec?: number;
  /** 은신처·환기구 안인가. 생략하면 자세로 판단한다. */
  readonly hidden?: boolean;
  /** Chain travel cannot earn idle/walk recovery until feet touch a surface. */
  readonly grappleAirborne?: boolean;
  /** 고리 사슬에 매달려 있다. 샹들리에 매달리기보다 훨씬 가벼운 `grapple.hangDrainPerSec` 를 쓴다. */
  readonly grappleHanging?: boolean;
}

export interface StaminaResult {
  readonly state: StaminaState;
  readonly events: readonly SimEvent[];
}

export function createStamina(tuning: Tuning): StaminaState {
  return { value: tuning.stamina.max, sinceDrainMs: tuning.stamina.regenDelayMs, pantingMs: 0 };
}

export function isExhausted(state: StaminaState): boolean {
  return state.value <= 0;
}

/** 현재 자세·이동에서 초당 소모량. 0 이면 회복 대상. */
export function drainPerSec(ctx: StaminaContext): number {
  const s = ctx.tuning.stamina;
  const loadFactor = 1 + ctx.tuning.carry.staminaDrainPerLoad * ctx.loadRatio;
  const exertion = ctx.exertionDrainPerSec ?? 0;
  switch (ctx.pose) {
    case "climb":
      return s.climbDrainPerSec * loadFactor + exertion;
    case "hang":
      return (ctx.grappleHanging ? ctx.tuning.grapple.hangDrainPerSec : s.hangDrainPerSec) * loadFactor + exertion;
    case "vent":
      return s.ventDrainPerSec * loadFactor + exertion;
    default:
      return (ctx.motion === "run" ? s.runDrainPerSec * loadFactor : 0) + exertion;
  }
}

function regenPerSec(ctx: StaminaContext): number {
  if (ctx.grappleAirborne) return 0;
  const s = ctx.tuning.stamina;
  if (ctx.pose === "hide") return s.hideRegenPerSec;
  if (ctx.motion === "still" || ctx.pose === "crouch") return s.idleRegenPerSec;
  if (ctx.motion === "walk") return s.walkRegenPerSec;
  return 0;
}

export function step(state: StaminaState, ctx: StaminaContext, dtMs: number): StaminaResult {
  const s = ctx.tuning.stamina;
  const dt = dtMs / 1000;
  const drain = drainPerSec(ctx);

  let value = state.value;
  let sinceDrainMs = state.sinceDrainMs;

  if (drain > 0) {
    value = Math.max(0, value - drain * dt);
    sinceDrainMs = 0;
  } else {
    sinceDrainMs += dtMs;
    if (sinceDrainMs >= s.regenDelayMs) {
      value = Math.min(s.max, value + regenPerSec(ctx) * dt);
    }
  }

  // 바닥나면 주기적으로 숨소리가 샌다.
  const events: SimEvent[] = [];
  const hidden = ctx.hidden ?? (ctx.pose === "hide" || ctx.pose === "vent");
  let pantingMs = state.pantingMs;
  if (value <= 0) {
    pantingMs += dtMs;
    if (pantingMs >= s.pantingIntervalMs) {
      pantingMs -= s.pantingIntervalMs;
      events.push({ kind: "PlayerExhausted", at: ctx.at });
      // 옷장 문이 닫힌 동안 숨소리는 밖으로 새지 않는다. 은신 중에도 헐떡임이 계속 파문을 내면
      // 경비가 매 파문마다 재자극돼 옷장 앞을 영원히 떠나지 못하는 무한 대치가 된다.
      // 지친 상태 자체(PlayerExhausted)는 그대로 알린다 — 숨을수록 회복되는 선택이 살아 있어야 한다.
      if (!hidden) {
        events.push({
          kind: "NoiseEmitted",
          at: ctx.at,
          floor: ctx.floor,
          radius: s.pantingNoiseRadius,
          source: "panting",
        });
      }
    }
  } else {
    pantingMs = 0;
  }

  return { state: { value: clamp(value, 0, s.max), sinceDrainMs, pantingMs }, events };
}

/** 즉발 소모 (점프, 착지 등). */
export function spend(state: StaminaState, amount: number): StaminaState {
  if (amount <= 0) return state;
  return { ...state, value: Math.max(0, state.value - amount), sinceDrainMs: 0 };
}

/** 완벽 회피처럼 이미 치른 비용의 일부를 즉시 돌려준다. 자연 회복 지연은 바꾸지 않는다. */
export function restore(state: StaminaState, amount: number, maximum: number): StaminaState {
  if (amount <= 0 || maximum <= 0) return state;
  const value = Math.min(maximum, state.value + amount);
  return { ...state, value, pantingMs: value > 0 ? 0 : state.pantingMs };
}
