import type { MansionLayout, ParkourRoute } from "./MansionLayout";
import { floorSurfaceY } from "./MansionLayout";
import type { WorldTuning } from "./tuning";

/**
 * 블랙손 잠입판의 고정 id. 화면·문구·판정이 id 만 필요할 때 쓴다.
 * 좌표는 여기 없다 — 실제 판의 좌표는 `blackthorneGeometry(layout)` 에서 읽는다.
 */
export const BLACKTHORNE_HEIST_IDS = Object.freeze({
  /** 창 밖 회랑의 금고지기. 옛 수장고 경비 자리의 id 를 잇는다. */
  bossId: "manor-vault-watch",
  stairLatchId: "heist-stair-latch",
  keyId: "heist-keeper-key",
  servantLockId: "heist-keeper-servant-lock",
  returnId: "heist-keeper-return",
  escapePassageId: "heist-counterweight-exit",
  escapeReturnId: "heist-counterweight-return",
  entryId: "heist-service-bypass",
  rearGateId: "heist-counterweight-gate",
  recoveryLadderId: "heist-roof-recovery",
} as const);

/** 창 문턱. 이 x 부터 바깥 지붕 회랑이다. 가로 좌표는 층 높이와 무관하다. */
export const BLACKTHORNE_EXTERIOR_START_X = 1602;

/** Authored horizontal positions stay fixed; vertical positions share the floor surfaces.
 * The resolved data travels in the layout (`manor.spatialGeometry`) so replay, projections and views use identical geometry.
 * 이 객체의 키 순서·내용은 직렬화된다(`blackthorne-heist-layout-golden`).
 */
export function resolveBlackthorneGeometry(world: Pick<WorldTuning, "floorHeightPx" | "slabThicknessPx">) {
  const { floorHeightPx, slabThicknessPx } = world;
  const floorSurfaces = [0, 1, 2, 3].map(floor => floorSurfaceY(floor, floorHeightPx, slabThicknessPx));
  const surface = (floor: number) => floorSurfaces[floor]!;
  const ids = BLACKTHORNE_HEIST_IDS;
  const tableY = surface(2) - 48;
  const ladderY = surface(1) - 32;
  const recoveryY = surface(0) + 132;
  // 아트리움 경로. id 의 "chandelier" 는 옛 이름이다(지금은 고리 사슬이 같은 공간을 건넌다). 리플레이 호환으로 둔다.
  const parkour: ParkourRoute = {
    id: "blackthorne-chandelier-window", from: { x: 1000, y: surface(0) + 40 },
    grab: { x: 1028, y: surface(0) - 8 }, anchor: { x: 1140, y: surface(0) - 168 },
    to: { x: 1400, y: surface(0) }, recovery: { x: 1200, y: surface(2) }, throwable: false,
  };
  const heist = {
    bossId: ids.bossId, stairLatchId: ids.stairLatchId, keyId: ids.keyId,
    returnId: ids.returnId, escapePassageId: ids.escapePassageId, escapeReturnId: ids.escapeReturnId,
    entryId: ids.entryId, stairLatch: { x: 865, y: surface(1) }, keyAt: { x: 2360, y: surface(0) },
    // Extend the bottom rung with the lower floor. Table-to-catch reach remains unchanged.
    entryLadder: { x: 780, y: ladderY, w: 20, h: tableY - 94 - ladderY },
    entryTable: { x: 743, y: tableY, w: 94, h: 48 },
    rearGateId: ids.rearGateId,
    rearGate: { x: 1556, y: floorHeightPx * 2, w: 24, h: surface(2) - floorHeightPx * 2 },
    serviceGate: { x: 1494, y: surface(1), w: 32, h: slabThicknessPx },
    keeperGate: { x: 2430, y: 0, w: 20, h: surface(0) },
    // Back-wall service door. Only the worker uses it; it adds no player collision or traversal link.
    servantDoor: { id: ids.servantLockId, x: 2020, y: surface(0), safeX: BLACKTHORNE_EXTERIOR_START_X - 24, width: 84, height: 116 },
    midpointLatch: { x: 1360, y: surface(1) }, width: 2640, exteriorStartX: BLACKTHORNE_EXTERIOR_START_X,
    recoveryDeck: { x: 2450, y: recoveryY, w: 190, h: 12 },
    recoveryLadderId: ids.recoveryLadderId,
    recoveryLadder: { x: 2508, y: surface(0) - 32, w: 20, h: recoveryY - surface(0) + 32 },
  };
  // 실내 고리 사슬 넷. 창 밖 회랑에는 고리가 없다(금고지기 결투는 바닥 길이다).
  const grappleAnchors = [
    { id: "atrium-chain", at: { x: 1110, y: surface(0) - 132 } },
    { id: "vault-approach-chain", at: { x: 1250, y: surface(0) - 128 } },
    { id: "vault-chain", at: { x: 1430, y: surface(0) - 126 } },
    { id: "window-chain", at: { x: 1550, y: surface(0) - 126 } },
  ];
  return { floorHeightPx, slabThicknessPx, floorSurfaces, heist, parkour, grappleAnchors };
}

export type BlackthorneSpatialGeometry = ReturnType<typeof resolveBlackthorneGeometry>;

/**
 * 블랙손 레이아웃에 실린 공간 좌표. 블랙손이 아니거나 `manor.spatialGeometry` 가 없는 레이아웃이면 에러다 —
 * 옛 180px 대체 좌표는 없다(2026-10-01). 그런 옛 리플레이는 `MansionValidator` 가 미리 거절한다.
 */
export function blackthorneGeometry(layout: Pick<MansionLayout, "id" | "manor">): BlackthorneSpatialGeometry {
  const geometry = layout.manor?.spatialGeometry;
  if (geometry === undefined) {
    throw new Error(`blackthorneGeometry: layout "${layout.id}" is not a Blackthorne layout with manor.spatialGeometry`);
  }
  return geometry;
}
