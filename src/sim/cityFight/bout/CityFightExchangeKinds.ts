/**
 * The exchange set pieces' kinds (2026-10-25 교전 패턴 — `CityFightBoutExchange`, `world/city-fight-exchanges.json`): `cross` 교차 돌파 — the two
 * run through each other, side to side; `pinball` 로프 핀볼 — a heavy blow throws the other into the rope, and each time it throws him back
 * the striker sends him into it again; `rush` 러시 맞대결 — two swings meeting break into string against string where they stand, until one
 * breaks through. Its own leaf: the tournament's config reads it without the fight engine.
 */
export const CITY_FIGHT_EXCHANGE_KINDS = Object.freeze(["cross", "pinball", "rush"] as const);
export type CityFightExchangeKind = (typeof CITY_FIGHT_EXCHANGE_KINDS)[number];
