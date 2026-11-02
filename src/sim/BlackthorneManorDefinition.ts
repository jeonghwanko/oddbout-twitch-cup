import { blackthorneCameraZones } from "./BlackthorneCameraZones";
import { heistMechanism } from "./BlackthorneMechanismRules";
import { BLACKTHORNE_EXTERIOR_START_X, resolveBlackthorneGeometry } from "./BlackthorneSpatialGeometry";
import { EXHIBITION_CRANK_ID, EXHIBITION_LATCH_ID, type ExhibitionDefinition } from "./ExhibitionRules";
import { propsOf, kitOfFloor } from "./MansionProps";
import type { CaperChain, GeometryRect, MansionLayout, VerticalLink } from "./MansionLayout";
import { BLACKTHORNE_HEIST_FLOOR_HEIGHT_PX, type WorldTuning } from "./tuning";
import type { Rect, Vec2 } from "./GeometryTypes";

export interface ManorRoom {
  readonly id: string;
  readonly floor: number;
  readonly fromX: number;
  readonly toX: number;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly clueKo: string;
  readonly clueEn: string;
}
export interface ManorRoute {
  readonly id: string;
  readonly floor: number;
  readonly observeX: number;
  /** 이 표지만의 관찰 반경. 없으면 공용 `MANOR_TUNING.previewReachPx`. 배우의 말 걸기 구간을 피해야 할 때만 쓴다. */
  readonly reachPx?: number;
  readonly linkId?: string;
  readonly towardX?: number;
  readonly direction: "up" | "down" | "left" | "right";
  readonly nameKo: string;
  readonly nameEn: string;
  readonly factKo: string;
  readonly factEn: string;
}
export interface ManorDefinition {
  /** Resolved authored coordinates, serialized with the layout for replay and projections. */
  readonly spatialGeometry: import("./BlackthorneSpatialGeometry").BlackthorneSpatialGeometry;
  /** 블랙손 잠입판 표지. 판이 하나뿐이라 늘 true 다(`layout.manor !== undefined` 와 같은 뜻). */
  readonly heist: true;
  /** 1F 크랭크 → 중간 안전 걸쇠 → 도킹하는 전시 승강기. */
  readonly exhibition: import("./ExhibitionRules").ExhibitionDefinition;
  /** The original bird is already home; this visit rehearses another approach without a second reward. */
  readonly rehearsal?: boolean;
  readonly daggerLights?: boolean;
  readonly disguisePassage?: boolean;
  readonly guestReceptionRoomIds?: readonly string[];
  readonly initialMemory?: import("./ManorMemoryRules").ManorMemory;
  /** 이 런을 짠 진행의 그리브스 첫 편 기억(`RunLoadout`). 없으면 미경험. sim 은 `servantFreed` 만 읽는다(`GrievesStoryRules`). */
  readonly initialGrievesStory?: import("./GrievesStoryRules").GrievesStoryMemory;
  readonly patrolVariant?: number;
  readonly targetAnchorId: string;
  readonly rooms: readonly ManorRoom[];
  readonly routes: readonly ManorRoute[];
  /** 1F 도르레 크랭크 체인(`EXHIBITION_CRANK_ID`, `exhibition.crankId` 와 같다). 크랭크 연출이 이 id 로 장치를 알아본다. */
  readonly crankChainId: string;
}
export const BLACKTHORNE_TARGET_ID = "blackthorne-clockwork-bird";
/** The one rooftop escape the heist route ends at. Presentation keys its "core window" art on this id. */
export const BLACKTHORNE_ESCAPE_ID = "manor-roof-window";

/**
 * 근무표. 방문 0 = 첫 방문, 1~3 = 재방문 순환(`createBlackthorneManor` 의 variant). 생성기·sim 난수를 쓰지 않는다.
 * 전시실·주방 순찰은 구간이 고정이고 대기 시간과 첫 방향만 돈다. 금고지기 자리는 근무표와 무관하다.
 */
const DUTY_ROSTERS = [
  { galleryDwellMs: 2800, kitchenDwellMs: 3200, facing: 1 },
  { galleryDwellMs: 1900, kitchenDwellMs: 2100, facing: 1 },
  { galleryDwellMs: 3500, kitchenDwellMs: 3700, facing: -1 },
  { galleryDwellMs: 2300, kitchenDwellMs: 2600, facing: 1 },
] as const;
/**
 * 회수 순간 깨어나는 경보 증원(근무표 variant 별). Revisit pressure changes the escape approach,
 * never seals an exit or consumes RNG. 0·3 은 2F 중층 정비실, 1 은 3F 처마, 2 는 1F 주방이다.
 */
export const BLACKTHORNE_ALARM_POSTS = [
  { floor: 1, route: [1320, 1510], dwellMs: 1400, facing: -1 },
  { floor: 0, route: [1800, 1930], dwellMs: 1800, facing: -1 },
  { floor: 2, route: [1780, 1940], dwellMs: 2200, facing: -1 },
  { floor: 1, route: [1320, 1510], dwellMs: 1600, facing: -1 },
] as const;

export const BLACKTHORNE_ROOMS: readonly ManorRoom[] = [
  { id: "foyer", floor: 2, fromX: 0, toX: 440, nameKo: "현관 · 동방 주식회사 전무이사", nameEn: "FOYER", clueKo: "동방 주식회사 전무이사로 들어왔다. 빌려 간 태엽새를 되찾아 시계공에게 돌려주자. 위층 수장고로.", clueEn: "You are the Eastern Company’s Executive Director tonight. Recover the borrowed bird from the upstairs vault and return it to the clockmaker." },
  { id: "reception", floor: 2, fromX: 440, toX: 1560, nameKo: "응접실 · 빌려온 박수", nameEn: "RECEPTION", clueKo: "손님들은 손을 내렸는데, 초상 아래의 박수는 계속된다.", clueEn: "The guests have stopped clapping. The portrait has not." },
  { id: "kitchen", floor: 2, fromX: 1560, toX: 2040, nameKo: "도르레 정비실 · 균형추", nameEn: "LIFT WORKROOM", clueKo: "도르레와 정비 사다리는 금고지기의 열쇠로 풀린다. 전시대가 아래에 닿으면 균형추 뒤 통로가 열린다.", clueEn: "The keeper's key unlocks the pulley and service ladder. Docking the display opens the counterweight passage." },
  { id: "gallery", floor: 1, fromX: 0, toX: 1160, nameKo: "전시실 · 빌린 이름들", nameEn: "GALLERY", clueKo: "금빛 명패 아래, 마을 사람들의 이름이 긁혀 있다.", clueEn: "Under the gilt labels: scratched-out names of villagers." },
  { id: "registry", floor: 1, fromX: 1160, toX: 2040, nameKo: "중층 정비실 · 안전 걸쇠", nameEn: "SAFETY CATCH LANDING", clueKo: "하강 중인 전시대가 여기서 멈춘다. 멈춘 뒤 안전 걸쇠를 풀면 아래층까지 내려간다.", clueEn: "The descending display stops here. Release its safety catch after it stops to reach the lower dock." },
  { id: "workshop", floor: 0, fromX: 0, toX: 900, nameKo: "상부 기계실", nameEn: "UPPER MACHINERY", clueKo: "전시대의 굵은 체인이 유리 보관 구획으로 이어진다. 옆 복도에서는 들어갈 수 없다.", clueEn: "The lift chains enter the sealed storage enclosure. The corridor has no entrance." },
  { id: "vault", floor: 0, fromX: 900, toX: BLACKTHORNE_EXTERIOR_START_X, nameKo: "수장고 · 멈춘 노래", nameEn: "VAULT", clueKo: "새는 봉인되어 있다. 창 너머 금고지기의 열쇠로 도르레를 움직이자.", clueEn: "The bird is sealed. The keeper outside holds the lift key." },
  { id: "storage", floor: 3, fromX: 0, toX: 2040, nameKo: "지하 창고 · 돌려줄 물건들", nameEn: "STORAGE", clueKo: "천에 싸인 마을의 물건들. 욕심내면 돌아갈 때 자루가 무거워진다.", clueEn: "Villagers' belongings, wrapped in cloth. A heavier bag makes the return harder." },
  // 창 밖 지붕 회랑. 금고지기와 결투하는 곳이며 방 발견 기억에도 저장된다.
  { id: "keeper-eaves", floor: 0, fromX: BLACKTHORNE_EXTERIOR_START_X, toX: 2430, nameKo: "금고지기의 회랑", nameEn: "KEEPER'S WALK", clueKo: "돌진을 피하고 등을 노리자. 제압한 뒤 열쇠를 직접 훔친다.", clueEn: "Dodge the charge and take his back. Steal the key after the fight." },
];

// ── 가로 저작 좌표. 층 높이와 무관하다 — 세로는 모두 바닥면(`spatial.floorSurfaces`)에서 잰다. ──
// 이름 붙은 좌표의 나머지(테이블·사다리·걸쇠·열쇠·문·회랑 갑판·고리)는 `resolveBlackthorneGeometry` 가 소유한다.

/** 실내 폭. 그 동쪽(…`heist.width`)은 창 밖 지붕 회랑이다. */
const INTERIOR_WIDTH_PX = 2040;
/** 바닥판의 사다리 구멍은 32px 폭이고, 20px 사다리를 6px 안쪽 가운데에 둔다. */
const WELL_W = 32;
const WELL_INSET = 6;
const HATCH_H = 8;
/** 옛 계단 사다리 자리. 사다리는 모두 걷어 냈고 바닥판 틈만 남아 `heist-sealed-*` 판이 메운다(뚜껑·시야 구멍 없음). */
const OLD_STAIR_X = { attic: 520, grand: 900, cellar: 1510, staff: 1800 } as const;
/** 두 층 높이 아트리움. 3F 바닥은 `roofCutX` 부터, 2F 바닥과 시야는 `left` 부터 수장고 서벽(`right`)까지 뚫렸다. */
const ATRIUM = { roofCutX: 900, left: 930, right: 1280 } as const;
/** 수장고 유리 구획의 두 기둥. 위 상인방과 아래 문턱만 있고 그 사이로 고리 사슬이 지나간다. */
const VAULT_PILLAR_X = { left: ATRIUM.right, right: 1570 } as const;
const VAULT_PILLAR_W = 32;
/** 아트리움 2F 쪽 출발 발코니와 그 서쪽 끝을 오르는 배수관. */
const BALCONY = { x: 940, w: 80 } as const;
const DRAINPIPE_X = 950;
/** 옛 가구 네 칸. 남은 가구는 층마다 칸 번호로 고르고, id 끝 번호가 칸 번호다. */
const FURNITURE_X = [350, 1050, 1350, 1750] as const;
/** 등 네 칸(id 끝 번호). null 은 등이 없는 칸 — 2F 셋째 칸은 뚫린 아트리움이다. */
const LAMP_ROWS: readonly (readonly (number | null)[])[] = [
  [210, 650, 1450, 1880],
  [210, 650, null, 1880],
  [210, 650, 1550, 1880],
  [210, 650, 1160, 1880],
];
/** 전시 승강기 받침과 태엽새의 x, 1F 도르레 크랭크의 x. */
const DISPLAY_X = 1450;
const CRANK_X = 1190;
/** 창 밖 회랑 지붕은 `roofEndX` 에서 끊기고 `landingX` 부터 옥상 창 앞 착지대가 다시 이어진다. 그 틈 아래가 복귀 갑판이다. */
const EAVES = { roofEndX: 2470, landingX: 2530 } as const;
/** 금고지기가 서는 회랑 자리, 옥상 창(탈출구이자 퇴로 준비 자리). */
const KEEPER_POST_X = 2180;
const ROOF_WINDOW_X = 2570;

/**
 * 플레이어가 실제로 들어가는 블랙손 하나를 그대로 짓는다. 덧입히는 단계가 없다 — 아래 목록이 최종 지형이다.
 * 결과는 `test/blackthorne-heist-layout-golden.test.ts` 가 바이트 단위로 고정한다(id·배열 순서·키 순서 포함).
 * 일부 id(`floor-1-1-atrium-right-west`, `dark-manor-*`, `exhibition-*` 등)는 옛 조립 단계의 이름이 그대로 직렬화된 것이다.
 * No generator RNG is consumed.
 */
export function createBlackthorneManor(world: WorldTuning, memory?: import("./ManorMemoryRules").ManorMemory): MansionLayout {
  // 블랙손은 210px 층에서만 존재한다. 다른 층 높이로 지으면 플레이어가 보지 않는 좌표가 나오므로 즉시 막는다.
  if (world.floorHeightPx !== BLACKTHORNE_HEIST_FLOOR_HEIGHT_PX) {
    throw new Error(`createBlackthorneManor: world.floorHeightPx must be ${BLACKTHORNE_HEIST_FLOOR_HEIGHT_PX}; use blackthorneRunTuning(tuning).world`);
  }
  const spatial = resolveBlackthorneGeometry(world);
  const { heist: h, parkour: route } = spatial;
  const recovery = route.recovery!;
  const storey = world.floorHeightPx;
  const slabH = world.slabThicknessPx;
  const y = (floor: number) => spatial.floorSurfaces[floor]!;
  // First entry remains authored. Revisit rotation consumes no generator or sim RNG.
  const variant = memory === undefined || memory.visits === 0 ? 0 : 1 + (memory.visits - 1) % 3;
  const duty = DUTY_ROSTERS[variant]!;

  // 사다리 구멍의 왼쪽 끝.
  const atticWell = OLD_STAIR_X.attic - WELL_INSET;
  const grandWell = OLD_STAIR_X.grand - WELL_INSET;
  const cellarWell = OLD_STAIR_X.cellar - WELL_INSET;
  const staffWell = OLD_STAIR_X.staff - WELL_INSET;
  const entryWell = h.entryLadder.x - WELL_INSET;
  const serviceWell = h.serviceGate.x;

  const solid = (id: string, rect: Rect): GeometryRect => ({ id, kind: "solid", rect });
  const slab = (id: string, floor: number, fromX: number, toX: number): GeometryRect =>
    solid(id, { x: fromX, y: y(floor), w: toX - fromX, h: slabH });
  const hatch = (id: string, floor: number, x: number): GeometryRect => ({ id, kind: "platform", rect: { x, y: y(floor), w: WELL_W, h: HATCH_H } });
  const sight = (id: string, floor: number, x: number): GeometryRect => ({ id, kind: "visionHole", rect: { x, y: y(floor), w: WELL_W, h: slabH } });
  const dark = (floor: number, fromX: number, toX: number): GeometryRect =>
    ({ id: `dark-manor-${floor}`, kind: "dark", rect: { x: fromX, y: floor * storey, w: toX - fromX, h: storey } });
  const furniture = (floor: number, slot: 0 | 1 | 2 | 3): GeometryRect => {
    // 층 소품 묶음의 가리개를 칸 번호 순으로 돌려 쓴다(묶음이 칸보다 짧으면 처음으로 돌아간다).
    const blockers = propsOf(kitOfFloor(floor), "blocker");
    const prop = blockers[slot % blockers.length]!;
    return { id: `${prop.id}-manor-${floor}-${slot}`, kind: "blocker", rect: { x: FURNITURE_X[slot], y: y(floor) - prop.h, w: prop.w, h: prop.h } };
  };
  const pillar = (id: string, x: number): GeometryRect[] => [
    solid(`${id}-lintel`, { x, y: 0, w: VAULT_PILLAR_W, h: 32 }),
    solid(`${id}-sill`, { x, y: y(0) - 12, w: VAULT_PILLAR_W, h: 12 }),
  ];
  const vase = propsOf(kitOfFloor(1), "decor").find(prop => prop.id === "ceramic-vase")!;

  const geometry: GeometryRect[] = [
    // 외곽: 서벽, 창 밖 회랑 끝(`heist.width`)까지 간 동벽과 지붕.
    solid("wall-left", { x: -10, y: 0, w: 10, h: storey * 4 }),
    solid("wall-right", { x: h.width, y: 0, w: 10, h: storey * 4 }),
    solid("roof", { x: -10, y: -10, w: h.width + 20, h: 10 }),

    // 3F 상부 기계실·수장고. 다락 계단 자리(아래 `heist-sealed-attic` 이 메운다)와 아트리움 위로 뚫린 바닥.
    slab("floor-0-0", 0, 0, atticWell),
    slab("floor-0-end-atrium-left", 0, atticWell + WELL_W, ATRIUM.roofCutX),
    slab("floor-0-end-atrium-right", 0, ATRIUM.right, INTERIOR_WIDTH_PX),
    furniture(0, 0),
    dark(0, 1030, 1330),

    // 2F 전시실·중층 정비실. 짧은 사다리 구멍, 봉인한 대계단, 아트리움, 정비 사다리 구멍, 봉인한 직원 계단.
    slab("floor-1-0-west", 1, 0, entryWell),
    slab("floor-1-0-east", 1, entryWell + WELL_W, grandWell),
    slab("floor-1-1-atrium-left", 1, grandWell + WELL_W, ATRIUM.left),
    slab("floor-1-1-atrium-right-west", 1, ATRIUM.right, serviceWell),
    slab("floor-1-1-atrium-right-east", 1, serviceWell + WELL_W, staffWell),
    slab("floor-1-end", 1, staffWell + WELL_W, INTERIOR_WIDTH_PX),
    furniture(1, 0), furniture(1, 3),
    dark(1, 1030, 1330),

    // 1F 현관·응접실·도르레 정비실. 지하 계단 자리(아래 `heist-sealed-cellar` 가 메운다).
    slab("floor-2-0", 2, 0, cellarWell),
    slab("floor-2-end", 2, cellarWell + WELL_W, INTERIOR_WIDTH_PX),
    furniture(2, 3),
    // Preparation and a missed ring share an actual shadow pocket. The target dock
    // stays exposed: darkness is a tactical surface, not decorative lighting advice.
    dark(2, route.from.x - 80, recovery.x + 60),

    // B1 지하 창고.
    slab("floor-3-end", 3, 0, INTERIOR_WIDTH_PX),
    furniture(3, 0), furniture(3, 1), furniture(3, 2), furniture(3, 3),
    dark(3, 1030, 1330),

    // A low display vase screens a crouched first throw from the stair, including return patrols.
    { id: `${vase.id}-gallery-approach`, kind: "blocker", rect: { x: 790, y: y(1) - vase.h, w: vase.w, h: vase.h } },
    // 수장고 유리 구획.
    ...pillar("exhibition-vault-left", VAULT_PILLAR_X.left),
    ...pillar("exhibition-vault-right", VAULT_PILLAR_X.right),
    { id: "exhibition-service-ledge", kind: "platform", rect: { x: 1650, y: y(1) - 85, w: 170, h: 8 } },
    // 아트리움: 출발 발코니, 위아래로 뚫린 시야.
    { id: "parkour-departure-balcony", kind: "platform", rect: { x: BALCONY.x, y: route.from.y, w: BALCONY.w, h: 10 } },
    { id: "parkour-open-atrium", kind: "visionHole", rect: { x: ATRIUM.left, y: 0, w: ATRIUM.right - ATRIUM.left, h: recovery.y } },
    // 응접실 테이블과 그 위 짧은 사다리 구멍(1F → 2F).
    { id: "heist-entry-table", kind: "platform", rect: { ...h.entryTable, h: 8 } },
    hatch("heist-entry-hatch", 1, entryWell),
    sight("heist-entry-sight", 1, entryWell),
    slab("heist-sealed-grand-stair", 1, grandWell, grandWell + WELL_W),
    // 회랑 동쪽 끝: 복귀 갑판과 그 위 금고지기 철문 아래 벽.
    solid("heist-roof-recovery-deck", h.recoveryDeck),
    solid("heist-roof-recovery-wall", { x: h.keeperGate.x, y: y(0), w: h.keeperGate.w, h: h.recoveryDeck.y - y(0) }),
    // The drainpipe needs solid lips for the shared ladder dismount rule.
    solid("heist-balcony-west-lip", { x: BALCONY.x, y: route.from.y, w: 8, h: 10 }),
    solid("heist-balcony-east-lip", { x: 976, y: route.from.y, w: BALCONY.x + BALCONY.w - 976, h: 10 }),
    slab("heist-sealed-attic", 0, atticWell, atticWell + WELL_W),
    slab("heist-sealed-staff", 1, staffWell, staffWell + WELL_W),
    slab("heist-sealed-cellar", 2, cellarWell, cellarWell + WELL_W),
    // 창 밖 지붕 회랑의 바닥, 그 아래를 막는 외벽.
    slab("heist-exterior-extension", 0, INTERIOR_WIDTH_PX, EAVES.roofEndX),
    slab("heist-escape-landing", 0, EAVES.landingX, h.width),
    solid("heist-lower-boundary", { x: INTERIOR_WIDTH_PX, y: storey, w: 20, h: storey * 3 }),
    solid("heist-keeper-gate", h.keeperGate),
    // 2F 정비 사다리 구멍. 열쇠 전에는 `ExteriorHeistRules` 가 `heist.serviceGate` 덮개를 얹는다.
    hatch("heist-service-hatch", 1, serviceWell),
    sight("heist-service-sight", 1, serviceWell),
  ];

  const vent = (id: string, floor: number, x: number, w: number, exit: Vec2): VerticalLink =>
    ({ id, kind: "vent", rect: { x, y: y(floor) - 38, w, h: 38 }, exit, travelMs: 900, guardUsable: false });
  const links: VerticalLink[] = [
    // 2F 발코니 → 3F. 계단 걸쇠 전에는 `ExteriorHeistRules` 가 숨긴다.
    { id: "parkour-drainpipe", kind: "ladder", rect: { x: DRAINPIPE_X, y: route.from.y - 32, w: 20, h: recovery.y - route.from.y + 32 }, guardUsable: false },
    { id: h.recoveryLadderId, kind: "ladder", rect: h.recoveryLadder, guardUsable: false },
    { id: h.entryId, kind: "ladder", rect: h.entryLadder, catchPadding: { x: 22, bottom: 10 }, guardUsable: false },
    // 회랑의 바닥 뚜껑 문 → 1F 응접실. 열쇠를 쥐어야 열린다.
    vent(h.returnId, 0, 2362, 36, { x: 1320, y: y(2) }),
    // 1F → 2F 정비 사다리. 열쇠를 쥐어야 열린다.
    { id: "heist-service-stair", kind: "ladder", rect: { x: serviceWell + WELL_INSET, y: y(1) - 32, w: 20, h: storey + 32 }, guardUsable: false },
    // 균형추 통로(1F ↔ 옥상 창 앞). 전시대가 도킹하면 열린다(`ExhibitionRules.exhibitionLayout`).
    vent(h.escapeReturnId, 0, 2452, 28, { x: 1628, y: y(2) }),
    vent(h.escapePassageId, 2, 1612, 36, { x: 2464, y: y(0) }),
  ];

  const crank = (id: string, at: Vec2): CaperChain => ({ id, reusableOnEscape: false, floor: 2, fromX: at.x - 45, toX: at.x + 45, rootDeviceId: id,
    devices: [{ id, kind: "armor", floor: 2, triggerAt: at, impactAt: at, visualAt: at, impactRadiusPx: 0, noiseRadiusPx: 100, effect: "stagger", direction: 1, delayMs: 0 }] });
  const exhibition: ExhibitionDefinition = {
    x: DISPLAY_X, upperY: y(0), lowerY: y(2), crank: { x: CRANK_X, y: y(2) },
    latch: h.midpointLatch, crankId: EXHIBITION_CRANK_ID, latchId: EXHIBITION_LATCH_ID,
  };
  const hide = (floor: number, slot: number, x: number) =>
    ({ id: `manor-hide-${floor}-${slot}`, rect: { x, y: y(floor) - 70, w: 34, h: 70 }, searchWeight: 1 });
  const ring = (id: string) => spatial.grappleAnchors.find(anchor => anchor.id === id)!;

  const layout: MansionLayout = {
    id: "blackthorne-manor", name: "블랙손 저택 · 빌려온 박수", widthPx: h.width,
    bands: [{ index: 0, name: "3F 공작실 · 수장고", light: 0.75 }, { index: 1, name: "2F 전시실 · 기록실", light: 0.8 }, { index: 2, name: "1F 현관 · 주방", light: 0.85 }, { index: 3, name: "B1 지하 창고", light: 0.4 }],
    geometry, links,
    physicsProps: [
      { id: "vault-serving-cart", kind: "cart", rect: { x: 820, y: y(0) - 48, w: 60, h: 48 } },
      { id: "gallery-display-cart", kind: "cart", rect: { x: 280, y: y(1) - 48, w: 60, h: 48 } },
    ],
    // East-room hiding art is wider than its interaction rect: the east wardrobes stand at 1680, clear of the furniture at 1750.
    // 3F 에는 숨을 곳이 없다(아트리움과 창 밖).
    hideSpots: [hide(1, 1, 1680), hide(2, 0, 980), hide(2, 1, 1680), hide(3, 0, 980), hide(3, 1, 1680)],
    lamps: LAMP_ROWS.flatMap((row, floor) => row.flatMap((x, slot) => x === null ? []
      : [{ id: `manor-lamp-${floor}-${slot}`, at: { x, y: y(floor) - 105 }, radius: 155, snuffable: true }])),
    environmentHazards: [], combatPockets: [], crowds: [],
    guards: [
      { id: "manor-gallery-watch", archetype: "patroller", floor: 1, route: [560, 680], dwellMs: duty.galleryDwellMs, facing: duty.facing },
      { id: h.bossId, archetype: "bruiser", floor: 0, route: [KEEPER_POST_X], dwellMs: 0, facing: -1 },
      { id: "manor-kitchen-watch", archetype: "patroller", floor: 2, route: [1740, 1900], dwellMs: duty.kitchenDwellMs, facing: duty.facing },
      { id: "manor-alarm-watch", archetype: "patroller", ...BLACKTHORNE_ALARM_POSTS[variant]!, activationLootAnchorId: BLACKTHORNE_TARGET_ID },
    ],
    lootAnchors: [
      { id: BLACKTHORNE_TARGET_ID, lootId: "clockwork-bird", at: { x: DISPLAY_X, y: y(0) - 20 } },
      { id: "manor-ledger", lootId: "rarebook", at: { x: 1730, y: y(1) - 20 } },
    ],
    requiredLootAnchorIds: [BLACKTHORNE_TARGET_ID],
    escapes: [{ id: BLACKTHORNE_ESCAPE_ID, name: "처마 너머 탈출", kind: "window", facing: 1, requiresPreparation: true,
      rect: { x: ROOF_WINDOW_X, y: y(0) - 60, w: 48, h: 60 }, bonusMul: 1 }],
    // 크랭크(1F) → 중간 안전 걸쇠(2F) → 계단 걸쇠(2F, 배수관 잠금) → 금고지기 열쇠(창 밖).
    caperChains: [
      crank(EXHIBITION_CRANK_ID, exhibition.crank),
      heistMechanism(EXHIBITION_LATCH_ID, h.midpointLatch, storey),
      heistMechanism(h.stairLatchId, h.stairLatch, storey),
      heistMechanism(h.keyId, h.keyAt, storey),
    ],
    manor: {
      daggerLights: true,
      disguisePassage: true,
      guestReceptionRoomIds: ["foyer", "reception"],
      initialMemory: memory, patrolVariant: variant,
      targetAnchorId: BLACKTHORNE_TARGET_ID, rooms: BLACKTHORNE_ROOMS,
      crankChainId: EXHIBITION_CRANK_ID,
      routes: [
        // 현관 끝(210~390)에서만 읽힌다. 응접실 배우(부인 500·신사 590·주인 680)의 말 걸기 구간(±105)은
        // 395 부터라 겹치지 않고, 테이블(790) 쪽은 첫 갈림길 구간(720~)이 표지를 끈다. 스폰(100)의 수다도 가리지 않는다.
        { id: "heist-entry", floor: 2, observeX: 300, reachPx: 90, towardX: h.entryTable.x + h.entryTable.w / 2, direction: "right", nameKo: "테이블 · 짧은 사다리", nameEn: "TABLE · SHORT LADDER", factKo: "테이블에 올라 점프한 뒤 위 방향으로 사다리 잡기", factEn: "Jump from the table and hold up to catch the ladder" },
        { id: "heist-balcony", floor: 1, observeX: 855, towardX: DRAINPIPE_X, direction: "up", nameKo: "고리 발코니", nameEn: "RING BALCONY", factKo: "스위치로 배수관 잠금을 풀고 위로", factEn: "Pull the switch, then climb the pipe" },
        { id: "heist-lift", floor: 2, observeX: CRANK_X, towardX: DISPLAY_X, direction: "right", nameKo: "태엽새 · 도르레", nameEn: "BIRD · LIFT", factKo: "키 → 중간 걸쇠 → 하부 받침", factEn: "Key → safety catch → lower dock" },
      ],
      exhibition,
      spatialGeometry: spatial,
      heist: true,
    },
    spawn: { x: 100, y: y(2) },
    parkourRoutes: [route],
    // Keep traversal rings indoors; the exterior keeper fight uses the ground lane.
    // 창을 지나 수장고 고리에 잡히면 매달려 ↓ 를 기다리지 않고 스스로 뛰어내려 수장고에 들어선다.
    grappleAnchors: [ring("atrium-chain"), ring("vault-approach-chain"),
      { ...ring("vault-chain"), autoDismountFrom: ["vault-approach-chain"] }, ring("window-chain")],
  };
  // 카메라 존은 위 최종 좌표에서 만든다.
  return { ...layout, cameraZones: blackthorneCameraZones(layout, world) };
}
