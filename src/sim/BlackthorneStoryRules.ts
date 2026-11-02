import type { MetaState } from "./MetaProgressRules";
import type { MansionLayout } from "./MansionLayout";
import type { SimState } from "./simulation";
import type { PlayerSimState } from "./MovementRules";
import type { Tuning } from "./tuning";
import { isSociallyComposed } from "./DisguiseRules";

export interface BlackthorneStoryMemory {
  readonly introductionSeen: boolean;
  readonly returned: boolean;
  readonly gold: number;
  readonly fame: number;
}

export function sanitizeBlackthorneStory(value: unknown, completed: boolean): BlackthorneStoryMemory {
  const source = value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
  const amount = (key: string) => typeof source?.[key] === "number" && Number.isFinite(source[key])
    ? Math.max(0, Math.min(1_000_000, Math.floor(source[key]))) : 0;
  return {
    introductionSeen: source?.["introductionSeen"] === true || completed,
    // Old completed saves already earned their ending; never confiscate it for the new scene.
    returned: completed && (source === null || source["returned"] === true),
    gold: completed ? amount("gold") : 0,
    fame: completed ? amount("fame") : 0,
  };
}
export function blackthorneStory(meta: MetaState): BlackthorneStoryMemory {
  return sanitizeBlackthorneStory(meta.blackthorneStory, meta.blackthorneCompleted === true);
}
export function birdReturnPending(meta: MetaState): boolean {
  return meta.blackthorneCompleted === true && !blackthorneStory(meta).returned;
}
export function rememberBlackthorneIntroduction(meta: MetaState): MetaState {
  return { ...meta, blackthorneStory: { ...blackthorneStory(meta), introductionSeen: true } };
}
/** 첫 성공. */
export function recordBlackthorneRecovery(meta: MetaState, gold: number, fame: number): MetaState {
  if (meta.blackthorneCompleted === true) return meta;
  return { ...meta, blackthorneCompleted: true, blackthorneStory: {
    introductionSeen: true, returned: false, gold, fame,
  } };
}
export function returnClockworkBird(meta: MetaState): MetaState {
  if (!birdReturnPending(meta)) return meta;
  return { ...meta, blackthorneStory: { ...blackthorneStory(meta), returned: true } };
}

/** Public room membership is shared by guards, contact immunity and scene guidance. */
export function inManorReception(player: Pick<PlayerSimState, "x" | "y">, layout: MansionLayout, tuning: Tuning): boolean {
  const floor = Math.floor(player.y / tuning.world.floorHeightPx);
  return layout.manor?.rooms.some(room => layout.manor?.guestReceptionRoomIds?.includes(room.id)
    && room.floor === floor && player.x >= room.fromX && player.x < room.toX) === true;
}
export function manorGuestAccess(state: Pick<SimState, "manor" | "run">, player: PlayerSimState, layout: MansionLayout, tuning: Tuning): boolean {
  return inManorReception(player, layout, tuning) && state.manor?.guestRevoked !== true
    && state.run.collectedAnchorIds.length === 0 && isSociallyComposed(player);
}

/**
 * 저택 안 주인공의 손님 신분(겉모습 전용 — 경비 판정은 `manorGuestAccess` 그대로다).
 * - `guest`: 지금 손님으로 대접받는다(`manorGuestAccess`).
 * - `lapsed`: 잠깐 벗어났다(뛰기·점프·사다리·손님 방 밖). 침착하게 손님 방으로 돌아오면 다시 손님이다.
 * - `lost`: 영구히 잃었다. sim 이 `guestRevoked` 를 세웠거나(공격·소등·약탈·제압·소매치기·발각·창 밖 장치)
 *   이미 훔친 물건이 있다. 걸어 돌아와도 돌아오지 않는다.
 * 손님 방이 없는 저택(블랙손 밖)은 처음부터 손님 신분이 없어 `lost` 다.
 */
export type ManorGuestStanding = "guest" | "lapsed" | "lost";

export function manorGuestStanding(state: Pick<SimState, "manor" | "run">, player: PlayerSimState, layout: MansionLayout, tuning: Tuning): ManorGuestStanding {
  if ((layout.manor?.guestReceptionRoomIds?.length ?? 0) === 0) return "lost";
  if (state.manor?.guestRevoked === true || state.run.collectedAnchorIds.length > 0) return "lost";
  return manorGuestAccess(state, player, layout, tuning) ? "guest" : "lapsed";
}
