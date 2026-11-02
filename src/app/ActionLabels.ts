import { coopLocalized } from "./CoopLocale";
import type { IntelId } from "../sim/types";
import type { RebindableAction } from "./PlayerSettings";
import { pickLocalized, type Locale, type Localized } from "./Locale";
import { t } from "./i18n";
import type { VillageStoryAction } from "../sim/VillageStoryRules";
import type { ExteriorHeistState } from "../sim/ExteriorHeistRules";
import type { ExhibitionState } from "../sim/ExhibitionRules";
import { exhibitionDocked } from "../sim/ExhibitionRules";
import { BLACKTHORNE_HEIST_IDS } from "../sim/BlackthorneSpatialGeometry";
import { MANOR_TUNING } from "../sim/tuning";

export function npcTalkActionLabel(locale: Locale): string { return locale === 'en' ? 'Talk' : '말 걸기'; }
export function npcQuestTalkActionLabel(locale: Locale): string { return locale === 'en' ? 'Discuss a quest' : '의뢰 이야기'; }
export function npcFreeTalkActionLabel(locale: Locale): string { return locale === 'en' ? 'Speak freely' : '자유롭게 말하기'; }
export function npcResumeTalkActionLabel(locale: Locale): string { return locale === 'en' ? 'Back to the conversation' : '원래 대화로 돌아가기'; }

/** The same short action is used at a village stop and on its quest button. */
export function villageStopActionLabel(action: 'talk' | 'use' | 'view' | 'open' | 'expedition' | 'locked', locale: Locale): string {
  const labels = { talk: ['대화', 'Talk'], use: ['이용', 'Use'], view: ['보기', 'View'], open: ['열기', 'Open'],
    expedition: ['원정', 'Set out'], locked: ['잠김', 'Locked'] } as const;
  return labels[action][locale === 'en' ? 1 : 0];
}

export function grappleActionLabel(cost: number, locale: Locale): string {
  return t(locale, "manor.grapple.chain", { cost });
}
/** 매달린 채 보는 쪽 다음 고리로 옮겨 잡는 E. 옮겨 잡을 고리가 없으면 프롬프트 자체가 뜨지 않는다. */
export function grappleTransferLabel(cost: number, locale: Locale): string {
  return t(locale, "manor.grapple.nextRing", { cost });
}
/**
 * 블랙손 실패 화면의 다시하기 안내.
 *
 * - 인자 없이: 금고지기 회랑 체력 패배. 회랑에서 자동으로 다시 시작하고 Esc 로만 나간다.
 * - `choice`: 런 체크포인트. 자동으로 넘어가지 않고 다시(`retryKey`)와 나가기(`leaveKey`) 중에 고른다.
 */
export function blackthorneCheckpointRestartLabel(
  locale: Locale,
  choice?: { readonly failure: "captured" | "defeated"; readonly retryKey: string; readonly leaveKey: string },
): string {
  if (choice === undefined) {
    return t(locale, "manor.checkpoint.keeperDefeat");
  }
  const { failure, retryKey, leaveKey } = choice;
  return t(locale, "manor.checkpoint.choice", {
    status: failure === "captured" ? t(locale, "manor.checkpoint.caught") : t(locale, "manor.checkpoint.defeated"),
    retry: retryKey,
    leave: leaveKey,
  });
}
export function exteriorHeistObjective(state: ExteriorHeistState | undefined, recovered: boolean, locale: Locale, exhibition?: ExhibitionState): string {
  if (recovered) return t(locale, "manor.objective.escapeWithBird");
  if (exhibitionDocked(exhibition)) return t(locale, "manor.objective.takeBird");
  if (exhibition?.lowering && !exhibition.unlocked && exhibition.travelMs >= MANOR_TUNING.exhibitionTravelMs / 2)
    return t(locale, "manor.objective.releaseLatch");
  if (exhibition?.lowering) return t(locale, "manor.objective.lowerDisplay");
  if (state?.keyTaken) return state.returned
    ? t(locale, "manor.objective.startPulley")
    : t(locale, "manor.objective.returnInside");
  if (state?.cleared) return t(locale, "manor.objective.takeKeeperKey");
  if (state?.entered) return t(locale, "manor.objective.overcomeKeeper");
  if (state?.stairOpened) return t(locale, "manor.objective.climbPipe");
  return t(locale, "manor.objective.jumpToLadder");
}
export function exteriorHeistDetail(locale: Locale, state?: ExteriorHeistState, exhibition?: ExhibitionState): string {
  if (exhibitionDocked(exhibition)) return t(locale, "manor.objective.hint.docked");
  if (state?.keyTaken) return t(locale, "manor.objective.hint.keyPulley");
  if (state?.cleared) return t(locale, "manor.objective.hint.keeperHasKey");
  if (state?.entered) return t(locale, "manor.objective.hint.keeperFight");
  if (state?.stairOpened) return t(locale, "manor.objective.hint.climbPipe");
  return t(locale, "manor.objective.hint.tableLadder");
}

/** Names for the authored heist mechanisms; bindings are supplied by the caller. */
export function blackthorneHeistActionLabel(id: string, locale: Locale): string {
  const labels: Readonly<Record<string, readonly [string, string]>> = {
    [BLACKTHORNE_HEIST_IDS.stairLatchId]: ["배수관 잠금 스위치", "Pipe release switch"],
    [BLACKTHORNE_HEIST_IDS.keyId]: ["제어키 훔치기", "Steal control key"],
    [BLACKTHORNE_HEIST_IDS.servantLockId]: ["사용인 퇴장문 열기", "Unlock the worker's door"],
    [BLACKTHORNE_HEIST_IDS.returnId]: ["정비문 빗장 열기", "Open return door"],
    [BLACKTHORNE_HEIST_IDS.entryId]: ["짧은 사다리 잡기", "Catch the short ladder"],
    [BLACKTHORNE_HEIST_IDS.escapeReturnId]: ["저택 안으로 돌아가기", "Return inside the manor"],
    [BLACKTHORNE_HEIST_IDS.escapePassageId]: ["후면 통로로 탈출", "Escape through rear passage"],
    "exhibition-crank": ["도르레 돌리기", "Turn the pulley"],
    "exhibition-latch": ["중층 안전 걸쇠 풀기", "Release middle-floor safety latch"],
  };
  const label = labels[id];
  return label === undefined ? actionLabel("interact", locale) : label[locale === "en" ? 1 : 0];
}

export function villageStoryActionLabel(action:VillageStoryAction,locale:Locale):string {
  const labels:Record<VillageStoryAction,readonly [string,string]>={
    catch:['시계 낚아채기','Snatch the watch'],return:['시계 돌려주기','Return the watch'],
    gather:['과일 주워 담기','Gather the fruit'],deliver:['상인에게 건네기','Deliver the fruit'],
    prank:['수레를 살짝 밀기','Give the cart a nudge'],brace:['도약 시작 · 다시 눌러 받치기','Start vault · press again to brace'],
    listen:['소문 듣기','Listen to the rumor'],
  };
  return labels[action][locale==='en'?1:0];
}

/** 협동 작전의 명시적 행동. 현재 단독 플레이의 재바인딩 키 집합과 분리한다. */
export const COOP_ACTION_LABELS = coopLocalized({
  interact: "열기 · 집기 · 구출", drop: "유물 내려놓기", distract: "유인", smoke: "연막",
  ready: "철수 준비", extract: "함께 철수", ping: "위치 알리기", stairs: "계단 이동", jump: "발판 도약", gadget: "장비 사용",
}, { interact: "Open · take · rescue", drop: "Set relic down", distract: "Lure", smoke: "Smoke", ready: "Ready", extract: "Leave together", ping: "Ping", stairs: "Stairs", jump: "Platform jump", gadget: "Gadget" });

/**
 * 플레이어에게 보이는 행동 어휘의 단일 진실원.
 *
 * 같은 행동이 설정에서는 "은신", HUD 에서는 "숨기", 샌드박스에서는 "은신처 들어가기"
 * 로 불리면 플레이어는 셋이 서로 다른 기능인지 의심하게 된다. 화면이 행동의 **이름**을
 * 부를 때는 여기서 가져온다. 문맥 문장("옷장에 숨기" 같은 코칭 문구)은 각자 자유지만,
 * 행동 자체의 이름은 이 한 벌뿐이다.
 *
 * sim 쪽(TutorialRules·SandboxLayout)의 라벨은 sim→app 의존을 만들지 않으려고
 * 아직 자기 사본을 갖는다 — 그래서 test/ui-text.test.ts 는 sim 을 검사 범위에서 뺀다.
 */
export const ACTION_LABELS: Readonly<Record<RebindableAction, string>> = Object.freeze({
  left: "왼쪽 이동",
  right: "오른쪽 이동",
  up: "위/사다리",
  down: "웅크리기/아래",
  run: "질주",
  jump: "점프",
  interact: "상호작용",
  hide: "은신",
  whistle: "휘파람",
  throw: "괴도 무기",
  snuff: "소등",
  drop: "전리품 버리기",
  thiefEye: "괴도의 눈",
  attack: "평타 3연계",
  heavy: "강공격",
  guard: "막기",
  dodge: "넘기",
  release: "기술 방출",
});

const ACTION_LABELS_EN: Readonly<Record<RebindableAction, string>> = Object.freeze({
  left: "Move left",
  right: "Move right",
  up: "Up / ladder",
  down: "Crouch / down",
  run: "Sprint",
  jump: "Jump",
  interact: "Interact",
  hide: "Hide",
  whistle: "Whistle",
  throw: "Thief weapon",
  snuff: "Snuff light",
  drop: "Drop loot",
  thiefEye: "Thief's Eye",
  attack: "3-hit combo",
  heavy: "Heavy attack",
  guard: "Block",
  dodge: "Vault",
  release: "Release skill",
});

/** 일본어 — 무투장(fighter.html)의 설정·키 칩이 부른다(2026-11-01). */
const ACTION_LABELS_JA: Readonly<Record<RebindableAction, string>> = Object.freeze({
  left: "左へ移動",
  right: "右へ移動",
  up: "上 / はしご",
  down: "しゃがむ / 下",
  run: "ダッシュ",
  jump: "ジャンプ",
  interact: "調べる",
  hide: "隠れる",
  whistle: "口笛",
  throw: "怪盗の武器",
  snuff: "消灯",
  drop: "戦利品を捨てる",
  thiefEye: "怪盗の目",
  attack: "3連撃",
  heavy: "強攻撃",
  guard: "ガード",
  dodge: "飛び越え",
  release: "技の解放",
});

const ACTION_LABEL_TABLES: Localized<Readonly<Record<RebindableAction, string>>> = Object.freeze({
  en: ACTION_LABELS_EN, ko: ACTION_LABELS, ja: ACTION_LABELS_JA,
});

export function actionLabel(action: RebindableAction, locale: Locale): string {
  return pickLocalized(locale, ACTION_LABEL_TABLES)[action];
}

/** 도시 맨주먹 대결(쿠마전) 한 줄 도움말이 부르는 행동, 화면에 놓이는 순서대로. */
export const CITY_COMBAT_HELP_ACTIONS = Object.freeze(["attack", "heavy", "guard", "dodge"] as const satisfies readonly RebindableAction[]);
/** 오토전의 도움말: 쿠마전 줄 뒤에 훔친 직진을 되던지는 기술 방출(S)이 붙는다(2026-10-10 기술 소매치기). */
export const OTTO_FIGHT_HELP_ACTIONS = Object.freeze([...CITY_COMBAT_HELP_ACTIONS, "release"] as const satisfies readonly RebindableAction[]);
export type CityCombatHelpAction = (typeof OTTO_FIGHT_HELP_ACTIONS)[number];

/** Otto's contextual input/opening copy. The encounter supplies facts; bindings supply the actual keys. */
export type OttoFightGuidance = { readonly kind: "wait" | "closed" }
  | { readonly kind: "capture" | "release"; readonly teaching: boolean }
  | { readonly kind: "opening"; readonly remaining: number };

export function ottoFightGuidanceLabel(cue: OttoFightGuidance, locale: Locale): string {
  const en = locale === "en";
  switch (cue.kind) {
    case "wait": return en ? "When the hook flashes, press again" : "번쩍일 때 새로 누르기";
    case "capture": return cue.teaching ? en ? "Press now to steal the hook" : "지금 눌러 갈고리 훔치기" : en ? "Steal" : "훔치기";
    case "release": return cue.teaching ? en ? "Send the hook back to bind him" : "갈고리를 되돌려 걸기" : en ? "Release" : "방출";
    case "opening": return en ? `${cue.remaining} scoring attack${cue.remaining === 1 ? "" : "s"} left` : `공격 기회 ${cue.remaining}회`;
    case "closed": return en ? "Wait for the next opening" : "다음 빈틈을 기다리기";
  }
}

/**
 * 도시 대결에서 C·V 의 이름. 키는 저택의 평타(`attack`)·강공격(`heavy`)과 같지만, 도시에서는 C 가 누를 때마다
 * 잽 → 스트레이트 → 훅으로 이어지는 콤보이고 V 가 강타 한 방(쿠마의 카운터 게이지가 꽉 찼을 때는 카운터)이라 짧은 이름을 따로 둔다
 * (2026-10-18 손맛 2단계, 사용자 "z = 막기, v = 강타 or 카운터, c = 끊기 or 콤보, x = 물구나무 회피"). 막기·넘기는 설정 화면과 같은
 * `ACTION_LABELS` 이름을 그대로 쓴다 — 한 행동에 두 이름을 만들지 않는다.
 */
export const CITY_COMBAT_STRIKE_LABELS: Readonly<Record<"attack" | "heavy", Localized<string>>> = Object.freeze({
  attack: Object.freeze({ ko: "콤보", en: "Combo", ja: "コンボ" }),
  heavy: Object.freeze({ ko: "강타/카운터", en: "Heavy / Counter", ja: "強打/カウンター" }),
});

/**
 * 경쟁 전투 엔진에서 사람이 조종하는 파이터의 기술 이름(2026-10-22, `KumaControl`): C 그의 연타, V 그의 강타, X 그의 소환, S 그의 필살기.
 * C 는 마을 대결의 이름(`CITY_COMBAT_STRIKE_LABELS.attack`)을, Z 는 `ACTION_LABELS.guard`(막기)를 그대로 쓴다 — 한 행동에 두 이름을 만들지 않는다.
 * V 에는 카운터가 없어(파이터끼리의 경기에 리듬이 없다) 이름이 짧다.
 */
export const FIGHTER_KIT_LABELS: Readonly<Record<"light" | "heavy" | "special" | "skill" | "super", Localized<string>>> = Object.freeze({
  light: CITY_COMBAT_STRIKE_LABELS.attack,
  heavy: Object.freeze({ ko: "강타", en: "Heavy", ja: "強打" }),
  special: Object.freeze({ ko: "소환", en: "Summon", ja: "召喚" }),
  // A fighter's own skill on X (2026-10-22, `KumaTuning.skill` — the ODDBOUT event fighters).
  skill: Object.freeze({ ko: "기술", en: "Skill", ja: "技" }),
  super: Object.freeze({ ko: "필살기", en: "Super", ja: "必殺技" }),
});

export function fighterKitLabel(move: keyof typeof FIGHTER_KIT_LABELS, locale: Locale): string {
  return pickLocalized(locale, FIGHTER_KIT_LABELS[move]);
}


export const CITY_COMBAT_HOW_LABELS: Readonly<Record<"attack" | "heavy" | "guard" | "dodge", Localized<string>>> = Object.freeze({
  attack: Object.freeze({ ko: "맞는 순간 다시", en: "Press again on the hit", ja: "当たった瞬間にもう一度" }),
  heavy: Object.freeze({ ko: "누르고 있다 떼기 · 고리가 차면 카운터", en: "Hold, then release · counter when the ring fills", ja: "長押しして離す · 輪が満ちたらカウンター" }),
  guard: Object.freeze({ ko: "흰 공격", en: "White attacks", ja: "白攻撃" }),
  dodge: Object.freeze({ ko: "흰·금빛 공격", en: "White and gold attacks", ja: "白・金攻撃" }),
});

export function cityCombatHowLabel(action: CityCombatHelpAction, locale: Locale): string | null {
  if (action === "release") return null;
  return pickLocalized(locale, CITY_COMBAT_HOW_LABELS[action]);
}

export function cityCombatActionLabel(action: CityCombatHelpAction, locale: Locale): string {
  if (action === "attack" || action === "heavy") {
    return pickLocalized(locale, CITY_COMBAT_STRIKE_LABELS[action]);
  }
  return actionLabel(action, locale);
}

/** 설정 조작법의 전투 줄 이름: 평타 · 강공격 · 도시 대결 막기 · 넘기. 오른쪽 키 칸과 같은 순서다. */
export function combatControlsLabel(locale: Locale): string {
  return [
    actionLabel("attack", locale),
    actionLabel("heavy", locale),
    `${t(locale, "input.cityFight")} ${actionLabel("guard", locale)}`,
    actionLabel("dodge", locale),
  ].join(" · ");
}

/**
 * 소매치기 정보의 표시 이름. 판정 ID 는 GuardArchetypes 의 intelId 가 소유하고
 * 이름은 여기서만 붙는다. 획득 토스트(HeistScene)와 코치 라벨(ContextActionView)이
 * 같은 이름을 읽어야 "교대표를 훔쳤는데 순찰 교대표가 떴다" 같은 어긋남이 없다.
 */
export const INTEL_LABELS: Readonly<Record<IntelId, string>> = Object.freeze({
  "patrol-schedule": t("ko", "heist.intel.patrol-schedule.name"),
  "area-key": t("ko", "heist.intel.area-key.name"),
  "vault-code": t("ko", "heist.intel.vault-code.name"),
});

/** 선택형 전투 보상에 붙는 짧은 위험 표기. 문구는 i18n 표(`heist.combatPocket.*`)가 소유한다. */
export const COMBAT_POCKET_LABEL_KEYS = Object.freeze({
  guardCall: "heist.combatPocket.guardCall",
  bypass: "heist.combatPocket.bypass",
  crossfire: "heist.combatPocket.crossfire",
  fightOrFlee: "heist.combatPocket.fightOrFlee",
  environmentReady: "heist.combatPocket.environmentReady",
  secured: "heist.combatPocket.secured",
  cleared: "heist.combatPocket.cleared",
} as const);

export type CombatPocketLabel = keyof typeof COMBAT_POCKET_LABEL_KEYS;

export function combatPocketLabel(label: CombatPocketLabel, locale: Locale): string {
  return t(locale, COMBAT_POCKET_LABEL_KEYS[label]);
}

/** 한국어 원문 한 벌. 테스트와 기존 호출부가 읽는 불변 어휘다. */
export const COMBAT_POCKET_LABELS: Readonly<Record<CombatPocketLabel, string>> = Object.freeze({
  guardCall: combatPocketLabel("guardCall", "ko"),
  bypass: combatPocketLabel("bypass", "ko"),
  crossfire: combatPocketLabel("crossfire", "ko"),
  fightOrFlee: combatPocketLabel("fightOrFlee", "ko"),
  environmentReady: combatPocketLabel("environmentReady", "ko"),
  secured: combatPocketLabel("secured", "ko"),
  cleared: combatPocketLabel("cleared", "ko"),
});

export function playerHealthLabel(locale: Locale): string {
  return t(locale, "common.health");
}

export function blackthorneServiceLockLabel(locale: Locale): string {
  return t(locale, "manor.device.serviceLadderLocked");
}

export function blackthornePulleyLockLabel(locale: Locale): string {
  return t(locale, "manor.device.keySocket");
}

/** Physical mechanism state; shared vocabulary for the nearby switch readout. */
export function blackthorneSwitchStatus(locale: Locale, done: boolean, reason: string | null): string {
  if (done && reason === "release-catch") return t(locale, "manor.device.stoppedAtCatch");
  if (done) return t(locale, "manor.device.engaged");
  return reason ? t(locale, "manor.device.locked") : t(locale, "manor.device.ready");
}
