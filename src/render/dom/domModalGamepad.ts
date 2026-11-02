/**
 * 게임 DOM 창의 패드 입력 하나. 씬은 DOM 창이 열린 동안 이 함수만 부르고, 이 함수가 맨 위의 열린 창
 * (`[aria-modal="true"]`, 문서 순서로 마지막)을 찾는다 — 창마다 처리기를 따로 두면 씬이 창 종류를 알아야 하고,
 * 모르는 창(초대 제작·공유·코드·신고·관리)에서는 패드가 아무 일도 하지 않았다.
 *
 * - 방향: 보이는 컨트롤 사이를 문서 순서로 옮긴다(끝에서 돈다). 스크롤 영역처럼 `tabindex` 로만 잡히는 곳은
 *   Tab 으로는 가지만 패드로는 건너뛴다 — 패드로는 그곳에서 할 일이 없다.
 * - A(south): 포커스가 누를 수 있는 컨트롤이면 누른다. 고르기 칸(`select`)이면 다음 항목으로 넘긴다(끝에서 돈다 — 패드로는 펼친
 *   목록에서 고를 수 없다). 포커스가 창 밖이면 첫 컨트롤로 옮긴다.
 * - B(east): 창이 등록한 뒤로 동작(`setDomModalBack`), 없으면 그 창의 Esc 와 같다(Esc keydown 을 보낸다).
 * - `aria-busy="true"` 인 창은 입력을 받지 않는다(저장·생성 중).
 */
export type DomModalPad = Readonly<{ south: boolean; east: boolean; left: boolean; right: boolean; up: boolean; down: boolean }>;

const backActions = new WeakMap<HTMLElement, () => void>();

/** B 가 Esc 와 다를 때만 등록한다(개인 유물: 계속하기 → 펼친 꾸미기 접기 → 취소). */
export function setDomModalBack(overlay: HTMLElement, back: () => void): void {
  backActions.set(overlay, back);
}

/**
 * 키보드 Tab 가두기와 패드가 함께 쓰는 컨트롤 목록: 문서 순서, 숨은·비활성 가지는 뺀다. 접힌 `<details>` 안은 그 제목(`summary`)만
 * 남긴다 — 접힌 내용은 그려지지 않아 포커스를 받지 못한다(초대장 제작의 고급 설정).
 */
export function domModalControls(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("a[href], button, input, textarea, select, summary, [tabindex]")).filter(control => {
    if (control.tabIndex < 0 || control.matches(':disabled, input[type="hidden"]')) return false;
    for (let node: HTMLElement | null = control; node; node = node.parentElement) {
      if (node.hidden || node.hasAttribute("inert") || node.getAttribute("aria-hidden") === "true") return false;
      if (node !== control && node.tagName === "DETAILS" && !node.hasAttribute("open")
        && !(control.tagName === "SUMMARY" && control.parentElement === node)) return false;
      const style = globalThis.window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (node === root) break;
    }
    return true;
  });
}

/**
 * 맨 위에 열린 게임 DOM 창. 없으면 null. 네이티브 모달 창(`showModal()` — 장비창)은 최상위 층이라 문서 순서와 상관없이 위에 선다.
 * 숨겨 둔 창 틀(마을 HUD 팝업의 `aria-modal` 틀은 닫혀도 문서에 남는다)은 열린 창이 아니다.
 */
export function topDomModal(): HTMLElement | null {
  const document = globalThis.document;
  const native = Array.from(document.querySelectorAll<HTMLElement>("dialog[open]")).filter(nativeModal);
  if (native.length > 0) return native[native.length - 1]!;
  const open = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter(overlay => !overlay.hidden);
  return open.length === 0 ? null : open[open.length - 1]!;
}

function nativeModal(dialog: HTMLElement): boolean {
  try { return dialog.matches(":modal"); } catch { return false; }
}

const PRESSABLE = 'button, a[href], summary, input[type="checkbox"], input[type="radio"], input[type="file"]';

/** A on a select: its next enabled choice (wrapping), told to its listeners as a change — as a pick from the open list would be. */
function stepSelect(select: HTMLSelectElement): void {
  const choices = Array.from(select.querySelectorAll("option")).filter(option => !option.disabled);
  if (choices.length < 2) return;
  // One choice selected unselects the rest (a single select).
  choices[(choices.findIndex(option => option.selected) + 1) % choices.length]!.selected = true;
  // The select's own window's Event (the document may be another realm's).
  const EventOf = select.ownerDocument.defaultView?.Event ?? Event;
  select.dispatchEvent(new EventOf("change", { bubbles: true }));
}
const PAD_CONTROL = "a[href], button, input, textarea, select, summary";

/** 열린 창이 있어 입력을 그 창이 가져갔으면 참. */
export function handleDomModalGamepad(pressed: DomModalPad): boolean {
  const overlay = topDomModal();
  if (overlay === null) return false;
  if (!pressed.south && !pressed.east && !pressed.left && !pressed.right && !pressed.up && !pressed.down) return true;
  if (overlay.getAttribute("aria-busy") === "true") return true;
  const active = globalThis.document.activeElement;
  if (pressed.east) {
    const back = backActions.get(overlay);
    if (back) { back(); return true; }
    const target = active instanceof HTMLElement && overlay.contains(active) ? active : overlay;
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return true;
  }
  const controls = domModalControls(overlay).filter(control => control.matches(PAD_CONTROL));
  const index = controls.findIndex(control => control === active);
  if (pressed.south) {
    if (index < 0) controls[0]?.focus();
    else if (controls[index]!.matches(PRESSABLE)) controls[index]!.click();
    else if (controls[index]!.tagName === "SELECT") stepSelect(controls[index] as HTMLSelectElement);
    return true;
  }
  if (controls.length === 0) return true;
  const direction = pressed.left || pressed.up ? -1 : 1;
  const next = index < 0 ? (direction > 0 ? 0 : controls.length - 1) : (index + direction + controls.length) % controls.length;
  controls[next]?.focus();
  return true;
}
