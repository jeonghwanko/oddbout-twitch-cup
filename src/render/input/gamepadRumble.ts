/**
 * 연결된 패드의 짧은 이중 진동(Gamepad `vibrationActuator.playEffect("dual-rumble")`). 지원하지 않는 브라우저·패드·권한 거부는
 * 조용히 아무것도 하지 않는다 — 진동은 손맛 보조일 뿐이다.
 */

export interface GamepadRumbleSpec { readonly durationMs: number; readonly strong: number; readonly weak: number }

interface RumbleActuatorLike {
  readonly effects?: readonly string[];
  playEffect?(type: string, params: { duration: number; startDelay: number; strongMagnitude: number; weakMagnitude: number }): unknown;
}
interface RumblePadLike { readonly connected?: boolean; readonly vibrationActuator?: RumbleActuatorLike | null }

function browserPads(): readonly (RumblePadLike | null)[] {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return [];
  try { return Array.from(navigator.getGamepads() as unknown as ArrayLike<RumblePadLike | null>); } catch { return []; }
}

/** Plays `spec` on the first connected pad that can rumble. True when a rumble was requested. */
export function playGamepadRumble(spec: GamepadRumbleSpec, pads: readonly (RumblePadLike | null)[] = browserPads()): boolean {
  const clamp = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  const duration = Math.max(0, Math.round(spec.durationMs));
  if (duration <= 0) return false;
  for (const pad of pads) {
    const actuator = pad?.connected === false ? null : pad?.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== "function") continue;
    if (Array.isArray(actuator.effects) && !actuator.effects.includes("dual-rumble")) continue;
    try {
      const done = actuator.playEffect("dual-rumble", { duration, startDelay: 0, strongMagnitude: clamp(spec.strong), weakMagnitude: clamp(spec.weak) });
      if (done && typeof (done as Promise<unknown>).catch === "function") (done as Promise<unknown>).catch(() => undefined);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
