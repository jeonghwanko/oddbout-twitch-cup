import { withGeometry } from "./LayoutGeometryMemo";
import { blackthorneKeyAt, type BlackthorneBossState } from "./BlackthorneBossRules";
import { advanceGrievesServant, grievesServantDoor, grievesServantDoorOpen, type GrievesServantState } from "./GrievesStoryRules";
import { BLACKTHORNE_TARGET_ID } from "./BlackthorneManorDefinition";
import type { GuardState } from "./GuardPlanner";
import type { MansionLayout } from "./MansionLayout";
import type { PlayerSimState } from "./MovementRules";
import type { SimEvent } from "./types";
import { heistMechanism } from "./BlackthorneMechanismRules";
import { BLACKTHORNE_EXTERIOR_START_X, BLACKTHORNE_HEIST_IDS as H, blackthorneGeometry } from "./BlackthorneSpatialGeometry";

export const EXTERIOR_HEIST_THRESHOLD_X = BLACKTHORNE_EXTERIOR_START_X;

/** The outdoor maintenance deck is lower than the interior top floor. */
export function isExteriorHeistPosition(layout: MansionLayout, player: Pick<PlayerSimState, "x" | "y">, floorHeightPx: number): boolean {
  return player.y < floorHeightPx || layout.manor?.heist === true && player.x >= blackthorneGeometry(layout).heist.recoveryDeck.x;
}
/** 창 밖 지붕 회랑에 서는 경비. 실제 판에는 금고지기 한 명뿐이다. */
export const EXTERIOR_HEIST_GUARD_IDS = [H.bossId] as const;

export interface ExteriorHeistState {
  readonly stairOpened?: boolean;
  readonly keyTaken?: boolean;
  readonly keyAt?: import("./types").Vec2;
  readonly boss?: BlackthorneBossState;
  readonly entered: boolean;
  readonly cleared: boolean;
  readonly returned: boolean;
  readonly windowBroken: boolean;
  /** 그리브스 퇴장문·사용인(`GrievesStoryRules`). 문이 열리기 전에는 없다. */
  readonly servant?: GrievesServantState;
}

export interface ExteriorHeistAdvance {
  readonly state: ExteriorHeistState;
  readonly events: readonly SimEvent[];
}

const initialState = (): ExteriorHeistState => ({ entered: false, cleared: false, returned: false, windowBroken: false });

/** 창 밖 결투는 블랙손 실제 판(전시 승강기 + 천장 고리)에만 있다. */
export function supportsExteriorHeist(layout: MansionLayout): boolean {
  return layout.manor?.heist === true && layout.manor.exhibition !== undefined && (layout.grappleAnchors?.length ?? 0) > 0;
}

function crossed(before: PlayerSimState, after: PlayerSimState, direction: "out" | "in", upperSurfaceY: number): boolean {
  const airborne = !before.onGround || !after.onGround || before.parkour !== undefined || before.grapple !== undefined
    || after.parkour !== undefined || after.grapple !== undefined;
  if (!airborne || after.y > upperSurfaceY) return false;
  return direction === "out"
    ? before.x < EXTERIOR_HEIST_THRESHOLD_X && after.x >= EXTERIOR_HEIST_THRESHOLD_X
    : before.x > EXTERIOR_HEIST_THRESHOLD_X && after.x <= EXTERIOR_HEIST_THRESHOLD_X;
}

/**
 * 창 밖 금고지기 결투의 진행(창 넘기 → 제압 → 열쇠 → 실내 복귀)을 기록한다.
 * 결투를 지원하지 않는 레이아웃은 늘 초기 상태다.
 */
export function advanceExteriorHeist(
  previous: ExteriorHeistState | undefined,
  layout: MansionLayout,
  beforePlayer: PlayerSimState,
  player: PlayerSimState,
  guards: readonly GuardState[],
  inputEvents: readonly SimEvent[] = [],
  dtMs = 0,
): ExteriorHeistAdvance {
  if (!supportsExteriorHeist(layout)) return { state: initialState(), events: [] };
  return advanceKeeperHeist(previous ?? initialState(), layout, beforePlayer, player, guards, inputEvents, dtMs);
}

/** 열쇠를 쥐기 전에는 태엽새·직원 계단·복귀 통로를 막는다. 블랙손 실제 판이 아니면 그대로 둔다. */
export function exteriorHeistLayout(layout: MansionLayout, state: ExteriorHeistState | undefined): MansionLayout {
  return layout.manor?.heist ? keeperHeistLayout(layout, state) : layout;
}

function advanceKeeperHeist(before: ExteriorHeistState, layout: MansionLayout, from: PlayerSimState,
  player: PlayerSimState, guards: readonly GuardState[], events: readonly SimEvent[], dtMs: number): ExteriorHeistAdvance {
  const triggered = (id: string) => events.some(e => e.kind === "CaperDeviceTriggered" && e.deviceId === id);
  // A short jump can land on the sill just before crossing its far edge.
  // Entering the real upper corridor must still wake its keeper instead of soft-locking progress.
  const upperSurfaceY = blackthorneGeometry(layout).floorSurfaces[0]!;
  const windowCrossed = crossed(from, player, "out", upperSurfaceY) || from.x < EXTERIOR_HEIST_THRESHOLD_X
    && player.x >= EXTERIOR_HEIST_THRESHOLD_X && player.y <= upperSurfaceY && player.ventLinkId === null;
  const entered = before.entered || windowCrossed;
  const keeper = guards.find(g => g.id === H.bossId);
  // A temporary stun or a missing fixture is never a boss victory.
  const cleared = before.cleared || entered && layout.guards.some(g => g.id === H.bossId)
    && keeper?.combat?.defeated === true;
  const keyAt = before.keyAt ?? (cleared && keeper ? blackthorneKeyAt(keeper, upperSurfaceY) : undefined);
  const keyTaken = before.keyTaken === true
    || cleared && (triggered(H.keyId) || events.some(e => e.kind === "KeeperKeyCaught"));
  const servant = advanceGrievesServant(before.servant, layout, keyTaken, events, dtMs);
  const returned = before.returned || keyTaken && (crossed(from, player, "in", upperSurfaceY)
    || events.some(e => e.kind === "PlayerExitedVent" && e.linkId === H.returnId));
  return { state: { ...before, entered, cleared, keyTaken, returned,
    stairOpened: before.stairOpened === true || triggered(H.stairLatchId),
    ...(keyAt ? { keyAt } : {}), windowBroken: before.windowBroken || windowCrossed,
    ...(servant.state === undefined ? {} : { servant: servant.state }) },
    events: [...servant.events, ...(windowCrossed && !before.windowBroken
      ? [{ kind: "NoiseEmitted" as const, source: "prop" as const, at: { x: player.x, y: player.y }, floor: 0, radius: 240 }] : [])] };
}

/** Both sim interaction and renderer projection consume these physical gates. */
function keeperHeistLayout(layout: MansionLayout, state: ExteriorHeistState | undefined): MansionLayout {
  const spatial = blackthorneGeometry(layout);
  const key = state?.keyTaken === true;
  // 사용인 퇴장문 장치는 실제 열쇠를 쥔 뒤에만, 문이 열리기 전까지만 있다. 장치일 뿐 링크·충돌을 더하지 않는다.
  const door = grievesServantDoor(layout);
  const doorDevice = key && door !== null && !grievesServantDoorOpen(layout, state?.servant)
    ? [heistMechanism(door.id, { x: door.x, y: door.y }, spatial.floorHeightPx)] : [];
  const chains = layout.caperChains?.flatMap(c => {
    if (c.id === H.stairLatchId) return state?.stairOpened ? [] : [c];
    if (c.id === H.keyId) return state?.cleared && !key ? [heistMechanism(H.keyId, state.keyAt ?? spatial.heist.keyAt, spatial.floorHeightPx)] : [];
    if (c.id === layout.manor?.exhibition?.crankId) return key ? [c] : [];
    return [c];
  });
  // exhibitionLayout has already removed the bird until lower docking.
  return { ...layout,
    lootAnchors: key ? layout.lootAnchors : layout.lootAnchors.filter(a => a.id !== BLACKTHORNE_TARGET_ID),
    links: layout.links.filter(l => {
      if (l.id === H.returnId) return key;
      if (l.id === "manor-grand-stair" || l.id === "parkour-drainpipe") return state?.stairOpened === true;
      if (l.id === "heist-service-stair") return key;
      return true;
    }),
    geometry: key ? layout.geometry : withGeometry(layout.geometry, { id: "heist-service-cover", kind: "solid", rect: spatial.heist.serviceGate }),
    caperChains: doorDevice.length === 0 ? chains : [...(chains ?? []), ...doorDevice],
  };
}
