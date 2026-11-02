import post from "../../world/native-city-kuma-post.json";
import { villagePathFacing } from "../VillagePathFacing";
import type { NativeCityJsonShape } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint, CityViewId, NativeCityDefinition } from "../../world/NativeCityDefinition";
import { kumaScreenDelta, kumaScreenFacing, kumaWalkPhase } from "./NativeCityKumaGeometry";

/**
 * KUMA(곰 탈 장사)의 도시 경비 순찰(순수). 평소에는 중립으로 자리를 지키고, 말을 걸어 "싸우자"를 고르면
 * 적군이 되어 쫓아와 때린다(`stepKumaCombat` — `NativeCityKumaCombat`, 아래 다시 내보낸다). 대결이 끝나면 자리로 걸어 돌아가 순찰을 잇는다.
 *
 * - 순찰: 2~3 지점을 고리로 걷고, 지점마다 1.5~3초 바깥(순찰 중심 반대쪽)을 보고 선다.
 * - 걸음: 화면 속도(px/s)가 일정하다. 평면 속도는 그 방향의 화면 배율로 나눠 구한다(주인공 걸음의 옛 셈. 주인공은 2026-10-16부터
 *   모든 방향이 같은 바닥 속도다 — `nativeCityDirectionalSpeed`. 쿠마는 아직 바꾸지 않았다).
 *   보행 위상은 **화면에서 실제 움직인 거리 ÷ 화면 보폭**으로만 나아간다 — 발이 미끄러지지 않는다.
 * - 방향: 화면 이동 벡터로 8방향을 고른다(주인공 ortho 팩과 같은 `villagePathFacing`). 카메라가 돌면 같은 걸음도 다른 쪽을 본다.
 * - 경계: 주인공이 2.5보 안에 들면 멈춰 주인공 쪽(8방향)을 보고 선다. 3.5보 밖으로 나가야 순찰로 돌아간다(이력).
 * 한 보 = `nativeCityStepUnits`(대화 자리 1.5보와 같은 단위).
 */

export interface KumaPatrolPoint {
  readonly at: CityPoint;
  /** 그 지점에서 서 있는 시간. */
  readonly pauseMs: number;
  /** 서 있을 때 볼 평면 방향. 없으면 순찰 중심 → 지점(바깥). */
  readonly face?: CityPoint;
}

export interface KumaPatrolPlan {
  readonly viewId: CityViewId;
  /** 주인공 배우 키 대비 몸 키. */
  readonly bodyScale: number;
  readonly alertStrides: number;
  readonly releaseStrides: number;
  readonly points: readonly KumaPatrolPoint[];
}

/** 자리 SSOT: `native-city-kuma-post.json` 만 고치면 옮겨진다. */
export const NATIVE_CITY_KUMA_POST: KumaPatrolPlan = Object.freeze((post satisfies NativeCityJsonShape<KumaPatrolPlan>) as unknown as KumaPatrolPlan);

export type KumaPatrolMode = "pause" | "walk";

export interface KumaPatrolState {
  readonly point: CityPoint;
  /** 걷는 중이면 향하는 지점, 서 있으면 지금 선 지점. */
  readonly target: number;
  readonly mode: KumaPatrolMode;
  readonly pauseLeftMs: number;
  readonly alert: boolean;
  readonly facing: VillageFacing;
  /** 걷기 클립 위상 0..1. */
  readonly phase: number;
  /** 이번 걸음에 화면에서 움직인 px(0 이면 서 있음). */
  readonly movedPx: number;
}

export interface KumaPatrolInput {
  readonly dtMs: number;
  /** 같은 화면에 있는 주인공 발(평면). 없으면 경계하지 않는다. */
  readonly player: CityPoint | null;
  /** 지금(카메라 회전 반영) 투영. 선형 부분만 쓴다. */
  readonly projection: NativeCityDefinition["projection"];
  /** 지금 투영에서 한 보의 평면 단위(`nativeCityStepUnits`). */
  readonly stepUnits: number;
  /** 걷는 화면 속도(px/s). 보폭 ÷ 주기 — 원화 걸음 그대로. */
  readonly pacePxPerSec: number;
  /** 걷기 한 주기 화면 보폭(px). */
  readonly stridePx: number;
  /** 시간이 멈춘다(대화·감속 설정·창 숨김). 경계 돌아보기만 한다. */
  readonly frozen?: boolean;
}

/** 서 있을 때 볼 평면 방향: 지정값, 없으면 순찰 중심에서 그 지점 쪽. */
export function kumaOutward(plan: KumaPatrolPlan, index: number): CityPoint {
  const point = plan.points[index]!;
  if (point.face) return point.face;
  const n = plan.points.length;
  const cx = plan.points.reduce((s, p) => s + p.at[0], 0) / n, cy = plan.points.reduce((s, p) => s + p.at[1], 0) / n;
  return [point.at[0] - cx, point.at[1] - cy];
}

/** 경계 이력: 2.5보 안에 들면 켜지고, 3.5보 밖으로 나가야 꺼진다. */
export function kumaAlert(plan: KumaPatrolPlan, wasAlert: boolean, distanceUnits: number, stepUnits: number): boolean {
  if (!Number.isFinite(distanceUnits) || !(stepUnits > 0)) return false;
  return wasAlert ? distanceUnits <= plan.releaseStrides * stepUnits : distanceUnits <= plan.alertStrides * stepUnits;
}

export function createKumaPatrol(plan: KumaPatrolPlan = NATIVE_CITY_KUMA_POST): KumaPatrolState {
  const first = plan.points[0];
  if (!first) throw new Error("KUMA patrol needs at least one point");
  return { point: first.at, target: 0, mode: "pause", pauseLeftMs: first.pauseMs, alert: false, facing: "down", phase: 0, movedPx: 0 };
}

export function stepKumaPatrol(plan: KumaPatrolPlan, state: KumaPatrolState, input: KumaPatrolInput): KumaPatrolState {
  const dtMs = input.frozen || !Number.isFinite(input.dtMs) ? 0 : Math.max(0, input.dtMs);
  const player = input.player;
  const distance = player ? Math.hypot(player[0] - state.point[0], player[1] - state.point[1]) : Number.POSITIVE_INFINITY;
  const alert = kumaAlert(plan, state.alert, distance, input.stepUnits);
  if (alert) {
    // 멈춰 서서 주인공을 본다. 순찰 시계(서 있는 남은 시간·목표)는 그대로 두었다가 풀리면 이어 간다.
    const facing = player ? kumaScreenFacing(input.projection, [player[0] - state.point[0], player[1] - state.point[1]]) : null;
    return { ...state, alert, facing: facing ?? state.facing, movedPx: 0 };
  }
  if (state.mode === "pause") {
    const facing = kumaScreenFacing(input.projection, kumaOutward(plan, state.target)) ?? state.facing;
    const pauseLeftMs = state.pauseLeftMs - dtMs;
    if (pauseLeftMs > 0 || plan.points.length < 2) return { ...state, alert, facing, pauseLeftMs: Math.max(0, pauseLeftMs), movedPx: 0 };
    return { ...state, alert, facing, mode: "walk", target: (state.target + 1) % plan.points.length, pauseLeftMs: 0, movedPx: 0 };
  }
  const goal = plan.points[state.target]!.at;
  const delta: CityPoint = [goal[0] - state.point[0], goal[1] - state.point[1]];
  const screen = kumaScreenDelta(input.projection, delta), screenDistance = Math.hypot(screen[0], screen[1]);
  const budget = Math.max(0, input.pacePxPerSec) * dtMs / 1000;
  if (budget >= screenDistance) {
    const facing = kumaScreenFacing(input.projection, kumaOutward(plan, state.target)) ?? state.facing;
    return { ...state, alert, point: goal, mode: "pause", pauseLeftMs: plan.points[state.target]!.pauseMs, facing,
      phase: kumaWalkPhase(state.phase, screenDistance, input.stridePx), movedPx: screenDistance };
  }
  const t = budget / screenDistance;
  const facing = villagePathFacing(screen[0], screen[1]);
  return { ...state, alert, point: [state.point[0] + delta[0] * t, state.point[1] + delta[1] * t], facing,
    phase: kumaWalkPhase(state.phase, budget, input.stridePx), movedPx: budget };
}

/*
 * The fight half of this file lives in its own modules since 2026-10-13 (docs/Plan/2026-10-13-city-fight-hardening 6단계):
 * state `NativeCityKumaCombatState`, geometry `NativeCityKumaGeometry`, the swing's clock and reach `NativeCityKumaSwing`, taking blows
 * `NativeCityKumaHit`, the dash `NativeCityKumaDash`, the step `NativeCityKumaCombat`. Import their names from those modules (the
 * re-exports here were removed on 2026-10-13).
 */
