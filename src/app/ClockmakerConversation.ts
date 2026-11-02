import { readerReady, stepReader } from "./ConversationReader";
import { BIRD_RETURN_PRESENTATION } from "./BlackthorneStory";

/** One clock drives the shot, prop handoff and when the reader may advance. */
export const CLOCKMAKER_SHOT_MS = 900;
export const CLOCKMAKER_RETURN_MS = 760;
export type ClockmakerCue = "empty" | "memory" | "letter" | "loan" | "donation" | "window" | "key" | "promise" | "homecoming" | "winding" | "relief";
/**
 * `minMs` 는 줄을 넘기기 전의 강제 대기다. 시계공 대화의 손으로 넘기는 줄은 모두 0 —
 * "잠시 바라보기…" 대기가 길게 느껴졌다. 첫 누름은 타자기가 문장을 끝맺는 데 쓴다.
 * 자동으로 흐르는 태엽 감기(`autoAdvance`)만 노래 길이를 그대로 쥔다.
 */
export interface ClockmakerBeat {
  readonly cue: ClockmakerCue;
  readonly actor: "clockmaker" | "player";
  readonly minMs: number;
  readonly ko: string;
  readonly en: string;
  readonly autoAdvance?: boolean;
  readonly action?: readonly [string, string];
}
export const CLOCKMAKER_CONVERSATION: readonly ClockmakerBeat[] = [
  { cue: "empty", actor: "clockmaker", minMs: 0, ko: "아, 미안해요. 이 시간이면 태엽새가 노래했거든요.", en: "Oh, forgive me. My clockwork bird used to sing at this hour." },
  { cue: "memory", actor: "clockmaker", minMs: 0, ko: "아내가 흥얼거리던 곡을 넣었어요. 정오마다 같이 듣곤 했죠.", en: "I gave it the tune my wife used to hum. We listened together every noon." },
  { cue: "letter", actor: "clockmaker", minMs: 0, ko: "저택에서 온 편지예요. 읽어 봐 주시겠어요?", en: "This came from the manor. Would you read it?", action: ["편지 펼치기", "Unfold the letter"] },
  { cue: "loan", actor: "player", minMs: 0, ko: "‘하룻밤 전시 후 반환.’ 분명히 약속했군요.", en: "‘Return after one evening.’ A clear promise.", action: ["돌아온 서류와 대조하기", "Compare the certificate"] },
  { cue: "donation", actor: "clockmaker", minMs: 0, ko: "그런데 돌아온 건 기증서였어요. 빌려드린 거예요. 드린 게 아니라.", en: "They sent a donation certificate instead. I lent it. I never gave it away." },
  { cue: "window", actor: "clockmaker", minMs: 0, ko: "들리세요? 저택 위층에서… 저 노래예요.", en: "Do you hear it? Upstairs in the manor… That's its song." },
  { cue: "key", actor: "clockmaker", minMs: 0, ko: "이 열쇠로 태엽을 감아요. 돌아오면… 다시 노래할 수 있겠죠?", en: "This key winds it. When it comes home… could it sing again?" },
  { cue: "promise", actor: "player", minMs: 0, ko: "태엽새는 제가 데려오죠. 내일 정오에는 여기서 듣게 해드릴게요.", en: "I'll bring your bird home. Tomorrow at noon, we'll hear it right here." },
];
export const CLOCKMAKER_REMINDER: readonly ClockmakerBeat[] = [
  { cue: "window", actor: "clockmaker", minMs: 0, ko: "태엽새는 저택 위층에 있어요. 그 노래를 따라가 주세요.", en: "My bird is upstairs in the manor. Follow its song." },
  CLOCKMAKER_CONVERSATION[CLOCKMAKER_CONVERSATION.length - 1]!,
];
/** Return is reader paced too: credit is committed only after the last acknowledgement. */
export const CLOCKMAKER_HOMECOMING: readonly ClockmakerBeat[] = [
  { cue: "homecoming", actor: "player", minMs: 0, ko: "돌아왔습니다. 이 자리였죠?", en: "Home at last. Right here, wasn't it?", action: ["태엽 감기", "Wind the key"] },
  { cue: "winding", actor: "clockmaker", minMs: BIRD_RETURN_PRESENTATION.windingMs + BIRD_RETURN_PRESENTATION.durationMs + BIRD_RETURN_PRESENTATION.quietBreathMs, autoAdvance: true, ko: "…", en: "…" },
  { cue: "relief", actor: "clockmaker", minMs: 0, ko: "고마워요. 내일 정오가… 다시 기다려지네요.", en: "Thank you. I can look forward to noon again.", action: ["마을로 돌아가기", "Return to the village"] },
];
export interface ClockmakerConversationState {
  readonly phase: "idle" | "framing" | "conversation" | "returning" | "done";
  readonly index: number;
  readonly elapsedMs: number;
}
/**
 * 대화는 언제나 투샷 잡기(framing)부터 연다. `index` 는 잡기가 끝나고 읽기 시작할 줄 — 평소 0, 대사 도중
 * 이어하기면 저장한 줄이다(`ConversationResume`). 줄 안의 강제 대기는 모두 0 이라 따로 되감을 시계가 없다.
 */
export function startClockmakerConversation(index = 0): ClockmakerConversationState {
  return { phase: "framing", index: Math.max(0, Math.trunc(index)), elapsedMs: 0 };
}
export function clockmakerCanAdvance(state: ClockmakerConversationState, beats: readonly ClockmakerBeat[]): boolean {
  return state.phase === "conversation" && readerReady({ ...state, complete: false }, beats);
}
export function stepClockmakerConversation(state: ClockmakerConversationState, beats: readonly ClockmakerBeat[], dtMs: number, advance: boolean): ClockmakerConversationState {
  const elapsedMs = state.elapsedMs + Math.max(0, Math.min(100, dtMs));
  if (state.phase === "framing" && elapsedMs >= CLOCKMAKER_SHOT_MS) return { phase: "conversation", index: state.index, elapsedMs: 0 };
  if (state.phase === "returning" && elapsedMs >= CLOCKMAKER_RETURN_MS) return { ...state, phase: "done", elapsedMs: 0 };
  if (state.phase !== "conversation") return { ...state, elapsedMs };
  const next = stepReader({ index: state.index, elapsedMs: state.elapsedMs, complete: false }, beats, dtMs, advance);
  return next.complete ? { ...state, phase: "returning", elapsedMs: 0 }
    : { ...state, index: next.index, elapsedMs: next.elapsedMs };
}

/** Unfolding continues the completed handoff; only a new object travels again. */
export function clockmakerReceiptProgress(cue: ClockmakerCue | undefined, elapsedMs: number, reduced: boolean): number {
  return reduced || cue === "loan" ? 1 : Math.max(0, Math.min(1, elapsedMs / BIRD_RETURN_PRESENTATION.handoffMs));
}
