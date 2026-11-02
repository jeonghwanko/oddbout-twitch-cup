import Phaser from "phaser";
import type { RuntimeOptions } from "../../app/RuntimeOptions";
import { SCENE_KEYS } from "../../app/GameFlow";
import { createTwitchArenaStartGate, twitchArenaCorner, twitchBoutBootTimeoutMs, validateTwitchArenaStartMessage, TWITCH_ARENA_BOUT_TIMEOUT_MS,
  type TwitchArenaBoutRequest, type TwitchArenaMessage } from "../../app/TwitchArenaBout";
import type { CityFightBoutResult } from "../../sim/cityFight/bout/CityFightFighterBout";
import { bootGame } from "./GameBoot";
import { sfx } from "../audio/sfx";

/** One game/document hosts all exhibitions. The parent owns the bracket and attempt tokens. */
export async function bootTwitchArenaBout(initialRequest: TwitchArenaBoutRequest, options: RuntimeOptions): Promise<void> {
  const origin = location.origin;
  const acceptStart = createTwitchArenaStartGate();
  let disposed = false;
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
    const [{ ArenaDuelScene }, { loadCityFighterPack }, { prepareRegisteredCupFighter, registeredArenaDuelReady }] = await Promise.all([
      import("../scenes/ArenaDuelScene"), import("../art/CityFighterPacks"), import("../art/RegisteredArenaFighters"),
    ]);
    if (disposed) return;
    // A registered corner comes in straight by id with every file (the cup's own load) and fights only while he may meet others.
    const loadCorner = (id: string): Promise<boolean> => twitchArenaCorner(id) === "fighter"
      ? loadCityFighterPack(id).then(pack => pack !== null)
      : prepareRegisteredCupFighter(id).then(() => registeredArenaDuelReady(id), () => false);
    const start = async (request: TwitchArenaBoutRequest): Promise<void> => {
      const hostGame = game;
      if (disposed || !hostGame || !acceptStart(request)) return;
      retireAttempt();
      const attempt: Attempt = { request, settled: false, ready: false, deadline: 0 };
      active = attempt;
      attempt.deadline = window.setTimeout(() => fail(attempt, "The battle did not become ready. Retry this match."), twitchBoutBootTimeoutMs(request));
      try {
        const loaded = await Promise.all([request.a, request.b].map(loadCorner));
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
                attempt.deadline = window.setTimeout(() => fail(attempt, "The battle exceeded its time limit. Retry this match."), TWITCH_ARENA_BOUT_TIMEOUT_MS);
                send({ ...request, type: "oddbout:twitch:bout-ready" });
              }, onResult, onError: message => fail(attempt, message) } });
          }
        }
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
        if (!disposed) window.parent.postMessage({ type: "oddbout:twitch:host-ready", protocol: 1 }, origin);
      }
    }
    game = await bootGame({ options, title: "ODDBOUT · Twitch", scenes: [TwitchHostScene], displayFontAfterIntro: false });
    if (disposed) { game.loop.stop(); sfx.shutdown(); }
  } catch { fatal(); }
}
