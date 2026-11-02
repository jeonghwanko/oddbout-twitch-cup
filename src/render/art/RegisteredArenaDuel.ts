import { createCityFightFighterBout } from "../../sim/cityFight/bout/CityFightFighterBout";
import { registeredDuelSetup } from "./RegisteredDuelRules";
export { registeredDuelCorner } from "./RegisteredDuelRules";
import { registeredArenaDuelReady, registeredArenaPack, registeredArenaStats, registeredArenaStyle } from "./RegisteredArenaFighters";

export function createRegisteredArenaDuel(a: string, b: string, seed: number) {
  if (a === b || !registeredArenaDuelReady(a) || !registeredArenaDuelReady(b)) throw new Error("duel-not-approved");
  const packs = [registeredArenaPack(a)!, registeredArenaPack(b)!] as const;
  const { arena, view, rules, corners } = registeredDuelSetup(a, b, packs, [registeredArenaStats(a)!, registeredArenaStats(b)!],
    [registeredArenaStyle(a), registeredArenaStyle(b)]);
  return { session: createCityFightFighterBout(corners[0], corners[1], arena, rules, seed), packs, arena, view, rules, corners };
}
