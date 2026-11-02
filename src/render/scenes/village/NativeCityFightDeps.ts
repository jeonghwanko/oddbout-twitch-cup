import type Phaser from "phaser";
import { declareNativeCityActorSheets } from "../../art/NativeCityActorSheets";
import { phaserFightDeps, type NativeCityFightDeps } from "./PhaserFightDeps";

export type { NativeCityFightAudio, NativeCityFightArt, NativeCityFightDeps } from "./PhaserFightDeps";
export { nativeCityPhaserDrawnFightArt } from "./PhaserFightDeps";

/** Legacy village adapter. The standalone arena imports PhaserFightDeps directly. */
export function nativeCityFightDeps(scene: Phaser.Scene, prepareTexture?: (key: string) => void): NativeCityFightDeps {
  const deps = phaserFightDeps(scene, prepareTexture);
  return { audio: deps.audio, art: { ...deps.art, family: keys => { declareNativeCityActorSheets(scene.game, keys); } } };
}
