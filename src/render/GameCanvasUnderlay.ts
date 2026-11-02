import Phaser from "phaser";
import { PALETTE, cssHex } from "./art/palette";
import { GAME_PARENT_ID } from "./RenderScale";

/**
 * 게임 캔버스 **아래**에 다른 캔버스(마을 3D)를 까는 계약.
 *
 * 예전에는 three.js 캔버스를 매 프레임 Phaser 텍스처로 통째로 다시 올렸다(2560×1440 이면 프레임당 약 14 MiB 복사와
 * `preserveDrawingBuffer`). 지금은 두 캔버스를 DOM 에서 겹치고 브라우저 합성기가 한 번에 합친다.
 *
 * - Phaser 는 알파가 있는 컨텍스트로 부팅한다(`main.ts` 의 `transparent: true`). 평소에는 하늘색으로 **불투명하게**
 *   지우므로 다른 씬의 화면은 예전과 같다. Canvas 렌더러는 지우기만 하므로 부모 요소의 같은 하늘색이 비친다.
 * - 아래 층을 잡은 동안(`holdGameCanvasUnderlay`)만 투명하게 지운다.
 * - 가산 블렌드(ADD)는 알파를 건드리지 않게 바꾼다. 투명한 자리에서 알파가 올라가면 합성기가 아래 3D 를 그만큼
 *   어둡게 깔아 가산이 '덮기'로 바뀐다. 알파 0 에 색만 더하면 합성기가 아래 층에 그대로 더한다(예전 불투명 판과 같은 결과).
 *   색 쪽은 앞서 그린 색에 그대로 더한다(`ONE, ONE`) — 가산 빛끼리 겹쳐도 서로 지우지 않는다.
 *   렌더 텍스처에 가산으로 그리면 알파가 0 으로 남아 사라지므로 이 보정은 아래 층을 잡은 동안에만 건다.
 */
export function installGameCanvasBackground(game: Phaser.Game): void {
  const parent = globalThis.document?.getElementById(GAME_PARENT_ID);
  if (parent) parent.style.background = cssHex(PALETTE.sky);
  const sky = Phaser.Display.Color.IntegerToColor(PALETTE.sky);
  game.config.backgroundColor.setTo(sky.red, sky.green, sky.blue, 255);
}

/** 게임마다 지금 잡은 아래 캔버스. 넣은 순서가 칠하는 순서다(새 것을 게임 캔버스 바로 앞에 넣는다). */
const heldUnderlays = new WeakMap<Phaser.Game, Set<HTMLCanvasElement>>();

/**
 * 지금 게임 캔버스 밑에 보이는 아래 캔버스들, 칠하는 순서대로. 화면을 복사하는 쪽은 이것을 먼저 그리고 게임 캔버스를 그 위에 그린다
 * — 게임 캔버스만 복사하면 마을에서는 3D(거리·인물 카드)가 빠져 빈 판이 된다(2026-10-20, 마을 대결 패배 컷).
 * 그리기 버퍼를 보존하지 않으므로 아래 캔버스를 그린 같은 작업 안(Phaser `postrender`)에서 읽는다.
 */
export function visibleGameCanvasUnderlays(game: Phaser.Game): readonly HTMLCanvasElement[] {
  return [...(heldUnderlays.get(game) ?? [])].filter(underlay => underlay.style.visibility !== "hidden");
}

export interface GameCanvasUnderlay {
  /** 아래 캔버스를 게임 캔버스의 화면 위치·크기에 맞춘다. Phaser 가 캔버스 크기를 바꾼 뒤에만 잰다. 프레임마다 불러도 된다. */
  sync(): void;
  setVisible(visible: boolean): void;
  /** 하늘색 불투명 지우기와 원래 가산 블렌드를 돌려주고 아래 캔버스를 DOM 에서 뗀다. */
  release(): void;
}

export function holdGameCanvasUnderlay(game: Phaser.Game, underlay: HTMLCanvasElement): GameCanvasUnderlay {
  const canvas = game.canvas, parent = canvas.parentElement;
  const background = game.config.backgroundColor;
  const opaque = [background.red, background.green, background.blue, background.alpha] as const;
  const style = underlay.style;
  style.position = "absolute";
  style.pointerEvents = "none";
  style.visibility = "hidden";
  // 둘 다 위치 지정 요소면 문서 순서대로 칠한다 — 아래 캔버스를 앞에 넣어 게임 캔버스 밑에 둔다.
  const canvasPosition = canvas.style.position;
  if (!canvasPosition) canvas.style.position = "relative";
  parent?.insertBefore(underlay, canvas);
  const held = heldUnderlays.get(game) ?? new Set<HTMLCanvasElement>();
  heldUnderlays.set(game, held.add(underlay));
  // 사전곱 알파라 투명하게 지울 때는 색도 0 이어야 한다. 알파 0 에 하늘색을 남기면 합성기가 그 색을 3D 위에 더한다.
  background.setTo(0, 0, 0, 0);
  const renderer = game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? game.renderer : null;
  const add = renderer?.blendModes[Phaser.BlendModes.ADD] as { func: number[] } | undefined;
  const addFunc = add?.func;
  if (renderer && add) {
    const gl = renderer.gl;
    // 색은 아래 색에 그대로 더한다(ONE). Phaser 기본값의 DST_ALPHA 는 불투명 판에서만 ONE 이다 — 알파 0 인 자리에서는 아래 색에 0 을 곱해,
    add.func = [gl.ONE, gl.ONE, gl.ZERO, gl.ONE];
    // 지금 가산이 걸려 있어도 다음 그리기에서 새 함수를 다시 걸게 한다.
    (renderer as unknown as { currentBlendMode: number }).currentBlendMode = -1;
  }
  let rect = "";
  let released = false;
  // 게임 캔버스의 화면 위치·크기는 Phaser 가 정한다(`ScaleManager.refresh` 가 바꾸고 RESIZE 를 낸다). 그때만 다시 잰다 — 프레임마다
  // `offset*` 을 읽으면 그 프레임에 HUD 가 고친 DOM 때문에 브라우저가 레이아웃을 강제로 다시 계산한다(2026-10-12).
  let dirty = true;
  const markDirty = (): void => { dirty = true; };
  game.scale.on(Phaser.Scale.Events.RESIZE, markDirty);
  return {
    sync() {
      if (released || !dirty || underlay.parentElement !== canvas.parentElement) return;
      dirty = false;
      const next = `${canvas.offsetLeft},${canvas.offsetTop},${canvas.offsetWidth},${canvas.offsetHeight}`;
      if (next === rect) return;
      rect = next;
      style.left = `${canvas.offsetLeft}px`; style.top = `${canvas.offsetTop}px`;
      style.width = `${canvas.offsetWidth}px`; style.height = `${canvas.offsetHeight}px`;
    },
    setVisible(visible) {
      const value = visible ? "visible" : "hidden";
      if (style.visibility !== value) style.visibility = value;
    },
    release() {
      if (released) return;
      released = true;
      game.scale.off(Phaser.Scale.Events.RESIZE, markDirty);
      background.setTo(...opaque);
      if (renderer && add && addFunc) {
        add.func = addFunc;
        (renderer as unknown as { currentBlendMode: number }).currentBlendMode = -1;
      }
      if (!canvasPosition) canvas.style.position = "";
      held.delete(underlay);
      underlay.remove();
    },
  };
}
