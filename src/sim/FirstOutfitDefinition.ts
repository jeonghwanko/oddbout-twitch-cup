import content from "./quests/first-outfit.json";
import { definitionError, definitionNumber, definitionObject, definitionOrder, definitionRef, freezeDefinition } from "./QuestDefinitionValidation";

export type FirstOutfitPhase = keyof typeof content.phases;
export type FirstOutfitEventId = keyof typeof content.transitions;
type GoldRef = keyof typeof content.gold;
interface OutfitTransition {
  readonly from: FirstOutfitPhase;
  readonly to: FirstOutfitPhase;
  readonly requires: "male" | "male-with-gold" | "male-with-training";
  readonly gold: GoldRef | null;
  readonly direction: -1 | 0 | 1;
}

// The existing scene emits these semantic events at fixed handoff frontiers.
// A different frontier, guard or payment direction needs its consumer changed too.
const EVENT_CONTRACTS = {
  "see-offer": ["arrived", "offer-seen", "male", 0],
  "sell-clothes": ["offer-seen", "clothes-sold", "male", 1],
  "receive-outfit": ["clothes-sold", "player-equipped", "male-with-gold", -1],
  "accept-commission": ["player-equipped", "commission-accepted", "male", 0],
  "return-music-box": ["commission-accepted", "potion-received", "male-with-training", 1],
  "use-potion": ["potion-received", "commission-completed", "male", 0],
} as const satisfies Record<FirstOutfitEventId, readonly [FirstOutfitPhase, FirstOutfitPhase, OutfitTransition["requires"], OutfitTransition["direction"]]>;

export function parseFirstOutfitDefinition(value: unknown) {
  const root = definitionObject(value, "first-outfit", ["schemaVersion", "phases", "order", "gold", "transitions"]);
  if (root.schemaVersion !== 1) definitionError("first-outfit.schemaVersion", "unsupported version");
  const phases = definitionObject(root.phases, "first-outfit.phases");
  const order = definitionOrder(root.order, Object.keys(content.phases), "first-outfit.order") as FirstOutfitPhase[];
  definitionOrder(Object.keys(phases), order, "first-outfit.phases");
  for (const id of order) definitionObject(phases[id], `first-outfit.phases.${id}`, []);
  const rawGold = definitionObject(root.gold, "first-outfit.gold", Object.keys(content.gold));
  const gold = Object.fromEntries(Object.keys(content.gold).map(id => {
    const amount = definitionNumber(rawGold[id], `first-outfit.gold.${id}`);
    if (!Number.isSafeInteger(amount)) definitionError(`first-outfit.gold.${id}`, "expected safe integer");
    return [id, amount];
  })) as Record<GoldRef, number>;
  const rawTransitions = definitionObject(root.transitions, "first-outfit.transitions", Object.keys(content.transitions));
  const transitions = {} as Record<FirstOutfitEventId, OutfitTransition>;
  const starts = new Set<string>();
  for (const id of Object.keys(content.transitions) as FirstOutfitEventId[]) {
    const path = `first-outfit.transitions.${id}`;
    const transition = definitionObject(rawTransitions[id], path, ["from", "to", "requires", "gold", "direction"]);
    const from = definitionRef(transition.from, order, `${path}.from`), to = definitionRef(transition.to, order, `${path}.to`);
    if (starts.has(from) || order.indexOf(to) !== order.indexOf(from) + 1) definitionError(path, "ambiguous or unreachable branch");
    starts.add(from);
    const requires = definitionRef(transition.requires, ["male", "male-with-gold", "male-with-training"] as const, `${path}.requires`);
    const goldRef = transition.gold === null ? null : definitionRef(transition.gold, Object.keys(gold) as GoldRef[], `${path}.gold`);
    const direction = transition.direction;
    if (direction !== -1 && direction !== 0 && direction !== 1) definitionError(`${path}.direction`, "expected -1, 0 or 1");
    if ((goldRef === null) !== (direction === 0) || (direction === -1) !== (requires === "male-with-gold")) definitionError(path, "inconsistent payment guard");
    const contract = EVENT_CONTRACTS[id];
    if (from !== contract[0] || to !== contract[1] || requires !== contract[2] || direction !== contract[3]) definitionError(path, "incompatible scene event contract");
    transitions[id] = { from, to, requires, gold: goldRef, direction };
  }
  if (starts.size !== order.length - 1) definitionError("first-outfit.transitions", "unreachable phase");
  return freezeDefinition({ order, gold, transitions });
}

export const FIRST_OUTFIT_DEFINITION = parseFirstOutfitDefinition(content);
