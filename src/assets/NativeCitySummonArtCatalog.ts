import art from "./native-city-summon-fx.json";
import type { SpriteSheetAssetDefinition } from "./RuntimeArtTypes";
import type { CityFightSummonKind } from "../sim/cityFight/CityFightSummonTuning";

/**
 * 마을 대결 소환물의 원화(2026-10-20, docs/kaito-web/city-fight-summons.md): 종이학·스포츠카·로드스터·번개 화살·드릴의 옆모습 시트(오른쪽을 본다)와
 * 로드스터 분사의 수증기. 출처와 프롬프트는
 * `assets/art/summons-20261020/`, 런타임 WebP 는 `public/art/fx/summons-20261020/`(`tools/art/import-summon-art.mjs`가 만든다). 뷰는 싸움에
 * 소환물이 처음 나올 때 받는다(`NativeCitySummonView`).
 */
export interface NativeCitySummonArt extends SpriteSheetAssetDefinition {
  /** The drawn object's share of a cell's width (it is sized to its rule body). */
  readonly bodyShare: number;
  /** Drawn length ÷ its rule body along the stage line (`halfLengthStrides` × 2): the crane's wingspan, a car's bumpers. */
  readonly lengthScale: number;
  /** The cell point on the object's centre (x) and its ground / lift line (y), in cell shares. */
  readonly pivot: readonly [number, number];
  /** Each cell's own body centre (x, cell share): a cell drawn off-centre is anchored on its body, so switching cells never jumps. */
  readonly centres: readonly number[];
  readonly travel: readonly number[];
  readonly travelFrameMs: number;
  readonly tell: readonly number[];
  /** The headlight beams drawn out of its nose through the tell (cell; its centre line and the headlights' height, cell shares); null: none. */
  readonly beam: { readonly frame: number; readonly pivotY: number; readonly headlightY: number } | null;
  /** Its fold when it ends (the crane): the pop cell and scale, the scraps cell, their timings and the fall; null: it just goes. */
  readonly burst: { readonly pop: number; readonly scraps: number; readonly popScale: number; readonly popMs: number; readonly scrapsMs: number;
    readonly fallMs: number; readonly dropShare: number } | null;
  /** The roll it does once it has passed a body: its cell and length; null: none. */
  readonly flourish: { readonly frame: number; readonly ms: number } | null;
  /**
   * A `strike`'s cells per rule phase (2026-10-20 — the drill, the roadster): `frames` looped at `frameMs`, or played once over the phase
   * without it. Absent: not a strike.
   */
  readonly phases?: Readonly<Partial<Record<"tell" | "travel" | "charge" | "active" | "recover", NativeCitySummonPhaseArt>>>;
  /** The cloud drawn on the ground under its blast (the roadster's vapour): the sheet, its cells through the active window and the recovery. */
  readonly blastFx?: { readonly sheet: "vapor"; readonly active: readonly number[]; readonly recover: readonly number[]; readonly lengthScale: number };
  /** A caster's drawing flies at its own height (actor-height share; the eye lasers at the eyes): absent, the kind's `liftShare`. */
  readonly liftShare?: number;
  /** Drawn this see-through (a caster's drawing — the clone running in): absent, 1. */
  readonly alpha?: number;
}

/** One phase's cells (`NativeCitySummonArt.phases`); `scale`: drawn this much bigger (the drill's eruption over its true-size crack). */
export interface NativeCitySummonPhaseArt {
  readonly frames: readonly number[];
  readonly frameMs?: number;
  readonly scale?: number;
}

type SheetJson = Omit<NativeCitySummonArt, "key" | "path"> & { readonly image: string; readonly dir?: string };

function sheet(name: CityFightSummonKind | "vapor"): NativeCitySummonArt {
  return sheetOf(`native-city-summon-${name}`, art[name] as unknown as SheetJson);
}

function sheetOf(key: string, a: SheetJson): NativeCitySummonArt {
  return Object.freeze({ key, path: `art/fx/${a.dir ?? "summons-20261020"}/${a.image}`, frameWidth: a.frameWidth,
    frameHeight: a.frameHeight, columns: a.columns, rows: a.rows, bodyShare: a.bodyShare, lengthScale: a.lengthScale,
    pivot: [a.pivot[0], a.pivot[1]] as const, centres: a.centres, travel: a.travel, travelFrameMs: a.travelFrameMs, tell: a.tell, beam: a.beam, burst: a.burst,
    flourish: a.flourish, ...(a.phases ? { phases: a.phases } : {}), ...(a.blastFx ? { blastFx: a.blastFx } : {}),
    ...(a.liftShare !== undefined ? { liftShare: a.liftShare } : {}), ...(a.alpha !== undefined ? { alpha: a.alpha } : {}) });
}

export const NATIVE_CITY_SUMMON_ART: Readonly<Record<CityFightSummonKind, NativeCitySummonArt>> = Object.freeze({
  crane: sheet("crane"), sportsCar: sheet("sportsCar"), roadster: sheet("roadster"), bolt: sheet("bolt"), drill: sheet("drill"),
  bullet: sheet("bullet"),
});


export const NATIVE_CITY_SUMMON_CASTER_ART: Readonly<Record<string, Readonly<Partial<Record<CityFightSummonKind, NativeCitySummonArt>>>>> = Object.freeze(
  Object.fromEntries(Object.entries((art as unknown as { readonly casters?: Readonly<Record<string, Readonly<Record<string, SheetJson>>>> }).casters ?? {})
    .map(([caster, kinds]) => [caster, Object.freeze(Object.fromEntries(Object.entries(kinds)
      .map(([kind, a]) => [kind, sheetOf(`native-city-summon-${caster}-${kind}`, a)])))])));

/** The drawing of a summon of `kind` cast by `casterId`: his own (`NATIVE_CITY_SUMMON_CASTER_ART`), else the kind's. */
export function nativeCitySummonArt(kind: CityFightSummonKind, casterId?: string | null): NativeCitySummonArt {
  return (casterId ? NATIVE_CITY_SUMMON_CASTER_ART[casterId]?.[kind] : undefined) ?? NATIVE_CITY_SUMMON_ART[kind];
}

/** Sheets drawn with a summon but not one of their own (2026-10-20: the vapour cloud under the roadster's blast — `blastFx`). */
export const NATIVE_CITY_SUMMON_FX_ART: Readonly<Record<"vapor", NativeCitySummonArt>> = Object.freeze({ vapor: sheet("vapor") });

export const NATIVE_CITY_SUMMON_ART_FILE_PATHS: readonly string[] = Object.freeze([...Object.values(NATIVE_CITY_SUMMON_ART),
  ...Object.values(NATIVE_CITY_SUMMON_FX_ART), ...Object.values(NATIVE_CITY_SUMMON_CASTER_ART).flatMap(kinds => Object.values(kinds))]
  .map(entry => entry.path));
