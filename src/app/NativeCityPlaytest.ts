import { readRuntimeOptions } from "./RuntimeOptions";
import { createMeta, completeVillageIntro, selectCharacter } from "../sim/MetaProgressRules";
import { landReceiver } from "../sim/OtherworldItemRules";

/**
 * `?stage=city-v1` 개발 진입. 일반 빌드는 정상 게임 진행과 저장을 사용한다.
 * 하네스가 켜지면 부팅이 곧장 도시로 가고, 진행은 회사원 고정 meta 로 메모리에만 두며(`metaStorage`),
 * 남는 기록은 `kaito_web.city-v1.` 주소에 쓴다(`storageKeys.developmentStorageKey`). 실제 저장을 건드리지 않는다.
 */
export function nativeCityPlaytestEnabled(stage = readRuntimeOptions().stage, development = import.meta.env.DEV): boolean {
  return development && stage === "city-v1";
}

export function createNativeCityPlaytestMeta(search: string = globalThis.location?.search ?? "") {
  const params = new URLSearchParams(search), otto = params.get("campaign") === "otto";
  const look = params.get("look");
  if (look === "female" || look === "female-civilian") {
    const female = completeVillageIntro(selectCharacter(createMeta(), "female"));
    const dressed = look === "female" ? { ...female, femalePrologue: { phase: "completed" as const } } : female;
    return otto ? landReceiver(dressed) : dressed;
  }
  const meta = completeVillageIntro(selectCharacter(createMeta(), "male"));
  if (params.get("look") !== "handsome" && !otto) return meta;
  const handsome = { ...meta, firstOutfit: { ...meta.firstOutfit, phase: "commission-completed" as const } };
  return otto ? landReceiver(handsome) : handsome;
}
