import type { CallingCard } from "../sim/CallingCardRules";
import type { CallingCardFieldContext } from "./CallingCardFieldFeedback";
import type { Locale } from "./Locale";
import { t } from "./i18n";

export interface CallingCardPayoff {
  readonly title: string;
  readonly detail: string;
}

/**
 * 예고장의 대가를 감수한 플레이가 실제 이점으로 바뀐 순간만 골라낸다.
 *
 * HUD가 이미 표시하는 판정 스냅샷 둘만 비교하므로 시뮬레이션·난수·리플레이에는 영향을 주지
 * 않는다. 첫 스냅샷은 기준점일 뿐 달성으로 보지 않는 책임은 호출자가 갖는다.
 */
export function callingCardPayoff(
  card: CallingCard,
  previous: CallingCardFieldContext,
  current: CallingCardFieldContext,
  locale: Locale = "ko",
): CallingCardPayoff | null {
  switch (card.id) {
    case "midnight":
      return !previous.inDark && current.inDark
        ? payoff(
            t(locale, "meta.callingCard.payoff.midnight.title"),
            t(locale, "meta.callingCard.payoff.midnight.detail"),
          )
        : null;
    case "untouched":
      return previous.skill < current.cleanRunThreshold && current.skill >= current.cleanRunThreshold
        ? payoff(
            t(locale, "meta.callingCard.payoff.untouched.title"),
            t(locale, "meta.callingCard.payoff.untouched.detail", { bonus: current.cleanRunBonus }),
          )
        : null;
    case "threeminutes":
      return previous.stolenCount === 0 && current.stolenCount > 0
        ? payoff(
            t(locale, "meta.callingCard.payoff.threeminutes.title"),
            t(locale, "meta.callingCard.payoff.threeminutes.detail", { percent: percent(current.remainingRatio) }),
          )
        : null;
    case "lightson":
      return current.snuffedLampCount > previous.snuffedLampCount
        ? payoff(
            t(locale, "meta.callingCard.payoff.lightson.title"),
            current.snuffedLampCount === 1
              ? t(locale, "meta.callingCard.payoff.lightson.detailOne", { count: current.snuffedLampCount })
              : t(locale, "meta.callingCard.payoff.lightson.detail", { count: current.snuffedLampCount }),
          )
        : null;
    case "heavier":
      return previous.loadRatio < 0.5 && current.loadRatio >= 0.5
        ? payoff(
            t(locale, "meta.callingCard.payoff.heavier.title"),
            t(locale, "meta.callingCard.payoff.heavier.detail", { weight: Math.round(current.totalWeight) }),
          )
        : null;
    case "wax":
      return current.trippedPursuerCount > previous.trippedPursuerCount
        ? payoff(
            t(locale, "meta.callingCard.payoff.wax.title"),
            current.trippedPursuerCount === 1
              ? t(locale, "meta.callingCard.payoff.wax.detailOne", { count: current.trippedPursuerCount })
              : t(locale, "meta.callingCard.payoff.wax.detail", { count: current.trippedPursuerCount }),
          )
        : null;
    case "stairwatch":
      return !previous.inVent && current.inVent
        ? payoff(
            t(locale, "meta.callingCard.payoff.stairwatch.title"),
            t(locale, "meta.callingCard.payoff.stairwatch.detail"),
          )
        : null;
    case "fullhouse":
      return previous.inSignatureRoom !== true && current.inSignatureRoom === true && (current.nearbyCrowdCount ?? 0) > 0
        ? payoff(
            t(locale, "meta.callingCard.payoff.fullhouse.title"),
            t(locale, "meta.callingCard.payoff.fullhouse.detail", { count: current.nearbyCrowdCount ?? 0 }),
          )
        : null;
    case "roofgreeting":
      return previous.onGroundFloor !== true && current.onGroundFloor === true
        ? payoff(
            t(locale, "meta.callingCard.payoff.roofgreeting.title"),
            t(locale, "meta.callingCard.payoff.roofgreeting.detail"),
          )
        : null;
    default: {
      const exhaustive: never = card;
      return exhaustive;
    }
  }
}

function percent(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function payoff(title: string, detail: string): CallingCardPayoff {
  return Object.freeze({ title, detail });
}
