import { nativeCityExchangeZoomFrame } from "../../effects/NativeCityExchangeZoom";

/** A camera frame: zoom and centre (world px). */
interface FightCameraFrame { readonly zoom: number; readonly centerX: number; readonly centerY: number }


export function nativeCityFightZoomFrame<F extends FightCameraFrame>(frame: F, fightZoom: number, player: readonly [number, number], body: number,
  foe: { readonly feet: readonly [number, number]; readonly bodyScale: number } | null, width: number, height: number): F {
  if (!(fightZoom > 1)) return frame;
  const bodies: (readonly [number, number])[] = [player, [player[0], player[1] - body]];
  if (foe) bodies.push(foe.feet, [foe.feet[0], foe.feet[1] - body * foe.bodyScale]);
  return { ...frame, ...nativeCityExchangeZoomFrame(frame, fightZoom, bodies, width, height) };
}

/**
 * A blow's camera kick (`NativeCityImpactFeel`, never under reduced motion): a nudge and shake along the blow (CSS px, at this frame's zoom)
 * and a micro zoom pulse, on top of the fit and the fight zoom. `cssPerCanvasPx`: the game canvas's CSS scale.
 */
export function nativeCityImpactKickFrame<F extends FightCameraFrame>(frame: F,
  kick: { readonly dx: number; readonly dy: number; readonly zoom: number } | null, cssPerCanvasPx: number): F {
  if (!kick || (kick.dx === 0 && kick.dy === 0 && kick.zoom === 1)) return frame;
  const world = 1 / Math.max(1e-6, cssPerCanvasPx * frame.zoom);
  return { ...frame, centerX: frame.centerX + kick.dx * world, centerY: frame.centerY + kick.dy * world, zoom: frame.zoom * kick.zoom };
}
