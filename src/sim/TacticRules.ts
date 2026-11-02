import type { MansionLayout } from "./MansionLayout";
import type { SimEvent, Vec2 } from "./types";

export const TACTIC_IDS = ["caper", "darkness", "lure", "combat"] as const;
export type TacticId = (typeof TACTIC_IDS)[number];

export const TACTIC_LABELS = Object.freeze({
  caper: "연쇄 장치",
  darkness: "어둠",
  lure: "유인",
  combat: "정면전",
} as const satisfies Readonly<Record<TacticId, string>>);

export interface TacticState {
  readonly scores: Readonly<Record<TacticId, number>>;
  readonly weaknessExploited: boolean;
}

export function createTactics(): TacticState {
  return { scores: { caper: 0, darkness: 0, lure: 0, combat: 0 }, weaknessExploited: false };
}

export function observe(
  state: TacticState,
  sourceEvents: readonly SimEvent[],
  layout: MansionLayout,
): { readonly state: TacticState; readonly events: readonly SimEvent[] } {
  const scores = { ...state.scores };
  for (const event of sourceEvents) {
    if (event.kind === "CaperDeviceTriggered") scores.caper += 2;
    if (event.kind === "CaperChainCompleted") scores.caper += 5;
    if (event.kind === "LampSnuffed") scores.darkness += 2;
    if (event.kind === "SmokeDeployed") scores.darkness += 5;
    if (event.kind === "NoiseEmitted" && event.source === "whistle") scores.lure += 1;
    if (event.kind === "ClockworkMouseReleased") scores.lure += 5;
    if (event.kind === "RibbonSnareTriggered") scores.lure += 5;
    if (event.kind === "CombatHit") scores.combat += 2;
    if (event.kind === "CombatDefeated") scores.combat += 5;
    if (event.kind === "PlayerShoved") scores.combat += 1;
  }

  const response = layout.tacticResponse;
  const exploitedAt = !state.weaknessExploited && response !== undefined
    ? weaknessEventAt(response.tactic, sourceEvents)
    : null;
  const events: SimEvent[] = exploitedAt === null || response === undefined
    ? []
    : [{ kind: "MansionWeaknessExploited", tactic: response.tactic, at: exploitedAt }];
  return {
    state: { scores, weaknessExploited: state.weaknessExploited || exploitedAt !== null },
    events,
  };
}

export function dominantTactic(state: TacticState): TacticId | null {
  if (TACTIC_IDS.every((id) => state.scores[id] <= 0)) return null;
  // 동점은 선언 순서로 고정한다. 같은 사건 스트림은 항상 같은 저택 기억을 만든다.
  let best: TacticId = "caper";
  for (const id of TACTIC_IDS) if (state.scores[id] > state.scores[best]) best = id;
  return best;
}

function weaknessEventAt(tactic: TacticId, events: readonly SimEvent[]): Vec2 | null {
  for (const event of events) {
    if (tactic === "darkness" && event.kind === "LampSnuffed") return event.at;
    if (tactic === "caper" && event.kind === "CaperDeviceTriggered") return event.at;
    if (tactic === "lure" && event.kind === "CaperDeviceTriggered") return event.at;
    if (tactic === "combat" && event.kind === "CaperDeviceTriggered") return event.at;
  }
  return null;
}
