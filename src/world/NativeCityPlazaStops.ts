import vending from '../assets/native-city-cat-vending-runtime.json';
import type {CityPoint,NativeCityDefinition} from './NativeCityDefinition';
import {NATIVE_CITY_PLAZA_GENTLEMAN_OFFSET,NATIVE_CITY_PLAZA_GENTLEMAN_STAND} from './NativeCityTalkSpot';
import {NATIVE_CITY_TOURNAMENT_BOARD} from './NativeCityTournamentBoard';

/**
 * 광장(V1)에서 광장 정거장(`plaza`, 배달원 엘리어스)과 따로 상대하는 둘(2026-10-12).
 * 예전에는 둘 다 엘리어스 정거장에 얹혀 있었다 — 신사의 소문 장면을 엘리어스 옆에서 열고, 엘리어스에게 E 를 누르면 자판기를 썼다.
 *
 * - `gentleman`: 광장 신사(Drive C05). 발은 광장 정거장 + `NATIVE_CITY_PLAZA_GENTLEMAN_OFFSET`(옛 자리 그대로), 정거장 점은 그 발에서
 *   기본 카메라 대화 자리(`NATIVE_CITY_PLAZA_GENTLEMAN_STAND`, 1.5보 앞)다. 씬은 정거장 점에서 거꾸로 발을 찾는다
 *   (`nativeCityResidentFootOffsetPx`). 주인공은 다른 주민처럼 그가 바라보는 쪽 1.5보에 선다(`nativeCityTalkSpot`).
 * - `vending`: 분수대 고양이 자판기 정면 앞에 서는 자리. 주민이 없는 정거장이라 E·하단 안내는 "이용"이다.
 * - `board`: 주간 토너먼트 대진 게시판 정면 앞에 서는 자리(2026-10-18, `NativeCityTournamentBoard`). E·하단 안내는 "보기", 대진표를 연다.
 */

/** 고양이 자판기가 서는 평면 자리 — 옛 분수 카드 앵커(`nativeCityCardArt` 의 `fountain`, 10MB 카드 json 이라 여기서 읽지 않는다. 시험이 같은지 본다). */
export const NATIVE_CITY_CAT_VENDING_ANCHOR:CityPoint=Object.freeze(vending.placement.anchor) as unknown as CityPoint;
/** 자판기 앵커에서 정면(`frontNormalPlanDeg`, 기본 카메라 쪽) 쪽으로 서는 거리(평면 단위): 분수 받침 가장자리(약 10.5)에서 1.5보(5.73) 더. */
export const NATIVE_CITY_CAT_VENDING_STAND_UNITS=vending.placement.standDistancePlan;

const front=vending.views.frontNormalPlanDeg*Math.PI/180;

/**
 * 두 정거장의 이름. 다른 정거장은 한국어를 월드 json(`stops[].label`)이 갖지만 이 둘은 여기서 만들어지므로 영어 짝도 같이 둔다 —
 * 정거장 `label` 은 `ko`, `nativeCityStopName` 의 영어는 `en` 을 읽는다.
 */
export const NATIVE_CITY_PLAZA_STOP_NAMES=Object.freeze({
 gentleman:Object.freeze({ko:'광장의 신사',en:'Gentleman of the square'}),
 vending:Object.freeze({ko:'고양이 자판기',en:'Cat vending machine'}),
 board:Object.freeze({ko:'대진 게시판',en:'Tournament board'}),
});

export const NATIVE_CITY_CAT_VENDING_STOP=Object.freeze({id:'vending' as const,label:NATIVE_CITY_PLAZA_STOP_NAMES.vending.ko,interactionRadius:8,
 point:Object.freeze([NATIVE_CITY_CAT_VENDING_ANCHOR[0]+Math.cos(front)*NATIVE_CITY_CAT_VENDING_STAND_UNITS,
  NATIVE_CITY_CAT_VENDING_ANCHOR[1]+Math.sin(front)*NATIVE_CITY_CAT_VENDING_STAND_UNITS]) as unknown as CityPoint});

export const NATIVE_CITY_TOURNAMENT_BOARD_STOP=Object.freeze({id:'board' as const,label:NATIVE_CITY_PLAZA_STOP_NAMES.board.ko,interactionRadius:8,
 point:NATIVE_CITY_TOURNAMENT_BOARD.stand});

/** 광장 화면(V1)의 정거장 목록에 광장 신사·고양이 자판기·대진 게시판을 더한다. 광장 정거장이 없거나 이미 있으면 그대로(합성을 두 번 거쳐도 같다). */
export function withNativeCityPlazaStops(stops:NativeCityDefinition['stops']):NativeCityDefinition['stops']{
 const plaza=stops.find(stop=>stop.id==='plaza');
 if(!plaza||stops.some(stop=>stop.id==='gentleman'||stop.id==='vending'||stop.id==='board'))return stops;
 const [ox,oy]=NATIVE_CITY_PLAZA_GENTLEMAN_OFFSET,[sx,sy]=NATIVE_CITY_PLAZA_GENTLEMAN_STAND;
 const gentleman={id:'gentleman' as const,label:NATIVE_CITY_PLAZA_STOP_NAMES.gentleman.ko,interactionRadius:7,point:[plaza.point[0]+ox+sx,plaza.point[1]+oy+sy] as CityPoint};
 return [...stops,gentleman,NATIVE_CITY_CAT_VENDING_STOP,NATIVE_CITY_TOURNAMENT_BOARD_STOP];
}
