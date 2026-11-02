import type { NativeCityOrthoActionClip } from "../art/NativeCityOrthoPack";
import type { DuelWeaponImpactKind } from "./DuelWeaponImpact";


export type NativeCityWeaponImpactKind = DuelWeaponImpactKind;

/** Existing authored move names. A new clip may instead declare keys.impactKind / impactKinds directly. */
// The C1 net is a capture, not a blade (2026-10-17): "sharp" drew a slash crescent and blade comets over it on every contact. Its first
// two contacts are drawn by the net itself (`NativeCityImpactCue.netted`); the last, the shove, is a blunt one.
export const NATIVE_CITY_WEAPON_IMPACTS: Readonly<Record<string, NativeCityWeaponImpactKind>> = Object.freeze({
  wireNet: "blunt", tieFlick: "blunt", tieWhip: "blunt", turnBackKick: "fist",
  ballSwing: "blunt", ballCombo: "blunt", ballSmash: "blunt", rollRise: "blunt",
  bowling: "fist", buttSlam: "fist",
});

const isKind = (value: unknown): value is NativeCityWeaponImpactKind => value === "sharp" || value === "blunt" || value === "fist";
export function nativeCityWeaponImpactKind(clip: Pick<NativeCityOrthoActionClip, "keys"> | null | undefined,
  segment = 0): NativeCityWeaponImpactKind {
  const keys = clip?.keys;
  const declared = Array.isArray(keys?.impactKinds) ? keys.impactKinds[segment] : keys?.impactKind;
  if (isKind(declared)) return declared;
  const move = Array.isArray(keys?.moves) ? keys.moves[segment] : keys?.move;
  return typeof move === "string" ? NATIVE_CITY_WEAPON_IMPACTS[move] ?? "fist" : "fist";
}

export { duelWeaponContactPrims as nativeCityWeaponContactPrims } from "./DuelWeaponImpact";
