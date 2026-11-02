import midground from "./native-city-midground.json";
import { cityWalkable } from "../sim/NativeCityNavigation";
import { NATIVE_CITY_MOVEMENT, cityProject, cityScreenToPlan, cityUnproject, type CityPoint, type NativeCityDefinition } from "./NativeCityDefinition";




export const NATIVE_CITY_STEP_BODY_RATIO = 0.47317187499999996;
/** 말 거는 자리까지의 걸음 수. */
export const NATIVE_CITY_TALK_STEPS = 1.5;
/**
 * 걷는 중 도착 카메라 각이 이만큼(도) 넘게 바뀌면 대화 자리를 다시 잡는다. 기본 자리의 화면 간격은 최소 간격의 1.25배이고
 * 22.5° 돌면 0.68배로 줄었다(로잘린·시계공, 2026-10-14 측정) — 5° 안에서는 최소 간격 위에 남는다.
 */
export const NATIVE_CITY_TALK_RETARGET_DEGREES = 5;

/** 지금 투영에서 주인공 한 보의 평면 단위. */
export function nativeCityStepUnits(projection: NativeCityDefinition["projection"], actorHeightPx: number): number {
  const horizontal = Math.hypot(projection.x[0], projection.y[0]);
  return horizontal > 1e-9 ? NATIVE_CITY_STEP_BODY_RATIO * actorHeightPx / horizontal : 0;
}

/** 지금 투영에서 주민과 말 거는 자리 사이(1.5보)의 평면 단위. */
export function nativeCityTalkUnits(projection: NativeCityDefinition["projection"], actorHeightPx: number): number {
  return NATIVE_CITY_TALK_STEPS * nativeCityStepUnits(projection, actorHeightPx);
}

/** 3D 중경(마을 자리) 카메라의 1.5보. 회전 프레임 모두 가로 배율이 같아(18.46px/단위) 한 값이다. 고정 무대 자리에 쓴다. */
export const NATIVE_CITY_MIDGROUND_TALK_UNITS = nativeCityTalkUnits(
  midground.projection as unknown as NativeCityDefinition["projection"], midground.actorHeightPx);

/**
 * 주민 발에서 이 거리 안이면 그 주민에게 말을 걸 수 있다(1.5보 + 몸 반지름). 대화 자리는 늘 정확히 1.5보라 이 안이다.
 * 정거장 반경(`interactionRadius`)과 함께 쓴다 — 로잘린은 정거장(가게 문)에서 15단위 떨어져 서 있다.
 */
export function nativeCityTalkReach(projection: NativeCityDefinition["projection"], actorHeightPx: number): number {
  return nativeCityTalkUnits(projection, actorHeightPx) + NATIVE_CITY_MOVEMENT.radius;
}

/** 화면 기준 말 걸기에서 평면 거리의 상한(말 거는 거리의 배수): 깊이로 아주 멀면 화면에서 겹쳐 보여도 닿지 않는다. */
export const NATIVE_CITY_SCREEN_TALK_DEPTH_CAP = 2.5;

/**
 * 화면에서 붙어 보이면 닿는다(2026-10-19 사용자: 쿠마 바로 뒤에 섰는데 "대화"가 안 떴다). 16° 카메라는 앞뒤 깊이를 화면에
 * 약 0.28배로 눌러 보여서, 평면으로 말 거는 거리(`nativeCityTalkReach`)의 세 배쯤 떨어져도 화면에선 맞닿아 보인다. 그래서
 * 평면 거리 대신 화면 변위(투영의 2×2 부분)를 화면 가로 배율로 나눈 거리로 잰다 — 옆으로는 평면 판정과 거의 같고, 앞뒤로만 넉넉해진다.
 * 평면 거리는 `NATIVE_CITY_SCREEN_TALK_DEPTH_CAP` 배까지만 허용한다.
 */
export function nativeCityWithinScreenTalkReach(projection: NativeCityDefinition["projection"], actorHeightPx: number,
  from: CityPoint, to: CityPoint): boolean {
  const reach = nativeCityTalkReach(projection, actorHeightPx), dx = to[0] - from[0], dy = to[1] - from[1];
  const plan = Math.hypot(dx, dy);
  if (plan <= reach) return true;
  if (plan > reach * NATIVE_CITY_SCREEN_TALK_DEPTH_CAP) return false;
  const horizontal = Math.hypot(projection.x[0], projection.y[0]);
  if (horizontal <= 1e-9) return false;
  const screen = Math.hypot(projection.x[0] * dx + projection.y[0] * dy, projection.x[1] * dx + projection.y[1] * dy);
  return screen / horizontal <= reach;
}

/** 도시 주민 원화. 씬(`NativeCityScene`)이 정거장마다 고르는 시트와 같다. */
export type NativeCityResidentArt = "butler" | "gent" | "elias" | "gentleman" | "clockmaker" | "rosaline" | "steward" | NativeCityClueResidentArt;
/** 단서 주민 다섯의 직교 팩(2026-10-13). 만남의 몸 id(`nativeCityResident(...).castId`)가 곧 팩 id 다. */
export type NativeCityClueResidentArt = "johann" | "ernst" | "albert" | "matthias" | "konrad";
const CLUE_RESIDENT_ART: readonly string[] = ["johann", "ernst", "albert", "matthias", "konrad"] satisfies readonly NativeCityClueResidentArt[];

/**
 * 그 정거장 주민이 쓰는 원화. 광장 배달원(엘리어스)·광장 신사·시계공은 광장 NPC 직교 팩(2026-10-12, `render/art/NativeCityPlazaNpcArt`),
 * 단서 주민 다섯은 몸 id 가 같은 이름의 직교 팩(2026-10-13), 집사 배역(`steward`)은 2026-10-18 부터 제 직교 팩(옛 경비 butler 시트 대신),
 * 나머지 배역은 저택 신사(gent) 시트다.
 */
export function nativeCityResidentArt(stopId: string, castId: string): NativeCityResidentArt {
  if (stopId === "rosaline") return "rosaline";
  if (stopId === "plaza") return "elias";
  if (stopId === "gentleman") return "gentleman";
  if (stopId === "clockmaker") return "clockmaker";
  if (CLUE_RESIDENT_ART.includes(castId)) return castId as NativeCityClueResidentArt;
  return castId === "steward" ? "steward" : "gent";
}

/**
 * 원화 대기 프레임이 보는 쪽.
 * - `side`: 화면 왼쪽(−1)·오른쪽(+1). 씬은 도시 주민을 뒤집지 않는다(flipX 없음).
 * - `towardDeg`: 그 쪽에서 카메라 쪽(화면 아래)으로 기운 각. 옆모습 0°. 3/4 앞모습은 정면에 바로 서면 주민을 가리므로
 *   원화가 기운 쪽 옆 앞(대각)에 선다.
 * - `halfWidth`: 발(원점)에서 몸 바깥까지 가장 넓은 쪽 폭 / 배우 키(대기 프레임 알파 경계를 잰 값).
 * - `turns`: 주인공 쪽으로 돌아서는가(직교 팩은 8방향, 로잘린은 좌우 반전). 그러면 대화 자리는 두 앞 대각 가운데 다가오는
 *   주인공에게 가까운 쪽이다 — `side` 쪽에 고정하면 반대쪽에서 온 주인공이 주민 옆을 지나쳐 가서 뒤돌아선다(2026-10-14 사용자 지적).
 */
export interface NativeCityResidentFacing {
  readonly side: -1 | 1;
  readonly towardDeg: number;
  readonly halfWidth: number;
  readonly turns: boolean;
}

export const NATIVE_CITY_RESIDENT_FACING: Readonly<Record<NativeCityResidentArt, NativeCityResidentFacing>> = Object.freeze({
  /** `guards/butler.webp` 0행 0열: 완전한 왼쪽 옆모습(경비·군중 시트는 모두 왼쪽을 본다 — `GuestListStageView.pose`). 폭 31/128. */
  butler: Object.freeze({ side: -1, towardDeg: 0, halfWidth: 0.125, turns: false }),
  /** `manor/gent.webp` 0행 0열(부두 감독 등 거리 기록 담당자): 왼쪽 옆모습, 배가 앞으로 나와 넓다. 폭 56/128. */
  gent: Object.freeze({ side: -1, towardDeg: 0, halfWidth: 0.219, turns: false }),

  elias: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.183, turns: true }),
  /** 광장 신사(Drive C05): 같은 직교 팩 규칙. 앞 대각 대기 프레임 원점에서 오른쪽 68px / 400 × 키 1.02. */
  gentleman: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.173, turns: true }),
  clockmaker: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.167, turns: true }),
  /** 단서 주민 다섯(2026-10-13): 같은 직교 팩 규칙, 폭도 같은 셈(앞 대각 대기 프레임 원점에서 가장 넓은 쪽 / 400 × 키). */
  johann: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.164, turns: true }),
  ernst: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.174, turns: true }),
  albert: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.165, turns: true }),
  matthias: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.231, turns: true }),
  konrad: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.180, turns: true }),
  /** 블랙손 집사(2026-10-18 직교 팩): 같은 규칙. 앞 대각 대기 프레임 원점에서 62.5px / 400 × 키 1.02. */
  steward: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.159, turns: true }),

  rosaline: Object.freeze({ side: 1, towardDeg: 45, halfWidth: 0.168, turns: true }),
});


export const NATIVE_CITY_TALK_PLAYER_HALF_WIDTH = 0.184;
/** 두 몸 사이에 남길 최소 화면 틈 / 배우 키. */
export const NATIVE_CITY_TALK_MIN_GAP = 0.05;

/**
 * 정거장 화면 자리에서 주민 발까지의 화면 px 차이(씬이 주민을 세울 때 쓰는 값).
 * 중경(3D)은 배우 키 비례로 정거장 오른쪽(로잘린은 진열창 앞이라 더 아래), 등록 판(2D)은 고정 px 이다.
 */
export function nativeCityResidentFootOffsetPx(stopId: string, city: Pick<NativeCityDefinition, "presentation" | "actorHeightPx" | "projection">): CityPoint {
  // 광장 신사의 정거장 점은 그의 발에서 `NATIVE_CITY_PLAZA_GENTLEMAN_STAND` 만큼 앞이다 — 발은 거꾸로 그만큼(화면 px, 선형 투영).
  if (stopId === "gentleman") {
    const [dx, dy] = NATIVE_CITY_PLAZA_GENTLEMAN_STAND, { x, y } = city.projection;
    return [-(x[0] * dx + y[0] * dy), -(x[1] * dx + y[1] * dy)];
  }
  if (city.presentation !== "midground-plate") return [14, -3];
  const spacing = city.actorHeightPx;
  return [spacing * 0.6, spacing * (stopId === "rosaline" ? 0.5 : 0.12)];
}

/**
 * 정거장 주민의 발 자리(평면, 길 밖 보정 전): 정거장 화면 자리 + 발 오프셋을 그 뷰의 투영으로 되돌린다. 씬이 주민을 세울 때와
 * 거리 주민이 그 둘레를 비울 때(`NativeCityLifeRules`) 같은 셈을 쓴다.
 */
export function nativeCityResidentFoot(stop: { readonly id: string; readonly point: CityPoint },
  city: Pick<NativeCityDefinition, "presentation" | "actorHeightPx" | "projection">): CityPoint {
  const view = city as NativeCityDefinition, [x, y] = cityProject(stop.point, view), [dx, dy] = nativeCityResidentFootOffsetPx(stop.id, city);
  return cityUnproject([x + dx, y + dy], view);
}

/**
 * 광장 신사(Drive C05, 2026-10-12)가 서는 자리: 광장 정거장에서 평면 단위로 북서쪽(주점 처마 앞). 분수의 반대편이라 기본 카메라에서
 * 분수 물줄기에 가리지 않고, 엘리어스의 대화 자리(오른쪽 앞 대각)와도 겹치지 않는다. 씬이 걸을 수 있는 가까운 자리로 옮겨 세운다.
 */
export const NATIVE_CITY_PLAZA_GENTLEMAN_OFFSET: CityPoint = [-18, -6];

/**
 * 광장 신사 정거장(`gentleman`, `NativeCityPlazaStops`) 점 = 그의 발 + 이 평면 벡터. 기본 3D 중경 카메라에서 그가 바라보는 오른쪽 앞
 * 대각으로 정확히 1.5보 — 그 카메라의 대화 자리와 같다. 다른 주민처럼 정거장 점은 몸 밖, 걸어 닿는 자리다(정거장 점을 발에 두면
 * 몸이 막아 대화 자리를 못 찾을 때의 대체 목적지에 닿지 못한다).
 */
export const NATIVE_CITY_PLAZA_GENTLEMAN_STAND: CityPoint = (() => {
  const { right, toward } = nativeCityScreenAxes(midground.projection as unknown as NativeCityDefinition["projection"]);
  const raw: CityPoint = [right[0] + toward[0], right[1] + toward[1]], length = Math.hypot(raw[0], raw[1]);
  return Object.freeze([raw[0] / length * NATIVE_CITY_MIDGROUND_TALK_UNITS, raw[1] / length * NATIVE_CITY_MIDGROUND_TALK_UNITS]) as unknown as CityPoint;
})();

export interface NativeCityTalkSpotInput {
  /** 주민 발(평면). */
  readonly npc: CityPoint;
  readonly art: NativeCityResidentArt;
  /** 걷기 시작하는 지금의 화면 투영(회전 반영). 방향만 쓴다. */
  readonly projection: NativeCityDefinition["projection"];
  /** 지금 배우 키(화면 px, `nativeCityActorHeight`). */
  readonly actorHeightPx: number;
  /** 씬 길찾기 정의. 걸을 수 있는지 여기서 본다. */
  readonly navigation: NativeCityDefinition;
  /** 걸을 수 있는 후보를 더 거른다(예: 지금 자리에서 길이 이어지는가). 없으면 걸을 수 있으면 받는다. */
  readonly accept?: (point: CityPoint) => boolean;
  /** 주인공이 걸어오는 자리(평면). 돌아서는 주민(`turns`)이면 두 앞 대각 가운데 여기서 가까운 쪽에 선다. 없으면 `side` 쪽. */
  readonly from?: CityPoint;
  /**
   * 돌아서는 주민의 두 앞 대각을 견줄 비용(씬은 실제로 걷는 거리 — 모퉁이 너머 자리는 직선으로 가까워도 멀다). 닿지 못하면
   * Infinity. 없으면 `from` 에서의 직선 거리.
   */
  readonly cost?: (point: CityPoint) => number;
}

export interface NativeCityTalkSpot {
  readonly point: CityPoint;
  /** 실제로 선 화면 쪽(주민 기준). */
  readonly side: -1 | 1;
  /** 그 쪽에서 카메라 쪽으로 기운 각(음수면 카메라 반대쪽). */
  readonly towardDeg: number;
  /** 고른 쪽 그대로(`preferred`), 같은 쪽에서 비튼 자리(`same-side`), 반대쪽(`opposite`). 고른 쪽은 `side` 또는 다가오는 쪽. */
  readonly fallback: "preferred" | "same-side" | "opposite";
  /** 도착해서 주민을 볼 평면 방향(자리 → 주민). */
  readonly face: CityPoint;
}

/** 화면 가로 오른쪽·화면 아래(카메라 쪽)로 가는 평면 단위 방향. */
export function nativeCityScreenAxes(projection: NativeCityDefinition["projection"]): { readonly right: CityPoint; readonly toward: CityPoint } {
  // 화면 변위 (sx, sy) 를 만드는 평면 변위는 투영 2×2 의 역행렬로 구한다.
  const right = cityScreenToPlan(projection, [1, 0], 1e-12), toward = cityScreenToPlan(projection, [0, 1], 1e-12);
  if (right === null || toward === null) return { right: [1, 0], toward: [0, 1] };
  const unit = (v: CityPoint): CityPoint => { const length = Math.hypot(v[0], v[1]); return [v[0] / length, v[1] / length]; };
  return { right: unit(right), toward: unit(toward) };
}

/** 주민 화면 폭과 주인공 화면 폭이 겹치지 않는 가장 작은 가로 간격 / 배우 키. */
export function nativeCityTalkMinSeparation(art: NativeCityResidentArt): number {
  return NATIVE_CITY_RESIDENT_FACING[art].halfWidth + NATIVE_CITY_TALK_PLAYER_HALF_WIDTH + NATIVE_CITY_TALK_MIN_GAP;
}

const minus = (a: CityPoint, b: CityPoint): CityPoint => [a[0] - b[0], a[1] - b[1]];

/** 각을 비틀어 볼 간격과 한계(도). 같은 쪽 안(±90° 미만)에서 몸이 겹치지 않는 데까지만 돈다. */
const SWEEP_STEP_DEG = 5;
const SWEEP_LIMIT_DEG = 85;

/**
 * 말 거는 자리. 주민이 바라보는 화면 쪽(돌아서는 주민은 다가오는 주인공에게 가까운 쪽)으로 정확히 1.5보. 그 자리가 벽·건물·물이면
 * 같은 거리를 지킨 채 같은 쪽에서 가까운 각부터, 그다음 반대쪽 순으로 걸을 수 있는 자리를 찾는다. 모든 후보는 화면에서 두 몸 폭이
 * 겹치지 않는다. 어디에도 설 수 없으면 null — 씬은 예전처럼 정거장 자리로 간다.
 */
export function nativeCityTalkSpot(input: NativeCityTalkSpotInput): NativeCityTalkSpot | null {
  const facing = NATIVE_CITY_RESIDENT_FACING[input.art];
  const distance = nativeCityTalkUnits(input.projection, input.actorHeightPx);
  if (!(distance > 0)) return null;
  const { right, toward } = nativeCityScreenAxes(input.projection);
  const horizontal = Math.hypot(input.projection.x[0], input.projection.y[0]);
  const minSeparationPx = nativeCityTalkMinSeparation(input.art) * input.actorHeightPx;
  const accept = input.accept ?? (() => true);
  const sweep = [0];
  for (let delta = SWEEP_STEP_DEG; delta <= 2 * SWEEP_LIMIT_DEG; delta += SWEEP_STEP_DEG) sweep.push(delta, -delta);
  // 두 축이 평면에서 정확히 직교하지 않는 투영(등록 판·반올림)도 있어 방향을 다시 단위 길이로 맞춘다 — 거리는 늘 1.5보.
  const spotAt = (side: -1 | 1, deg: number): CityPoint => {
    const radians = deg * Math.PI / 180, across = Math.cos(radians), down = Math.sin(radians);
    const raw: CityPoint = [side * across * right[0] + down * toward[0], side * across * right[1] + down * toward[1]];
    const length = Math.hypot(raw[0], raw[1]);
    return [input.npc[0] + raw[0] / length * distance, input.npc[1] + raw[1] / length * distance];
  };
  // 돌아서는 주민은 다가오는 주인공에게 더 가까운 쪽 앞 대각부터 본다(화면 좌우만 보면 뒤에서 올 때 먼 쪽을 고른다).
  const from = input.from;
  const cost = !facing.turns ? undefined : input.cost ?? (from ? (point: CityPoint) => Math.hypot(...minus(point, from)) : undefined);
  const other = -facing.side as -1 | 1;
  const first: -1 | 1 = cost && cost(spotAt(other, facing.towardDeg)) < cost(spotAt(facing.side, facing.towardDeg)) ? other : facing.side;
  for (const [side, fallback] of [[first, "same-side"], [-first, "opposite"]] as const) {
    for (const delta of sweep) {
      const deg = facing.towardDeg + delta;
      if (Math.abs(deg) > SWEEP_LIMIT_DEG) continue;
      // 화면 가로 간격(px) = 평면 거리 × 가로 성분 × 가로 배율. 몸이 겹치는 각은 건너뛴다.
      if (distance * Math.cos(deg * Math.PI / 180) * horizontal < minSeparationPx) continue;
      const point = spotAt(side as -1 | 1, deg);
      if (!cityWalkable(point, input.navigation) || !accept(point)) continue;
      return { point, side: side as -1 | 1, towardDeg: deg,
        fallback: side !== first ? "opposite" : delta === 0 ? "preferred" : fallback,
        face: [input.npc[0] - point[0], input.npc[1] - point[1]] };
    }
  }
  return null;
}
