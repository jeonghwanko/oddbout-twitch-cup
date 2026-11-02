import type { DialogueLine } from "./Dialogue";
import type { Locale } from "./Locale";
import { localeText } from "./Locale";
import type { MetaState } from "../sim/MetaProgressRules";
import { birdReturnPending } from "../sim/BlackthorneStoryRules";
import { commitNativeCityRecords, nativeCityRecordsOf } from "../sim/NativeCityRecordsRules";

/** The parcel case follows the complete manor run and the clockmaker's acknowledgement. */
export function nativeCityStoryAvailable(meta: MetaState): boolean {
  return meta.blackthorneCompleted === true && !birdReturnPending(meta);
}

/** Progress for the optional five-view provenance case. Saved per slot in `MetaState.nativeCityRecords` once an encounter ends. */
export interface NativeCityStoryState {
  /** Encounter index, 0..6; 7 means the evidence is gathered. */
  readonly step: number;
}

export type NativeCityStoryStopId = "plaza" | "B141" | "pier-cargo" | "B004" | "B143" | "B144" | "blackthorne";
export type NativeCityStoryViewId = "V1" | "V2" | "V3" | "V4" | "V5";
/**
 * 월드 몸 원화의 배역(`nativeCityResidentArt`). 단서 주민 다섯은 2026-10-13 부터 얼굴에 맞춘 제 16° 직교 팩을 입는다
 * (`render/art/NativeCityPlazaNpcArt`, 팩 id = 얼굴 id). 옛 집사·신사 몸(`steward`·`gent`)은 저택 쪽 배역에만 남는다.
 */
export type NativeCityStoryBodyId = "gent" | "steward" | "elias" | "johann" | "matthias" | "ernst" | "konrad" | "albert";
/**
 * 대사의 화자 id(대화 판 초상·이름 색·목소리). 몸은 나눠 입어도 얼굴은 사람마다 하나다 — 광장 배달원(`elias`, 2026-10-12),
 * 단서 주민 다섯(2026-10-13, `art/ui/dialogue-{id}-v3.webp`). 저택 정문 집사만 `steward` 로 남는다.
 */
export type NativeCityStoryCastId = "elias" | "johann" | "matthias" | "ernst" | "konrad" | "albert";

export interface NativeCityStoryObjective {
  readonly context: string;
  readonly heading: string;
  readonly title: string;
  readonly conditions: readonly { readonly id: string; readonly label: string; readonly done: boolean }[];
  readonly key: string;
  readonly viewId: NativeCityStoryViewId;
  readonly stopId: NativeCityStoryStopId;
  readonly npcName: string;
}

export interface NativeCityStoryInteraction {
  readonly id: string;
  readonly lines: readonly DialogueLine[];
  /** Candidate state. Commit (and save, `commitNativeCityStory`) only after the last line is advanced. */
  readonly complete: NativeCityStoryState | null;
  readonly castId: NativeCityStoryCastId;
  readonly npcName: string;
}

interface Encounter {
  readonly id: string;
  readonly stopId: Exclude<NativeCityStoryStopId, "blackthorne">;
  readonly viewId: NativeCityStoryViewId;
  /** 대화 얼굴(화자 id). */
  readonly castId: NativeCityStoryCastId;
  /** 월드 몸 원화. */
  readonly bodyId: NativeCityStoryBodyId;
  readonly role: readonly [string, string];
  readonly name: readonly [string, string];
  readonly condition: readonly [string, string];
  readonly lines: readonly (readonly [string, string])[];
}

const ENCOUNTERS: readonly Encounter[] = Object.freeze([
  {
    id: "courier-parcel", stopId: "plaza", viewId: "V1", castId: "elias", bodyId: "elias", role: ["배달원", "courier"], name: ["엘리어스", "Elias"],
    condition: ["광장 소포의 봉인 번호를 확인했다", "Checked the seal number on the plaza parcel"],
    lines: [
      ["잠깐만요! 저택으로 가던 소포인데 받을 사람 이름이 지워졌어요. 봉인은 BH-17이에요.", "Wait! This parcel was heading for the manor, but the recipient's name was erased. The seal says BH-17."],
      ["받을 사람 이름이 없으면 집사가 문도 안 열어 줘요. 이 번호로 소포의 주인을 찾아주실래요?", "Without the recipient's name, the steward won't even open the door. Could you help find the owner using this number?"],
      ["광장 왼쪽 상업지구의 길드 서기 요한에게 BH-17을 물어보세요. 운송 장부를 맡고 있어요.", "Ask Johann, the guild clerk in the commerce district to the left, about BH-17. He keeps the shipping ledger."],
    ],
  },
  {
    id: "guild-ledger", stopId: "B141", viewId: "V4", castId: "johann", bodyId: "johann", role: ["길드 서기", "guild clerk"], name: ["요한", "Johann"],
    condition: ["길드 장부에서 BH-17의 운송 경로를 찾았다", "Found BH-17's route in the guild ledger"],
    lines: [
      ["BH-17… 목적지는 경매가, 비고는 '복원 기금'입니다. 저택이 아니군요.", "BH-17… Destination: the auction quarter. Note: 'restoration fund'. Not the manor."],
      ["운송 경로를 확인합시다. 항구 화물 부두의 마티아스 감독에게 봉인을 보여 주십시오.", "Let's check the route. Show the seal to Matthias, the foreman at the harbor cargo pier."],
    ],
  },
  {
    id: "dock-manifest", stopId: "pier-cargo", viewId: "V3", castId: "matthias", bodyId: "matthias", role: ["부두 감독", "dock foreman"], name: ["마티아스", "Matthias"],
    condition: ["화물 부두에서 BH-17의 화물 표식을 대조했다", "Matched BH-17's cargo mark at the pier"],
    lines: [
      ["아, 이 봉인! 우리 부두를 거친 게 맞소. 장부를 보니 상자가 두 번이나 옮겨졌군.", "Ah, that seal! It did come through our pier. The manifest says the crate was moved twice."],
      ["다음 목적지는 세관에 기록이 있을 거요. 항만 세관의 에른스트를 찾아보시오.", "Customs will have the next destination on record. Ask Ernst at the harbor customs house."],
    ],
  },
  {
    id: "customs-register", stopId: "B004", viewId: "V3", castId: "ernst", bodyId: "ernst", role: ["세관원", "customs clerk"], name: ["에른스트", "Ernst"],
    condition: ["세관 기록에서 상자의 두 번째 목적지를 확인했다", "Found the crate's second destination in customs records"],
    lines: [
      ["BH-17은 경매장으로 반출됐습니다. 내용물은 '유물 복원 기록'으로 신고됐군요.", "BH-17 was released to the auction house. The declared contents were 'artifact restoration records'."],
      ["실제 내용물도 같은지 경매장 감정사 콘라트에게 확인하십시오.", "Ask Konrad, the auction house appraiser, whether the actual contents matched."],
    ],
  },
  {
    id: "auction-record", stopId: "B143", viewId: "V2", castId: "konrad", bodyId: "konrad", role: ["감정사", "appraiser"], name: ["콘라트", "Konrad"],
    condition: ["경매장 감정 기록이 복원 장부와 맞는 것을 확인했다", "Matched the auction appraisal to the restoration ledger"],
    lines: [
      ["신고대로 오래된 복원 장부였어요. 어떤 보물을 어떻게 손봤는지 적혀 있지요.", "It was an old restoration ledger, just as declared. It lists which treasures were restored and how."],
      ["주인은 대성당 보관소의 알베르트에게 물어보세요. 원본 기록과 맞춰 볼 수 있을 거예요.", "Ask Albert at the cathedral archive about the owner. He can compare it with the source record."],
    ],
  },
  {
    id: "cathedral-donor-book", stopId: "B144", viewId: "V5", castId: "albert", bodyId: "albert", role: ["기록관", "archivist"], name: ["알베르트", "Albert"],
    condition: ["성당 후원 장부에서 블랙손 가문의 연결을 확인했다", "Found the Blackthorne connection in the cathedral donor book"],
    lines: [
      ["찾았어요. 성당 후원 기록에 딸린 장부네요. 기부자 이름은… 블랙손이군요.", "Found it, filed with the cathedral's donor records. The donor's name is… Blackthorne."],
      ["이 부분을 베껴 드릴게요. 광장 분수 옆의 엘리어스에게 사본을 전해 주세요.", "I'll copy this part for you. Take the copy to Elias by the fountain in the square."],
    ],
  },
  {
    id: "courier-return", stopId: "plaza", viewId: "V1", castId: "elias", bodyId: "elias", role: ["배달원", "courier"], name: ["엘리어스", "Elias"],
    condition: ["조사 결과를 배달원에게 돌려주고 블랙손 연결을 알렸다", "Returned the findings to the courier and traced the Blackthorne link"],
    lines: [
      ["블랙손 이름이 있었군요! 그래서 경매장을 거쳐 저택으로 가던 소포였네요.", "Blackthorne's name! So that's why it was going through the auction house to the manor."],
      ["이제 블랙손 저택 정문에서 집사에게 사본을 보여 주세요. 받을 사람만 확인하면 돼요!", "Now show the copy to the steward at Blackthorne Manor's front door. Just confirm the recipient!"],
    ],
  },
]);

function safeStep(state: NativeCityStoryState): number {
  return Number.isInteger(state.step) ? Math.max(0, Math.min(ENCOUNTERS.length, state.step)) : 0;
}

export function createNativeCityStoryState(): NativeCityStoryState {
  return Object.freeze({ step: 0 });
}

/**
 * The saved case: encounters already finished and whether the steward closed it. Before the case opens (no manor
 * ending, or the bird still owed) it is always a fresh case, as earlier playtest leftovers never expose Johann early.
 */
export function loadNativeCityStory(meta: MetaState): { readonly story: NativeCityStoryState; readonly completed: boolean } {
  if (!nativeCityStoryAvailable(meta)) return { story: createNativeCityStoryState(), completed: false };
  const records = nativeCityRecordsOf(meta);
  return { story: Object.freeze({ step: records.step }), completed: records.closed };
}

/** Saves a finished encounter (or the steward's close). Never moves the case backwards. */
export function commitNativeCityStory(meta: MetaState, story: NativeCityStoryState, completed = false): MetaState {
  return commitNativeCityRecords(meta, safeStep(story), completed);
}

/** The quest's real next stop is the map destination, never a guessed camera or hidden interior. */
export function nativeCityStoryObjective(state: NativeCityStoryState, locale: Locale): NativeCityStoryObjective {
  const step = safeStep(state);
  const current = ENCOUNTERS[step];
  const finished = current === undefined;
  return Object.freeze({
    context: step === 0
      ? localeText(locale, "주인 잃은 소포의 단서를 확인하세요.", "Find a clue to the unclaimed parcel.")
      : finished
        ? localeText(locale, "기록의 주인은 블랙손 가문. 정문 집사에게 사본을 전하자.", "The records belong to Blackthorne. Give the copy to the steward.")
        : localeText(locale, ENCOUNTERS[step - 1]!.condition[0], ENCOUNTERS[step - 1]!.condition[1]),
    heading: localeText(locale, "봉인 번호 BH-17", "The BH-17 seal"),
    title: finished
      ? localeText(locale, "복사본을 블랙손 저택으로 가져가기", "Take the copy to Blackthorne Manor")
      : step === 0 ? localeText(locale, "분수 옆 배달원에게 말 걸기", "Talk to the courier by the fountain")
        : localeText(locale, `${current.name[0]}에게 기록 확인하기`, `Check the record with ${current.name[1]}`),
    conditions: Object.freeze(ENCOUNTERS.slice(0, step).map((encounter) => Object.freeze({
      id: encounter.id,
      label: localeText(locale, encounter.condition[0], encounter.condition[1]),
      done: true,
    }))),
    key: finished ? "native-city-story-complete" : `native-city-story-${current.id}`,
    viewId: finished ? "V1" : current.viewId,
    stopId: finished ? "blackthorne" : current.stopId,
    npcName: finished ? localeText(locale, "블랙손 저택", "Blackthorne Manor")
      : `${current.role[locale === "ko" ? 0 : 1]} ${current.name[locale === "ko" ? 0 : 1]}`,
  });
}

/** 단서 주민의 대화 얼굴 id. 마을 씬은 이 얼굴들을 미리 받는다(`NativeCityAssetPreload`). */
export const NATIVE_CITY_STORY_CAST_IDS: readonly NativeCityStoryCastId[] = Object.freeze([...new Set(ENCOUNTERS.map(encounter => encounter.castId))]);

/** 단서 주민 얼굴 id 의 이름(대화 판 이름표의 폴백 — 씬은 만남의 `npcName` 을 덧씌운다). 단서 주민이 아니면 null. */
export function nativeCityStoryCastName(id: string, locale: Locale): string | null {
  const actor = ENCOUNTERS.find(encounter => encounter.castId === id);
  return actor ? localeText(locale, ...actor.name) : null;
}

/**
 * Persistent identities: NPC presence must not depend on whether their quest is active.
 * `castId` 는 월드 몸 원화 배역(씬의 배우·대화 자리), `portraitId` 는 대화 판·자유 대화 방의 얼굴(`npcDialogueArtFor`)이다.
 */
export function nativeCityResident(stopId: string, locale: Locale): { name: string; role: string; castId: string; portraitId: string } | null {
  const actor = ENCOUNTERS.find(encounter => encounter.stopId === stopId);
  if (actor) return { name: localeText(locale, ...actor.name), role: localeText(locale, ...actor.role), castId: actor.bodyId, portraitId: actor.castId };
  const same = (name: string, role: string, castId: string) => ({ name, role, castId, portraitId: castId });
  if (stopId === "rosaline") return same(localeText(locale, "로잘린", "Rosaline"), localeText(locale, "의상실 주인", "Tailor"), "rosaline");
  if (stopId === "clockmaker") return same(localeText(locale, "시계공", "Clockmaker"), localeText(locale, "시계 수리", "Clock repairs"), "clockmaker");
  // 광장 신사(Drive C05): 손님 명단의 소문을 맡는다. 이름은 대화 판(`ConversationCast`)과 같다.
  if (stopId === "gentleman") return same(localeText(locale, "광장의 신사", "Gentleman of the square"), localeText(locale, "광장 신사", "Plaza gentleman"), "gentleman");
  if (stopId === "blackthorne") return same(localeText(locale, "저택 집사", "Manor steward"), localeText(locale, "블랙손 저택", "Blackthorne Manor"), "steward");
  return null;
}

/**
 * Return the encounter at a stop. Future story NPCs give a nudge without advancing; unrelated
 * stops stay available to the existing village/Blackthorne guest-list interactions.
 */
export function nativeCityStoryDialogue(
  state: NativeCityStoryState,
  stopId: string,
  locale: Locale,
  meta: MetaState,
): NativeCityStoryInteraction | null {
  if (!nativeCityStoryAvailable(meta)) return null;
  const step = safeStep(state);
  const actor = ENCOUNTERS.find((encounter) => encounter.stopId === stopId);
  if (!actor) return null;
  if (step >= ENCOUNTERS.length) return {
    id: `native-city-evidence-gathered-${actor.id}`, castId: actor.castId, npcName: localeText(locale, ...actor.name), complete: null,
    lines: [{ speaker: actor.castId, mode: "blocking", text: localeText(locale,
      "기록의 주인을 찾았군요. 사본은 블랙손 저택 정문의 집사에게 전해 주세요.",
      "You found the owner. Give the copy to the steward at Blackthorne's front gate.") }],
  };
  const current = ENCOUNTERS[step]!;
  const expected = current.stopId === stopId;
  const lines: DialogueLine[] = expected
    ? current.lines.map(([ko, en]) => ({ speaker: current.castId, text: localeText(locale, ko, en), mode: "blocking" }))
    : [{ speaker: actor.castId, text: localeText(locale,
      `먼저 ${current.role[0]} ${current.name[0]}에게 가서 다음 기록을 확인해 주세요.`,
      `Please check the next record with the ${current.role[1]}, ${current.name[1]}, first.`), mode: "blocking" }];
  return Object.freeze({
    id: expected ? `native-city-${current.id}` : `native-city-reminder-${step}-${actor.id}`,
    lines: Object.freeze(lines),
    complete: expected ? Object.freeze({ step: step + 1 }) : null,
    castId: actor.castId,
    npcName: actor.name[locale === "ko" ? 0 : 1],
  });
}
