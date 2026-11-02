import { sanitizeManorMemory } from "./ManorMemoryRules";
import { sanitizeGrievesStory } from "./GrievesStoryRules";
import { sanitizeFemalePrologue } from "./FemalePrologueRules";
import { sanitizeFollowLessonMemory } from "./FollowLessonRules";
import type { MetaState } from "./MetaProgressRules";
import { sanitizeBlackthorneStory } from "./BlackthorneStoryRules";
import type { UpgradeId } from "./MetaProgressRules";
import {
  TUTORIAL_ONBOARDING_VERSION,
  ONBOARDING_VERB_IDS,
  UPGRADES,
  createMeta,
  persistentEscapeId,
  persistentTacticId,
  MASTERY_DISCOVERIES,
} from "./MetaProgressRules";
import { normalizeToolLoadout } from "./ToolRules";
import { sanitizeWeaponMods } from "./WeaponModRules";
import { isCharacterId } from "./CharacterRules";
import { CALLING_CARD_IDS, type CallingCardId } from "./CallingCardIds";
import { sanitizeCampaignMemory } from "./CampaignProgressRules";
import { isFirstOutfitPhase } from "./FirstOutfitRules";
import { sanitizeVillageStoryMemory } from "./VillageStoryRules";
import { sanitizeOtherworldState } from "./OtherworldItemRules";
import { sanitizeBlackthorneGuestList } from "./BlackthorneGuestListRules";
import { sanitizeOttoCampaign } from "./OttoCampaignRules";
import { sanitizeNativeCityRecords } from "./NativeCityRecordsRules";
import { sanitizeCityFightWins } from "./CityFightRewardRules";
import { sanitizeCityTournament } from "./tournament/CityTournamentRules";

/**
 * 메타 저장 직렬화.
 *
 * 저장 데이터가 손상되었다고 게임이 죽어서는 안 된다. 파싱 실패는 조용히
 * 기본값으로 복구한다 — 웹게임에서 저장 손상은 흔하고, 그때 플레이어에게
 * 보여줄 수 있는 최악의 화면은 검은 화면이다.
 */

/**
 * 저장 형식은 v6 하나다(2026-10-11 — 개발 중이라 옛 형식 이관을 모두 지웠다). 다른 version 은 읽지 않고 새 저장으로 시작한다.
 * 키 문자열(`.v1`)은 배포된 주소라 그대로 둔다.
 *
 * 저장소 키의 SSOT 는 `platform/storageKeys.ts` 다. 이 하나만 리터럴이 여기 남는데,
 * `sim` 이 `platform` 을 import 하면 순수성 가드가 깨지기 때문이다. 레지스트리는
 * 반대 방향으로 이 상수를 재수출해 `STORAGE_KEYS.meta` 로 합류시킨다.
 */
export const META_STORAGE_KEY = "kaito_web.meta.v1";

/** 지금 저장 형식. 이 값이 아닌 저장은 읽지 않는다. */
export const META_VERSION = 6;

export function serializeMeta(meta: MetaState): string {
  return JSON.stringify(meta);
}

export function parseMeta(raw: string | null, fallback: MetaState = createMeta()): MetaState {
  if (raw === null || raw === "") return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fallback;
    if ((parsed as Record<string, unknown>)["version"] !== META_VERSION) return fallback;
    return sanitize(parsed);
  } catch {
    return fallback;
  }
}

function sanitize(input: unknown): MetaState {
  const base = createMeta();
  if (typeof input !== "object" || input === null || Array.isArray(input)) return base;
  const record = input as Record<string, unknown>;

  const upgrades: Partial<Record<UpgradeId, number>> = {};
  const rawUpgrades = record["upgrades"];
  if (typeof rawUpgrades === "object" && rawUpgrades !== null) {
    for (const node of UPGRADES) {
      const value = (rawUpgrades as Record<string, unknown>)[node.id];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      // 알 수 없는 키는 버리고, 알려진 키도 상한을 넘지 못하게 한다.
      upgrades[node.id] = Math.max(0, Math.min(node.maxLevel, Math.floor(value)));
    }
  }

  const rawStats = record["stats"];
  const stats =
    typeof rawStats === "object" && rawStats !== null
      ? (rawStats as Record<string, unknown>)
      : {};

  const rawCharacter = record["character"];
  const character = isCharacterId(rawCharacter) ? rawCharacter : base.character;
  const requestedDiscoveries = new Set(
    Array.isArray(record["discoveries"])
      ? record["discoveries"].filter((value): value is string => typeof value === "string")
      : [],
  );
  const discoveries: MetaState["discoveries"][number][] = [];
  // 저장 순서나 변조 여부와 무관하게 정규 트리 순서로 복구하고, 선행 수법이
  // 없는 상위 단계는 효과까지 새지 않도록 버린다.
  for (const discovery of MASTERY_DISCOVERIES) {
    if (!requestedDiscoveries.has(discovery.id)) continue;
    if (discovery.requires !== undefined && !discoveries.includes(discovery.requires)) continue;
    discoveries.push(discovery.id);
  }
  const requestedClears = new Set(
    Array.isArray(record["clearedCallingCardIds"])
      ? record["clearedCallingCardIds"].filter((value): value is string => typeof value === "string")
      : [],
  );
  const clearedCallingCardIds = CALLING_CARD_IDS
    .filter((cardId): cardId is CallingCardId => requestedClears.has(cardId));
  const rawOnboarding = record["onboarding"];
  const onboarding =
    typeof rawOnboarding === "object" && rawOnboarding !== null
      ? (rawOnboarding as Record<string, unknown>)
      : {};
  const checkpointId = onboarding["checkpointId"];
  const requestedLearnedVerbs = new Set(
    Array.isArray(onboarding["learnedVerbs"])
      ? onboarding["learnedVerbs"].filter((value): value is string => typeof value === "string")
      : [],
  );
  const learnedVerbs = ONBOARDING_VERB_IDS.filter((verb) => requestedLearnedVerbs.has(verb));
  const rawFirstOutfit = record["firstOutfit"];
  const firstOutfitRecord = typeof rawFirstOutfit === "object" && rawFirstOutfit !== null
    ? rawFirstOutfit as Record<string, unknown>
    : null;
  const firstOutfit = firstOutfitRecord !== null && isFirstOutfitPhase(firstOutfitRecord["phase"])
    ? { phase: firstOutfitRecord["phase"] }
    : base.firstOutfit;
  const rawVillage = record["village"];
  const village = typeof rawVillage === "object" && rawVillage !== null ? rawVillage as Record<string, unknown> : {};
  const ottoCampaign = sanitizeOtherworldState(record["otherworld"]).landed ? sanitizeOttoCampaign(record["ottoCampaign"]) : undefined;
  // 도시 기록 조사도 블랙손 탈출 뒤에만 열린다. 그 전 기록(옛 시험판)은 새 조사로 읽는다.
  const nativeCityRecords = record["blackthorneCompleted"] === true ? sanitizeNativeCityRecords(record["nativeCityRecords"]) : undefined;
  const cityFightWins = sanitizeCityFightWins(record["cityFightWins"]);
  const cityTournament = sanitizeCityTournament(record["cityTournament"]);
  return {
    version: META_VERSION,
    village: {
      story: sanitizeVillageStoryMemory(village["story"]),
      rosalineEscortDone: village["rosalineEscortDone"] === true,
    },
    manorMemory: sanitizeManorMemory(record["manorMemory"]),
    ...(record["grievesStory"] === undefined ? {} : { grievesStory: sanitizeGrievesStory(record["grievesStory"]) }),
    blackthorneCompleted: record["blackthorneCompleted"] === true,
    ...(record["otherworld"] === undefined ? {} : { otherworld: sanitizeOtherworldState(record["otherworld"]) }),
    ...(record["blackthorneGuestList"] === undefined ? {} : { blackthorneGuestList: sanitizeBlackthorneGuestList(record["blackthorneGuestList"]) }),
    // 오토 사건은 자판기 강림 이후다. 블랙손 이전의 실제 개입·격파도 보존한다.
    ...(ottoCampaign === undefined ? {} : { ottoCampaign }),
    ...(nativeCityRecords === undefined ? {} : { nativeCityRecords }),
    ...(cityFightWins === undefined ? {} : { cityFightWins }),
    ...(cityTournament === undefined ? {} : { cityTournament }),
    ...(record["blackthorneStory"] === undefined ? {} : {
      blackthorneStory: sanitizeBlackthorneStory(record["blackthorneStory"], record["blackthorneCompleted"] === true),
    }),
    characterSelected: record["characterSelected"] === true,
    character,
    ...(record["femaleLook"] === "authored" || record["femaleLook"] === "personal" ? { femaleLook: record["femaleLook"] } : {}),
    firstOutfit,
    ...(record["femalePrologue"] === undefined ? {} : { femalePrologue: sanitizeFemalePrologue(record["femalePrologue"]) }),
    toolLoadout: normalizeToolLoadout(record["toolLoadout"]),
    weaponMods: sanitizeWeaponMods(record["weaponMods"]),
    onboarding: {
      callingCardBriefed: onboarding["callingCardBriefed"] === true,
      tutorialVersion: TUTORIAL_ONBOARDING_VERSION,
      openingCompleted: onboarding["openingCompleted"] === true,
      trainingCompleted: onboarding["trainingCompleted"] === true,
      villageIntroCompleted: onboarding["villageIntroCompleted"] === true,
      learnedVerbs,
      lessons: sanitizeFollowLessonMemory(onboarding["lessons"]),
      checkpointId: typeof checkpointId === "string" && checkpointId.trim() !== "" ? checkpointId : null,
      dismissed: onboarding["dismissed"] === true,
    },
    gold: nonNegative(record["gold"]),
    fame: nonNegative(record["fame"]),
    upgrades,
    discoveries,
    clearedCallingCardIds,
    campaign: sanitizeCampaignMemory(record["campaign"], clearedCallingCardIds.length, record["blackthorneCompleted"] === true),
    stats: {
      runs: nonNegative(stats["runs"]),
      escapes: nonNegative(stats["escapes"]),
      busted: nonNegative(stats["busted"]),
      bestPayout: nonNegative(stats["bestPayout"]),
      lastEscapeId: persistentEscapeId(stats["lastEscapeId"]),
      lastTactic: persistentTacticId(stats["lastTactic"]),
    },
  };
}

function nonNegative(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}
