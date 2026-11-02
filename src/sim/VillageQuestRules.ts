import { parseVillageQuestDefinition, villageQuestContent, type VillageQuestObjective, type VillageQuestStepId, type VillageQuestChapterId, type VillageQuestTarget } from "./VillageQuestDefinition";
export type { VillageQuestStepId, VillageQuestChapterId, VillageQuestTarget } from "./VillageQuestDefinition";
/**
 * 마을 본선 퀘스트 라인.
 *
 * 진행도를 따로 저장하지 않는다. 이미 존재하는 `MetaState`(첫 복장 단계, 훈련 완료,
 * 시계공 기억, 저택 회수, 제패한 예고장)와 `VillageStoryMemory`에서 매번 다시 계산한다.
 * 습격의 `heistQuestJournal()`이 검증한 상태 파생 방식과 같은 계약이며, 이벤트 로그나
 * 별도 진행 테이블을 새로 만들지 않는다.
 *
 * 문구는 여기 없다 — `app/VillageQuestPresentation.ts`가 소유한다. 이 파일은 판정만 한다.
 */

import { blackthorneStory } from "./BlackthorneStoryRules";
import {
  GUEST_LIST_TASK_IDS,
  guestListDoneCount,
  guestListOf,
  guestListReady,
  remainingGuestListTasks,
  type GuestListTaskId,
} from "./BlackthorneGuestListRules";
import { campaignProgress } from "./CampaignProgressRules";
import { FIRST_OUTFIT_PHASES, type FirstOutfitPhase } from "./FirstOutfitRules";
import type { MetaState } from "./MetaProgressRules";
import { VILLAGE_STORY_IDS, type VillageStoryId, type VillageStoryMemory } from "./VillageStoryRules";

const OBJECTIVES: Readonly<Record<VillageQuestObjective, (meta: MetaState) => boolean>> = {
  "offer-seen": meta => reachedOutfitPhase(meta.firstOutfit.phase, "offer-seen"),
  "commission-accepted": meta => reachedOutfitPhase(meta.firstOutfit.phase, "commission-accepted"),
  // Legacy completed outfits are stronger evidence than a missing onboarding flag.
  "training-completed": meta => meta.onboarding.trainingCompleted || reachedOutfitPhase(meta.firstOutfit.phase, "commission-completed"),
  "commission-completed": meta => reachedOutfitPhase(meta.firstOutfit.phase, "commission-completed"),
  "clockmaker-introduced": meta => blackthorneStory(meta).introductionSeen,
  "turned-away": meta => guestListOf(meta).turnedAway,
  "guest-list-ready": guestListReady,
  "bird-recovered": meta => meta.blackthorneCompleted === true,
  "bird-returned": meta => blackthorneStory(meta).returned,
  "campaign-completed": meta => campaignProgress(meta).complete,
};
export const VILLAGE_QUEST_DEFINITION = parseVillageQuestDefinition(villageQuestContent, Object.keys(OBJECTIVES) as VillageQuestObjective[]);
export const VILLAGE_QUEST_STEP_IDS = VILLAGE_QUEST_DEFINITION.order;
export const VILLAGE_QUEST_CHAPTER_IDS = VILLAGE_QUEST_DEFINITION.chapters;
export const VILLAGE_QUEST_STEP_CHAPTER = Object.freeze(Object.fromEntries(VILLAGE_QUEST_STEP_IDS
  .map(id => [id, VILLAGE_QUEST_DEFINITION.steps[id].chapter])) as Record<VillageQuestStepId, VillageQuestChapterId>);

export type VillageQuestStepStatus = "completed" | "active" | "upcoming";

export interface VillageQuestBadge {
  readonly done: number;
  readonly total: number;
}

export interface VillageQuestStep {
  readonly id: VillageQuestStepId;
  readonly status: VillageQuestStepStatus;
  readonly target: VillageQuestTarget;
  /** 활성 라인 기준 1-based 순번. 여성 주인공은 첫 복장 4단계가 없으므로 다시 센다. */
  readonly step: number;
  readonly total: number;
  readonly badge: VillageQuestBadge | null;
  /** 순서 자유 체크리스트(가짜 귀빈 준비). 없는 스텝은 null. */
  readonly checklist: readonly VillageQuestChecklistItem[] | null;
}

export interface VillageQuestChecklistItem {
  readonly id: GuestListTaskId;
  readonly done: boolean;
}

/** 귀빈 준비 하나가 가리키는 사람. 비컨·마커가 남은 준비 가운데 첫 사람을 가리킨다. */
export const GUEST_LIST_TASK_TARGET: Readonly<Record<GuestListTaskId, VillageQuestTarget>> = Object.freeze({
  seal: "clockmaker",
  suit: "merchant",
  rumor: "gentleman",
});

export interface VillageQuestSideStep {
  readonly id: VillageStoryId;
  readonly completed: boolean;
}

export interface VillageQuestLine {
  readonly steps: readonly VillageQuestStep[];
  /** 동시에 추적하는 본선 스텝은 항상 하나뿐이다. 전부 끝나면 null. */
  readonly active: VillageQuestStep | null;
  readonly completed: readonly VillageQuestStepId[];
  /** 선택 사건. 트래커에는 절대 올라가지 않고 기록에만 남는다. */
  readonly side: readonly VillageQuestSideStep[];
  readonly complete: boolean;
}

function reachedOutfitPhase(phase: FirstOutfitPhase, required: FirstOutfitPhase): boolean {
  return FIRST_OUTFIT_PHASES.indexOf(phase) >= FIRST_OUTFIT_PHASES.indexOf(required);
}


type PlannedStep = readonly [VillageQuestStepId, VillageQuestTarget, boolean, VillageQuestBadge | null, (readonly VillageQuestChecklistItem[] | null)?];

function plannedSteps(meta: MetaState): readonly PlannedStep[] {
  const guestList = guestListOf(meta);
  const remaining = remainingGuestListTasks(meta);
  const campaign = campaignProgress(meta);
  return VILLAGE_QUEST_STEP_IDS.filter(id => {
    const definition = VILLAGE_QUEST_DEFINITION.steps[id];
    return definition.character === "all" || meta.character === definition.character;
  }).map(id => {
    const definition = VILLAGE_QUEST_DEFINITION.steps[id];
    const guest = definition.objective === "guest-list-ready";
    const badge = guest ? { done: guestListDoneCount(guestList), total: GUEST_LIST_TASK_IDS.length }
      : definition.objective === "campaign-completed" ? { done: campaign.evidence, total: campaign.total } : null;
    const target = definition.target === "remaining-guest-task" ? GUEST_LIST_TASK_TARGET[remaining[0] ?? "rumor"] : definition.target;
    return [id, target, OBJECTIVES[definition.objective](meta), badge,
      guest ? GUEST_LIST_TASK_IDS.map(id => Object.freeze({ id, done: guestList[id] })) : null] as const;
  });
}

/**
 * 저장 상태에서 마을 본선을 다시 계산한다.
 *
 * 완료는 단조롭게 본다: 앞 스텝이 남아 있으면 뒤 스텝의 조건이 이미 맞아도 완료로
 * 세지 않는다. 그래야 "지금 할 일"이 언제나 목록의 첫 미완료 스텝 하나가 된다.
 */
export function villageQuestLine(meta: MetaState, stories: VillageStoryMemory = {}): VillageQuestLine {
  const planned = plannedSteps(meta);
  const total = planned.length;
  const steps: VillageQuestStep[] = [];
  const completed: VillageQuestStepId[] = [];
  let blocked = false;
  let active: VillageQuestStep | null = null;
  for (const [index, [id, target, satisfied, badge, checklist]] of planned.entries()) {
    const done = satisfied && !blocked;
    if (!done) blocked = true;
    const status: VillageQuestStepStatus = done ? "completed" : active === null ? "active" : "upcoming";
    const step: VillageQuestStep = Object.freeze({ id, status, target, step: index + 1, total, badge,
      checklist: checklist === undefined || checklist === null ? null : Object.freeze([...checklist]) });
    steps.push(step);
    if (done) completed.push(id);
    else if (status === "active") active = step;
  }
  return Object.freeze({
    steps: Object.freeze(steps),
    active,
    completed: Object.freeze(completed),
    side: Object.freeze(VILLAGE_STORY_IDS.map((id) => Object.freeze({ id, completed: stories[id] !== undefined }))),
    complete: active === null,
  });
}
