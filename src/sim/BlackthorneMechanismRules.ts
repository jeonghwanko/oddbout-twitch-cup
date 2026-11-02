import type { CaperChain, MansionLayout } from "./MansionLayout";
import type { ManorExplorationState } from "./ManorExplorationRules";
import type { ActionRejectReason, Vec2 } from "./types";
import { MANOR_TUNING } from "./tuning";
import { exhibitionDocked, exhibitionPosition } from "./ExhibitionRules";
import { blackthorneGeometry } from "./BlackthorneSpatialGeometry";
import { grievesServantDoor, grievesServantDoorOpen } from "./GrievesStoryRules";

/**
 * 블랙손의 한 번 누르는 장치(계단 걸쇠·중간 안전 걸쇠·금고지기 열쇠) 하나짜리 연쇄. 저택 정의·열쇠 투영·
 * 상호작용 안내가 같은 모양을 쓴다. 층은 그 판의 층 높이(`floorHeightPx`)로 장치 발 위치에서 구한다.
 */
export function heistMechanism(id: string, at: Vec2, floorHeightPx: number): CaperChain {
  const floor = Math.floor((at.y - 1) / floorHeightPx);
  return { id, reusableOnEscape: false, floor, fromX: at.x - 36, toX: at.x + 36, rootDeviceId: id,
    devices: [{ id, kind: "armor", floor, triggerAt: at, visualAt: at, impactAt: at,
      impactRadiusPx: 0, noiseRadiusPx: 65, effect: "stagger", direction: 1, delayMs: 0 }] };
}

/** Shared mechanical state for prompts, attempted interactions and sprite playback. */
export function blackthorneMechanisms(layout: MansionLayout, state?: ManorExplorationState): readonly {
  id: string; at: Vec2; done: boolean; blockedReason: ActionRejectReason | null;
}[] {
  const def = layout.manor?.exhibition;
  if (!layout.manor?.heist || !def) return [];
  const h = blackthorneGeometry(layout).heist;
  const e = state?.exhibition;
  const keyed = state?.exterior?.keyTaken === true;
  const atCatch = (e?.travelMs ?? 0) >= MANOR_TUNING.exhibitionTravelMs / 2;
  const door = grievesServantDoor(layout);
  const doorOpen = grievesServantDoorOpen(layout, state?.exterior?.servant);
  return [
    { id: h.stairLatchId, at: h.stairLatch, done: state?.exterior?.stairOpened === true,
      blockedReason: state?.exterior?.stairOpened ? "already-done" : null },
    { id: def.crankId, at: def.crank, done: e?.lowering === true,
      blockedReason: !keyed ? "keeper-key" : e?.lowering ? e.unlocked ? "already-done" : atCatch ? "release-catch" : "wait-display" : null },
    { id: def.latchId, at: def.latch, done: e?.unlocked === true,
      blockedReason: e?.unlocked ? "already-done" : !keyed ? "keeper-key" : !e?.lowering ? "start-pulley" : !atCatch ? "wait-display" : null },
    // 그리브스 사용인 퇴장문(배경 장치). 결투 중에는 금고지기 열쇠가 필요하다고 거절한다. 결판 뒤 바닥의 열쇠를 줍기 전에는
    // 거절을 내지 않는다 — 같은 종류(caper)의 거절이 먼저 줄을 서면 문 옆에 떨어진 열쇠의 E 를 빼앗는다.
    ...(door === null ? [] : [{ id: door.id, at: { x: door.x, y: door.y }, done: doorOpen,
      blockedReason: doorOpen ? "already-done" as const : keyed || state?.exterior?.cleared === true ? null : "keeper-key" as const }]),
  ];
}

export const BLACKTHORNE_DISPLAY_SEAL_ID = "heist-display-seal";

/**
 * 전시대에 잠긴 진열장. 아래층 받침에 닿기 전까지 새는 손이 닿는 자리에 있어도 꺼낼 수 없다.
 * 고리로 수장고에 뛰어든 바로 옆이 새라서, 그 자리의 E 가 말없이 헛돌면 "왜 못 집지?" 가 된다.
 * 그래서 E 는 다음에 할 일(열쇠 → 도르레)을 대는 거절이 된다. 도르레가 돌기 시작하면 null — 내려가는 동안은
 * 중층 걸쇠가 E 의 주인이고, 받침에 닿으면 진짜 전리품이 드러난다.
 */
export function blackthorneDisplaySeal(layout: MansionLayout, state?: ManorExplorationState): {
  id: string; at: Vec2; blockedReason: ActionRejectReason;
} | null {
  const def = layout.manor?.exhibition;
  if (!layout.manor?.heist || !def) return null;
  const e = state?.exhibition;
  if (e?.lowering === true || exhibitionDocked(e)) return null;
  return { id: BLACKTHORNE_DISPLAY_SEAL_ID, at: exhibitionPosition(def, e),
    blockedReason: state?.exterior?.keyTaken === true ? "start-pulley" : "keeper-key" };
}
