import type { Rect } from "./GeometryTypes";
import type { GeometryRect, MansionLayout } from "./MansionLayout";
import { geometryWithoutPhysics } from "./LayoutGeometryMemo";

/** Authored props are serialized in the layout; no physics engine instances enter saves. 수레만 있다. */
export interface PhysicsPropDefinition {
  readonly id: string;
  readonly kind: "cart";
  readonly rect: Rect;
}
export interface PhysicsPropState {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly impactMs: number;
  readonly hitGuardIds: readonly string[];
}
export interface EnvironmentPhysicsState {
  /** Contact drive is released explicitly; a combat shove retains its independent momentum. */
  readonly walkingCartId?: string;
  readonly bodies: readonly PhysicsPropState[];
}
export function createEnvironmentPhysics(layout: MansionLayout): EnvironmentPhysicsState | undefined {
  if (!layout.physicsProps?.length) return undefined;
  return { bodies: layout.physicsProps.map(p => ({ id: p.id, x: p.rect.x + p.rect.w / 2,
    y: p.rect.y + p.rect.h / 2, vx: 0, vy: 0, impactMs: 0, hitGuardIds: [] })) };
}
export function propRect(def: PhysicsPropDefinition, body: PhysicsPropState): Rect {
  return { x: body.x - def.rect.w / 2, y: body.y - def.rect.h / 2, w: def.rect.w, h: def.rect.h };
}
/**
 * 같은 지형 배열·같은 소품 상태에는 같은 결과 배열(한 스텝 안에서 여러 소비자가 다시 부른다).
 * 결과는 소품 정의(def.rect)에도 달려 있어, 정의 배열이 다르면 재사용하지 않는다.
 */
const physicsGeometry = new WeakMap<readonly GeometryRect[], WeakMap<EnvironmentPhysicsState, {
  readonly props: MansionLayout["physicsProps"];
  readonly geometry: readonly GeometryRect[];
}>>();

/** Movement, sight, projectiles and render all consume these exact rectangles. */
export function physicsLayoutFor(layout: MansionLayout, state?: EnvironmentPhysicsState): MansionLayout {
  if (!state) return layout;
  let byState = physicsGeometry.get(layout.geometry);
  if (!byState) { byState = new WeakMap(); physicsGeometry.set(layout.geometry, byState); }
  let memo = byState.get(state);
  if (memo === undefined || memo.props !== layout.physicsProps) {
    memo = { props: layout.physicsProps, geometry: [
      ...geometryWithoutPhysics(layout.geometry),
      ...state.bodies.flatMap(body => {
        const def = layout.physicsProps?.find(p => p.id === body.id);
        return def ? [{ id: `physics:${body.id}`, kind: "solid" as const, rect: propRect(def, body) }] : [];
      }),
    ] };
    byState.set(state, memo);
  }
  return { ...layout, physicsState: state, geometry: memo.geometry };
}
