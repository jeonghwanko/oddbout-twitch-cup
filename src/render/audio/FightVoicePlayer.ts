import { FightVoiceDirector, type FightVoiceBank, type FightVoicePlay } from "../../app/FightVoiceCues";
import { fightVoiceClips, fightVoiceFamily, fightVoiceLine } from "../../assets/FightVoiceCatalog";
import type { FightVoiceAssetDefinition } from "../../assets/RuntimeMediaCatalog";
import type { NativeCityFightSimEvent } from "../../sim/cityFight/NativeCityFightFrame";
import type { KumaCombatEvent } from "../../sim/cityFight/NativeCityKumaCombatState";
import type { SampleHandle } from "./AudioEngine";
import { sfx } from "./sfx";

/**
 * 대결 목소리를 실제로 울린다(2026-10-21, docs/kaito-web/fight-voices.md). 무엇을 낼지는 `FightVoiceDirector`(순수)가 정하고, 이 파일은
 * 클립을 찾아 목소리 버스로 울리고, 앞 소리를 끊고, 대사 동안 음악을 낮추고, 그 판에 설 화자들의 클립만 받아 둔다.
 *
 * 대결에는 `NativeCityFightObserver` 로 붙는다(대결 기록과 함께 — 읽기만 한다). 그래서 대결 연출(Presenter)의 소리 호출과
 * 골든 기록(`city-fight-golden`)은 그대로다.
 */

/** 클립은 -16 LUFS 로 맞춰 구웠다. 효과음 위에서 들리되 타격음을 덮지 않는 배율(사람 청음으로 다듬는다). */
export const FIGHT_VOICE_GAIN = Object.freeze({ shout: 0.62, line: 0.85 });

const BANK: FightVoiceBank = Object.freeze({
  lengths: (speaker: string, family: string) => fightVoiceFamily(speaker, family).map((clip) => clip.durationMs),
  line: (speaker: string | null, textKey: string) => {
    const clip = fightVoiceLine(textKey, speaker);
    return clip ? { speaker: clip.speaker, lengthMs: clip.durationMs } : null;
  },
});

export class FightVoicePlayer {
  private readonly director: FightVoiceDirector;
  private readonly handles = new Map<string, SampleHandle>();
  /** 받아 둔 화자들(`base` + 지금 상대 + 말을 건 상대). */
  private readonly held = new Set<string>();
  private disposed = false;

  /**
   * `player`: 플레이어 쪽 화자(없으면 null — 사진 괴도). `base`: 판과 상관없이 받아 둘 화자(마을의 오토 — 그의 대결은 `challenged` 없이 시작한다).
   * `clock`: 화면 시간(ms).
   */
  constructor(private readonly playerSpeaker: string | null, private readonly base: readonly string[] = [],
    private readonly clock: () => number = () => performance.now()) {
    this.director = new FightVoiceDirector(BANK, playerSpeaker);
    this.hold([playerSpeaker, ...base]);
  }

  /** "싸우자"(재대결도): 그 상대로 새 판. */
  challenged(opponentId: string): void {
    this.prepare(opponentId);
    this.director.start(opponentId);
  }

  player(events: readonly NativeCityFightSimEvent[]): void {
    this.run(this.director.player(this.clock(), events));
  }

  foe(events: readonly KumaCombatEvent[]): void {
    this.run(this.director.foe(this.clock(), events));
  }

  /** 사건 묶음이 없는 대결(AI 대 AI)의 한 소리(`FightVoiceDirector.cue`). */
  cue(speaker: string, family: string, priority: number,
    options: { readonly fallback?: readonly string[]; readonly delayMs?: number; readonly queue?: boolean } = {}): void {
    const play = this.director.cue(this.clock(), speaker, family, priority, options);
    if (play) this.run([play]);
  }


  line(textKey: string, speaker: string | null = null, waitMs = 0): void {
    const clip = fightVoiceLine(textKey, speaker);
    if (!clip || this.disposed) return;
    this.prepare(clip.speaker);
    const asked = this.clock();
    void sfx.fightVoiceReady(clip.key).then((ready) => {
      if (!ready || this.disposed || this.clock() - asked > waitMs) return;
      const play = this.director.line(this.clock(), textKey, clip.speaker);
      if (play) this.run([play]);
    });
  }

  /** 대결이 아직 시작하지 않은 상대(말을 걸었을 때): 그의 클립을 받기 시작한다. 먼저 말을 건 다른 상대 것은 놓는다. */
  prepare(speaker: string): void {
    this.hold([this.playerSpeaker, ...this.base, speaker]);
  }

  dispose(): void {
    this.disposed = true;
    for (const handle of this.handles.values()) handle.stop(40);
    this.handles.clear();
    this.hold([]);
  }

  private hold(speakers: readonly (string | null)[]): void {
    const next = new Set(speakers.filter((speaker): speaker is string => speaker !== null));
    const keys = (speaker: string) => fightVoiceClips(speaker).map((clip) => clip.key);
    sfx.releaseFightVoices([...this.held].filter((speaker) => !next.has(speaker)).flatMap(keys));
    sfx.holdFightVoices([...next].filter((speaker) => !this.held.has(speaker)).flatMap(keys));
    this.held.clear();
    for (const speaker of next) this.held.add(speaker);
  }

  private run(plays: readonly FightVoicePlay[]): void {
    for (const play of plays) {
      for (const cut of play.cuts) { this.handles.get(cut)?.stop(40); this.handles.delete(cut); }
      const clip: FightVoiceAssetDefinition | undefined = play.textKey !== null
        ? fightVoiceLine(play.textKey, play.speaker) ?? undefined
        : fightVoiceFamily(play.speaker, play.family!)[play.index];
      if (!clip) continue;
      const handle = sfx.fightVoice(clip.key, play.spoken ? FIGHT_VOICE_GAIN.line : FIGHT_VOICE_GAIN.shout, play.delayMs);
      if (handle) this.handles.set(play.speaker, handle);
      if (handle && play.spoken) sfx.duckForVoice(play.delayMs + clip.durationMs);
    }
  }
}
