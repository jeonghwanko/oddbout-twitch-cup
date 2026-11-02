import type { MansionLayout } from "./MansionLayout";
import { floorOfY } from "./MansionLayout";
import type { Tuning } from "./tuning";
import type { RngState } from "./types";
import { shuffled } from "./rng";
import type { GuardArchetypeId } from "./GuardArchetypes";
import { archetypeOf, readablePatrolDwellMs } from "./GuardArchetypes";
import type { CallingCardId } from "./CallingCardIds";
export { CALLING_CARD_IDS, type CallingCardId } from "./CallingCardIds";
import {
  MIN_PATROL_SPAN,
  MIN_SPAWN_TO_PATROL_PX,
  obstaclesOnPatrolRoute,
} from "./MansionValidator";
import type { WorldMetrics } from "./MansionValidator";

/**
 * 예고장.
 *
 * 원작의 핵심 구조. 임무 전에 3장 중 1장을 반드시 고른다.
 * 대가를 치르고 보상을 키우는 것이 곧 난이도 조절이다.
 *
 * 효과는 타입 있는 패치 op 목록으로 선언한다. 카드마다 특수 케이스 코드를 쓰면
 * 카드 추가가 코드 변경이 되고, 그러면 밸런싱이 멈춘다.
 *
 * 검수 기준: 각 예고장은 플레이어가 쓰던 정답 경로를 바꿔야 한다. 안 바꾸면 장식이다.
 */

export type MultiplicativePatchPath =
  | "vision.rangeMul"
  | "movement.speedMul"
  | "skill.gainMul"
  | "carry.speedPenalty"
  | "carry.noisePerLoad"
  | "movement.groundAccelPerSec"
  | "movement.ventSpeed"
  /** 걷기·달리기 반경만. 착지 소음은 캐릭터 고유값이라 여기서 건드리지 않는다. */
  | "noise.footstepRadius"
  | "suspicion.baseGainPerSec";

export type SetPatchPath =
  | "suspicion.floor"
  | "run.durationMs"
  | "run.tripChance"
  | "carry.maxWeight";

/** 누적 가산 경로. 메타 강화처럼 기본값에 더해 쌓이는 효과가 쓴다. */
export type AddPatchPath =
  | "carry.maxWeight"
  | "stamina.max"
  | "skill.max"
  | "run.escapeCharges"
  | "run.durationMs"
  | "loot.lockpickLevel"
  | "mischief.eyeMaxMs";

export type TuningPatchPath = MultiplicativePatchPath | SetPatchPath | AddPatchPath;

export type PatchOp =
  | { readonly op: "mul"; readonly path: MultiplicativePatchPath; readonly v: number }
  | { readonly op: "set"; readonly path: SetPatchPath; readonly v: number }
  | { readonly op: "add"; readonly path: AddPatchPath; readonly v: number }
  | { readonly op: "lightMul"; readonly v: number }
  | { readonly op: "lightMin"; readonly v: number }
  | { readonly op: "addGuards"; readonly archetype: GuardArchetypeId; readonly count: number }
  | { readonly op: "guardLinks"; readonly archetype: GuardArchetypeId; readonly kind: "ladder" | "stair" }
  | { readonly op: "addCrowds"; readonly kind: "guest" | "drunk"; readonly count: number; readonly region: "signature-room" }
  | { readonly op: "roofIngress"; readonly archetype: GuardArchetypeId };

interface CallingCardDefinition {
  readonly id: CallingCardId;
  readonly name: string;
  /** 대가와 보상을 한 줄씩. 브리핑 화면이 이 문구를 그대로 쓴다. */
  readonly cost: string;
  readonly reward: string;
  readonly ops: readonly PatchOp[];
  readonly goldMul: number;
  /** 순한 카드인지 매운 카드인지. 제시 3장의 구성을 보장하는 데 쓴다. */
  readonly spice: 1 | 2 | 3;
}

const callingCardDefinitions = [
  {
    id: "midnight",
    name: "자정에 뵙겠소",
    cost: "경비 +2 · 어두운 구역에서 위치 파악이 어렵다",
    reward: "모든 조명 ×0.45 · 경비 시야 −20% · 골드 ×1.15",
    ops: [
      { op: "lightMul", v: 0.45 },
      { op: "mul", path: "vision.rangeMul", v: 0.8 },
      { op: "addGuards", archetype: "patroller", count: 2 },
    ],
    goldMul: 1.15,
    spice: 3,
  },
  {
    id: "untouched",
    name: "손대지 않고 훔치겠소",
    cost: "전 경비 의심 하한 20 · 시야 +10%",
    reward: "기술 획득 ×2 · 품격 보너스 ×1.25",
    ops: [
      { op: "mul", path: "vision.rangeMul", v: 1.1 },
      { op: "set", path: "suspicion.floor", v: 20 },
      { op: "mul", path: "skill.gainMul", v: 2 },
    ],
    goldMul: 1,
    spice: 2,
  },
  {
    id: "threeminutes",
    name: "3분이면 충분하오",
    cost: "제한시간 180초 → 110초",
    reward: "이동 +12% · 중량 부담 완화 · 가치 ×1.6",
    ops: [
      { op: "set", path: "run.durationMs", v: 110000 },
      { op: "mul", path: "movement.speedMul", v: 1.12 },
      { op: "mul", path: "carry.speedPenalty", v: 0.6 },
    ],
    goldMul: 1.6,
    spice: 3,
  },
  {
    id: "lightson",
    name: "전등은 켜두시오",
    cost: "모든 구역이 밝다 · 시야 +15%",
    reward: "골드 ×1.35",
    ops: [
      { op: "lightMin", v: 1 },
      { op: "mul", path: "vision.rangeMul", v: 1.15 },
    ],
    goldMul: 1.35,
    spice: 2,
  },
  {
    id: "heavier",
    name: "무거울수록 좋소",
    cost: "중량 부담 ×1.6 · 적재 소음 +60%",
    reward: "적재 한계 170 · 골드 ×1.2",
    ops: [
      { op: "set", path: "carry.maxWeight", v: 170 },
      { op: "mul", path: "carry.speedPenalty", v: 1.6 },
      { op: "mul", path: "carry.noisePerLoad", v: 1.6 },
    ],
    goldMul: 1.2,
    spice: 2,
  },
  {
    id: "wax",
    name: "미끄러운 왁스칠",
    cost: "바닥이 미끄럽다 · 멈추기 어렵다",
    reward: "경비도 자주 자빠진다 · 골드 ×1.2",
    ops: [
      { op: "mul", path: "movement.groundAccelPerSec", v: 0.35 },
      { op: "set", path: "run.tripChance", v: 1 },
    ],
    goldMul: 1.2,
    spice: 1,
  },
  {
    id: "stairwatch",
    name: "계단에서 뵙겠소",
    cost: "경비용 사다리마다 경비반장 배치",
    reward: "환기구 이동 ×1.6 · 골드 ×1.4",
    ops: [
      { op: "guardLinks", archetype: "warden", kind: "ladder" },
      { op: "mul", path: "movement.ventSpeed", v: 1.6 },
    ],
    goldMul: 1.4,
    spice: 3,
  },
  {
    id: "fullhouse",
    name: "관객을 가득 채우시오",
    cost: "대표 방 군중 +6 · 접촉 소음과 동선 충돌",
    reward: "움직이는 엄폐 6명 · 골드 ×1.45",
    ops: [
      { op: "addCrowds", kind: "guest", count: 4, region: "signature-room" },
      { op: "addCrowds", kind: "drunk", count: 2, region: "signature-room" },
    ],
    goldMul: 1.45,
    spice: 2,
  },
  {
    id: "roofgreeting",
    name: "지붕에서 인사하겠소",
    cost: "옥상 창으로 역침투 · 입구에 경비반장",
    reward: "정문까지 저택 전체를 역주행 · 골드 ×1.55",
    ops: [{ op: "roofIngress", archetype: "warden" }],
    goldMul: 1.55,
    spice: 3,
  },
] as const satisfies readonly CallingCardDefinition[];

export type CallingCard = (typeof callingCardDefinitions)[number];

export const CALLING_CARDS: readonly CallingCard[] = Object.freeze(
  callingCardDefinitions.map((card) => Object.freeze({
    ...card,
    ops: Object.freeze(card.ops.map((op) => Object.freeze({ ...op }))),
  })) as CallingCard[],
);

export const CALLING_CARD_TABLE: Readonly<Record<CallingCardId, CallingCard>> = Object.freeze(
  Object.fromEntries(CALLING_CARDS.map((card) => [card.id, card])) as Record<CallingCardId, CallingCard>,
);

export function isCallingCardId(value: unknown): value is CallingCardId {
  return typeof value === "string" && Object.hasOwn(CALLING_CARD_TABLE, value);
}

/** URL·저장·네트워크 문자열용 fallible lookup. */
export function cardById(id: string): CallingCard | null {
  return isCallingCardId(id) ? CALLING_CARD_TABLE[id] : null;
}

/** 검증된 예고장 ID의 total lookup. */
export function callingCardOf(id: CallingCardId): CallingCard {
  return CALLING_CARD_TABLE[id];
}

/**
 * 3장 제시. 접근 가능한 것 1장과 매운 것 1장이 반드시 섞이게 한다.
 * 세 장 다 순하면 선택이 무의미하고, 세 장 다 매우면 선택이 처벌이 된다.
 * 위험도 1 카드가 하나뿐이어도 매번 강제로 등장시키지는 않는다.
 */
export function offer(
  rng: RngState,
  count = 3,
  clearedCardIds: readonly CallingCardId[] = [],
): { state: RngState; cards: CallingCard[] } {
  const approachable = CALLING_CARDS.filter((c) => c.spice < 3);
  const spicy = CALLING_CARDS.filter((c) => c.spice === 3);

  const picked: CallingCard[] = [];
  let state = rng;

  const takeOne = (pool: readonly CallingCard[]): void => {
    const available = pool.filter((c) => !picked.includes(c));
    if (available.length === 0) return;
    const draw = shuffled(state, available);
    state = draw.state;
    const first = draw.value[0];
    if (first !== undefined) picked.push(first);
  };

  if (count >= 1) takeOne(approachable.length > 0 ? approachable : CALLING_CARDS);
  if (count >= 2) takeOne(spicy.length > 0 ? spicy : CALLING_CARDS);
  while (picked.length < count) {
    const before = picked.length;
    takeOne(CALLING_CARDS);
    if (picked.length === before) break;
  }

  // 표준 3장 제안에서는 위험도 혼합을 보존한 채 미제패 예고장을 최소 한 장 남긴다.
  // 첫 두 장은 이미 접근 가능/극한 축을 소유하므로 마지막 장만 교체한다.
  if (count >= 3 && picked.every((card) => clearedCardIds.includes(card.id))) {
    const unseen = CALLING_CARDS.filter((card) => !clearedCardIds.includes(card.id));
    if (unseen.length > 0) {
      const draw = shuffled(state, unseen);
      state = draw.state;
      const replacement = draw.value[0];
      if (replacement !== undefined) picked[picked.length - 1] = replacement;
    }
  }

  return { state, cards: picked.slice(0, count) };
}

/** 패치 op 적용 결과. sim 이 참조하는 파생 배수들. */
export interface CardModifiers {
  readonly lightMul: number;
  readonly lightMin: number;
  readonly extraGuards: readonly { readonly archetype: GuardArchetypeId; readonly count: number }[];
  readonly guardedLinks: readonly { readonly archetype: GuardArchetypeId; readonly kind: "ladder" | "stair" }[];
  readonly addedCrowds: readonly { readonly kind: "guest" | "drunk"; readonly count: number; readonly region: "signature-room" }[];
  readonly roofIngressArchetype: GuardArchetypeId | null;
}

export const NEUTRAL_MODIFIERS: CardModifiers = {
  lightMul: 1,
  lightMin: 0,
  extraGuards: [],
  guardedLinks: [],
  addedCrowds: [],
  roofIngressArchetype: null,
};

/** 카드가 더하는 이동 경비를 가장 가까운 공정한 순찰 구간에 놓는다. */
function safeCardPatrolRoute(
  layout: MansionLayout,
  floor: number,
  preferredCentreX: number,
  world: WorldMetrics,
): readonly [number, number] {
  const halfSpan = MIN_PATROL_SPAN / 2;
  const minCentre = 80 + halfSpan;
  const maxCentre = layout.widthPx - 80 - halfSpan;
  const spawnFloor = floorOfY(layout.spawn.y, world.floorHeightPx);
  const tried = new Set<number>();

  for (let distance = 0; distance <= layout.widthPx; distance += 20) {
    for (const direction of distance === 0 ? [1] : [1, -1]) {
      const centre = Math.round(Math.max(
        minCentre,
        Math.min(maxCentre, preferredCentreX + distance * direction),
      ));
      if (tried.has(centre)) continue;
      tried.add(centre);
      const route = [centre - halfSpan, centre + halfSpan] as const;
      if (
        floor === spawnFloor
        && Math.min(...route.map((x) => Math.abs(x - layout.spawn.x))) < MIN_SPAWN_TO_PATROL_PX
      ) continue;
      if (obstaclesOnPatrolRoute(layout, floor, route, world).length === 0) return route;
    }
  }

  // 정상 저택에는 항상 한 구간 이상 존재한다. 이 반환값은 검증기가 구체적인 원인과
  // 함께 거부하도록 남기는 방어선이며, 조용히 경비를 삭제하지 않는다.
  const centre = Math.round(Math.max(minCentre, Math.min(maxCentre, preferredCentreX)));
  return [centre - halfSpan, centre + halfSpan];
}

export interface AppliedCard {
  readonly tuning: Tuning;
  readonly modifiers: CardModifiers;
}

/**
 * 카드를 튜닝에 적용한다.
 *
 * 불변식: 어떤 조합도 제한시간·적재 한계를 0 이하로 만들지 않는다.
 * 카드가 게임을 시작할 수 없게 만드는 것은 난이도가 아니라 버그다.
 */
export function apply(tuning: Tuning, card: CallingCard | null): AppliedCard {
  if (card === null) return { tuning, modifiers: NEUTRAL_MODIFIERS };
  return applyOps(tuning, card.ops);
}

/**
 * 패치 op 목록을 튜닝에 적용한다.
 *
 * 예고장과 메타 강화가 같은 적용기를 공유한다. 효과원마다 손으로 스프레드를 쓰면
 * 효과 추가가 코드 변경이 되고, 그러면 카드와 마찬가지로 밸런싱이 멈춘다.
 */
export function applyOps(tuning: Tuning, ops: readonly PatchOp[]): AppliedCard {
  let run = { ...tuning.run };
  let carry = { ...tuning.carry };
  let movement = { ...tuning.movement };
  let vision = { ...tuning.vision };
  let skill = { ...tuning.skill };
  let suspicion = { ...tuning.suspicion };
  let stamina = { ...tuning.stamina };
  let noise = { ...tuning.noise };
  let loot = { ...tuning.loot };
  let mischief = { ...tuning.mischief };
  const mods = {
    ...NEUTRAL_MODIFIERS,
    extraGuards: [] as { archetype: GuardArchetypeId; count: number }[],
    guardedLinks: [] as { archetype: GuardArchetypeId; kind: "ladder" | "stair" }[],
    addedCrowds: [] as { kind: "guest" | "drunk"; count: number; region: "signature-room" }[],
    roofIngressArchetype: null as GuardArchetypeId | null,
  };

  for (const rawOp of ops) {
    // CallingCard는 리터럴 ID를 보존하지만, 적용기는 모든 유효 PatchOp를 일반적으로 처리한다.
    const op: PatchOp = rawOp;
    switch (op.op) {
      case "lightMul":
        mods.lightMul *= op.v;
        break;
      case "lightMin":
        mods.lightMin = Math.max(mods.lightMin, op.v);
        break;
      case "addGuards":
        mods.extraGuards.push({ archetype: op.archetype, count: op.count });
        break;
      case "guardLinks":
        mods.guardedLinks.push({ archetype: op.archetype, kind: op.kind });
        break;
      case "addCrowds":
        mods.addedCrowds.push({ kind: op.kind, count: op.count, region: op.region });
        break;
      case "roofIngress":
        mods.roofIngressArchetype = op.archetype;
        break;
      case "mul": {
        switch (op.path) {
          case "vision.rangeMul":
            vision = { ...vision, rangeMul: vision.rangeMul * op.v };
            break;
          case "movement.speedMul":
            movement = {
              ...movement,
              walkSpeed: movement.walkSpeed * op.v,
              runSpeed: movement.runSpeed * op.v,
              crouchSpeed: movement.crouchSpeed * op.v,
              climbUpSpeed: movement.climbUpSpeed * op.v,
              climbDownSpeed: movement.climbDownSpeed * op.v,
              ventSpeed: movement.ventSpeed * op.v,
            };
            break;
          case "skill.gainMul":
            skill = {
              ...skill,
              silentRoom: skill.silentRoom * op.v,
              boldSteal: skill.boldSteal * op.v,
              evadedSearch: skill.evadedSearch * op.v,
              chainSteal: skill.chainSteal * op.v,
              idleRegenPerSec: skill.idleRegenPerSec * op.v,
            };
            break;
          case "carry.speedPenalty":
            carry = { ...carry, speedPenalty: carry.speedPenalty * op.v };
            break;
          case "carry.noisePerLoad":
            carry = { ...carry, noisePerLoad: carry.noisePerLoad * op.v };
            break;
          case "movement.groundAccelPerSec":
            movement = { ...movement, groundAccelPerSec: movement.groundAccelPerSec * op.v };
            break;
          case "movement.ventSpeed":
            movement = { ...movement, ventSpeed: movement.ventSpeed * op.v };
            break;
          case "noise.footstepRadius":
            noise = {
              ...noise,
              walkRadius: noise.walkRadius * op.v,
              runRadius: noise.runRadius * op.v,
            };
            break;
          case "suspicion.baseGainPerSec":
            suspicion = { ...suspicion, baseGainPerSec: suspicion.baseGainPerSec * op.v };
            break;
        }
        break;
      }
      case "set":
        switch (op.path) {
          case "suspicion.floor":
            suspicion = { ...suspicion, floor: op.v };
            break;
          case "run.durationMs":
            run = { ...run, durationMs: op.v };
            break;
          case "run.tripChance":
            run = { ...run, tripChance: Math.max(0, Math.min(1, op.v)) };
            break;
          case "carry.maxWeight":
            carry = { ...carry, maxWeight: op.v };
            break;
        }
        break;
      case "add":
        switch (op.path) {
          case "carry.maxWeight":
            carry = { ...carry, maxWeight: carry.maxWeight + op.v };
            break;
          case "stamina.max":
            stamina = { ...stamina, max: stamina.max + op.v };
            break;
          case "skill.max":
            skill = { ...skill, max: skill.max + op.v };
            break;
          case "run.escapeCharges":
            run = { ...run, escapeCharges: run.escapeCharges + op.v };
            break;
          case "run.durationMs":
            run = { ...run, durationMs: run.durationMs + op.v };
            break;
          case "loot.lockpickLevel":
            loot = { ...loot, lockpickLevel: loot.lockpickLevel + op.v };
            break;
          case "mischief.eyeMaxMs":
            mischief = { ...mischief, eyeMaxMs: mischief.eyeMaxMs + op.v };
            break;
        }
        break;
    }
  }

  // 불변식 보정.
  run = { ...run, durationMs: Math.max(30000, run.durationMs) };
  carry = { ...carry, maxWeight: Math.max(10, carry.maxWeight) };
  movement = { ...movement, groundAccelPerSec: Math.max(100, movement.groundAccelPerSec) };

  return {
    tuning: { ...tuning, run, carry, movement, vision, skill, suspicion, stamina, noise, loot, mischief },
    modifiers: mods,
  };
}

/** 레이아웃의 조명을 카드 효과로 조정한다. */
export function applyToLayout(
  layout: MansionLayout,
  mods: CardModifiers,
  world: WorldMetrics,
): MansionLayout {
  const extraGuardCount = mods.extraGuards.reduce((sum, entry) => sum + Math.max(0, entry.count), 0);
  if (mods.lightMul === 1 && mods.lightMin === 0 && extraGuardCount === 0 && mods.guardedLinks.length === 0
    && mods.addedCrowds.length === 0 && mods.roofIngressArchetype === null) return layout;

  let extraIndex = 0;
  const extraGuards = mods.extraGuards.flatMap(({ archetype, count }) =>
    Array.from({ length: Math.max(0, count) }, () => {
      const ratio = (extraIndex + 1) / (extraGuardCount + 1);
      const x = Math.round(200 + Math.max(0, layout.widthPx - 400) * ratio);
      const floor = layout.bands.length === 0 ? 0 : extraIndex % layout.bands.length;
      const stationary = archetypeOf(archetype).stationary;
      const route = stationary
        ? [x]
        : safeCardPatrolRoute(layout, floor, x, world);
      const guard = {
        id: `card-${archetype}-${extraIndex}`,
        archetype,
        floor,
        route,
        dwellMs: stationary ? 0 : 1800,
        facing: extraIndex % 2 === 0 ? 1 as const : -1 as const,
      };
      extraIndex += 1;
      return guard;
    }),
  );
  const linkGuards = mods.guardedLinks.flatMap(({ archetype, kind }) =>
    layout.links
      .filter((link) => link.kind === kind && link.guardUsable)
      .sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
      .map((link, index) => {
        const x = Math.round(link.rect.x + link.rect.w / 2);
        const floor = floorOfY(link.rect.y + link.rect.h - 1, world.floorHeightPx);
        const route = safeCardPatrolRoute(layout, floor, x, world);
        return {
          id: `card-${kind}-${link.id}`,
          archetype,
          floor,
          route,
          dwellMs: readablePatrolDwellMs(archetype, 1200),
          facing: index % 2 === 0 ? -1 as const : 1 as const,
        };
      }),
  );
  const signature = layout.theme?.signatureRoom;
  let crowdIndex = 0;
  const addedCrowds = signature === undefined ? [] : mods.addedCrowds.flatMap(({ kind, count }) =>
    Array.from({ length: Math.max(0, count) }, () => {
      const ratio = (crowdIndex + 1) / (mods.addedCrowds.reduce((sum, entry) => sum + entry.count, 0) + 1);
      const halfRange = MIN_PATROL_SPAN / 2;
      const desiredCentre = signature.fromX + (signature.toX - signature.fromX) * ratio;
      const centre = Math.round(Math.max(
        signature.fromX + halfRange,
        Math.min(signature.toX - halfRange, desiredCentre),
      ));
      const crowd = {
        id: `card-audience-${crowdIndex}`,
        kind,
        floor: signature.floor,
        range: [centre - halfRange, centre + halfRange] as const,
      };
      crowdIndex += 1;
      return crowd;
    }),
  );
  const roofWindow = layout.escapes.find((escape) => escape.id === "roof-window");
  const roofIngress = mods.roofIngressArchetype === null || roofWindow === undefined
    ? null
    : (() => {
        const spawn = { x: roofWindow.rect.x + roofWindow.rect.w / 2, y: roofWindow.rect.y + roofWindow.rect.h };
        const floor = floorOfY(spawn.y, world.floorHeightPx);
        const route = safeCardPatrolRoute(
          { ...layout, spawn },
          floor,
          spawn.x - MIN_SPAWN_TO_PATROL_PX - MIN_PATROL_SPAN / 2,
          world,
        );
        return {
          spawn,
          guard: {
            id: "card-roof-ingress-warden",
            archetype: mods.roofIngressArchetype,
            floor,
            route,
            dwellMs: readablePatrolDwellMs(mods.roofIngressArchetype, 1_400),
            facing: 1 as const,
          },
        };
      })();
  const entranceGuardStart = roofIngress?.guard.route[0];
  const roofClearedGuards = entranceGuardStart === undefined
    ? layout.guards
    : layout.guards.map((guard) => {
        if (
          guard.floor !== roofIngress?.guard.floor
          || guard.activationLootAnchorId !== undefined
          || guard.activationRunPhase !== undefined
        ) return guard;
        // 역침투의 첫 화면은 새 경비반장의 읽을 수 있는 단독 순찰 구간이다.
        // 기존 다락 순찰은 폭을 줄이지 않고 왼쪽으로 옮겨 즉시 이중 발각을 막는다.
        const maxAllowedX = entranceGuardStart - 80;
        const maxRouteX = Math.max(...guard.route);
        if (maxRouteX <= maxAllowedX) return guard;
        const shiftX = maxRouteX - maxAllowedX;
        return { ...guard, route: guard.route.map((x) => x - shiftX) };
      });

  return {
    ...layout,
    bands: layout.bands.map((b) => ({ ...b, light: Math.max(mods.lightMin, b.light * mods.lightMul) })),
    // 전등을 켜두라는 카드는 어두운 구역 자체를 없앤다.
    geometry: mods.lightMin >= 1 ? layout.geometry.filter((g) => g.kind !== "dark") : layout.geometry,
    guards: [...roofClearedGuards, ...extraGuards, ...linkGuards, ...(roofIngress === null ? [] : [roofIngress.guard])],
    crowds: [...layout.crowds, ...addedCrowds],
    spawn: roofIngress?.spawn ?? layout.spawn,
  };
}
