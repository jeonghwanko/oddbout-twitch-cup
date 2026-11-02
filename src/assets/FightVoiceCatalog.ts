import { FIGHT_VOICE_SFX, type FightVoiceAssetDefinition } from "./RuntimeMediaCatalog";



/**
 * 한 화자의 한 소리 갈래. `kiai-light` 는 `kiai-light-1`·`kiai-light-2` 를, `count-1` 은 그 하나를 묶는다(뒤에 붙은 번호만 갈래로 묶는다).
 * 순서는 등록부 순서다.
 */
export function fightVoiceFamily(speaker: string, family: string): readonly FightVoiceAssetDefinition[] {
  const numbered = new RegExp(`^${family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`);
  return FIGHT_VOICE_SFX.filter((clip) => clip.speaker === speaker && (clip.cue === family || numbered.test(clip.cue)));
}


export function fightVoiceLine(textKey: string, speaker?: string | null): FightVoiceAssetDefinition | null {
  const said = FIGHT_VOICE_SFX.filter((clip) => clip.textKey === textKey);
  return said.find((clip) => clip.speaker === speaker) ?? (said.length === 1 ? said[0]! : null);
}

/** 한 화자의 클립 전부(대결이 시작할 때 받고, 상대가 바뀌면 놓는다). */
export function fightVoiceClips(speaker: string): readonly FightVoiceAssetDefinition[] {
  return FIGHT_VOICE_SFX.filter((clip) => clip.speaker === speaker);
}

/** 목소리가 있는 화자들. */
export const FIGHT_VOICE_SPEAKERS: readonly string[] = Object.freeze([...new Set(FIGHT_VOICE_SFX.map((clip) => clip.speaker))]);
