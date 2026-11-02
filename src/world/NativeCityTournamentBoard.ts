import structure from "./native-city-plaza-props.json";
import midground from "./native-city-midground.json";
import type { CityPoint, NativeCityDefinition } from "./NativeCityDefinition";
import { NATIVE_CITY_MIDGROUND_TALK_UNITS } from "./NativeCityTalkSpot";

/**
 * 광장(V1)의 주간 토너먼트 대진 게시판(2026-10-18): 평면 자리·방향, 바닥 몸(발판 상자), 서서 보는 자리, 클릭 상자.
 * 그림은 3D 카드 화면이 월드 고정 볼륨으로 그린다(`native-city-plaza-props.json` → `tools/art/package-otto-props.mjs --set plaza` →
 * 런타임 JSON, 지연 로드). 여기는 같은 구조 파일에서 바로 읽는다 — 첫 번들에 런타임 JSON 을 끌어오지 않는다.
 * `test/native-city-plaza-props.test.ts` 가 런타임의 자리·방향·크기와 같은지 본다.
 */
const board = structure.props.board;
/** 시트 1px → 평면 단위(포장기의 `scale`). */
const k = board.metresPerPx * structure.unitsPerMetre;
const anchor = structure.places.board as unknown as CityPoint;
// `xAxis: camera`: 기본 카메라의 오른쪽(포장기의 `cameraRight`), 앞(+y)은 그 왼쪽 수직 — 정면이 기본 카메라를 본다.
const { x: px, y: py } = midground.projection, length = Math.hypot(px[0]!, py[0]!);
const right: CityPoint = [px[0]! / length, py[0]! / length];
const front: CityPoint = [-right[1], right[0]];
const boxes = board.parts.filter(part => part.type === "box") as unknown as readonly { readonly min: readonly number[]; readonly max: readonly number[] }[];
const roof = board.parts.find(part => part.type === "hull") as unknown as { readonly x: readonly number[]; readonly y: readonly number[] };
/** 바닥에 닿는 몸(발판·기둥·판)의 평면 범위(시트 px). */
const ground = { x0: Math.min(...boxes.map(b => b.min[0]!)), x1: Math.max(...boxes.map(b => b.max[0]!)),
  y0: Math.min(...boxes.map(b => b.min[1]!)), y1: Math.max(...boxes.map(b => b.max[1]!)) };
/** 지붕 용마루 높이(시트 px): 그림자 상자 중 가장 높은 것. */
const ridge = Math.max(...board.shadows.map(shadow => shadow.height));

/** 게시판 몸의 지역 좌표(평면 단위: 오른쪽 `x`, 앞 `y`) → 평면 점. */
function local(x: number, y: number): CityPoint {
  return [anchor[0] + x * right[0] + y * front[0], anchor[1] + x * right[1] + y * front[1]];
}

export const NATIVE_CITY_TOURNAMENT_BOARD = Object.freeze({
  anchor,
  right,
  front,
  /** 길찾기가 피하는 바닥 몸(발판 사이의 판까지 한 상자). */
  footprint: [[ground.x0, ground.y0], [ground.x1, ground.y0], [ground.x1, ground.y1], [ground.x0, ground.y1]]
    .map(([x, y]) => local(x! * k, y! * k)),
  /** 정면 앞에 서서 보는 자리: 몸 앞면에서 대화 거리(1.5보)만큼. */
  stand: local(0, ground.y1 * k + NATIVE_CITY_MIDGROUND_TALK_UNITS),
  /** 용마루 높이(평면 단위): 이름표가 그 위에 선다. */
  top: ridge * k,
  /** 클릭 상자: 지붕까지의 여덟 꼭짓점(평면 점 + 높이, 평면 단위). 화면에서 이것을 감싸는 사각형이 누를 곳이다. */
  box: Object.freeze([roof.y[0]!, roof.y[1]!].flatMap(y => [roof.x[0]!, roof.x[1]!].flatMap(x =>
    [0, ridge].map(z => Object.freeze({ point: local(x * k, y * k), height: z * k }))))),
});

/**
 * 길찾기: 게시판 몸을 장애물로 더한다(광장 판의 평면 좌표는 모든 구역이 같이 쓴다). 자기 장애물을 가진 덮어쓰기 구역(`navigationOverrides`)
 * 안에서는 그 목록이 이기므로 거기에도 더한다(`plazaInfillNavigation` 과 같다).
 */
export function tournamentBoardNavigation(city: NativeCityDefinition): NativeCityDefinition {
  const footprint = NATIVE_CITY_TOURNAMENT_BOARD.footprint;
  return { ...city, obstacles: [...city.obstacles, footprint],
    navigationOverrides: city.navigationOverrides?.map(area => ({ ...area, obstacles: [...area.obstacles, footprint] })) };
}
