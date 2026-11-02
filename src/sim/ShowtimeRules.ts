import type { SimEvent, Vec2 } from "./types";

/** 한 장면에서 서로 다른 수법을 엮는 괴도극의 다섯 박자. */
export const SHOWTIME_BEATS = ["shadow", "trick", "caper", "duel", "prize"] as const;
export type ShowtimeBeat = (typeof SHOWTIME_BEATS)[number];

export const SHOWTIME_MASTERPIECE_BEATS = 4;
export const SHOWTIME_WINDOW_MS = 20_000;

export interface ShowtimeState {
  readonly beats: readonly ShowtimeBeat[];
  readonly windowMs: number;
  readonly peak: number;
  /** 한 런에 한 번뿐인 실제 회복 보상을 이미 받았는가. */
  readonly masterpiece: boolean;
}

export function createShowtime(): ShowtimeState {
  return { beats: [], windowMs: 0, peak: 0, masterpiece: false };
}

export function observe(
  state: ShowtimeState,
  sourceEvents: readonly SimEvent[],
  dtMs: number,
  fallbackAt: Vec2,
): { readonly state: ShowtimeState; readonly events: readonly SimEvent[]; readonly reward: boolean } {
  if (state.masterpiece) return { state, events: [], reward: false };

  let beats = state.windowMs > dtMs ? [...state.beats] : [];
  let windowMs = state.windowMs > dtMs ? state.windowMs - dtMs : 0;
  let peak = Math.max(state.peak, beats.length);
  const events: SimEvent[] = [];

  for (const event of sourceEvents) {
    const beat = beatOf(event);
    if (beat === null || beats.includes(beat)) continue;
    if (beats.length === 0) windowMs = SHOWTIME_WINDOW_MS;
    beats.push(beat);
    peak = Math.max(peak, beats.length);
    const at = "at" in event ? event.at : fallbackAt;
    events.push({ kind: "ShowtimeBeatAdded", beat, count: beats.length, at });
    if (beats.length >= SHOWTIME_MASTERPIECE_BEATS) {
      events.push({ kind: "ShowtimeMasterpiece", beats: [...beats], at });
      return {
        state: { beats, windowMs, peak, masterpiece: true },
        events,
        reward: true,
      };
    }
  }

  return {
    state: { beats, windowMs, peak, masterpiece: false },
    events,
    reward: false,
  };
}

function beatOf(event: SimEvent): ShowtimeBeat | null {
  switch (event.kind) {
    case "PlayerHid":
    case "LampSnuffed":
    case "PerfectDodge":
      return "shadow";
    case "SmokeDeployed":
    case "ClockworkMouseReleased":
    case "SilkWireVaulted":
    case "DisguiseActivated":
    case "RibbonSnareTriggered":
    case "GuardPickpocketed":
    case "ChandelierDropped":
      return "trick";
    case "CaperChainCompleted":
      return "caper";
    case "PerfectCounter":
    case "ComboFinisherLaunched":
    case "GuardChainShoved":
      return "duel";
    case "LootCollected":
    case "PersonalArtifactAlarmTriggered":
      return "prize";
    default:
      return null;
  }
}
