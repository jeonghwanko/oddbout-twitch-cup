import { OTHERWORLD_BALANCE } from "./OtherworldBalance";
import type { PatchOp } from "./CallingCardRules";
import { availableCampaignInterludes, type CampaignInterludeId } from "./CampaignProgressRules";
import type { MetaState } from "./MetaProgressRules";
import { guestListOf } from "./BlackthorneGuestListRules";

/**
 * 이세계 수신기 — 주인공이 떠나온 세계의 평범한 물건이 마을 중앙의 장치로 하나씩 건너온다.
 *
 * 이 파일이 물건 목록·도착 조건·잠입 효과·경매가와 저장 전이를 함께 소유한다. 도착은 새 진행
 * 수치를 만들지 않고 이미 저장된 이야기 증거(장치 강림, 블랙손 첫 성공, 메인 사건 해금)를 읽는다.
 * 현대의 평범함은 여기서 희소품이다: 들고 가면 작은 효과를 주고, 경매관에 넘기면 골드가 되지만
 * 그 물건은 다시 돌아오지 않는다.
 */

export type OtherworldItemArrival =
  | { readonly kind: "landing" }
  /** 블랙손 집사에게 돌려보내진 직후. 가짜 귀빈을 만들 재료(명함·폰)가 이때 건너온다. */
  | { readonly kind: "turned-away" }
  | { readonly kind: "campaign"; readonly interlude: CampaignInterludeId };

export interface OtherworldItemDefinition {
  readonly id: OtherworldItemId;
  readonly arrival: OtherworldItemArrival;
  /** 들고 간 런에 한 번 적용되는 튜닝 패치. `CallingCardRules.applyOps` 가 유일한 적용기다. */
  readonly ops: readonly PatchOp[];
  readonly auctionGold: number;
}

export const OTHERWORLD_ITEM_IDS = ["can-coffee", "smartphone", "running-shoes", "card-wallet", "power-bank"] as const;
export type OtherworldItemId = (typeof OTHERWORLD_ITEM_IDS)[number];

export const OTHERWORLD_ITEMS: readonly OtherworldItemDefinition[] = Object.freeze([
  { id: "can-coffee", arrival: { kind: "landing" }, ops: [{ op: "add", path: "stamina.max", v: 15 }], auctionGold: 80 },
  { id: "smartphone", arrival: { kind: "turned-away" }, ops: [{ op: "add", path: "mischief.eyeMaxMs", v: 1_000 }], auctionGold: 120 },
  { id: "running-shoes", arrival: { kind: "campaign", interlude: "collectors-invitation" }, ops: [{ op: "mul", path: "noise.footstepRadius", v: 0.85 }], auctionGold: 100 },
  { id: "card-wallet", arrival: { kind: "turned-away" }, ops: [{ op: "mul", path: "suspicion.baseGainPerSec", v: 0.9 }], auctionGold: 150 },
  { id: "power-bank", arrival: { kind: "campaign", interlude: "last-audience" }, ops: [{ op: "add", path: "run.durationMs", v: 15_000 }], auctionGold: 90 },
] satisfies readonly OtherworldItemDefinition[]);

const ITEM_BY_ID: Readonly<Record<OtherworldItemId, OtherworldItemDefinition>> = Object.freeze(
  Object.fromEntries(OTHERWORLD_ITEMS.map((item) => [item.id, item])) as Record<OtherworldItemId, OtherworldItemDefinition>,
);

export function otherworldItemOf(id: OtherworldItemId): OtherworldItemDefinition {
  return ITEM_BY_ID[id];
}

export function isOtherworldItemId(value: unknown): value is OtherworldItemId {
  return typeof value === "string" && (OTHERWORLD_ITEM_IDS as readonly string[]).includes(value);
}

export interface OtherworldState {
  /** 장치가 하늘에서 떨어져 분수에 박혔는가. 이후 분수 자리는 장치로 그린다. */
  readonly landed: boolean;
  /** 장치에서 꺼내 손에 넣은 물건. 판 물건도 기록에 남는다. */
  readonly claimed: readonly OtherworldItemId[];
  /** 경매관에 넘긴 물건. 다시 소유하거나 들고 갈 수 없다. */
  readonly sold: readonly OtherworldItemId[];
  /** 다음 런에 들고 가는 물건 하나. */
  readonly carried: OtherworldItemId | null;
}

export const EMPTY_OTHERWORLD_STATE: OtherworldState = Object.freeze({ landed: false, claimed: [], sold: [], carried: null });

type OtherworldEvidence = Pick<MetaState, "character" | "firstOutfit" | "clearedCallingCardIds" | "blackthorneCompleted" | "otherworld" | "blackthorneGuestList">;

export function otherworldOf(meta: Pick<MetaState, "otherworld">): OtherworldState {
  return meta.otherworld ?? EMPTY_OTHERWORLD_STATE;
}


export function receiverLandingDue(meta: OtherworldEvidence): boolean {
  if (otherworldOf(meta).landed) return false;
  return meta.character !== "male" || meta.firstOutfit.phase === "commission-completed";
}

export function landReceiver(meta: MetaState): MetaState {
  if (!receiverLandingDue(meta)) return meta;
  return { ...meta, gold: meta.gold + OTHERWORLD_BALANCE.landingGold, otherworld: { ...otherworldOf(meta), landed: true } };
}

function arrived(meta: OtherworldEvidence, item: OtherworldItemDefinition): boolean {
  if (!otherworldOf(meta).landed) return false;
  switch (item.arrival.kind) {
    case "landing": return true;
    case "turned-away": return guestListOf(meta).turnedAway;
    case "campaign": return availableCampaignInterludes(meta).includes(item.arrival.interlude);
  }
}

/** 장치에 도착해 꺼내 주기를 기다리는 물건. 표 순서라 가장 이른 이야기의 물건이 먼저 나온다. */
export function pendingOtherworldItems(meta: OtherworldEvidence): readonly OtherworldItemId[] {
  const state = otherworldOf(meta);
  return OTHERWORLD_ITEMS
    .filter((item) => arrived(meta, item) && !state.claimed.includes(item.id))
    .map((item) => item.id);
}

/** 지금 손에 있는(꺼냈고 팔지 않은) 물건. */
export function ownedOtherworldItems(meta: Pick<MetaState, "otherworld">): readonly OtherworldItemId[] {
  const state = otherworldOf(meta);
  return OTHERWORLD_ITEM_IDS.filter((id) => state.claimed.includes(id) && !state.sold.includes(id));
}

export function claimOtherworldItem(meta: MetaState, id: OtherworldItemId): MetaState {
  if (!pendingOtherworldItems(meta).includes(id) || meta.gold < OTHERWORLD_BALANCE.drawCostGold) return meta;
  const state = otherworldOf(meta);
  return { ...meta, gold: meta.gold - OTHERWORLD_BALANCE.drawCostGold, otherworld: { ...state, claimed: OTHERWORLD_ITEM_IDS.filter((entry) => entry === id || state.claimed.includes(entry)) } };
}

/** 들고 갈 물건을 고른다. `null` 은 빈손이다. 갖고 있지 않은 물건은 고를 수 없다. */
export function carryOtherworldItem(meta: MetaState, id: OtherworldItemId | null): MetaState {
  const state = otherworldOf(meta);
  if (id !== null && !ownedOtherworldItems(meta).includes(id)) return meta;
  if (state.carried === id) return meta;
  return { ...meta, otherworld: { ...state, carried: id } };
}

/** 경매관 출품. 골드는 이 전이에서만 지급되어 연타·재접속으로 복제되지 않는다. */
export function sellOtherworldItem(meta: MetaState, id: OtherworldItemId): MetaState {
  if (!ownedOtherworldItems(meta).includes(id)) return meta;
  const state = otherworldOf(meta);
  return {
    ...meta,
    gold: meta.gold + otherworldItemOf(id).auctionGold,
    otherworld: {
      ...state,
      sold: OTHERWORLD_ITEM_IDS.filter((entry) => entry === id || state.sold.includes(entry)),
      carried: state.carried === id ? null : state.carried,
    },
  };
}

/** 실제로 들고 가는 물건. 소유하지 않은 값이 저장돼 있으면 빈손이다. */
export function carriedOtherworldItem(meta: Pick<MetaState, "otherworld">): OtherworldItemId | null {
  const carried = otherworldOf(meta).carried;
  return carried !== null && ownedOtherworldItems(meta).includes(carried) ? carried : null;
}

/** 들고 가는 물건의 런 패치. */
export function otherworldPatchOps(meta: Pick<MetaState, "otherworld">): readonly PatchOp[] {
  const carried = carriedOtherworldItem(meta);
  return carried === null ? [] : otherworldItemOf(carried).ops;
}

/** 저장 경계. 정규 ID만 남기고, 꺼내지 않은 물건을 판 기록이나 판 물건을 든 기록은 버린다. */
export function sanitizeOtherworldState(value: unknown): OtherworldState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return EMPTY_OTHERWORLD_STATE;
  const record = value as Record<string, unknown>;
  const ids = (raw: unknown): Set<string> => new Set(Array.isArray(raw) ? raw.filter((entry) => typeof entry === "string") : []);
  const landed = record["landed"] === true;
  const requestedClaimed = ids(record["claimed"]);
  const claimed = landed ? OTHERWORLD_ITEM_IDS.filter((id) => requestedClaimed.has(id)) : [];
  const requestedSold = ids(record["sold"]);
  const sold = claimed.filter((id) => requestedSold.has(id));
  const carried = isOtherworldItemId(record["carried"]) && claimed.includes(record["carried"]) && !sold.includes(record["carried"])
    ? record["carried"]
    : null;
  return { landed, claimed, sold, carried };
}
