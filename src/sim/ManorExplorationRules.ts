import { exhibitionLayout, type ExhibitionState } from "./ExhibitionRules";
import { exteriorHeistLayout, type ExteriorHeistState } from "./ExteriorHeistRules";
import type { MansionLayout } from "./MansionLayout";
import type { ManorRoom } from "./BlackthorneManorDefinition";
import type { PlayerSimState } from "./MovementRules";
import type { RunState } from "./RunRules";
import type { SimEvent, Vec2 } from "./types";
import type { Tuning } from "./tuning";

export interface ManorExplorationState {
  readonly exhibition?: ExhibitionState;
  readonly exterior?: ExteriorHeistState;
  readonly guestRevoked?: boolean;
  readonly visitedRoomIds: readonly string[];
}
export function createManorExploration(memory?: Pick<ManorExplorationState, "visitedRoomIds">): ManorExplorationState {
  return { visitedRoomIds: [...(memory?.visitedRoomIds ?? [])] };
}
export function manorRoomAt(layout: MansionLayout, at: Vec2 & Partial<Pick<PlayerSimState, "ventLinkId">>, tuning: Tuning): ManorRoom | null {
  if (at.ventLinkId != null) return null;
  const floor = Math.floor(at.y / tuning.world.floorHeightPx);
  return layout.manor?.rooms.find((room) => room.floor === floor && at.x >= room.fromX && at.x < room.toX) ?? null;
}
export function manorIsExploring(layout: MansionLayout, run: Pick<RunState, "collectedAnchorIds">): boolean {
  return layout.manor !== undefined && !run.collectedAnchorIds.includes(layout.manor.targetAnchorId);
}
/** 지금 상태로 열리고 닫힌 블랙손: 전시 승강기(`exhibitionLayout`)와 창 밖 장치(`exteriorHeistLayout`)가 링크·출구·장치를 거른다. */
export function manorLayoutFor(layout: MansionLayout, state: ManorExplorationState | undefined): MansionLayout {
  if (layout.manor === undefined) return layout;
  return exteriorHeistLayout(exhibitionLayout(layout, state?.exhibition), state?.exterior);
}
export function observeManor(
  previous: ManorExplorationState | undefined,
  layout: MansionLayout,
  at: Vec2 & Pick<PlayerSimState, "ventLinkId">,
  events: readonly SimEvent[],
  tuning: Tuning,
): ManorExplorationState {
  const state = previous ?? createManorExploration();
  const room = manorRoomAt(layout, at, tuning);
  return {
    exhibition: state.exhibition,
    ...(state.exterior === undefined ? {} : { exterior: state.exterior }),
    guestRevoked: state.guestRevoked === true || events.some(event => event.kind === "PlayerAttacked"
      || event.kind === "LampSnuffed" || event.kind === "LootCollected" || event.kind === "GuardSubdued"
      || event.kind === "GuardPickpocketed" || (event.kind === "SuspicionTierChanged" && event.to === "spotted")),
    visitedRoomIds: room === null || state.visitedRoomIds.includes(room.id) ? state.visitedRoomIds : [...state.visitedRoomIds, room.id],
  };
}
