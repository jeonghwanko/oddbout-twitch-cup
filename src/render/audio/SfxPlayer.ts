import { AudioEngine, type SampleHandle } from "./AudioEngine";
import { villageImpactSoundPlan, villageMeleeSoundPlan, type VillageImpactSound, type VillageMeleeCue } from "./CityFightAudio";
import type { CombatSampleBeat } from "./CombatAudioBeats";
import type { NativeCityWeaponImpactKind } from "../effects/NativeCityWeaponImpact";
import type { NativeCityImpactFeelTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import { uiSound, type UiSoundKind, type UiSoundSet } from "./ui";
import { titlePrologueVoices } from "./title";
import { clockmakerLetterVoices } from "./voices";
import type { TitlePrologueSound } from "../effects/webtoon/TitleWebtoonPrologueTimeline";
import { COMBAT_SFX } from "../../assets/RuntimeMediaCatalog";
import { clampVolume } from "./AudioMix";
const FIGHT_VOICE_ATTACK_MS=3, FIGHT_VOICE_MUSIC_DUCK=0.7;
/** Audio used by standalone exhibition bouts. No site music or ambience is loaded. */
export class SfxPlayer {
private effectsVolume=1;
private combatHitVariant=0;
private readonly muteListeners=new Set<(muted:boolean)=>void>();
private readonly muteChangeListeners=new Set<(muted:boolean)=>void>();
constructor(private readonly engine: AudioEngine) {}
setMix(effectsVolume:number, _musicVolume:number, voiceVolume=effectsVolume):void { this.effectsVolume=clampVolume(effectsVolume); this.engine.setVoiceVolume(clampVolume(voiceVolume)); }
beginVillageScore():void {}
setVillageFight(_active:boolean):void {}
villageMelee(cue: VillageMeleeCue, weaponKind: NativeCityWeaponImpactKind = "fist"): void {
    this.playVillageBeats(villageMeleeSoundPlan(cue, this.combatHitVariant++, weaponKind));
  }
villageImpact(hit: VillageImpactSound, tuning: NativeCityImpactFeelTuning["sfx"]): void {
    this.playVillageBeats(villageImpactSoundPlan(hit, this.combatHitVariant++, tuning));
  }
private playVillageBeats(beats: readonly CombatSampleBeat[]): void {
    for (const beat of beats) {
      this.engine.playSample(beat.key, beat.gain * this.effectsVolume, beat.delayMs, {
        ...(beat.rate === undefined ? {} : { rate: beat.rate }),
        ...(beat.attackMs === undefined ? {} : { attackMs: beat.attackMs }),
      });
    }
  }
stampThud(): void { this.engine.play(clockmakerLetterVoices("stamp"), 0.8 * this.effectsVolume, null); }
oddboutCoin(step: number, last: boolean, quiet: boolean): void {
    const lift = 1 + Math.min(step, 12) * 0.012;
    this.engine.play([
      { kind: "tone", wave: "sine", freq: 2_349 * lift, freqTo: 2_310 * lift, durMs: last ? 220 : 90, gain: 0.3 },
      { kind: "tone", wave: "sine", freq: 3_520 * lift, freqTo: 3_470 * lift, durMs: last ? 260 : 70, gain: 0.18, delayMs: 25 },
      ...(last ? [{ kind: "tone" as const, wave: "sine" as const, freq: 4_699, freqTo: 4_640, durMs: 320, gain: 0.14, delayMs: 70 }] : []),
    ], (quiet ? 0.05 : last ? 0.14 : 0.08) * this.effectsVolume, null);
  }
unlock(): void {
    this.engine.unlock();
  }
toggleMute(): boolean {
    const muted = this.engine.toggleMute();
    for (const listener of this.muteListeners) listener(muted);
    this.notifyMuteChanged(muted);
    return muted;
  }
setMuted(muted: boolean): void {
    const before = this.engine.muted;
    this.engine.setMuted(muted);
    if (this.engine.muted !== before) this.notifyMuteChanged(this.engine.muted);
  }
onMuteToggled(listener: (muted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => { this.muteListeners.delete(listener); };
  }
onMuteChanged(listener: (muted: boolean) => void): () => void {
    this.muteChangeListeners.add(listener);
    return () => { this.muteChangeListeners.delete(listener); };
  }
private notifyMuteChanged(muted: boolean): void {
    for (const listener of this.muteChangeListeners) listener(muted);
  }
get muted(): boolean {
    return this.engine.muted;
  }
suspendForBackground(): void {
    this.engine.suspendForBackground();
  }
resumeFromBackground(): void {
    this.engine.resumeFromBackground();
  }
fightVoice(key: string, gain: number, delayMs: number): SampleHandle | null {
    return this.engine.playSampleStoppable(key, gain, delayMs, { bus: "voice", attackMs: FIGHT_VOICE_ATTACK_MS });
  }
fightVoiceReady(key: string): Promise<boolean> {
    return this.engine.whenReady(key);
  }
holdFightVoices(keys: readonly string[]): void {
    for (const key of keys) this.engine.prefetch(key);
  }
releaseFightVoices(keys: readonly string[]): void {
    for (const key of keys) this.engine.release(key);
  }
duckForVoice(holdMs: number): void {
    this.engine.pulseLoopGain(FIGHT_VOICE_MUSIC_DUCK, holdMs);
  }
shutdown(): void {
    this.engine.shutdown();
  }
arenaIntroHit(fight: boolean, gain: number): void {
    const asset = fight ? COMBAT_SFX.hitFinisher : COMBAT_SFX.hitHeavy[0]!;
    this.engine.playSample(asset.key, gain * this.effectsVolume, 0, { attackMs: 1 });
  }
titlePrologueCue(kind: TitlePrologueSound, pitch = 1): void {
    this.engine.play(titlePrologueVoices(kind, pitch), 0.7 * this.effectsVolume, null);
  }
uiHover(_step: number, set: UiSoundSet = "default"): void { this.playUiSound("hover", set); }
uiPress(set: UiSoundSet = "default"): void { this.playUiSound("press", set); }
uiReject(set: UiSoundSet = "default"): void { this.playUiSound("reject", set); }
private playUiSound(kind: UiSoundKind, set: UiSoundSet = "default"): void {
    const sound = uiSound(kind, set);
    const gain = sound.gain * this.effectsVolume;
    if (!this.engine.playSample(sound.asset.key, gain, 0, { attackMs: 1 })) {
      this.engine.play(sound.fallback, gain, null, "effects");
    }
  }
}
