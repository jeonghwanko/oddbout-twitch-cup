import { CAMERA_ZONE_OVERSCAN_PX as OVERSCAN, type CameraZone, type CameraZoneShot } from "./CameraZoneModel";
import type { MansionLayout } from "./MansionLayout";
import { blackthorneGeometry } from "./BlackthorneSpatialGeometry";
import type { WorldTuning } from "./tuning";

/** 파쿠르 배수관. `createBlackthorneManor` 가 같은 id 로 사다리를 깐다. */
const DRAINPIPE_LINK_ID = "parkour-drainpipe";
/** 전시 구도·파쿠르 구도는 줌 1 에서 위로 더 연다. 높은 발판과 태엽새가 HUD 아래에 든다. */
const OVERVIEW_TOP_PADDING_PX = 128;

/**
 * 블랙손 저택 카메라 존. `createBlackthorneManor` 가 최종 지형을 다 적은 뒤 그 좌표에서 만든다.
 * 예전 `heistCameraSubject` 의 분기 순서가 곧 우선순위다: 짧은 사다리 > 외곽 교전 > 파쿠르 > 전시대 > 수장고.
 */
export function blackthorneCameraZones(layout: MansionLayout, world: Pick<WorldTuning, "floorHeightPx">): CameraZone[] {
  const manor = layout.manor;
  if (manor === undefined) return [];
  const spatial = blackthorneGeometry(layout);
  const roof = spatial.floorSurfaces[0]!;
  const worldBottom = layout.bands.length * world.floorHeightPx;
  const zones: CameraZone[] = [];

  // 테이블·걸쇠·위층 착지를 한 화면에 고정한다. 이 짧은 사다리의 진행률을 두 층 중심에 매핑하면
  // 오르는 모습이 층 사이 카메라 스윕 뒤에 숨는다(168fd0ed).
  const { entryTable: table, entryLadder: ladder, entryId } = spatial.heist;
  const floorY = table.y + table.h;
  const top = ladder.y - 40;
  zones.push({
    id: "heist-entry-short-ladder", priority: 90,
    areas: [
      // 바닥을 떠나면(점프·테이블 위·사다리) 테이블 양옆 90px 까지 넓게 붙들어 구도가 흔들리지 않는다.
      { x: table.x - 90, y: top, w: table.w + 180, h: floorY - 1 - top, include: { right: true, bottom: false } },
      // 바닥에서는 테이블 폭만. 한 걸음 옆은 첫 갈림길이라 태엽새까지 담는 개관이 이어받는다(parkour E2E).
      { x: table.x, y: floorY - 1, w: table.w, h: 13, include: { right: true } },
    ],
    climbLinkIds: [entryId],
    when: { runActive: true, eye: false, vent: false },
    focus: "clear",
    // 끈적이지 않는다. 테이블 끝을 지나면 곧바로 첫 갈림길 개관이 떠오르는 태엽새를 담아야 한다
    // (exhibition E2E 가 x=840 에서 본다).
    hysteresisPx: 0,
    framing: { kind: "shot", subject: "player", x: ladder.x + ladder.w / 2, y: (table.y + ladder.y) / 2, blendMs: 140 },
  });

  // 외곽 금고지기 교전. 문턱(창) 조금 안쪽부터, 지붕 바닥선 조금 아래까지. 진입 여부는 sim 상태가 정한다.
  const threshold = spatial.heist.exteriorStartX;
  zones.push({
    id: "keeper-exterior-duel", priority: 80,
    areas: [{ x: threshold - 44, y: -OVERSCAN, w: layout.widthPx + OVERSCAN - (threshold - 44), h: roof + 72 + OVERSCAN,
      include: { left: false, bottom: false } }],
    when: { exteriorEntered: true },
    focus: "clear",
    framing: { kind: "duel", subject: "exterior", minCenterX: threshold + 190, feetY: roof, horizontalPaddingPx: 160, topPaddingPx: 256, blendMs: 180 },
  });

  // 아트리움 경로(`spatial.parkour` = 레이아웃의 `parkourRoutes[0]`). 놓친 도약의 낙하는 복귀 착지점까지 구도가 따라 내려간다.
  const route = spatial.parkour;
  const left = route.from.x - 65;
  const right = route.to.x + 35;
  zones.push({
    id: `parkour-${route.id}`, priority: 70,
    // 아래 경계(지붕 +132)는 2F 전시실 수레 윗면보다 위다. 수레 위는 존 밖이다.
    areas: [{ x: left, y: -OVERSCAN, w: right - left, h: route.to.y + 132 + OVERSCAN, include: { right: true, bottom: false } }],
    climbLinkIds: [DRAINPIPE_LINK_ID],
    duringParkour: true,
    fallCatch: { startedAboveY: route.from.y, marginPx: 77,
      area: { x: left, y: -OVERSCAN, w: right - left, h: route.recovery!.y + OVERSCAN, include: { right: true } } },
    when: { runActive: true, eye: false },
    focus: "clear",
    framing: { kind: "shot", subject: "parkour", x: (route.from.x + route.to.x) / 2, y: route.to.y + 77, zoom: 1,
      topPaddingPx: OVERVIEW_TOP_PADDING_PX, blendMs: 180 },
  });

  // 전시 승강기 개관. 멈춰 있으면 아래층 보행선 근처에서만, 움직이는 동안은 높이와 무관하게 붙든다.
  // 움직이는 동안 크랭크·걸쇠 쪽 장치 주시는 이 구도가 이미 담으므로 흡수한다.
  const display = manor.exhibition;
  const fromX = route.from.x - 280;
  const toX = display.x + 160;
  const framing: CameraZoneShot = {
    kind: "shot", subject: "exhibition",
    // 다가오는 배우와 도착 지점을 함께 담는다(첫 갈림길 개관).
    x: { pair: { partnerX: display.x + 110, actorMaxX: route.from.x - 60 } },
    y: (display.upperY + display.lowerY) / 2 - 75, zoom: 1, topPaddingPx: OVERVIEW_TOP_PADDING_PX, blendMs: 180,
  };
  const when = { runActive: true, eye: false, vent: false, climbing: false, exhibitionDocked: false,
    lootUncollected: manor.targetAnchorId } as const;
  zones.push({
    id: "exhibition-in-motion", priority: 61,
    areas: [{ x: fromX, y: -OVERSCAN, w: toX - fromX, h: worldBottom + OVERSCAN * 2, include: { left: false } }],
    when: { ...when, exhibitionMoving: true },
    focus: "yield", absorbFocusX: { from: display.latch.x - 50, to: display.x + 90 },
    framing,
  });
  zones.push({
    id: "exhibition-overview", priority: 60,
    areas: [{ x: fromX, y: display.lowerY - 120, w: toX - fromX, h: 240, include: { left: false, top: false, bottom: false } }],
    when,
    focus: "yield",
    framing,
  });

  return zones;
}
