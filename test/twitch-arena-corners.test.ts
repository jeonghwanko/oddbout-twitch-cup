import type Phaser from "phaser";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArenaDuelData } from "../src/app/ArenaDuel";

vi.mock("phaser", () => ({ default: {} }));
const { setRegisteredArenaRoster } = await import("../src/app/ArenaRoster");
const { arenaDuelCorners } = await import("../src/render/scenes/arena/ArenaDuelAssets");

const fixtureOne = "abc00194-0000-4000-8000-000000000001", fixtureTwo = "abc00a16-0000-4000-8000-00000000000b";
const scene = {} as Phaser.Scene;
const broadcast: NonNullable<ArenaDuelData["broadcast"]> = { onReady: () => {}, onResult: () => {}, onError: () => {} };
const bout = (a: string, b: string, extra: Partial<ArenaDuelData> = {}): ArenaDuelData => ({ a, b, seed: 1, matchId: "m", ...extra });

describe("Twitch Cup bout engine", () => {
  afterEach(() => setRegisteredArenaRoster([]));

  it("fights two registered fighters on the cup engine in a Twitch Cup bout, and on the registered duel elsewhere", () => {
    setRegisteredArenaRoster([fixtureOne, fixtureTwo].map(id => ({ id, kind: "registered" as const, name: id, manifestSha256: "0".repeat(64), duelApproved: true })));
    expect(arenaDuelCorners(scene, bout(fixtureOne, fixtureTwo, { broadcast }))).toMatchObject({ mine: [true, true], builtIn: true });
    expect(arenaDuelCorners(scene, bout(fixtureOne, fixtureTwo))).toMatchObject({ mine: [false, false], builtIn: false });
  });

  it("leaves shipped and mixed Twitch Cup bouts on the engine they had", () => {
    setRegisteredArenaRoster([{ id: fixtureOne, kind: "registered", name: "Fixture One", manifestSha256: "0".repeat(64), duelApproved: true }]);
    expect(arenaDuelCorners(scene, bout("kuma", "yume", { broadcast }))).toMatchObject({ mine: [false, false], builtIn: true });
    expect(arenaDuelCorners(scene, bout(fixtureOne, "kuma", { broadcast }))).toEqual(arenaDuelCorners(scene, bout(fixtureOne, "kuma")));
  });
});
