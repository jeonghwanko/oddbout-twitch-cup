import type { NativeCityFightSimEvent } from "../sim/cityFight/NativeCityFightFrame";
import type { KumaCombatEvent } from "../sim/cityFight/NativeCityKumaCombatState";
import { NATIVE_CITY_PLAYER_ID } from "../sim/cityFight/NativeCityFactions";
import { NATIVE_CITY_OTTO_ID } from "../sim/cityFight/NativeCityOttoEncounter";




/** 클립을 아는 쪽(렌더의 카탈로그). 길이는 ms. 빈 목록·null: 그 소리가 없다. */
export interface FightVoiceBank {
  lengths(speaker: string, family: string): readonly number[];
  line(speaker: string | null, textKey: string): { readonly speaker: string; readonly lengthMs: number } | null;
}

/** 재생 한 번: 갈래의 몇 번째 테이크(`family`·`index`) 또는 화면 대사(`textKey`). `cuts`: 먼저 끊을 화자들. */
export interface FightVoicePlay {
  readonly speaker: string;
  readonly family: string | null;
  readonly textKey: string | null;
  readonly index: number;
  readonly delayMs: number;
  readonly priority: number;
  readonly spoken: boolean;
  readonly cuts: readonly string[];
}

export const FIGHT_VOICE_RULES = Object.freeze({
  /** 같은 갈래를 이만큼 쉬어야 다시 낸다. 가벼운 기합은 연타의 첫 타에만 나는 셈이다. */
  gapMs: Object.freeze({ "kiai-light": 520, "kiai-heavy": 260, "hurt-light": 750, quip: 6_000 } as Record<string, number>),
  /** 진 쪽의 한마디: KO 몸이 땅에 닿은 뒤. 오토는 쓰러지는 연출이 길다. */
  loseDelayMs: 450,
  ottoLoseDelayMs: 1_200,
  /** 반격·가드 깨기 외침은 맞은 쪽 신음 바로 뒤. */
  quipDelayMs: 140,

  gloatDelayMs: 600,
  /** 미룬 소리(`queue`)가 앞 소리 끝에서 쉬는 틈. */
  queueGapMs: 120,
});

/** 우선순위: 같은 화자는 더 높은 것만 앞 소리를 끊고, 말로 된 소리는 두 화자를 합쳐 하나씩. */
export const FIGHT_VOICE_PRIORITY = Object.freeze({ kiai: 1, hurt: 1.5, kiaiHeavy: 2, quip: 2, grab: 3, summon: 3, super: 4, ko: 5, line: 5 });

/** 대사·외침·소환 외침은 "말"이다(두 화자가 겹쳐 말하지 않는다). 기합·신음·숫자 세기는 겹쳐도 된다. */
function spokenFamily(family: string): boolean {
  return family.startsWith("line-") || family.startsWith("quip-") || family.startsWith("summon-");
}



interface Ask {
  readonly fallback?: readonly string[];
  readonly delayMs?: number;
  /** 쉬는 간격을 세는 무리(생략: 갈래 이름 — `FIGHT_VOICE_RULES.gapMs` 에 있을 때만 센다). */
  readonly gap?: string;

  readonly queue?: boolean;
}

export class FightVoiceDirector {
  private opponent: string | null = null;
  /** 지금 상대(사건에 enemy 가 없을 때 그 사건의 주인). 오토전에는 오토다. */
  private engaged: string | null = null;
  private readonly busy = new Map<string, { until: number; priority: number }>();
  private speaking: { speaker: string; until: number; priority: number } | null = null;
  private readonly lastAt = new Map<string, number>();
  private readonly turns = new Map<string, number>();
  private swingPending = false;
  private playerDown = false;

  constructor(private readonly bank: FightVoiceBank, private readonly playerSpeaker: string | null) {}

  /** 새 판(재대결 포함): 상대가 바뀌고 소리 상태가 비워진다. 테이크 차례는 이어 간다(같은 테이크가 판마다 되풀이되지 않게). */
  start(opponentId: string): void {
    this.opponent = this.voiceOf(opponentId);
    this.engaged = opponentId;
    this.busy.clear();
    this.speaking = null;
    this.lastAt.clear();
    this.swingPending = false;
    this.playerDown = false;
  }

  /**
   * 사건 묶음이 없는 대결(무투장의 AI 대 AI — 접촉·필살기·KO 만 안다)이 한 소리를 직접 청한다. 같은 중재 규칙을 지난다.
   * `options.fallback`·`delayMs`·`gap` 은 사건 길과 같다.
   */
  cue(nowMs: number, speaker: string | null, family: string, priority: number,
    options: { readonly fallback?: readonly string[]; readonly delayMs?: number; readonly gap?: string; readonly queue?: boolean } = {}): FightVoicePlay | null {
    return this.ask(nowMs, speaker === null ? null : this.voiceOf(speaker), family, priority, options);
  }

  /** 화면에 뜬 대사(말풍선·도전·패배 카드)를 그 화자의 목소리로. */
  line(nowMs: number, textKey: string, speaker: string | null = null): FightVoicePlay | null {
    const found = this.bank.line(speaker, textKey);
    if (!found) return null;
    return this.admit(nowMs, found.speaker, null, textKey, 0, found.lengthMs, FIGHT_VOICE_PRIORITY.line, 0, true);
  }


  player(nowMs: number, events: readonly NativeCityFightSimEvent[]): FightVoicePlay[] {
    const out: FightVoicePlay[] = [];
    const ask = (speaker: string | null, family: string, priority: number, o: Ask = {}) => {
      const play = this.ask(nowMs, speaker, family, priority, o);
      if (play) out.push(play);
    };
    const P = this.playerSpeaker, R = FIGHT_VOICE_RULES, Q = FIGHT_VOICE_PRIORITY;
    for (const e of events) {
      switch (e.kind) {
        case "swingStart": this.swingPending = true; break;
        case "swingClock":
          if (!this.swingPending) break;
          this.swingPending = false;
          if (e.swing === "combo") ask(P, "kiai-light", Q.kiai);
          else ask(P, "kiai-heavy", Q.kiaiHeavy);
          break;
        case "superFlash":
          ask(e.by === NATIVE_CITY_PLAYER_ID ? P : this.voiceOf(e.by), "line-super", Q.super);
          break;
        case "playerHit": {
          this.engaged = e.enemy;
          const F = this.voiceOf(e.enemy);
          if (e.accent === "ko") ask(F, "ko", Q.ko);
          else if (e.accent === "break" || e.accent === "counter") {
            ask(F, "hurt-heavy", Q.hurt);
            ask(P, e.accent === "break" ? "quip-break" : "quip-counter", Q.quip, { delayMs: R.quipDelayMs, gap: "quip" });
          } else if (e.accent === "knockdown" || e.accent === "ender") ask(F, "hurt-heavy", Q.hurt);
          else if (!e.armored) ask(F, "hurt-light", Q.hurt);
          break;
        }
        case "parried":
          if (e.counter || e.broke) ask(P, "quip-counter", Q.quip, { gap: "quip" });
          break;
        case "enemyGuard": this.engaged = e.enemy; ask(this.voiceOf(e.enemy), "quip-counter", Q.quip, { gap: "quip" }); break;
        case "guardBroken": ask(this.engagedVoice(), "quip-break", Q.quip, { gap: "quip" }); break;
        case "grabbed":
          this.engaged = e.enemy;
          ask(this.voiceOf(e.enemy), "line-grab", Q.grab, { fallback: ["quip-break", "effort"] });
          break;
        case "dodged": ask(P, "quip-dodge", Q.quip, { gap: "quip" }); break;
        case "playerWhiff": ask(this.engagedVoice(), "quip-dodge", Q.quip, { gap: "quip" }); break;
        case "struckBy": {
          this.engaged = e.enemy;
          if (e.contact === "hook") ask(this.voiceOf(e.enemy), "line-grab", Q.grab);
          if (e.tier === "light") ask(P, "hurt-light", Q.hurt);
          else ask(P, "hurt-heavy", Q.hurt);
          break;
        }
        case "blowOutcome":
          if (e.outcome === "ko") { ask(P, "ko", Q.ko); this.playerDown = true; }
          break;
        case "stepped":
          if (this.playerDown && e.ko && e.landed) { this.playerDown = false; ask(P, "line-lose", Q.line, { delayMs: R.loseDelayMs, queue: true }); }
          break;
        case "finaleLanded": ask(this.engagedVoice(), "line-lose", Q.line, { delayMs: R.loseDelayMs, queue: true }); break;
        case "bow": ask(P, "line-win", Q.line, { fallback: ["line-defeat"], queue: true }); break;
        case "ottoTook": {
          this.engaged = NATIVE_CITY_OTTO_ID;
          const O = this.voiceOf(NATIVE_CITY_OTTO_ID);
          if (e.defeated) { ask(O, "ko", Q.ko); ask(O, "line-lose", Q.line, { delayMs: R.ottoLoseDelayMs, queue: true }); }
          else if (e.outcome === "hit") ask(O, "hurt-light", Q.hurt);
          else ask(O, "quip-counter", Q.quip, { gap: "quip" });
          break;
        }
        case "playerDown": ask(this.voiceOf(e.by), "line-start", Q.line, { delayMs: R.gloatDelayMs, fallback: ["line-defeat"], queue: true }); break;
        default: break;
      }
    }
    return out;
  }

  /** 상대 자신의 사건(그의 휘두름 시작·접촉·잡기·소환). */
  foe(nowMs: number, events: readonly KumaCombatEvent[]): FightVoicePlay[] {
    const out: FightVoicePlay[] = [];
    const F = this.opponent, Q = FIGHT_VOICE_PRIORITY;
    const ask = (family: string, priority: number, o: Ask = {}) => {
      const play = this.ask(nowMs, F, family, priority, o);
      if (play) out.push(play);
    };
    for (const e of events) {
      switch (e.kind) {
        case "attack-start":
          if (e.action === "combo" || e.action === "fast") ask("kiai-light", Q.kiai);
          else if (e.action !== "summon") ask("kiai-heavy", Q.kiaiHeavy);
          break;
        case "strike": if (e.action === "combo") ask(`count-${e.hitIndex + 1}`, Q.kiaiHeavy); break;
        case "grab": if (e.beat === "throw") ask("effort", Q.kiaiHeavy); break;
        case "summon": ask(`summon-${e.summon}`, Q.summon, { fallback: ["kiai-heavy"] }); break;
        default: break;
      }
    }
    return out;
  }

  /** 목소리가 있는 화자면 그 id(파이터 actor id 가 곧 화자 id), 없으면 null. */
  private voiceOf(id: string): string | null {
    return this.bank.lengths(id, "ko").length > 0 || this.bank.lengths(id, "kiai-light").length > 0 ? id : null;
  }

  private engagedVoice(): string | null {
    return this.engaged === null ? this.opponent : this.voiceOf(this.engaged);
  }

  private ask(now: number, speaker: string | null, family: string, priority: number, o: Ask): FightVoicePlay | null {
    if (speaker === null) return null;
    const chosen = [family, ...(o.fallback ?? [])].find((f) => this.bank.lengths(speaker, f).length > 0);
    if (chosen === undefined) return null;
    const gapKey = o.gap ?? chosen;
    const gap = FIGHT_VOICE_RULES.gapMs[gapKey];
    const last = this.lastAt.get(`${speaker}|${gapKey}`);
    if (gap !== undefined && last !== undefined && now - last < gap) return null;
    const lengths = this.bank.lengths(speaker, chosen);
    const turn = this.turns.get(`${speaker}|${chosen}`) ?? 0;
    const index = turn % lengths.length;
    const play = this.admit(now, speaker, chosen, null, index, lengths[index]!, priority, o.delayMs ?? 0, spokenFamily(chosen), o.queue === true);
    if (play) {
      this.turns.set(`${speaker}|${chosen}`, turn + 1);
      if (gap !== undefined) this.lastAt.set(`${speaker}|${gapKey}`, now);
    }
    return play;
  }

  /** 끊기 규칙을 지나면 자리를 잡는다: 같은 화자는 더 높은 우선만, 말은 두 화자를 합쳐 하나(더 높은 말이 앞 말을 끊는다). */
  private admit(now: number, speaker: string, family: string | null, textKey: string | null, index: number, lengthMs: number,
    priority: number, delayMs: number, spoken: boolean, queue = false): FightVoicePlay | null {
    const cuts: string[] = [];
    // A delayed play (the line after a KO cry) is weighed from when it starts: one queued behind the cry does not cut it.
    let start = now + delayMs;
    const mine = this.busy.get(speaker);
    const talk = this.speaking;
    if (queue) {
      // Queued: after his own sound and (a line) after the other's line, never dropped for them.
      if (mine && start < mine.until) start = mine.until + FIGHT_VOICE_RULES.queueGapMs;
      if (spoken && talk && talk.speaker !== speaker && start < talk.until) start = talk.until + FIGHT_VOICE_RULES.queueGapMs;
    }
    if (mine && start < mine.until) {
      if (priority <= mine.priority) return null;
      cuts.push(speaker);
    }
    if (spoken && talk && start < talk.until && talk.speaker !== speaker) {
      if (priority <= talk.priority) return null;
      cuts.push(talk.speaker);
      this.busy.delete(talk.speaker);
    }
    const until = start + lengthMs;
    this.busy.set(speaker, { until, priority });
    if (spoken) this.speaking = { speaker, until, priority };
    return { speaker, family, textKey, index, delayMs: start - now, priority, spoken, cuts };
  }
}
