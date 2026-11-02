import { isExhibitionMechanism } from "./ExhibitionRules";
import { INPUT_MASKS, maskInput } from "./InputMask";
import { blackthorneDisplaySeal, blackthorneMechanisms } from "./BlackthorneMechanismRules";
import { heistMechanism } from "./BlackthorneMechanismRules";
import { manorLayoutFor } from "./ManorExplorationRules";
import type { CarryState } from "./CarryRules";
import { canPickUp, loadRatio, totalWeight } from "./CarryRules";
import type { GuardState } from "./GuardPlanner";
import type { MansionLayout } from "./MansionLayout";
import { caperRootAt, environmentHazardAt, floorOfY, hideSpotAt, linkAtPreferred, snuffableLampAt } from "./MansionLayout";
import { bodyRect, isLinkLocked, ventTravelMs } from "./MovementRules";
import type { PlayerSimState } from "./MovementRules";
import type { MischiefState } from "./MischiefRules";
import { handActionOf as mischiefHandActionOf } from "./MischiefRules";
import { lootDef, stealDurationMs } from "./LootRules";
import { grabFeet, throwableRoute } from "./ParkourRules";
import { availableAnchor } from "./GrappleRules";
import type { RunState } from "./RunRules";
import {
  effectiveSkillRequired,
  hasRequiredArtifact,
  isExitUsable,
  interactionExitAt,
  nearestAnchor,
  unavailableLootAnchorIds,
} from "./RunRules";
import type { SubdueState } from "./SubdueRules";
import { candidate as subdueCandidate } from "./SubdueRules";
import type { PickpocketState } from "./PickpocketRules";
import { candidate as pickpocketCandidate } from "./PickpocketRules";
import type { BodyDragState } from "./BodyDragRules";
import { candidate as bodyDragCandidate } from "./BodyDragRules";
import type { Tuning } from "./tuning";
import type { ActionRejectReason, InputFrame, Vec2 } from "./types";
import type { StaminaState } from "./StaminaRules";
import { canBeDragged } from "./GuardStatusRules";
import type { CaperState } from "./CaperRules";
import { activityOf as caperActivityOf } from "./CaperRules";
import {
  interactionReachPx,
  interactionReachRect,
} from "./InteractionRangeRules";
import type { AuctionState } from "./AuctionModel";
import { activeAuctionStation, auctionLockedAnchorIds as lockedAuctionAnchorIds } from "./AuctionRules";

/** 화면 안내와 실제 규칙이 공유하는 가까운 행동의 의미 모델. 키 이름과 문장은 렌더가 붙인다. */
export type InteractionKind = "body-drag" | "pickpocket" | "subdue" | "auction-bid" | "caper" | "environment" | "steal" | "escape" | "hide" | "reveal" | "vent" | "climb" | "snuff" | "parkour" | "grapple";

export interface InteractionAffordance {
  readonly kind: InteractionKind;
  readonly targetId: string;
  readonly at: Vec2;
  readonly blockedReason: ActionRejectReason | null;
  readonly progressMs: number;
  readonly durationMs: number;
  readonly retainedMs: number;
  readonly current?: number;
  readonly required?: number;
  /** 고리 사슬: 매달린 채 다음 고리로 옮겨 잡는 E 다. 프롬프트가 "사슬 걸기" 대신 "다음 고리" 를 띄운다. */
  readonly transfer?: true;
}

/** 입력 전에도 같은 종류의 대상 사이에서 판정과 키캡이 함께 유지하는 초점. */
export interface InteractionFocus {
  readonly kind: InteractionKind;
  readonly targetId: string;
}

export interface InteractionSnapshot {
  readonly manor?: import("./ManorExplorationRules").ManorExplorationState;
  readonly player: PlayerSimState;
  readonly guards: readonly GuardState[];
  readonly subdue: SubdueState;
  readonly pickpocket: PickpocketState;
  readonly bodyDrag: BodyDragState;
  readonly mischief: MischiefState;
  readonly run: RunState;
  readonly carry: CarryState;
  readonly stamina: StaminaState;
  readonly caper: CaperState;
  readonly interactionFocus: InteractionFocus | null;
  readonly auction: AuctionState | null;
}

/** 가장 중요한 한 행동만 노출한다. 진행 중인 행동과 실제 E 우선순위가 먼저다. */
export function primaryInteractionAffordance(
  state: InteractionSnapshot,
  layout: MansionLayout,
  tuning: Tuning,
): InteractionAffordance | null {
  const found = interactionAffordances(state, layout, tuning);
  return found.sort(compareAffordance)[0] ?? null;
}


export function routeInteractionInput(input: InputFrame, state: InteractionSnapshot, layout: MansionLayout, tuning: Tuning): InputFrame {
  if (!input.interact && !input.interactPressed) return input;
  const target = primaryInteractionAffordance(state, layout, tuning);
  if (!target || target.blockedReason !== null || !["snuff", "caper", "environment"].includes(target.kind)) return input;
  return { ...maskInput(input, INPUT_MASKS.interactionRoutedToSnuff),
    snuffHold: input.interact || input.interactPressed, snuffPressed: input.interactPressed };
}

/**
 * 이번 프레임의 E 를 도하가 가져가는가. 가져가면 그 루트 id, 아니면 null.
 *
 * 이동 규칙은 전체 상태를 볼 수 없으므로, 같은 중재 결과를 `MoveContext` 로
 * 넘겨 줄 던지기가 훔치기·소매치기와 같은 누름을 두 번 쓰지 않게 한다.
 */
export function parkourThrowRouteId(
  state: InteractionSnapshot,
  layout: MansionLayout,
  tuning: Tuning,
): string | null {
  const target = primaryInteractionAffordance(state, layout, tuning);
  return target !== null && target.kind === "parkour" && target.blockedReason === null
    ? target.targetId
    : null;
}

/** 프롬프트 1순위가 통로(환기구)면 그 id. E 하나로 들어가거나, 잠겼으면 거절을 받는다. */
export function ventInteractLinkId(state: InteractionSnapshot, layout: MansionLayout, tuning: Tuning): string | null {
  const target = primaryInteractionAffordance(state, layout, tuning);
  return target?.kind === "vent" ? target.targetId : null;
}

export function grappleAnchorId(state: InteractionSnapshot, layout: MansionLayout, tuning: Tuning): string | null {
  const target = primaryInteractionAffordance(state, layout, tuning);
  return target?.kind === "grapple" && target.blockedReason === null ? target.targetId : null;
}

/**
 * 이번 E 에서 고리 사슬의 몫.
 *
 * 매달려 있으면 사슬이 E 를 통째로 소유한다 — 같은 누름이 훔치기·제압으로 새지 않고, 방향키(`moveX`,
 * 없으면 보는 쪽)로 옮겨 잡을 고리를 고른다. 매달리지 않았으면 프롬프트와 같은 1순위 대상이 고리일
 * 때만 쏜다. 아무 대상도 없는 E 는 공중에서 잠깐 버퍼로 남는다(`bufferable`).
 */
export function grappleInteraction(
  state: InteractionSnapshot,
  layout: MansionLayout,
  tuning: Tuning,
  moveX: -1 | 0 | 1,
): { readonly anchorId: string | null; readonly owned: boolean; readonly bufferable: boolean } {
  if (state.player.grapple !== undefined) {
    const anchor = state.stamina.value >= tuning.grapple.attachCost
      ? availableAnchor(manorLayoutFor(layout, state.manor), state.player, tuning, moveX)
      : null;
    return { anchorId: anchor?.id ?? null, owned: true, bufferable: true };
  }
  const target = primaryInteractionAffordance(state, layout, tuning);
  return {
    anchorId: target?.kind === "grapple" && target.blockedReason === null ? target.targetId : null,
    owned: false,
    bufferable: target === null,
  };
}

export function interactionAffordances(
  state: InteractionSnapshot,
  layout: MansionLayout,
  tuning: Tuning,
): InteractionAffordance[] {
  layout = manorLayoutFor(layout, state.manor);
  const { player } = state;
  const at = { x: player.x, y: player.y };
  const reach = interactionReachRect(bodyRect(player, tuning), tuning.movement.bodyWidth, tuning);
  const out: InteractionAffordance[] = [];
  const seal = blackthorneDisplaySeal(layout, state.manor);
  for (const mechanism of [...blackthorneMechanisms(layout, state.manor), ...(seal === null ? [] : [seal])]) {
    if (mechanism.blockedReason === null) continue;
    const candidate = caperRootAt({ ...layout, caperChains: [heistMechanism(mechanism.id, mechanism.at, tuning.world.floorHeightPx)] }, at, interactionReachPx(tuning.mischief.reachPx, tuning));
    if (candidate) out.push({ kind: "caper", targetId: mechanism.id, at: mechanism.at,
      blockedReason: mechanism.blockedReason, progressMs: 0, durationMs: 0, retainedMs: 0 });
  }

  const auctionStation = state.auction === null || layout.auction === undefined
    ? null
    : activeAuctionStation(
        state.auction,
        layout.auction,
        at,
        floorOfY(player.y, tuning.world.floorHeightPx),
        state.interactionFocus?.kind === "auction-bid"
          ? state.interactionFocus.targetId
          : null,
      );
  if (auctionStation !== null) {
    out.push({
      kind: "auction-bid",
      targetId: `auction-station-${auctionStation.bidder.id}`,
      at: auctionStation.bidder.stationAt,
      blockedReason: null,
      progressMs: 0,
      durationMs: 0,
      retainedMs: 0,
    });
  }

  // 발코니의 줄 던지기는 이 자리에서 E 가 뜻하는 유일한 행동이다. 몸을 끌고 있는
  // 동안에는 손이 비지 않으므로 내보내지 않는다.
  const parkourRoute = state.bodyDrag.targetId === null
    ? throwableRoute(layout, player, tuning.parkour.departureReachPx)
    : null;
  if (parkourRoute !== null) {
    out.push({
      kind: "parkour",
      targetId: parkourRoute.id,
      at: grabFeet(parkourRoute),
      blockedReason: state.stamina.value <= 0 ? "depleted" : null,
      progressMs: 0,
      durationMs: 0,
      retainedMs: 0,
    });
  }

  const grappleAffordance = (): InteractionAffordance | null => {
    const anchor = state.bodyDrag.targetId === null ? availableAnchor(layout, player, tuning) : null;
    return anchor === null ? null : {
      kind: "grapple", targetId: anchor.id, at: anchor.at,
      blockedReason: state.stamina.value < tuning.grapple.attachCost ? "depleted" : null,
      progressMs: 0, durationMs: 0, retainedMs: 0,
      current: state.stamina.value, required: tuning.grapple.attachCost,
    };
  };
  // 매달린 동안 E 는 사슬이 통째로 소유한다(`grappleInteraction`). 옮겨 잡을 고리가 보는 쪽에 없으면
  // 아무것도 띄우지 않는다 — 훔치기·제압 안내가 떠도 그 E 는 사슬로 가기 때문이다. 비행 중에는 대상이 없다.
  if (player.grapple !== undefined) {
    const next = grappleAffordance();
    return next === null ? [] : [{ ...next, transfer: true }];
  }
  // 공중에서는 고리가 E 의 첫 뜻이다. 지면에서는 머리 위 고리가 문·전리품·은신처를 가로채지
  // 않도록 맨 끝에서 찾는다. 사다리 잡기만은 예외다 — 사다리는 ↑/↓ 로도 타지만 고리는 E 로만 걸린다.
  // 블랙손 발코니는 배수관 꼭대기 위라서 이 예외가 없으면 첫 고리가 영영 E 를 받지 못했다(2026-10-01).
  const airborneGrapple = player.onGround ? null : grappleAffordance();
  if (airborneGrapple !== null) out.push(airborneGrapple);

  const activeBody = state.bodyDrag.targetId === null
    ? null
    : state.guards.find((guard) => guard.id === state.bodyDrag.targetId && canBeDragged(guard)) ?? null;
  const body = activeBody ?? bodyDragCandidate(
    state.guards,
    player,
    tuning,
    focusedTargetId(state, "body-drag"),
  );
  if (body !== null) {
    out.push({
      kind: "body-drag",
      targetId: body.id,
      at: { x: body.x, y: body.y },
      blockedReason: state.stamina.value <= 0 ? "depleted" : null,
      progressMs: 0,
      durationMs: 0,
      retainedMs: 0,
    });
  }

  const guardTarget = guardInteractionTarget(state, tuning);
  const pickpocket = guardTarget?.kind === "pickpocket" ? guardTarget.guard : null;
  if (pickpocket !== null) {
    out.push({
      kind: "pickpocket",
      targetId: pickpocket.id,
      at: { x: pickpocket.x, y: pickpocket.y },
      blockedReason: null,
      progressMs: state.pickpocket.targetId === pickpocket.id ? state.pickpocket.progressMs : 0,
      durationMs: tuning.guard.pickpocketMs,
      retainedMs: 0,
    });
  }

  const subdue = guardTarget?.kind === "subdue" ? guardTarget.guard : null;
  if (subdue !== null) {
    out.push({
      kind: "subdue",
      targetId: subdue.id,
      at: { x: subdue.x, y: subdue.y },
      blockedReason: null,
      progressMs: state.subdue.targetId === subdue.id ? state.subdue.progressMs : 0,
      durationMs: tuning.guard.subdueMs,
      retainedMs: 0,
    });
  }

  const exit = interactionExitAt(layout, at, tuning, focusedTargetId(state, "escape"));
  if (exit !== null) {
    const ratio = loadRatio(state.carry, tuning);
    const closed = state.run.closedExits.includes(exit.id);
    const objectiveComplete = hasRequiredArtifact(state.run, layout);
    out.push({
      kind: "escape",
      targetId: exit.id,
      at: { x: exit.rect.x + exit.rect.w / 2, y: exit.rect.y + exit.rect.h / 2 },
      blockedReason: !objectiveComplete
        ? "objective"
        : isExitUsable(exit, ratio, state.run.closedExits)
          ? null
          : closed
            ? "closed"
            : "load-limit",
      progressMs: 0,
      durationMs: 0,
      retainedMs: 0,
      current: ratio,
      required: exit.loadLimit,
    });
  }

  const activeAnchor = state.run.grabbingAnchorId === null
    ? null
    : layout.lootAnchors.find((entry) => entry.id === state.run.grabbingAnchorId) ?? null;
  const auctionLockedAnchorIds = state.auction !== null && layout.auction !== undefined
    ? lockedAuctionAnchorIds(state.auction, layout.auction)
    : [];
  const unavailableAnchorIds = [...unavailableLootAnchorIds(state.run), ...auctionLockedAnchorIds];
  const anchor = activeAnchor ?? nearestAnchor(
    at,
    unavailableAnchorIds,
    layout,
    tuning,
    focusedTargetId(state, "steal"),
  );
  if (anchor !== null) {
    const def = lootDef(anchor.lootId);
    const skillRequired = effectiveSkillRequired(
      def,
      state.pickpocket.vaultCode,
      anchor.skillRequiredOverride,
    );
    const skillBlocked = state.run.skill < skillRequired;
    const capacityBlocked = !canPickUp(state.carry, def.weight, tuning);
    out.push({
      kind: "steal",
      targetId: anchor.id,
      at: anchor.at,
      blockedReason: skillBlocked ? "skill" : capacityBlocked ? "capacity" : null,
      progressMs: state.run.grabbingAnchorId === anchor.id ? state.run.grabMs : 0,
      durationMs: stealDurationMs(def, tuning),
      retainedMs: state.run.grabProgress[anchor.id] ?? 0,
      current: skillBlocked ? state.run.skill : capacityBlocked ? totalWeight(state.carry) : undefined,
      required: skillBlocked
        ? skillRequired
        : capacityBlocked
          ? tuning.carry.maxWeight * tuning.carry.overloadRatio
          : undefined,
    });
  }

  if (player.hideSpotId !== null) {
    const spot = layout.hideSpots.find((entry) => entry.id === player.hideSpotId);
    out.push({
      kind: "reveal",
      targetId: player.hideSpotId,
      at: spot === undefined ? at : centerOf(spot.rect),
      blockedReason: null,
      progressMs: 0,
      durationMs: 0,
      retainedMs: 0,
    });
  } else {
    const spot = hideSpotAt(layout, reach, focusedTargetId(state, "hide"));
    if (spot !== null) {
      out.push({
        kind: "hide",
        targetId: spot.id,
        at: centerOf(spot.rect),
        blockedReason: null,
        progressMs: 0,
        durationMs: 0,
        retainedMs: 0,
      });
    }
  }

  const vent = linkAtPreferred(layout, reach, "vent", focusedTargetId(state, "vent"));
  if (vent !== null && vent.exit !== undefined) {
    const ratio = loadRatio(state.carry, tuning);
    out.push({
      kind: "vent",
      targetId: vent.id,
      at: centerOf(vent.rect),
      blockedReason: isLinkLocked(vent, state.pickpocket.areaKey)
        ? "locked"
        : vent.loadLimit !== undefined && ratio >= vent.loadLimit
          ? "load-limit"
          : null,
      progressMs: player.ventLinkId === vent.id ? player.ventProgressMs : 0,
      durationMs: ventTravelMs(vent, tuning),
      retainedMs: 0,
      current: ratio,
      required: vent.loadLimit,
    });
  }

  const ladder = player.climbLinkId === null
    ? linkAtPreferred(layout, reach, "ladder", focusedTargetId(state, "climb"))
    : layout.links.find((entry) => entry.id === player.climbLinkId) ?? null;
  if (ladder !== null) {
    out.push({
      kind: "climb",
      targetId: ladder.id,
      at: centerOf(ladder.rect),
      blockedReason: null,
      progressMs: 0,
      durationMs: 0,
      retainedMs: 0,
    });
  }

  const mischiefHandAction = mischiefHandActionOf(state.mischief);
  const caperActivity = caperActivityOf(state.caper);
  // 실제 입력 중재와 같이 진행 중 손 행동이 새 R 후보보다 우선한다.
  // 연쇄 재생은 손을 놓지만 재생 중 다른 연쇄 루트를 새로 준비할 수는 없다.
  const caper = mischiefHandAction === "idle" && caperActivity !== "playing"
    ? caperRootAt(
        layout,
        at,
        interactionReachPx(tuning.mischief.reachPx, tuning),
        unavailableAnchorIds,
        state.caper.triggeringRootId ?? focusedTargetId(state, "caper"),
      )
    : null;
  const caperReady = caper !== null && !state.caper.triggeredDeviceIds.includes(caper.device.id);
  if (caperReady && caper !== null) {
    out.push({
      kind: "caper",
      targetId: caper.device.id,
      at: caper.device.triggerAt,
      blockedReason: null,
      progressMs: state.caper.triggeringRootId === caper.device.id ? state.caper.triggerMs : 0,
      durationMs: isExhibitionMechanism(layout, caper.device.id) ? 0 : tuning.mischief.chandelierHoldMs,
      retainedMs: 0,
    });
  }

  const hazard = caperReady || mischiefHandAction === "snuffing" || mischiefHandAction === "throwing"
    ? null
    : environmentHazardAt(
        layout,
        at,
        interactionReachPx(tuning.mischief.reachPx, tuning),
        unavailableAnchorIds,
        state.mischief.triggeringHazardId ?? focusedTargetId(state, "environment"),
      );
  if (hazard !== null && !state.mischief.triggeredHazards.includes(hazard.id)) {
    out.push({
      kind: "environment",
      targetId: hazard.id,
      at: hazard.triggerAt,
      blockedReason: null,
      progressMs: state.mischief.triggeringHazardId === hazard.id ? state.mischief.hazardMs : 0,
      durationMs: tuning.mischief.chandelierHoldMs,
      retainedMs: 0,
    });
  }

  const lamp = !caperReady
    && hazard === null
    && mischiefHandAction !== "hazard"
    && mischiefHandAction !== "throwing"
    ? snuffableLampAt(
        layout,
        at,
        interactionReachPx(tuning.mischief.reachPx, tuning),
        state.mischief.snuffingLampId ?? focusedTargetId(state, "snuff"),
      )
    : null;
  if (lamp !== null && !state.mischief.snuffedLamps.includes(lamp.id)) {
    out.push({
      kind: "snuff",
      targetId: lamp.id,
      at: lamp.at,
      blockedReason: null,
      progressMs: state.mischief.snuffingLampId === lamp.id ? state.mischief.snuffMs : 0,
      durationMs: tuning.mischief.snuffMs,
      retainedMs: 0,
    });
  }

  const groundGrapple = player.onGround && out.every((affordance) => affordance.kind === "climb") ? grappleAffordance() : null;
  if (groundGrapple !== null) out.push(groundGrapple);
  return out;
}

const PRIORITY: Readonly<Record<InteractionKind, number>> = {
  // 도하 발코니는 전용 발판이라 여기서 E 는 줄 던지기 하나만 뜻한다. 같은 누름이
  // 훔치기·제압으로도 새지 않도록 최우선으로 둔다.
  parkour: -1,
  grapple: -1,
  "body-drag": 0,
  pickpocket: 1,
  subdue: 2,
  // F 은신은 즉시 안전해지는 별도 동사다. 같은 자리에 E 전리품이 있어도
  // 은신처 자체가 먼저 읽혀야 발각 직전 선택지로 기능한다.
  hide: 3,
  reveal: 3,
  "auction-bid": 4,
  environment: 4,
  caper: 4,
  escape: 5,
  steal: 6,
  vent: 8,
  climb: 9,
  snuff: 10,
};

function compareAffordance(a: InteractionAffordance, b: InteractionAffordance): number {
  const aActive = a.progressMs > 0 ? 0 : 1;
  const bActive = b.progressMs > 0 ? 0 : 1;
  return aActive - bActive || PRIORITY[a.kind] - PRIORITY[b.kind];
}

export function interactionFocusOf(
  state: InteractionSnapshot,
  layout: MansionLayout,
  tuning: Tuning,
): InteractionFocus | null {
  const primary = primaryInteractionAffordance(state, layout, tuning);
  return primary === null ? null : { kind: primary.kind, targetId: primary.targetId };
}

/**
 * The guard E pickpockets — else subdues — now: the one this frame's prompt focused first (`interactionFocus`, as `simulation` hands the
 * rules), else the nearest that qualifies. The guard view's target ring reads this same pick, so the ring always sits on the guard E takes.
 */
export function guardInteractionTarget(state: InteractionSnapshot, tuning: Tuning)
  : { readonly kind: "pickpocket" | "subdue"; readonly guard: GuardState } | null {
  const actor = { at: { x: state.player.x, y: state.player.y }, hidden: state.player.hideSpotId !== null };
  const pickpocket = pickpocketCandidate(state.guards, actor, state.pickpocket, tuning, focusedTargetId(state, "pickpocket"));
  if (pickpocket !== null) return { kind: "pickpocket", guard: pickpocket };
  const subdue = subdueCandidate(state.guards, actor, tuning, state.subdue.targetId ?? focusedTargetId(state, "subdue"));
  return subdue === null ? null : { kind: "subdue", guard: subdue };
}

function focusedTargetId(state: InteractionSnapshot, kind: InteractionKind): string | null {
  return state.interactionFocus?.kind === kind ? state.interactionFocus.targetId : null;
}

function centerOf(rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }): Vec2 {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
