import type { Rect } from "./GeometryTypes";

/**
 * 레이아웃이 소유하는 카메라 존 — 장면별 구도를 코드 분기 대신 데이터로 정한다.
 *
 * 존 = 영역(사각형 합집합·진입 조건) + 상태 조건 + 구도 + 우선순위. 존이 하나도 없거나 아무 존에도
 * 들지 않으면 카메라는 기본 추적(층 중앙 스냅·이동 선행·괴도의 눈 선행·장치 주시)을 쓴다.
 * 탈출 연출은 모든 존보다 앞선다.
 *
 * 선택은 결정적이다. 조건을 만족하는 존 가운데 `priority` 가 큰 것, 같으면 `id` 사전순이 앞선 것.
 * 배열 순서는 결과에 영향을 주지 않는다. 직전 프레임에 고른 존은 영역을 좌우로 `hysteresisPx` 만큼 넓혀
 * 판정해(나갈 때만 끈적인다) 경계에서 배우가 1~2px 오가도 구도가 번갈아 튀지 않는다.
 * 우선순위가 더 높은 존으로 들어가는 것은 즉시다. 세로 경계는 넓히지 않는다 — 바닥면·발판 윗면에 걸린
 * 경계를 넓히면 바닥에 선 배우가 공중 영역에 든다.
 *
 * 레이아웃과 함께 리플레이로 직렬화되므로 값은 모두 유한한 JSON 수여야 한다(Infinity 금지).
 * 판정·해석은 표현 계층(`render/HeistCameraZones.ts`)이 한다. sim 은 이 값을 읽지 않는다.
 */
export interface CameraZone {
  /** 레이아웃 안에서 유일. 우선순위가 같을 때의 안정 타이브레이크이자 히스테리시스 기억 키. */
  readonly id: string;
  /** 클수록 앞선다. */
  readonly priority: number;
  /**
   * 배우 발 좌표가 이 사각형 중 하나에 들면 존에 든다(경계 약속은 `CameraZoneArea`).
   * 생략하면 레이아웃 전체다. 빈 배열이면 아래 진입 조건으로만 든다.
   */
  readonly areas?: readonly CameraZoneArea[];
  /** 영역 밖이어도 이 사다리를 타는 동안은 존에 든다. */
  readonly climbLinkIds?: readonly string[];
  /** 영역 밖이어도 파쿠르 동작(매달림·그네·오르기) 중이면 존에 든다. */
  readonly duringParkour?: true;
  /**
   * 낙하 받기. `startedAboveY` 위에서 떨어지기 시작해 아직 `area` 바닥선 위에서 내려가는 중이면
   * `area` 안에서 존에 들고, 구도 중심이 배우를 따라 내려가 착지점이 화면 아래 `marginPx` 안에 남는다.
   */
  readonly fallCatch?: {
    readonly startedAboveY: number;
    readonly area: CameraZoneArea;
    readonly marginPx: number;
  };
  /** 모두 만족해야 존이 켜진다. 생략한 키는 따지지 않는다. */
  readonly when?: CameraZoneWhen;
  /**
   * 장치 주시(연쇄 장치가 잡은 카메라 초점)와의 관계.
   * - `clear`: 존이 화면을 소유하고 남은 주시를 걷는다.
   * - `keep`: 존이 화면을 소유하지만 주시는 손대지 않고 넘긴다(시간도 흘리지 않는다).
   * - `yield`: 주시가 있으면 존을 쓰지 않고 기본 장치 주시 구도로 넘긴다. 단 `absorbFocusX` 구간(양끝 포함)의
   *   주시는 존이 흡수한다 — 존 구도가 이미 그 장치를 담기 때문이다.
   */
  readonly focus: "clear" | "keep" | "yield";
  readonly absorbFocusX?: { readonly from: number; readonly to: number };
  /** 이미 고른 존을 놓기 전에 영역을 좌우로 넓히는 폭(px). 생략하면 `CAMERA_ZONE_HYSTERESIS_PX`. */
  readonly hysteresisPx?: number;
  readonly framing: CameraZoneFraming;
}

/**
 * 존 영역 사각형. 기본 경계 약속은 x 는 [x, x+w) 반열림, y 는 [y, y+h] 닫힘 — 발이 바닥선 위에 놓이므로
 * 아래 경계를 포함한다(경매 구역 판정 `auctionZoneAt` 과 같은 약속). 배우는 바닥면·발판 윗면·사다리 중심 같은
 * 저작된 정수 좌표에 정확히 서므로, 경계선 위의 점을 넣을지 뺄지가 구도를 바꾼다. 다르게 정하려면 `include` 로
 * 변마다 적는다(true = 경계선 위의 발도 존에 든다).
 */
export interface CameraZoneArea extends Rect {
  readonly include?: {
    readonly left?: boolean;
    readonly right?: boolean;
    readonly top?: boolean;
    readonly bottom?: boolean;
  };
}

/**
 * 존을 켜는 상태 조건. 닫힌 어휘다 — 새 장면에 새 상태가 필요하면 여기와 판정기에 한 줄씩 더한다.
 */
export interface CameraZoneWhen {
  /** 런 결과(체포·탈출)가 나기 전만. */
  readonly runActive?: true;
  /** false: 괴도의 눈을 켜면 존을 놓아 눈의 선행·확대 구도에 넘긴다. */
  readonly eye?: false;
  /** false: 환기구 이동 중이면 존을 놓는다. */
  readonly vent?: false;
  /** false: 사다리를 타는 동안 존을 놓는다(`climbLinkIds` 진입과 함께 쓰지 않는다). */
  readonly climbing?: false;
  /** 외곽 금고지기 교전에 들어선 뒤만. */
  readonly exteriorEntered?: true;
  /** false: 전시대가 아래 받침에 닿기 전만. */
  readonly exhibitionDocked?: false;
  /** 전시대가 오르내리는 동안만. */
  readonly exhibitionMoving?: true;
  /** 이 전리품 앵커를 줍기 전만. */
  readonly lootUncollected?: string;
  /** 경매 입장 소개가 도는 동안만. */
  readonly auctionIntro?: true;
}

/** 존 구도가 카메라 감독에게 알리는 피사체 종류. `auction` 은 고정 원화 구도라 월드 경계·보간 없이 곧바로 맞춘다. */
export type CameraZoneSubject = "auction" | "player" | "parkour" | "exhibition" | "vault" | "exterior";

/** 구도 중심의 가로 좌표: 고정값, 배우 추적(선행·한계), 또는 배우와 목적지의 가운데. */
export type CameraZoneAxisX =
  | number
  | { readonly follow: { readonly leadPx: number; readonly minX?: number; readonly maxX?: number } }
  /** 배우(`actorMaxX` 까지만)와 `partnerX` 의 가운데 — 다가오는 배우와 목적지를 한 화면에 담는다. */
  | { readonly pair: { readonly partnerX: number; readonly actorMaxX?: number } };

/** 한 장의 구도. 고정 구도·추적 구도·두 점 구도 모두 이것이다. */
export interface CameraZoneShot {
  readonly kind: "shot";
  readonly subject: CameraZoneSubject;
  readonly x: CameraZoneAxisX;
  readonly y: number;
  /** 논리 배율. 생략하면 기본 잠입 배율(`CAMERA_ZOOM`). */
  readonly zoom?: number;
  /** 월드 위로 더 보여 줄 여백. 생략하면 기본(`HEIST_CAMERA_TOP_PADDING_PX`). */
  readonly topPaddingPx?: number;
  readonly horizontalPaddingPx?: number;
  /** 중심 추종 시상수(ms). 한 프레임 몫은 min(1, delta/blendMs). */
  readonly blendMs: number;
}

/**
 * 경매 입장 소개처럼 시계를 따라 한 번 훑는 구도. 진행률은 경매 소개 시계(남은 시간/소개 길이)다.
 * 진행률 `startAt` 전에는 `opening` 을 붙들고, 그 뒤 `span` 동안 `from` → `to` 로 옮긴다.
 */
export interface CameraZoneSweep {
  readonly kind: "sweep";
  readonly opening: CameraZoneShot;
  readonly startAt: number;
  readonly span: number;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly subject: CameraZoneSubject;
  readonly zoom?: number;
  readonly topPaddingPx?: number;
  readonly blendMs: number;
}

/**
 * 기본 추적 위에 구도점을 섞는 존(수장고: 장애물과 보상을 한 화면에). 가중치는 `ramp` 의
 * 들어오는 경사(0→1)와 나가는 경사(1→0) 중 작은 값의 smoothstep 이라 경계에서 연속으로 풀린다.
 * 가중치가 0 이면 존에 들지 않은 것으로 본다. 머리 위 여백은 배우 높이에 따라 열어 HUD 아래를 지킨다.
 */
export interface CameraZoneBlend {
  readonly kind: "blend";
  readonly subject: CameraZoneSubject;
  readonly compositionX: number;
  readonly ramp: { readonly inFromX: number; readonly inToX: number; readonly outFromX: number; readonly outToX: number };
  readonly headroom: {
    readonly minPx: number;
    /** 괴도의 눈(확대)일 때의 최소 여백. */
    readonly eyeMinPx: number;
    readonly maxPx: number;
    /** 화면 위 HUD 띠(화면 px). 배율로 나눠 월드 px 로 바꾼다. */
    readonly hudPx: number;
    /** 배우 키(월드 px). */
    readonly actorPx: number;
  };
}

/**
 * 외곽 금고지기 교전 구도. 두 배우 거리로 배율을 당기고 풀며(`KEEPER_ENCOUNTER_ZOOM`),
 * 중심을 보스 쪽으로 기울이고(`KEEPER_ENCOUNTER_FRAMING`), 발 기준선을 화면 같은 높이에 둔다.
 */
export interface CameraZoneDuel {
  readonly kind: "duel";
  readonly subject: CameraZoneSubject;
  /** 중심이 이보다 왼쪽(실내 쪽)으로 가지 않는다. */
  readonly minCenterX: number;
  /** 교전 바닥선. */
  readonly feetY: number;
  readonly horizontalPaddingPx: number;
  readonly topPaddingPx: number;
  readonly blendMs: number;
}

export type CameraZoneFraming = CameraZoneShot | CameraZoneSweep | CameraZoneBlend | CameraZoneDuel;

/**
 * 존 영역을 월드 밖(최상층 위 하늘, 오른쪽 끝 너머)까지 열어 둘 때 쓰는 여유 폭. 배우가 월드 밖으로
 * 한 화면 넘게 나가는 일은 없다. 옛 분기의 "한쪽만 막힌 조건"을 유한한 사각형으로 옮길 때 쓴다.
 */
export const CAMERA_ZONE_OVERSCAN_PX = 720;

/**
 * 기본 히스테리시스. 배우 몸 반폭보다 작아, 끈적임 동안 배우가 구도 밖으로 빠지지 않는다.
 * 경계 1~2px 떨림(정지 미끄러짐·방향 전환·착지 반동)은 넉넉히 흡수한다.
 */
export const CAMERA_ZONE_HYSTERESIS_PX = 8;

/**
 * 저작 오류 점검(테스트·도구용). 빈 배열이면 통과다.
 * id 중복, 비유한 수(리플레이 JSON 에서 null 이 된다), 넓이 없는 사각형, 뒤집힌 경사를 찾는다.
 */
export function cameraZoneProblems(zones: readonly CameraZone[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const zone of zones) {
    if (seen.has(zone.id)) problems.push(`${zone.id}: duplicate id`);
    seen.add(zone.id);
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number" && !Number.isFinite(value)) problems.push(`${zone.id}: ${path} is not finite`);
      else if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
      }
    };
    walk(zone, "zone");
    const rects = [...(zone.areas ?? []), ...(zone.fallCatch === undefined ? [] : [zone.fallCatch.area])];
    for (const rect of rects) {
      if (!(rect.w > 0) || !(rect.h >= 0)) problems.push(`${zone.id}: empty area ${JSON.stringify(rect)}`);
    }
    if (zone.areas !== undefined && zone.areas.length === 0 && zone.climbLinkIds === undefined
      && zone.duringParkour === undefined && zone.fallCatch === undefined) {
      problems.push(`${zone.id}: no way to enter`);
    }
    if (zone.framing.kind === "blend") {
      const { inFromX, inToX, outFromX, outToX } = zone.framing.ramp;
      if (!(inFromX < inToX && inToX <= outFromX && outFromX < outToX)) problems.push(`${zone.id}: ramp out of order`);
    }
    if (zone.absorbFocusX !== undefined && zone.focus !== "yield") problems.push(`${zone.id}: absorbFocusX needs focus "yield"`);
    if (zone.climbLinkIds !== undefined && zone.when?.climbing === false) problems.push(`${zone.id}: climbLinkIds with climbing:false`);
  }
  return problems;
}
