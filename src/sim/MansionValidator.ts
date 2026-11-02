import type { GeometryRect, MansionLayout, VerticalLink } from "./MansionLayout";
import { LADDER_HEAD_ROOM, floorOfY, floorSurfaceY } from "./MansionLayout";
import { GUARD_ARCHETYPES, readablePatrolDwellMs } from "./GuardArchetypes";
import { PROPS, kitOfFloor } from "./MansionProps";
import { spansOverlap } from "./geom";
import { isToolId } from "./ToolRules";
import { weaponModSnapshotProblem } from "./WeaponModRules";
import { isGuardBehaviorPolicy } from "./GuardBehaviorRules";

/**
 * 저택 레이아웃의 불변조건 검사.
 *
 * 절차 생성이 잠입에서 위험한 이유는 "왜 발각됐는지 납득"이 지형에 달려 있기 때문이다.
 * 도달할 수 없는 전리품, 덮이지 않은 구멍, 스폰 코앞의 순찰은 플레이어의 실수가 아니라
 * 생성기의 실수인데 화면에서는 구분되지 않는다.
 *
 * 기준은 손으로 만든 `GREYBOX_LAYOUT` 이다. 그것이 "좋은 레벨" 의 유일한 표본이므로
 * 규칙은 반드시 그것을 통과해야 하고, 통과하지 못하면 규칙이 틀린 것이다
 * (`test/mansion.test.ts` 가 그 대조를 강제한다).
 *
 * 수치 경계도 GREYBOX 에서 뽑았다. 예컨대 가구 간격 상한 620 은 GREYBOX 3F 의 최대
 * 간격 580 에서 왔다 — 임의로 고른 값이 아니라 설계자가 이미 받아들인 폭이다.
 */

export interface WorldMetrics {
  readonly floorHeightPx: number;
  readonly slabThicknessPx: number;
}

/**
 * 시야가 끊기지 않는 복도의 상한. 넘으면 뻥 뚫린 사격장이 된다.
 * 생성기가 같은 값을 받아 쓴다 — 검증기와 생성기가 서로 다른 상한을 갖는 순간
 * 통과하지 못하는 시드가 조용히 섞인다.
 */
export const MAX_FURNITURE_GAP = 620;
/** 가구가 이보다 붙으면 경비가 아무것도 못 보고 잠입이 사라진다. */
export const MIN_FURNITURE_GAP = 200;
/** 침투 직후 판단할 틈도 없이 발각되면 그 실패는 플레이어의 것으로 읽히지 않는다. */
export const MIN_SPAWN_TO_PATROL_PX = 400;
/** 전리품이 한두 층에 몰리면 층을 오르내리는 동사가 죽는다. */
const MIN_LOOT_FLOORS = 3;
/**
 * 물건끼리의 최소 간격. 생성기가 같은 값을 받아 쓴다.
 * GREYBOX 의 가장 빡빡한 간격(은신처 hide-crate-b1 과 사다리 사이 32px)보다 작아야
 * 기준 레벨이 자기 규칙에 걸리지 않는다.
 */
export const MIN_PROP_GAP = 24;
/** 순찰이라 부를 수 있는 최소 왕복 폭. 이보다 좁으면 이름만 순찰이다. */
export const MIN_PATROL_SPAN = 240;
/** 경비가 가구 가장자리를 스치지 않고 돌아설 수 있는 순찰 여유. */
export const PATROL_OBSTACLE_PAD = 60;
/**
 * 전리품끼리의 최소 간격. 다른 물건보다 넓다.
 *
 * 집는 사거리가 30px 이라, 둘이 60px 안에 있으면 어느 위치에서든 양쪽이 동시에
 * 사거리에 든다. 기능은 살아 있지만(하나 훔치면 다음이 잡힌다) 지금 무엇을 집고
 * 있는지 화면이 말해 주지 못한다. 사거리의 두 배에 여유를 더해 둔다.
 * GREYBOX 의 같은 층 최소 전리품 간격은 650px 이라 여유가 충분하다.
 */
export const MIN_LOOT_GAP = 72;

/**
 * 문제 목록. 비어 있으면 통과다.
 * 던지지 않고 모아서 돌려주는 이유는 한 번에 전부 보고 고치기 위해서다.
 */
export function validateLayout(layout: MansionLayout, world: WorldMetrics): string[] {
  const problems: string[] = [];
  const surfaceOf = (floor: number): number =>
    floorSurfaceY(floor, world.floorHeightPx, world.slabThicknessPx);

  checkBands(layout, problems);
  checkBounds(layout, world, problems);
  checkEnvironmentHazards(layout, world, problems);
  checkCaperChains(layout, world, problems);
  checkCrowds(layout, world, problems);
  checkLockedLinks(layout, world, problems);
  const ladders = checkLadders(layout, world, surfaceOf, problems);
  checkFloorConnectivity(layout, ladders, problems);
  checkSlabHoles(layout, surfaceOf, problems);
  checkFurnitureSpacing(layout, world, problems);
  checkLoot(layout, world, surfaceOf, problems);
  checkEscapes(layout, problems);
  checkResponse(layout, problems);
  checkTacticResponse(layout, problems);
  checkToolLoadout(layout, problems);
  checkToolMods(layout, problems);
  checkGuards(layout, world, problems);
  checkCombatPockets(layout, world, problems);
  checkObstaclesOffPatrol(layout, world, problems);
  checkVisionHoles(layout, ladders, problems);
  checkHideSpots(layout, ladders, problems);
  checkPatrolSpans(layout, problems);
  checkPropSpacing(layout, world, problems);

  return problems;
}

/**
 * 리플레이 저장소가 받는 레이아웃 검사(`replayStorage.isReplayBundle`). 블랙손(`manor` 가 있는 판)은
 * `validateBlackthorneLayout`, 그 밖은 생성 저택 규칙(`validateLayout`)이다.
 */
export function validateReplayLayout(layout: MansionLayout, world: WorldMetrics): string[] {
  return layout.manor !== undefined ? validateBlackthorneLayout(layout, world) : validateLayout(layout, world);
}

/**
 * 손으로 만든 블랙손 판의 검사. 생성 저택의 설계 규칙(가구 간격·순찰 폭·탈출구 셋·사다리 규약 등)은
 * 블랙손의 의도된 지형(아트리움·창 밖 회랑·단일 옥상 창·제자리 금고지기)과 맞지 않아 적용하지 않는다.
 * 대신 재생을 깨뜨릴 구조 손상과 블랙손 계약(공간 좌표·전시 승강기·목표·탈출구)을 본다.
 * 2026-10-01 전에는 생성 규칙 34건에 걸려 모든 블랙손 리플레이가 저장소에서 거절됐다.
 */
export function validateBlackthorneLayout(layout: MansionLayout, world: WorldMetrics): string[] {
  const problems: string[] = [];
  checkBands(layout, problems);
  checkBlackthorneGeometry(layout, world, problems);
  checkBlackthorneContract(layout, problems);
  checkBounds(layout, world, problems);
  checkEnvironmentHazards(layout, world, problems);
  checkCrowds(layout, world, problems);
  checkLockedLinks(layout, world, problems);
  checkToolLoadout(layout, problems);
  checkToolMods(layout, problems);
  checkCombatPockets(layout, world, problems);
  return problems;
}

/** 블랙손 진행이 읽는 id 들이 레이아웃 안에 실제로 있는가. 이름이 바뀌기 전의 옛 리플레이도 여기서 걸린다. */
function checkBlackthorneContract(layout: MansionLayout, problems: string[]): void {
  const manor = layout.manor;
  if (manor === undefined) {
    problems.push("블랙손 판 정의(manor)가 없다.");
    return;
  }
  if (!layout.lootAnchors.some((anchor) => anchor.id === manor.targetAnchorId)) {
    problems.push(`블랙손 목표 ${manor.targetAnchorId} 가 전리품 자리에 없다.`);
  }
  if (layout.escapes.length === 0) problems.push("블랙손 판에 탈출구가 없다.");
  const exhibition = (manor as Partial<typeof manor>).exhibition;
  const chains = new Set((layout.caperChains ?? []).map((chain) => chain.id));
  if (exhibition === undefined) {
    problems.push("블랙손 판에 전시 승강기(manor.exhibition)가 없다.");
  } else {
    for (const id of [exhibition.crankId, exhibition.latchId]) {
      if (!chains.has(id)) problems.push(`전시 승강기 장치 ${id} 의 연쇄가 없다.`);
    }
  }
  if (typeof manor.crankChainId !== "string" || !chains.has(manor.crankChainId)) {
    problems.push("블랙손 도르레 크랭크(manor.crankChainId)가 연쇄 목록에 없다.");
  }
}

/**
 * 블랙손 판(`manor`)은 자기 공간 좌표(`manor.spatialGeometry`)를 싣고 다닌다. 옛 180px 대체 좌표는 없으므로
 * 좌표 없이 저장된 옛 블랙손 리플레이는 재생 도중이 아니라 여기서 거절된다.
 */
function checkBlackthorneGeometry(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  if (layout.manor === undefined) return;
  // 타입은 필수지만 저장된 옛 리플레이 JSON 에는 없을 수 있다.
  const geometry = (layout.manor as Partial<NonNullable<MansionLayout["manor"]>>).spatialGeometry;
  if (geometry === undefined) {
    problems.push("블랙손 판에 공간 좌표(manor.spatialGeometry)가 없다. 옛 리플레이는 재생할 수 없다.");
    return;
  }
  if (geometry.floorHeightPx !== world.floorHeightPx || geometry.slabThicknessPx !== world.slabThicknessPx) {
    problems.push(`블랙손 공간 좌표의 층(${geometry.floorHeightPx}/${geometry.slabThicknessPx})이 튜닝(${world.floorHeightPx}/${world.slabThicknessPx})과 다르다.`);
  }
}

function checkToolMods(layout: MansionLayout, problems: string[]): void {
  const mods: unknown = layout.toolMods;
  if (mods === undefined) return;
  const problem = weaponModSnapshotProblem(mods);
  if (problem !== null) problems.push(problem);
}

function checkToolLoadout(layout: MansionLayout, problems: string[]): void {
  const loadout: unknown = layout.toolLoadout;
  if (loadout === undefined) return;
  if (!Array.isArray(loadout) || loadout.length !== 2 || !loadout.every(isToolId)) {
    problems.push("괴도 도구 장착은 알려진 도구 두 칸이어야 한다.");
    return;
  }
  if (loadout[0] === loadout[1]) problems.push("괴도 도구 두 칸에는 서로 다른 도구를 장착해야 한다.");
}

function checkTacticResponse(layout: MansionLayout, problems: string[]): void {
  const response = layout.tacticResponse;
  if (response === undefined) return;
  if (response.title.trim() === "" || response.counter.trim() === "" || response.weakness.trim() === "") {
    problems.push("저택 수법 대응은 이름·대응·역이용 약점을 모두 고지해야 한다.");
  }
  if (response.tactic === "caper" && (layout.caperChains?.length ?? 0) === 0) {
    problems.push("연쇄 장치 대응이 있지만 실제 연쇄극이 없다.");
  }
  if (response.tactic === "darkness" && !layout.lamps.some((lamp) => lamp.snuffable)) {
    problems.push("어둠 대응이 있지만 역이용할 수 있는 전등이 없다.");
  }
  if ((response.tactic === "lure" || response.tactic === "combat") && (layout.caperChains?.length ?? 0) === 0) {
    problems.push(`${response.tactic} 대응의 역이용 약점인 연쇄극이 없다.`);
  }
}

/** 연쇄극의 화면 연결선, 자동 발동 순서, 판정 데이터가 하나의 유향 비순환 그래프인가. */
function checkCaperChains(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  const chainIds = new Set<string>();
  const allDeviceIds = new Set<string>();
  for (const chain of layout.caperChains ?? []) {
    if (chainIds.has(chain.id)) problems.push(`괴도 연쇄극 id '${chain.id}' 가 중복이다.`);
    chainIds.add(chain.id);
    if (chain.floor < 0 || chain.floor >= layout.bands.length) {
      problems.push(`괴도 연쇄극 ${chain.id} 의 층이 범위 밖이다: ${chain.floor}`);
    }
    if (chain.fromX < 0 || chain.toX > layout.widthPx || chain.fromX >= chain.toX) {
      problems.push(`괴도 연쇄극 ${chain.id} 의 범위가 월드 밖이거나 뒤집혔다.`);
    }
    if (chain.devices.length < 2) problems.push(`괴도 연쇄극 ${chain.id} 에 연결 장치가 부족하다.`);

    const localIds = new Set<string>();
    for (const device of chain.devices) {
      if (localIds.has(device.id) || allDeviceIds.has(device.id)) {
        problems.push(`괴도 장치 id '${device.id}' 가 중복이다.`);
      }
      localIds.add(device.id);
      allDeviceIds.add(device.id);
      if (device.floor !== chain.floor) problems.push(`괴도 장치 ${device.id} 가 연쇄극과 다른 층이다.`);
      for (const [label, point] of [["조작점", device.triggerAt], ["충격점", device.impactAt], ["원화", device.visualAt]] as const) {
        if (point.x < 0 || point.x > layout.widthPx) problems.push(`괴도 장치 ${device.id} ${label}이 월드 밖이다.`);
        const floor = floorOfY(label === "충격점" ? point.y - 1 : point.y, world.floorHeightPx);
        if (floor !== chain.floor) problems.push(`괴도 장치 ${device.id} ${label}이 연쇄극과 다른 층이다.`);
      }
      if (device.impactRadiusPx <= 0 || device.noiseRadiusPx <= 0) {
        problems.push(`괴도 장치 ${device.id} 의 충격·소음 반경은 양수여야 한다.`);
      }
      if (device.delayMs < 0) problems.push(`괴도 장치 ${device.id} 의 지연 시간이 음수다.`);
      if (
        device.activationLootAnchorId !== undefined &&
        !layout.lootAnchors.some((anchor) => anchor.id === device.activationLootAnchorId)
      ) {
        problems.push(`괴도 장치 ${device.id} 의 활성화 전리품 '${device.activationLootAnchorId}' 이 없다.`);
      }
    }

    if (!localIds.has(chain.rootDeviceId)) {
      problems.push(`괴도 연쇄극 ${chain.id} 의 시작 장치 '${chain.rootDeviceId}' 가 없다.`);
      continue;
    }
    for (const device of chain.devices) {
      if (device.nextId !== undefined && !localIds.has(device.nextId)) {
        problems.push(`괴도 장치 ${device.id} 의 다음 장치 '${device.nextId}' 가 없다.`);
      }
    }

    const visited = new Set<string>();
    let cursor: string | undefined = chain.rootDeviceId;
    while (cursor !== undefined && localIds.has(cursor) && !visited.has(cursor)) {
      visited.add(cursor);
      cursor = chain.devices.find((device) => device.id === cursor)?.nextId;
    }
    if (cursor !== undefined && visited.has(cursor)) problems.push(`괴도 연쇄극 ${chain.id} 에 순환 연결이 있다.`);
    if (visited.size !== chain.devices.length) {
      problems.push(`괴도 연쇄극 ${chain.id} 에 시작 장치에서 닿지 않는 장치가 있다.`);
    }
  }
}

/** 다음 런 대응은 실제 출구 하나만 닫고 반드시 다른 퇴로를 남겨야 한다. */
function checkResponse(layout: MansionLayout, problems: string[]): void {
  const response = layout.response;
  if (response === undefined) return;
  if (!layout.escapes.some((exit) => exit.id === response.exitId)) {
    problems.push(`저택 대응이 없는 출구 '${response.exitId}' 를 봉쇄한다.`);
  }
  if (layout.escapes.length < 2) {
    problems.push("저택 대응이 적용됐지만 대체 퇴로가 없다.");
  }
}

/** 선택형 전투의 화면 예고와 실제 활성화 편성이 같은 계약을 가리키는가. */
function checkCombatPockets(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  const seenIds = new Set<string>();
  const claimedHazardIds = new Set<string>();
  for (const pocket of layout.combatPockets) {
    if (seenIds.has(pocket.id)) problems.push(`전투 포켓 id '${pocket.id}' 가 중복이다.`);
    seenIds.add(pocket.id);
    if (pocket.floor < 0 || pocket.floor >= layout.bands.length) {
      problems.push(`전투 포켓 ${pocket.id} 의 층이 범위 밖이다: ${pocket.floor}`);
    }
    if (pocket.fromX < 0 || pocket.toX > layout.widthPx || pocket.fromX >= pocket.toX) {
      problems.push(`전투 포켓 ${pocket.id} 의 범위가 월드 밖이거나 뒤집혔다.`);
    }

    const reward = layout.lootAnchors.find((anchor) => anchor.id === pocket.rewardAnchorId);
    if (reward === undefined) {
      problems.push(`전투 포켓 ${pocket.id} 의 보상 '${pocket.rewardAnchorId}' 이 없다.`);
      continue;
    }
    const rewardFloor = floorOfY(reward.at.y, world.floorHeightPx);
    if (rewardFloor !== pocket.floor || reward.at.x < pocket.fromX || reward.at.x > pocket.toX) {
      problems.push(`전투 포켓 ${pocket.id} 의 보상이 포켓 안 같은 층에 있지 않다.`);
    }

    const listedIds = new Set(pocket.guardIds);
    if (listedIds.size !== pocket.guardIds.length) {
      problems.push(`전투 포켓 ${pocket.id} 의 경비 목록에 중복 id가 있다.`);
    }
    const actual = layout.guards.filter((guard) => guard.activationLootAnchorId === reward.id);
    const actualIds = new Set(actual.map((guard) => guard.id));
    const lineupMatches = listedIds.size === actualIds.size &&
      [...listedIds].every((guardId) => actualIds.has(guardId));
    if (!lineupMatches) {
      problems.push(`전투 포켓 ${pocket.id} 의 예고 경비와 실제 활성화 경비가 다르다.`);
    }

    const hazard = layout.environmentHazards.find((entry) => entry.id === pocket.environmentHazardId);
    if (hazard === undefined) {
      problems.push(`전투 포켓 ${pocket.id} 의 환경 해법 '${pocket.environmentHazardId}' 이 없다.`);
    } else {
      if (claimedHazardIds.has(hazard.id)) {
        problems.push(`환경 해법 '${hazard.id}' 을 여러 전투 포켓이 함께 소유한다.`);
      }
      claimedHazardIds.add(hazard.id);
      const triggerFloor = floorOfY(hazard.triggerAt.y, world.floorHeightPx);
      const impactFloor = floorOfY(hazard.impactAt.y - 1, world.floorHeightPx);
      if (
        hazard.activationLootAnchorId !== reward.id ||
        triggerFloor !== pocket.floor ||
        impactFloor !== pocket.floor ||
        hazard.triggerAt.x < pocket.fromX ||
        hazard.triggerAt.x > pocket.toX ||
        hazard.impactAt.x < pocket.fromX ||
        hazard.impactAt.x > pocket.toX
      ) {
        problems.push(`전투 포켓 ${pocket.id} 의 환경 해법이 보상과 같은 전투 구역에 연결되지 않았다.`);
      }
    }

    for (const guardId of pocket.guardIds) {
      const guard = layout.guards.find((entry) => entry.id === guardId);
      if (guard === undefined) {
        problems.push(`전투 포켓 ${pocket.id} 의 경비 '${guardId}' 가 없다.`);
        continue;
      }
      const startX = guard.route[0];
      if (guard.floor !== pocket.floor || startX === undefined || startX < pocket.fromX || startX > pocket.toX) {
        problems.push(`전투 포켓 ${pocket.id} 의 경비 '${guardId}' 가 포켓 안 같은 층에서 시작하지 않는다.`);
      }
    }

    if (pocket.kind === "crossfire") {
      const attackKinds = new Set(actual.map((guard) => GUARD_ARCHETYPES[guard.archetype].combat?.attackKind));
      if (!attackKinds.has("melee") || !attackKinds.has("ranged")) {
        problems.push(`교차 사격 포켓 ${pocket.id} 에 근접·원거리 경비가 모두 있지 않다.`);
      }
    }
  }
}

function checkCrowds(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  const seen = new Set<string>();
  for (const crowd of layout.crowds) {
    if (seen.has(crowd.id)) problems.push(`군중 id '${crowd.id}' 가 중복이다.`);
    seen.add(crowd.id);
    const [a, b] = crowd.range;
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    if (crowd.floor < 0 || crowd.floor >= layout.bands.length) {
      problems.push(`군중 ${crowd.id} 의 층이 범위 밖이다: ${crowd.floor}`);
    }
    if (from < 0 || to > layout.widthPx) problems.push(`군중 ${crowd.id} 의 이동 범위가 월드 밖이다.`);
    if (to - from < MIN_PATROL_SPAN) problems.push(`군중 ${crowd.id} 의 이동 범위가 너무 짧다: ${to - from}px`);
    const surface = floorSurfaceY(crowd.floor, world.floorHeightPx, world.slabThicknessPx);
    if (!Number.isFinite(surface)) problems.push(`군중 ${crowd.id} 의 바닥 좌표가 유효하지 않다.`);
  }
}

function checkLockedLinks(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  for (const link of layout.links) {
    if (link.requiresAreaKey !== true) continue;
    if (link.kind !== "vent" || link.exit === undefined) {
      problems.push(`잠긴 통로 ${link.id} 가 출구 있는 vent가 아니다.`);
    }
    const mouths = [
      {
        label: "입구",
        x: link.rect.x + link.rect.w / 2,
        floor: floorOfY(link.rect.y + link.rect.h - 1, world.floorHeightPx),
      },
      ...(link.exit === undefined
        ? []
        : [{ label: "출구", x: link.exit.x, floor: floorOfY(link.exit.y - 1, world.floorHeightPx) }]),
    ];
    for (const mouth of mouths) {
      const covered = layout.geometry.some((geo) =>
        geo.kind === "blocker" &&
        floorOfY(geo.rect.y + geo.rect.h - 1, world.floorHeightPx) === mouth.floor &&
        spansOverlap(mouth.x - MIN_PROP_GAP, mouth.x + MIN_PROP_GAP, geo.rect.x, geo.rect.x + geo.rect.w)
      );
      if (covered) problems.push(`잠긴 통로 ${link.id} 의 ${mouth.label}가 가구에 가려졌다.`);
    }
  }
  const hasLockedLink = layout.links.some((link) => link.requiresAreaKey === true);
  const hasUsher = layout.guards.some((guard) => guard.archetype === "usher");
  if (hasLockedLink && !hasUsher) problems.push("잠긴 구역은 있지만 열쇠를 가진 안내원이 없다.");
}

/** 환경 공격의 줄·낙하점이 같은 층에서 보이고, 스스로 플레이어를 덮치지 않는가. */
function checkEnvironmentHazards(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  const seenIds = new Set<string>();
  for (const hazard of layout.environmentHazards) {
    if (seenIds.has(hazard.id)) problems.push(`환경 장치 id '${hazard.id}' 가 중복이다.`);
    seenIds.add(hazard.id);
    for (const [label, point] of [["당김줄", hazard.triggerAt], ["낙하점", hazard.impactAt], ["원화", hazard.visualAt]] as const) {
      if (point.x < 0 || point.x > layout.widthPx) problems.push(`환경 장치 ${hazard.id} ${label}이 월드 밖이다: x=${point.x}`);
    }
    const triggerFloor = floorOfY(hazard.triggerAt.y, world.floorHeightPx);
    const impactFloor = floorOfY(hazard.impactAt.y - 1, world.floorHeightPx);
    if (triggerFloor !== impactFloor) problems.push(`환경 장치 ${hazard.id} 의 당김줄과 낙하점이 서로 다른 층이다.`);
    if (hazard.impactRadiusPx <= 0) problems.push(`환경 장치 ${hazard.id} 의 충격 반경이 ${hazard.impactRadiusPx}px 다.`);
    if (Math.abs(hazard.triggerAt.x - hazard.impactAt.x) <= hazard.impactRadiusPx) {
      problems.push(`환경 장치 ${hazard.id} 의 당김줄이 충격 반경 안에 있다.`);
    }
    if (
      hazard.activationLootAnchorId !== undefined &&
      !layout.lootAnchors.some((anchor) => anchor.id === hazard.activationLootAnchorId)
    ) {
      problems.push(`환경 장치 ${hazard.id} 의 활성화 전리품 '${hazard.activationLootAnchorId}' 이 없다.`);
    }
  }
}

/**
 * 움직이라고 만든 경비가 실제로 움직이는가.
 *
 * 웨이포인트가 하나뿐인 순찰병은 이름만 순찰이다. 순찰 주기를 읽는 것이 이 게임의
 * 핵심 규칙인데, 그 층에서는 배울 것이 없어진다. 정지형인지는 아키타입 데이터가
 * 정한다 — 여기서 이름을 다시 나열하면 두 곳이 갈라진다.
 */
function checkPatrolSpans(layout: MansionLayout, problems: string[]): void {
  for (const guard of layout.guards) {
    const archetype = GUARD_ARCHETYPES[guard.archetype];
    if (archetype === undefined) {
      problems.push(`경비 ${guard.id} 의 아키타입 '${guard.archetype}' 이 표에 없다.`);
      continue;
    }
    if (archetype.stationary) continue;
    if (guard.route.length === 0) continue;

    const span = Math.max(...guard.route) - Math.min(...guard.route);
    if (span < MIN_PATROL_SPAN) {
      problems.push(
        `경비 ${guard.id}(${archetype.name.ko}) 의 순찰 폭이 ${Math.round(span)}px 다 ` +
          `(최소 ${MIN_PATROL_SPAN}). 움직이라고 만든 경비가 제자리에 선다.`,
      );
    }
  }
}

/**
 * 전리품·은신처·탈출구가 서로 겹치지 않는가.
 *
 * 겹쳐도 기능은 산다 — 집는 판정은 이미 훔친 것을 건너뛴다. 문제는 읽기다. 두 물건이
 * 한 자리에 그려지면 무엇을 집고 있는지, 어디로 나가는지 화면이 설명하지 못한다.
 *
 * 구조 검사만으로는 이것을 못 잡는다. 실제로 검증기를 통과한 시드 4000 개 중 전리품이
 * 겹치는 것이 27%, 은신처가 가구에 파묻히는 것이 36% 였다.
 */
function checkPropSpacing(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  interface Prop {
    readonly what: string;
    readonly isLoot: boolean;
    readonly floor: number;
    readonly from: number;
    readonly to: number;
  }

  const floorOf = (y: number): number => floorOfY(y, world.floorHeightPx);
  const props: Prop[] = [
    ...layout.lootAnchors.map((a) => ({
      what: `전리품 ${a.id}`,
      isLoot: true,
      floor: floorOf(a.at.y),
      from: a.at.x,
      to: a.at.x + 12,
    })),
    ...layout.hideSpots.map((h) => ({
      what: `은신처 ${h.id}`,
      isLoot: false,
      floor: floorOf(h.rect.y + h.rect.h - 1),
      from: h.rect.x,
      to: h.rect.x + h.rect.w,
    })),
    ...layout.escapes.map((e) => ({
      what: `탈출구 ${e.id}`,
      isLoot: false,
      floor: floorOf(e.rect.y + e.rect.h - 1),
      from: e.rect.x,
      to: e.rect.x + e.rect.w,
    })),
  ];

  for (let i = 0; i < props.length; i += 1) {
    for (let j = i + 1; j < props.length; j += 1) {
      const a = props[i];
      const b = props[j];
      if (a === undefined || b === undefined || a.floor !== b.floor) continue;
      const gap = a.isLoot && b.isLoot ? MIN_LOOT_GAP : MIN_PROP_GAP;
      if (spansOverlap(a.from - gap, a.to + gap, b.from, b.to)) {
        problems.push(`${a.floor} 층에서 ${a.what} 과 ${b.what} 이 ${gap}px 안에 붙어 있다.`);
      }
    }
  }

  // 가구가 물건 위에 덮이면 그 물건이 화면에서 사라진다.
  for (const geo of layout.geometry) {
    if (geo.kind !== "blocker") continue;
    const floor = floorOf(geo.rect.y + geo.rect.h - 1);
    for (const prop of props) {
      if (prop.floor !== floor) continue;
      if (spansOverlap(prop.from - MIN_PROP_GAP, prop.to + MIN_PROP_GAP, geo.rect.x, geo.rect.x + geo.rect.w)) {
        problems.push(`${floor} 층에서 가구 ${geo.id} 이 ${prop.what} 을 덮는다.`);
      }
    }
  }
}

function checkBands(layout: MansionLayout, problems: string[]): void {
  if (layout.bands.length < 2) {
    problems.push(`밴드가 ${layout.bands.length} 개다. 층이 하나면 사다리 동사가 없다.`);
  }
  layout.bands.forEach((band, index) => {
    if (band.index !== index) problems.push(`밴드 인덱스가 순서와 어긋난다: ${index} 자리에 ${band.index}`);
    if (band.light <= 0 || band.light > 1) problems.push(`밴드 ${band.index} 의 조명이 0..1 밖이다: ${band.light}`);
    if (band.name.trim() === "") problems.push(`밴드 ${band.index} 에 이름이 없다. HUD 가 현재 층을 못 읽는다.`);
  });
}

function checkBounds(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  if (layout.widthPx <= 0) problems.push(`widthPx 가 ${layout.widthPx} 다.`);

  const inX = (x: number): boolean => x >= 0 && x <= layout.widthPx;
  for (const lamp of layout.lamps) {
    if (!inX(lamp.at.x)) problems.push(`등 ${lamp.id} 이 월드 밖이다: x=${lamp.at.x}`);
    if (lamp.radius <= 0) problems.push(`등 ${lamp.id} 의 반경이 ${lamp.radius} 다.`);
    if (lamp.visualId !== undefined) {
      const floor = floorOfY(lamp.at.y, world.floorHeightPx);
      const known = PROPS.some(
        (prop) => prop.id === lamp.visualId && prop.kit === kitOfFloor(floor) && prop.role === "lamp",
      );
      if (!known) problems.push(`등 ${lamp.id} 의 전용 원화 '${lamp.visualId}' 이 해당 층 lamp 표에 없다.`);
    }
  }
  for (const spot of layout.hideSpots) {
    if (!inX(spot.rect.x) || !inX(spot.rect.x + spot.rect.w)) {
      problems.push(`은신처 ${spot.id} 가 월드 밖이다: x=${spot.rect.x}`);
    }
  }
  if (!inX(layout.spawn.x)) problems.push(`스폰이 월드 밖이다: x=${layout.spawn.x}`);
}

interface LadderInfo {
  readonly link: VerticalLink;
  /** 위쪽 층 인덱스. 이 사다리는 upperFloor ↔ upperFloor+1 을 잇는다. */
  readonly upperFloor: number;
}

/**
 * 사다리 규약 검사.
 *
 * rect 아래 끝이 아래층 바닥면, rect.y 가 위층 바닥면에서 헤드룸만큼 위여야 한다.
 * 어긋나면 꼭대기에서 손을 놓는 순간 다시 떨어지거나, 아래층 바닥에 닿지 못한다.
 */
function checkLadders(
  layout: MansionLayout,
  world: WorldMetrics,
  surfaceOf: (floor: number) => number,
  problems: string[],
): LadderInfo[] {
  const found: LadderInfo[] = [];

  for (const link of layout.links) {
    if (link.kind !== "ladder") continue;

    const bottom = link.rect.y + link.rect.h;
    const lowerFloor = layout.bands.findIndex((b) => surfaceOf(b.index) === bottom);
    if (lowerFloor <= 0) {
      problems.push(
        `사다리 ${link.id} 의 아래 끝(${bottom})이 어느 층 바닥면과도 맞지 않는다.`,
      );
      continue;
    }

    const upperFloor = lowerFloor - 1;
    const wantTop = surfaceOf(upperFloor) - LADDER_HEAD_ROOM;
    if (link.rect.y !== wantTop) {
      problems.push(
        `사다리 ${link.id} 의 위 끝이 ${link.rect.y} 인데 ${wantTop} 이어야 한다 ` +
          `(위층 바닥면 - 헤드룸 ${LADDER_HEAD_ROOM}).`,
      );
    }
    if (link.rect.w <= 0 || link.rect.h <= 0) {
      problems.push(`사다리 ${link.id} 의 크기가 유효하지 않다.`);
    }
    void world;
    found.push({ link, upperFloor });
  }

  return found;
}

/** 인접한 두 층은 반드시 사다리로 이어져야 한다. 끊기면 그 위층 전리품은 도달 불가다. */
function checkFloorConnectivity(layout: MansionLayout, ladders: readonly LadderInfo[], problems: string[]): void {
  for (let upper = 0; upper < layout.bands.length - 1; upper += 1) {
    if (!ladders.some((l) => l.upperFloor === upper)) {
      problems.push(`${upper} 층과 ${upper + 1} 층을 잇는 사다리가 없다.`);
    }
  }
}

/**
 * 슬래브에 뚫린 구멍이 전부 원웨이 발판으로 덮여 있는가.
 *
 * 덮지 않으면 복도를 걷다가 예고 없이 아래층으로 빠진다. 2400px 짜리 층에
 * 함정이 생기는 셈이라, 발각이 아니라 지형 때문에 런이 끝난다.
 */
function checkSlabHoles(
  layout: MansionLayout,
  surfaceOf: (floor: number) => number,
  problems: string[],
): void {
  for (const band of layout.bands) {
    const y = surfaceOf(band.index);
    const solids = layout.geometry.filter((g) => g.kind === "solid" && g.rect.y === y);
    if (solids.length === 0) {
      problems.push(`${band.index} 층에 바닥 슬래브가 없다.`);
      continue;
    }

    const covers = layout.geometry.filter((g) => g.kind === "platform" && g.rect.y === y);
    for (const gap of gapsIn(solids, layout.widthPx)) {
      const covered = covers.some(
        (c) => c.rect.x <= gap.from + 0.001 && c.rect.x + c.rect.w >= gap.to - 0.001,
      );
      if (!covered) {
        problems.push(
          `${band.index} 층 바닥 구멍 ${Math.round(gap.from)}..${Math.round(gap.to)} 가 ` +
            "원웨이 발판으로 덮이지 않았다. 걷다가 그대로 떨어진다.",
        );
      }
    }
  }
}

/** [0, width] 중 사각형들이 덮지 않은 구간. */
function gapsIn(rects: readonly GeometryRect[], width: number): { from: number; to: number }[] {
  const spans = rects
    .map((r) => ({ from: r.rect.x, to: r.rect.x + r.rect.w }))
    .sort((a, b) => a.from - b.from);

  const gaps: { from: number; to: number }[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.from > cursor + 0.001) gaps.push({ from: cursor, to: Math.min(span.from, width) });
    cursor = Math.max(cursor, span.to);
    if (cursor >= width) break;
  }
  if (cursor < width - 0.001) gaps.push({ from: cursor, to: width });
  return gaps.filter((g) => g.to - g.from > 1);
}

/**
 * 가구 간격.
 *
 * 방을 나누는 것은 벽이 아니라 시선을 끊는 가구다. 성기면 복도가 사격장이 되고,
 * 촘촘하면 경비가 아무것도 못 봐서 잠입이 사라진다.
 */
function checkFurnitureSpacing(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  for (const band of layout.bands) {
    const top = band.index * world.floorHeightPx;
    const bottom = top + world.floorHeightPx;
    const xs = layout.geometry
      .filter((g) => g.kind === "blocker" && g.rect.y >= top && g.rect.y < bottom)
      .map((g) => g.rect.x)
      .sort((a, b) => a - b);

    if (xs.length < 2) {
      problems.push(`${band.index} 층의 시선 차단 가구가 ${xs.length} 개다. 은폐할 곳이 없다.`);
      continue;
    }

    for (let i = 1; i < xs.length; i += 1) {
      const a = xs[i - 1];
      const b = xs[i];
      if (a === undefined || b === undefined) continue;
      const gap = b - a;
      if (gap > MAX_FURNITURE_GAP) {
        problems.push(
          `${band.index} 층 x=${a}..${b} 사이가 ${Math.round(gap)}px 뚫려 있다 ` +
            `(상한 ${MAX_FURNITURE_GAP}). 시선을 끊을 것이 없다.`,
        );
      }
      if (gap < MIN_FURNITURE_GAP) {
        problems.push(
          `${band.index} 층 x=${a}..${b} 의 가구가 ${Math.round(gap)}px 로 붙어 있다 ` +
            `(하한 ${MIN_FURNITURE_GAP}). 경비가 아무것도 못 본다.`,
        );
      }
    }
  }
}

function checkLoot(
  layout: MansionLayout,
  world: WorldMetrics,
  surfaceOf: (floor: number) => number,
  problems: string[],
): void {
  if (layout.lootAnchors.length === 0) {
    problems.push("전리품이 없다. 훔칠 것이 없으면 런이 성립하지 않는다.");
    return;
  }

  const floors = new Set<number>();
  for (const anchor of layout.lootAnchors) {
    if (anchor.at.x < 0 || anchor.at.x > layout.widthPx) {
      problems.push(`전리품 ${anchor.id} 이 월드 밖이다: x=${anchor.at.x}`);
    }
    const floor = Math.floor(anchor.at.y / world.floorHeightPx);
    const surface = surfaceOf(floor);
    // 바닥면 위 40px 안에 놓여야 걸어가서 집을 수 있다.
    if (anchor.at.y > surface || surface - anchor.at.y > 40) {
      problems.push(
        `전리품 ${anchor.id} 이 ${floor} 층 바닥면(${surface})에서 떨어져 있다: y=${anchor.at.y}`,
      );
    }
    floors.add(floor);
  }

  if (floors.size < MIN_LOOT_FLOORS) {
    problems.push(
      `전리품이 ${floors.size} 개 층에만 있다 (최소 ${MIN_LOOT_FLOORS}). 층을 오르내릴 이유가 없어진다.`,
    );
  }
}

function checkEscapes(layout: MansionLayout, problems: string[]): void {
  if (layout.escapes.length < 2) {
    problems.push(`탈출구가 ${layout.escapes.length} 개다. 하나뿐이면 경로 선택이 없다.`);
  }
  let hasFree = false;
  for (const escape of layout.escapes) {
    if (escape.bonusMul < 1) problems.push(`탈출구 ${escape.id} 의 배수가 1 미만이다: ${escape.bonusMul}`);
    if (escape.rect.x < 0 || escape.rect.x + escape.rect.w > layout.widthPx) {
      problems.push(`탈출구 ${escape.id} 가 월드 밖이다: x=${escape.rect.x}`);
    }
    if (escape.loadLimit === undefined) hasFree = true;
  }
  // 적재 제한이 없는 탈출구가 하나는 있어야 한다. 전부 제한이면 가득 채운 런이
  // 나갈 곳을 잃는다 — 훔칠수록 불리해지는 것과 나갈 수 없는 것은 다르다.
  if (!hasFree) problems.push("적재 제한이 없는 탈출구가 없다. 가득 채우면 나갈 수 없다.");
}

function checkGuards(layout: MansionLayout, world: WorldMetrics, problems: string[]): void {
  if (layout.guards.length === 0) {
    problems.push("경비가 없다. 잠입할 것이 없다.");
    return;
  }

  const seenIds = new Set<string>();
  for (const guard of layout.guards) {
    if (seenIds.has(guard.id)) problems.push(`경비 id '${guard.id}' 가 중복이다.`);
    seenIds.add(guard.id);
    if (guard.floor < 0 || guard.floor >= layout.bands.length) {
      problems.push(`경비 ${guard.id} 의 층이 범위 밖이다: ${guard.floor}`);
    }
    if (guard.route.length === 0) {
      problems.push(`경비 ${guard.id} 에 순찰 웨이포인트가 없다.`);
      continue;
    }
    for (const x of guard.route) {
      if (x < 0 || x > layout.widthPx) {
        problems.push(`경비 ${guard.id} 의 웨이포인트가 월드 밖이다: x=${x}`);
      }
    }
    if (guard.dwellMs < 0) problems.push(`경비 ${guard.id} 의 dwellMs 가 음수다.`);
    if (
      guard.behaviorPolicy !== undefined
      && (!isGuardBehaviorPolicy(guard.behaviorPolicy) || guard.behaviorPolicy.archetype !== guard.archetype)
    ) {
      problems.push(`경비 ${guard.id} 의 초대 행동 계약이 아키타입과 맞지 않는다.`);
    }
    const readableDwellMs = readablePatrolDwellMs(guard.archetype, guard.dwellMs);
    if (guard.dwellMs < readableDwellMs) {
      problems.push(
        `경비 ${guard.id}(${GUARD_ARCHETYPES[guard.archetype].name.ko}) 의 대기 ${guard.dwellMs}ms가 ` +
          `최소 판독 시간 ${readableDwellMs}ms보다 짧다.`,
      );
    }
    if (guard.activationLootAnchorId !== undefined) {
      const anchor = layout.lootAnchors.find((entry) => entry.id === guard.activationLootAnchorId);
      if (anchor === undefined) {
        problems.push(
          `경비 ${guard.id} 의 활성화 전리품 '${guard.activationLootAnchorId}' 이 레이아웃에 없다.`,
        );
      } else if (floorOfY(anchor.at.y, world.floorHeightPx) !== guard.floor) {
        problems.push(`경비 ${guard.id} 와 활성화 전리품 '${anchor.id}' 이 서로 다른 층이다.`);
      }
    }
    if (guard.activationLootAnchorId !== undefined && guard.activationRunPhase !== undefined) {
      problems.push(`경비 ${guard.id} 에 전리품·런 페이즈 활성화가 동시에 지정됐다.`);
    }
    if (guard.activationRunPhase !== undefined && guard.activationRunPhase !== "greatEscape") {
      problems.push(`경비 ${guard.id} 의 활성화 런 페이즈 '${guard.activationRunPhase}' 를 지원하지 않는다.`);
    }
  }

  // 스폰 층의 순찰이 코앞에서 시작하면, 아직 아무 판단도 하기 전에 발각된다.
  const spawnFloor = floorOfY(layout.spawn.y, world.floorHeightPx);
  for (const guard of layout.guards) {
    if (guard.floor !== spawnFloor) continue;
    // 보상 획득이나 대탈출 이후에야 생기는 매복은 입장 시점에 존재하지 않는다.
    // 이를 일반 순찰처럼 세면 역침투 등 스폰이 바뀌는 카드가 거짓 양성을 낸다.
    if (guard.activationLootAnchorId !== undefined || guard.activationRunPhase !== undefined) continue;
    const nearest = guard.route.reduce(
      (best, x) => Math.min(best, Math.abs(x - layout.spawn.x)),
      Number.POSITIVE_INFINITY,
    );
    if (nearest < MIN_SPAWN_TO_PATROL_PX) {
      problems.push(
        `경비 ${guard.id} 의 순찰이 스폰에서 ${Math.round(nearest)}px 다 ` +
          `(최소 ${MIN_SPAWN_TO_PATROL_PX}). 침투 직후 발각된다.`,
      );
    }
  }
}

/**
 * 뛰어넘는 낮은 장애물이 순찰 구간에 있으면 안 된다.
 *
 * 경비는 지형 충돌을 하지 않아 상자를 통과해 버린다. 나만 못 넘는 물건이
 * 복도 한가운데 서 있게 되고, 그 비대칭은 화면에서 설명되지 않는다.
 */
export function obstaclesOnPatrolRoute(
  layout: MansionLayout,
  floor: number,
  route: readonly number[],
  world: WorldMetrics,
): readonly GeometryRect[] {
  const surface = floorSurfaceY(floor, world.floorHeightPx, world.slabThicknessPx);
  const from = Math.min(...route) - PATROL_OBSTACLE_PAD;
  const to = Math.max(...route) + PATROL_OBSTACLE_PAD;
  return layout.geometry.filter((geo) => {
    if (geo.kind !== "solid") return false;
    // 바닥 슬래브도 바깥벽도 아닌, 바닥에 놓인 작은 solid 만 본다.
    if (Math.floor(geo.rect.y / world.floorHeightPx) !== floor) return false;
    const sitsOnFloor = geo.rect.y + geo.rect.h > surface - 1 && geo.rect.y < surface;
    return sitsOnFloor
      && geo.rect.w <= 200
      && spansOverlap(geo.rect.x, geo.rect.x + geo.rect.w, from, to);
  });
}

function checkObstaclesOffPatrol(
  layout: MansionLayout,
  world: WorldMetrics,
  problems: string[],
): void {
  for (const guard of layout.guards) {
    for (const geo of obstaclesOnPatrolRoute(layout, guard.floor, guard.route, world)) {
      problems.push(
        `장애물 ${geo.id} 이 경비 ${guard.id} 의 순찰 구간 안에 있다. ` +
          "경비는 통과하고 플레이어만 막힌다.",
      );
    }
  }
}

/** 층간 시야는 사다리 샤프트에서만 통해야 한다. 근거 없는 구멍은 부당한 발각이 된다. */
function checkVisionHoles(layout: MansionLayout, ladders: readonly LadderInfo[], problems: string[]): void {
  const holes = layout.geometry.filter((g) => g.kind === "visionHole");
  for (const hole of holes) {
    const aligned = ladders.some((l) =>
      spansOverlap(hole.rect.x, hole.rect.x + hole.rect.w, l.link.rect.x, l.link.rect.x + l.link.rect.w),
    );
    if (!aligned) {
      problems.push(
        `시야 구멍 ${hole.id} 이 어떤 사다리 샤프트와도 겹치지 않는다. ` +
          "화면에 보이는 것 없이 층간 시야가 통한다.",
      );
    }
  }
}

/** 은신처가 사다리와 겹치면 F 와 W 가 같은 자리에서 싸운다. */
function checkHideSpots(layout: MansionLayout, ladders: readonly LadderInfo[], problems: string[]): void {
  for (const spot of layout.hideSpots) {
    if (spot.searchWeight <= 0) {
      problems.push(`은신처 ${spot.id} 의 수색 가중치가 ${spot.searchWeight} 다. 아무도 열어보지 않는다.`);
    }
    for (const ladder of ladders) {
      const overlapsX = spansOverlap(
        spot.rect.x,
        spot.rect.x + spot.rect.w,
        ladder.link.rect.x,
        ladder.link.rect.x + ladder.link.rect.w,
      );
      const overlapsY = spansOverlap(
        spot.rect.y,
        spot.rect.y + spot.rect.h,
        ladder.link.rect.y,
        ladder.link.rect.y + ladder.link.rect.h,
      );
      if (overlapsX && overlapsY) {
        problems.push(`은신처 ${spot.id} 가 사다리 ${ladder.link.id} 와 겹친다.`);
      }
    }
  }
}
