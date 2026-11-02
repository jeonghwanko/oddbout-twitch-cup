import current from './native-city-current-building-art.json';
/** Legacy facility callers share the adopted boutique artwork. */
export const VILLAGE_FACILITY_ART = {
  // 최신 로잘린 가게(B001) 정면은 불투명 면 원화다(11272eb2). 옛 오림 원화처럼 투명하다고 적지 않는다.
  clothier: { key: "village-facility-clothier", ...current.buildings.B001, transparent: false },
  training: { key: "village-facility-training", path: "art/village/facility-swap/training-building.webp", w: 342, h: 298, transparent: true },
  ground: { key: "village-facility-ground", path: "art/village/facility-swap/continuous-ground.webp", w: 1130, h: 620, transparent: true },
} as const;

/** 회랑 원화의 아치 문짝 텍셀. 렌더 크롭과 월드 출입구가 공유한다. */
export const VILLAGE_TRAINING_DOOR = {
  x: 132, y: 188, width: 28, height: 62,
  outline: [[0, 5], [8, 0], [20, 4], [27, 10], [27, 61], [0, 50]] as const,
};
