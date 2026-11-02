import type { MasteryDiscovery } from "../sim/MetaProgressRules";
import type { IntelId } from "../sim/types";
import type { LootId } from "../sim/LootRules";
import type { ToolId } from "../sim/ToolRules";
import type { MansionSignatureRoom, TacticResponse } from "../sim/MansionLayout";
import type { TacticId } from "../sim/TacticRules";
import type { Locale } from "./Locale";
import { hasString, t, type StringKey } from "./i18n";

const HANGUL = /[가-힣]/u;

export function lootName(lootId: LootId, fallback: string, locale: Locale): string {
  return locale === "en" ? t(locale, `heist.loot.${lootId}.name`) : fallback;
}

export function toolPresentation(
  toolId: ToolId,
  fallback: { readonly name: string; readonly short: string; readonly description: string },
  locale: Locale,
) {
  if (locale !== "en") return fallback;
  return Object.freeze({
    name: t(locale, `heist.tool.${toolId}.name`),
    short: t(locale, `heist.tool.${toolId}.short`),
    description: t(locale, `heist.tool.${toolId}.description`),
  });
}

export function intelName(intelId: IntelId, fallback: string, locale: Locale): string {
  return locale === "en" ? t(locale, `heist.intel.${intelId}.name`) : fallback;
}

/**
 * 퇴로 이름. 한국어는 레이아웃 값을 그대로 쓰고, 영어는 id 로 표에서 찾는다.
 * 표에 없는 id 의 한국어 이름은 영어 화면에 새지 않게 일반 명사로 바꾼다.
 */
export function exitName(exitId: string, fallback: string, locale: Locale): string {
  if (locale !== "en") return fallback;
  const key = `heist.exit.${exitId}.name`;
  if (hasString(key)) return t(locale, key as Extract<StringKey, `heist.exit.${string}.name`>);
  return HANGUL.test(fallback) ? t(locale, "heist.exit.unknown") : fallback;
}

export function signatureRoomPresentation(
  room: MansionSignatureRoom,
  locale: Locale,
): { readonly name: string; readonly rule: string } {
  if (locale !== "en") return room;
  switch (room.id) {
    case "clockwork-ballroom":
    case "moonlit-conservatory":
    case "crimson-proscenium":
      return {
        name: t(locale, `heist.signatureRoom.${room.id}.name`),
        rule: t(locale, `heist.signatureRoom.${room.id}.rule`),
      };
    default:
      return room;
  }
}

export function tacticResponsePresentation(
  response: TacticResponse,
  locale: Locale,
): { readonly title: string; readonly counter: string; readonly weakness: string } {
  if (locale !== "en") return response;
  return {
    title: t(locale, `heist.tacticResponse.${response.tactic}.title`),
    counter: t(locale, `heist.tacticResponse.${response.tactic}.counter`),
    weakness: t(locale, `heist.tacticResponse.${response.tactic}.weakness`),
  };
}

/** 지난 밤 수법의 이름(저택 기억·초대 결과). ko 는 sim/TacticRules 의 TACTIC_LABELS 와 같다. */
export function tacticLabel(tactic: TacticId, locale: Locale): string {
  return t(locale, `heist.tactic.${tactic}.label`);
}

export function masteryDiscoveryPresentation(discovery: MasteryDiscovery, locale: Locale): { readonly name: string; readonly effect: string } {
  if (locale !== "en") return { name: discovery.name, effect: discovery.nextRunEffect };
  switch (discovery.id) {
    case "escape-knot": return { name: "Sleeve Escape Knot", effect: "+1 restraint escape" };
    case "shadow-slip": return { name: "Shadow Slip", effect: "Vent speed +35% · Footstep radius −15%" };
    case "velvet-fall": return { name: "Velvet Breakfall", effect: "+1 restraint escape · Stamina +20" };
    case "stolen-minute": return { name: "Fifteen Stolen Seconds", effect: "+15s on every heist" };
    case "servant-passages": return { name: "Servants’ Passage Map", effect: "Lockpicking +2 · All movement +8%" };
    case "clock-thief": return { name: "Clock Thief", effect: "Time +30s · Skill gain +25%" };
  }
}
