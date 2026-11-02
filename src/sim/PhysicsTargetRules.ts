import type { MansionLayout } from "./MansionLayout";
import type { Tuning } from "./tuning";
import type { Facing, Vec2 } from "./GeometryTypes";
import { originY, trace } from "./LineOfFireRules";
import { createEnvironmentPhysics, physicsLayoutFor, propRect } from "./PhysicsProps";
import type { PlayerSimState } from "./MovementRules";
import { traversalStateOf } from "./MovementRules";
import { PROP_PHYSICS_TUNING as P } from "./tuning";
import { rectOverlaps } from "./geom";

/** The same grounded, unobstructed cart side owns focus and walking contact. */
export function walkPushCartTarget(player: PlayerSimState, layout: MansionLayout, tuning: Tuning, gap: number = P.cartFocusGapPx) {
  if (!player.onGround || traversalStateOf(player) !== "free" || player.dodgeMs > 0) return null;
  const state = layout.physicsState ?? createEnvironmentPhysics(layout);
  const candidates = (state?.bodies ?? []).filter(body => {
    const def = layout.physicsProps!.find(p => p.id === body.id)!;
    if (def.kind !== "cart" || Math.abs(body.vx) > P.cartWalkVelocity
      || Math.abs(body.y + def.rect.h / 2 - player.y) > P.cartFloorTolerancePx) return false;
    const distance = Math.abs(body.x - player.x) - def.rect.w / 2 - tuning.movement.bodyWidth / 2;
    return distance >= -P.cartContactGapPx && distance <= gap;
  }).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x));
  const world = physicsLayoutFor(layout, state);
  return candidates.find(body => {
    const def = layout.physicsProps!.find(p => p.id === body.id)!;
    const rect = propRect(def, body);
    const direction = body.x > player.x ? 1 : -1;
    const nextX = body.x + direction * P.cartContactGapPx;
    if (nextX - rect.w / 2 < 0 || nextX + rect.w / 2 > layout.widthPx) return false;
    const solids = world.geometry.filter(g => (g.kind === "solid" || g.kind === "platform") && g.id !== `physics:${body.id}`);
    // Matter rests slightly inside its support slab; exclude that vertical resting tolerance.
    const swept = { x: rect.x + Math.min(0, direction * P.cartContactGapPx), y: rect.y,
      w: rect.w + P.cartContactGapPx, h: rect.h - P.cartFloorTolerancePx };
    if (solids.some(g => rectOverlaps(swept, g.rect))) return false;
    const height = player.pose === "crouch" ? tuning.movement.bodyHeightCrouch : tuning.movement.bodyHeightStand;
    const y = (Math.max(rect.y, player.y - height) + Math.min(player.y, rect.y + rect.h)) / 2;
    return trace({ x: player.x, y }, { x: body.x, y }, { ...world, geometry: solids }).clear;
  }) ?? null;
}

/** 수레 걸기(와이어 개조): 강공격 밀기와 같은 대상 규칙을 와이어 사거리로 넓힌다. */
export function hookPropTarget(at: Vec2, facing: Facing, layout: MansionLayout, tuning: Tuning, rangePx: number) {
  return shovePropTarget(at, facing, layout, tuning, rangePx);
}

export function shovePropTarget(at: Vec2, facing: Facing, layout: MansionLayout, tuning: Tuning,
  reachPx: number = tuning.combat.shoveReachPx) {
  const state = layout.physicsState ?? createEnvironmentPhysics(layout);
  if (!state) return null;
  const world = physicsLayoutFor(layout, state);
  return state.bodies.filter(body => {
    const def = layout.physicsProps!.find(p => p.id === body.id)!;
    if ((body.x - at.x) * facing <= 0
      || Math.abs(body.x - at.x) - def.rect.w / 2 > reachPx
      || Math.abs(body.y + def.rect.h / 2 - at.y) >= tuning.movement.bodyHeightStand) return false;
    const from = { x: at.x, y: originY(at.y, tuning) };
    return trace(from, { x: body.x, y: from.y }, { ...world,
      geometry: world.geometry.filter(g => g.kind === "solid" && g.id !== `physics:${body.id}`) }).clear;
  }).sort((a, b) => Math.abs(a.x - at.x) - Math.abs(b.x - at.x))[0] ?? null;
}
