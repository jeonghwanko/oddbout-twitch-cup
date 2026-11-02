import Phaser from "phaser";
import type { RuntimeOptions } from "../../app/RuntimeOptions";
import { SCENE_KEYS } from "../../app/GameFlow";
import { createTwitchArenaStartGate, twitchArenaCorner, twitchBoutBootTimeoutMs, validateTwitchArenaStartMessage, TWITCH_ARENA_BOUT_TIMEOUT_MS,
  type TwitchArenaBoutRequest, type TwitchArenaMessage } from "../../app/TwitchArenaBout";
import type { CityFightBoutResult } from "../../sim/cityFight/bout/CityFightFighterBout";
import { bootGame } from "./GameBoot";
import { sfx } from "../audio/sfx";

performance.mark?.("oddbout:host-module");

/** One game/document hosts all exhibitions. The parent owns the bracket and attempt tokens. */
export async function bootTwitchArenaBout(initialRequest: TwitchArenaBoutRequest, options: RuntimeOptions): Promise<void> {
  const origin = location.origin;
  const acceptStart = createTwitchArenaStartGate();
  let disposed = false;
  let terminalFailure = false;
  let game: Awaited<ReturnType<typeof bootGame>> | null = null;
  type Attempt = { request: TwitchArenaBoutRequest; settled: boolean; ready: boolean; deadline: number };
  let active: Attempt | null = null;
  const send = (message: TwitchArenaMessage) => { if (!disposed) window.parent.postMessage(message, origin); };
  const current = (attempt: Attempt): boolean => !disposed && active === attempt && !attempt.settled;
  const fail = (attempt: Attempt, message: string) => {
    if (!current(attempt)) return;
    attempt.settled = true; window.clearTimeout(attempt.deadline);
    // Keep the host loop running so a later retry can create a new scene.
    game?.scene.pause(SCENE_KEYS.arenaDuel);
    send({ ...attempt.request, type: "oddbout:twitch:bout-error", message });
  };
  const fatal = () => {
    // GameBoot stops the loop on a global error. Even when the previous bout is
    // already settled, later requests must fail promptly so the parent replaces this host.
    terminalFailure = true;
    if (active) fail(active, "The battle could not continue. Retry this match.");
    else send({ ...initialRequest, type: "oddbout:twitch:bout-error", message: "Could not start the battle host." });
  };
  const retireAttempt = () => {
    if (active) { active.settled = true; window.clearTimeout(active.deadline); active = null; }
    if (game?.scene.getScene(SCENE_KEYS.arenaDuel)) {
      // SHUTDOWN runs SceneScope disposables before the old instance is removed.
      game.scene.stop(SCENE_KEYS.arenaDuel);
      game.scene.remove(SCENE_KEYS.arenaDuel);
    }
  };
  let receive: ((event: MessageEvent) => void) | null = null;
  window.addEventListener("error", fatal);
  window.addEventListener("unhandledrejection", fatal);
  window.addEventListener("pagehide", () => {
    disposed = true; retireAttempt();
    window.removeEventListener("error", fatal);
    window.removeEventListener("unhandledrejection", fatal);
    if (receive) window.removeEventListener("message", receive);
    // A removed document may never receive the next frame required by Phaser.destroy().
    game?.loop.stop(); sfx.shutdown();
  }, { once: true });
  try {
    // Fetch the arena graph while GameBoot loads fonts and initializes Phaser. Observe
    // failures immediately, even if the parent has not sent its first start command yet.
    const resources = Promise.all([
      import("../scenes/ArenaDuelScene"), import("../art/CityFighterPacks"), import("../art/RegisteredArenaFighters"),
    ]).then(deps => { performance.mark?.("oddbout:modules-ready"); return deps; }).catch(() => { fatal(); return null; });
    const start = async (request: TwitchArenaBoutRequest): Promise<void> => {
      const hostGame = game;
      if (disposed || !hostGame || !acceptStart(request)) return;
      if (terminalFailure) {
        send({ ...request, type: "oddbout:twitch:bout-error", message: "The battle host failed. Retry this match." });
        return;
      }
      retireAttempt();
      const attempt: Attempt = { request, settled: false, ready: false, deadline: 0 };
      active = attempt;
      attempt.deadline = window.setTimeout(() => fail(attempt, "The battle did not become ready. Retry this match."), twitchBoutBootTimeoutMs(request));
      try {
        const dependencies = await resources;
        if (!current(attempt) || !dependencies) return;
        const [{ ArenaDuelScene }, { loadCityFighterPack }, { prepareRegisteredCupFighter, registeredArenaDuelReady }] = dependencies;
        // Registered corners load straight by id, with their current approval checked.
        const loadCorner = (id: string): Promise<boolean> => twitchArenaCorner(id) === "fighter"
          ? loadCityFighterPack(id).then(pack => pack !== null)
          : prepareRegisteredCupFighter(id).then(() => registeredArenaDuelReady(id), () => false);
        performance.mark?.("oddbout:packs-start");
        const loaded = await Promise.all([request.a, request.b].map(loadCorner));
        performance.mark?.("oddbout:packs-ready");
        if (!current(attempt)) return;
        if (!loaded.every(Boolean)) { fail(attempt, "Could not load the battle fighters"); return; }
        const onResult = (result: CityFightBoutResult) => {
          if (!current(attempt)) return;
          attempt.settled = true; window.clearTimeout(attempt.deadline);
          send({ ...request, type: "oddbout:twitch:bout-result", winnerId: result.winner === 0 ? request.a : request.b, result });
        };
        class TwitchArenaScene extends ArenaDuelScene {
          override init(): void {
            super.init({ a: request.a, b: request.b, seed: request.seed, matchId: request.boutId,
              broadcast: { onReady: () => {
                if (!current(attempt) || attempt.ready) return;
                attempt.ready = true; window.clearTimeout(attempt.deadline);
                performance.mark?.("oddbout:bout-ready");
                attempt.deadline = window.setTimeout(() => fail(attempt, "The battle exceeded its time limit. Retry this match."), TWITCH_ARENA_BOUT_TIMEOUT_MS);
                send({ ...request, type: "oddbout:twitch:bout-ready" });
              }, onResult, onError: message => fail(attempt, message) } });
          }
        }
        performance.mark?.("oddbout:scene-add");
        hostGame.scene.add(SCENE_KEYS.arenaDuel, TwitchArenaScene, true);
      } catch { fail(attempt, "Could not load the battle. Retry this match."); }
    };
    receive = event => {
      const command = validateTwitchArenaStartMessage(event, origin, window.parent);
      if (command) void start(command);
    };
    window.addEventListener("message", receive);
    class TwitchHostScene extends Phaser.Scene {
      constructor() { super("TwitchArenaHost"); }
      create(): void {
        game = this.game;
        performance.mark?.("oddbout:host-ready");
        if (!disposed) window.parent.postMessage({ type: "oddbout:twitch:host-ready", protocol: 1 }, origin);
      }
    }
    game = await bootGame({ options, title: "ODDBOUT · Twitch", scenes: [TwitchHostScene], displayFontAfterIntro: false });
    if (disposed) { game.loop.stop(); sfx.shutdown(); }
  } catch { fatal(); }
}
