import FIGHTERS_JSON from "../../world/native-city-fighters.json";

/**
 * Every village fighter's actor id: KUMA first, then the json's order. `CITY_FIGHTERS` builds its rules in this order. A screen that only
 * names the fighters (the arena's pick screen, `ArenaRoster`) imports this list, not the rules with their whole combat tuning table.
 */
export const CITY_FIGHTER_IDS: readonly string[] = Object.freeze(["kuma", ...Object.keys(FIGHTERS_JSON.fighters)]);
