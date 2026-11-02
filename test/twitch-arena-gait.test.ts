import type Phaser from "phaser";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CITY_FIGHTER_IDS } from "../src/sim/cityFight/CityFighterIds";
import { cityFighterPack, loadCityFighterPack } from "../src/render/art/CityFighterPacks";
import { nativeCityOrthoClip, nativeCityOrthoClipSheets, nativeCityOrthoGaitAssets,
  type NativeCityOrthoPack } from "../src/assets/NativeCityOrthoPack";
import { kumaVillageSheets } from "../src/render/art/NativeCityKumaArt";
import type { SceneScope } from "../src/render/lifecycle/SceneScope";
import type { NativeCityKumaProfile } from "../src/render/view/NativeCityKumaPoser";
import type { SpriteSheetAssetDefinition } from "../src/assets/RuntimeArtTypes";

vi.mock("phaser", () => ({ default: {} }));
vi.mock("../src/render/art/RegisteredArenaFighters", () => ({ registeredArenaPack: () => null }));
vi.mock("../src/render/view/NativeCityHitOutline", () => ({ NativeCityHitOutline: class {} }));
vi.mock("../src/render/view/NativeCityPoseTrail", () => ({ NativeCityPoseTrail: class {} }));
vi.mock("../src/render/view/FighterMoveFxView", () => ({ FighterMoveFxView: class { setPack(): void {} } }));
vi.mock("../src/render/view/GunshotFxView", () => ({ GunshotFxView: class { setPack(): void {} } }));
const { arenaFighterSheets } = await import("../src/render/scenes/arena/ArenaAssetPreload");
const { NativeCityKumaView } = await import("../src/render/view/NativeCityKumaView");

beforeAll(async () => { await Promise.all(CITY_FIGHTER_IDS.map(loadCityFighterPack)); });

function sideStanding(pack: NativeCityOrthoPack): SpriteSheetAssetDefinition[] {
  const sheets = ["left", "right"].flatMap(facing => ["idle", "walk"].flatMap(gait =>
    nativeCityOrthoClipSheets(nativeCityOrthoClip(pack, facing as "left" | "right", gait as "idle" | "walk"))));
  return [...new Map(sheets.map(sheet => [sheet.key, sheet])).values()];
}
const keys = (sheets: readonly SpriteSheetAssetDefinition[]) => sheets.map(sheet => sheet.key).sort();

async function standingView(pack: NativeCityOrthoPack, arena: boolean, supplied = true) {
  const available = new Set(sideStanding(pack).map(sheet => sheet.key));
  const preload = vi.fn<(sheets: readonly SpriteSheetAssetDefinition[]) => void>();
  const sprite = { setVisible: () => sprite, setName: () => sprite, setBlendMode: () => sprite,
    setInteractive: () => sprite, on: () => sprite };
  const scene = { add: { sprite: () => sprite } } as unknown as Phaser.Scene;
  const profile: NativeCityKumaProfile = { ...(supplied ? { pack } : {}),
    ...(arena ? { arenaMotion: {} as NonNullable<NativeCityKumaProfile["arenaMotion"]> } : {}) };
  const view = new NativeCityKumaView(scene, { add: vi.fn() } as unknown as SceneScope, undefined, null, "kuma", profile,
    { textureKey: key => available.has(key) ? key : null, preload, family: vi.fn() }, () => { throw new Error("No simulation step during loading"); });
  await vi.dynamicImportSettled();
  for (let i = 0; i < 4; i++) await Promise.resolve();
  return { view, available, requested: preload.mock.calls.flatMap(([sheets]) => sheets) };
}

describe("arena standing gait assets", () => {
  it.each(CITY_FIGHTER_IDS)("keeps %s's exact side clips and excludes other standing headings from preload and readiness", async id => {
    const pack = cityFighterPack(id)!;
    expect(pack).not.toBeNull();
    const expected = sideStanding(pack), standing = nativeCityOrthoGaitAssets(pack, ["idle", "walk"]);
    const standingKeys = new Set(standing.map(sheet => sheet.key));
    const preloadedStanding = arenaFighterSheets(id).filter(sheet => standingKeys.has(sheet.key));
    expect(keys(preloadedStanding)).toEqual(keys(expected));
    for (const sheet of expected) expect(preloadedStanding).toContainEqual(sheet);
    const { view, requested } = await standingView(pack, true);
    expect(requested).toEqual(expected);
    expect(view.artReady).toBe(true);
  });

  it.each(CITY_FIGHTER_IDS)("preserves %s's existing supplied-pack village gait loading", async id => {
    const pack = cityFighterPack(id)!, expected = nativeCityOrthoGaitAssets(pack, ["idle", "walk"]);
    const { view, available, requested } = await standingView(pack, false);
    expect(requested).toEqual(expected);
    if (expected.some(sheet => !available.has(sheet.key))) expect(view.artReady).toBe(false);
    for (const sheet of expected) available.add(sheet.key);
    expect(view.artReady).toBe(true);
  });

  it("preserves the default village KUMA path without a supplied pack", async () => {
    const pack = cityFighterPack("kuma")!;
    const { requested } = await standingView(pack, false, false);
    expect(requested).toEqual(kumaVillageSheets(pack));
  });

  it("keeps side-only registered-style packs mirrored without inventing another heading", async () => {
    const pack = { ...cityFighterPack("yume")!, directions: { side: cityFighterPack("yume")!.directions.side } } as NativeCityOrthoPack;
    const { view, requested } = await standingView(pack, true);
    expect(requested).toEqual(sideStanding(pack));
    expect(new Set(keys(requested)).size).toBe(requested.length);
    expect(view.artReady).toBe(true);
  });
});
