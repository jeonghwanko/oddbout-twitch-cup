import { actionLabel, fighterKitLabel } from "../../../app/ActionLabels";
import { bindingLabel, CITY_FIGHT_SUPER_PAD_SOURCE, cityCombatPadActive, cityFightPadSource, coachKeycapLabel, padActionActive } from "../../../app/InputBindings";
import type { Locale } from "../../../app/Locale";
import { gamepadKeycapLabel } from "../../input/gamepad";
import type { ArenaHudKey } from "./ArenaHudView";
import type { GamepadControl } from "../../input/gamepad";
import { resolvedCityCombatBindings, resolvedHeistBindings, type PlayerSettings } from "../../../app/PlayerSettings";
import type { KumaControl, KumaControlPress } from "../../../sim/cityFight/NativeCityKumaCombatState";
import type { GamepadSample } from "../../input/gamepad";
import type { FightAnswerKeys } from "../../dom/fightStatusDialog";

/** The pad buttons a played corner fights with (they are never 확인 / 뒤로 then — `MenuInputRouterOptions.claimedPad`). */
export function arenaDuelClaimedPad(settings: PlayerSettings): readonly GamepadControl[] {
  const buttons = settings.padButtons;
  return [cityFightPadSource("attack"), cityFightPadSource("heavy"), cityFightPadSource("guard"), cityFightPadSource("dodge"),
    CITY_FIGHT_SUPER_PAD_SOURCE].map(action => buttons[action]);
}

/**
 * How long a press waits for its fighter to be free (fight ms — a freeze does not age it): a key hit in the last moments of a swing, a
 * flinch or a get-up still goes out when he can act, as a fighting game buffers it. Older: dropped.
 */
export const ARENA_DUEL_PRESS_BUFFER_MS = 180;

/** What a person's hands do this frame (keys and pad together): the press made now, the held direction and guard. */
export interface ArenaDuelHands {
  readonly press: KumaControlPress | null;
  readonly left: boolean;
  readonly right: boolean;
  readonly guard: boolean;
}

interface HeldKey { readonly isDown: boolean }

/** The keys a person plays a corner with, as the village fight binds them (the player's overrides included). */
export interface ArenaDuelKeys {
  readonly light: readonly HeldKey[];
  readonly heavy: readonly HeldKey[];
  readonly guard: readonly HeldKey[];
  readonly special: readonly HeldKey[];
  readonly super: readonly HeldKey[];
  readonly left: readonly HeldKey[];
  readonly right: readonly HeldKey[];
}

/** The corner's keys on `keyboard`: C string, V slam, Z guard, X special, S super, ← → walk (`INPUT_BINDINGS`, rebound as set). */
export function arenaDuelKeys(keyboard: { addKey(key: string): HeldKey }, settings: PlayerSettings): ArenaDuelKeys {
  const heist = resolvedHeistBindings(settings), city = resolvedCityCombatBindings(settings);
  const add = (binding: readonly string[]) => binding.map(key => keyboard.addKey(key));
  return { light: add(heist.attack), heavy: add(heist.heavy), guard: add(city.guard), special: add(city.dodge), super: add(city.release),
    left: add(heist.left), right: add(heist.right) };
}

/**
 * This frame's hands. `justDown`: the key went down this frame (the scene's `Phaser.Input.Keyboard.JustDown`). The pad borrows the village
 * fight's buttons (`cityFightPadSource`, `CITY_COMBAT_PAD_SOURCE`, `CITY_FIGHT_SUPER_PAD_SOURCE`). Several presses at once: the super, the
 * special, the slam, the string — the rarer move wins.
 */
export function arenaDuelHands(keys: ArenaDuelKeys, justDown: (key: HeldKey) => boolean, pad: GamepadSample, settings: PlayerSettings): ArenaDuelHands {
  const buttons = settings.padButtons, hit = (list: readonly HeldKey[]) => list.some(justDown), held = (list: readonly HeldKey[]) => list.some(key => key.isDown);
  const press: KumaControlPress | null =
    hit(keys.super) || padActionActive(pad.pressed, CITY_FIGHT_SUPER_PAD_SOURCE, buttons) ? "super"
    : hit(keys.special) || cityCombatPadActive(pad.pressed, "dodge", buttons) ? "special"
    : hit(keys.heavy) || padActionActive(pad.pressed, cityFightPadSource("heavy"), buttons) ? "heavy"
    : hit(keys.light) || padActionActive(pad.pressed, cityFightPadSource("attack"), buttons) ? "light" : null;
  return { press, left: held(keys.left) || pad.held.left, right: held(keys.right) || pad.held.right,
    guard: held(keys.guard) || cityCombatPadActive(pad.held, "guard", buttons) };
}

/**
 * The played corner's key chips (the arena HUD's bottom row): C his string, V his slam, Z the guard, X his summon (a summoner) or his own skill
 * (`special`: "skill", 2026-10-22), S his super — each key as bound on the device in use.
 */
export function arenaDuelKeyChips(settings: PlayerSettings, locale: Locale, gamepad: boolean, special: "summon" | "skill" | null): readonly ArenaHudKey[] {
  const heist = resolvedHeistBindings(settings), city = resolvedCityCombatBindings(settings), buttons = settings.padButtons;
  const pad = (action: Parameters<typeof cityFightPadSource>[0]) => gamepadKeycapLabel(cityFightPadSource(action), buttons);
  return [
    { key: gamepad ? pad("attack") : coachKeycapLabel("attack", heist), label: fighterKitLabel("light", locale) },
    { key: gamepad ? pad("heavy") : coachKeycapLabel("heavy", heist), label: fighterKitLabel("heavy", locale) },
    { key: gamepad ? pad("guard") : bindingLabel("guard", city), label: actionLabel("guard", locale) },
    ...(special ? [{ key: gamepad ? pad("dodge") : bindingLabel("dodge", city), label: fighterKitLabel(special === "skill" ? "skill" : "special", locale) }] : []),
    { key: gamepad ? gamepadKeycapLabel(CITY_FIGHT_SUPER_PAD_SOURCE, buttons) : bindingLabel("release", city), label: fighterKitLabel("super", locale) },
  ];
}

/** The status card's answer keys (Z guard, X dodge, V heavy, C attack) as bound on the device in use. */
export function arenaDuelAnswerKeys(settings: PlayerSettings, gamepad: boolean): FightAnswerKeys {
  const heist = resolvedHeistBindings(settings), city = resolvedCityCombatBindings(settings), buttons = settings.padButtons;
  const pad = (action: Parameters<typeof cityFightPadSource>[0]) => gamepadKeycapLabel(cityFightPadSource(action), buttons);
  return gamepad ? { guard: pad("guard"), dodge: pad("dodge"), heavy: pad("heavy"), attack: pad("attack") }
    : { guard: bindingLabel("guard", city), dodge: bindingLabel("dodge", city), heavy: coachKeycapLabel("heavy", heist), attack: coachKeycapLabel("attack", heist) };
}

/**
 * A person's hands on a corner of the arena's duel (2026-10-22, the competitive engine — docs/Plan/2026-10-22-competitive-fighter-engine):
 * one `KumaControl` per engine step. The walk is told on the screen (← →) and given to the rules relative to the opponent; the press waits in a
 * short buffer until a step takes it (`spent`).
 */
export class ArenaDuelControl {
  private buffered: { readonly press: KumaControlPress; ageMs: number } | null = null;
  private hands: ArenaDuelHands = { press: null, left: false, right: false, guard: false };

  /** This frame's hands: a new press replaces the waiting one; a waiting one older than `ARENA_DUEL_PRESS_BUFFER_MS` is dropped. */
  frame(hands: ArenaDuelHands, dtMs: number): void {
    this.hands = hands;
    if (hands.press) this.buffered = { press: hands.press, ageMs: 0 };
    else if (this.buffered && (this.buffered.ageMs += Math.max(0, dtMs)) > ARENA_DUEL_PRESS_BUFFER_MS) this.buffered = null;
  }

  /** This step's command for a corner standing on `side` of his opponent on the screen (-1: left of him, +1: right of him). */
  command(side: -1 | 1): KumaControl {
    const { left, right, guard } = this.hands;
    const screen = left === right ? 0 : right ? 1 : -1;
    return { walk: (screen === 0 ? 0 : screen === -side ? 1 : -1), guard, press: this.buffered?.press ?? null };
  }

  /** A step started his swing: the waiting press is spent. */
  spent(): void { this.buffered = null; }

  /** Out of the fight (paused, the result): nothing waits, nothing is held. */
  clear(): void { this.buffered = null; this.hands = { press: null, left: false, right: false, guard: false }; }
}
