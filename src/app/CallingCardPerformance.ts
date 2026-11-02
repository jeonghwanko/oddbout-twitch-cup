import { cardById, type CallingCard } from "../sim/CallingCardRules";
import type { CallingCardFieldContext } from "./CallingCardFieldFeedback";
import { callingCardPayoff, type CallingCardPayoff } from "./CallingCardPayoff";
import type { Locale } from "./Locale";
import { briefingCardPresentation } from "./BriefingPresentation";
import { t } from "./i18n";

export interface CallingCardPerformance {
  /** HUD가 같은 달성을 두 번 재생하지 않게 하는 단조 증가 번호. 보상 수치에는 쓰지 않는다. */
  readonly moveCount: number;
  readonly latestPayoff: CallingCardPayoff | null;
}

export const EMPTY_CALLING_CARD_PERFORMANCE: CallingCardPerformance = Object.freeze({
  moveCount: 0,
  latestPayoff: null,
});

/** 고정 sim 스텝 전후 상태에서 계약 활용을 기록한다. 새 달성이 없으면 같은 객체를 돌려준다. */
export function observeCallingCardPerformance(
  card: CallingCard | null,
  previous: CallingCardFieldContext,
  current: CallingCardFieldContext,
  performance: CallingCardPerformance,
  locale: Locale = "ko",
): CallingCardPerformance {
  if (card === null) return performance;
  const payoff = callingCardPayoff(card, previous, current, locale);
  if (payoff === null) return performance;
  return Object.freeze({ moveCount: performance.moveCount + 1, latestPayoff: payoff });
}

export interface CallingCardResultPresentation {
  readonly sealTitle: "CONTRACT KEPT" | "CONTRACT OPEN";
  readonly sealDetail: string;
  readonly fulfilled: boolean;
}

/** 한밤의 계약 활용 기록을 보상 재계산 없이 정산용 인장으로 바꾼다. */
export function callingCardResultPresentation(
  cardId: string | null,
  performance: CallingCardPerformance,
  locale: Locale = "ko",
): CallingCardResultPresentation | null {
  const card = cardId === null ? null : cardById(cardId);
  if (card === null) return null;
  const latestPayoff = performance.latestPayoff;
  const fulfilled = performance.moveCount > 0 && latestPayoff !== null;
  const cardName = briefingCardPresentation(card, locale).name;
  return Object.freeze({
    sealTitle: fulfilled ? "CONTRACT KEPT" : "CONTRACT OPEN",
    sealDetail: fulfilled && latestPayoff !== null
      ? locale === "en" ? `Contract move · “${cardName}”` : `${latestPayoff.title} · 「${cardName}」`
      : t(locale, "meta.callingCard.performance.nextNight", { name: cardName }),
    fulfilled,
  });
}
