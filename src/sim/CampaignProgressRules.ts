import { CALLING_CARD_IDS } from "./CallingCardIds";
import { callingCardClearProgress, type MetaState } from "./MetaProgressRules";

/** 메인 사건은 별도 경험치 대신 실제로 제패한 서로 다른 예고장을 증거로 쓴다. */
export const CAMPAIGN_MILESTONES = Object.freeze([
  { id: "first-signature", clears: 1 },
  { id: "collectors-invitation", clears: 3 },
  { id: "bells-blank", clears: 5 },
  { id: "last-audience", clears: 7 },
  { id: "names-returned", clears: CALLING_CARD_IDS.length },
] as const);

export type CampaignInterludeId = (typeof CAMPAIGN_MILESTONES)[number]["id"];
export interface CampaignMemory {
  readonly seenInterludes: readonly CampaignInterludeId[];
}

type CampaignEvidence = Pick<MetaState, "clearedCallingCardIds" | "campaign" | "blackthorneCompleted">;

export function availableCampaignInterludes(meta: Pick<MetaState, "clearedCallingCardIds" | "blackthorneCompleted">): readonly CampaignInterludeId[] {
  const clears = callingCardClearProgress(meta).cleared;
  return CAMPAIGN_MILESTONES.filter((milestone) => clears >= milestone.clears || (milestone.id === "first-signature" && meta.blackthorneCompleted === true)).map((milestone) => milestone.id);
}

/** 여러 장이 이미 열린 저장은 현재 사건 한 장만 제안한다. 옛 장면은 다시보기로 남긴다. */
export function pendingCampaignInterlude(meta: CampaignEvidence): CampaignInterludeId | null {
  const latest = availableCampaignInterludes(meta).at(-1);
  return latest === undefined || meta.campaign.seenInterludes.includes(latest) ? null : latest;
}

/** 완료/스킵은 관람 여부만 기록한다. 제패·보상·난이도에는 영향을 주지 않는다. */
export function acknowledgeCampaignInterlude(meta: MetaState, id: CampaignInterludeId): MetaState {
  if (!availableCampaignInterludes(meta).includes(id) || meta.campaign.seenInterludes.includes(id)) return meta;
  const requested = new Set([...meta.campaign.seenInterludes, id]);
  return {
    ...meta,
    campaign: { seenInterludes: CAMPAIGN_MILESTONES.filter((entry) => requested.has(entry.id)).map((entry) => entry.id) },
  };
}

/** 저장에는 이미 해금한 장면의 정규 ID만 남긴다. */
export function sanitizeCampaignMemory(value: unknown, clearedCount: number, blackthorneCompleted = false): CampaignMemory {
  const raw = typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)["seenInterludes"] : undefined;
  const requested = new Set(Array.isArray(raw) ? raw.filter((entry) => typeof entry === "string") : []);
  return {
    seenInterludes: CAMPAIGN_MILESTONES
      .filter((entry) => (entry.clears <= clearedCount || (entry.id === "first-signature" && blackthorneCompleted)) && requested.has(entry.id))
      .map((entry) => entry.id),
  };
}

export function campaignProgress(meta: Pick<MetaState, "clearedCallingCardIds" | "blackthorneCompleted">): Readonly<{
  evidence: number;
  total: number;
  nextInterlude: CampaignInterludeId | null;
  untilNext: number;
  complete: boolean;
}> {
  const collection = callingCardClearProgress(meta);
  const evidence = collection.cleared;
  const next = CAMPAIGN_MILESTONES.find((entry) => entry.clears > evidence && !(entry.id === "first-signature" && meta.blackthorneCompleted === true));
  return {
    evidence,
    total: collection.total,
    nextInterlude: next?.id ?? null,
    untilNext: next === undefined ? 0 : next.clears - evidence,
    complete: collection.complete,
  };
}
