import source from "../assets/village-layered.json";
import { VILLAGE_FACILITY_ART, VILLAGE_TRAINING_DOOR } from "../assets/VillageFacilityArt";

/** ② 광장 옷가게 / ① 서쪽 회랑. 부지·식재 실루엣을 보존하며 시설의 외관을 교체한다. */
export const VILLAGE_FACILITY_LOTS = { tutorial: "south-house", "south-house": "tutorial" } as const;

export const VILLAGE_LAYERED_LAYOUT = {
  ...source,
  assets: source.assets.map(layer => {
    if (layer.id !== "tutorial" && layer.id !== "south-house") return layer;
    const lotId = VILLAGE_FACILITY_LOTS[layer.id];
    const lot = source.assets.find(candidate => candidate.id === lotId)!;
    const art = layer.id === "tutorial" ? VILLAGE_FACILITY_ART.training : VILLAGE_FACILITY_ART.clothier;
    return { ...lot, id: layer.id, ...art, scale: lot.scale / 2 };
  }).concat([{
    ...source.assets[0]!, ...VILLAGE_FACILITY_ART.ground,
    id: "facility-ground", kind: "material", sourceX: 105, sourceY: 510,
    x: source.registration.offsetX + 105 * source.registration.scale,
    y: 510 * source.registration.scale, scale: source.registration.scale / 2, anchorY: 0,
  }]),
};

/** 원화의 2배 해상도 텍셀에서 월드로. 문·간판·대화가 같은 등록점을 쓴다. */
export function villageFacilityLocalPoint(id: "tutorial" | "south-house", x: number, y: number) {
  const layer = VILLAGE_LAYERED_LAYOUT.assets.find(candidate => candidate.id === id)!;
  return { x: layer.x + x * layer.scale, y: layer.y + y * layer.scale };
}

/** 회랑 아치 현관의 왼쪽/오른쪽 문설주와, 밖으로 한 걸음 떨어진 대화·복귀 자리. */
export const VILLAGE_TRAINING_ENTRY = {
  gate: {
    left: villageFacilityLocalPoint("tutorial", VILLAGE_TRAINING_DOOR.x, VILLAGE_TRAINING_DOOR.y + 50),
    right: villageFacilityLocalPoint("tutorial", VILLAGE_TRAINING_DOOR.x + VILLAGE_TRAINING_DOOR.width, VILLAGE_TRAINING_DOOR.y + VILLAGE_TRAINING_DOOR.height),
  },
  approach: { x: 108, y: 660 },
  returnAt: { x: 124, y: 665 },
};

/** 옷가게 열린 마당의 남동 입구. 로잘린과 주인공이 길을 막지 않고 마주 본다. */
export const VILLAGE_CLOTHIER_ENTRY = {
  actor: { x: 388, y: 619 },
  interaction: { x: 412, y: 631 },
  sign: { x: 341, y: 480 },
};

/** 회랑 현관 앞의 기존 돌 포장. 문설주 바로 바깥부터 남쪽 골목까지 이어진다. */
export const VILLAGE_TRAINING_FORECOURT = [[74, 644], [103, 626], [185, 664], [275, 685], [240, 727], [100, 680]];
