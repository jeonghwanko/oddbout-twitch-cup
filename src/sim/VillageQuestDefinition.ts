import content from "./quests/village.json";
import { definitionError, definitionObject, definitionOrder, definitionRef, freezeDefinition } from "./QuestDefinitionValidation";

export type VillageQuestStepId = keyof typeof content.steps;
export type VillageQuestChapterId = keyof typeof content.chapters;
export type VillageQuestTarget = "merchant" | "training" | "clockmaker" | "manor" | "expedition" | "gentleman";
export type VillageQuestObjective = "offer-seen" | "commission-accepted" | "training-completed" | "commission-completed"
  | "clockmaker-introduced" | "turned-away" | "guest-list-ready" | "bird-recovered" | "bird-returned" | "campaign-completed";
interface VillageDefinition {
  readonly after: VillageQuestStepId | null;
  readonly character: "male" | "all";
  readonly chapter: VillageQuestChapterId;
  readonly target: VillageQuestTarget | "remaining-guest-task";
  readonly objective: VillageQuestObjective;
}

export function parseVillageQuestDefinition(value: unknown, objectives: readonly VillageQuestObjective[]) {
  const root = definitionObject(value, "village", ["schemaVersion", "chapters", "order", "steps"]);
  if (root.schemaVersion !== 1) definitionError("village.schemaVersion", "unsupported version");
  const rawChapters = definitionObject(root.chapters, "village.chapters");
  const chapters = definitionOrder(Object.keys(rawChapters), Object.keys(content.chapters), "village.chapters") as VillageQuestChapterId[];
  for (const id of chapters) definitionObject(rawChapters[id], `village.chapters.${id}`, []);
  const rawSteps = definitionObject(root.steps, "village.steps");
  const order = definitionOrder(root.order, Object.keys(content.steps), "village.order") as VillageQuestStepId[];
  definitionOrder(Object.keys(rawSteps), order, "village.steps");
  const steps = {} as Record<VillageQuestStepId, VillageDefinition>;
  for (const [i, id] of order.entries()) {
    const path = `village.steps.${id}`;
    const step = definitionObject(rawSteps[id], path, ["after", "character", "chapter", "target", "objective"]);
    if (step.after !== (order[i - 1] ?? null)) definitionError(`${path}.after`, "unreachable, cyclic or backward prerequisite");
    steps[id] = { after: step.after === null ? null : definitionRef(step.after, order, `${path}.after`),
      character: definitionRef(step.character, ["male", "all"] as const, `${path}.character`),
      chapter: definitionRef(step.chapter, chapters, `${path}.chapter`),
      target: definitionRef(step.target, ["merchant", "training", "clockmaker", "manor", "expedition", "gentleman", "remaining-guest-task"] as const, `${path}.target`),
      objective: definitionRef(step.objective, objectives, `${path}.objective`) };
    if (steps[id].target === "remaining-guest-task" && steps[id].objective !== "guest-list-ready") definitionError(path, "dynamic target requires guest-list objective");
  }
  return freezeDefinition({ order, chapters, steps });
}

export { content as villageQuestContent };
