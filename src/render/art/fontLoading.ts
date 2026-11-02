import Phaser from "phaser";
import { DISPLAY_FONT, HUD_FONTS, LETTERING_FONT, UI_FONTS } from "../../assets/RuntimeMediaCatalog";
import { FONT } from "./palette";

/**
 * 번들 글꼴의 도착을 관리한다.
 *
 * Phaser Canvas `Text` 는 **생성 시점에 글자 폭을 재서 굳힌다**. 글꼴이 늦게 오면
 * 스택만 바꿔둬도 폴백으로 잰 폭이 그대로 남아 자간이 어긋난 채 화면에 붙는다.
 * 그래서 본문 글꼴(마루 부리)은 부팅 자체를 막고 기다리고, 표제 글꼴(조선궁서체)은
 * 3.4MB 통짜라 기다리는 대신 도착한 뒤에 이미 그려진 표제를 다시 재서 바꿔 단다.
 *
 * 글꼴을 못 받아도 게임은 계속된다 — 폴백 스택이 `palette.ts` 의 `FONT` 에 있다.
 */

/**
 * 무엇을 기다릴지는 권리 등록부가 소유한다. 여기서 굵기를 손으로 다시 적으면
 * 등록되지 않은 굵기를 기다리다 영원히 못 받거나, 실린 굵기를 안 기다려
 * 브라우저 합성 볼드로 뭉개진 화면이 나온다.
 */
const UI_FONT_SPECS: readonly string[] = Object.freeze(
  // 웹툰 식자 서브셋(10KB)도 함께 기다린다 — 대사가 폴백 글꼴로 한 번 재지면 획 두께·폭이 어긋난 채 굳는다.
  [...UI_FONTS, ...HUD_FONTS, LETTERING_FONT].map((font) => `${font.weight} 16px "${font.family}"`),
);

const DISPLAY_FONT_SPEC = `${DISPLAY_FONT.weight} 32px "${DISPLAY_FONT.family}"`;

export type DisplayFontState = "idle" | "loading" | "ready" | "failed";

let displayState: DisplayFontState = "idle";

/** 표제 글꼴이 아직 오는 중일 때 먼저 그려진 텍스트들. 도착하면 비운다. */
const awaitingDisplayFont = new Set<Phaser.GameObjects.Text>();

function fontSet(): FontFaceSet | undefined {
  return (globalThis as { document?: { fonts?: FontFaceSet } }).document?.fonts;
}

/**
 * 본문 글꼴이 도착할 때까지 기다린다. 실패해도 throw 하지 않는다 —
 * 글꼴 하나 때문에 게임이 검은 화면으로 끝나면 안 된다.
 */
export async function loadUiFont(): Promise<void> {
  const fonts = fontSet();
  if (fonts === undefined) return;
  await Promise.all(UI_FONT_SPECS.map((spec) => fonts.load(spec).catch(() => undefined)));
}

/** 표제 글꼴 내려받기를 시작한다. 기다리지 않는다. */
export function startDisplayFontLoad(): void {
  if (displayState !== "idle") return;
  const fonts = fontSet();
  if (fonts === undefined) {
    displayState = "failed";
    return;
  }
  displayState = "loading";
  fonts.load(DISPLAY_FONT_SPEC).then(
    (faces) => settleDisplayFont(faces.length > 0),
    () => settleDisplayFont(false),
  );
}

function settleDisplayFont(loaded: boolean): void {
  displayState = loaded ? "ready" : "failed";
  if (loaded) {
    for (const text of awaitingDisplayFont) {
      // 파괴된 객체는 DESTROY 리스너가 이미 빼 갔다. 남은 것만 다시 잰다.
      text.setFontFamily(FONT.display);
    }
  }
  awaitingDisplayFont.clear();
}

/** 테스트와 진단용. 표제 글꼴이 어디까지 왔는지. */
export function displayFontState(): DisplayFontState {
  return displayState;
}

/**
 * 표제 텍스트에 예고장 글씨를 단다.
 *
 * 글꼴이 아직 오는 중이면 도착한 뒤에 폭을 다시 재 준다. 이 한 줄을 거치지 않고
 * `fontFamily: FONT.display` 만 주면, 늦게 온 글꼴은 화면에 반영되지 않는다.
 */
export function useDisplayFont(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  text.setFontFamily(FONT.display);
  if (displayState === "ready" || displayState === "failed") return text;
  awaitingDisplayFont.add(text);
  text.once(Phaser.GameObjects.Events.DESTROY, () => awaitingDisplayFont.delete(text));
  return text;
}

/** 테스트가 모듈 상태를 되돌린다. 런타임에서는 쓰지 않는다. */
export function resetFontLoadingForTest(): void {
  displayState = "idle";
  awaitingDisplayFont.clear();
}
