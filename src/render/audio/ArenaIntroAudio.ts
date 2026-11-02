import { fightVoiceClips, fightVoiceFamily } from "../../assets/FightVoiceCatalog";
import type { CombatOverlaySoundCue } from "../effects/webtoon/CombatIntroTimeline";
import { sfx } from "./sfx";

/**
 * 무투장 READY → FIGHT! 의 소리(2026-10-24, 사용자: "Fight 표시가 될 때 띠용 이런 소리" — "voice studio 에서 '파잇트!'").
 *
 * 글자 박자는 마을 대결과 같은 `introSoundCues` 를 받는다. 다만 타이틀 프롤로그에서 빌린 합성음을 내지 않는다. 그 합성음은
 * 음높이가 미끄러지는 쾅(63→31 Hz + 224 Hz 삼각파)·쿵(64→34 Hz)·반짝(2.4→3.2 kHz)이라 함께 울리면 "띠용" 으로 들렸다.
 * 대신 글자가 박히는 순간 아나운서(`announcer`, VoxCPM2 — docs/kaito-web/fight-voices.md)가 "레디!"·"파잇트!" 를 외치고,
 * 그 밑에 녹음 타격 하나를 깐다. 글자가 빠지는 바람 소리만 그대로 둔다.
 *
 * 마을 쿠마전은 `NativeCityFightOverlay` 의 기본 소리 그대로다(무투장만 `introSound` 로 이 길을 준다). 그 이유였던 플레이테스트 동결은
 * 2026-10-24 풀렸다.
 */
export const ARENA_ANNOUNCER = "announcer";

export const ARENA_INTRO_SOUND = Object.freeze({
  /** 아나운서 클립은 -16 LUFS 로 구웠다. 대사(`FIGHT_VOICE_GAIN.line`)보다 한 단 크게 — 경기의 문을 여는 소리다. */
  voiceGain: 0.95,
  /** 글자 밑 타격(효과음 버스 배율). READY 는 가볍게, FIGHT! 는 마무리 타격으로. */
  readyHitGain: 0.4,
  fightHitGain: 0.75,
});

/**
 * 한 경기 화면의 READY → FIGHT! 소리. 첫 글자 박힘(쾅, 움직임 줄이기에서는 뽁)이 READY, 그다음이 FIGHT! 다.
 * 재대결로 READY → FIGHT! 가 다시 시작하면 `reset` 한다. 아나운서 클립은 만들 때 받기 시작하고 `dispose` 에서 놓는다.
 */
export class ArenaIntroAudio {
  private readonly keys = fightVoiceClips(ARENA_ANNOUNCER).map(clip => clip.key);
  private stamped = 0;
  private settled = false;
  private disposed = false;

  constructor() {
    sfx.holdFightVoices(this.keys);
    void Promise.all(this.keys.map(key => sfx.fightVoiceReady(key))).then(() => { this.settled = true; });
  }

  /** 아나운서 클립을 다 받았다(또는 받지 않는다 — 소리가 잠겼으면 기다리지 않는다). READY → FIGHT! 는 이때까지 기다린다. */
  get ready(): boolean {
    return this.settled;
  }

  reset(): void {
    this.stamped = 0;
  }

  play(cue: CombatOverlaySoundCue): void {
    if (this.disposed) return;
    switch (cue.kind) {
      case "slam":
      case "pop": {
        const fight = this.stamped++ > 0;
        const clip = fightVoiceFamily(ARENA_ANNOUNCER, fight ? "fight" : "ready")[0];
        if (clip && sfx.fightVoice(clip.key, ARENA_INTRO_SOUND.voiceGain, 0)) sfx.duckForVoice(clip.durationMs);
        sfx.arenaIntroHit(fight, fight ? ARENA_INTRO_SOUND.fightHitGain : ARENA_INTRO_SOUND.readyHitGain);
        return;
      }
      case "whoosh":
        sfx.titlePrologueCue("whoosh", cue.pitch);
        return;
      default:
        return;
    }
  }

  dispose(): void {
    this.disposed = true;
    sfx.releaseFightVoices(this.keys);
  }
}
