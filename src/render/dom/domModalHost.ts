import { handleDomModalGamepad, type DomModalPad } from "./domModalGamepad";
import { setInvitationTextCapture } from "./invitationDialogArt";

/**
 * 씬 쪽 DOM 창 문지기(2026-10-17). 창이 열린 동안 게임 키보드는 전역 키 잡기를 풀고(글자·공백이 창의 입력칸으로 간다), 그
 * 프레임의 패드 입력은 맨 위 창이 받는다(`handleDomModalGamepad`). 브리핑·받은 초대가 같은 플래그·잡기 토글·패드 넘기기를 따로 짰다.
 */
export class DomModalHost {
  private opened = false;

  constructor(private readonly keyboard: () => { disableGlobalCapture(): void; enableGlobalCapture(): void } | null) {}

  /** A DOM dialog this scene opened is up — the scene's own input waits. */
  get open(): boolean { return this.opened; }

  setOpen(open: boolean): void {
    this.opened = open;
    setInvitationTextCapture(this.keyboard(), open);
  }

  /** The frame's pad. True (the top dialog took it) while a dialog is open; false: the scene reads it. */
  pad(pressed: DomModalPad): boolean {
    if (!this.opened) return false;
    handleDomModalGamepad(pressed);
    return true;
  }
}
