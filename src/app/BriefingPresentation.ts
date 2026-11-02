import { CALLING_CARDS, type CallingCard } from "../sim/CallingCardRules";
import {
  FULL_PRESSURE_ESCAPES,
  mansionPressure,
  persistentEscapeId,
} from "../sim/MetaProgressRules";
import type { MetaState, UpgradeNode } from "../sim/MetaProgressRules";
import type { TacticId } from "../sim/TacticRules";
import type { TacticResponse } from "../sim/MansionLayout";
import { t } from "./i18n";
import {
  MASTERY_DISCOVERIES,
  callingCardClearProgress,
  isCallingCardCleared,
  masteryDiscoveryOf,
} from "../sim/MetaProgressRules";
import { type Locale, pickLocalized, type Localized } from "./Locale";
import { campaignProgress } from "../sim/CampaignProgressRules";
import { exitName, masteryDiscoveryPresentation, tacticResponsePresentation } from "./GameContentPresentation";
import { actionLabel } from "./ActionLabels";

export interface BriefingCardPresentation {
  readonly name: string;
  readonly riskLabel: string;
  readonly riskHint: string;
  /** 첫 사용자도 수치가 아니라 실제 플레이 판정으로 카드를 비교하는 한 줄. */
  readonly judgementHint: string;
  readonly costLines: readonly string[];
  readonly rewardLines: readonly string[];
  readonly actionLabel: string;
}

export interface HeistContractPresentation {
  readonly name: string;
  readonly introText: string;
  readonly persistentText: string;
}

export interface FirstRunBriefingPresentation {
  readonly header: string;
  readonly path: string | null;
}

export interface BriefingProgressPresentation extends FirstRunBriefingPresentation {
  readonly focus: "cards";
  readonly preferredSpice: CallingCard["spice"] | null;
  readonly pressureStep: number;
  readonly masterySummary?: string;
}

export interface BriefingCardClearPresentation {
  readonly cleared: boolean;
  readonly statusLabel: string;
  readonly sealGlyph: "✓" | "";
}

/** 제안 순서/RNG는 보존하되, 아직 성공하지 않은 계약을 먼저 선택한다. */
/** Preserve the shuffled offer and RNG consumption; the first contract must include a light choice. */
export function introductoryCallingCards(cards: readonly CallingCard[]): CallingCard[] {
  if (cards.length === 0 || cards.some(card => card.spice === 1)) return [...cards];
  const gentle = CALLING_CARDS.find(card => card.spice === 1);
  return gentle === undefined ? [...cards] : [gentle, ...cards.slice(1)];
}

export function recommendedCallingCardIndex(
  cards: readonly CallingCard[],
  meta: Pick<MetaState, "clearedCallingCardIds">,
  preferredSpice: CallingCard["spice"] | null,
): number {
  const candidates = cards.map((card, index) => ({ card, index }));
  const fresh = candidates.filter(({ card }) => !meta.clearedCallingCardIds.includes(card.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  if (preferredSpice !== null) pool.sort((a, b) =>
    Math.abs(a.card.spice - preferredSpice) - Math.abs(b.card.spice - preferredSpice)
      || a.card.spice - b.card.spice);
  return pool[0]?.index ?? 0;
}

/** 예고장 이름·감수·획득 문구. 한국어는 sim 원문, 영어는 meta 표. */
function callingCardCopy(card: CallingCard, locale: Locale): { readonly name: string; readonly cost: string; readonly reward: string } {
  if (locale !== "en") return card;
  return {
    name: t(locale, `meta.card.${card.id}.name`),
    cost: t(locale, `meta.card.${card.id}.cost`),
    reward: t(locale, `meta.card.${card.id}.reward`),
  };
}

/**
 * 판정법 한 줄이 쓸 수 있는 글자 예산.
 * 브리핑 카드는 이 문구에 336px 한 줄만 내주고 바로 아래를 위험 구획이 차지한다.
 * 두 줄이 되면 위험 구획을 덮으므로 실측 최대 글자폭(영문 볼드 12px 6.1px, 한글 9.5px)
 * 기준으로 여유를 남긴 보수적 상한을 둔다. 실제 픽셀 판정은 E2E 브리핑 검사가 소유하고,
 * 이 값은 9종 × 2언어를 단위 테스트에서 미리 거르는 예산이다.
 */
export const JUDGEMENT_HINT_BUDGET: Readonly<Record<Locale, number>> = Object.freeze({
  ko: 32,
  en: 53,
  ja: 53, // 본편 브리핑은 일본어로 옮기지 않아 영어 문구가 보인다(koOrEn).
});

/**
 * 판정 수치가 아니라 플레이어가 위험을 이점으로 뒤집는 행동을 소유한다.
 * 브리핑·현장 조언·CONTRACT MOVE가 같은 순서를 말해야 한다.
 */
const CALLING_CARD_JUDGEMENT_COPY: Readonly<Record<CallingCard["id"], Localized<string>>> = Object.freeze({
  midnight: Object.freeze({
    ko: "판정법 · 불빛 밖 그림자에 들어가면 계약 우위",
    en: "HOW TO WIN · Enter shadow beyond the lights",
  }),
  untouched: Object.freeze({
    ko: "판정법 · 발각 없이 품격 게이지를 채우면 보너스",
    en: "HOW TO WIN · Fill Style without being detected",
  }),
  threeminutes: Object.freeze({
    ko: "판정법 · 첫 회수 뒤 남은 시간을 퇴로에 투자",
    en: "HOW TO WIN · Bank time on the first steal, then exit",
  }),
  lightson: Object.freeze({
    ko: "판정법 · 직접 등불을 끄면 안전지대를 만든다",
    en: "HOW TO WIN · Snuff lights to make your own safe zone",
  }),
  heavier: Object.freeze({
    ko: "판정법 · 적재 70% 전에 퇴로를 고른다",
    en: "HOW TO WIN · Pick an exit before reaching 70% load",
  }),
  wax: Object.freeze({
    ko: "판정법 · 일찍 제동하고 추격자를 왁스로 유도",
    en: "HOW TO WIN · Brake early and lure pursuers onto wax",
  }),
  stairwatch: Object.freeze({
    ko: "판정법 · 사다리 대신 가속 환기구로 우회",
    en: "HOW TO WIN · Bypass ladders through boosted vents",
  }),
  fullhouse: Object.freeze({
    ko: "판정법 · 관객 뒤에서 시야를 끊고 접촉은 피한다",
    en: "HOW TO WIN · Break sight behind guests; avoid contact",
  }),
  roofgreeting: Object.freeze({
    ko: "판정법 · 옥상에서 정문 층까지 역주행",
    en: "HOW TO WIN · Reverse the mansion, roof to front door",
  }),
});

/** 예고장 원문의 구분점을 카드 안에서 빠르게 비교할 수 있는 짧은 행으로 바꾼다. */
export function briefingCardPresentation(card: CallingCard, locale: Locale = "ko"): BriefingCardPresentation {
  const copy = callingCardCopy(card, locale);
  return Object.freeze({
    name: copy.name,
    riskLabel: t(locale, `meta.risk.${card.spice}.label`),
    riskHint: t(locale, `meta.risk.${card.spice}.hint`),
    judgementHint: pickLocalized(locale, CALLING_CARD_JUDGEMENT_COPY[card.id]),
    costLines: terms(copy.cost),
    rewardLines: terms(copy.reward),
    actionLabel: t(locale, "meta.briefing.card.infiltrateWith", { name: copy.name }),
  });
}

export function briefingCardClearPresentation(
  meta: MetaState,
  card: CallingCard,
  locale: Locale = "ko",
): BriefingCardClearPresentation {
  const cleared = isCallingCardCleared(meta, card.id);
  return Object.freeze({
    cleared,
    statusLabel: cleared ? t(locale, "meta.card.cleared") : t(locale, "meta.card.firstClearOpen"),
    sealGlyph: cleared ? "✓" : "",
  });
}

/** 브리핑에서 고른 예고장을 저택 진입 연출과 상시 HUD에 같은 문구로 이어 붙인다. */
export function heistContractPresentation(card: CallingCard, locale: Locale = "ko"): HeistContractPresentation {
  const presentation = briefingCardPresentation(card, locale);
  const risk = `${"◆".repeat(card.spice)}${"◇".repeat(3 - card.spice)}`;
  const cost = presentation.costLines.join(" · ");
  const reward = presentation.rewardLines.join(" · ");
  return Object.freeze({
    name: presentation.name,
    introText: [
      t(locale, "meta.briefing.contract.accepted", { risk, label: presentation.riskLabel }),
      t(locale, "meta.briefing.contract.quotedName", { name: presentation.name }),
      t(locale, "meta.briefing.contract.risk", { cost }),
      t(locale, "meta.briefing.contract.gain", { reward }),
    ].join("\n"),
    persistentText: [
      t(locale, "meta.briefing.contract.persistent", { risk, name: presentation.name }),
      t(locale, "meta.briefing.contract.risk", { cost }),
      t(locale, "meta.briefing.contract.gain", { reward }),
    ].join("\n"),
  });
}

/** 짧은 오프닝의 결말을 첫 실전 선택과 한 문장으로 잇는다. */
export function firstRunBriefingPresentation(openingJustCompleted: boolean, locale: Locale = "ko"): FirstRunBriefingPresentation {
  if (locale === "en") {
    return openingJustCompleted
      ? Object.freeze({
          header: "✓ FIRST CALLING-CARD JOB",
          path: "RECOMMENDED CARD SELECTED",
        })
      : Object.freeze({ header: "CHOOSE YOUR CALLING CARD", path: null });
  }
  return openingJustCompleted
    ? Object.freeze({
        header: "✓ 첫 예고장 의뢰",
        path: "첫 도전 추천 카드 선택됨",
      })
    : Object.freeze({ header: "예고장을 고르시오", path: null });
}

/** 저장된 진행과 실제 저택 생성 압박을 다음 예고장 선택 문맥으로 바꾼다. */
export function briefingProgressPresentation(
  meta: MetaState,
  openingJustCompleted: boolean,
  locale: Locale = "ko",
): BriefingProgressPresentation {
  const pressureStep = Math.round(mansionPressure(meta) * FULL_PRESSURE_ESCAPES);
  const collection = callingCardClearProgress(meta);
  const collectionLabel = locale === "en"
    ? `${collection.complete ? "ALL NOTICES CLEARED" : "NOTICE CLEAR"} ${collection.cleared}/${collection.total}`
    : `${collection.complete ? "전 예고장 제패" : "예고장 제패"} ${collection.cleared}/${collection.total}`;
  if (openingJustCompleted) {
    const first = firstRunBriefingPresentation(true, locale);
    return Object.freeze({
      ...first,
      // 첫 실전에는 아직 의미가 없는 0/9 수집 진행을 섞지 않는다.
      // 사용자가 지금 할 일인 추천 카드 확인과 잠입만 남긴다.
      path: first.path,
      focus: "cards",
      preferredSpice: 1,
      pressureStep,
    });
  }
  if (meta.stats.runs > 0) {
    const rememberedExitId = persistentEscapeId(meta.stats.lastEscapeId);
    const campaign = campaignProgress(meta);
    const caseGoal = campaign.complete
      ? t(locale, "meta.briefing.progress.caseClosed")
      : campaign.untilNext === 1
        ? t(locale, "meta.briefing.progress.nextChapterOne", { count: campaign.untilNext })
        : t(locale, "meta.briefing.progress.nextChapter", { count: campaign.untilNext });
    const response = rememberedExitId === null ? "" : locale === "en"
      ? ` · ${exitName(rememberedExitId, rememberedExitId, locale)} blocked`
      : ` · ${escapeName(rememberedExitId)} 봉쇄`;
    const defense = pressureStep === 0
      ? t(locale, "meta.briefing.progress.defenseNone")
      : pressureStep >= FULL_PRESSURE_ESCAPES
        ? t(locale, "meta.briefing.progress.defenseMax")
        : pressureStep >= FULL_PRESSURE_ESCAPES / 2
          ? t(locale, "meta.briefing.progress.defenseGuards")
          : t(locale, "meta.briefing.progress.defensePatrols");
    const pressureLabel = pressureStep >= FULL_PRESSURE_ESCAPES ? "MAX" : `${pressureStep}/${FULL_PRESSURE_ESCAPES}`;
    const path = `${collectionLabel} · ${caseGoal}\n${t(locale, "meta.briefing.progress.manorResponse")} ${pressureLabel} · ${defense}${response}`;
    return Object.freeze({
      header: t(locale, "meta.briefing.progress.nextRun", { run: meta.stats.runs + 1 }),
      path,
      focus: "cards",
      preferredSpice: 2,
      pressureStep,
      ...(meta.discoveries.length === 0 ? {} : { masterySummary:
        `${t(locale, "meta.briefing.progress.masteries")} ${meta.discoveries.length}/${MASTERY_DISCOVERIES.length} · ${meta.discoveries
          .map((id) => masteryDiscoveryPresentation(masteryDiscoveryOf(id), locale).name).join(" · ")}`,
      }),
    });
  }
  return Object.freeze({
    header: locale === "en"
      ? `${meta.onboarding.trainingCompleted ? "✓ BASIC TRAINING COMPLETE   " : ""}CHOOSE YOUR CALLING CARD`
      : `${meta.onboarding.trainingCompleted ? "✓ 기초 훈련 완료   " : ""}예고장을 고르시오`,
    path: t(locale, "meta.briefing.progress.collectionHint", { collection: collectionLabel }),
    focus: "cards",
    preferredSpice: null,
    pressureStep,
  });
}

function escapeName(id: string): string {
  return ({
    "front-door": "정문",
    "roof-window": "옥상 창",
    chimney: "굴뚝",
  } as Readonly<Record<string, string>>)[id] ?? id;
}

function terms(value: string): readonly string[] {
  return Object.freeze(value.split("·").map((term) => term.trim()).filter((term) => term.length > 0));
}

export interface UpgradeNodePresentation {
  readonly name: string;
  readonly description: string;
}

/** 강화 상점 한 칸. 한국어는 sim 원문 그대로, 영어는 meta 표에서 id 로 찾는다. */
export function upgradeNodePresentation(node: UpgradeNode, locale: Locale = "ko"): UpgradeNodePresentation {
  if (locale !== "en") return Object.freeze({ name: node.name, description: node.description });
  return Object.freeze({
    name: t(locale, `meta.upgrade.${node.id}.name`),
    description: t(locale, `meta.upgrade.${node.id}.description`),
  });
}

/** 가격표. 골드는 두 언어 모두 `G`, 명성은 낱말로 적는다. */
export function upgradePriceLabel(node: UpgradeNode, cost: number | null, locale: Locale = "ko"): string {
  if (cost === null) return "MAX";
  return node.currency === "gold" ? `${cost} G` : t(locale, "meta.shop.priceFame", { cost });
}

export type UpgradePurchaseResult =
  | { readonly kind: "maxed" }
  | { readonly kind: "unaffordable"; readonly cost: number }
  | { readonly kind: "purchased"; readonly stored: boolean; readonly storageMessage: string };

/** 구매 시도 결과를 한 줄 피드백으로. */
export function upgradePurchaseFeedback(node: UpgradeNode, result: UpgradePurchaseResult, locale: Locale = "ko"): string {
  const name = upgradeNodePresentation(node, locale).name;
  switch (result.kind) {
    case "maxed":
      return t(locale, "meta.shop.maxed", { name });
    case "unaffordable":
      return node.currency === "gold"
        ? t(locale, "meta.shop.needGold", { name, cost: result.cost })
        : t(locale, "meta.shop.needFame", { name, cost: result.cost });
    case "purchased":
      return result.stored
        ? t(locale, "meta.shop.purchased", { name })
        : t(locale, "meta.shop.purchasedUnsaved", { name, reason: result.storageMessage });
  }
}

/** 지난 런의 대표 수법에 저택이 어떻게 대응하는지 한 줄로. */
export function tacticMemoryLine(tactic: TacticId, memory: TacticResponse, locale: Locale = "ko"): string {
  const response = tacticResponsePresentation(memory, locale);
  return t(locale, "meta.briefing.tacticMemory", {
    tactic: t(locale, `meta.tactic.${tactic}`),
    title: response.title,
    counter: response.counter,
    weakness: response.weakness,
  });
}

export type BriefingTabId = "notices" | "tools" | "shop";

/**
 * 탭 이름의 단일 소유자. 탭 줄과 머리띠 제목이 이 함수 하나에서 나와, 같은 화면을 두 이름으로 부르지 않는다.
 * 탭은 좁아서 짧은 이름을, 머리띠는 화면의 정체를 말하는 긴 이름을 쓴다.
 */
export function briefingTabLabel(tab: BriefingTabId, locale: Locale = "ko"): string {
  switch (tab) {
    case "notices": return t(locale, "meta.briefing.tab.notices");
    case "tools": return t(locale, "meta.briefing.tab.weapons");
    case "shop": return t(locale, "meta.briefing.tab.upgrades");
  }
}

/** 머리띠 제목. 예고장 탭은 진행 문맥이 정하고(`BriefingProgressPresentation.header`), 나머지는 탭의 정체를 말한다. */
export function briefingHeaderTitle(tab: BriefingTabId, progressHeader: string, locale: Locale = "ko"): string {
  switch (tab) {
    case "notices": return progressHeader;
    case "tools": {
      const label = actionLabel("throw", locale);
      return locale === "en" ? label.toUpperCase() : label;
    }
    case "shop": return t(locale, "meta.shop.title");
  }
}
