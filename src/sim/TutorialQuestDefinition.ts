import { definitionArray, definitionError, definitionNumber, definitionObject, definitionOrder, definitionRef, definitionText, freezeDefinition } from "./QuestDefinitionValidation";
import type { TutorialAction } from "./TutorialRules";

export interface TutorialRequirementDefinition {
  readonly condition: string;
  readonly retry: { readonly text: string; readonly actions: readonly TutorialAction[] };
}
interface TutorialDefinition {
  readonly title: string;
  readonly goal: string;
  readonly checkpoint: { readonly x: number | "warden-approach"; readonly floor: string };
  readonly resetGuardIds?: readonly string[];
  readonly next: string | null;
  readonly objective: {
    readonly reached: string;
    readonly requires: readonly TutorialRequirementDefinition[];
    readonly complete: string;
    readonly stuck?: readonly TutorialRequirementDefinition[];
  };
}
export interface TutorialDefinitionBindings {
  readonly reached: readonly string[];
  readonly conditions: readonly string[];
  readonly floors: readonly string[];
  readonly guards: readonly string[];
}
const ACTIONS: readonly TutorialAction[] = ["left", "right", "up", "down", "run", "jump", "interact", "hide", "whistle", "throw", "snuff", "drop", "thiefEye", "attack", "heavy"];

/** Only named, already implemented predicates are supported. There is no expression language. */
export function parseTutorialQuestDefinitions(value: unknown, bindings: TutorialDefinitionBindings) {
  const root = definitionObject(value, "tutorial", ["schemaVersion", "first", "order", "beats"]);
  if (root.schemaVersion !== 1) definitionError("tutorial.schemaVersion", "unsupported version");
  const beats = definitionObject(root.beats, "tutorial.beats");
  const order = definitionOrder(root.order, bindings.reached, "tutorial.order");
  definitionOrder(Object.keys(beats), order, "tutorial.beats");
  if (root.first !== order[0]) definitionError("tutorial.first", "must be the first reachable beat");
  const parseRequirement = (raw: unknown, path: string): TutorialRequirementDefinition => {
    const req = definitionObject(raw, path, ["condition", "retry"]);
    const retry = definitionObject(req.retry, `${path}.retry`, ["text", "actions"]);
    return { condition: definitionRef(req.condition, bindings.conditions, `${path}.condition`),
      retry: { text: definitionText(retry.text, `${path}.retry.text`), actions: definitionArray(retry.actions, `${path}.retry.actions`)
        .map(action => definitionRef(action, ACTIONS, `${path}.retry.actions`)) } };
  };
  const parsed: Record<string, TutorialDefinition> = {};
  for (const [i, id] of order.entries()) {
    const path = `tutorial.beats.${id}`;
    const beat = definitionObject(beats[id], path, ["title", "goal", "checkpoint", "resetGuardIds", "objective", "next"]);
    if (beat.next !== (order[i + 1] ?? null)) definitionError(`${path}.next`, "unreachable, cyclic or backward branch");
    const checkpoint = definitionObject(beat.checkpoint, `${path}.checkpoint`, ["x", "floor"]);
    const objective = definitionObject(beat.objective, `${path}.objective`, ["reached", "requires", "complete", "stuck"]);
    parsed[id] = { title: definitionText(beat.title, `${path}.title`), goal: definitionText(beat.goal, `${path}.goal`),
      checkpoint: { x: checkpoint.x === "warden-approach" ? checkpoint.x : definitionNumber(checkpoint.x, `${path}.checkpoint.x`),
        floor: definitionRef(checkpoint.floor, bindings.floors, `${path}.checkpoint.floor`) },
      ...(beat.resetGuardIds === undefined ? {} : { resetGuardIds: definitionArray(beat.resetGuardIds, `${path}.resetGuardIds`)
        .map(guard => definitionRef(guard, bindings.guards, `${path}.resetGuardIds`)) }),
      next: beat.next === null ? null : definitionRef(beat.next, order, `${path}.next`),
      objective: { reached: definitionRef(objective.reached, bindings.reached, `${path}.objective.reached`),
        requires: definitionArray(objective.requires, `${path}.objective.requires`).map((r, n) => parseRequirement(r, `${path}.requires[${n}]`)),
        complete: definitionText(objective.complete, `${path}.objective.complete`),
        ...(objective.stuck === undefined ? {} : { stuck: definitionArray(objective.stuck, `${path}.objective.stuck`).map((r, n) => parseRequirement(r, `${path}.stuck[${n}]`)) }) },
    };
  }
  return freezeDefinition({ order, beats: parsed });
}
