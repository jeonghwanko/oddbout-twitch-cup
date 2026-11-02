import type { LootAnchor, MansionLayout } from "./MansionLayout";
import { VERTICAL_TRAVEL_WEIGHT } from "./MansionRoutes";

export const PERSONAL_ARTIFACT_LOOT_ID = "personal-artifact" as const;
export const PERSONAL_ARTIFACT_ANCHOR_ID = "personal-artifact-target";

/** 손으로 만든 스테이지의 지정 진열대를 개인 유물로 바꾼다. */
export function placePersonalArtifactAt(layout: MansionLayout, anchorId: string): MansionLayout {
  if (layout.lootAnchors.some((anchor) => anchor.lootId === PERSONAL_ARTIFACT_LOOT_ID)) return layout;
  const target = layout.lootAnchors.find((anchor) => anchor.id === anchorId);
  if (target === undefined) return layout;
  const replacement: LootAnchor = {
    ...target,
    id: PERSONAL_ARTIFACT_ANCHOR_ID,
    lootId: PERSONAL_ARTIFACT_LOOT_ID,
  };
  return {
    ...layout,
    lootAnchors: layout.lootAnchors.map((anchor) => anchor.id === anchorId ? replacement : anchor),
  };
}

/**
 * 일반 전리품 하나를 개인 유물 목표로 바꾼다.
 * 세트피스 수와 저택 검증 규칙은 그대로 보존하고, 스폰에서 가장 먼 후보를 골라 목표다운 동선을 만든다.
 */
export function placePersonalArtifact(layout: MansionLayout): MansionLayout {
  if (layout.lootAnchors.some((anchor) => anchor.lootId === PERSONAL_ARTIFACT_LOOT_ID)) return layout;
  const candidates = layout.lootAnchors.filter((anchor) =>
    !anchor.id.startsWith("setpiece-") && anchor.lootId !== "musicbox" && anchor.lootId !== "vault"
  );
  if (candidates.length === 0) return layout;

  const target = candidates.reduce((best, anchor) =>
    routeDistance(layout.spawn, anchor) > routeDistance(layout.spawn, best) ? anchor : best
  );
  return placePersonalArtifactAt(layout, target.id);
}

function routeDistance(from: LootAnchor["at"], to: LootAnchor): number {
  return Math.abs(to.at.x - from.x) + Math.abs(to.at.y - from.y) * VERTICAL_TRAVEL_WEIGHT;
}
