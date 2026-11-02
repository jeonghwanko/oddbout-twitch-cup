import type { MansionLayout } from "./MansionLayout";
import { floorOfY, floorSurfaceY } from "./MansionLayout";
import { bestEscapeRoute, isExitUsable } from "./RunRules";
import type { Tuning } from "./tuning";
import type { EscapeKind, Facing, SimEvent, Vec2 } from "./types";

export type GrandEscapeBeat = "exposure" | "cascade" | "last-curtain";

export interface GrandEscapeState {
  readonly active: boolean;
  readonly elapsedMs: number;
  readonly beat: GrandEscapeBeat | null;
  readonly beatIndex: 0 | 1 | 2 | 3;
  readonly origin: Vec2 | null;
  /** 현재 봉쇄와 적재에서 실제로 쓸 수 있는 최단 출구. 닫히면 다음 스텝에 다시 고른다. */
  readonly targetExitId: string | null;
  readonly targetAt: Vec2 | null;
  readonly crisisAt: Vec2 | null;
  readonly preparedChainId: string | null;
  readonly finale: { readonly kind: EscapeKind; readonly facing: Facing } | null;
}

export type GrandEscapePhase = "idle" | GrandEscapeBeat | "finale";

export function phaseOf(state: Pick<GrandEscapeState, "active" | "beat" | "finale">): GrandEscapePhase {
  if (state.finale !== null) return "finale";
  if (!state.active) return "idle";
  return state.beat ?? "exposure";
}

export function invariantViolations(state: GrandEscapeState): string[] {
  const violations: string[] = [];
  const phase = phaseOf(state);
  const beatIndex = state.beat === "exposure" ? 1 : state.beat === "cascade" ? 2 : state.beat === "last-curtain" ? 3 : 0;
  if (state.beatIndex !== beatIndex) violations.push("grand escape beat and index disagree");
  if (state.active && state.finale !== null) violations.push("active escape and finale overlap");
  if (state.active && (state.beat === null || state.origin === null)) {
    violations.push("active escape lacks beat or origin");
  }
  if ((phase === "idle" || phase === "finale") && (
    state.beat !== null
    || state.beatIndex !== 0
    || state.origin !== null
    || state.targetExitId !== null
    || state.targetAt !== null
    || state.crisisAt !== null
    || state.preparedChainId !== null
  )) {
    violations.push("inactive escape retains active beat state");
  }
  return violations;
}

export interface GrandEscapeContext {
  readonly playerAt: Vec2;
  readonly playerFloor: number;
  readonly layout: MansionLayout;
  readonly closedExitIds: readonly string[];
  readonly loadRatio: number;
  readonly areaKey?: boolean;
  readonly preparedChainIds: readonly string[];
  readonly tuning: Tuning;
}

const CASCADE_AT_MS = 4_500;
const LAST_CURTAIN_AT_MS = 9_000;

export function createGrandEscape(): GrandEscapeState {
  return {
    active: false,
    elapsedMs: 0,
    beat: null,
    beatIndex: 0,
    origin: null,
    targetExitId: null,
    targetAt: null,
    crisisAt: null,
    preparedChainId: null,
    finale: null,
  };
}

/** 실제 남은 출구와 회수 전에 준비한 연쇄를 읽는 결정론적 3막 탈출. */
export function step(
  state: GrandEscapeState,
  sourceEvents: readonly SimEvent[],
  context: GrandEscapeContext,
  dtMs: number,
): { readonly state: GrandEscapeState; readonly events: readonly SimEvent[] } {
  const events: SimEvent[] = [];
  const alarm = sourceEvents.find((event) => event.kind === "PersonalArtifactAlarmTriggered");
  let next = state;
  const phase = phaseOf(state);

  if (phase === "idle" && alarm?.kind === "PersonalArtifactAlarmTriggered") {
    const route = routeSnapshot(context);
    next = { ...state, active: true, beat: "exposure", beatIndex: 1, origin: alarm.at, elapsedMs: 0, ...route };
    events.push({ kind: "GrandEscapeStarted", at: alarm.at });
    events.push({
      kind: "GrandEscapeBeatChanged",
      beat: "exposure",
      beatIndex: 1,
      at: alarm.at,
      targetExitId: route.targetExitId ?? undefined,
      preparedChainId: route.preparedChainId ?? undefined,
    });
  } else if (phase !== "idle" && phase !== "finale") {
    const currentTarget = context.layout.escapes.find((exit) => exit.id === state.targetExitId);
    const targetStillUsable = currentTarget !== undefined
      && isExitUsable(currentTarget, context.loadRatio, context.closedExitIds);
    const route = targetStillUsable ? {
      targetExitId: state.targetExitId,
      targetAt: state.targetAt,
      crisisAt: state.crisisAt,
      preparedChainId: state.preparedChainId,
    } : routeSnapshot(context);
    const elapsedMs = state.elapsedMs + dtMs;
    next = { ...state, ...route, elapsedMs };
    if (state.beatIndex < 2 && elapsedMs >= CASCADE_AT_MS) {
      next = { ...next, beat: "cascade", beatIndex: 2 };
      const at = route.crisisAt ?? context.playerAt;
      events.push({
        kind: "GrandEscapeBeatChanged", beat: "cascade", beatIndex: 2, at,
        targetExitId: route.targetExitId ?? undefined,
        preparedChainId: route.preparedChainId ?? undefined,
      });
      events.push({
        kind: "NoiseEmitted", at, floor: floorOfY(at.y, context.tuning.world.floorHeightPx), radius: 900, source: "prop",
      });
    } else if (state.beatIndex < 3 && elapsedMs >= LAST_CURTAIN_AT_MS) {
      next = { ...next, beat: "last-curtain", beatIndex: 3 };
      const at = route.targetAt ?? context.playerAt;
      events.push({
        kind: "GrandEscapeBeatChanged", beat: "last-curtain", beatIndex: 3, at,
        targetExitId: route.targetExitId ?? undefined,
        preparedChainId: route.preparedChainId ?? undefined,
      });
      events.push({
        kind: "NoiseEmitted", at, floor: floorOfY(at.y, context.tuning.world.floorHeightPx), radius: 1_400, source: "prop",
      });
    }
  }

  const escaped = sourceEvents.find((event) => event.kind === "PlayerEscaped");
  if (phase !== "finale" && escaped?.kind === "PlayerEscaped") {
    next = {
      ...next,
      active: false,
      elapsedMs: 0,
      beat: null,
      beatIndex: 0,
      origin: null,
      targetExitId: null,
      targetAt: null,
      crisisAt: null,
      preparedChainId: null,
      finale: { kind: escaped.escapeKind, facing: escaped.facing },
    };
    events.push({
      kind: "EscapeFinaleStarted",
      escapeKind: escaped.escapeKind,
      facing: escaped.facing,
      at: escaped.at,
    });
  }
  return { state: next, events };
}

function routeSnapshot(context: GrandEscapeContext): Pick<
  GrandEscapeState,
  "targetExitId" | "targetAt" | "crisisAt" | "preparedChainId"
> {
  const route = bestEscapeRoute(
    context.playerAt,
    context.layout,
    context.loadRatio,
    context.closedExitIds,
    context.tuning,
    [],
    context.areaKey === true,
  );
  const prepared = nearestPreparedChain(context.layout, context.preparedChainIds, route?.at ?? context.playerAt);
  const targetAt = route?.at ?? null;
  const targetFloor = targetAt === null
    ? context.playerFloor
    : floorOfY(targetAt.y, context.tuning.world.floorHeightPx);
  const crisisFloor = Math.round((context.playerFloor + targetFloor) / 2);
  return {
    targetExitId: route?.exit.id ?? null,
    targetAt,
    crisisAt: prepared?.devices[0]?.impactAt ?? {
      x: targetAt === null ? context.playerAt.x : (context.playerAt.x + targetAt.x) / 2,
      y: floorSurfaceY(
        crisisFloor,
        context.tuning.world.floorHeightPx,
        context.tuning.world.slabThicknessPx,
      ),
    },
    preparedChainId: prepared?.id ?? null,
  };
}

function nearestPreparedChain(
  layout: MansionLayout,
  preparedChainIds: readonly string[],
  targetAt: Vec2,
) {
  return (layout.caperChains ?? [])
    .filter((chain) => preparedChainIds.includes(chain.id))
    .slice()
    .sort((a, b) => {
      const aAt = a.devices[0]?.impactAt ?? targetAt;
      const bAt = b.devices[0]?.impactAt ?? targetAt;
      return Math.hypot(aAt.x - targetAt.x, aAt.y - targetAt.y)
        - Math.hypot(bAt.x - targetAt.x, bAt.y - targetAt.y);
    })[0];
}
