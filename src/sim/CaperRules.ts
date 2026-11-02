import { isExhibitionMechanism } from "./ExhibitionRules";
import type { CaperChain, CaperDevice, MansionLayout } from "./MansionLayout";
import { caperRootAt } from "./MansionLayout";
import type { InputFrame, SimEvent, Vec2 } from "./types";
import type { Tuning } from "./tuning";
import { interactionReachPx } from "./InteractionRangeRules";

export interface CaperState {
  readonly triggeredDeviceIds: readonly string[];
  readonly completedChainIds: readonly string[];
  readonly triggeringRootId: string | null;
  readonly triggerMs: number;
  readonly activeChainId: string | null;
  readonly pendingDeviceId: string | null;
  readonly pendingMs: number;
  readonly currentChainLength: number;
  readonly longestChain: number;
  /** 회수 전에 완주해 대탈출 2막에서 다시 쓸 수 있는 연쇄. */
  readonly preparedChainIds: readonly string[];
  /** 한 탈출에서 같은 준비를 두 번 소비하지 않는다. */
  readonly escapeUsedChainIds: readonly string[];
}

/** R 입력을 소유하는 연쇄극 상태. 발동 뒤 연쇄 재생은 플레이어 손을 더 이상 점유하지 않는다. */
export type CaperActivity = "idle" | "arming" | "playing";

export function activityOf(state: Pick<CaperState, "triggeringRootId" | "activeChainId">): CaperActivity {
  if (state.activeChainId !== null) return "playing";
  if (state.triggeringRootId !== null) return "arming";
  return "idle";
}

export function invariantViolations(state: CaperState): string[] {
  const violations: string[] = [];
  if (state.activeChainId !== null && state.triggeringRootId !== null) {
    violations.push("chain playback and root arming overlap");
  }
  if ((state.activeChainId === null) !== (state.pendingDeviceId === null)) {
    violations.push("active chain and pending device must transition together");
  }
  if (state.triggeringRootId === null && state.triggerMs !== 0) {
    violations.push("root progress exists without an armed root");
  }
  if (state.pendingDeviceId === null && state.pendingMs !== 0) {
    violations.push("pending delay exists without a pending device");
  }
  if (state.activeChainId === null && state.currentChainLength !== 0) {
    violations.push("chain length exists without active playback");
  }
  return violations;
}

function normalizeActivity(state: CaperState): CaperState {
  if (state.activeChainId !== null) {
    return { ...state, triggeringRootId: null, triggerMs: 0 };
  }
  if (state.triggeringRootId !== null) {
    return {
      ...state,
      activeChainId: null,
      pendingDeviceId: null,
      pendingMs: 0,
      currentChainLength: 0,
    };
  }
  return {
    ...state,
    triggerMs: 0,
    pendingDeviceId: null,
    pendingMs: 0,
    currentChainLength: 0,
  };
}

export interface CaperContext {
  readonly at: Vec2;
  readonly floor: number;
  readonly collectedAnchorIds: readonly string[];
  readonly preferredInteractionTargetId?: string | null;
}

export interface CaperResult {
  readonly state: CaperState;
  readonly events: readonly SimEvent[];
  /** true면 이번 스텝의 R 입력은 연쇄극이 소유한다. */
  readonly ownsSnuffInput: boolean;
}

export function createCaper(): CaperState {
  return {
    triggeredDeviceIds: [],
    completedChainIds: [],
    triggeringRootId: null,
    triggerMs: 0,
    activeChainId: null,
    pendingDeviceId: null,
    pendingMs: 0,
    currentChainLength: 0,
    longestChain: 0,
    preparedChainIds: [],
    escapeUsedChainIds: [],
  };
}

export function cancelRoot(state: CaperState): CaperState {
  return { ...state, triggeringRootId: null, triggerMs: 0 };
}

/** 대탈출 2막은 플레이어가 미리 완주한 연쇄만 다시 기동한다. */
export function reactivatePrepared(
  state: CaperState,
  layout: MansionLayout,
  chainId?: string,
): { readonly state: CaperState; readonly events: readonly SimEvent[] } {
  if (state.activeChainId !== null) return { state, events: [] };
  const available = state.preparedChainIds.filter((id) => !state.escapeUsedChainIds.includes(id) && layout.caperChains?.some(c => c.id === id && c.reusableOnEscape !== false));
  const selectedId = chainId !== undefined && available.includes(chainId) ? chainId : available[0];
  const chain = (layout.caperChains ?? []).find((entry) => entry.id === selectedId);
  if (chain === undefined) return { state, events: [] };
  const deviceIds = new Set(chain.devices.map((device) => device.id));
  const at = chain.devices[0]?.triggerAt ?? { x: 0, y: 0 };
  return {
    state: {
      ...state,
      // 이미 떨어진 소품을 다시 세우는 것이 아니라 탈출용 예비 와이어가 같은 판정을 재생한다.
      triggeredDeviceIds: state.triggeredDeviceIds.filter((id) => !deviceIds.has(id)),
      activeChainId: chain.id,
      pendingDeviceId: chain.rootDeviceId,
      pendingMs: 180,
      triggeringRootId: null,
      triggerMs: 0,
      currentChainLength: 0,
      escapeUsedChainIds: [...state.escapeUsedChainIds, chain.id],
    },
    events: [{ kind: "CaperChainReactivated", chainId: chain.id, at }],
  };
}

export function step(
  state: CaperState,
  input: InputFrame,
  ctx: CaperContext,
  layout: MansionLayout,
  tuning: Tuning,
  dtMs: number,
): CaperResult {
  const events: SimEvent[] = [];
  let next = { ...normalizeActivity(state) };

  // 시작된 연쇄는 플레이어 위치나 추가 입력과 무관하게 고정 시간으로 끝까지 간다.
  if (next.activeChainId !== null && next.pendingDeviceId === null) {
    // 손상된 저장을 정상 완주로 인정하면 준비 보상을 공짜로 만든다. 조용히 취소한다.
    next = cancelPlayback(next);
  } else if (next.activeChainId !== null && next.pendingDeviceId !== null) {
    const chain = findChain(layout, next.activeChainId);
    const device = chain?.devices.find((entry) => entry.id === next.pendingDeviceId);
    if (chain === null || device === undefined) {
      next = cancelPlayback(next);
    } else {
      const remaining = next.pendingMs - dtMs;
      if (remaining > 0) {
        next.pendingMs = remaining;
      } else {
        next = triggerDevice(next, chain, device, events);
      }
    }
  }

  const candidate = caperRootAt(
    layout,
    ctx.at,
    interactionReachPx(tuning.mischief.reachPx, tuning),
    ctx.collectedAnchorIds,
    next.triggeringRootId ?? ctx.preferredInteractionTargetId ?? null,
  );
  const rootAvailable = candidate !== null && !next.triggeredDeviceIds.includes(candidate.device.id);
  const continuing = candidate !== null && next.triggeringRootId === candidate.device.id;
  const ownsSnuffInput = next.activeChainId === null
    && rootAvailable
    && (input.snuffHold || input.snuffPressed);

  if (
    next.activeChainId === null &&
    input.snuffHold &&
    rootAvailable &&
    candidate !== null &&
    (input.snuffPressed || continuing)
  ) {
    const progress = continuing ? next.triggerMs + dtMs : dtMs;
    if (isExhibitionMechanism(layout, candidate.device.id) || progress >= tuning.mischief.chandelierHoldMs) {
      next = triggerDevice(
        { ...next, triggeringRootId: null, triggerMs: 0, activeChainId: candidate.chain.id },
        candidate.chain,
        candidate.device,
        events,
      );
    } else {
      next.triggeringRootId = candidate.device.id;
      next.triggerMs = progress;
    }
  } else if (next.triggeringRootId !== null) {
    next.triggeringRootId = null;
    next.triggerMs = 0;
  }

  return { state: next, events, ownsSnuffInput };
}

function triggerDevice(
  state: CaperState,
  chain: CaperChain,
  device: CaperDevice,
  events: SimEvent[],
): CaperState {
  if (state.triggeredDeviceIds.includes(device.id)) return state;
  const length = state.currentChainLength + 1;
  events.push({
    kind: "CaperDeviceTriggered",
    chainId: chain.id,
    deviceId: device.id,
    deviceKind: device.kind,
    chainIndex: length,
    from: device.visualAt,
    at: device.impactAt,
  });
  events.push({
    kind: "NoiseEmitted",
    at: device.impactAt,
    floor: device.floor,
    radius: device.noiseRadiusPx,
    source: "prop",
  });

  const base: CaperState = {
    ...state,
    activeChainId: chain.id,
    triggeredDeviceIds: [...state.triggeredDeviceIds, device.id],
    currentChainLength: length,
  };
  if (device.nextId === undefined) return finishChain(base, events, device.impactAt, chain.reusableOnEscape !== false);
  const following = chain.devices.find((entry) => entry.id === device.nextId);
  if (following === undefined) return finishChain(base, events, device.impactAt, chain.reusableOnEscape !== false);
  return { ...base, pendingDeviceId: following.id, pendingMs: following.delayMs };
}

function finishChain(state: CaperState, events: SimEvent[], at: Vec2, reusable: boolean): CaperState {
  const firstCompletion = state.activeChainId !== null && !state.completedChainIds.includes(state.activeChainId);
  if (firstCompletion && state.activeChainId !== null) {
    events.push({ kind: "CaperChainCompleted", chainId: state.activeChainId, length: state.currentChainLength, at });
    if (reusable) events.push({ kind: "CaperChainPrepared", chainId: state.activeChainId, at });
  }
  return {
    ...state,
    completedChainIds: state.activeChainId === null || state.completedChainIds.includes(state.activeChainId)
      ? state.completedChainIds
      : [...state.completedChainIds, state.activeChainId],
    longestChain: Math.max(state.longestChain, state.currentChainLength),
    preparedChainIds: reusable && firstCompletion && state.activeChainId !== null
      ? [...state.preparedChainIds, state.activeChainId]
      : state.preparedChainIds,
    activeChainId: null,
    pendingDeviceId: null,
    pendingMs: 0,
    currentChainLength: 0,
  };
}

function cancelPlayback(state: CaperState): CaperState {
  return {
    ...state,
    activeChainId: null,
    pendingDeviceId: null,
    pendingMs: 0,
    currentChainLength: 0,
  };
}

function findChain(layout: MansionLayout, id: string): CaperChain | null {
  return (layout.caperChains ?? []).find((chain) => chain.id === id) ?? null;
}
