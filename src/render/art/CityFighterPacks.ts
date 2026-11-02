import type { CityTournamentArt } from "../../app/CityTournamentBouts";
import { CITY_FIGHTERS, cityFighterRules } from "../../sim/cityFight/CityFighters";
import type { NativeCityKumaArtBridge } from "../../sim/cityFight/NativeCityKumaFighter";
import { kumaFrameSpec, kumaWalkPace, nativeCityKumaArtBridge } from "./NativeCityKumaArt";
import { loadNativeCityKumaSkinPack } from "./NativeCityKumaSkin";
import type { NativeCityOrthoPack } from "./NativeCityOrthoPack";

/**
 * The village fighters' runtime packs by actor id, loaded once (2026-10-18): KUMA's own (a lazy chunk) or a skin's (`NativeCityKumaSkin`).
 * The tournament reads them without a fighter view — the bracket's headless bouts (`cityTournamentBoutResolver`) and the arena's opponent.
 */
const packs = new Map<string, NativeCityOrthoPack | null>();
const requests = new Map<string, Promise<NativeCityOrthoPack | null>>();

export function loadCityFighterPack(id: string): Promise<NativeCityOrthoPack | null> {
  const pending = requests.get(id);
  if (pending) return pending;
  const rules = CITY_FIGHTERS.find(fighter => fighter.actorId === id);
  const request = (rules === undefined ? Promise.resolve(null)
    : rules.skinId === null
      ? import("../../assets/native-city-kuma-ortho-runtime.json").then(module => module.default as unknown as NativeCityOrthoPack)
      : loadNativeCityKumaSkinPack(rules.skinId).then(skinned => skinned?.pack ?? null))
    .catch(() => null)
    .then(pack => { packs.set(id, pack); return pack; });
  requests.set(id, request);
  return request;
}

/** Fighter `id`'s pack once loaded (`loadCityFighterPack`), else null. */
export function cityFighterPack(id: string): NativeCityOrthoPack | null { return packs.get(id) ?? null; }


export function cityFighterArtBridge(id: string, actorHeight: number): NativeCityKumaArtBridge | null {
  const pack = cityFighterPack(id);
  const rules = cityFighterRules(id);
  return pack ? nativeCityKumaArtBridge(pack, kumaWalkPace(pack, actorHeight * rules.plan.bodyScale), kumaFrameSpec(rules.tuning)) : null;
}

/** Every fighter's pack, then the bracket's art (`CityTournamentArt`) at `actorHeight`: a fighter whose pack is missing is judged on ratings. */
export async function loadCityTournamentArt(actorHeight: number): Promise<CityTournamentArt> {
  await Promise.all(CITY_FIGHTERS.map(fighter => loadCityFighterPack(fighter.actorId)));
  const bridges = new Map(CITY_FIGHTERS.map(fighter => [fighter.actorId, cityFighterArtBridge(fighter.actorId, actorHeight)] as const));
  return id => bridges.get(id) ?? null;
}
