import type {
  FloorBand,
  GeometryRect,
  GuardSpawn,
  HideSpot,
  Lamp,
  LootAnchor,
  MansionLayout,
  VerticalLink,
} from "./MansionLayout";

/**
 * 첫 잠입 전용 동쪽 별관.
 *
 * 생성 지형은 매번 달라 조작 실패와 지형 운을 구분하기 어렵다. 이 레이아웃은 일반
 * 저택과 같은 물리·시야·소음 규칙을 쓰되, 새 동사가 한 화면에 하나씩 나오도록 고정한다.
 */

const BAND_H = 180;
const SLAB = 12;
const GROUND = BAND_H - SLAB;
const WORLD_W = 2160;

export const TUTORIAL_FLOORS = Object.freeze({ attic: 0, gallery: 1, service: 2, basement: 3 });

export function tutorialSurfaceY(floor: number): number {
  return floor * BAND_H + GROUND;
}

function slab(id: string, floor: number, x: number, w: number): GeometryRect {
  return { id, kind: "solid", rect: { x, y: tutorialSurfaceY(floor), w, h: SLAB } };
}

/** 사다리 구멍은 걸어서 지나가되 아래 입력으로만 진입하는 원웨이 덮개로 막는다. */
function ladderHatch(id: string, floor: number, x: number, w: number): GeometryRect {
  return { id, kind: "platform", rect: { x, y: tutorialSurfaceY(floor), w, h: 8 } };
}

function blocker(id: string, floor: number, x: number, w: number, h: number, wallInset = 0): GeometryRect {
  return { id, kind: "blocker", rect: { x, y: tutorialSurfaceY(floor) - h - wallInset, w, h } };
}

/** 첫 점프 원화와 충돌이 함께 소비하는 낮은 짐짝. */
const TUTORIAL_ARRIVAL_OBSTACLE: GeometryRect = Object.freeze({
  id: "tutorial-service-crate",
  kind: "solid",
  rect: Object.freeze({ x: 320, y: tutorialSurfaceY(TUTORIAL_FLOORS.service) - 28, w: 40, h: 28 }),
});

const BANDS: readonly FloorBand[] = [
  { index: 0, name: "옥상 동쪽 날개", light: 0.68, backgroundArtId: "tutorial-rooftop" },
  { index: 1, name: "2F 전시 복도", light: 0.88 },
  { index: 2, name: "1F 하인 통로", light: 0.9 },
  { index: 3, name: "B1 압수품 창고", light: 0.34 },
];

const GEOMETRY: readonly GeometryRect[] = [
  { id: "wall-left", kind: "solid", rect: { x: -10, y: 0, w: 10, h: BAND_H * 4 } },
  { id: "wall-right", kind: "solid", rect: { x: WORLD_W, y: 0, w: 10, h: BAND_H * 4 } },
  { id: "roof", kind: "solid", rect: { x: -10, y: -10, w: WORLD_W + 20, h: 10 } },

  // 3F ↔ 2F 사다리는 위층 다락 바닥에만 구멍이 필요하다. 아래층 갤러리까지
  // 원웨이 구멍으로 만들면 사다리 접근 중 남은 아래+점프 입력이 플레이어를 지하로 떨군다.
  slab("floor-0-a", 0, 0, 1996),
  ladderHatch("tutorial-ladder-attic-hatch", 0, 1996, 28),
  slab("floor-0-b", 0, 2024, WORLD_W - 2024),
  slab("floor-1", 1, 0, WORLD_W),

  // 1F ↔ B1. 첫 경험에서는 낙하 지름길을 가르치지 않고 사다리 동작 하나에 집중한다.
  slab("floor-2-a", 2, 0, 1986),
  ladderHatch("tutorial-ladder-basement-hatch", 2, 1986, 28),
  slab("floor-2-c", 2, 2014, WORLD_W - 2014),
  slab("floor-3-a", 3, 0, WORLD_W),

  // 첫 장은 낮은 짐짝의 점프 뒤 빈 복도의 질주를 연속으로 익힌 다음 첫 속임수 방으로 간다.
  TUTORIAL_ARRIVAL_OBSTACLE,

  // 1F: 휘파람 방과 감시 촛대 양쪽에 완전 엄폐를 보장한다.
  blocker("potted-palm-1f-tutorial-west", 2, 720, 49, 92),
  blocker("console-desk-1f-tutorial-hide", 2, 920, 94, 76),
  blocker("potted-palm-1f-tutorial-clock-west", 2, 1470, 49, 92),
  blocker("console-desk-1f-tutorial-clock-east", 2, 1770, 94, 76),

  // B1: 시작 엄폐, 소등 복도, 절도 탁자를 시각적으로 분리한다.
  blocker("shelving-rack-b1-tutorial-east", 3, 1900, 71, 88),
  blocker("crate-stack-b1-tutorial-lamp", 3, 1390, 60, 78),
  blocker("barrel-cluster-b1-tutorial-loot", 3, 1120, 74, 64),
  blocker("sack-pile-b1-tutorial-vent", 3, 500, 75, 66),

  // 2F: 유인 실습과 경비반장 구간을 큰 가구로 나눈다.
  blocker("curtains-2f-tutorial-vent", 1, 500, 77, 104, 30),
  blocker("linen-cabinet-2f-tutorial-throw", 1, 700, 61, 82),
  blocker("grandfather-clock-2f-tutorial-mid", 1, 1280, 36, 108),
  blocker("curtains-2f-tutorial-warden-west", 1, 1420, 77, 104, 30),
  blocker("linen-cabinet-2f-tutorial-warden-east", 1, 1840, 61, 82),

  // 3F: 오르골 뒤 안전 주로와 추격 중 재사용할 점프·엄폐.
  blocker("crate-stack-3f-tutorial-musicbox", 0, 1690, 64, 72),
  blocker("bookcase-3f-tutorial-bruiser", 0, 1510, 56, 88),
  // 오르골 적재로 점프력이 낮아진 상태에서도 여유 있게 넘는 재확인용 장애물.
  { id: "tutorial-attic-crate", kind: "solid", rect: { x: 1180, y: tutorialSurfaceY(0) - 18, w: 40, h: 18 } },
  blocker("covered-armchair-3f-tutorial-west", 0, 920, 73, 80),
  blocker("garment-rack-3f-tutorial-exit", 0, 360, 69, 88),
];

const LINKS: readonly VerticalLink[] = [
  {
    id: "tutorial-ladder-attic",
    kind: "ladder",
    rect: { x: 1998, y: tutorialSurfaceY(0) - 32, w: 20, h: BAND_H + 32 },
    guardUsable: true,
  },
  {
    id: "tutorial-ladder-basement",
    kind: "ladder",
    rect: { x: 1988, y: tutorialSurfaceY(2) - 32, w: 20, h: BAND_H + 32 },
    guardUsable: true,
  },
  {
    id: "tutorial-vent",
    kind: "vent",
    rect: { x: 350, y: tutorialSurfaceY(3) - 38, w: 24, h: 38 },
    loadLimit: 0.7,
    exit: { x: 350, y: tutorialSurfaceY(1) },
    travelMs: 1600,
    guardUsable: false,
  },
];

const HIDE_SPOTS: readonly HideSpot[] = [
  { id: "tutorial-wardrobe", rect: { x: 800, y: tutorialSurfaceY(2) - 48, w: 30, h: 48 }, searchWeight: 1 },
];

const LAMPS: readonly Lamp[] = [
  { id: "tutorial-basement-lamp", at: { x: 1840, y: tutorialSurfaceY(3) - 20 }, radius: 410, snuffable: true },
  { id: "tutorial-gallery-sconce", at: { x: 1340, y: tutorialSurfaceY(1) - 28 }, radius: 150, snuffable: false },
  { id: "tutorial-attic-lantern", at: { x: 1720, y: tutorialSurfaceY(0) - 30 }, radius: 145, snuffable: false },
];

const GUARDS: readonly GuardSpawn[] = [
  // 첫 순찰점은 옷장 중심(815)에서 휘파람 반경 130px 안이다. 숨고 부르면
  // 반드시 듣고 문 앞을 확인한 뒤 소리 범위 왼쪽 바깥(650)까지 지나가야
  // 플레이어가 옷장에서 나와 오른쪽으로 빠져나갈 틈이 생긴다.
  // 체크포인트 재시작에서도 옷장 쪽을 정면 감시하지 않는다. 플레이어가 숨는 순간을
  // 목격하면 휘파람 유인보다 은신처 수색이 우선되어 첫 교습이 기다림으로 막힌다.
  { id: "tutorial-hide-guard", archetype: "patroller", floor: 2, route: [930, 650, 1360], dwellMs: 30000, facing: 1 },
  { id: "tutorial-clock-guard", archetype: "candelabra", floor: 2, route: [1620], dwellMs: 99999, facing: -1 },
  { id: "tutorial-basement-guard", archetype: "patroller", floor: 3, route: [1450, 1750], dwellMs: 1900, facing: 1 },
  { id: "tutorial-lure-guard", archetype: "patroller", floor: 1, route: [780, 1060], dwellMs: 1800, facing: -1 },
  // 할아버지 시계 너머에서 오른쪽 진행로를 감시하다 제자리 회전점으로 고개를 돌린다.
  // 두 번째 점은 도착 허용 오차 안에 둬, 회전 뒤 다시 걸어가느라 통과 창이 늦게 열리지 않는다.
  // 진행 반대편을 보는 회전 예고 전 3초가 확정 통과 창이고, 이후 동쪽 순찰로 다시 압박한다.
  { id: "tutorial-warden", archetype: "warden", floor: 1, route: [1250, 1244, 1780], dwellMs: 4200, facing: 1 },
  // 한 점에서 기다리다 플레이어가 오르골 소음 반경 안으로 들어오면 실제 청각 규칙으로 반응한다.
  { id: "tutorial-bruiser", archetype: "bruiser", floor: 0, route: [1450], dwellMs: 99999, facing: 1 },
];

const LOOT: readonly LootAnchor[] = [
  { id: "tutorial-pocketwatch", lootId: "pocketwatch", at: { x: 1250, y: tutorialSurfaceY(3) - 10 }, skillRequiredOverride: 0 },
  { id: "tutorial-painting", lootId: "painting", at: { x: 1000, y: tutorialSurfaceY(3) - 10 }, skillRequiredOverride: 0 },
  { id: "tutorial-jewelbox", lootId: "jewelbox", at: { x: 900, y: tutorialSurfaceY(3) - 10 }, skillRequiredOverride: 0 },
  { id: "tutorial-rarebook", lootId: "rarebook", at: { x: 800, y: tutorialSurfaceY(3) - 10 }, skillRequiredOverride: 0 },
  { id: "tutorial-silverware", lootId: "silverware", at: { x: 700, y: tutorialSurfaceY(3) - 10 }, skillRequiredOverride: 0 },
  { id: "tutorial-musicbox", lootId: "musicbox", at: { x: 1770, y: tutorialSurfaceY(0) - 10 }, skillRequiredOverride: 0 },
];

export const TUTORIAL_MANSION_LAYOUT: MansionLayout = {
  id: "tutorial-east-wing-v1",
  name: "블랙손 저택 동쪽 별관",
  widthPx: WORLD_W,
  bands: BANDS,
  geometry: GEOMETRY,
  links: LINKS,
  hideSpots: HIDE_SPOTS,
  lamps: LAMPS,
  environmentHazards: [],
  combatPockets: [],
  guards: GUARDS,
  crowds: [],
  lootAnchors: LOOT,
  escapes: [
    { id: "tutorial-roof-window", kind: "window", facing: -1, name: "동쪽 옥상 창", rect: { x: 80, y: 120, w: 44, h: 48 }, bonusMul: 1 },
  ],
  spawn: { x: 120, y: tutorialSurfaceY(2) },
  // 유인 장에서는 첫 슬롯 Q가 곧 유인구가 되게 해 숫자 슬롯 선택을 새로 가르치지 않는다.
  toolLoadout: ["mouse", "dagger"],
};
