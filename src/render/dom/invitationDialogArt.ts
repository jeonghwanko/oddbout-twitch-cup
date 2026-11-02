import { CSS, FONT, QUEST_POPUP, UI_METRICS, scrim } from "../art/palette";
import { DOM_LAYER_Z } from "../depths";
import { domTextSize } from "./domTextScale";

export type InvitationButtonTone = "primary" | "secondary" | "danger";

/** 예고장 흐름은 중립색 면과 본문 위계로 읽고, 서명·유물은 서류 안에 둔다. */
export function styleInvitationOverlay(overlay: HTMLElement): void {
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: String(DOM_LAYER_Z.gameDialog),
    display: "grid",
    placeItems: "center",
    padding: "16px",
    boxSizing: "border-box",
    background: scrim("b3"),
    color: CSS.dialogueInk,
    fontFamily: FONT.hudSans,
    backdropFilter: "blur(7px)",
  });
  overlay.classList.add("invitation-dialog-overlay");
  installInvitationDialogStyles(overlay);
}

export function styleInvitationPaper(panel: HTMLElement, width: string): void {
  Object.assign(panel.style, {
    position: "relative",
    width,
    maxHeight: "calc(100dvh - 32px)",
    boxSizing: "border-box",
    overflowY: "auto",
    overflowWrap: "anywhere",
    border: `1px solid ${CSS.dialogueBorder}`,
    borderRadius: "4px",
    background: CSS.dialogueSurface,
  });
  panel.classList.add("invitation-paper-dialog");
  panel.dataset.invitationPaper = "true";
}

export function styleInvitationTitle(title: HTMLElement): void {
  Object.assign(title.style, {
    margin: "0",
    color: CSS.dialogueInk,
    fontFamily: FONT.hudSans,
    fontSize: domTextSize(QUEST_POPUP.title),
    lineHeight: "1.25",
    letterSpacing: "-0.035em",
  });
}

export function styleInvitationCopy(copy: HTMLElement): void {
  Object.assign(copy.style, {
    color: CSS.dialogueMuted,
    fontSize: domTextSize(QUEST_POPUP.body),
    lineHeight: "1.6",
  });
}

export function styleInvitationControl(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): void {
  Object.assign(control.style, {
    width: "100%",
    boxSizing: "border-box",
    minWidth: "0",
    minHeight: `${UI_METRICS.controlHeight}px`,
    padding: "10px 12px",
    border: `1px solid ${CSS.paperMuted}`,
    borderRadius: "4px",
    outline: "none",
    background: CSS.dialogueSurface,
    color: CSS.dialogueInk,
    font: "inherit",
    fontSize: domTextSize(QUEST_POPUP.body),
  });
  control.classList.add("invitation-text-control");
}

/** 입력 장치·브라우저가 key 없는 keydown 유사 이벤트를 보내도 제작 모달을 중단하지 않는다. */
export function shouldStopInvitationControlKey(key: unknown): boolean {
  return typeof key === "string" && (key === " " || key.startsWith("Arrow"));
}

export function invitationDialogButton(
  label: string,
  tone: InvitationButtonTone = "secondary",
): HTMLButtonElement {
  const button = globalThis.document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.tone = tone;
  const primary = tone === "primary";
  const danger = tone === "danger";
  Object.assign(button.style, {
    minHeight: `${UI_METRICS.controlHeight}px`,
    padding: "10px 16px",
    border: `1px solid ${danger ? CSS.burgundyInk : CSS.dialogueHover}`,
    borderRadius: "4px",
    background: primary ? CSS.dialogueInk : danger ? CSS.burgundyInk : "transparent",
    color: primary || danger ? CSS.dialogueSurface : CSS.dialogueInk,
    font: "inherit",
    fontSize: domTextSize(QUEST_POPUP.action),
    fontWeight: "600",
    cursor: "pointer",
    maxWidth: "100%",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    transition: "filter 120ms ease, transform 120ms ease",
  });
  return button;
}

/** DOM 모달이 열린 동안 Phaser의 전역 캡처를 멈춰 텍스트·방향키의 기본 동작을 보존한다. */
export function setInvitationTextCapture(
  keyboard: { disableGlobalCapture(): void; enableGlobalCapture(): void } | null,
  dialogOpen: boolean,
): void {
  if (dialogOpen) keyboard?.disableGlobalCapture();
  else keyboard?.enableGlobalCapture();
}

function installInvitationDialogStyles(overlay: HTMLElement): void {
  const style = globalThis.document.createElement("style");
  style.textContent = `
    .invitation-text-control::placeholder { color: ${CSS.paperMuted}; opacity: .72; }
    .invitation-text-control:focus {
      border-color: ${CSS.burgundyInk} !important;
      box-shadow: 0 0 0 ${UI_METRICS.focusStroke}px ${CSS.burgundyInk}24;
    }
    .invitation-dialog-overlay button:focus-visible,
    .invitation-dialog-overlay a:focus-visible,
    .invitation-dialog-overlay input[type="radio"]:focus-visible,
    .invitation-dialog-overlay input[type="checkbox"]:focus-visible {
      outline: ${UI_METRICS.focusStroke}px solid ${CSS.burgundyInk};
      outline-offset: 3px;
    }
    .invitation-dialog-overlay button:not(:disabled):hover { filter: brightness(1.12); transform: translateY(-1px); }
    .invitation-dialog-overlay button:not(:disabled):active { transform: translateY(0); }
    .invitation-dialog-overlay button:disabled { cursor: not-allowed; opacity: .52; }
    .invitation-dialog-overlay [hidden] { display: none !important; }
    .invitation-dialog-overlay summary { min-height: 44px; box-sizing: border-box; }
    .invitation-dialog-overlay summary:focus-visible { outline: 2px solid ${CSS.burgundyInk}; outline-offset: 2px; }
    .invitation-composer-layout { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 24px; align-items: start; }
    .invitation-composer-layout > * { min-width: 0; }
    .invitation-composer-heading { margin-bottom: 16px; }
    .invitation-letter {
      position: relative; box-sizing: border-box; padding: 26px 22px 20px;
      border: 1px solid ${CSS.paperMuted}66;
      background: ${CSS.dialogueSurface}; color: ${CSS.dialogueInk};
    }
    .invitation-letter-eyebrow { color: ${CSS.burgundyInk}; font-size: ${domTextSize(QUEST_POPUP.note)}; letter-spacing: .1em; font-weight: 800; }
    .invitation-letter-to { margin: 18px 0 6px; color: ${CSS.paperMuted}; font-size: ${domTextSize(QUEST_POPUP.note)}; }
    .invitation-letter-title { margin: 0; font-family: ${FONT.hudSans}; font-size: ${domTextSize("25px")}; line-height: 1.45; word-break: keep-all; overflow-wrap: anywhere; }
    .invitation-letter-message { margin: 10px 0; font-size: ${domTextSize(QUEST_POPUP.note)}; line-height: 1.6; white-space: pre-wrap; }
    .invitation-letter-treasure { display: flex; gap: 12px; align-items: center; margin-top: 22px; padding: 14px 0; border-top: 1px solid ${CSS.paperMuted}44; }
    .invitation-letter-treasure img { width: 64px; height: 64px; object-fit: contain; }
    .invitation-letter-treasure span { min-width: 0; font-size: ${domTextSize(QUEST_POPUP.note)}; line-height: 1.6; overflow-wrap: anywhere; }
    .invitation-letter-signature { display: flex; align-items: center; gap: 12px; justify-content: space-between; margin-top: 18px; font-size: ${domTextSize(QUEST_POPUP.note)}; }
    .invitation-photo-picker { position: relative; display: flex; align-items: center; justify-content: center; min-height: 44px; border: 1px solid ${CSS.dialogueInk}; border-radius: 4px; color: ${CSS.dialogueInk}; font-size: ${domTextSize(QUEST_POPUP.note)}; font-weight: 800; cursor: pointer; }
    .invitation-photo-picker input[type=file] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
    .invitation-photo-picker:focus-within { outline: 2px solid ${CSS.burgundyInk}; outline-offset: 3px; }
    .invitation-photo-picker:has(input:disabled) { opacity: .52; }
    .invitation-form-note { margin: 8px 0 0; color: ${CSS.paperMuted}; font-size: ${domTextSize(QUEST_POPUP.note)}; line-height: 1.5; }
    .invitation-send-check { margin-top: 24px; }
    [data-invitation-composer] footer [role=status]:empty { display: none; }
    .invitation-share-link { margin-top: 22px; }
    @media (max-width: 720px) {
      .invitation-composer-layout { grid-template-columns: minmax(0, 1fr); gap: 20px; }
      .invitation-letter { padding: 20px 18px; }
      .invitation-letter-title { font-size: ${domTextSize("22px")}; }
    }
    @media (prefers-reduced-motion: reduce) {
      .invitation-dialog-overlay * { transition: none !important; }
      .invitation-dialog-overlay button:hover { transform: none !important; }
    }
  `;
  overlay.append(style);
}

/** 내용만 스크롤하고 제목·동작 버튼은 고정한다. */
export function arrangeInvitationDialog(panel: HTMLElement, headings: HTMLElement[], contents: HTMLElement[], actions: HTMLElement[], height: number = QUEST_POPUP.height): void {
  Object.assign(panel.style, { display: 'flex', flexDirection: 'column', height: `min(${height}px, calc(100dvh - 32px))`, padding: '0', overflow: 'hidden', fontSize: domTextSize(QUEST_POPUP.body) });
  const header = document.createElement('header');
  Object.assign(header.style, { padding: '24px 28px 18px', flex: '0 0 auto', borderBottom: `1px solid ${CSS.dialogueHover}` });
  header.append(...headings);
  const body = document.createElement('div'); body.dataset.questPopupContent = '';
  Object.assign(body.style, { padding: '22px 28px', flex: '1 1 auto', minHeight: '0', overflowY: 'auto', overscrollBehavior: 'contain' });
  body.append(...contents);
  const footer = document.createElement('footer');
  Object.assign(footer.style, { padding: '16px 28px', flex: '0 0 auto', borderTop: `1px solid ${CSS.dialogueHover}` });
  footer.append(...actions); panel.replaceChildren(header, body, footer);
}
