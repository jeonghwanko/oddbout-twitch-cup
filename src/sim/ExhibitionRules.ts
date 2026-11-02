import { withGeometry } from "./LayoutGeometryMemo";
import type { ExteriorHeistState } from "./ExteriorHeistRules";
import type { MansionLayout } from "./MansionLayout";
import { MANOR_TUNING } from "./tuning";
import type { SimEvent, Vec2 } from "./types";
import { blackthorneGeometry } from "./BlackthorneSpatialGeometry";

/** A freight display behind glass. Actors use the maintenance hatch, never ride inside the sealed shaft. */
export interface ExhibitionDefinition {
  readonly x: number;
  readonly upperY: number;
  readonly lowerY: number;
  readonly crank: Vec2;
  readonly latch: Vec2;
  readonly crankId: string;
  readonly latchId: string;
}
export interface ExhibitionState {
  readonly presentationMs: number;
  readonly presentationStarted: boolean;
  readonly unlocked: boolean;
  readonly lowering: boolean;
  readonly travelMs: number;
  readonly atSafetyCatch?: boolean;
}
export function isExhibitionMechanism(layout: MansionLayout, id: string): boolean {
  const def = layout.manor?.exhibition;
  return def !== undefined && (id === def.latchId || id === def.crankId);
}
export function exhibitionPosition(def: ExhibitionDefinition, state?: ExhibitionState): Vec2 {
  if ((state?.presentationMs ?? 0) < MANOR_TUNING.exhibitionTravelMs) {
    const rising = (state?.presentationMs ?? 0) / MANOR_TUNING.exhibitionTravelMs;
    return { x: def.x, y: def.lowerY - (def.lowerY - def.upperY) * rising };
  }
  const progress = Math.min(1, Math.max(0, state?.travelMs ?? 0) / MANOR_TUNING.exhibitionTravelMs);
  return { x: def.x, y: def.upperY + (def.lowerY - def.upperY) * progress };
}
export function exhibitionDocked(state?: ExhibitionState): boolean {
  return (state?.travelMs ?? 0) >= MANOR_TUNING.exhibitionTravelMs;
}
export function advanceExhibition(previous: ExhibitionState | undefined, layout: MansionLayout, events: readonly SimEvent[], dtMs: number, player?: Vec2, exterior?: ExteriorHeistState): ExhibitionState | undefined {
  const def = layout.manor?.exhibition;
  if (!def) return undefined;
  const state = previous ?? { presentationMs: 0, presentationStarted: false, unlocked: false, lowering: false, travelMs: 0 };
  const observeX = layout.parkourRoutes?.[0]?.from.x;
  const presentationStarted = state.presentationStarted || player !== undefined && ((observeX === undefined ? Math.abs(player.x - def.x) < 260 : player.x >= observeX - 180 && player.x < def.x + 260) && Math.abs(player.y - def.lowerY) < 50 || player.y < def.lowerY - 120);
  const presentationMs = presentationStarted ? Math.min(MANOR_TUNING.exhibitionTravelMs, state.presentationMs + Math.max(0, dtMs)) : 0;
  const triggered = (id: string) => events.some(e => e.kind === "CaperDeviceTriggered" && e.deviceId === id);
  // 열쇠(금고지기 결투)가 도르레를 맞물리고, 걸쇠는 전시대가 중간 안전 걸쇠에 멈춘 동안만 풀린다.
  const keyed = exterior?.keyTaken === true;
  const atCatch = state.travelMs >= MANOR_TUNING.exhibitionTravelMs / 2;
  const unlocked = state.unlocked || triggered(def.latchId) && keyed && atCatch;
  const lowering = state.lowering || keyed && triggered(def.crankId);
  const travelMs = lowering ? Math.min(unlocked ? MANOR_TUNING.exhibitionTravelMs : MANOR_TUNING.exhibitionTravelMs / 2, state.travelMs + Math.max(0, dtMs)) : state.travelMs;
  return { presentationMs, presentationStarted, unlocked, lowering, travelMs,
    atSafetyCatch: lowering && !unlocked && travelMs >= MANOR_TUNING.exhibitionTravelMs / 2 };
}
/** One projection owns collision, interaction anchors, navigation and the displayed mechanism. */
export function exhibitionLayout(layout: MansionLayout, state?: ExhibitionState): MansionLayout {
  const def = layout.manor?.exhibition;
  if (!def) return layout;
  const presenting = (state?.presentationMs ?? 0) < MANOR_TUNING.exhibitionTravelMs;
  const at = exhibitionPosition(def, state);
  const docked = exhibitionDocked(state);
  // 전시 승강기는 블랙손에만 있다. 균형추 통로·뒷문은 도킹 전까지 닫혀 있다.
  const heist = blackthorneGeometry(layout).heist;
  return {
    ...layout,
    // 떠오르는 연출·움직이는 유리 전시대·위쪽 진열장에서는 회수할 수 없다. 아래 받침에 닿아야 실제 앵커가 열린다.
    lootAnchors: layout.lootAnchors.flatMap(a => a.id !== layout.manor!.targetAnchorId ? [a] : docked && !presenting ? [{ ...a, at: { x: at.x, y: at.y - 20 } }] : []),
    caperChains: layout.caperChains?.filter(c => c.rootDeviceId === def.latchId
      ? !state?.unlocked && (state?.travelMs ?? 0) >= MANOR_TUNING.exhibitionTravelMs / 2
      : c.rootDeviceId !== def.crankId || !presenting),
    links: layout.links.filter(l => l.id !== heist.escapePassageId && l.id !== heist.escapeReturnId || docked),
    geometry: docked ? layout.geometry : withGeometry(layout.geometry, { id: heist.rearGateId, kind: "solid", rect: heist.rearGate }),
    escapes: docked ? layout.escapes : [],
  };
}

/** 블랙손 도르레 크랭크. 저택 정의의 `crankChainId` 가 이 체인을 가리킨다. */
export const EXHIBITION_CRANK_ID = "exhibition-crank";
/** 전시대를 중간에서 멈춰 세우는 안전 걸쇠. 2F 중층 정비실에 있다. */
export const EXHIBITION_LATCH_ID = "exhibition-latch";

/** Audible docking impact comes from the arriving display, without the old applause lure. */
export function exhibitionArrivalEvents(before: ExhibitionState | undefined, after: ExhibitionState | undefined, layout: MansionLayout): readonly SimEvent[] {
  const def = layout.manor?.exhibition;
  if (!def || !exhibitionDocked(after) || exhibitionDocked(before)) return [];
  return [{ kind: "NoiseEmitted", at: { x: def.x, y: def.lowerY - 20 }, floor: 2, radius: MANOR_TUNING.exhibitionDockNoiseRadiusPx, source: "prop" }];
}
