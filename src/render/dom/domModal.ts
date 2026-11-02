import { domModalControls } from "./domModalGamepad";

/**
 * 게임 DOM 창의 공통 틀(2026-10-17). 전에는 창마다(초대 코드·신고·공유·관리·사진 괴도 …) 같은 일을 따로 짰고, Tab 가두기만 네 가지
 * 방식이었다. 고정 목록의 끝에서만 되돌리는 방식은 포커스가 창 밖(배경 클릭)에 있으면 Tab 이 페이지로 빠져나갔다.
 *
 * 이 틀이 소유하는 것:
 * - 역할·`aria-modal`·제목 연결, 문서에 붙이기
 * - 키 가두기: 모든 키를 게임 입력 큐로 보내지 않는다(기본 동작은 그대로). Esc 는 창의 뒤로(`onEscape`)다 — 패드 B 도 같은 것을
 *   부른다(`handleDomModalGamepad`).
 * - Tab 가두기: 패드와 같은 컨트롤 목록(`domModalControls`)을 문서 순서로 돈다. 포커스가 창 밖이면 창 안으로 들인다.
 * - 닫기 한 번: 듣기를 떼고, 창을 지우고, 열기 전 포커스로 돌아간다.
 *
 * 글자 배율은 `domTextSize`(`--game-text-scale`), 패드는 `handleDomModalGamepad` 가 이 창을 맨 위 창으로 찾는다.
 */
export interface DomModalOptions {
  readonly labelledBy?: string;
  readonly role?: "dialog" | "alertdialog";
  /** Esc — and pad B unless the dialog set its own back (`setDomModalBack`). Usually: close as cancel. */
  readonly onEscape: () => void;
  /** Keys the dialog answers itself (Enter in its input). Called for every key but Esc and Tab. */
  readonly onKey?: (event: KeyboardEvent) => void;
  /** Listen in the capture phase (ahead of handlers inside the dialog). */
  readonly capture?: boolean;
  /** Keep key releases from the game too. */
  readonly holdKeyUp?: boolean;
}

export interface DomModal {
  readonly closed: boolean;
  /** Stop listening, remove the dialog and give focus back. Once; later calls do nothing. */
  close(): void;
}

export function openDomModal(overlay: HTMLElement, options: DomModalOptions): DomModal {
  const document = globalThis.document;
  // What had focus (the canvas, a button): given back on close. Duck-typed — no `HTMLElement` global is needed.
  const focused = document.activeElement as HTMLElement | null;
  const previous = typeof focused?.focus === "function" ? focused : null;
  overlay.setAttribute("role", options.role ?? "dialog");
  overlay.setAttribute("aria-modal", "true");
  if (options.labelledBy !== undefined) overlay.setAttribute("aria-labelledby", options.labelledBy);
  const capture = options.capture === true;
  const onKey = (event: KeyboardEvent): void => {
    // DOM의 기본 키 동작은 유지하고, 뒤의 게임 입력 큐에는 전달하지 않는다.
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); options.onEscape(); return; }
    if (event.key === "Tab") { trapDomModalTab(overlay, event); return; }
    options.onKey?.(event);
  };
  const onKeyUp = (event: KeyboardEvent): void => { event.stopPropagation(); };
  document.addEventListener("keydown", onKey, capture);
  if (options.holdKeyUp === true) document.addEventListener("keyup", onKeyUp, capture);
  document.body.append(overlay);
  let closed = false;
  return {
    get closed() { return closed; },
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, capture);
      if (options.holdKeyUp === true) document.removeEventListener("keyup", onKeyUp, capture);
      overlay.remove();
      if (previous?.isConnected === true) previous.focus({ preventScroll: true });
    },
  };
}

/** Tab inside `root`: the next (Shift: previous) of its controls, wrapping; from outside it, the first (Shift: the last). */
export function trapDomModalTab(root: HTMLElement, event: KeyboardEvent): void {
  event.preventDefault();
  const controls = domModalControls(root);
  if (controls.length === 0) return;
  const index = controls.indexOf(globalThis.document.activeElement as HTMLElement);
  const step = event.shiftKey ? -1 : 1;
  const next = index < 0 ? (step > 0 ? 0 : controls.length - 1) : (index + step + controls.length) % controls.length;
  controls[next]!.focus();
}
