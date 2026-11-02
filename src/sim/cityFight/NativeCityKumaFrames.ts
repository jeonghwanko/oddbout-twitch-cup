/**
 * KUMA형 파이터의 판정 박자(2026-10-22, 경쟁 전투 엔진 5단계 — `render/art/NativeCityKumaArt` 에서 옮김): 그의 런타임 팩(`NativeCityOrthoPack`)에서
 * 휘두름의 접촉 시각·예비·결심·꼬리(`kumaFightTiming`), 쓰러짐·일어서기·휘청 길이, 걸음 보폭, 그리고 규칙이 읽는 다리(`nativeCityKumaArtBridge`).
 * 규칙과 서버 엔진(`server/ai-fighter-duel.ts`)이 렌더 계층 없이 같은 계산을 읽는다. 그리기(시트·칸·들림)는 렌더(`NativeCityKumaArt`)에 남는다.
 */
import type { VillageFacing } from "../VillageFacing";
import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind, type NativeCityTempoTuning } from "./NativeCityCombatTuning";
import { kumaCastClip, NATIVE_CITY_KUMA_MOVES, type KumaArtFacing, type KumaCombatTiming, type KumaDashLanding, type KumaDrawnClip, type KumaSpecialMove,
  type KumaTuning } from "./NativeCityKumaCombatState";
import type { NativeCityKumaArtBridge } from "./NativeCityKumaFighter";
import { kumaGrabTiming } from "./NativeCityKumaGrab";
import { nativeCityClipWarp, nativeCityFixedSection, nativeCityRateSection, nativeCityWarpFightMs, nativeCityWarpTotalMs, type NativeCityClipWarp, type NativeCityWarpSection } from "./NativeCityTempoWarp";
import { nativeCityOrthoActionClip, nativeCityOrthoActionFacing, nativeCityOrthoActionTiming, nativeCityOrthoClip, nativeCityOrthoHitSteps, type NativeCityOrthoAction, type NativeCityOrthoActionClip, type NativeCityOrthoPack } from "../../assets/NativeCityOrthoPack";
import { stepsTotal } from "../StepTimeline";
import { kumaSkillKind, kumaSkillSuperForm, type CityFighterSkillKind, type CityFighterSkillTuning, type KumaSkillMarks } from "./NativeCityKumaSkill";
import { KUMA_AIR_CHASE_LONG, kumaAirChasing, type CityFighterAirChaseTuning } from "./NativeCityKumaAirChase";


/**
 * A fighter's own numbers his frame data is computed with (2026-10-22, the competitive engine's stage 5b): the fight clock's warp of his
 * drawn clips (`tempo`), his run pace, his fast combo's cut, his get-up step and his grab's beats. Built from HIS tuning (`kumaFrameSpec`) —
 * never from KUMA's file: every fighter's bridge carries his own, and the view drawing him reads the same.
 */
export interface KumaFrameSpec {
  readonly tempo: NativeCityTempoTuning["kuma"];
  readonly runPaceScale: number;
  readonly fastHits: number;
  readonly fastEndKey: string;
  readonly getUpFrameMs: number;
  readonly grab: KumaCombatTiming;
  /** His clips play as drawn (`KumaFighterOverrides.drawnClips`): no tempo warp but the swing's windup speed and the answer's floor. */
  readonly drawn: boolean;
  /** How long before its first contact a swing commits (`attack.commitLeadMs`): a drawn slam's glint and commit point. */
  readonly commitLeadMs: number;
  /** His skill (`KumaTuning.skill`, 2026-10-22): its clip's contacts reach as it says. Null: none. */
  readonly skill: CityFighterSkillTuning | null;
  /** His second skill (`KumaTuning.skill2`, 2026-10-25), likewise. Null: none. */
  readonly skill2: CityFighterSkillTuning | null;
  /** His air chase (`KumaTuning.airChase`, 2026-10-22): its clip's contacts reach as it says. Null: none. */
  readonly airChase: CityFighterAirChaseTuning | null;
}

const FRAME_SPECS = new WeakMap<KumaTuning, KumaFrameSpec>();

/** `t`'s frame spec, made once per tuning object (the timing caches key on it). The tempo is the KUMA-type fighters' shared fight clock. */
export function kumaFrameSpec(t: KumaTuning): KumaFrameSpec {
  const known = FRAME_SPECS.get(t);
  if (known) return known;
  const spec: KumaFrameSpec = Object.freeze({ tempo: NATIVE_CITY_COMBAT.tempo.kuma, runPaceScale: t.chase.runPaceScale,
    fastHits: t.actions.fast.damage.length, fastEndKey: t.fastCombo.endKey, getUpFrameMs: t.down.getUpFrameMs, grab: kumaGrabTiming(t),
    drawn: t.drawnClips === true, commitLeadMs: t.attack.commitLeadMs, skill: t.skill ?? null, skill2: t.skill2 ?? null,
    airChase: t.airChase ?? null });
  FRAME_SPECS.set(t, spec);
  return spec;
}
/** The clip a swing draws: the fast combo is the opening of the combo clip; the summon cast resolves its heading like the slam (`kumaSummonClip`). */
export function kumaActionClipKind(action: NativeCityKumaActionKind): "slam" | "combo" | "dash" {
  return action === "slam" || action === "dash" ? action : action === "summon" ? "slam" : "combo";
}

/**
 * His drawn moves (2026-10-11, `native-city-kuma-moves.json`): the clips drawn INSTEAD of the old ones where his pack has them (the side
 * heading only; `side` mirrors `side_left` — a name of his own, outside the shared ortho action list). MAIN, by action: the iron-ball swing
 * (fast), the iron-ball string (combo), the iron-ball smash (slam), the roll-and-rise (dash). SPECIALS (`KumaSpecialMove`, picked by the
 * rules now and then): the jumping butt slam instead of a slam, the bear bowling tackle instead of the dash.
 */
export const KUMA_MAIN_MOVE_CLIPS = Object.freeze({ fast: "ballSwing", combo: "ballCombo", slam: "ballSmash", dash: "rollRise" } as const);
export const KUMA_SPECIAL_MOVE_CLIPS = Object.freeze({ buttSlam: "buttSlam", bowl: "bowl" } as const);
export type KumaMoveClipKind = (typeof KUMA_MAIN_MOVE_CLIPS)[keyof typeof KUMA_MAIN_MOVE_CLIPS] | keyof typeof KUMA_SPECIAL_MOVE_CLIPS | "ballGrab";
/** Which action each special stands in for. */
const KUMA_SPECIAL_ACTION: Readonly<Record<keyof typeof KUMA_SPECIAL_MOVE_CLIPS, NativeCityKumaActionKind>> = { buttSlam: "slam", bowl: "dash" };

/**
 * The clip his swing / dash draws at a heading: the heading the old slam / combo / dash resolves to (`nativeCityOrthoActionFacing`), then
 * there the special asked for (when it stands in for this action and is drawn at that very heading), else his main move's clip, else the old
 * clip. `move`: which move it is (null: the old clip). Null without art.
 */
export function kumaMoveClip(pack: NativeCityOrthoPack, facing: VillageFacing, action: NativeCityKumaActionKind, special: KumaSpecialMove | null = null)
  : { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean; readonly move: KumaMoveClipKind | null } | null {
  if (action === "grab") return kumaGrabClip(pack, facing);
  if (action === "summon") return kumaSummonClip(pack, facing, kumaCastClip(special));
  // A fighter's skill (2026-10-22, `skill:<kind>`): his pack's own `skill` clip at the heading his slam (his dash, for a dash kind) resolves to;
  // its super form (`super:<kind>`, 2026-10-22 4차) his `superSkill` clip.
  if (kumaSkillKind(special)) {
    return kumaSkillClip(pack, facing, action === "dash" ? "dash" : "slam", kumaSkillSuperForm(special) ? "superSkill" : "skill", kumaSkillKind(special));
  };
  // His air chase (2026-10-22, `NativeCityKumaAirChase`): his pack's own `airCombo` clip at the heading his combo resolves to.
  if (kumaAirChasing(special)) return kumaAirChaseClip(pack, facing, special === KUMA_AIR_CHASE_LONG);
  const kind = kumaActionClipKind(action), plain = nativeCityOrthoActionFacing(pack, facing, kind);
  if (!plain) return null;
  const candidates: KumaMoveClipKind[] = [];
  if (special && special in KUMA_SPECIAL_ACTION) {
    const move = special as keyof typeof KUMA_SPECIAL_MOVE_CLIPS;
    if (KUMA_SPECIAL_ACTION[move] === action) candidates.push(KUMA_SPECIAL_MOVE_CLIPS[move]);
  }
  candidates.push(KUMA_MAIN_MOVE_CLIPS[action]);
  for (const move of candidates) {
    if (nativeCityOrthoActionFacing(pack, plain, move as NativeCityOrthoAction) !== plain) continue;
    const found = nativeCityOrthoActionClip(pack, plain, move as NativeCityOrthoAction);
    if (found) return { ...found, move };
  }
  const found = nativeCityOrthoActionClip(pack, plain, kind);
  return found ? { ...found, move: null } : null;
}

/**
 * The clip his summon cast draws at a heading (2026-10-20, `KumaTuning.summons`): the pack's own clip of the slot (`name`: `summon`, or the
 * slot's — her `spell`, his `drill`) at the heading his slam resolves to (its first `hit` key is the release), else the slam he draws there
 * — a fighter tried with a summon before his cast is drawn (the development harness, the roadster call drawn as his slam). Null without art.
 */
export function kumaSummonClip(pack: NativeCityOrthoPack, facing: VillageFacing, name = "summon")
  : { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean; readonly move: KumaMoveClipKind | null } | null {
  const plain = nativeCityOrthoActionFacing(pack, facing, "slam");
  if (!plain) return null;
  if (nativeCityOrthoActionFacing(pack, plain, name as NativeCityOrthoAction) === plain) {
    const own = nativeCityOrthoActionClip(pack, plain, name as NativeCityOrthoAction);
    if (own) return { ...own, move: null };
  }
  return kumaMoveClip(pack, plain, "slam");
}

/**
 * His skill's clip at a heading (`kumaMoveClip`): the pack's `skill` clip (its super form's: `superSkill`) where his `kind` clip resolves; null
 * where it is not drawn. `want` (a skill kind — 2026-10-25, `KumaTuning.skill2`): the plain clip drawing that kind, `skill` or else `skill2`.
 */
export function kumaSkillClip(pack: NativeCityOrthoPack, facing: VillageFacing, kind: "slam" | "dash", name: "skill" | "superSkill" = "skill",
  want: CityFighterSkillKind | null = null)
  : { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean; readonly move: KumaMoveClipKind | null } | null {
  const plain = nativeCityOrthoActionFacing(pack, facing, kind);
  if (!plain) return null;
  for (const clipName of name === "skill" && want ? ["skill", "skill2"] : [name]) {
    if (nativeCityOrthoActionFacing(pack, plain, clipName as NativeCityOrthoAction) !== plain) continue;
    const own = nativeCityOrthoActionClip(pack, plain, clipName as NativeCityOrthoAction);
    const drawn = own ? kumaSkillClipKind(own.clip) : null;
    if (own && drawn && (name !== "skill" || !want || drawn === want)) return { ...own, move: null };
  }
  return null;
}

/**
 * His air chase's clip (`airCombo`, its `keys.airChase`; `long`: the three-hit `airCombo3`) at the heading his combo resolves to, else null
 * (no chase without it).
 */
export function kumaAirChaseClip(pack: NativeCityOrthoPack, facing: VillageFacing, long = false)
  : { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean; readonly move: KumaMoveClipKind | null } | null {
  const plain = nativeCityOrthoActionFacing(pack, facing, kumaActionClipKind("combo"));
  const name = (long ? "airCombo3" : "airCombo") as NativeCityOrthoAction;
  if (!plain || nativeCityOrthoActionFacing(pack, plain, name) !== plain) return null;
  const own = nativeCityOrthoActionClip(pack, plain, name);
  return own && own.clip.keys?.airChase === true ? { ...own, move: null } : null;
}

/**
 * The air chase's fight timing (2026-10-22): as drawn — its contacts (`keys.hits`, the last the spike), its jump (`keys.takeoff`) as the
 * leap's takeoff (its commit and lock — the butt slam's leap) and its contacts' reach (`airChase.reachStrides`).
 */
function kumaAirChaseTiming(clip: NativeCityOrthoActionClip, chase: CityFighterAirChaseTuning | null): KumaCombatTiming {
  const art = nativeCityOrthoActionTiming(clip), keys = (clip.keys ?? {});
  const hits = Array.isArray(keys.hits) ? (keys.hits as number[]).map(step => art.startsMs[step] ?? art.totalMs) : art.hitsMs;
  const takeoff = typeof keys.takeoff === "number" ? art.startsMs[keys.takeoff] ?? 0 : 0;
  const reach = chase?.reachStrides ?? 0;
  // The spike's contact (`keys.spike`, 2026-10-22 4차 — his own ending after it on the bounce), else the last.
  const spike = typeof keys.spike === "number" && keys.spike >= 0 && keys.spike < hits.length ? keys.spike : hits.length - 1;
  return { totalMs: Math.max(art.totalMs, (hits.at(-1) ?? 0) + 1), hitsMs: hits, apexMs: takeoff, leap: { takeoffMs: takeoff },
    move: { name: "airChase", reachExtraStrides: hits.map(() => reach), radial: hits.map(() => false) }, airSpike: spike };
}

/** A skill clip's kind (`keys.skill`), else null: such a clip plays as drawn (no tempo warp — `kumaSkillTiming`). */
export function kumaSkillClipKind(clip: Pick<NativeCityOrthoActionClip, "keys">): CityFighterSkillKind | null {
  const kind = clip.keys?.skill;
  return typeof kind === "string" ? kind as CityFighterSkillKind : null;
}

/**
 * A skill clip's fight timing (2026-10-22): as drawn — its contacts (`keys.hits`), its marks by step (`keys.windowFrom` ... `keys.recoverFrom`,
 * `KumaSkillMarks`), its contacts' reach (`skill.reachStrides`, as a drawn move's), and for the burrow its dig-in (`keys.takeoff`) as the
 * butt slam's takeoff (the leap's commit and lock).
 */
function kumaSkillTiming(clip: NativeCityOrthoActionClip, kind: CityFighterSkillKind, skill: CityFighterSkillTuning | null): KumaCombatTiming {
  const art = nativeCityOrthoActionTiming(clip), keys = (clip.keys ?? {});
  const at = (name: string): number | undefined => { const step = keys[name]; return typeof step === "number" ? art.startsMs[step] ?? art.totalMs : undefined; };
  const hits = Array.isArray(keys.hits) ? (keys.hits as number[]).map(step => art.startsMs[step] ?? art.totalMs) : art.hitsMs;
  const recoverFrom = at("recoverFrom"), takeoff = at("takeoff");
  const marks: KumaSkillMarks = { kind, totalMs: art.totalMs, hits: hits.length,
    ...Object.fromEntries((["windowFrom", "windowTo", "strikeFrom", "strikeTo", "backFrom", "backTo", "waitTo", "lowFrom", "lowTo"] as const)
      .flatMap(name => { const ms = at(name); return ms === undefined ? [] : [[`${name}Ms`, ms]]; })),
    ...(takeoff !== undefined ? { takeoffMs: takeoff } : {}),
    ...(keys.lowTravel === true ? { lowTravel: true } : {}),
    ...(keys.flee === true ? { flee: true } : {}),
    ...(at("windupTo") !== undefined ? { windupMs: at("windupTo") } : {}),
    ...(recoverFrom !== undefined ? { recoverMs: Math.max(0, art.totalMs - recoverFrom) } : {}) };
  const reach = skill?.kind === kind ? skill.reachStrides : undefined;
  const move = reach !== undefined && hits.length > 0
    ? { move: { name: "skill", reachExtraStrides: hits.map(() => reach), radial: hits.map(() => false) } } : {};
  const leap = kind === "burrow" && takeoff !== undefined ? { apexMs: takeoff, leap: { takeoffMs: takeoff } } : {};
  return { totalMs: Math.max(art.totalMs, (hits.at(-1) ?? 0) + 1), hitsMs: hits, skill: marks, ...move, ...leap };
}

/**
 * The clip his red grab draws its cells from at a heading (2026-10-14, `native-city-kuma-moves.json` ballGrab): at the heading his swing
 * resolves to, the `ballGrab` clip where it is drawn, else the iron-ball atlas's `ballSwing` clip (the grab's cells by name, or their
 * iron-ball stand-ins — `kumaGrabCell`). Null where neither is drawn: the grab is not his there (the rules keep today's rotation).
 */
export function kumaGrabClip(pack: NativeCityOrthoPack, facing: VillageFacing)
  : { readonly clip: NativeCityOrthoActionClip; readonly flipX: boolean; readonly move: "ballGrab" } | null {
  const plain = nativeCityOrthoActionFacing(pack, facing, kumaActionClipKind("grab"));
  if (!plain) return null;
  for (const name of ["ballGrab", "ballSwing"] as const) {
    if (nativeCityOrthoActionFacing(pack, plain, name as NativeCityOrthoAction) !== plain) continue;
    const found = nativeCityOrthoActionClip(pack, plain, name as NativeCityOrthoAction);
    if (found) return { ...found, move: "ballGrab" };
  }
  return null;
}

/** The grab's step lists (`native-city-kuma-moves.json` ballGrab): the windup to the catch, the caught branch, the whiff branch. */
export interface KumaGrabMove {
  readonly steps: readonly KumaMoveStep[];
  readonly caughtSteps: readonly KumaMoveStep[];
  readonly whiffSteps: readonly KumaMoveStep[];
  /** Iron-ball cells standing in for grab cells the atlas does not hold yet. */
  readonly standIns: Readonly<Record<string, string>>;

  readonly hold: Readonly<Record<string, { readonly offset: readonly [number, number]; readonly player: string; readonly front: boolean;
    readonly hugCentreBody?: readonly [number, number] }>>;
  /** The throw's carry (2026-10-19, `throwCarry`): the hold offset eased out over the first `ms` of his flight along (1 - t)^`power`. */
  readonly throwCarry: { readonly ms: number; readonly power: number };
  /**
   * The comic letters its beats call (2026-10-24, `letters` — the kimchi slap's "짝!" on each slap, "철퍽!" on the throw): `KUMA_FIGHT_LETTERS`
   * ids by beat. Absent: the blow's own letter.
   */
  readonly letters: Readonly<Partial<Record<"squeeze" | "throw", string>>>;
}


export const KUMA_GRAB_MOVE = "ballGrab";

const grabMoves = new Map<string, KumaGrabMove>();

/** The grab's drawn steps off the moves json (`name`: the entry, `KUMA_GRAB_MOVE` by default — an unknown one throws, a wiring error). */
export function kumaGrabMove(name: string = KUMA_GRAB_MOVE): KumaGrabMove {
  const known = grabMoves.get(name);
  if (known) return known;
  const m = (NATIVE_CITY_KUMA_MOVES as unknown as Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>>)[name];
  if (!m || !Array.isArray(m.caughtSteps)) throw new Error(`no grab move ${name} in native-city-kuma-moves.json`);
  const steps = (value: unknown) => (Array.isArray(value) ? value : []) as unknown as readonly KumaMoveStep[];
  const carry = (m.throwCarry ?? {}) as Partial<KumaGrabMove["throwCarry"]>;
  const move: KumaGrabMove = { steps: steps(m.steps), caughtSteps: steps(m.caughtSteps), whiffSteps: steps(m.whiffSteps),
    standIns: (m.standIns ?? {}) as KumaGrabMove["standIns"], hold: (m.hold ?? {}) as KumaGrabMove["hold"],
    throwCarry: { ms: typeof carry.ms === "number" ? carry.ms : 0, power: typeof carry.power === "number" ? carry.power : 1 },
    letters: (m.letters ?? {}) };
  grabMoves.set(name, move);
  return move;
}

/** A grab cell of the clip by name (`keys.cells`), else its iron-ball stand-in's (`KumaGrabMove.standIns`); null without either. */
export function kumaGrabCell(clip: Pick<NativeCityOrthoActionClip, "keys">, name: string, move: string = KUMA_GRAB_MOVE): number | null {
  return kumaMoveCell(clip, name) ?? kumaMoveCell(clip, kumaGrabMove(move).standIns[name] ?? name);
}

/** The clip a swing draws at a heading (`kumaMoveClip`: its main move, or the special asked for). */
export function kumaSwingClip(pack: NativeCityOrthoPack, facing: VillageFacing, action: NativeCityKumaActionKind, special: KumaSpecialMove | null = null) {
  return kumaMoveClip(pack, facing, action, special);
}

/** One drawn step of a move in the json (`[cell, ms, shake?, 'hit'?]`; shake in template px at body 640, side_left: +x back). */
export type KumaMoveStep = readonly [string, number, (readonly number[] | null)?, string?];
export const kumaMoveStepMs = (step: KumaMoveStep): number => step[1];

/** A drawn dash (`native-city-kuma-moves.json` rollRise / bowling): its cells by phase and its pop-out / open-stand steps. */
export interface KumaDashMove {
  readonly name: "rollRise" | "bowling";
  readonly windup: string;
  readonly launch: readonly [string, number] | null;
  readonly roll: readonly string[];
  readonly rollCellMs: number;
  readonly rollMinShare: number;
  readonly slideRollScale: number;
  /** The cell the strike snaps to and the slide after it holds (the rising swing); null: the roll goes on (the ball). */
  readonly struck: string | null;
  readonly popSteps: readonly KumaMoveStep[];
  readonly recoverSteps: readonly KumaMoveStep[];
  readonly recoverStruckSteps: readonly KumaMoveStep[];
  /** The strike's reach beyond body contact (strides); null: the dash's own. */
  readonly reachExtraStrides: number | null;
  /** Fight ms into the pop-out / open stand when his boots meet the ground (the dust ring); null: no landing. */
  readonly landsAtMs: number | null;
}

/** The drawn dash a dash clip is (`keys.move`), else null (the old dash still). */
export function kumaDashMove(clip: Pick<NativeCityOrthoActionClip, "keys"> | null | undefined): KumaDashMove | null {
  const name = clip?.keys?.move === "rollRise" ? "rollRise" : clip?.keys?.move === "bowling" ? "bowling" : null;
  if (!name) return null;
  const m = NATIVE_CITY_KUMA_MOVES[name] as unknown as Record<string, unknown>;
  const steps = (value: unknown) => (Array.isArray(value) ? value : []) as unknown as readonly KumaMoveStep[];
  return { name, windup: m.windup as string, launch: Array.isArray(m.launch) ? m.launch as unknown as readonly [string, number] : null,
    roll: m.roll as string[], rollCellMs: m.rollCellMs as number, rollMinShare: m.rollMinShare as number, slideRollScale: m.slideRollScale as number,
    struck: typeof m.struck === "string" ? m.struck : null, popSteps: steps(m.popSteps), recoverSteps: steps(m.recoverSteps),
    recoverStruckSteps: Array.isArray(m.recoverStruckSteps) ? steps(m.recoverStruckSteps) : steps(m.recoverSteps),
    reachExtraStrides: typeof m.reachExtraStrides === "number" ? m.reachExtraStrides : null,
    landsAtMs: typeof m.landsAtMs === "number" ? m.landsAtMs : null };
}

/** A cell of a drawn move by name (`keys.cells` on its clip); null when the clip has no such cell. */
export function kumaMoveCell(clip: Pick<NativeCityOrthoActionClip, "keys">, name: string): number | null {
  const cells = clip.keys?.cells as Readonly<Record<string, unknown>> | undefined, index = cells?.[name];
  return typeof index === "number" ? index : null;
}

/** The fight ms a step list lasts. */
export function kumaMoveStepsMs(steps: readonly KumaMoveStep[]): number { return stepsTotal(steps, kumaMoveStepMs); }

/**
 * The fight's heading resolver over his pack (`KumaArtFacing`): the exact 8-way heading when that clip is drawn there, else the
 * clip's `fallbackFrom`, else the front-biased diagonal. A swing resolves on the clip it draws (the fast combo on `combo`).
 */
export function kumaPackArtFacing(pack: NativeCityOrthoPack): KumaArtFacing {
  return (clip: KumaDrawnClip, exact: VillageFacing, diagonal: VillageFacing) => {
    const kind = clip === "hit" || clip === "fall" || clip === "dash" ? clip : kumaActionClipKind(clip);
    return nativeCityOrthoActionFacing(pack, exact, kind, { diagonal }) ?? diagonal;
  };
}

/** Screen walk stride (px per cycle) and cycle seconds for a body drawn `bodyPx` tall. All headings use the side stride. */
export function kumaWalkStride(pack: NativeCityOrthoPack, bodyPx: number): { stridePx: number; cycleSec: number } {
  const side = nativeCityOrthoClip(pack, "right", "walk");
  return { stridePx: (side.stridePixels ?? 0) * bodyPx / side.bodyHeight, cycleSec: side.frames.length * side.durationMs / 1000 };
}

/**
 * Screen px of one run cycle at run pace (`pacePxPerSec` × `kuma.chase.runPaceScale`): the side run's cycle length, so the clip
 * keeps its own cadence at full run speed (the run art has no measured stride).
 */
export function kumaRunStridePx(pack: NativeCityOrthoPack, pacePxPerSec: number, spec: KumaFrameSpec): number {
  const side = nativeCityOrthoClip(pack, "right", "run");
  return Math.max(0, pacePxPerSec) * spec.runPaceScale * side.frames.length * side.durationMs / 1000;
}

/**
 * Hit-clip landmarks with the authored defaults, as STEP indices: the diagonal pack's hit has no `sequence` (step = frame), the
 * 8-way keypose hits carry a 48-step sequence whose indices are the diagonal's frame numbers (`kumaClipFrame` draws them).
 */
export function hitKeys(clip: Pick<NativeCityOrthoActionClip, "keys">): { recoil: number; stagger: readonly [number, number]; recover: readonly [number, number] } {
  const keys = clip.keys ?? {};
  const pair = (value: unknown, fallback: readonly [number, number]): readonly [number, number] =>
    Array.isArray(value) && value.length === 2 && value.every(v => typeof v === "number") ? [value[0] as number, value[1] as number] : fallback;
  return { recoil: typeof keys.recoil === "number" ? keys.recoil : 12, stagger: pair(keys.stagger, [13, 22]), recover: pair(keys.recover, [23, 34]) };
}

/** The clip a landmark list is read from: its keys and, when it has them, its steps / frames. */
export type KumaKeyedClip = Pick<NativeCityOrthoActionClip, "keys"> & Partial<Pick<NativeCityOrthoActionClip, "sequence" | "frames">>;

/**
 * The frame a step index of his clip draws: through its `sequence` (8-way keypose clips), else the index itself, kept inside the
 * clip. Rig frame numbers (`exchangeFx.rig.kuma`) are authored on the diagonal clips, whose steps are their frames.
 */
export function kumaClipFrame(clip: Partial<Pick<NativeCityOrthoActionClip, "sequence" | "frames">>, index: number): number {
  const i = Math.max(0, Math.round(index));
  if (clip.sequence && clip.sequence.length > 0) return clip.sequence[Math.min(clip.sequence.length - 1, i)]!.frame;
  return clip.frames && clip.frames.length > 0 ? Math.min(clip.frames.length - 1, i) : i;
}

/**
 * Poise break = the spec's groggy (2026-10-08, groggy 2026-10-09): a few frames into the recoil, the recoil held, then ONE held
 * stagger frame (`poise.break.groggyFrame`, hit[20] in the sample) for `staggerMs` - the view sways it and orbits dizzy
 * stars over his head, or plays the drawn `groggy` loop when the pack has one - then the recover frames. Timings are
 * `poise.break` in native-city-combat.json; the total (how long he cannot act) is unchanged by the groggy look.
 */
export function kumaBreakSteps(clip: KumaKeyedClip)
  : readonly { readonly frame: number; readonly durationMs: number; readonly groggy?: boolean }[] {
  const { recoil, stagger, recover } = hitKeys(clip), spec = NATIVE_CITY_COMBAT.poise.break;
  const steps: { frame: number; durationMs: number; groggy?: boolean }[] = [];
  for (let i = Math.max(0, recoil - spec.framesBeforeRecoil); i < recoil; i++) steps.push({ frame: kumaClipFrame(clip, i), durationMs: spec.frameMs });
  steps.push({ frame: kumaClipFrame(clip, recoil), durationMs: spec.holdMs });
  const hold = Math.max(stagger[0], Math.min(stagger[1], spec.groggyFrame));
  if (spec.staggerMs > 0) steps.push({ frame: kumaClipFrame(clip, hold), durationMs: spec.staggerMs, groggy: true });
  for (let i = recover[0]; i <= recover[1]; i++) steps.push({ frame: kumaClipFrame(clip, i), durationMs: spec.recoverFrameMs });
  return steps;
}

/** How long a break holds him (`kumaBreakSteps` total); the authored default keys without art. */
export function kumaBreakMs(clip: KumaKeyedClip | null): number {
  return stepsTotal(kumaBreakSteps(clip ?? {}));
}

/**
 * The slam's apex hold as steps [first, last] (art): the longest-held keypose before the impact step (a run of repeated steps,
 * or one long step of an 8-way keypose clip). Null when the clip has no steps before its impact.
 */
function kumaApexRun(clip: NativeCityOrthoActionClip): { readonly first: number; readonly last: number } | null {
  const steps = clip.sequence ?? [];
  const impact = clip.impactSequenceIndex ?? nativeCityOrthoHitSteps(clip)[0] ?? steps.length - 1;
  let best = { first: 0, last: 0, ms: 0 };
  for (let i = 0; i < impact;) {
    let j = i, ms = steps[i]!.durationMs;
    while (j + 1 < impact && steps[j + 1]!.frame === steps[i]!.frame) ms += steps[++j]!.durationMs;
    if (ms > best.ms) best = { first: i, last: j, ms };
    i = j + 1;
  }
  return best.ms > 0 ? best : null;
}

/**
 * When the slam's apex hold starts (art ms): the start of the longest-held keypose before the impact step. The ground telegraph
 * grows from here to the impact, and it is the slam's commit point. (`kumaFightTiming` maps it onto the fight clock.)
 */
export function kumaApexMs(clip: NativeCityOrthoActionClip): number {
  const run = kumaApexRun(clip);
  return run ? nativeCityOrthoActionTiming(clip).startsMs[run.first] ?? 0 : 0;
}

/**
 * His swing's ART timing (the clip as drawn). The fast combo is the combo clip cut where its `kuma.fastCombo.endKey` step starts
 * (the spin), with its first `actions.fast.damage.length` contacts; a clip without that key (an 8-way keypose combo) is cut halfway
 * between its last fast contact and the next one. The fight plays it time-warped (`kumaFightTiming`, `kumaTempoWarp`).
 */
export function kumaActionTiming(clip: NativeCityOrthoActionClip, action: NativeCityKumaActionKind, spec: KumaFrameSpec): { readonly totalMs: number;
  readonly hitsMs: readonly number[] } {
  const timing = nativeCityOrthoActionTiming(clip);
  // A drawn move is its whole clip (the iron-ball swing is the fast swing itself, not a cut of the combo).
  if (kumaAuthoredMove(clip)) return { totalMs: timing.totalMs, hitsMs: timing.hitsMs };
  if (action === "fast") {
    const hits = timing.hitsMs.slice(0, spec.fastHits);
    const end = clip.keys?.[spec.fastEndKey], next = timing.hitsMs[hits.length];
    const cut = typeof end === "number" ? timing.startsMs[end] ?? timing.totalMs
      : next !== undefined && hits.length > 0 ? (hits.at(-1)! + next) / 2 : timing.totalMs;
    return { totalMs: Math.max(cut, (hits.at(-1) ?? 0) + 1), hitsMs: hits };
  }
  return { totalMs: timing.totalMs, hitsMs: timing.hitsMs };
}

/**
 * His swing's time warp (`tempo.kuma`, 2026-10-09): the same art cells on a faster fight clock.
 * - slam: windup at `windupRate`, the apex hold squeezed to `slam.apexHoldMs`, the strike at `windupRate`, the impact hold (the
 *   impact step and its held repeats - the counter window) to `slam.landingHoldMs`, back to standing to `slam.recoverMs`;
 * - combo / fast: the windup to the first contact at `windupRate`, contact 1 → 2 (the string) and every later stretch between
 *   contacts at `actionRate` - except contact 2 → 3 (the spin), squeezed to `combo.gapMs` - and after the last contact to
 *   `combo.tailMs` / `fast.tailMs`;
 * - anything else (the dash still) as drawn.
 * `windupScale`: this swing's windup to its first contact (the slam: to its apex hold) runs that many times faster (the wake-up
 * reversal, the seeded variety `kuma.attack.windupRates` — the state's `windupScale`).
 */
export function kumaTempoWarp(clip: NativeCityOrthoActionClip, action: NativeCityKumaActionKind, spec: KumaFrameSpec, windupScale = 1)
  : NativeCityClipWarp {
  const key = `${action}:${windupScale}`;
  let byClip = WARPS.get(spec);
  if (!byClip) WARPS.set(spec, byClip = new WeakMap());
  let byAction = byClip.get(clip);
  if (!byAction) byClip.set(clip, byAction = new Map());
  const cached = byAction.get(key);
  if (cached) return cached;
  const warp = buildKumaTempoWarp(clip, action, spec, windupScale);
  byAction.set(key, warp);
  return warp;
}
/** `kumaTempoWarp`'s answers by frame spec, then clip (the packs' clip objects live as long as their pack). */
const WARPS = new WeakMap<KumaFrameSpec, WeakMap<NativeCityOrthoActionClip, Map<string, NativeCityClipWarp>>>();

function buildKumaTempoWarp(clip: NativeCityOrthoActionClip, action: NativeCityKumaActionKind, spec: KumaFrameSpec,
  windupScale: number): NativeCityClipWarp {
  // A skill clip plays as drawn (`kumaSkillTiming`): the fight's clock is its art clock.
  if (kumaSkillClipKind(clip) || clip.keys?.airChase === true) return nativeCityClipWarp([nativeCityRateSection(0, nativeCityOrthoActionTiming(clip).totalMs, 1)]);
  const tempo = spec.tempo;
  const art = kumaActionTiming(clip, action, spec), timing = nativeCityOrthoActionTiming(clip), end = art.totalMs;
  const windup = (spec.drawn ? 1 : tempo.windupRate) * Math.max(1e-3, windupScale), rate = tempo.actionRate;
  // A white swing's windup to its first contact: at its windup speed, but never shorter than the answer's floor (`whiteWindupFloorMs`
  // ÷ windupScale — the variety stays) on any fighter's art. The floor holds the windup's opening (KUMA's guard) longer; its last
  // inhale's worth of art (`tempo.kuma.inhaleMs`: the read's pull-back, the still beat, the snap) keeps the windup speed, so the inhale
  // tell still meets the drawn pull-back. Art shorter than that (YUME's 140 ms swipe) is stretched whole. Clips authored at fight speed
  // and under first-touch-wins a swing that lands before the answer's floor won every exchange (2026-10-22: 100 % against every fighter).
  const floorMs = spec.drawn || action === "fast" || action === "combo"
    ? Math.max(0, tempo.whiteWindupFloorMs) / Math.max(1e-3, windupScale) : 0;
  const windupTo = (to: number): NativeCityWarpSection[] => {
    if (to <= 0 || to / windup >= floorMs) return [nativeCityRateSection(0, to, windup)];
    const tail = Math.min(to, Math.max(0, tempo.inhaleMs)), head = to - tail;
    if (head <= 1e-6) return [nativeCityFixedSection(0, to, floorMs)];
    return [nativeCityFixedSection(0, head, floorMs - tail / windup), nativeCityRateSection(head, to, windup)];
  };
  // Drawn: the windup to his first contact as above, the rest as drawn.
  if (spec.drawn) {
    const first = art.hitsMs[0];
    return nativeCityClipWarp(first !== undefined && first > 0 && first < end
      ? [...windupTo(first), nativeCityRateSection(first, end, 1)] : [nativeCityRateSection(0, end, 1)]);
  }
  const windupEnd = kumaWindupEndArtMs(clip);
  if (windupEnd !== null) {
    // A drawn move (`native-city-kuma-moves.json`): its steps are authored at fight speed; only the windup (to its first contact, the
    // slam's apex hold, the butt slam's takeoff) takes the swing's windup speed — the flight, the string and the punish window keep their
    // length.
    return nativeCityClipWarp([...windupTo(windupEnd), nativeCityRateSection(windupEnd, end, 1)]);
  }
  if (action === "slam") {
    const steps = clip.sequence ?? [], impact = clip.impactSequenceIndex ?? nativeCityOrthoHitSteps(clip)[0], run = kumaApexRun(clip);
    if (impact === undefined || !steps[impact]) return nativeCityClipWarp([nativeCityRateSection(0, end, windup)]);
    let held = impact;
    while (held + 1 < steps.length && steps[held + 1]!.frame === steps[impact].frame) held++;
    const at = (index: number) => timing.startsMs[index] ?? end;
    const apexFrom = run ? at(run.first) : at(impact), apexTo = run ? at(run.last) + steps[run.last]!.durationMs : at(impact);
    const impactAt = at(impact), heldTo = at(held) + steps[held]!.durationMs;
    // The swing's own windup speed (`windupScale`) is the stretch up to the apex hold; the hold and the strike keep their length
    // (walking out of the apex hold still dodges it).
    return nativeCityClipWarp([
      nativeCityRateSection(0, apexFrom, windup),
      nativeCityFixedSection(apexFrom, apexTo, tempo.slam.apexHoldMs),
      nativeCityRateSection(apexTo, impactAt, tempo.windupRate),
      nativeCityFixedSection(impactAt, heldTo, tempo.slam.landingHoldMs),
      nativeCityFixedSection(heldTo, end, tempo.slam.recoverMs),
    ]);
  }
  if (action === "combo" || action === "fast") {
    const hits = art.hitsMs;
    if (hits.length === 0) return nativeCityClipWarp([nativeCityRateSection(0, end, windup)]);
    const sections = [...windupTo(hits[0]!)];
    for (let i = 1; i < hits.length; i++) {
      sections.push(i === 2 ? nativeCityFixedSection(hits[i - 1]!, hits[i]!, tempo.combo.gapMs) : nativeCityRateSection(hits[i - 1]!, hits[i]!, rate));
    }
    sections.push(nativeCityFixedSection(hits.at(-1)!, end, action === "fast" ? tempo.fast.tailMs : tempo.combo.tailMs));
    return nativeCityClipWarp(sections);
  }
  return nativeCityClipWarp([nativeCityRateSection(0, end, 1)]);
}

/**
 * The fight's timing of a swing (fight ms, `kumaTempoWarp`): its length, its contacts and, for the slam, where its apex hold (its
 * commit point) starts.
 */
export function kumaFightTiming(clip: NativeCityOrthoActionClip, action: NativeCityKumaActionKind, spec: KumaFrameSpec, windupScale = 1)
  : KumaCombatTiming {
  // A pure function of its arguments and the authored tuning, asked several times a frame (the rules' step, the view's swing clock, the
  // cues): each clip keeps the timings it has answered (2026-10-13 — rebuilding the tempo warp each time was the fight's hot path).
  let bySpec = FIGHT_TIMINGS.get(spec);
  if (!bySpec) FIGHT_TIMINGS.set(spec, bySpec = new WeakMap());
  let byClip = bySpec.get(clip);
  if (!byClip) bySpec.set(clip, byClip = new Map());
  const key = `${action}|${windupScale}`, known = byClip.get(key);
  if (known) return known;
  const timing = kumaFightTimingOf(clip, action, spec, windupScale);
  byClip.set(key, timing);
  return timing;
}

/** `kumaFightTiming`'s answers by frame spec, then clip (the packs' clip objects live as long as their pack). */
const FIGHT_TIMINGS = new WeakMap<KumaFrameSpec, WeakMap<NativeCityOrthoActionClip, Map<string, KumaCombatTiming>>>();

function kumaFightTimingOf(clip: NativeCityOrthoActionClip, action: NativeCityKumaActionKind, spec: KumaFrameSpec, windupScale: number)
  : KumaCombatTiming {
  // The grab's beats are the rules' (its moves json): authored at fight speed, never warped — his own (`KumaFrameSpec.grab`).
  if (action === "grab") return spec.grab;
  // A skill clip plays as drawn: its marks are the rules' (`KumaSkillMarks`).
  const skillKind = kumaSkillClipKind(clip);
  if (skillKind) return kumaSkillTiming(clip, skillKind, spec.skill?.kind === skillKind ? spec.skill : spec.skill2);
  // So does the air chase (its contacts are the rules').
  if (clip.keys?.airChase === true) return kumaAirChaseTiming(clip, spec.airChase);
  // The summon cast plays as drawn (no tempo warp): its first contact key is the release, one only (it has no blow of its own) — a volley
  if (action === "summon") {
    const art = nativeCityOrthoActionTiming(clip), release = art.hitsMs[0] ?? art.totalMs * 0.55;
    const releases = clip.keys?.volley === true && art.hitsMs.length > 1 ? art.hitsMs : [release];
    return { totalMs: Math.max(art.totalMs, releases.at(-1)! + 1), hitsMs: releases };
  }
  const art = kumaActionTiming(clip, action, spec), warp = kumaTempoWarp(clip, action, spec, windupScale);
  const timing = { totalMs: nativeCityWarpTotalMs(warp), hitsMs: art.hitsMs.map(ms => nativeCityWarpFightMs(warp, ms)) };
  const move = kumaAuthoredMove(clip), rules = move ? kumaMoveRules(move) : null;
  const withMove = rules ? { ...timing, move: rules } : timing;
  if (action !== "slam") return withMove;
  // commits, `commitLeadMs` before its first contact (2026-10-22 review: the longest held cell before his heel stood at step 0 on the male
  // clip — no glint, a commit 300 ms before the contact — and at step 1 on the female, a commit 80 ms in).
  if (spec.drawn) return { ...withMove, apexMs: Math.max(0, (timing.hitsMs[0] ?? 0) - spec.commitLeadMs) };
  // The butt slam's takeoff is its commit, its lock and its glint (where the old slam's apex hold started); the iron-ball smash's apex
  // hold (`keys.apex`).
  const takeoff = kumaTakeoffArtMs(clip);
  if (takeoff !== null) { const takeoffMs = nativeCityWarpFightMs(warp, takeoff); return { ...withMove, apexMs: takeoffMs, leap: { takeoffMs } }; }
  const apex = clip.keys?.apex;
  const apexArt = move && typeof apex === "number" ? nativeCityOrthoActionTiming(clip).startsMs[apex] ?? kumaApexMs(clip) : kumaApexMs(clip);
  return { ...withMove, apexMs: nativeCityWarpFightMs(warp, apexArt) };
}

/** A clip of his drawn swings (`keys.move`: the iron-ball swing / string / smash, the butt slam), else null. */
function kumaAuthoredMove(clip: Pick<NativeCityOrthoActionClip, "keys">): "ballSwing" | "ballCombo" | "ballSmash" | "buttSlam" | null {
  const move = clip.keys?.move;
  return move === "ballSwing" || move === "ballCombo" || move === "ballSmash" || move === "buttSlam" ? move : null;
}

/**
 * A drawn swing's rules for the fight (`native-city-kuma-moves.json`): its name, its contacts' reach beyond body contact (strides, the
 * ball's), which contacts strike on either side, and where his chase starts it.
 */
export function kumaMoveRules(move: "ballSwing" | "ballCombo" | "ballSmash" | "buttSlam"): KumaSwingMoveRules {
  const m = NATIVE_CITY_KUMA_MOVES[move] as unknown as { readonly reachExtraStrides?: readonly number[]; readonly radial?: readonly boolean[];
    readonly startStrides?: number; readonly shockwaveReachExtraStrides?: number };
  const reach = move === "buttSlam" ? [m.shockwaveReachExtraStrides ?? 0] : m.reachExtraStrides ?? [];
  return { name: move, reachExtraStrides: reach, radial: move === "buttSlam" ? [true] : m.radial ?? reach.map(() => false),
    ...(m.startStrides !== undefined ? { startStrides: m.startStrides } : {}) };
}

/** A drawn swing's rules (`kumaMoveRules`, `KumaCombatTiming.move`). */
export type KumaSwingMoveRules = NonNullable<KumaCombatTiming["move"]>;

/** The art ms a drawn move's windup speed runs to (`keys.windupTo` step, the butt slam's takeoff); null for any other clip. */
function kumaWindupEndArtMs(clip: NativeCityOrthoActionClip): number | null {
  const takeoff = kumaTakeoffArtMs(clip);
  if (takeoff !== null) return takeoff;
  const step = clip.keys?.windupTo;
  return kumaAuthoredMove(clip) && typeof step === "number" ? nativeCityOrthoActionTiming(clip).startsMs[step] ?? null : null;
}

/** The butt slam's takeoff (art ms: the start of its `keys.takeoff` step, `keys.move` "buttSlam"); null for any other clip. */
export function kumaTakeoffArtMs(clip: NativeCityOrthoActionClip): number | null {
  const step = clip.keys?.takeoff;
  return typeof step === "number" && clip.keys?.move === "buttSlam" ? nativeCityOrthoActionTiming(clip).startsMs[step] ?? null : null;
}

/** Getting up after the 3 s down: the recover frames at `getUpFrameMs`. */
export function kumaGetUpSteps(clip: KumaKeyedClip, spec: KumaFrameSpec): readonly { readonly frame: number; readonly durationMs: number }[] {
  const { recover } = hitKeys(clip), steps: { frame: number; durationMs: number }[] = [];
  for (let i = recover[0]; i <= recover[1]; i++) steps.push({ frame: kumaClipFrame(clip, i), durationMs: spec.getUpFrameMs });
  return steps;
}

/** The walk's screen pace (px/s) and one walk cycle's screen stride (px) for a body drawn `bodyPx` tall (`kumaWalkStride`). */
export function kumaWalkPace(pack: NativeCityOrthoPack, bodyPx: number): { readonly pacePxPerSec: number; readonly stridePx: number } {
  const { stridePx, cycleSec } = kumaWalkStride(pack, bodyPx);
  return { pacePxPerSec: cycleSec > 0 ? stridePx / cycleSec : 0, stridePx };
}

/** His swing's fight timing at a heading (`kumaFightTiming` on the clip he draws there; `windupScale`: the swing's own windup), else null. */
export function kumaPackFightTiming(pack: NativeCityOrthoPack, action: NativeCityKumaActionKind, facing: VillageFacing, spec: KumaFrameSpec,
  windupScale = 1, special: KumaSpecialMove | null = null): KumaCombatTiming | null {
  const found = kumaSwingClip(pack, facing, action, special);
  return found ? kumaFightTiming(found.clip, action, spec, windupScale) : null;
}

/** Fight ms from the blow to his drawn fall's lying step (`lieSequenceIndex`) at that heading, else null (no art). */
export function kumaPackFallLieMs(pack: NativeCityOrthoPack | null, facing: VillageFacing): number | null {
  const fall = pack ? nativeCityOrthoActionClip(pack, facing, "fall") : null;
  if (!fall) return null;
  const timing = nativeCityOrthoActionTiming(fall.clip), lie = fall.clip.lieSequenceIndex;
  return lie !== undefined ? timing.startsMs[lie] ?? timing.totalMs : timing.totalMs;
}

/**
 * When his KO body meets the ground (fight ms after the KO blow) at that heading: the drawn `fall` clip's ground-impact step, else the
 * procedural launch (`exchangeFx.ko.launchMs`).
 */
export function kumaPackKoImpactMs(pack: NativeCityOrthoPack | null, facing: VillageFacing): number {
  const fall = pack ? nativeCityOrthoActionClip(pack, facing, "fall") : null, launchMs = NATIVE_CITY_COMBAT.exchangeFx.ko.launchMs;
  return fall ? nativeCityOrthoActionTiming(fall.clip).hitsMs[0] ?? launchMs : launchMs;
}

/** His get-up's length at that heading (the hit clip's recover frames at `down.getUpFrameMs`; 500 without art). */
export function kumaPackGetUpMs(pack: NativeCityOrthoPack | null, facing: VillageFacing, spec: KumaFrameSpec): number {
  const clip = pack ? nativeCityOrthoActionClip(pack, facing, "hit")?.clip ?? null : null;
  return clip ? stepsTotal(kumaGetUpSteps(clip, spec)) : 500;
}

/**
 * The bowling tackle's pop-out and landing (`native-city-kuma-moves.json` bowling `popMs` / `landMs`) when his dash at that heading is drawn
 * as the bowl (`kumaMoveClip`); null for the plain dash or without art.
 */
export function kumaPackDashLanding(pack: NativeCityOrthoPack | null, facing: VillageFacing, special: KumaSpecialMove | null = null)
  : KumaDashLanding | null {
  const found = pack ? kumaMoveClip(pack, facing, "dash", special) : null, move = kumaDashMove(found?.clip);
  if (!found || !move) return null;
  return { move: found.move === "bowl" ? "bowl" : "rollRise", popMs: kumaMoveStepsMs(move.popSteps),
    ...(move.reachExtraStrides !== null ? { reachExtraStrides: move.reachExtraStrides } : {}) };
}

/**
 * What his pack says to the rules (`NativeCityKumaArtBridge`): his swings' fight timing and drawn headings, the walk's pace and stride
 * (`kumaWalkPace`), the run's cycle, and per heading the drawn fall's lying step and ground impact, the break's and the get-up's lengths.
 * It reads the pack's data only, never whether his fight sheets have loaded (2026-10-11 — before, he did not swing and took the authored
 * break / get-up lengths until ~11 MiB of sheets were in, so the fight's opening seconds depended on the download): the view draws a
 * stand-in over the same beats until they are. A null pack (his view still loading — he is absent then) answers the authored defaults and
 * no swing. The view keeps one while his pack and walk measure stay (`NativeCityKumaView.fightArt`); a rule test builds it once from his JSON pack.
 * Each answer is kept by its arguments (2026-10-30): the pack and `spec` never change under a bridge, and the fight step asks every step —
 * working them out again was a tenth of a bout's time. The answers are shared, so they are never mutated (all `readonly`).
 */
export function nativeCityKumaArtBridge(pack: NativeCityOrthoPack | null,
  measure: { readonly pacePxPerSec: number; readonly stridePx: number }, spec: KumaFrameSpec): NativeCityKumaArtBridge {
  const { pacePxPerSec, stridePx } = measure;
  const hurtClip = (facing: VillageFacing) => pack ? nativeCityOrthoActionClip(pack, facing, "hit")?.clip ?? null : null;
  const timings = new Map<string, KumaCombatTiming | null>(), landings = new Map<string, KumaDashLanding | null>();
  let runStride: number | null = null;
  return {
    timing: (action: NativeCityKumaActionKind, facing: VillageFacing, windupScale = 1, special: KumaSpecialMove | null = null) =>
      kept(timings, `${action}|${facing}|${windupScale}|${special}`,
        () => pack ? kumaPackFightTiming(pack, action, facing, spec, windupScale, special) : null),
    artFacing: pack ? kumaPackArtFacing(pack) : undefined,
    pacePxPerSec, stridePx,
    runStridePx: () => runStride ??= pack ? kumaRunStridePx(pack, pacePxPerSec, spec) : stridePx,
    fallMs: perFacing(facing => kumaPackFallLieMs(pack, facing)),
    breakMs: perFacing(facing => kumaBreakMs(hurtClip(facing))),
    getUpMs: perFacing(facing => kumaPackGetUpMs(pack, facing, spec)),
    koImpactMs: perFacing(facing => kumaPackKoImpactMs(pack, facing)),
    dashLanding: (facing, special = null) => kept(landings, `${facing}|${special}`, () => kumaPackDashLanding(pack, facing, special)),
  };
}

/** Past this many keys a bridge answer is worked out without being kept (a few headings × moves × windup rates is far below it). */
const ART_BRIDGE_KEPT_MAX = 512;

/** The answer kept under `key` in `answers`, else `answer()` (kept while there is room). Answers are never `undefined`. */
function kept<R extends object | number | null>(answers: Map<string, R>, key: string, answer: () => R): R {
  const found = answers.get(key);
  if (found !== undefined) return found;
  const value = answer();
  if (answers.size < ART_BRIDGE_KEPT_MAX) answers.set(key, value);
  return value;
}

/** `answer` per heading, worked out once each (the headings are a handful). */
function perFacing<R extends number | null>(answer: (facing: VillageFacing) => R): (facing: VillageFacing) => R {
  const answers = new Map<VillageFacing, R>();
  return facing => {
    const found = answers.get(facing);
    if (found !== undefined) return found;
    const value = answer(facing);
    answers.set(facing, value);
    return value;
  };
}
