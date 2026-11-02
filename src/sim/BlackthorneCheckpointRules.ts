import { EXTERIOR_HEIST_THRESHOLD_X, type ExteriorHeistState } from "./ExteriorHeistRules";
import type { MansionLayout } from "./MansionLayout";
import type { SimState } from "./simulation";
import { blackthorneGeometry } from "./BlackthorneSpatialGeometry";

/** The checkpoint is part of the replay layout, not a scene-only state mutation. */
export function blackthorneKeeperCheckpointLayout(layout: MansionLayout): MansionLayout {
  if (layout.manor?.heist !== true) return layout;
  return { ...layout, blackthorneCheckpoint: "keeper", spawn: { x: 1640, y: blackthorneGeometry(layout).floorSurfaces[0]! } };
}

export function initialBlackthorneCheckpointExterior(layout: MansionLayout): ExteriorHeistState | undefined {
  return layout.manor?.heist === true && layout.blackthorneCheckpoint === "keeper"
    ? { stairOpened: true, entered: true, windowBroken: true, cleared: false, returned: false,
      keyTaken: false }
    : undefined;
}

/** A health defeat in the encounter restarts only that encounter, never a capture elsewhere. */
export function shouldRestartBlackthorneKeeper(layout: MansionLayout, state: SimState): boolean {
  const exterior = state.manor?.exterior;
  const player = state.player;
  return layout.manor?.heist === true && state.run.outcome === "busted"
    && exterior?.entered === true && exterior.cleared === false && player.hp <= 0
    && player.x >= EXTERIOR_HEIST_THRESHOLD_X && player.x <= blackthorneGeometry(layout).heist.keeperGate.x
    && player.y <= blackthorneGeometry(layout).floorHeightPx;
}
