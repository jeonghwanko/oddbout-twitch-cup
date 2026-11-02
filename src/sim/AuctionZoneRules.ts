import type { AuctionBidderId, AuctionDefinition, AuctionState, AuctionZoneDefinition } from "./AuctionModel";
import { isSociallyComposed } from "./DisguiseRules";
import type { PlayerSimState } from "./MovementRules";
import type { Vec2 } from "./GeometryTypes";

/** 발 위치가 속한 경매장 구역. 판정·경계선·신분 배지가 같은 함수를 쓴다. */
export function auctionZoneAt(definition: AuctionDefinition, feet: Vec2): AuctionZoneDefinition | null {
  // 발은 바닥선 위에 놓이므로 아래 경계를 포함해 판정한다.
  // 재설계 이전 레이아웃을 담은 리플레이에는 구역 정의가 없다. 구역 밖으로 읽어 멈추지 않는다.
  return (definition.zones ?? []).find((zone) => (
    feet.x >= zone.rect.x
      && feet.x < zone.rect.x + zone.rect.w
      && feet.y >= zone.rect.y
      && feet.y <= zone.rect.y + zone.rect.h
  )) ?? null;
}

export function zoneAllowsCover(zone: AuctionZoneDefinition | null, cover: AuctionBidderId): boolean {
  return zone !== null && zone.allowedCovers.includes(cover);
}

/** 들키기 전이고, 신분이 허용된 구역에 있다. 걸음걸이는 따지지 않는다(표시용). */
export function auctionCoverHolds(
  state: AuctionState,
  definition: AuctionDefinition,
  feet: Vec2,
): boolean {
  return !state.exposed && !state.alarm
    && zoneAllowsCover(auctionZoneAt(definition, feet), state.coverBidderId);
}

/**
 * 경비가 이 손님을 통과시키는가. 블랙손 응접실 손님과 같은 `isSociallyComposed` 계약을 쓴다.
 * 달리기·웅크리기·등반·은신은 손님 행동이 아니므로 허용 구역 안에서도 통행권을 잃는다.
 */
export function auctionGuestAccess(
  state: AuctionState | null,
  definition: AuctionDefinition | undefined,
  player: PlayerSimState,
): boolean {
  if (state === null || definition === undefined) return false;
  return auctionCoverHolds(state, definition, { x: player.x, y: player.y }) && isSociallyComposed(player);
}
