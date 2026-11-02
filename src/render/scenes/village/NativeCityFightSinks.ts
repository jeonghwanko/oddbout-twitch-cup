import type Phaser from "phaser";
import { stringOf, t } from "../../../app/i18n";
import { type Locale, koOrEn } from "../../../app/Locale";
import type { NativeCityDefinition } from "../../../world/NativeCityDefinition";
import type { SceneScope } from "../../lifecycle/SceneScope";
import { NativeCityCombatBubbleView } from "../../view/NativeCityCombatBubbleView";
import { NativeCityCombatFxView } from "../../view/NativeCityCombatFxView";
import { NativeCityFloatTextView } from "../../view/NativeCityFloatTextView";
import { CityFightComboCounterView, type CityFightComboLook } from "../../view/CityFightComboCounterView";
import { cityFightSuperCast } from "../../view/CityFightSuperCutIn";
import { CityFightSuperFlashView } from "../../view/CityFightSuperFlashView";
import { CityFightAwakeningStages, type CityFightAwakeningHooks } from "../../view/CityFightAwakeningStages";
import { cityFightAwakening } from "../../../sim/cityFight/CityFightAwakening";
import { CityFightMeterBarView } from "../../view/CityFightMeterBarView";
import { NativeCityHitFxView } from "../../view/NativeCityHitFxView";
import type { NativeCityImpactFeelView } from "../../view/NativeCityImpactFeelView";
import { ARENA_IMPACT_FRAME_CORNERS, NativeCityImpactFrameView } from "../../view/NativeCityImpactFrameView";
import { NativeCityScreenGradeView } from "../../view/NativeCityScreenGradeView";
import { NativeCitySummonView } from "../../view/NativeCitySummonView";
import { PixelDotFxView } from "../../view/PixelDotFxView";
import { SfxLetterView } from "../../view/SfxLetterView";
import { NativeCityFightStats } from "./NativeCityFightStats";
import { cameraShareY } from "../../view/WorldCeiling";

/** What the fight's screen effects read from the scene that draws the fight (the village, the tournament arena). Read live. */
export interface NativeCityFightSinksSpec {
  readonly locale: () => Locale;
  readonly projection: () => NativeCityDefinition;
  readonly actorHeight: () => number;
  readonly worldPxPerScreenPx: () => number;
  readonly reducedMotion: () => boolean;
  /** The 3D card view draws the fight's floor effects (the village's town); false in a 2D scene. */
  readonly cardMode: () => boolean;

  readonly awakeningSky?: () => boolean;
  readonly worldCamera: () => Phaser.Cameras.Scene2D.Camera;

  readonly actors: () => Phaser.GameObjects.Sprite[];
  /** A summon's blast cloud behind the bodies, not over them (`NativeCitySummonViewSpec.blastBehindBodies` — the arena's AI duel). */
  readonly blastBehindBodies?: boolean;
  /**
   * The arena's AI duel (2026-10-23 arena audit): its effects keep both fighters readable — an awakening's back light and floor behind them
   * at `behindDepth` and its light over them dimmed (`CityFightAwakeningStages` `readable`), the KO's ink frame with the striker dark and the
   * struck gold, rimmed, its blow's point lit (`ARENA_IMPACT_FRAME_CORNERS`). Absent: the village's.
   */
  readonly arena?: { readonly behindDepth: number };
  /** The hit counters' look (`CityFightComboCounterView` — the arena's two screens draw them in the face HUD's lettering). Absent: the village's. */
  readonly comboLook?: CityFightComboLook;
  /**
   * The arena's face HUD floor as a share of the view's height (`ArenaFaceHud.floorShare`): the comic letters pop and the hit counters stand
   * under it. Absent: the village's (letters over the heads wherever they are).
   */
  readonly hudFloor?: () => number;
}

/** The combat host's screen-effect members (`NativeCityCombatHost`) — what a scene spreads into the host it gives the combat controller. */



export class NativeCityFightSinks {
  readonly combatFx: NativeCityCombatFxView;
  readonly pixelDots: PixelDotFxView;

  readonly playerBubble: NativeCityCombatBubbleView;
  readonly foeBubble: NativeCityCombatBubbleView;
  readonly letters: SfxLetterView;
  readonly hitFx: NativeCityHitFxView;
  readonly impactFrame: NativeCityImpactFrameView;
  readonly floats: NativeCityFloatTextView;
  /** Each fighter's run of hits at his screen edge (`CityFightComboCounterView`, 2026-10-20). */
  readonly combo: CityFightComboCounterView;
  /** The super flash's cut-in band with the caster's body (`CityFightSuperFlashView`, 2026-10-20). */
  readonly superFlash: CityFightSuperFlashView;

  readonly awakening: CityFightAwakeningStages;
  /** The fighters' meters in the bottom corners (`CityFightMeterBarView`, 2026-10-20). */
  readonly meters: CityFightMeterBarView;
  readonly screenGrade: NativeCityScreenGradeView;
  /** The summoned objects (a summoner's crane, his car — `CityFightSession.summons`): a fixed pool, drawn from the rules each frame. */
  readonly summons: NativeCitySummonView;
  /** The fight's per-frame cost counters (`?perf=1`, `perf:village:fight`); null once the scene is gone. */
  stats: NativeCityFightStats | null;

  constructor(scene: Phaser.Scene, scope: SceneScope, private readonly spec: NativeCityFightSinksSpec) {
    // The arena's face HUD floor in world y as the camera stands now: letters, numbers and glass shards stay under it (`WorldCeiling`).
    const floor = spec.hudFloor, ceiling = floor ? () => cameraShareY(spec.worldCamera(), floor()) : null;
    this.combatFx = new NativeCityCombatFxView(scene, spec.projection, ceiling);
    scope.add(() => this.combatFx.destroy());
    this.pixelDots = new PixelDotFxView(scene, { projection: spec.projection, actorHeight: spec.actorHeight,
      worldPxPerScreenPx: spec.worldPxPerScreenPx, reducedMotion: spec.reducedMotion, cardMode: spec.cardMode });
    scope.add(() => this.pixelDots.destroy());
    this.playerBubble = new NativeCityCombatBubbleView(scene);
    this.foeBubble = new NativeCityCombatBubbleView(scene, "shout");
    // The fight's comic letters and ink impact frame; the controller drives them each frame.
    // The letter art is Korean and English only (a Japanese page draws the English letters).
    this.letters = new SfxLetterView(scene, () => koOrEn(spec.locale()), ceiling);
    scope.add(() => this.letters.destroy());
    // The drawn hit effects at the contact (impact star, ink slash — `feel.hitFx`), under the letters.
    this.hitFx = new NativeCityHitFxView(scene);
    scope.add(() => this.hitFx.destroy());
    this.impactFrame = new NativeCityImpactFrameView(scene, { camera: spec.worldCamera, linePx: spec.worldPxPerScreenPx, actors: spec.actors,
      ...(spec.arena ? { corners: ARENA_IMPACT_FRAME_CORNERS } : {}) });
    scope.add(() => this.impactFrame.destroy());
    // The damage numbers and status labels beside the struck bodies (over the impact band, under the letters).
    const impactFrame = this.impactFrame;
    this.floats = new NativeCityFloatTextView(scene, { camera: spec.worldCamera, worldPxPerScreenPx: spec.worldPxPerScreenPx,
      plateShowing: () => impactFrame.plateShowing, label: key => stringOf(spec.locale(), key), ...(ceiling ? { ceiling } : {}) });
    scope.add(() => this.floats.destroy());
    this.combo = new CityFightComboCounterView(scene, { camera: spec.worldCamera, worldPxPerScreenPx: spec.worldPxPerScreenPx,
      label: () => t(spec.locale(), "village.fightCombo.hits"), ...(spec.comboLook ? { look: spec.comboLook } : {}),
      ...(spec.hudFloor ? { topShare: spec.hudFloor } : {}) });
    scope.add(() => this.combo.destroy());
    this.superFlash = new CityFightSuperFlashView(scene, spec.worldCamera);
    scope.add(() => this.superFlash.destroy());
    this.awakening = new CityFightAwakeningStages(scene, spec.worldCamera, spec.actors, spec.worldPxPerScreenPx, spec.locale(), spec.actorHeight,
      spec.awakeningSky ?? (() => false), spec.arena ?? null);
    scope.add(() => this.awakening.destroy());
    this.meters = new CityFightMeterBarView(scene, spec.worldCamera, spec.worldPxPerScreenPx);
    scope.add(() => this.meters.destroy());
    // Whole-screen colour (the parry's ink flip, the slow-mo's desaturation) on everything drawn: a CSS filter on the canvases' parent,
    // because a Phaser camera postFX never reaches the village's three.js town under it.
    this.screenGrade = new NativeCityScreenGradeView(scene);
    scope.add(() => this.screenGrade.destroy());
    this.summons = new NativeCitySummonView(scene, { projection: spec.projection, actorHeight: spec.actorHeight, reducedMotion: spec.reducedMotion,
      ...(spec.blastBehindBodies ? { blastBehindBodies: true } : {}) });
    scope.add(() => this.summons.destroy());
    const stats = this.stats = new NativeCityFightStats();
    scope.add(() => { stats.destroy(); if (this.stats === stats) this.stats = null; });
  }

  /**
   * The combat host's effect members (`impactFeel`: the UI step's hit feel, unset before it). `voiceLine`: a bubble line's voice
   * (`FightVoicePlayer.line`, 2026-10-21 — KUMA's shift lines are heard as they pop up).
   */
  host(impactFeel: () => NativeCityImpactFeelView | undefined,
    voiceLine?: (key: string, speaker: "player" | "foe") => void) {
    const spec = this.spec;
    return {
      fx: this.combatFx, dots: this.pixelDots, letters: this.letters, hitFx: this.hitFx, impactFrame: this.impactFrame,
      floats: this.floats, grade: this.screenGrade, stats: this.stats!, summons: this.summons, combo: this.combo,
      // backdrop's (the village's town pass, the arena's background layer — `awakeningSky`).
      superCut: {
        play: (caster: 0 | 1, side: -1 | 1, who: string, hooks?: CityFightAwakeningHooks) => {
          const lit = this.awakening.play(caster, cityFightAwakening(who), spec.reducedMotion(), hooks);
          this.superFlash.play(spec.actors()[caster] ?? null, side, spec.reducedMotion(), cityFightSuperCast(spec.locale(), who), { burst: !lit });
        },
        lit: () => this.awakening.lit,
        update: (dt: number) => { this.superFlash.update(dt); this.awakening.update(dt); },
        beat: (beat: number, damage?: number, caster?: 0 | 1) => this.awakening.beat(beat, damage, caster),
        casterClip: (caster: 0 | 1) => this.awakening.casterClip(caster),
        resolve: (blocked = false, damage?: number, caster?: 0 | 1) => { this.superFlash.resolve(); this.awakening.resolve(blocked, damage, caster); },
        prepare: (ids: readonly string[]) => this.superFlash.prepare(ids),
        backdrop: () => (spec.awakeningSky ?? spec.cardMode)() ? this.awakening.backdrop() : null,
      },
      meters: this.meters,
      say: (key: string, durationMs: number, speaker?: "player" | "foe") => {
        (speaker === "foe" ? this.foeBubble : this.playerBubble).say(stringOf(spec.locale(), key), durationMs);
        voiceLine?.(key, speaker === "foe" ? "foe" : "player");
      },
      bubbleShield: (side: -1 | 1) => this.playerBubble.strike(side),
      kick: (kick: Parameters<NativeCityImpactFeelView["kick"]>[0]) => impactFeel()?.kick(kick), hurt: (tier: Parameters<NativeCityImpactFeelView["hurt"]>[0]) => impactFeel()?.hurt(tier), rumble: (rumble: Parameters<NativeCityImpactFeelView["rumble"]>[0]) => impactFeel()?.rumble(rumble),
    };
  }
}
