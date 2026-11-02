import type { LootAnchor, MansionLayout, VerticalLink } from "./MansionLayout";
import { floorOfY } from "./MansionLayout";
import type { RouteResult } from "./MansionRouteGraph";
import { routeGraph, shortestRoute } from "./MansionRouteGraph";
import type { WorldMetrics } from "./MansionValidator";
import { isLinkBlockedByLoad } from "./MovementRules";
import { canSteal, lootDef, stealDurationMs } from "./LootRules";
import type { LootId } from "./LootRules";
import type { Tuning } from "./tuning";
import { DEFAULT_TUNING } from "./tuning";

/**
 * 층 이동의 휴리스틱 비용 가중. 수직 1px 는 수평 1px 보다 1.6배 비싸다고 본다 —
 * 사다리 속도와 우회를 경로 탐색 없이 근사하는 값이다. 이제 거리 판단은 실제 경로
 * 그래프(`travelMs`)가 하고, 이 값은 그래프가 길을 못 찾을 때(PersonalArtifactRules 의
 * 대비책)만 쓴다. 같은 의미의 근사가 두 파일에 따로 생기지 않도록 소유는 여기 둔다.
 */
export const VERTICAL_TRAVEL_WEIGHT = 1.6;

/**
 * 저택을 도는 데 걸리는 시간.
 *
 * 제한시간이 3분인데 지형이 시드마다 달라지면, 어떤 시드에서는 지하 금고가 물리적으로
 * 왕복 불가능해질 수 있다. 그런 저택은 "훔칠 수 있었는데 실수했다" 가 아니라 "처음부터
 * 못 가져온다" 이고, 화면에서는 둘이 구분되지 않는다.
 *
 * 그래서 이동 비용을 규칙으로 계산한다. 경비는 세지 않는다 — 경비를 넣으면 모델이
 * 시뮬레이터가 되어 버리고, 여기서 알고 싶은 것은 **가장 잘 풀렸을 때조차 시간이
 * 되는가** 이기 때문이다. 그러므로 결과는 시간의 하한이자 수확의 상한이다.
 *
 * 속도·등반·적재 게이트는 전부 `MovementRules` 의 함수를 그대로 쓴다. 여기서 공식을
 * 다시 쓰면 모델과 게임이 조용히 갈라진다.
 */

export interface Spot {
  readonly floor: number;
  readonly x: number;
}

export interface RouteOptions {
  /** 위험을 무시하고 질주하는가. 시간의 하한을 보려면 true. */
  readonly sprint: boolean;
  /** 판정에 쓸 기술치. 부족하면 손대지 못하는 물건이 있다. */
  readonly skill: number;
  /** 적재율 상한. 적재 게이트가 걸린 탈출구를 노릴 때 쓴다. */
  readonly maxLoadRatio?: number;
  /** 안내원에게서 서비스 통로 열쇠를 얻었는가. */
  readonly areaKey?: boolean;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  sprint: true,
  skill: DEFAULT_TUNING.skill.start,
};

/**
 * 두 지점 사이 최소 이동 시간(ms). 이어지지 않으면 null.
 *
 * 레이아웃의 실제 이동 그래프(`MansionRouteGraph`) 위의 최단 경로다. 예전에는 "층 사이
 * 사다리는 하나뿐" 이라고 보고 층 번호만 따라 내려갔는데, 그 추정은 환기구·낙하 구멍을
 * 모르고, 한 층 쌍에 사다리가 둘이면 하나를 잃고, 층 안의 벽을 걸어서 통과했다. 사다리도
 * 왼쪽 모서리까지 걸어 rect 전체 높이(머리 여유 포함)를 꼭대기 배속 없이 올랐다 — sim 에서
 * 1.78초 걸리는 한 층 오르기를 2.65초로 셌다(지금 모델 1.75초).
 */
export function travelMs(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  from: Spot,
  to: Spot,
  loadRatio: number,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
): number | null {
  return shortestTravel(layout, world, tuning, from, to, loadRatio, options)?.ms ?? null;
}

/**
 * 거친 사다리·환기구·낙하·파쿠르 id 까지 함께 돌려준다. 테스트와 디버그 표시가
 * "왜 이 시간이냐" 를 확인하는 데 쓴다.
 */
export function shortestTravel(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  from: Spot,
  to: Spot,
  loadRatio: number,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
): RouteResult | null {
  const graph = routeGraph(layout, world, tuning, {
    sprint: options.sprint,
    areaKey: options.areaKey === true,
    loadRatio,
  });
  return graph === null ? null : shortestRoute(graph, from, to);
}

/**
 * HUD 탈출 예측·탈출 추천이 부르는 이름. 이제 `travelMs` 와 같은 그래프를 쓴다 — 밸런스
 * 모델과 화면의 예측이 서로 다른 길을 말하던 둘을 하나로 합쳤다.
 */
export function fastestTravelMs(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  from: Spot,
  to: Spot,
  loadRatio: number,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
): number | null {
  return travelMs(layout, world, tuning, from, to, loadRatio, options);
}

export interface HeistPlan {
  /** 훔친 순서. */
  readonly stolen: readonly { readonly anchorId: string; readonly lootId: LootId; readonly gold: number }[];
  readonly gold: number;
  readonly weight: number;
  readonly ms: number;
  readonly escapeId: string | null;
  /** 시간이 아니라 기술치가 막은 물건. 설계 의도이므로 실패가 아니다. */
  readonly skillLocked: readonly string[];
}

/**
 * 제한시간 안에 거둘 수 있는 근사 최선.
 *
 * 매 걸음 "지금 여기서 골드/시간 비율이 가장 좋고, 집은 뒤에도 탈출할 수 있는 것" 을
 * 고른다. 최적해가 아니라 성실한 플레이어의 근사다 — 최적 순회는 NP 이고, 알고 싶은
 * 것은 "이 저택이 3분에 얼마를 내주는가" 지 완벽한 경로가 아니다.
 */
export function greedyHeist(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
): HeistPlan {
  const spawnFloor = floorOfY(layout.spawn.y, world.floorHeightPx);
  const stolen: { anchorId: string; lootId: LootId; gold: number }[] = [];
  const skillLocked: string[] = [];
  const taken = new Set<string>();

  let at: Spot = { floor: spawnFloor, x: layout.spawn.x };
  let elapsed = 0;
  let weight = 0;

  for (;;) {
    const loadRatio = weight / tuning.carry.maxWeight;
    let best: { anchor: LootAnchor; cost: number; gold: number; escapeMs: number } | null = null;

    for (const anchor of layout.lootAnchors) {
      if (taken.has(anchor.id)) continue;
      const def = lootDef(anchor.lootId);
      if (!canSteal(def, options.skill, anchor.skillRequiredOverride)) {
        if (!skillLocked.includes(def.id)) skillLocked.push(def.id);
        continue;
      }
      if (def.gold <= 0) continue; // 미끼 상자는 수확이 아니다
      const cap = (options.maxLoadRatio ?? 1) * tuning.carry.maxWeight;
      if (weight + def.weight > cap) continue;

      const spot: Spot = { floor: floorOfY(anchor.at.y, world.floorHeightPx), x: anchor.at.x };
      const go = travelMs(layout, world, tuning, at, spot, loadRatio, options);
      if (go === null) continue;

      const grab = stealDurationMs(def, tuning);
      const nextLoad = (weight + def.weight) / tuning.carry.maxWeight;
      const out = bestEscape(layout, world, tuning, spot, nextLoad, options);
      if (out === null) continue;
      if (elapsed + go + grab + out.ms > tuning.run.durationMs) continue;

      const cost = go + grab;
      if (best === null || def.gold / cost > best.gold / best.cost) {
        best = { anchor, cost, gold: def.gold, escapeMs: out.ms };
      }
    }

    if (best === null) break;

    taken.add(best.anchor.id);
    const def = lootDef(best.anchor.lootId);
    stolen.push({ anchorId: best.anchor.id, lootId: def.id, gold: def.gold });
    weight += def.weight;
    elapsed += best.cost;
    at = { floor: floorOfY(best.anchor.at.y, world.floorHeightPx), x: best.anchor.at.x };
  }

  const finalLoad = weight / tuning.carry.maxWeight;
  const out = bestEscape(layout, world, tuning, at, finalLoad, options);

  return {
    stolen,
    gold: stolen.reduce((sum, s) => sum + s.gold, 0),
    weight,
    ms: elapsed + (out?.ms ?? 0),
    escapeId: out?.id ?? null,
    skillLocked,
  };
}

/** 지금 적재로 갈 수 있는 가장 가까운 탈출구. 적재 게이트가 걸린 곳은 뺀다. */
function bestEscape(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  from: Spot,
  loadRatio: number,
  options: RouteOptions,
): { id: string; ms: number } | null {
  let best: { id: string; ms: number } | null = null;

  for (const escape of layout.escapes) {
    if (escape.loadLimit !== undefined && loadRatio >= escape.loadLimit) continue;
    const spot: Spot = {
      floor: floorOfY(escape.rect.y + escape.rect.h - 1, world.floorHeightPx),
      x: escape.rect.x + escape.rect.w / 2,
    };
    const ms = travelMs(layout, world, tuning, from, spot, loadRatio, options);
    if (ms === null) continue;
    if (best === null || ms < best.ms) best = { id: escape.id, ms };
  }

  return best;
}

/**
 * 전리품 하나만 노리고 나가는 최소 시간. 이것이 제한시간을 넘으면 그 물건은
 * 누구도 가져올 수 없다 — 플레이어의 실수가 아니라 저택의 문제다.
 */
export function soloHeistMs(
  layout: MansionLayout,
  world: WorldMetrics,
  tuning: Tuning,
  anchor: LootAnchor,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS,
): number | null {
  const def = lootDef(anchor.lootId);
  const spawnFloor = floorOfY(layout.spawn.y, world.floorHeightPx);
  const spot: Spot = { floor: floorOfY(anchor.at.y, world.floorHeightPx), x: anchor.at.x };

  const go = travelMs(layout, world, tuning, { floor: spawnFloor, x: layout.spawn.x }, spot, 0, options);
  if (go === null) return null;

  const load = def.weight / tuning.carry.maxWeight;
  const out = bestEscape(layout, world, tuning, spot, load, options);
  if (out === null) return null;

  return go + stealDurationMs(def, tuning) + out.ms;
}

/** 적재 게이트가 걸린 링크. 모델이 게임과 같은 판정을 쓰는지 확인하는 데 쓴다. */
export function blockedLinks(layout: MansionLayout, loadRatio: number): VerticalLink[] {
  return layout.links.filter((link) => isLinkBlockedByLoad(link, loadRatio));
}
