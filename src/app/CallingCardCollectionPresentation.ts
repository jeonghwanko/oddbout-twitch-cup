import { briefingCardPresentation } from "./BriefingPresentation";
import type { Locale } from "./Locale";
import { cardById } from "../sim/CallingCardRules";
import type { MetaState } from "../sim/MetaProgressRules";
import { callingCardClearProgress } from "../sim/MetaProgressRules";

export interface CallingCardCollectionResultPresentation {
  readonly stamp: string;
  readonly insight: string;
  readonly homecomingObjective: string;
  readonly resultSuffix: string;
  readonly complete: boolean;
  readonly cleared: number;
  readonly total: number;
}

/** 이번 친선 초대가 아닌 런에서 처음 봉인된 예고장만 제패 연출로 바꾼다. */
export function callingCardCollectionResultPresentation(
  before: MetaState,
  after: MetaState,
  cardId: string | null,
  locale: Locale = "ko",
): CallingCardCollectionResultPresentation | null {
  const card = cardId === null ? null : cardById(cardId);
  if (
    card === null
    || before.clearedCallingCardIds.includes(card.id)
    || !after.clearedCallingCardIds.includes(card.id)
  ) return null;

  const progress = callingCardClearProgress(after);
  const name = briefingCardPresentation(card, locale).name;
  if (locale === "en") {
    return Object.freeze({
      stamp: progress.complete
        ? `ALL NOTICES CLEARED ${progress.cleared}/${progress.total}`
        : `FIRST CLEAR ${progress.cleared}/${progress.total}`,
      insight: progress.complete
        ? `ALL NOTICES CLEARED · “${name}”\nYou turned all nine risks into winning moves`
        : `NEW NOTICE CLEARED · “${name}”\n${progress.cleared}/${progress.total} sealed · ${progress.remaining} left to escape with the contract kept`,
      homecomingObjective: progress.complete
        ? `All notices cleared ${progress.cleared}/${progress.total} · chase a sharper record on your favorite contract`
        : `New notice “${name}” cleared ${progress.cleared}/${progress.total} · turn the remaining ${progress.remaining} judgements`,
      resultSuffix: progress.complete ? "All notices cleared" : `First clear ${progress.cleared}/${progress.total}`,
      complete: progress.complete,
      cleared: progress.cleared,
      total: progress.total,
    });
  }
  return Object.freeze({
    stamp: progress.complete
      ? `ALL NOTICES CLEARED ${progress.cleared}/${progress.total}`
      : `FIRST CLEAR ${progress.cleared}/${progress.total}`,
    insight: progress.complete
      ? `전 예고장 제패 · 「${name}」\n아홉 위험을 모두 괴도다운 한 수로 뒤집었습니다`
      : `새 예고장 제패 · 「${name}」\n${progress.cleared}/${progress.total} 봉인 · 남은 ${progress.remaining}종도 탈출 + 예고 이행으로 완성`,
    homecomingObjective: progress.complete
      ? `전 예고장 제패 ${progress.cleared}/${progress.total} · 가장 짜릿한 계약에 새 기록을 남기시오`
      : `새 예고장 「${name}」 제패 ${progress.cleared}/${progress.total} · 남은 ${progress.remaining}종의 판정법을 뒤집으시오`,
    resultSuffix: progress.complete ? "전 예고장 제패" : `첫 제패 ${progress.cleared}/${progress.total}`,
    complete: progress.complete,
    cleared: progress.cleared,
    total: progress.total,
  });
}
