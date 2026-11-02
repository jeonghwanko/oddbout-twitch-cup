import type { VisibilityPhase } from "../../app/DocumentVisibility";
import { visibilityPhaseOf, visibilityTransition } from "../../app/DocumentVisibility";
import type { SceneScope } from "./SceneScope";

/**
 * 탭 가시성 구독의 유일한 지점.
 *
 * `visibilitychange` 와 `window` 의 `blur`/`focus` 를 함께 듣고
 * `app/DocumentVisibility.ts` 의 전이 판정으로 합친다. 세 이벤트가 한 번의 탭
 * 전환에 겹쳐 와도 콜백은 페이즈가 실제로 바뀐 횟수만큼만 불린다.
 *
 * Phaser 의 `Core.Events.HIDDEN/BLUR` 를 쓰지 않는 이유는 두 가지다 — 이 구독을
 * 씬 밖(부팅·협동 dev 진입)에서도 그대로 써야 하고, Phaser 는 `window.onblur`
 * **프로퍼티**를 덮어쓰므로 여기서 `addEventListener` 를 쓰는 편이 서로를 지우지
 * 않는다.
 */
export interface DocumentVisibilityHandlers {
  readonly onHidden?: () => void;
  readonly onVisible?: () => void;
}

interface VisibilityEventTargetLike {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface VisibilityDocumentLike extends VisibilityEventTargetLike {
  readonly hidden?: boolean;
}

/** 테스트가 EventTarget 스텁을 넣을 수 있게 문서·창을 함께 받는다. */
export interface VisibilityHost {
  readonly document: VisibilityDocumentLike;
  readonly window: VisibilityEventTargetLike;
}

/** 노드(테스트)처럼 DOM 이 없는 호스트에서는 `null` 이다. */
export function browserVisibilityHost(): VisibilityHost | null {
  const host = globalThis as unknown as Partial<VisibilityHost>;
  const doc = host.document;
  const win = host.window;
  if (doc === undefined || win === undefined) return null;
  if (typeof doc.addEventListener !== "function" || typeof win.addEventListener !== "function") return null;
  return { document: doc, window: win };
}

/**
 * 구독하고 해제 함수를 돌려준다. DOM 이 없으면 아무것도 하지 않는 해제 함수를 준다.
 *
 * 콜백은 **전이에만** 불린다. 구독 시점의 페이즈는 기준점으로만 쓰고 즉시
 * 호출하지 않는다 — 이미 보이는 화면에 `onVisible` 을 다시 걸면 씬이 만들어질
 * 때마다 입력 기준점이 흔들린다.
 */
export function observeDocumentVisibility(
  handlers: DocumentVisibilityHandlers,
  host: VisibilityHost | null = browserVisibilityHost(),
): () => void {
  if (host === null) return () => undefined;
  const { document: doc, window: win } = host;

  let phase: VisibilityPhase = visibilityPhaseOf(doc.hidden);
  const settle = (next: VisibilityPhase): void => {
    const transition = visibilityTransition(phase, next);
    if (transition === null) return;
    phase = transition.to;
    if (transition.to === "hidden") handlers.onHidden?.();
    else handlers.onVisible?.();
  };

  // 포커스 복귀는 문서가 실제로 보일 때만 복귀다. 백그라운드 탭의 iframe 이
  // focus 를 되돌려 주는 경우까지 "돌아왔다"로 읽지 않는다.
  const onVisibilityChange = (): void => settle(visibilityPhaseOf(doc.hidden));
  const onBlur = (): void => settle("hidden");
  const onFocus = (): void => settle(visibilityPhaseOf(doc.hidden));

  doc.addEventListener("visibilitychange", onVisibilityChange);
  win.addEventListener("blur", onBlur);
  win.addEventListener("focus", onFocus);

  return () => {
    doc.removeEventListener("visibilitychange", onVisibilityChange);
    win.removeEventListener("blur", onBlur);
    win.removeEventListener("focus", onFocus);
  };
}

/** 씬 한 회차에 가시성 구독을 묶는다. shutdown 에서 리스너가 함께 사라진다. */
export function bindDocumentVisibility(
  scope: SceneScope,
  handlers: DocumentVisibilityHandlers,
  host: VisibilityHost | null = browserVisibilityHost(),
): void {
  scope.add(observeDocumentVisibility(handlers, host));
}
