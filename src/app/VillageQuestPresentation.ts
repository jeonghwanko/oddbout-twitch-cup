/**
 * 마을 본선 퀘스트의 화면 문구 단일 소유자.
 *
 * `sim/VillageQuestRules.ts`가 판정을, 이 파일이 그 판정을 읽는 모든 문장을 소유한다.
 * 트래커 한 줄, 저널 카드, 완료·갱신 배너가 전부 여기서 나오므로 같은 문구가 두 곳에
 * 따로 살 수 없다. 렌더는 여기서 받은 문자열을 배치만 한다.
 */

import { pickLocalized, type Locale } from "./Locale";
import { localeText } from "./Locale";
import type { VillageQuestStepArt } from "./VillageQuestArt";
import { VILLAGE_QUEST_STEP_ART } from "./VillageQuestArt";
import type { FirstOutfitPhase } from "../sim/FirstOutfitRules";
import type {
  VillageQuestChapterId,
  VillageQuestLine,
  VillageQuestStep,
  VillageQuestStepId,
  VillageQuestTarget,
} from "../sim/VillageQuestRules";
import { VILLAGE_QUEST_STEP_CHAPTER } from "../sim/VillageQuestRules";
import { FIRST_OUTFIT_PHASES } from "../sim/FirstOutfitRules";
import { GUEST_LIST_PROP_OF, type GuestListPropId, type GuestListTaskId } from "../sim/BlackthorneGuestListRules";

export interface VillageQuestStepCopy {
  readonly title: string;
  readonly detail: string;
}

/** 스텝 문구는 `{ ko, en }` 짝으로 쓴다(한국어 전용 문자열 래칫이 짝을 알아본다). */
type StepCopySource = Readonly<{ title: Readonly<{ ko: string; en: string }>; detail: Readonly<{ ko: string; en: string }> }>;

const STEP_COPY: Readonly<Record<VillageQuestStepId, StepCopySource>> = Object.freeze({
  "outfit-merchant-greeting": {
    title: { ko: "로잘린과 대화", en: "Talk to Rosaline" },
    detail: {
      ko: "옷가게 앞의 의상 상인 로잘린이 당신의 낯선 옷차림을 눈여겨보고 있다.",
      en: "Rosaline the clothier is eyeing your otherworldly clothes outside her shop.",
    },
  },
  "outfit-thief-costume": {
    title: { ko: "로잘린과 거래해 괴도 복장 갖추기", en: "Trade with Rosaline for the thief outfit" },
    detail: {
      ko: "현대 옷을 판 대금으로 괴도 복장을 고르고, 로잘린이 부탁하는 심부름까지 받는다.",
      en: "Sell your modern clothes, pick the thief outfit, and take the errand she offers.",
    },
  },
  "outfit-training-music-box": {
    title: { ko: "연습 회랑에서 오르골 회수", en: "Recover the music box in the Training Passage" },
    detail: {
      ko: "기초 훈련을 끝내면서 로잘린이 맡긴 오르골을 되찾는다.",
      en: "Finish basic training and bring back the music box Rosaline asked for.",
    },
  },
  "outfit-music-box-delivery": {
    title: { ko: "로잘린에게 오르골 전달", en: "Bring the music box to Rosaline" },
    detail: {
      ko: "오르골을 돌려주고 사례와 물약을 받는다.",
      en: "Return the music box, then take her reward and her potion.",
    },
  },
  "clockmaker-introduction": {
    title: { ko: "시계공 만나기", en: "Meet the clockmaker" },
    detail: {
      ko: "광장 한쪽의 시계공이 빼앗긴 태엽새 이야기를 들려준다.",
      en: "The clockmaker by the square has a story about a bird that was taken from him.",
    },
  },
  "blackthorne-turned-away": {
    title: { ko: "블랙손 저택에 들어가기", en: "Get into Blackthorne Manor" },
    detail: {
      ko: "저택 현관을 두드린다. 오늘 밤은 초대받은 손님만 들인다는 소문이다.",
      en: "Knock at the manor door. Rumour says only invited guests get in tonight.",
    },
  },
  "blackthorne-guest-list": {
    title: { ko: "동방의 귀빈 되기", en: "Become the guest from the East" },
    detail: {
      ko: "집사가 말한 세 가지를 갖춘다: 명함의 인장(시계공), 귀빈의 정장(로잘린), 명단에 오를 소문(광장의 신사). 순서는 자유다.",
      en: "Fix the three things the butler named: a seal on your card (clockmaker), a proper suit (Rosaline), and a rumour to get you on the list (the gentleman in the square). Any order.",
    },
  },
  "manor-clockwork-bird": {
    title: { ko: "블랙손 저택에서 태엽새 회수", en: "Recover the clockwork bird in Blackthorne Manor" },
    detail: {
      ko: "위층 수장고의 태엽새를 되찾는다. 회수 전에는 시간 제한이 없다.",
      en: "Take the bird back from the upstairs vault. There is no time limit before recovery.",
    },
  },
  "clockmaker-bird-return": {
    title: { ko: "시계공에게 태엽새 반환", en: "Return the clockwork bird to the clockmaker" },
    detail: {
      ko: "약속대로 빌려 온 태엽새를 시계공의 손에 돌려준다.",
      en: "Keep your word and put the borrowed bird back in the clockmaker's hands.",
    },
  },
  "calling-card-campaign": {
    title: { ko: "다른 저택 원정", en: "Explore other manors" },
    detail: {
      ko: "서로 다른 예고장을 제패할 때마다 메인 사건이 한 장씩 이어진다.",
      en: "Every different calling card you clear opens the next chapter of the case.",
    },
  },
});

export function villageQuestStepCopy(id: VillageQuestStepId, locale: Locale): VillageQuestStepCopy {
  const copy = STEP_COPY[id];
  return Object.freeze({ title: pickLocalized(locale, copy.title), detail: pickLocalized(locale, copy.detail) });
}

/** 접힌 패널은 행동만 남긴다. 장소와 상세 문장은 펼친 패널·기록에서 읽는다. */
const COMPACT_STEP_COPY: Readonly<Record<VillageQuestStepId, readonly [string, string] | Readonly<{ ko: string; en: string }>>> = Object.freeze({
  "outfit-merchant-greeting": ["로잘린과 대화", "Talk to Rosaline"],
  "outfit-thief-costume": ["괴도 복장 갖추기", "Get thief outfit"],
  "outfit-training-music-box": ["오르골 회수", "Recover music box"],
  "outfit-music-box-delivery": ["오르골 전달", "Return music box"],
  "clockmaker-introduction": ["시계공 만나기", "Meet clockmaker"],
  "blackthorne-turned-away": { ko: "저택 들어가기", en: "Enter the manor" },
  "blackthorne-guest-list": { ko: "귀빈 준비", en: "Become a guest" },
  "manor-clockwork-bird": ["태엽새 회수", "Recover clockwork bird"],
  "clockmaker-bird-return": ["태엽새 반환", "Return clockwork bird"],
  "calling-card-campaign": ["다른 저택 원정", "Explore manors"],
});

/** 스토리북 챕터 이름. 트래커의 대제목과 스토리북의 장 제목이 같은 문자열이다. */
const CHAPTER_TITLE: Readonly<Record<VillageQuestChapterId, Readonly<{ ko: string; en: string }>>> = Object.freeze({
  "rosaline-commission": { ko: "로잘린의 의뢰", en: "Rosaline's commission" },
  "clockwork-bird": { ko: "시계공의 태엽새", en: "The clockmaker's bird" },
  "calling-cards": { ko: "괴도의 예고장", en: "Calling cards" },
});

export function villageQuestChapterTitle(id: VillageQuestChapterId, locale: Locale): string {
  return pickLocalized(locale, CHAPTER_TITLE[id]);
}

/**
 * 수락한 퀘스트의 조건 한 줄. 트래커와 스토리북이 같은 줄을 그린다.
 * 조건이 따로 없는 퀘스트는 빈 목록이다 — 퀘스트 줄 자체가 하나뿐인 조건이다.
 */
export interface VillageQuestCondition {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
  /** 귀빈 준비 조건이면 그 준비가 주는 소품. HUD·스토리북이 체크 글자 대신 소품 아이콘을 그린다(4단계). */
  readonly prop?: GuestListPropId;
}

function reached(phase: FirstOutfitPhase | undefined, required: FirstOutfitPhase): boolean {
  return phase !== undefined && FIRST_OUTFIT_PHASES.indexOf(phase) >= FIRST_OUTFIT_PHASES.indexOf(required);
}

function condition(id: string, ko: string, en: string, done: boolean, locale: Locale): VillageQuestCondition {
  return Object.freeze({ id, label: localeText(locale, ko, en), done });
}

/**
 * 스텝의 조건. 판정은 전부 `VillageQuestStep`(체크리스트·배지)과 첫 복장 단계에서 읽는다 —
 * 조건을 위한 새 저장 필드는 없다. 완료한 스텝은 모든 조건이 체크된 채로 돌려준다.
 */
export function villageQuestConditions(
  step: VillageQuestStep, locale: Locale, context: VillageQuestOutfitContext = {},
): readonly VillageQuestCondition[] {
  const finished = step.status === "completed";
  const phase = context.outfitPhase;
  if (step.checklist !== null) {
    return Object.freeze(step.checklist.map((item) => Object.freeze({
      id: item.id, label: guestListTaskLabel(item.id, locale), done: finished || item.done, prop: GUEST_LIST_PROP_OF[item.id],
    })));
  }
  switch (step.id) {
    case "outfit-thief-costume":
      return Object.freeze([
        // 첫 옷 거래는 영수증 한 장의 맞바꾸기다(`trade-outfit`) — 파는 일과 입는 일이 한 번에 끝난다.
        condition("player-equipped", "회사원 옷과 괴도 복장 맞바꾸기", "Trade your office clothes for the thief outfit", finished || reached(phase, "player-equipped"), locale),
        condition("commission-accepted", "로잘린의 부탁 듣기", "Hear Rosaline's errand", finished, locale),
      ]);
    case "outfit-music-box-delivery":
      return Object.freeze([
        condition("music-box", "오르골 회수", "Recover the music box", true, locale),
        condition("delivered", "로잘린에게 전달", "Hand it to Rosaline", finished || reached(phase, "potion-received"), locale),
        condition("potion", "물약 사용 확인", "Review the potion", finished, locale),
      ]);
    case "clockmaker-bird-return":
      return Object.freeze([
        condition("bird", "태엽새 회수", "Recover the bird", true, locale),
        condition("returned", "시계공에게 돌려주기", "Return it to the clockmaker", finished, locale),
      ]);
    case "calling-card-campaign": {
      const badge = step.badge;
      const count = badge === null ? "" : ` ${badge.done}/${badge.total}`;
      return Object.freeze([
        condition("cards", `서로 다른 예고장 제패${count}`, `Clear different calling cards${count}`, finished, locale),
      ]);
    }
    default:
      return Object.freeze([]);
  }
}

/** 눈금(핍)과 eyebrow의 `n/N`은 같은 한 쌍에서 나온다. 두 번 세면 두 번 틀린다. */
export interface VillageQuestProgress {
  readonly done: number;
  readonly total: number;
}

export interface VillageQuestTracker {
  /** 스토리북 챕터 이름(대제목). 라인을 전부 끝냈으면 "마을 의뢰". */
  readonly heading: string;
  readonly chapterId: VillageQuestChapterId | null;
  /** 챕터 아래에 서는 수락한 퀘스트 한 줄(방향 안내 포함). 체크리스트 이름은 붙이지 않는다 — 조건 줄이 따로 선다. */
  readonly quest: string;
  readonly conditions: readonly VillageQuestCondition[];
  readonly status: string | null;
  readonly eyebrow: string;
  readonly title: string;
  readonly compactTitle: string;
  readonly badge: string | null;
  readonly target: VillageQuestTarget | null;
  /** 기존 마을 HUD 계약: 목표가 가리키는 입장 가능한 시설. */
  readonly facility: "mansion" | "tutorial" | null;
  readonly stepId: VillageQuestStepId | null;
  /** eyebrow 문구를 만든 바로 그 숫자 쌍. 핍을 그리는 쪽이 다시 계산하지 않는다. */
  readonly progress: VillageQuestProgress;
  /** 활성 스텝의 연출 서술. 라인을 전부 끝냈으면 null이고 글자만 남는다. */
  readonly art: VillageQuestStepArt | null;
}

export interface VillageQuestOutfitContext {
  /** 본선 스텝이 인계 단계에 머무르는 물약 확인 구간을 구분한다. */
  readonly outfitPhase?: FirstOutfitPhase;
  /**
   * 지금 광장에 선 마을 이야기(`villageStoryOnStage`). 주면 스토리북은 끝내지 않은 이야기 가운데 이 하나만
   * 지금 쓰는 페이지로 싣는다 — 광장에 없는 이야기를 "진행 중"으로 부르면 찾아갈 곳이 없다. 생략하면 첫 미완 이야기다.
   */
  readonly storyOnStage?: VillageQuestLine["side"][number]["id"] | null;
}

export interface VillageQuestTrackerContext extends VillageQuestOutfitContext {
  /** 로잘린 동행 중에는 목적지가 사람이므로 라인 문구 대신 동행 안내를 쓴다. */
  readonly escorting?: boolean;
}

function facilityOf(target: VillageQuestTarget | null): "mansion" | "tutorial" | null {
  return target === "manor" ? "mansion" : target === "training" ? "tutorial" : null;
}

/** 동시에 추적하는 퀘스트는 항상 하나. 사이드 사건은 여기에 절대 오르지 않는다. */
export function villageQuestTracker(
  line: VillageQuestLine,
  locale: Locale,
  context: VillageQuestTrackerContext = {},
): VillageQuestTracker {
  const active = line.active;
  const progress: VillageQuestProgress = Object.freeze(active === null
    ? { done: line.steps.length, total: line.steps.length }
    : { done: active.step, total: active.total });
  const art = active === null ? null : VILLAGE_QUEST_STEP_ART[active.id];
  const potionUse = active?.id === "outfit-music-box-delivery" && context.outfitPhase === "potion-received";
  const chapterId = active === null ? null : VILLAGE_QUEST_STEP_CHAPTER[active.id];
  const heading = chapterId === null ? localeText(locale, "마을 의뢰", "Village commissions")
    : villageQuestChapterTitle(chapterId, locale);
  const status = active === null ? localeText(locale, "의뢰 완료", "Complete")
    : potionUse ? localeText(locale, "✓ 오르골 인계 완료 · 물약 사용 대기", "✓ Music box delivered · Potion use pending")
    : active.id === "outfit-music-box-delivery" || active.id === "clockmaker-bird-return"
      ? localeText(locale, "✓ 회수 완료 · 인계 대기", "✓ Recovered · Ready to return")
      : active.id === "outfit-merchant-greeting" || active.id === "clockmaker-introduction"
        ? localeText(locale, "! 첫 만남", "! First meeting")
        : localeText(locale, "… 진행 중", "… In progress");
  const eyebrow = active === null
    ? localeText(locale, `마을 · ${progress.done}/${progress.total}단계 완료`, `VILLAGE · ${progress.done}/${progress.total} STEPS DONE`)
    : localeText(locale, `마을 · ${progress.done}/${progress.total}단계`, `VILLAGE · STEP ${progress.done}/${progress.total}`);
  if (context.escorting === true) {
    return Object.freeze({
      heading, chapterId, status,
      eyebrow,
      title: localeText(locale, "로잘린 따라가기", "Follow Rosaline"),
      quest: localeText(locale, "로잘린 따라가기", "Follow Rosaline"),
      conditions: Object.freeze([]),
      compactTitle: localeText(locale, "로잘린 따라가기", "Follow Rosaline"),
      badge: null,
      target: null,
      facility: null,
      stepId: active?.id ?? null,
      progress,
      art,
    });
  }
  const copy = villageQuestStepCopy(active?.id ?? "calling-card-campaign", locale);
  const nextTask = active?.checklist?.find((item) => !item.done) ?? null;
  const title = active === null ? localeText(locale, "의뢰를 모두 마쳤어요", "All commissions complete")
    : potionUse ? localeText(locale, "물약 사용 확인", "Review potion use")
      : nextTask !== null ? `${copy.title} · ${guestListTaskLabel(nextTask.id, locale)}` : copy.title;
  const compact = active === null ? null : COMPACT_STEP_COPY[active.id];
  const compactTitle = active === null || potionUse || compact === null ? title
    : "ko" in compact ? pickLocalized(locale, compact) : localeText(locale, ...compact);
  const questName = active === null ? title : copy.title;
  return Object.freeze({
    heading, chapterId, status,
    eyebrow,
    title,
    quest: questName,
    conditions: active === null ? Object.freeze([]) : villageQuestConditions(active, locale, context),
    compactTitle,
    badge: active?.badge === null || active?.badge === undefined ? null : `${active.badge.done}/${active.badge.total}`,
    target: active?.target ?? null,
    facility: facilityOf(active?.target ?? null),
    stepId: active?.id ?? null,
    progress,
    art,
  });
}

/** 현재 스텝과 실제 선택한 의뢰인이 일치할 때만 인계 동사를 쓴다. */
export function villageQuestInteractionLabel(
  step: VillageQuestStepId | null, target: "merchant" | "clockmaker", locale: Locale,
  context: VillageQuestOutfitContext = {},
): string {
  if (target === "merchant" && step === "outfit-music-box-delivery" && context.outfitPhase === "potion-received")
    return localeText(locale, "물약 사용 확인", "Review potion use");
  if (target === "merchant" && step === "outfit-music-box-delivery")
    return localeText(locale, "오르골 건네기", "Hand over the music box");
  if (target === "clockmaker" && step === "clockmaker-bird-return")
    return localeText(locale, "태엽새 돌려주기", "Return the clockwork bird");
  return localeText(locale, "대화", "Talk");
}

/** 귀빈 준비 한 칸의 이름(누구에게 무엇을). 트래커·기록·하위 배너가 같은 이름을 쓴다. */
export function guestListTaskLabel(id: GuestListTaskId, locale: Locale): string {
  switch (id) {
    case "seal": return localeText(locale, "시계공의 인장", "The clockmaker's seal");
    case "suit": return localeText(locale, "로잘린의 정장", "Rosaline's suit");
    case "rumor": return localeText(locale, "신사의 소문", "The gentleman's rumour");
  }
}

/** 귀빈 준비가 주는 소품의 이름. HUD 소품 칸·스토리북 스티커의 읽기 이름(aria·툴팁)이다 — 화면에는 그림만 선다. */
export function guestListPropLabel(id: GuestListPropId, locale: Locale): string {
  switch (id) {
    case "sealed-card": return localeText(locale, "인장 명함", "Sealed card");
    case "eastern-robe": return localeText(locale, "동방 예복", "Eastern robe");
    case "monocle": return localeText(locale, "외알 안경", "Monocle");
  }
}

export type VillageQuestBannerKind = "completed" | "updated";

/** 완료는 더 길고 갱신은 짧다. 두 톤을 겹치지 않게 순차로 보여 준다. */
export const VILLAGE_QUEST_BANNER_MS = Object.freeze({ completed: 4_000, updated: 2_500 });
