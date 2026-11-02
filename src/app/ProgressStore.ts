import type { ManorExplorationState } from "../sim/ManorExplorationRules";
import { carryGrievesStory, rememberGrievesStory, type GrievesStoryFact } from "../sim/GrievesStoryRules";
import type { MetaState } from "../sim/MetaProgressRules";
import type { VillageStoryMemory } from "../sim/VillageStoryRules";
import type { VillageHomecomingPresentation } from "./VillageHomecoming";
import { loadMeta, saveManorDiscovery, saveMeta } from "../platform/metaStorage";
import { clearPendingHomecoming, loadPendingHomecoming, savePendingHomecoming } from "../platform/homecomingStorage";

/**
 * 진행 저장의 주인(2026-10-11). 화면은 진행을 여기서만 읽고 쓴다 — `platform` 의 저장소(`metaStorage` 와 귀환 보고)를
 * 직접 부르지 않는다(`architecture.test` 가 막는다).
 *
 * 전에는 렌더 파일 열여덟 곳이 `loadMeta`·`saveMeta` 를 직접 불렀다. 대부분 붙들고 있던 사본에 전이를 걸어 통째로 저장했다 — 그 사이에
 * 다른 곳이 진행을 바꿨다면 그 변경을 덮는다. 여기서는 바꾸는 쪽이 전이(`change`)만 주고, 주인이 지금 저장된 진행에 그 전이를 걸어
 * 저장한다(`commitProgress`). 화면은 돌려받은 진행을 다음 화면 데이터로 넘기거나 다시 그린다.
 *
 * 저장 실패(사파리 프라이빗 등)는 `stored: false` 로 알리고, 같은 탭은 그 진행을 계속 읽는다(`metaStorage`).
 */
export interface ProgressCommit {
  /** 저장한(또는 바뀌지 않은) 진행. */
  readonly meta: MetaState;
  /** 저장소에 적혔다. 바뀐 것이 없으면 참. */
  readonly stored: boolean;
  /** 전이가 진행을 바꿨다(같은 객체를 돌려주지 않았다). */
  readonly changed: boolean;
}

/** 지금 저장 슬롯의 진행(읽기 전용 — 바꾸려면 `commitProgress`). `fallback`: 원문이 없거나 깨졌을 때 돌려줄 진행. */
export function currentProgress(fallback?: MetaState): MetaState {
  return loadMeta(fallback);
}

/**
 * 지금 저장된 진행에 `change` 를 걸어 저장한다. `change` 가 같은 객체를 돌려주면 아무것도 쓰지 않는다. `atomic`: 저장하지 못하면 바꾸지
 * 않는다 — 같은 탭에도 남기지 않고 전 진행으로 되돌린다(돈을 쓰는 거래처럼 반쯤 남으면 안 되는 일). 그때는 `changed: false`.
 * `fallback`: 저장된 원문이 없거나 깨졌을 때 전이를 걸 진행(잠입처럼 화면이 들고 온 진행 — `currentProgress` 와 같다).
 */
export function commitProgress(change: (meta: MetaState) => MetaState,
  options: { readonly atomic?: boolean; readonly fallback?: MetaState } = {}): ProgressCommit {
  const before = loadMeta(options.fallback), meta = change(before);
  if (meta === before) return { meta, stored: true, changed: false };
  if (saveMeta(meta)) return { meta, stored: true, changed: true };
  if (!options.atomic) return { meta, stored: false, changed: true };
  saveMeta(before);
  return { meta: before, stored: false, changed: false };
}

/** 저택 발견을 지금 저장된 진행의 저택 기억에만 덧붙인다(`base`: 이 런이 들고 온 기억 — 방문 수의 최댓값을 지킨다). */
export function commitManorDiscovery(base: MetaState, discovery: ManorExplorationState, entered = false): ProgressCommit {
  return { ...saveManorDiscovery(base, discovery, entered), changed: true };
}

/**
 * 그리브스 첫 편의 사실(도입·회상 시청, 사용인 직접 퇴장)을 런 도중 곧바로 저장한다. 지금 저장된 진행에 `base`(씬이 들고 온 진행 —
 * 앞선 저장 실패로 같은 탭에만 남은 사실 포함)의 그리브스 기억을 합치고 `facts` 를 덧붙인다. 시청은 내려가지 않고 퇴장은 취소되지 않는다.
 * 이미 아는 사실이면 쓰지 않는다(`changed: false`). 씬은 돌려받은 `meta` 로 자기 사본을 바꿔야 한다 — 회랑·체크포인트 재시작이 그 사본으로
 * 다음 런을 짠다(`composeRun` → `manor.initialGrievesStory`).
 */
export function commitGrievesStory(base: MetaState, ...facts: readonly GrievesStoryFact[]): ProgressCommit {
  return commitProgress(latest => rememberGrievesStory(carryGrievesStory(latest, base), ...facts), { fallback: base });
}

/** 마을 생활 이야기의 기억(`MetaState.village.story`). */
export function villageStoryProgress(): VillageStoryMemory { return loadMeta().village.story; }
export function storeVillageStoryProgress(memory: VillageStoryMemory): boolean {
  return commitProgress(meta => ({ ...meta, village: { ...meta.village, story: memory } })).stored;
}

/** 첫 마을 로잘린 동행을 마쳤다(`MetaState.village.rosalineEscortDone`). */
export function rosalineEscortDone(): boolean { return loadMeta().village.rosalineEscortDone; }
export function completeRosalineEscort(): void {
  commitProgress(meta => meta.village.rosalineEscortDone ? meta : { ...meta, village: { ...meta.village, rosalineEscortDone: true } });
}

/** 정산에서 넘어와 아직 마을이 보여 주지 않은 귀환 보고(같은 슬롯의 곁 기록, `homecomingStorage`). */
export function pendingHomecoming(): VillageHomecomingPresentation | null { return loadPendingHomecoming(); }
export function storePendingHomecoming(report: VillageHomecomingPresentation): void { savePendingHomecoming(report); }
export function clearHomecoming(): void { clearPendingHomecoming(); }
