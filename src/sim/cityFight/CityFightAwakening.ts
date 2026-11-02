import AWAKENINGS_JSON from "../../world/city-fight-awakenings.json";
import type { CityPoint } from "../../world/NativeCityDefinition";
import type { VillageFacing } from "../VillageFacing";
import type { NativeCityJsonShape, NativeCityMeleeTier } from "./NativeCityCombatTuning";




export type CityFightAwakeningStaging = string;

/** A staging drawn round the follow-up's blows (it needs the rules' follow-up — `followUp`); the others are drawn round the contact. */
export const CITY_FIGHT_FOLLOW_UP_STAGINGS: readonly CityFightAwakeningStaging[] = Object.freeze(["starfall"]);

/**
 * A follow-up blow's kind: `hold` a blow on him standing that holds him there (its `holdMs` flinch — a rush, before any launch); `launch`
 * throws him up whatever he was doing; `air` an air hit that keeps him up (past the juggle's limit — it is the super's); `spike` drives him
 * down to bounce into the knockdown; `down` a blow on him lying there.
 */
export type CityFightFollowUpBeatKind = "hold" | "launch" | "air" | "spike" | "down";

export interface CityFightFollowUpBeat {
  readonly kind: CityFightFollowUpBeatKind;
  /** Fight ms after the super's contact (null: the `down` beat — once he lies down). */
  readonly atMs: number | null;
  /** Its share of the super's damage. */
  readonly share: number;
  /** Its freeze (fight ms): the village's rules freeze; the bout's screen holds its clock. */
  readonly hitStopMs: number;
  readonly poise: number;
  /** An `air` beat's lift (body heights — `KumaCombatHitOptions.airLift`); null: the juggle's own. */
  readonly liftBodies: number | null;
  /** A `hold` beat's flinch (fight ms — past the next beat); 0 for the others. */
  readonly holdMs: number;
}

export interface CityFightFollowUp {
  readonly id: string;
  /** The super's own contact's share of its damage; that contact holds him (`holdMs` of flinch, no launch). */
  readonly contactShare: number;
  readonly holdMs: number;
  /** In order: the timed beats, then the `down` beat if any. */
  readonly beats: readonly CityFightFollowUpBeat[];
  /** The `down` beat's wait: `afterDownMs` lying down, not past `maxWaitMs` after the last timed beat. Null: none. */
  readonly down: { readonly afterDownMs: number; readonly maxWaitMs: number } | null;

  readonly opensOnFirst: boolean;
}

export interface CityFightAwakening {
  /** The character's id. */
  readonly id: string;
  /** Its name's i18n key (`village.fightSuper.*`). */
  readonly name: string;
  readonly staging: CityFightAwakeningStaging | null;
  readonly followUp: CityFightFollowUp | null;
}

interface FollowUpBeatJson {
  readonly kind: CityFightFollowUpBeatKind;
  readonly atMs?: number;
  readonly count?: number;
  readonly everyMs?: number;
  readonly afterDownMs?: number;
  readonly maxWaitMs?: number;
  readonly share: number;
  readonly hitStopMs: number;
  readonly poise?: number;
  readonly liftBodies?: number;
  readonly holdMs?: number;
}

interface AwakeningsJson {
  readonly note: string;
  readonly followUps: Readonly<Record<string, { readonly note?: string; readonly contactShare: number; readonly holdMs: number;
    readonly opensOn?: "first" | "last"; readonly beats: readonly FollowUpBeatJson[] }>>;
  readonly characters: Readonly<Record<string, { readonly name: string; readonly staging?: CityFightAwakeningStaging; readonly followUp?: string }>>;
}

const JSON_DATA = AWAKENINGS_JSON satisfies NativeCityJsonShape<AwakeningsJson> as unknown as AwakeningsJson;
const KINDS: readonly CityFightFollowUpBeatKind[] = ["hold", "launch", "air", "spike", "down"];

/** A follow-up as the json writes it (`world/city-fight-awakenings.json` `followUps`). */
export type CityFightFollowUpJson = AwakeningsJson["followUps"][string];

/** A follow-up from its json (its `air` and `hold` runs flattened to one beat each), checked: an invalid one throws (a wiring error). */
export function cityFightFollowUpFromJson(id: string, raw: CityFightFollowUpJson): CityFightFollowUp {
  const fail = (why: string): never => { throw new Error(`city fight awakening "${id}": ${why}`); };
  const beats: CityFightFollowUpBeat[] = [];
  let down: CityFightFollowUp["down"] = null, last = -Infinity, launched = false;
  for (const beat of raw.beats) {
    if (!KINDS.includes(beat.kind)) fail(`unknown beat ${beat.kind}`);
    if (down) fail("a beat after the down beat");
    if (!(beat.share >= 0) || !(beat.hitStopMs >= 0)) fail("a beat's share and freeze are not negative");
    const poise = beat.poise ?? 0;
    if (beat.kind === "down") {
      if (!(beat.afterDownMs! >= 0) || !(beat.maxWaitMs! > 0)) fail("the down beat needs afterDownMs and maxWaitMs");
      down = { afterDownMs: beat.afterDownMs!, maxWaitMs: beat.maxWaitMs! };
      beats.push(Object.freeze({ kind: "down", atMs: null, share: beat.share, hitStopMs: beat.hitStopMs, poise, liftBodies: null, holdMs: 0 }));
      continue;
    }
    // A body is struck in the air only once a beat has thrown him up; a held one only before.
    if (beat.kind === "launch") launched = true;
    else if (beat.kind === "hold") { if (launched) fail("a hold after a launch"); }
    else if (!launched) fail(`${beat.kind} before a launch`);
    if (beat.kind === "hold" && !(beat.holdMs! > 0)) fail("a hold beat needs holdMs");
    const count = beat.count ?? 1, every = beat.everyMs ?? 0;
    if (!Number.isInteger(count) || count < 1 || count > 1 && !(every > 0)) fail("a run needs count ≥ 1 and everyMs");
    for (let i = 0; i < count; i++) {
      const atMs = beat.atMs! + i * every;
      if (!(atMs >= last)) fail("the timed beats are out of order");
      last = atMs;
      beats.push(Object.freeze({ kind: beat.kind, atMs, share: beat.share, hitStopMs: beat.hitStopMs, poise,
        liftBodies: beat.kind === "air" ? beat.liftBodies ?? null : null, holdMs: beat.kind === "hold" ? beat.holdMs! : 0 }));
    }
  }
  if (!(raw.contactShare >= 0) || !(raw.holdMs > 0)) fail("contactShare and holdMs");
  // He stands held until the next blow: the contact's hold and each hold beat's last past the beat after them (frozen time aside).
  const timed = beats.filter(beat => beat.atMs !== null);
  if (timed[0] && !(raw.holdMs > timed[0].atMs!)) fail("the contact's hold ends before the first beat");
  timed.forEach((beat, i) => {
    const next = timed[i + 1];
    if (beat.kind === "hold" && next && !(beat.atMs! + beat.holdMs > next.atMs!)) fail(`hold beat ${i} ends before the next beat`);
  });
  const sum = raw.contactShare + beats.reduce((total, beat) => total + beat.share, 0);
  if (Math.abs(sum - 1) > 1e-9) fail(`the shares sum to ${sum}, not 1`);
  if (raw.opensOn !== undefined && raw.opensOn !== "first" && raw.opensOn !== "last") fail(`opensOn ${String(raw.opensOn)}`);
  return Object.freeze({ id, contactShare: raw.contactShare, holdMs: raw.holdMs, beats: Object.freeze(beats), down, opensOnFirst: raw.opensOn === "first" });
}

const FOLLOW_UPS: ReadonlyMap<string, CityFightFollowUp> = new Map(Object.entries(JSON_DATA.followUps).map(([id, raw]) => [id, cityFightFollowUpFromJson(id, raw)]));

/** Every character's awakening, by his id. */
export const CITY_FIGHT_AWAKENINGS: ReadonlyMap<string, CityFightAwakening> = new Map(Object.entries(JSON_DATA.characters).map(([id, raw]) => {
  const staging = raw.staging ?? null, follow = raw.followUp !== undefined ? FOLLOW_UPS.get(raw.followUp) ?? null : null;
  if (raw.followUp !== undefined && !follow) throw new Error(`city fight awakening "${id}": no follow-up ${raw.followUp}`);
  if (staging !== null && CITY_FIGHT_FOLLOW_UP_STAGINGS.includes(staging) && !follow) throw new Error(`city fight awakening "${id}": ${staging} needs a follow-up`);
  return [id, Object.freeze({ id, name: raw.name, staging, followUp: follow })] as const;
}));

/** `id`'s awakening (a character's id), or null (an unknown id — a registered fighter: his super is its swing alone). */
export function cityFightAwakening(id: string | null | undefined): CityFightAwakening | null {
  return id ? CITY_FIGHT_AWAKENINGS.get(id) ?? null : null;
}

/** A follow-up in flight: whose (`id`), fight ms since the super's contact, the beats fired, the super's damage, ms since the last timed beat. */
export interface CityFightFollowUpRun {
  readonly id: string;
  readonly fightMs: number;
  readonly fired: number;
  /** The super's whole damage (each beat deals its share of it). */
  readonly damage: number;
  /** Fight ms since the last timed beat fired (null: before it). */
  readonly sinceTimedMs: number | null;
  /** Fight ms he has lain down since the last timed beat (the `down` beat's wait). */
  readonly downMs: number;
}

/** The follow-up's start at its super's contact (`damage`: the super's whole damage). */
export function startCityFightFollowUp(follow: CityFightFollowUp, damage: number): CityFightFollowUpRun {
  return Object.freeze({ id: follow.id, fightMs: 0, fired: 0, damage, sinceTimedMs: null, downMs: 0 });
}

/** Its follow-up by id (a run carries the id). */
export function cityFightFollowUpById(id: string): CityFightFollowUp | null {
  return FOLLOW_UPS.get(id) ?? null;
}

/**
 * One tick of the follow-up's clock (`dtMs` fight ms, `lying`: he lies in a knockdown now — `kumaCombatLying`): the beat due now (its index —
 * one a tick: its freeze holds the rest), or none; `run` null once it is over (every beat fired, or the `down` beat's wait ran out).
 */
export function stepCityFightFollowUp(run: CityFightFollowUpRun, dtMs: number, lying: boolean):
  { readonly run: CityFightFollowUpRun | null; readonly beat: number | null } {
  const follow = FOLLOW_UPS.get(run.id);
  if (!follow) return { run: null, beat: null };
  const fightMs = run.fightMs + dtMs, beats = follow.beats, next = beats[run.fired];
  if (!next) return { run: null, beat: null };
  if (next.atMs !== null) {
    if (fightMs < next.atMs) return { run: { ...run, fightMs }, beat: null };
    const fired = run.fired + 1, timedDone = beats[fired]?.atMs === null || fired >= beats.length;
    const after: CityFightFollowUpRun = Object.freeze({ ...run, fightMs, fired, sinceTimedMs: timedDone ? 0 : null });
    return { run: fired >= beats.length ? null : after, beat: run.fired };
  }
  // The `down` beat: once he has lain `afterDownMs`, not past `maxWaitMs` after the last timed beat.
  const down = follow.down!, since = (run.sinceTimedMs ?? 0) + dtMs, downMs = lying ? run.downMs + dtMs : 0;
  if (downMs >= down.afterDownMs) return { run: null, beat: run.fired };
  if (since > down.maxWaitMs) return { run: null, beat: null };
  return { run: Object.freeze({ ...run, fightMs, sinceTimedMs: since, downMs }), beat: null };
}

/** Fight ms until the `down` beat while he lies waiting for it, or null — the staging's last card starts falling to meet it. */
export function cityFightFollowUpDownInMs(run: Pick<CityFightFollowUpRun, "id" | "fired" | "sinceTimedMs" | "downMs"> | null): number | null {
  const follow = run ? FOLLOW_UPS.get(run.id) : undefined;
  if (!run || !follow?.down || follow.beats[run.fired]?.kind !== "down" || run.downMs <= 0) return null;
  return Math.max(0, follow.down.afterDownMs - run.downMs);
}

/** What a follow-up beat is for the receiving rules (`NativeCityKumaReceive`, both engines): its blow on him. */
export interface CityFightFollowUpBlow {
  readonly damage: number;
  readonly from: CityPoint;
  readonly push: CityPoint;
  readonly tier: NativeCityMeleeTier;
  readonly poise: number;
  readonly pierce: true;
  readonly throughArmor: true;
  readonly axis: VillageFacing;
  /** No meter for him: the super was one blow (its own contact builds his meter once). */
  readonly meterless: true;
  readonly string: { readonly flinchMs: number; readonly ender: boolean; readonly knockdown: false; readonly stringCount?: number;
    readonly air?: "hit" | "spike"; readonly airLift?: number; readonly ground?: boolean; readonly groundCharge?: number; readonly lying?: boolean;
    readonly airLaunch?: boolean; readonly forceLaunch?: boolean };
}

/**
 * Beat `index`'s blow (`damage`: the super's whole damage): a hold beat flinches him where he stands for its `holdMs` (the contact's
 * hold, again); the launch throws him up whatever he was doing; an air hit keeps him up, the spike
 * drives him down; the down beat strikes him lying (`lying` — whether or not a ground blow is open to him). Through his guard and armour,
 * and no meter for him (`meterless`): it is one scripted move of the super's.
 */
export function cityFightFollowUpBlow(follow: CityFightFollowUp, index: number, damage: number, at: { readonly from: CityPoint;
  readonly push: CityPoint; readonly axis: VillageFacing }): CityFightFollowUpBlow {
  const beat = follow.beats[index]!;
  const string: CityFightFollowUpBlow["string"] = beat.kind === "hold" ? { flinchMs: beat.holdMs, ender: false, knockdown: false, stringCount: 0 }
    : beat.kind === "launch" ? { flinchMs: 0, ender: true, knockdown: false, airLaunch: true, forceLaunch: true }
    : beat.kind === "down" ? { flinchMs: 0, ender: false, knockdown: false, stringCount: 0, lying: true }
    : beat.kind === "spike" ? { flinchMs: 0, ender: false, knockdown: false, stringCount: 0, air: "spike", ground: true, groundCharge: 1 }
    : { flinchMs: 0, ender: false, knockdown: false, stringCount: 0, air: "hit", ...(beat.liftBodies !== null ? { airLift: beat.liftBodies } : {}) };
  return { damage: damage * beat.share, from: at.from, push: at.push, tier: "heavy", poise: beat.poise, pierce: true, throughArmor: true,
    axis: at.axis, meterless: true, string };
}

/** The super's own contact when a follow-up comes: its share, and a hold where he stands (no launch, no string's end). */
export function cityFightFollowUpHold(follow: CityFightFollowUp): { readonly share: number;
  readonly string: { readonly flinchMs: number; readonly ender: false; readonly knockdown: false; readonly stringCount: 0 } } {
  return { share: follow.contactShare, string: { flinchMs: follow.holdMs, ender: false, knockdown: false, stringCount: 0 } };
}
