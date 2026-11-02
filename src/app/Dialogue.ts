/**
 * 씬과 무관한 내러티브 통신 큐.
 *
 * 시네마틱·무전·월드 대사를 같은 우선순위와 중단 규칙으로 조정한다.
 * 렌더러는 이 상태를 읽기만 하며 플레이 판정을 바꾸지 않는다.
 */

import type { ClockmakerBeat } from "./ClockmakerConversation";

export type DialogueMode = "blocking" | "toast";
export type DialogueTone = "mentor" | "guard" | "system";
export type DialogueChannel = "cinematic" | "radio" | "world";
export type DialoguePriority = "story" | "objective" | "reaction" | "flavor";
export type DialogueInterrupt = "lock" | "resume" | "restart" | "discard";
export type DialogueSource = "remote" | "player" | "nearest-guard" | "tutorial-objective";
export type DialogueBackdrop = "tutorial-rooftop";
export type DialogueCinematicShot =
  | "opening-rooftop-wide"
  | "opening-artifact-reveal"
  | "opening-manor-reveal"
  | "opening-mission-title";

export interface DialogueLine {
  /** Optional story presentation; the original beat owns cues, actions and performance timing. */
  readonly clockmaker?: ClockmakerBeat;
  readonly speaker: string;
  readonly text: string;
  readonly mode: DialogueMode;
  /** 자동 진행 시간. 생략하면 언어와 문장 길이로 계산한다. */
  readonly durationMs?: number;
  readonly tone?: DialogueTone;
  readonly channel?: DialogueChannel;
  readonly priority?: DialoguePriority;
  readonly interrupt?: DialogueInterrupt;
  readonly source?: DialogueSource;
  /** 시네마틱 대사가 월드 화면 대신 보여 줄 고정 배경. */
  readonly backdrop?: DialogueBackdrop;
  /** 같은 배경 안에서도 카메라 구도·초점·장면 표제를 바꾸는 시네마틱 숏. */
  readonly cinematicShot?: DialogueCinematicShot;
  /** 월드 대사를 발생시킨 경비·유물 앵커의 안정적인 ID. */
  readonly sourceId?: string;
  /** 큐에 머무를 최대 시간. 오래된 반응 대사가 뒤늦게 재생되는 것을 막는다. */
  readonly maxDelayMs?: number;
  /** 이 줄에서 고르는 답(마을 대화). 고른 `id` 는 대화를 띄운 씬이 완료 콜백에서 읽는다. */
  readonly choices?: readonly DialogueChoice[];
}

export interface DialogueChoice {
  readonly id: string;
  readonly label: string;
}

export interface DialogueSequence {
  readonly id: string;
  readonly lines: readonly DialogueLine[];
}

interface ActiveDialogue {
  readonly sequence: DialogueSequence;
  readonly lineIndex: number;
  readonly remainingMs: number;
  readonly interrupted: boolean;
}

export interface DialogueLogEntry {
  readonly order: number;
  readonly sequenceId: string;
  readonly speaker: string;
  readonly text: string;
  readonly tone: DialogueTone;
  readonly channel: DialogueChannel;
}

export interface DialogueState {
  readonly active: ActiveDialogue | null;
  readonly queue: readonly DialogueSequence[];
  readonly completedIds: readonly string[];
  readonly suspended: readonly ActiveDialogue[];
  readonly queueAgeMs: Readonly<Record<string, number>>;
  readonly history: readonly DialogueLogEntry[];
  readonly nextHistoryOrder: number;
}

export interface DialogueDisplay {
  readonly sequenceId: string;
  readonly speaker: string;
  readonly text: string;
  readonly mode: DialogueMode;
  readonly tone: DialogueTone;
  readonly channel: DialogueChannel;
  readonly priority: DialoguePriority;
  readonly interrupt: DialogueInterrupt;
  readonly source: DialogueSource;
  readonly backdrop?: DialogueBackdrop;
  readonly cinematicShot?: DialogueCinematicShot;
  readonly sourceId?: string;
  readonly suspended: boolean;
  readonly line: number;
  readonly total: number;
}

export interface DialogueTickOptions {
  /** 전투 텔레그래프·체포·몸부림처럼 플레이 정보가 통신보다 우선하는 순간. */
  readonly interrupted?: boolean;
}

const MAX_HISTORY = 64;
const MAX_QUEUE = 8;
const PRIORITY_RANK: Readonly<Record<DialoguePriority, number>> = {
  story: 4,
  objective: 3,
  reaction: 2,
  flavor: 1,
};

export function createDialogueState(): DialogueState {
  return {
    active: null,
    queue: [],
    completedIds: [],
    suspended: [],
    queueAgeMs: {},
    history: [],
    nextHistoryOrder: 1,
  };
}

function lineAt(active: ActiveDialogue): DialogueLine | null {
  return active.sequence.lines[active.lineIndex] ?? null;
}

export function dialogueChannel(line: DialogueLine): DialogueChannel {
  if (line.channel !== undefined) return line.channel;
  return line.mode === "blocking" ? "cinematic" : line.tone === "guard" ? "world" : "radio";
}

export function dialoguePriority(line: DialogueLine): DialoguePriority {
  return line.priority ?? (line.mode === "blocking" ? "story" : "reaction");
}

export function dialogueInterrupt(line: DialogueLine): DialogueInterrupt {
  return line.interrupt ?? (line.mode === "blocking" ? "lock" : dialoguePriority(line) === "objective" ? "resume" : "discard");
}

function dialogueSource(line: DialogueLine): DialogueSource {
  return line.source ?? (dialogueChannel(line) === "world" ? "nearest-guard" : "remote");
}

/** 한국어는 초당 약 12자, 라틴 문장은 초당 약 15자 기준으로 여유를 더한다. */
export function dialogueReadingDurationMs(text: string): number {
  const compact = text.replace(/\s+/g, "");
  const isKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(compact);
  const units = [...compact].reduce((total, character) => {
    if (/\p{P}|\p{S}/u.test(character)) return total + 0.35;
    return total + (isKorean ? 1 : 0.72);
  }, 0);
  const cps = isKorean ? 12 : 15;
  return Math.round(Math.min(5_500, Math.max(2_000, 650 + (units / cps) * 1_000)));
}

function remainingOf(line: DialogueLine): number {
  return line.mode === "toast" ? Math.max(1, line.durationMs ?? dialogueReadingDurationMs(line.text)) : 0;
}

function maxDelayOf(line: DialogueLine): number {
  if (line.maxDelayMs !== undefined) return Math.max(0, line.maxDelayMs);
  switch (dialoguePriority(line)) {
    case "story": return Number.POSITIVE_INFINITY;
    case "objective": return 6_000;
    case "reaction": return 1_800;
    case "flavor": return 900;
  }
}

function appendHistory(state: DialogueState, sequence: DialogueSequence, lineIndex: number): DialogueState {
  const line = sequence.lines[lineIndex];
  if (line === undefined) return state;
  const entry: DialogueLogEntry = {
    order: state.nextHistoryOrder,
    sequenceId: sequence.id,
    speaker: line.speaker,
    text: line.text,
    tone: line.tone ?? "system",
    channel: dialogueChannel(line),
  };
  return {
    ...state,
    history: [...state.history, entry].slice(-MAX_HISTORY),
    nextHistoryOrder: state.nextHistoryOrder + 1,
  };
}

function activateLine(state: DialogueState, sequence: DialogueSequence, lineIndex: number): DialogueState {
  const line = sequence.lines[lineIndex];
  if (line === undefined) return state;
  return appendHistory({
    ...state,
    active: { sequence, lineIndex, remainingMs: remainingOf(line), interrupted: false },
  }, sequence, lineIndex);
}

function startNext(state: DialogueState): DialogueState {
  if (state.active !== null) return state;
  if (state.suspended.length > 0) {
    const resumed = state.suspended[state.suspended.length - 1] ?? null;
    return { ...state, active: resumed, suspended: state.suspended.slice(0, -1) };
  }
  if (state.queue.length === 0) return state;
  const [sequence, ...rest] = state.queue;
  if (sequence === undefined) return state;
  const queueAgeMs = { ...state.queueAgeMs };
  delete queueAgeMs[sequence.id];
  const base = { ...state, queue: rest, queueAgeMs };
  if (sequence.lines[0] === undefined) {
    return startNext({ ...base, completedIds: [...base.completedIds, sequence.id] });
  }
  return activateLine(base, sequence, 0);
}

function insertByPriority(queue: readonly DialogueSequence[], sequence: DialogueSequence): readonly DialogueSequence[] {
  const line = sequence.lines[0];
  if (line === undefined) return queue;
  const rank = PRIORITY_RANK[dialoguePriority(line)];
  const index = queue.findIndex((queued) => {
    const queuedLine = queued.lines[0];
    return queuedLine !== undefined && PRIORITY_RANK[dialoguePriority(queuedLine)] < rank;
  });
  const inserted = index < 0
    ? [...queue, sequence]
    : [...queue.slice(0, index), sequence, ...queue.slice(index)];
  return inserted.slice(0, MAX_QUEUE);
}

/** 같은 id는 한 런에서 한 번만 큐에 들어간다. 더 중요한 통신은 안전하게 선점한다. */
export function enqueueDialogue(state: DialogueState, sequence: DialogueSequence): DialogueState {
  const first = sequence.lines[0];
  if (first === undefined) return state;
  if (state.completedIds.includes(sequence.id)) return state;
  if (state.active?.sequence.id === sequence.id) return state;
  if (state.suspended.some((item) => item.sequence.id === sequence.id)) return state;
  if (state.queue.some((queued) => queued.id === sequence.id)) return state;

  const activeLine = state.active === null ? null : lineAt(state.active);
  const canPreempt = activeLine !== null
    && activeLine.mode === "toast"
    && PRIORITY_RANK[dialoguePriority(first)] > PRIORITY_RANK[dialoguePriority(activeLine)];
  if (canPreempt && state.active !== null && activeLine !== null) {
    const policy = dialogueInterrupt(activeLine);
    const suspended = policy === "resume" || policy === "restart"
      ? [...state.suspended, {
          ...state.active,
          remainingMs: policy === "restart" ? remainingOf(activeLine) : state.active.remainingMs,
          interrupted: false,
        }]
      : state.suspended;
    const completedIds = policy === "discard"
      ? [...state.completedIds, state.active.sequence.id]
      : state.completedIds;
    return activateLine({ ...state, active: null, suspended, completedIds }, sequence, 0);
  }

  const queue = insertByPriority(state.queue, sequence);
  if (!queue.some((queued) => queued.id === sequence.id)) return state;
  const queuedIds = new Set(queue.map((queued) => queued.id));
  const displacedIds = state.queue
    .filter((queued) => !queuedIds.has(queued.id))
    .map((queued) => queued.id);
  const queueAgeMs = Object.fromEntries(
    Object.entries(state.queueAgeMs).filter(([id]) => queuedIds.has(id)),
  );
  return startNext({
    ...state,
    queue,
    completedIds: displacedIds.length === 0 ? state.completedIds : [...state.completedIds, ...displacedIds],
    queueAgeMs: { ...queueAgeMs, [sequence.id]: 0 },
  });
}

export function currentDialogue(state: DialogueState): DialogueDisplay | null {
  const active = state.active;
  if (active === null) return null;
  const line = lineAt(active);
  if (line === null) return null;
  return {
    sequenceId: active.sequence.id,
    speaker: line.speaker,
    text: line.text,
    mode: line.mode,
    tone: line.tone ?? "system",
    channel: dialogueChannel(line),
    priority: dialoguePriority(line),
    interrupt: dialogueInterrupt(line),
    source: dialogueSource(line),
    ...(line.backdrop === undefined ? {} : { backdrop: line.backdrop }),
    ...(line.cinematicShot === undefined ? {} : { cinematicShot: line.cinematicShot }),
    ...(line.sourceId === undefined ? {} : { sourceId: line.sourceId }),
    suspended: active.interrupted,
    line: active.lineIndex + 1,
    total: active.sequence.lines.length,
  };
}

export function dialogueBlocksPlay(state: DialogueState): boolean {
  return currentDialogue(state)?.mode === "blocking";
}

export function dialogueHistory(state: DialogueState): readonly DialogueLogEntry[] {
  return state.history;
}

/** 현재 줄을 넘긴다. 마지막 줄이면 중단했던 통신 또는 다음 sequence를 시작한다. */
export function advanceDialogue(state: DialogueState): DialogueState {
  const active = state.active;
  if (active === null) return startNext(state);
  const nextIndex = active.lineIndex + 1;
  const nextLine = active.sequence.lines[nextIndex];
  if (nextLine !== undefined) {
    return activateLine({ ...state, active: null }, active.sequence, nextIndex);
  }
  return startNext({
    ...state,
    active: null,
    completedIds: [...state.completedIds, active.sequence.id],
  });
}

function ageAndPruneQueue(state: DialogueState, dtMs: number): DialogueState {
  if (state.queue.length === 0 || dtMs <= 0) return state;
  const queueAgeMs = { ...state.queueAgeMs };
  const completedIds = [...state.completedIds];
  const queue = state.queue.filter((sequence) => {
    const age = (queueAgeMs[sequence.id] ?? 0) + dtMs;
    queueAgeMs[sequence.id] = age;
    const first = sequence.lines[0];
    if (first !== undefined && age > maxDelayOf(first)) {
      delete queueAgeMs[sequence.id];
      completedIds.push(sequence.id);
      return false;
    }
    return true;
  });
  return { ...state, queue, queueAgeMs, completedIds };
}

/** toast만 실시간으로 전진한다. 위기 중에는 정책에 따라 일시정지·재시작·폐기한다. */
export function tickDialogue(state: DialogueState, dtMs: number, options: DialogueTickOptions = {}): DialogueState {
  const next = ageAndPruneQueue(state, Math.max(0, dtMs));
  const active = next.active;
  const line = active === null ? null : lineAt(active);
  if (active === null || line?.mode !== "toast") return next;

  if (options.interrupted === true) {
    const policy = dialogueInterrupt(line);
    if (policy === "discard") return tickDialogue(advanceDialogue(next), 0, options);
    if (policy === "resume" || policy === "restart") {
      const remainingMs = policy === "restart" && !active.interrupted
        ? remainingOf(line)
        : active.remainingMs;
      return { ...next, active: { ...active, remainingMs, interrupted: true } };
    }
  }

  const resumed = active.interrupted ? { ...active, interrupted: false } : active;
  const remainingMs = resumed.remainingMs - Math.max(0, dtMs);
  if (remainingMs > 0) return { ...next, active: { ...resumed, remainingMs } };
  return advanceDialogue({ ...next, active: resumed });
}
