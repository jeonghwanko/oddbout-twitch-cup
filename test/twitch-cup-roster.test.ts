import { describe, expect, it } from "vitest";
import { twitchCupFighterFor, twitchCupRoster } from "../src/app/TwitchCupRoster";

const shipped = ["kuma", "yume", "bravow"];
const fixtureOne = { id: "abc00194-0000-4000-8000-000000000001", name: "Fixture One", names: { en: "Fixture One" }, duelApproved: true };

describe("Twitch Cup roster", () => {
  it("lists approved registered fighters after the shipped ones, once each", () => {
    const roster = twitchCupRoster(shipped, [
      fixtureOne,
      { id: "abc002e4-0000-4000-8000-000000000002", name: "Fixture Two", names: { en: "Fixture Two" }, duelApproved: true },
      { id: "abc0032b-0000-4000-8000-000000000003", name: "Unentered", duelApproved: false },
      { id: "abc00411-0000-4000-8000-000000000004", name: "Unknown" },
      fixtureOne,
    ]);
    expect(roster.map(fighter => [fighter.kind, fighter.command, fighter.label])).toEqual([
      ["fighter", "kuma", "kuma"], ["fighter", "yume", "yume"], ["fighter", "bravow", "bravow"],
      ["registered", "fixtureone", "Fixture One"], ["registered", "fixturetwo", "Fixture Two"],
    ]);
    expect(roster[3]!.id).toBe(fixtureOne.id);
  });

  it("names a registered fighter by his English name, else his identity name, keeping only a-z0-9", () => {
    const roster = twitchCupRoster([], [
      { id: "abc0059f-0000-4000-8000-000000000005", name: "Fixture Three", names: { ko: "Fixture Three" }, duelApproved: true },
      { id: "abc0060a-0000-4000-8000-000000000006", name: "Fixture Four", names: { en: "Fixture-Jab 2!" }, duelApproved: true },
    ]);
    expect(roster.map(fighter => fighter.command)).toEqual(["fixturethree", "fixturejab2"]);
  });

  it("falls back to f + the id's first 6 hex for an empty name or one already held", () => {
    const roster = twitchCupRoster(shipped, [
      { id: "abc007ea-0000-4000-8000-000000000007", name: "예시 이름", duelApproved: true },
      { id: "abc0081e-0000-4000-8000-000000000008", name: "KUMA", duelApproved: true },
      { id: "abc009e7-0000-4000-8000-000000000009", name: "", duelApproved: true },
      // Same first 6 hex as the one above: the next character keeps it apart.
      { id: "abc009e8-0000-4000-8000-00000000000a", name: "", duelApproved: true },
    ]);
    expect(roster.slice(3).map(fighter => fighter.command)).toEqual(["fabc007", "fabc008", "fabc009e", "fabc009"]);
    expect(new Set(roster.map(fighter => fighter.command)).size).toBe(roster.length);
  });

  it("keeps the older fighter's command when a newer one takes the same name (the registry lists the newest first)", () => {
    const newcomer = { id: "abc009e7-0000-4000-8000-000000000009", name: "Fixture One", duelApproved: true };
    const before = twitchCupRoster(shipped, [fixtureOne]), after = twitchCupRoster(shipped, [newcomer, fixtureOne]);
    expect(twitchCupFighterFor(before, "fixtureone")).toBe(fixtureOne.id);
    expect(twitchCupFighterFor(after, "fixtureone")).toBe(fixtureOne.id);
    expect(after.slice(3).map(fighter => [fighter.id, fighter.command])).toEqual([[newcomer.id, "fabc009"], [fixtureOne.id, "fixtureone"]]);
  });

  it("maps a typed command to its fighter in any case and ignoring characters outside a-z0-9, and nothing else", () => {
    const roster = twitchCupRoster(shipped, [fixtureOne]);
    expect(twitchCupFighterFor(roster, "fixtureone")).toBe(fixtureOne.id);
    expect(twitchCupFighterFor(roster, "FiXtUrEoNe")).toBe(fixtureOne.id);
    expect(twitchCupFighterFor(roster, "fi-xt_ureone")).toBe(fixtureOne.id);
    expect(twitchCupFighterFor(roster, "kuma")).toBe("kuma");
    expect(twitchCupFighterFor(roster, fixtureOne.id)).toBeNull();
    expect(twitchCupFighterFor(roster, "nobody")).toBeNull();
    expect(twitchCupFighterFor(roster, "-_-")).toBeNull();
  });
});
