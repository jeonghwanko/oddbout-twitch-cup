import type Phaser from "phaser";
import type { DomModal } from "../dom/domModal";
import { isCityFightSummonKind } from "../../sim/cityFight/CityFightSummonTuning";
import { fightEffectBoardContent, fightFoeCardContent, fightStatusEntryContent, fightStatusHelpContent, openFightStatusDialog, type FightAnswerKeys,
  type FightStatusSide } from "../dom/fightStatusDialog";
import type { ConversationPortrait } from "../../app/ConversationPanel";
import type { Locale } from "../../app/Locale";
import type { CityFightFoeSkill, CityFightFoeStatus, CityFightPlayerStatus } from "../../sim/cityFight/CityFightStatus";

/** What the open card reads: the fight as it is now. Null: no 1:1 fight (nothing opens). */
export interface FightStatusSource {
  readonly locale: Locale;
  readonly foeName: string;
  /** His face (the HP bar draws it; the card no longer repeats it, 2026-10-19). */
  readonly foePortrait: ConversationPortrait | null;
  /** Every status his rules have (`?` lists them) and the ones on now. */
  readonly foeAll: readonly CityFightFoeStatus[];
  readonly foeLit: readonly CityFightFoeStatus[];
  readonly skills: readonly CityFightFoeSkill[];
  /** The keys the card's move lines show (the bound key or pad button on the device in use). */
  readonly keys: FightAnswerKeys;
  readonly meLit: readonly CityFightPlayerStatus[];
  /** His summons out on the stage now (the effect board's "on now"); absent: none. */
  readonly liveSummons?: readonly CityFightFoeSkill["id"][];
}

/** The card's keys from the fight HUD's hints (`NativeCityFightInputController.hudHints` — the same keys the key panel shows). */
export function fightAnswerKeys(hints: { readonly guard: { readonly key: string }; readonly dodge: { readonly key: string };
  readonly heavy: { readonly key: string }; readonly attack: { readonly key: string } }): FightAnswerKeys {
  return { guard: hints.guard.key, dodge: hints.dodge.key, heavy: hints.heavy.key, attack: hints.attack.key };
}

/**
 * 싸움 상태 설명 창의 주인(2026-10-18): 아이콘 하나·상대 카드·`?` 전체 중 하나를 연다(한 번에 하나). 열린 동안 씬은 이것을 HUD 붙듦으로 읽어
 * 싸움을 멈춘다. 마을 싸움과 무투장이 같이 쓴다.
 */
export class FightStatusPanel {
  private modal: DomModal | null = null;

  constructor(_scene: Phaser.Scene, private readonly source: () => FightStatusSource | null) {}

  get open(): boolean { return this.modal !== null && !this.modal.closed; }

  status(side: FightStatusSide, status: CityFightFoeStatus | CityFightPlayerStatus): void {
    const s = this.source();
    if (!s) return;
    const on = side === "foe" ? s.foeLit.includes(status as CityFightFoeStatus) : s.meLit.includes(status as CityFightPlayerStatus);
    this.show(s.locale, fightStatusEntryContent(s.locale, side, status, on));
  }

  /** The effect board (the arena duel's icons and summon badge): every effect, his edges and weaknesses, beside the ones on him now. */
  board(): void {
    const s = this.source();
    if (!s) return;
    const summons = s.skills.filter(skill => isCityFightSummonKind(skill.id)), live = new Set(s.liveSummons ?? []);
    this.show(s.locale, fightEffectBoardContent(s.locale, s.foeName,s.foeAll, s.foeLit, summons,
      summons.filter(skill => live.has(skill.id)), s.keys));
  }

  card(): void {
    const s = this.source();
    if (s) this.show(s.locale, fightFoeCardContent(s.locale, s.foeName, s.skills, s.keys, s.foeAll, s.foeLit));
  }

  /** `?` (pad: the guide button): every icon of both sides; again closes it. */
  toggleHelp(): void {
    if (this.open) { this.close(); return; }
    const s = this.source();
    if (s) this.show(s.locale, fightStatusHelpContent(s.locale, s.foeAll, s.foeLit, s.meLit));
  }

  close(): void { this.modal?.close(); this.modal = null; }

  private show(locale: Locale, content: Parameters<typeof openFightStatusDialog>[1]): void {
    this.close();
    const modal = openFightStatusDialog(locale, content, () => { if (this.modal === modal) this.modal = null; });
    this.modal = modal;
  }
}
