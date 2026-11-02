import type Phaser from "phaser";
import type { Locale } from "../../app/Locale";
import { CITY_FIGHT_FOLLOW_UP_STAGINGS, type CityFightAwakening } from "../../sim/cityFight/CityFightAwakening";
import type { NativeCityBackdropFrame } from "../effects/NativeCityScreenGrade";
import { CityFightStarfallView, type CityFightStarfallBody } from "./CityFightStarfallView";
import { CityFightAwakeningMotifView, type CityFightAwakeningClip, type CityFightAwakeningCue, type CityFightAwakeningFigure,
  type CityFightAwakeningMotif, type CityFightAwakeningReadableStage } from "./CityFightAwakeningMotifView";
import { CITY_FIGHT_AWAKENING_MOTIFS } from "./awakening/CityFightAwakeningMotifs";



/** What a follow-up staging reads off the fight (the rules' clock and the struck body). */
export interface CityFightAwakeningHooks {
  /** The body it is thrown at, read live (world px feet, lifted by his flight, and his body height); null: the struck sprite's. */
  readonly target?: () => CityFightStarfallBody | null;
  /** The caster's body, read live (as `target`); null: the caster's sprite's. */
  readonly caster?: () => CityFightStarfallBody | null;
  /** Its camera beats (the lean toward him, the rift's jolt, a shake, a zoom punch). */
  readonly cue?: (cue: CityFightAwakeningCue, value?: number) => void;
  /** The rules' follow-up clock (fight ms since the super's contact), null when there is none (yet / any more). */
  readonly progress?: () => number | null;
  /** Fight ms until its down beat while he lies waiting for it, else null. */
  readonly downIn?: () => number | null;
  /** A cell of a fighter's own clip as a figure (0: the caster, 1: the struck — a motif's figures), or null. */
  readonly figure?: (who: 0 | 1, clip: string, ms: number, loop: boolean) => CityFightAwakeningFigure | null;
}

export class CityFightAwakeningStages {
  private readonly starfall: CityFightStarfallView;
  /** A motif view per corner: an awakening cast over the other's (two supers crossing) plays beside it, not in its place. */
  private readonly motifs: readonly [CityFightAwakeningMotifView, CityFightAwakeningMotifView];
  /** Who cast the starfall now staged (the actors' index): its actors are the caster's first. */
  private starfallCaster: 0 | 1 = 0;
  /** The corner whose super started last (the default for a contact or beat that does not say whose). */
  private latest: 0 | 1 = 0;


  constructor(scene: Phaser.Scene, camera: () => Phaser.Cameras.Scene2D.Camera,
    private readonly actors: () => readonly (Phaser.GameObjects.Sprite | null | undefined)[], worldPxPerScreenPx: () => number,
    locale: Locale, private readonly bodyHeight: () => number, skyColours: () => boolean = () => false,
    readable: CityFightAwakeningReadableStage | null = null) {
    const casterFirst = (caster: () => 0 | 1) => () => {
      const [a, b] = this.actors();
      return caster() === 0 ? [a, b] : [b, a];
    };
    this.starfall = new CityFightStarfallView(scene, camera, casterFirst(() => this.starfallCaster), worldPxPerScreenPx, readable);
    this.motifs = [new CityFightAwakeningMotifView(scene, camera, casterFirst(() => 0), locale, skyColours, readable),
      new CityFightAwakeningMotifView(scene, camera, casterFirst(() => 1), locale, skyColours, readable)];
  }

  /** A staging draws its own light round its blows now (the starfall, a motif): the caller keeps the shared drawn art off them. */
  get lit(): boolean { return this.starfall.active || this.motifs.some(motif => motif.active); }

  /**
   * `caster`'s super starts (the actors' index), staged as his `awakening` says (null / none: nothing). True when that staging draws its own
   * light (`lit` — the caller keeps the cut-in's chest burst off). The other corner's staging, if any, plays on.
   */
  play(caster: 0 | 1, awakening: CityFightAwakening | null, reducedMotion: boolean, hooks: CityFightAwakeningHooks = {}): boolean {
    this.motifs[caster].stop();
    if (this.starfallCaster === caster) this.starfall.stop();
    this.latest = caster;
    const staging = awakening?.staging ?? null;
    if (staging === null) return false;
    if (CITY_FIGHT_FOLLOW_UP_STAGINGS.includes(staging)) {
      this.starfallCaster = caster;
      this.starfall.play(reducedMotion, hooks.target ?? (() => this.body(1 - caster)), hooks.cue ?? (() => undefined), hooks.progress ?? (() => null),
        hooks.downIn ?? (() => null));
      return true;
    }
    const motif = CITY_FIGHT_AWAKENING_MOTIFS.get(staging);
    if (!motif) return false;
    this.playMotif(caster, motif, awakening?.followUp ?? null, reducedMotion, hooks);
    return true;
  }

  /**
   * `caster`'s super starts staged by a motif made for him (a registered fighter's — `RegisteredAwakeningMotifs`: his own art and colour, no
   * follow-up), in place of an awakening's. It draws its own light (`lit`).
   */
  playOwn(caster: 0 | 1, motif: CityFightAwakeningMotif, reducedMotion: boolean, hooks: CityFightAwakeningHooks = {}): boolean {
    if (this.starfallCaster === caster) this.starfall.stop();
    this.latest = caster;
    this.playMotif(caster, motif, null, reducedMotion, hooks);
    return true;
  }

  private playMotif(caster: 0 | 1, motif: CityFightAwakeningMotif, follow: CityFightAwakening["followUp"], reducedMotion: boolean,
    hooks: CityFightAwakeningHooks): void {
    this.motifs[caster].play(motif, follow, reducedMotion, { target: hooks.target ?? (() => this.body(1 - caster)),
      caster: hooks.caster ?? (() => this.body(caster)), cue: hooks.cue ?? (() => undefined), progress: hooks.progress ?? (() => null),
      downIn: hooks.downIn ?? (() => null), ...(hooks.figure ? { figure: hooks.figure } : {}) });
  }

  /** `caster`'s super's contact landed (`blocked`: guarded) on the other body; `damage`: the HP it took. */
  resolve(blocked: boolean, damage = 0, caster: 0 | 1 = this.latest): void {
    this.motifs[caster].resolve(blocked, damage);
    const struck = this.actors()[1 - caster];
    if (struck && this.starfallCaster === caster) this.starfall.resolve({ x: struck.x, y: struck.y });
  }


  beat(index: number, damage = 0, caster: 0 | 1 = this.latest): void {
    if (this.starfallCaster === caster) this.starfall.beat(index);
    this.motifs[caster].beat(index, damage);
  }

  /** What corner `corner` plays over his stand now (his awakening motif's clip while he casts it), or null. */
  casterClip(corner: 0 | 1): CityFightAwakeningClip | null {
    return this.motifs[corner].active ? this.motifs[corner].casterClip() : null;
  }

  /** One frame on screen ms. */
  update(screenDtMs: number): void { this.starfall.update(screenDtMs); for (const motif of this.motifs) motif.update(screenDtMs); }

  /** Its sky over the stage this frame (the starfall's night, a motif's own — the latest caster's first), or null. */
  backdrop(): NativeCityBackdropFrame | null {
    return this.starfall.backdrop() ?? this.motifs[this.latest].backdrop() ?? this.motifs[1 - this.latest]!.backdrop();
  }

  stop(): void { this.starfall.stop(); for (const motif of this.motifs) motif.stop(); }

  destroy(): void { this.starfall.destroy(); for (const motif of this.motifs) motif.destroy(); }

  /** Actor `index`'s body (its sprite's feet and the fight's body height). */
  private body(index: number): CityFightStarfallBody | null {
    const sprite = this.actors()[index];
    return sprite ? { x: sprite.x, y: sprite.y, h: this.bodyHeight() } : null;
  }
}
