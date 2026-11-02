import type { Locale } from "../app/Locale";
import { fatalErrorCopy, fatalErrorDetail, fatalErrorReportText } from "../app/FatalError";

/**
 * 잡히지 않은 오류를 플레이어가 볼 수 있는 화면으로 끝맺는다.
 *
 * 전면 화면은 `error` 에만 건다. `unhandledrejection` 까지 치명으로 다루면
 * 자동재생 정책 때문에 거부되는 `AudioContext.resume()` 하나로 멀쩡한 게임에
 * 오류 화면이 뜬다. 대신 거부를 링에 모아 두었다가 진짜 치명적 오류가 났을 때
 * 보고서에 함께 싣는다 — 조용히 사라지던 실마리가 그때 한 번에 드러난다.
 *
 * Phaser 가 아니라 DOM 으로 그린다. 게임 루프가 이미 죽은 뒤에도 보여야 한다.
 */

const MAX_PRIOR_REJECTIONS = 5;

export interface FatalErrorReporterOptions {
  readonly locale: Locale;
  /** 첫 치명적 오류에 한 번 불린다. 매 프레임 같은 예외가 반복되는 것을 멈추는 자리다. */
  readonly onFatal?: () => void;
}

export function installFatalErrorReporter(options: FatalErrorReporterOptions): () => void {
  const priorRejections: string[] = [];
  let reported = false;

  const onRejection = (event: PromiseRejectionEvent): void => {
    priorRejections.push(fatalErrorDetail(event.reason));
    if (priorRejections.length > MAX_PRIOR_REJECTIONS) priorRejections.shift();
  };

  const onError = (event: ErrorEvent): void => {
    if (reported) return;
    reported = true;
    // 루프를 먼저 멈춘다. 같은 예외가 프레임마다 다시 나면 보고서가 첫 원인을 잃는다.
    try {
      options.onFatal?.();
    } catch {
      // 정리 실패가 오류 화면 자체를 막지는 못하게 한다.
    }
    showFatalErrorOverlay(options.locale, fatalErrorReportText({
      detail: fatalErrorDetail(event.error ?? event.message),
      priorRejections: [...priorRejections],
    }));
  };

  globalThis.addEventListener("error", onError);
  globalThis.addEventListener("unhandledrejection", onRejection);
  return () => {
    globalThis.removeEventListener("error", onError);
    globalThis.removeEventListener("unhandledrejection", onRejection);
  };
}

/**
 * 전면 오류 화면과 복구 가능 알림이 공유하는 한 벌의 DOM 껍데기.
 *
 * 껍데기는 `<dialog>` 다. 게임의 네이티브 모달 창(장비창·동반자 대화 — `showModal()`)은 최상위 층(top layer)에 서고 나머지 문서를
 * 눌리지 않게 만들어, z-index 로는 그 위에 설 수 없다(2026-10-17 점검). 오류 화면은 나중에 띄운 모달이라 그 위에 서고 활성이 된다
 * (`mount`). 오류 화면을 가릴 수 있는 것은 없어야 한다.
 */
function overlayShell(labelledBy: string, dim: boolean): {
  readonly overlay: HTMLDialogElement;
  readonly panel: HTMLDivElement;
} {
  const overlay = globalThis.document.createElement("dialog");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    // The dialog's own box (UA margin, border, padding, max size) off: the shell is the full screen.
    margin: "0",
    padding: "0",
    border: "none",
    width: "100vw",
    height: "100vh",
    maxWidth: "none",
    maxHeight: "none",
    boxSizing: "border-box",
    // 초대장 다이얼로그보다 위에 선다(모달이 아니게 띄울 때).
    zIndex: "2147483647",
    display: "grid",
    placeItems: "center",
    background: dim ? "rgba(10,5,24,.92)" : "rgba(10,5,24,.72)",
    fontFamily: '"Noto Sans KR", sans-serif',
    color: "#f8f0dc",
  });
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", labelledBy);

  const panel = globalThis.document.createElement("div");
  Object.assign(panel.style, {
    width: "min(560px, calc(100vw - 32px))",
    maxHeight: "calc(100vh - 32px)",
    overflowY: "auto",
    overflowWrap: "anywhere",
    boxSizing: "border-box",
    padding: "24px",
    border: "2px solid #d6a84d",
    borderRadius: "18px",
    background: "#211536",
    boxShadow: "0 24px 80px rgba(0,0,0,.55)",
  });
  return { overlay, panel };
}

/**
 * 껍데기를 띄운다. `modal`(전면 오류 화면)이거나 이미 열린 네이티브 창이 있으면 모달로 — 가장 나중에 띄운 모달이 맨 위에 서고
 * 활성이다. 아니면 모달 없이 띄워 게임이 입력을 계속 받는다(복구 가능 알림). `showModal` 이 없는 환경은 열린 상태로만 붙인다.
 */
function mount(overlay: HTMLDialogElement, modal: boolean): void {
  const blocked = globalThis.document.querySelector("dialog[open]") !== null;
  globalThis.document.body.append(overlay);
  if (typeof overlay.showModal !== "function") overlay.setAttribute("open", "");
  else if (modal || blocked) overlay.showModal();
  else overlay.show();
}

/**
 * 치명적이지 않은 중단을 알린다 — 대표적으로 WebGL 컨텍스트 상실.
 *
 * 전면 오류 화면과 **같은 DOM 껍데기**를 쓰되 게임 루프를 멈추지 않고, 반환한
 * 함수로 다시 걷어낸다. 브라우저가 컨텍스트를 되돌려 주면 플레이어는 아무것도
 * 누르지 않고 원래 화면으로 돌아가야 하기 때문이다.
 */
export function showRecoverableNotice(
  message: string,
  options: { readonly retryLabel: string },
): () => void {
  const { overlay, panel } = overlayShell("recoverable-notice-title", false);
  overlay.setAttribute("role", "status");
  overlay.removeAttribute("aria-modal");

  const title = globalThis.document.createElement("h2");
  title.id = "recoverable-notice-title";
  title.textContent = message;
  Object.assign(title.style, { margin: "0 0 16px", color: "#f3c866", fontSize: "18px", lineHeight: "1.5" });

  const actions = globalThis.document.createElement("div");
  Object.assign(actions.style, { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "10px" });
  const retry = overlayButton(options.retryLabel, true);
  retry.addEventListener("click", () => { globalThis.location.reload(); });
  actions.append(retry);

  panel.append(title, actions);
  overlay.append(panel);
  mount(overlay, false);
  return () => { if (overlay.hasAttribute("open") && typeof overlay.close === "function") overlay.close(); overlay.remove(); };
}

function showFatalErrorOverlay(locale: Locale, report: string): void {
  const copy = fatalErrorCopy(locale);
  const { overlay, panel } = overlayShell("fatal-error-title", true);

  const title = globalThis.document.createElement("h2");
  title.id = "fatal-error-title";
  title.textContent = copy.title;
  Object.assign(title.style, { margin: "0 0 8px", color: "#f3c866" });

  const body = globalThis.document.createElement("p");
  body.textContent = copy.body;
  Object.assign(body.style, { margin: "0 0 16px", color: "#cfc4df", fontSize: "14px", lineHeight: "1.5" });

  const details = globalThis.document.createElement("details");
  const summary = globalThis.document.createElement("summary");
  summary.textContent = copy.detailsLabel;
  Object.assign(summary.style, { cursor: "pointer", color: "#cfc4df", fontSize: "13px" });
  const detail = globalThis.document.createElement("pre");
  detail.textContent = report;
  Object.assign(detail.style, {
    margin: "10px 0 0",
    padding: "12px",
    maxHeight: "220px",
    overflow: "auto",
    background: "#120b20",
    border: "1px solid #7f688f",
    borderRadius: "9px",
    fontSize: "12px",
    lineHeight: "1.45",
    whiteSpace: "pre-wrap",
  });
  details.append(summary, detail);

  const status = globalThis.document.createElement("div");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  Object.assign(status.style, { minHeight: "22px", marginTop: "7px", color: "#f3c866", fontSize: "13px" });

  const actions = globalThis.document.createElement("div");
  Object.assign(actions.style, { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "10px", marginTop: "12px" });
  const copyButton = overlayButton(copy.copy, false);
  const reload = overlayButton(copy.reload, true);
  actions.append(copyButton, reload);

  copyButton.addEventListener("click", () => {
    void globalThis.navigator.clipboard.writeText(report).then(
      () => { status.textContent = copy.copied; },
      // 클립보드가 막힌 브라우저에서는 펼쳐 둔 본문을 직접 긁어 갈 수 있게만 한다.
      () => { details.open = true; },
    );
  });
  reload.addEventListener("click", () => { globalThis.location.reload(); });

  panel.append(title, body, details, status, actions);
  overlay.append(panel);
  // Esc (a modal dialog's `cancel`) must not dismiss the end of the game.
  overlay.addEventListener("cancel", (event) => { event.preventDefault(); });
  mount(overlay, true);
  reload.focus();
}

function overlayButton(label: string, primary: boolean): HTMLButtonElement {
  const button = globalThis.document.createElement("button");
  button.type = "button";
  button.textContent = label;
  Object.assign(button.style, {
    padding: "10px 14px",
    border: `1px solid ${primary ? "#f3c866" : "#7f688f"}`,
    borderRadius: "9px",
    background: primary ? "#d6a84d" : "#120b20",
    color: primary ? "#211536" : "#f8f0dc",
    fontWeight: "700",
    cursor: "pointer",
    maxWidth: "100%",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  });
  return button;
}
