import type { MetaState } from "./MetaProgressRules";
import { birdReturnPending, blackthorneStory } from "./BlackthorneStoryRules";


export interface OttoCampaignState {
  readonly defeated: boolean;
  readonly sampleClaimed: boolean;
  readonly witnessed?: true;
  readonly intervened?: true;
  readonly cartCleared?: true;
  readonly rescue?: "pending" | "player" | "villagers";
  readonly goodsReturned?: true;
  readonly memory?: "pending" | "skipped" | "viewed";
  /** 열린 V4 문턱에서 작전 목적(C11)을 들었다. 목표 HUD 가 문턱을 가리키는 것을 멈춘다(입장 조건은 아니다). */
  readonly thresholdBriefed?: true;
}

/** 저장 원본을 읽는다. 알아볼 수 없는 값은 "아직 일어나지 않음"(레코드 없음)이다. */
export function sanitizeOttoCampaign(value: unknown): OttoCampaignState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const defeated = record["defeated"] === true;
  if (!defeated && record["witnessed"] !== true && record["intervened"] !== true && record["cartCleared"] !== true) return undefined;
  const sampleClaimed = defeated && record["sampleClaimed"] === true;
  const rescue = record["rescue"], memory = record["memory"];
  return Object.freeze({ defeated, sampleClaimed,
    ...(record["witnessed"] === true ? { witnessed: true as const } : {}),
    ...(record["intervened"] === true || record["cartCleared"] === true ? { intervened: true as const } : {}),
    ...(record["cartCleared"] === true ? { cartCleared: true as const } : {}),
    ...(defeated && (rescue === "pending" || rescue === "player" || rescue === "villagers") ? { rescue } : {}),
    ...(defeated && record["goodsReturned"] === true ? { goodsReturned: true as const } : {}),
    ...(defeated && (memory === "pending" || memory === "skipped" || memory === "viewed") ? { memory } : {}),
    ...(sampleClaimed && record["thresholdBriefed"] === true ? { thresholdBriefed: true as const } : {}) });
}

export function ottoCampaignOf(meta: MetaState): OttoCampaignState | undefined { return meta.ottoCampaign; }

export function ottoDefeated(meta: MetaState): boolean { return meta.ottoCampaign?.defeated === true; }

export function returnSampleClaimed(meta: MetaState): boolean { return meta.ottoCampaign?.sampleClaimed === true; }

/** 자판기 강림 이후의 압류. 오토를 아직 쓰러뜨리지 않았다. 태엽새 반환 여부는 대사만 바꾼다. */
export function clockshopSeizureActive(meta: MetaState): boolean {
  return meta.otherworld?.landed === true && !ottoDefeated(meta);
}


export function clockshopSeizureVariant(meta: MetaState): "town" | "bird-in-hand" | "bird-returned" {
  return !meta.blackthorneCompleted ? "town" : birdReturnPending(meta) ? "bird-in-hand" : "bird-returned";
}

/** 견본이 아직 안전 회수자리(월드)에 있다. */
export function returnSampleInWorld(meta: MetaState): boolean { return ottoDefeated(meta) && !returnSampleClaimed(meta); }

/**
 * 오토 첫 승리 확정(멱등). 이미 확정돼 있으면 같은 저장을 그대로 돌려준다 — 견본을 다시 월드에 만들지 않는다.
 * 자판기 강림 전이면 확정하지 않는다(전투가 열릴 수 없는 상태의 늦은 콜백).
 */
export function commitOttoDefeat(meta: MetaState): MetaState {
  if (!clockshopSeizureActive(meta)) return meta;
  return { ...meta, ottoCampaign: Object.freeze({ ...meta.ottoCampaign, defeated: true, intervened: true,
    sampleClaimed: false, rescue: "pending", memory: "pending" }) };
}

/** 반납 견본 직접 줍기(멱등). 격파 전이거나 이미 주웠으면 저장을 바꾸지 않는다. */
export function claimReturnSample(meta: MetaState): MetaState {
  if (!ottoDefeated(meta) || returnSampleClaimed(meta)) return meta;
  return { ...meta, ottoCampaign: Object.freeze({ ...meta.ottoCampaign, defeated: true, sampleClaimed: true }) };
}

/** 열린 V4 문턱의 작전 목적을 들었다(멱등). 문턱이 닫혀 있으면 바꾸지 않는다. */
export function briefV4Threshold(meta: MetaState): MetaState {
  const otto = meta.ottoCampaign;
  if (!otto?.sampleClaimed || otto.thresholdBriefed || !v4OperationGate(meta).open) return meta;
  return { ...meta, ottoCampaign: Object.freeze({ ...otto, thresholdBriefed: true as const }) };
}

/** 견본을 주웠고 아직 문턱의 목적을 듣지 않았다(HUD 가 상업지구 문턱을 가리킨다). */
export function v4ThresholdPending(meta: MetaState): boolean {
  return v4OperationGate(meta).open && meta.ottoCampaign?.thresholdBriefed !== true;
}

export type V4OperationGateReason = "otto" | "sample" | "story";

/**
 * V4 작전 문턱: 오토 격파·견본 취득·블랙손 완료·태엽새 반환을 각각 확인해 다음 행선지를 안내한다.
 * 조기 오토전이 블랙손 본선을 건너뛰게 만들지 않는다. 로잘린/그레타 설명은 입장 조건이 아니다.
 */
export function v4OperationGate(meta: MetaState): { readonly open: boolean; readonly missing: V4OperationGateReason | null } {
  if (!ottoDefeated(meta)) return { open: false, missing: "otto" };
  if (!returnSampleClaimed(meta)) return { open: false, missing: "sample" };
  if (!meta.blackthorneCompleted || !blackthorneStory(meta).returned) return { open: false, missing: "story" };
  return { open: true, missing: null };
}

/** Town actions commit only their own facts; seeing the past never rescues a person. */
export function witnessOtto(meta: MetaState): MetaState {
  if (!clockshopSeizureActive(meta) || meta.ottoCampaign?.witnessed) return meta;
  return { ...meta, ottoCampaign: { defeated: false, sampleClaimed: false, ...meta.ottoCampaign, witnessed: true } };
}
export function interveneOtto(meta: MetaState, cartCleared = false): MetaState {
  if (!clockshopSeizureActive(meta) || meta.ottoCampaign?.intervened && (!cartCleared || meta.ottoCampaign.cartCleared)) return meta;
  return { ...meta, ottoCampaign: { defeated: false, sampleClaimed: false, ...meta.ottoCampaign, intervened: true,
    ...(cartCleared ? { cartCleared: true as const } : {}) } };
}
export function finishOttoMemory(meta: MetaState, viewed: boolean): MetaState {
  const story = meta.ottoCampaign;
  if (!story?.defeated || story.memory === "viewed" || !viewed && story.memory === "skipped") return meta;
  return { ...meta, ottoCampaign: { ...story, memory: viewed ? "viewed" : "skipped" } };
}
export function rescueOttoPorter(meta: MetaState, by: "player" | "villagers"): MetaState {
  const story = meta.ottoCampaign;
  if (!story?.defeated || story.rescue !== "pending") return meta;
  return { ...meta, ottoCampaign: { ...story, rescue: by } };
}
export function returnOttoGoods(meta: MetaState): MetaState {
  const story = meta.ottoCampaign;
  if (!story?.defeated || story.goodsReturned) return meta;
  return { ...meta, ottoCampaign: { ...story, goodsReturned: true } };
}
