import type Phaser from "phaser";
import type { GameRoute } from "../../app/GameFlow";

/** Standalone battle hosts never load site scenes. */
export function startRoute(scene: Phaser.Scene, route: GameRoute): void {
  if (!scene.game.scene.getScene(route.scene)) return;
  if ("data" in route) scene.scene.start(route.scene, route.data);
  else scene.scene.start(route.scene);
}
