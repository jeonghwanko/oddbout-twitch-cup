/**
 * 나만의 스토리북 — 마을 본선을 챕터로 묶어 일기처럼 적는 책.
 *
 * 마을의 퀘스트 기록이다(T). "무엇을 해야 하나"와 "무슨 일이 있었나"를 한 책에 담고, 다 채우면 이야기 도감이 된다. 완료한 퀘스트마다 한 단락이 적히고, 지금 수락한 퀘스트는 챕터 끝의
 * "쓰고 있는 페이지"에 조건 체크와 함께 선다. 판정은 전부 `VillageQuestLine` 에서 읽는다 — 새 저장은 없다.
 *
 * 아직 열리지 않은 챕터는 제목도 감춘다 — 다음 이야기를 미리 알리지 않는다.
 */

import { pickLocalized, type Locale } from "./Locale";
import { localeText } from "./Locale";
import {
  villageQuestChapterTitle,
  villageQuestConditions,
  villageQuestStepCopy,
  type VillageQuestCondition,
  type VillageQuestOutfitContext,
} from "./VillageQuestPresentation";
import { villageStoryName, villageStorySummary } from "./VillageStoryPresentation";
import { GUEST_LIST_PROP_IDS, type GuestListPropId } from "../sim/BlackthorneGuestListRules";
import {
  VILLAGE_QUEST_CHAPTER_IDS,
  VILLAGE_QUEST_STEP_CHAPTER,
  type VillageQuestChapterId,
  type VillageQuestLine,
  type VillageQuestStepId,
} from "../sim/VillageQuestRules";

export type StorybookChapterStatus = "locked" | "writing" | "completed";
/** 본선 챕터와, 마지막에 붙는 번외 "마을의 작은 이야기"(선택 사건). */
export type StorybookChapterId = VillageQuestChapterId | "village-stories" | "native-city" | "female-prologue" | "otto-town";

export interface StorybookEntry {
  /** 본선 스텝 id 또는 마을 이야기 id. 잉크 연출이 "처음 보는 단락"을 가리는 열쇠다. */
  readonly stepId: string;
  /** 완료한 퀘스트의 이름. 단락 위에 작은 소제목으로 선다. */
  readonly title: string;
  readonly text: string;
  /** 단락 아래 붙는 소품 스티커. 지금은 끝낸 "귀빈 준비"(세 소품)만 가진다. 그림은 4단계(StorybookScene). */
  readonly stickers?: readonly GuestListPropId[];
}

export interface StorybookCurrentPage {
  readonly stepId: string;
  readonly quest: string;
  readonly detail: string;
  readonly conditions: readonly VillageQuestCondition[];
}

export interface StorybookChapter {
  readonly id: StorybookChapterId;
  /** 본선은 1부터. 여성 전용 도입부는 0(서장)이며 남성의 첫 복장 의뢰와 분리한다. */
  readonly number: number;
  readonly status: StorybookChapterStatus;
  /** 잠긴 챕터는 "???" 다. */
  readonly title: string;
  readonly label: string;
  readonly entries: readonly StorybookEntry[];
  readonly current: StorybookCurrentPage | null;
  /** 지금 쓰는 페이지의 목표로 걸어갈 수 있는가. 본선만 길 안내가 있다. */
  readonly navigable: boolean;
}

/**
 * 도감 진행. 이 책이 곧 도감이다 — 적힌 단락 하나가 한 칸이고, 전부 채우면 도감 완성.
 * 전체 칸 수는 이 주인공의 본선 스텝 + 마을 이야기 전부다(잠긴 칸도 센다).
 */
export interface StorybookCollection {
  readonly collected: number;
  readonly total: number;
  readonly complete: boolean;
}

export interface VillageStorybook {
  readonly title: string;
  readonly chapters: readonly StorybookChapter[];
  /** 책을 열 때 펼칠 챕터. 쓰고 있는 챕터, 없으면 마지막으로 끝낸 챕터. */
  readonly openChapterId: StorybookChapterId;
  readonly collection: StorybookCollection;
}

/** 완료한 퀘스트 하나가 남기는 일기 한 단락. 1인칭, 밝은 슬랩스틱 괴도의 말투. */
const DIARY: Readonly<Record<VillageQuestStepId, Readonly<{ ko: string; en: string }>>> = Object.freeze({
  "outfit-merchant-greeting": {
    ko: "눈을 떠 보니 낯선 마을이었다. 옷가게 앞의 로잘린이 내 정장을 위아래로 훑더니 \"그 천, 팔 생각 없어?\" 하고 물었다. 이 세계에선 내 정장도 진귀한 물건인 모양이다.",
    en: "I woke up in a town I had never seen. Rosaline, outside her shop, looked my office suit up and down and asked, \"Selling that fabric?\" In this world, even my suit is a rare find.",
  },
  "outfit-thief-costume": {
    ko: "정장을 판 돈으로 괴도 복장을 샀다. 망토가 생각보다 무겁다. 갈아입자마자 로잘린이 첫 의뢰를 내밀었다 — 연습 회랑에 떨어뜨린 오르골을 찾아 달란다.",
    en: "I traded the suit for a thief's outfit. The cape is heavier than it looks. The moment I changed, Rosaline handed me my first commission: find the music box she lost in the Training Passage.",
  },
  "outfit-training-music-box": {
    ko: "연습 회랑에서 구르고, 숨고, 넘어지고, 또 굴렀다. 그래도 오르골은 무사히 손에 넣었다. 태엽을 감자 작은 왈츠가 흘러나왔다.",
    en: "In the Training Passage I rolled, hid, tripped, and rolled again. Still, the music box came back safe. One turn of the key and a little waltz spilled out.",
  },
  "outfit-music-box-delivery": {
    ko: "오르골을 돌려주자 로잘린이 물약 한 병을 내밀었다. 마셨더니… 거울 속에 처음 보는 미남이 서 있었다. 나다. 아마도.",
    en: "When I returned the music box, Rosaline handed me a potion. One sip later, a handsome stranger stood in the mirror. Me. Probably.",
  },
  "clockmaker-introduction": {
    ko: "광장의 시계공이 빈 받침을 보여 주었다. 블랙손 저택에 빌려준 태엽새가 돌아오지 않는단다. 괴도가 할 일이 생겼다.",
    en: "The clockmaker in the square showed me an empty perch. The clockwork bird he lent to Blackthorne Manor never came back. A job for a phantom thief.",
  },
  "blackthorne-turned-away": {
    ko: "저택 문을 두드렸다. 명함부터 내밀었는데 백지였다. 집사는 명단·복장·인장을 들먹이며 문을 쾅 닫았고, 나는 계단 아래까지 세 번 튀며 굴러떨어졌다.",
    en: "I knocked at the manor and offered a business card — a blank one. The butler listed the guest list, the dress code and a seal, then slammed the door. I bounced down the steps three times.",
  },
  "blackthorne-guest-list": {
    ko: "시계공은 명함에 톱니 인장을 찍어 주었고, 로잘린은 \"동방 귀족 예복\"을 내주었으며, 광장의 신사는 \"영혼을 담는 거울\" 소문을 흘려 주기로 했다. 이제 나는 동방 주식회사 전무이사다. 그런 회사는 없지만.",
    en: "The clockmaker pressed a gear seal onto my card, Rosaline lent me \"noble Eastern robes\", and the gentleman agreed to spread the rumour of a \"soul-catching mirror\". I am now a Managing Director of the Eastern Company. There is no such company.",
  },
  "manor-clockwork-bird": {
    ko: "배수관을 타고, 사슬에 매달리고, 금고지기와 한판 붙었다. 수장고의 태엽새는 내 품에서 작게 째깍거렸다. 옥상 창으로 빠져나올 때 밤바람이 무척 시원했다.",
    en: "Up the drainpipe, along the chains, one round with the Keeper. The bird ticked softly against my chest. The night air through the roof window had never felt so good.",
  },
  "clockmaker-bird-return": {
    ko: "태엽새를 빈 받침에 올려 두자 시계공이 한참 아무 말도 못 했다. 그리고 새가 노래했다. 오늘은 훔친 것이 아니라 돌려준 날이다.",
    en: "I set the bird back on its perch, and the clockmaker could not speak for a while. Then it sang. Today I did not steal something — I gave it back.",
  },
  "calling-card-campaign": {
    ko: "아홉 장의 예고장, 아홉 번의 약속. 블랙손이 빼앗은 것들은 모두 주인에게 돌아갔다. 이 책의 마지막 줄은 아직 비워 둔다. 괴도의 밤은 계속되니까.",
    en: "Nine calling cards, nine promises kept. Everything Blackthorne took has found its way home. I'm leaving the last line of this book blank. A phantom thief's night goes on.",
  },
});

export function storybookDiaryText(id: VillageQuestStepId, locale: Locale): string {
  return pickLocalized(locale, DIARY[id]);
}

function chapterLabel(number: number, locale: Locale): string {
  return localeText(locale, `제 ${number}장`, `CHAPTER ${number}`);
}

function villageStoriesChapter(line: VillageQuestLine, locale: Locale, number: number, context: VillageQuestOutfitContext): StorybookChapter | null {
  const done = line.side.filter((side) => side.completed);
  const onStage = line.side.find((side) => !side.completed
    && (context.storyOnStage === undefined || context.storyOnStage === side.id)) ?? null;
  if (done.length === 0 && onStage === null) return null;
  return Object.freeze({
    id: "village-stories" as const,
    number,
    // 마을 이야기를 전부 끝내야 완결이다. 하나라도 남았으면 광장에 서 있지 않아도 쓰는 중이다.
    status: done.length === line.side.length ? "completed" as const : "writing" as const,
    title: localeText(locale, "마을의 작은 이야기", "Little village tales"),
    label: localeText(locale, "번외", "EXTRA"),
    entries: Object.freeze(done.map((side) => Object.freeze({
      stepId: `story:${side.id}`, title: villageStoryName(side.id, locale), text: villageStorySummary(side.id, locale),
    }))),
    current: onStage === null ? null : Object.freeze({
      stepId: `story:${onStage.id}`, quest: villageStoryName(onStage.id, locale),
      detail: villageStorySummary(onStage.id, locale), conditions: Object.freeze([]),
    }),
    navigable: false,
  });
}

export function villageStorybook(
  line: VillageQuestLine, locale: Locale, context: VillageQuestOutfitContext = {},
): VillageStorybook {
  const present = VILLAGE_QUEST_CHAPTER_IDS.filter((id) => line.steps.some((step) => VILLAGE_QUEST_STEP_CHAPTER[step.id] === id));
  const chapters: StorybookChapter[] = present.map((id, index): StorybookChapter => {
    const steps = line.steps.filter((step) => VILLAGE_QUEST_STEP_CHAPTER[step.id] === id);
    const done = steps.filter((step) => step.status === "completed");
    const active = steps.find((step) => step.status === "active") ?? null;
    const status: StorybookChapterStatus = active !== null ? "writing"
      : done.length === steps.length ? "completed" : "locked";
    const number = index + 1;
    const copy = active === null ? null : villageQuestStepCopy(active.id, locale);
    return Object.freeze({
      id,
      number,
      status,
      title: status === "locked" ? "???" : villageQuestChapterTitle(id, locale),
      label: chapterLabel(number, locale),
      entries: Object.freeze(done.map((step) => Object.freeze({
        stepId: step.id,
        title: villageQuestStepCopy(step.id, locale).title,
        text: storybookDiaryText(step.id, locale),
        ...(step.id === "blackthorne-guest-list" ? { stickers: GUEST_LIST_PROP_IDS } : {}),
      }))),
      current: active === null || copy === null ? null : Object.freeze({
        stepId: active.id,
        quest: copy.title,
        detail: copy.detail,
        conditions: villageQuestConditions(active, locale, context),
      }),
      navigable: active !== null,
    });
  });
  const tales = villageStoriesChapter(line, locale, chapters.length + 1, context);
  if (tales !== null) chapters.push(tales);
  const writing = chapters.find((chapter) => chapter.status === "writing");
  const lastDone = [...chapters].reverse().find((chapter) => chapter.status === "completed" && chapter.id !== "village-stories");
  const total = line.steps.length + line.side.length;
  const collected = line.completed.length + line.side.filter((side) => side.completed).length;
  // 본선을 쓰는 중이면 그 챕터를, 본선이 끝났으면 번외가 아니라 마지막 본선 챕터를 먼저 펼친다.
  const mainWriting = chapters.find((chapter) => chapter.status === "writing" && chapter.id !== "village-stories");
  return Object.freeze({
    title: localeText(locale, "나만의 스토리북", "My Storybook"),
    chapters: Object.freeze(chapters),
    openChapterId: mainWriting?.id ?? lastDone?.id ?? writing?.id ?? chapters[0]?.id ?? "clockwork-bird",
    collection: Object.freeze({ collected, total, complete: collected === total }),
  });
}
