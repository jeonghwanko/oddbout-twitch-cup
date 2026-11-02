import { cardById } from "../sim/CallingCardRules";
import { PERSONAL_ARTIFACT_LOOT_ID } from "../sim/PersonalArtifactRules";
import type { Settlement } from "../sim/SettlementRules";
import type { CallingCardPerformance } from "./CallingCardPerformance";
import type { MasteryDiscovery } from "../sim/MetaProgressRules";
import type { Locale } from "./Locale";
import { briefingCardPresentation } from "./BriefingPresentation";
import { exitName, masteryDiscoveryPresentation } from "./GameContentPresentation";
import type { CallingCardCollectionResultPresentation } from "./CallingCardCollectionPresentation";

export interface VillageHomecomingPresentation {
  readonly eyebrow: string;
  readonly title: string;
  readonly result: string;
  readonly nextObjective: string;
  readonly badge: string;
  readonly success: boolean;
}

/** 정산의 확정 결과를 마을의 귀환 보고로 투영한다. 보상·진행 상태는 다시 계산하지 않는다. */
export function villageHomecoming(
  settlement: Settlement,
  completedRuns: number,
  cardId: string | null,
  callingCardPerformance: CallingCardPerformance,
  discovery: MasteryDiscovery | null = null,
  locale: Locale = "ko",
  honorOnly = false,
  collectionResult: CallingCardCollectionResultPresentation | null = null,
): VillageHomecomingPresentation {
  const card = cardId === null ? null : cardById(cardId);
  const personalArtifactRecovered = settlement.outcome === "escaped"
    && settlement.lines.some((line) => line.lootId === PERSONAL_ARTIFACT_LOOT_ID);
  const routeChanged = personalArtifactRecovered && settlement.escape?.changedEntryRoute === true;
  const success = settlement.outcome === "escaped";
  const contractKept = card !== null && callingCardPerformance.moveCount > 0;

  if (honorOnly) {
    const cardName = card === null ? null : briefingCardPresentation(card, locale).name;
    if (locale === "en") {
      return Object.freeze({
        eyebrow: "HONOR HEIST · FRIEND RESULT",
        title: success ? "The Invitation Was Answered" : "The Invitation Still Stands",
        result: `${cardName === null ? "Custom invitation" : `“${cardName}”`} · ${settlement.payoutGold} PT · No Gold/Fame`,
        nextObjective: success
          ? "Your approach is recorded as a friendly result · official progression is unchanged"
          : "Reopen the invitation from Channel › Infiltrate or return to an official notice · official progression is unchanged",
        badge: "HONOR HEIST",
        success,
      });
    }
    return Object.freeze({
      eyebrow: "친선 초대 · 공략 보고",
      title: success ? "초대에 답장을 남겼다" : "초대는 아직 유효하다",
      result: `${card === null ? "커스텀 초대" : `「${card.name}」`} · ${settlement.payoutGold} PT · 골드/명성 없음`,
      nextObjective: success
        ? "이번 수법은 친선 결과로만 기록됐다 · 공식 진행도는 그대로다"
        : "채널의 침투에서 초대를 다시 열거나 공식 예고장으로 돌아가시오 · 공식 진행도는 그대로다",
      badge: "HONOR HEIST",
      success,
    });
  }

  if (locale === "en") {
    const cardName = card === null ? null : briefingCardPresentation(card, locale).name;
    const rememberedExit = settlement.escape === null
      ? "unknown"
      : exitName(settlement.escape.exitId, settlement.escape.exitName, locale);
    const discoveryCopy = discovery === null ? null : masteryDiscoveryPresentation(discovery, locale);
    const successfulNext = contractKept
      ? card?.spice === 3
        ? `The mansion remembers “${rememberedExit}” · plan another extreme notice and a different exit`
        : `The mansion remembers “${rememberedExit}” · plan an extreme notice and a different exit`
      : `The mansion remembers “${rememberedExit}” · exploit the contract directly and choose another exit next time`;
    const title = routeChanged
      ? "Home Safe by a Different Route"
      : personalArtifactRecovered
        ? "The Keepsake Came Home"
        : settlement.outcome === "escaped"
          ? "Not a Trace Tonight"
          : settlement.outcome === "busted"
            ? "Caught, but the Name Survives"
            : "Time Ran Out, Not Your Next Move";
    const badge = routeChanged
      ? "ROUTE SWITCH"
      : personalArtifactRecovered
        ? "RELIC HOME"
        : settlement.outcome === "escaped"
          ? "CLEAN ESCAPE"
          : settlement.outcome === "busted" ? "BUSTED" : "TIME UP";
    const nextObjective = discoveryCopy !== null
      ? `New mastery “${discoveryCopy.name}” unlocked · next heist: ${discoveryCopy.effect}`
      : collectionResult !== null
        ? `${collectionResult.homecomingObjective} · ${successfulNext}`
      : success
        ? successfulNext
        : contractKept
          ? "You proved the contract move · redesign the route and choose a new notice"
          : "Your rewards are saved · redesign the route and choose a new notice";
    return Object.freeze({
      eyebrow: `RUN ${Math.max(1, completedRuns)} · HOMECOMING`,
      title,
      result: `${cardName === null ? "No calling card" : `“${cardName}”`} · +${settlement.payoutGold} G · +${settlement.fame} Fame${contractKept ? " · Contract kept" : ""}${collectionResult === null ? "" : ` · ${collectionResult.resultSuffix}`}`,
      nextObjective,
      badge,
      success,
    });
  }

  const title = routeChanged
    ? "훔친 길과 다른 길로, 무사 귀환"
    : personalArtifactRecovered
      ? "유물을 품고 돌아왔다"
      : settlement.outcome === "escaped"
        ? "오늘 밤도 흔적 없이"
        : settlement.outcome === "busted"
          ? "잡혔지만 이름은 남았다"
          : "시간은 끝났지만 다음 수는 남았다";
  const badge = routeChanged
    ? "ROUTE SWITCH"
    : personalArtifactRecovered
      ? "RELIC HOME"
      : settlement.outcome === "escaped"
        ? "CLEAN ESCAPE"
        : settlement.outcome === "busted"
          ? "BUSTED"
          : "TIME UP";
  const successfulNext = contractKept
    ? card?.spice === 3
      ? `저택이 지난 퇴로 「${settlement.escape?.exitName ?? "미확인"}」을 기억한다 · 새로운 극한 예고와 다른 탈출을 계획하시오`
      : `저택이 지난 퇴로 「${settlement.escape?.exitName ?? "미확인"}」을 기억한다 · 극한 예고와 다른 탈출을 계획하시오`
    : `저택이 지난 퇴로 「${settlement.escape?.exitName ?? "미확인"}」을 기억한다 · 다음에는 계약 조건을 직접 활용하고 다른 퇴로로 탈출하시오`;

  return Object.freeze({
    eyebrow: `RUN ${Math.max(1, completedRuns)} · 귀환 보고`,
    title,
    result: `${card === null ? "예고장 없는 임무" : `「${card.name}」`} · +${settlement.payoutGold} G · +${settlement.fame} 명성${contractKept ? " · 예고 이행" : ""}${collectionResult === null ? "" : ` · ${collectionResult.resultSuffix}`}`,
    nextObjective: discovery !== null
      ? `새 수법 「${discovery.name}」 해금 · 다음 침투부터 ${discovery.nextRunEffect}`
      : collectionResult !== null
        ? `${collectionResult.homecomingObjective} · ${successfulNext}`
      : success
      ? successfulNext
      : contractKept
        ? "예고 이행은 증명했다 · 동선을 다시 설계하고 새 예고장을 고르시오"
        : "보상은 저장됐다 · 동선을 다시 설계하고 새 예고장을 고르시오",
    badge,
    success,
  });
}

/** 귀환 카드를 닫을 때까지 두는 유예. 정산 화면에서 넘어온 입력이 카드를 즉시 지우지 않게 한다. */
export const HOMECOMING_DISMISS_GRACE_MS = 700;

/**
 * 귀환 카드를 닫을 때인가.
 *
 * 판단 기준은 **실제 이동이 아니라 이동 의도**다. 벽을 향해 방향을 누르고 있으면 좌표가
 * 그대로라, 이동 판정으로 닫으면 카드가 영영 남는다 — 연습 회랑이 마을 스폰 바로 위로
 * 옮겨진 뒤 위로 걸으면 실제로 그렇게 됐고, 브라우저 스모크가 거기서 멈췄다.
 */
export function homecomingDismissed(steering: boolean, nowMs: number, dismissAtMs: number): boolean {
  return steering && nowMs >= dismissAtMs;
}
