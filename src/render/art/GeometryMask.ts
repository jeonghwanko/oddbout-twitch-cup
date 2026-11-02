import type Phaser from "phaser";

/** Phaser's Canvas Graphics SetTransform writes alpha/blend before saving the context.
 * GeometryMask invokes it inside batchSprite, after that sprite configured its own blend.
 * Preserve those two values so clipping cannot turn a faint glow into an opaque white patch.
 * WebGL stencil rendering is unchanged.
 */
export function geometryMask(graphics: Phaser.GameObjects.Graphics): Phaser.Display.Masks.GeometryMask {
  const mask = graphics.createGeometryMask();
  const render = mask.preRenderCanvas.bind(mask);
  mask.preRenderCanvas = (renderer, child, camera) => {
    const context = renderer.currentContext;
    const alpha = context.globalAlpha;
    const blend = context.globalCompositeOperation;
    render(renderer, child, camera);
    context.globalAlpha = alpha;
    context.globalCompositeOperation = blend;
  };
  return mask;
}
