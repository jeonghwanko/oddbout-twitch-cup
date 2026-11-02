/** 초상 원화가 그려진 그대로 보는 쪽. 뒤집기는 대화 판이 자리에 맞춰 정한다(`conversationPortraitFlipX`). */
export type ConversationPortraitFacing = "left" | "right" | "front";
/** 2인 대화 판의 자리. 1인 판은 왼쪽 자리를 쓴다. */
export type ConversationSeat = "left" | "right";


export interface ConversationPortrait {
  readonly key: string;
  readonly frame?: string | number;
  readonly region?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** 원화가 보는 쪽. 모든 초상이 선언한다 — 손으로 고른 뒤집기 값은 두지 않는다. */
  readonly facing: ConversationPortraitFacing;
}

/**
 * 대화 판 초상 규격(2026-10-02 사용자 지시): 왼쪽 자리는 오른쪽 또는 정면, 오른쪽 자리는 왼쪽 또는 정면을 본다.
 * 원화가 자리 바깥을 보면 뒤집고, 정면이면 그대로 둔다. 자리가 없는 표면(트래커·배너·기록)은 원화 그대로다.
 */
export function conversationPortraitFlipX(facing: ConversationPortraitFacing, seat: ConversationSeat | null): boolean {
  if (seat === "left") return facing === "left";
  if (seat === "right") return facing === "right";
  return false;
}
export interface ConversationParticipant {
  readonly id: string;
  readonly name: string;
  readonly portrait?: ConversationPortrait;
  /** Larger transparent artwork used only by dialogue presentation; ordinary portrait consumers keep using `portrait`. */
  readonly illustration?: ConversationPortrait;
}
export type ConversationParticipants = readonly [ConversationParticipant] | readonly [ConversationParticipant, ConversationParticipant];

/**
 * 2×2 표정 아틀라스의 칸 번호.
 *
 * 시계공·로잘린·주인공 시트가 같은 순서를 쓴다: 0 담담·미소 / 1 놀람 / 2 웃음·능글 /
 * 3 걱정. 대사마다 고르는 값이고, **말하는 사람에게만** 붙는다 — 듣는 쪽까지 매 줄
 * 표정을 바꾸면 누가 말하고 있는지가 흐려진다.
 */
export type ConversationExpression = 0 | 1 | 2 | 3;

export const CONVERSATION_EXPRESSION = Object.freeze({
  calm: 0, surprised: 1, laugh: 2, worried: 3,
} as const satisfies Record<string, ConversationExpression>);

/** 시트 밖의 칸을 요구받으면 담담한 얼굴로 돌아온다. 대화가 초상 없이 비는 것보다 낫다. */
export function conversationExpressionCell(expression: number): ConversationExpression {
  const clamped = Math.max(0, Math.min(3, Math.trunc(expression)));
  return (Number.isFinite(clamped) ? clamped : 0) as ConversationExpression;
}

export interface ConversationLine {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly action?: string;
  readonly waiting?: string;
  readonly autoAdvance?: boolean;
  /** 이 줄을 말하는 사람의 표정 칸. 없으면 담담한 얼굴(0)이다. */
  readonly expression?: ConversationExpression;
  /** 고르는 답. 있으면 "다음" 대신 답 단추가 선다(마우스·숫자 1/2·화살표+Enter). */
  readonly choices?: readonly { readonly id: string; readonly label: string }[];
}
/** 짧은 가로 화면은 초상보다 읽기·터치 공간을 우선한다. CSS 표시 크기를 받는다. */
export function conversationPanelPresentation(width: number, height: number, preferred: "stage" | "compact" = "stage"): "stage" | "compact" {
  return width > height && height <= 480 ? "compact" : preferred;
}
export function conversationPanelColumns(width: number, participants: 1 | 2, presentation: "stage" | "compact" = "stage") {
  const portraitSize = presentation === "compact" ? 56 : width < 480 ? 56 : 72;
  const side = portraitSize + (presentation === "compact" ? 24 : 32);
  const left = side;
  const right = participants === 2 ? side : 28;
  return { portraitSize, left, right, copyWidth: Math.max(80, width - left - right),
    leftPortraitX: side / 2 - 4, rightPortraitX: width - side / 2 + 4 };
}
export function conversationUiScale(canvasWidth: number, cssWidth: number, renderScale: number): number {
  return Math.max(renderScale, canvasWidth / Math.max(1, cssWidth));
}

/** Content, not a cue ID alone, identifies a line in the session transcript. */
export function conversationHistoryKey(sequence: string, line: ConversationLine): string {
  return JSON.stringify([sequence, line.id, line.speaker, line.text]);
}
/** 머리 위에 남기는 여백. 초상 박스 모서리에 정수리가 닿으면 잘린 것처럼 읽힌다. */
const BUST_HEADROOM = 0.06;
/**
 * 전신 스프라이트 프레임에서 흉상만 오려 낸다.
 *
 * 초상 박스는 정사각이므로 크롭도 정사각이다. 프레임 높이의 고정 비율로 자르면 안 된다 —
 * 배송 시트마다 인물이 캔버스의 다른 높이에서 시작하고(NPC 는 발끝 184, 플레이어는 188),
 * 투명 여백의 크기도 다르다. 그래서 인물 자체의 기하(정수리 y, 중심 x)를 기준으로 잡는다.
 *
 * figure 좌표는 프레임 로컬(원점 = 프레임 좌상단)이다. 결과는 시트 전체 좌표로 돌려준다.
 */
export function bustPortraitRegion(
  frame: {readonly x: number; readonly y: number; readonly width: number; readonly height: number},
  figure: {readonly centerX: number; readonly headTopY: number; readonly size: number},
): {x: number; y: number; width: number; height: number} {
  const size = Math.max(1, Math.min(Math.round(figure.size), frame.width, frame.height));
  const place = (value: number, extent: number) => Math.max(0, Math.min(Math.round(value), extent - size));
  return {
    x: frame.x + place(figure.centerX - size / 2, frame.width),
    y: frame.y + place(figure.headTopY - size * BUST_HEADROOM, frame.height),
    width: size,
    height: size,
  };
}
export function validConversationPortraitRegion(region: NonNullable<ConversationPortrait["region"]>, source: {width: number; height: number}): boolean {
  const {x, y, width, height} = region;
  return [x, y, width, height].every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0
    && x + width <= source.width && y + height <= source.height;
}

export interface ConversationContentIssue { readonly code: string; readonly at: string }
/** Validate content without requiring textures to have finished loading. */
export function validateConversationContent(participants: readonly ConversationParticipant[], lines: readonly ConversationLine[]): ConversationContentIssue[] {
  const issues: ConversationContentIssue[] = [];
  const ids = new Set<string>();
  if (participants.length < 1 || participants.length > 2) issues.push({code: "participant-count", at: "participants"});
  for (const participant of participants) {
    if (!participant.id.trim() || ids.has(participant.id)) issues.push({code: "participant-id", at: participant.id});
    ids.add(participant.id);
    if (!participant.name.trim()) issues.push({code: "participant-name", at: participant.id});
    if (participant.portrait && !participant.portrait.key.trim()) issues.push({code: "portrait-key", at: participant.id});
    if (participant.portrait?.region && !validConversationPortraitRegion(participant.portrait.region, {width: Infinity, height: Infinity}))
      issues.push({code: "portrait-region", at: participant.id});
  }
  if (!lines.length) issues.push({code: "empty-sequence", at: "lines"});
  for (const line of lines) {
    if (!line.id.trim()) issues.push({code: "line-id", at: line.id});
    if (!ids.has(line.speaker)) issues.push({code: "unknown-speaker", at: line.id});
    if (!line.text.trim()) issues.push({code: "empty-text", at: line.id});
  }
  return issues;
}

/** Shared safe-area fit, including oversized text and unusually short windows. */
export function fitConversationPanel(viewWidth: number, viewHeight: number, width: number, height: number, desiredScale: number, bottomInset = 18) {
  const bottom = Math.max(0, Math.min(bottomInset, viewHeight / Math.max(1, desiredScale) / 4));
  const scale = Math.min(desiredScale, viewWidth / (width + 32), viewHeight / (height + bottom + 36));
  return { scale, x: (viewWidth / scale - width) / 2, y: viewHeight / scale - height - bottom };
}
