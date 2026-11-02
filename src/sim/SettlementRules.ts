import type { MansionLayout } from "./MansionLayout";
import { entryEscapeRoute } from "./RunRules";
import type { RunOutcome, RunState } from "./RunRules";
import { goldOf, lootDef } from "./LootRules";
import type { LootId } from "./LootRules";
import type { CallingCard } from "./CallingCardRules";
import type { Tuning } from "./tuning";
import { PERSONAL_ARTIFACT_LOOT_ID } from "./PersonalArtifactRules";

/**
 * 정산.
 *
 * 씬은 계산을 하지 않는다. 여기서 나온 breakdown 을 한 줄씩 도장 찍듯 보여줄 뿐이다.
 * 실패했을 때 "받을 뻔했던 금액"을 함께 돌려주는 것이 핵심이다 —
 * 아픔이 정보가 되어야 실패가 학습을 만든다.
 */

export interface SettlementLine {
  readonly label: string;
  /** 절대 금액이거나 배수. kind 가 구분한다. */
  readonly kind: "item" | "multiplier" | "bonus" | "penalty" | "total";
  readonly gold: number;
  readonly detail?: string;
  /** 정산 화면이 규칙을 역해석하지 않고 상세 그림을 고르는 콘텐츠 키. */
  readonly lootId?: LootId;
}

export interface Settlement {
  readonly outcome: RunOutcome;
  readonly escape: SettlementEscape | null;
  readonly lines: readonly SettlementLine[];
  readonly grossGold: number;
  readonly payoutGold: number;
  /** 성공했다면 받았을 금액. 실패 화면에서 회색으로 보여준다. */
  readonly forgoneGold: number;
  readonly fame: number;
}

export interface SettlementEscape {
  readonly entryId: string | null;
  readonly entryName: string | null;
  readonly exitId: string;
  readonly exitName: string;
  readonly changedEntryRoute: boolean;
}

export interface PersonalArtifactSettlementPresentation {
  readonly name: string;
  readonly description: string;
}

export function settle(
  run: RunState,
  layout: MansionLayout,
  card: CallingCard | null,
  tuning: Tuning,
  personalArtifact: PersonalArtifactSettlementPresentation | null = null,
  manorAlreadyCompleted = false,
): Settlement {
  const lines: SettlementLine[] = [];
  const outcome = run.outcome ?? "timeout";

  let gross = 0;
  for (const item of run.stolen) {
    const def = lootDef(item.lootId);
    const gold = goldOf(def, item.skillAtSteal, tuning);
    gross += gold;
    lines.push({
      label: def.id === PERSONAL_ARTIFACT_LOOT_ID ? personalArtifact?.name ?? def.name : def.name,
      kind: "item",
      gold,
      detail: def.id === PERSONAL_ARTIFACT_LOOT_ID && personalArtifact?.description !== undefined && personalArtifact.description !== ""
        ? `${personalArtifact.description} · ${def.weight}kg`
        : `${def.weight}kg · 기술 ${Math.round(item.skillAtSteal)}`,
      lootId: def.id,
    });
  }

  let multiplier = 1;

  if (card !== null && card.goldMul !== 1) {
    multiplier *= card.goldMul;
    lines.push({ label: `예고장 「${card.name}」`, kind: "multiplier", gold: 0, detail: `×${card.goldMul}` });
  }

  const exit = layout.escapes.find((e) => e.id === run.escapeId);
  const entry = entryEscapeRoute(layout, tuning);
  if (outcome === "escaped" && exit !== undefined && exit.bonusMul !== 1) {
    multiplier *= exit.bonusMul;
    lines.push({ label: `${exit.name} 탈출`, kind: "multiplier", gold: 0, detail: `×${exit.bonusMul}` });
  }

  // 무사고 보너스: 경계 이상을 한 번도 만들지 않았을 때만.
  if (run.peakAlarm < 2) {
    multiplier *= tuning.run.flawlessBonus;
    lines.push({ label: "무사고", kind: "bonus", gold: 0, detail: `×${tuning.run.flawlessBonus}` });
  }

  // 품격이 높으면 예고장 보상이 더 커진다.
  if (card !== null && run.skill >= tuning.skill.cleanRunThreshold) {
    multiplier *= tuning.skill.cleanRunBonus;
    lines.push({ label: "괴도의 품격", kind: "bonus", gold: 0, detail: `×${tuning.skill.cleanRunBonus}` });
  }

  const earned = gross * multiplier;
  const payoutRatio = payoutRatioFor(outcome, run, tuning);
  const payout = Math.round(earned * payoutRatio);

  if (payoutRatio < 1) {
    lines.push({
      label: outcome === "busted" ? "강제 퇴장" : "시간 초과",
      kind: "penalty",
      gold: Math.round(earned) - payout,
      detail: `수령 ${Math.round(payoutRatio * 100)}%`,
    });
  }

  lines.push({ label: "총액", kind: "total", gold: payout });

  const manorPractice = layout.manor !== undefined && (manorAlreadyCompleted || outcome !== "escaped");
  return {
    outcome,
    escape: outcome === "escaped" && exit !== undefined
      ? {
          entryId: entry?.exit.id ?? null,
          entryName: entry?.exit.name ?? null,
          exitId: exit.id,
          exitName: exit.name,
          changedEntryRoute: entry !== null && entry.exit.id !== exit.id,
        }
      : null,
    lines: manorPractice ? [...lines.map((line) => ({ ...line, gold: 0 })), { kind: "bonus", gold: 0, label: manorAlreadyCompleted ? "회수 완료한 저택 · 탐험 연습" : "태엽새를 되찾으면 첫 의뢰 보상" }] : lines,
    grossGold: manorPractice ? 0 : Math.round(gross),
    payoutGold: manorPractice ? 0 : payout,
    forgoneGold: manorPractice ? 0 : Math.max(0, Math.round(earned) - payout),
    // 명성은 종료 시 기술치다. 탐욕 플레이와 정교한 플레이가 서로 다른 축을 올린다.
    fame: manorPractice || outcome === "busted" ? 0 : Math.round(run.skill),
  };
}

function payoutRatioFor(outcome: RunOutcome, run: RunState, tuning: Tuning): number {
  switch (outcome) {
    case "busted":
      return tuning.run.bustedPayout;
    case "timeout":
      return tuning.run.timeoutPayout;
    default:
      // 대탈출 중에 빠져나왔다면 일부만 챙긴다.
      return run.overtimeMs > 0 ? tuning.run.timeoutPayout : 1;
  }
}

/**
 * 사이드 콘텐츠의 결과 등급을 정산에 한 줄로 더한다. 배수는 다른 배수처럼 벌점 전 금액에 곱하고,
 * 벌점(대탈출 중 시간 초과 수령 비율)은 그 결과에 다시 적용한다. 표시 이름은 호출자가 i18n 원문으로 넘긴다.
 */
export function withRankLine(settlement: Settlement, label: string, multiplier: number): Settlement {
  const earned = settlement.payoutGold + settlement.forgoneGold;
  const scaledEarned = Math.round(earned * multiplier);
  const payout = Math.round(settlement.payoutGold * multiplier);
  const forgone = Math.max(0, scaledEarned - payout);
  const lines = settlement.lines.flatMap((line) => line.kind === "total"
    ? [{ label, kind: "bonus" as const, gold: 0, detail: `×${multiplier}` }, { ...line, gold: payout }]
    : line.kind === "penalty"
      ? [{ ...line, gold: forgone }]
      : [line]);
  return { ...settlement, lines, payoutGold: payout, forgoneGold: forgone };
}

/** breakdown 의 합이 총액과 일치하는지. 테스트가 이 불변식을 지킨다. */
export function verifyTotals(settlement: Settlement): boolean {
  const items = settlement.lines.filter((l) => l.kind === "item").reduce((sum, l) => sum + l.gold, 0);
  const penalties = settlement.lines.filter((l) => l.kind === "penalty").reduce((sum, l) => sum + l.gold, 0);
  const total = settlement.lines.find((l) => l.kind === "total")?.gold ?? 0;
  if (items !== settlement.grossGold) return false;
  return total === settlement.payoutGold && penalties === settlement.forgoneGold;
}
