import type { NoiseSource, SimEvent, Vec2 } from "./types";
import type { MansionLayout } from "./MansionLayout";
import { floorOfY, floorSurfaceY, visionBlockers } from "./MansionLayout";
import type { Tuning } from "./tuning";
import { clamp, segmentIntersectsRect } from "./geom";

/**
 * 소음 전파.
 *
 * 소음은 시야각·차폐와 무관하다. 등 뒤에서 유인하는 플레이가 성립하는 이유가 이것이고,
 * 벽은 시선처럼 완전히 끊는 대신 감쇠만 시킨다.
 */

export interface NoiseEvent {
  readonly at: Vec2;
  readonly floor: number;
  readonly radius: number;
  /**
   * 유인 목적으로 낸 소리인가. 휘파람과 투척만 해당한다.
   *
   * 흘린 소리(발소리·착지)는 강도에 비례해 조금씩 의심을 올리지만, 유인은
   * 들리기만 하면 반드시 그쪽을 보러 가게 만든다. 탄이 3발뿐인 동사가
   * "운이 좋으면 통한다" 여서는 아무도 쓰지 않는다.
   */
  readonly lure: boolean;
  /** 착탄한 물체를 현장에서 잠시 확인해야 하는가. 현재는 태엽 유인구만 해당한다. */
  readonly inspectAtSource?: boolean;
}

/** 유인으로 취급하는 소음원. */
const LURE_SOURCES: readonly NoiseSource[] = ["whistle", "throw", "mouse"];

export interface Listener {
  readonly at: Vec2;
  readonly hearRange: number;
}

/** SimEvent 스트림에서 소음만 추려낸다. */
export function collectNoise(events: readonly SimEvent[]): NoiseEvent[] {
  const out: NoiseEvent[] = [];
  for (const event of events) {
    if (event.kind !== "NoiseEmitted") continue;
    out.push({
      at: event.at,
      floor: event.floor,
      radius: event.radius,
      lure: event.lure === true || LURE_SOURCES.includes(event.source),
      inspectAtSource: event.source === "mouse",
    });
  }
  return out;
}

/**
 * 한 소음이 한 청취자에게 닿는 강도 0..1.
 *
 * 소음의 radius 는 "이 거리까지는 들린다" 는 월드 스케일 값이고, 화면의 파문과 같은 값이다.
 * 플레이어가 자기 발소리 반경을 눈으로 보고 판단할 수 있어야 한다.
 */
export function hearStrength(
  noise: NoiseEvent,
  listener: Listener,
  layout: MansionLayout,
  tuning: Tuning,
): number {
  const dx = listener.at.x - noise.at.x;
  const dy = listener.at.y - noise.at.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const reach = Math.min(noise.radius, listener.hearRange);
  if (reach <= 0 || distance >= reach) return 0;

  let strength = clamp(1 - distance / reach, 0, 1);

  const listenerFloor = floorOfY(listener.at.y, tuning.world.floorHeightPx);
  if (listenerFloor !== noise.floor) strength *= tuning.noise.otherFloorFactor;

  // 사이에 벽이 있으면 감쇠. 끊지는 않는다.
  for (const blocker of visionBlockers(layout)) {
    if (blocker.kind !== "solid") continue;
    if (segmentIntersectsRect(noise.at, listener.at, blocker.rect)) {
      strength *= tuning.noise.wallFactor;
      break;
    }
  }

  return strength;
}

/** 한 층의 걷는 바닥면에서 소음이 닿는 가로 구간. */
export interface NoiseFloorSpan {
  readonly floor: number;
  /** 그 층 바닥면의 월드 y. */
  readonly surfaceY: number;
  /** 소음 중심 x 에서 좌우로 닿는 거리(px). 0 이면 그 층에는 닿지 않는다. */
  readonly halfWidth: number;
  /** `hearStrength` 의 층 감쇠(같은 층 1, 다른 층 `otherFloorFactor`). */
  readonly strength: number;
}

/**
 * 소음 원이 각 층의 바닥면을 자르는 구간. 횡스크롤에서는 소리가 원이 아니라 바닥을 타고 퍼지는 띠로
 * 읽힌다 — 바닥에 선 경비만 듣기 때문이다. `hearStrength` 와 같은 원(유클리드 거리)·같은 층 감쇠에서
 * 파생하므로, 조준 UI 와 착지 파동이 이 구간을 그리면 판정의 소리 반경과 어긋나지 않는다.
 * 경비 개인의 귀(`hearRange`)는 따로 자른다 — 누가 실제로 듣는지는 청취자 판정이 말한다.
 */
export function noiseFloorSpans(
  at: Vec2,
  radius: number,
  floorCount: number,
  tuning: Pick<Tuning, "world" | "noise">,
): NoiseFloorSpan[] {
  const { floorHeightPx, slabThicknessPx } = tuning.world;
  const origin = floorOfY(at.y, floorHeightPx);
  const reachFloors = Math.ceil(radius / Math.max(1, floorHeightPx));
  const spans: NoiseFloorSpan[] = [];
  for (let floor = Math.max(0, origin - reachFloors); floor <= Math.min(floorCount - 1, origin + reachFloors); floor += 1) {
    const surfaceY = floorSurfaceY(floor, floorHeightPx, slabThicknessPx);
    const dy = floor === origin ? 0 : surfaceY - at.y;
    const halfWidth = Math.sqrt(Math.max(0, radius * radius - dy * dy));
    if (halfWidth <= 0) continue;
    spans.push({ floor, surfaceY, halfWidth, strength: floor === origin ? 1 : tuning.noise.otherFloorFactor });
  }
  return spans;
}

export interface HeardResult {
  readonly strength: number;
  readonly at: Vec2 | null;
  /** 들린 소리 중 유인이 있었는가. */
  readonly lure: boolean;
  /** 실제로 선택된 가장 강한 유인 자극이 현장 확인을 요구하는가. */
  readonly inspectAtSource: boolean;
}

/** 이번 스텝의 모든 소음을 합산해 가장 강한 자극의 위치를 함께 돌려준다. */
export function listen(
  noises: readonly NoiseEvent[],
  listener: Listener,
  layout: MansionLayout,
  tuning: Tuning,
): HeardResult {
  let total = 0;
  let loudest = 0;
  let at: Vec2 | null = null;
  let lure = false;
  let inspectAtSource = false;

  for (const noise of noises) {
    const strength = hearStrength(noise, listener, layout, tuning);
    if (strength <= 0) continue;
    total += strength;
    // 유인은 세기와 무관하게 우선한다. 발소리에 묻혀 사라지면 동사가 아니게 된다.
    const wins = noise.lure ? !lure || strength > loudest : !lure && strength > loudest;
    if (wins) {
      loudest = strength;
      at = noise.at;
      inspectAtSource = noise.inspectAtSource === true;
    }
    lure = lure || noise.lure;
  }
  return { strength: total, at, lure, inspectAtSource };
}
