import Phaser from "phaser";
import { keyHintRow } from "../view/KeycapArt";
import { uiFeedback, type UiFeedbackHandle, type UiFeedbackOptions } from "./UiFeedback";

/**
 * 마우스를 올렸을 때 라벨 색. 떠오름·꺾쇠·빛·소리는 공용 UI 반응(`UiFeedback`)이 모든
 * 프레임 버튼에 똑같이 준다 — 여기서는 버튼마다 다른 글자색만 고른다.
 */
export interface FrameButtonHover {
  readonly color: string;
  readonly restColor: string;
  readonly hoverAlpha?: number;
}

export interface FrameButtonSpec {
  /** 버튼 사각형의 좌상단. 프레임 이미지는 이 사각형에 맞춰 늘어난다. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly textureKey: string;
  readonly label: string;
  readonly labelStyle: Phaser.Types.GameObjects.Text.TextStyle;
  /** 있으면 키칩 + 문구 한 줄(`keyHintRow`), 없으면 문구만. */
  readonly keys?: readonly string[];
  readonly keyFontSize?: number;
  /** 사각형 좌상단 기준 라벨 위치. 기본은 가운데. */
  readonly labelOffsetX?: number;
  readonly labelOffsetY?: number;
  readonly labelOriginX?: number;
  readonly labelOriginY?: number;
  readonly name?: string;
  readonly labelName?: string;
  readonly depth?: number;
  readonly enabled?: boolean;
  /** 켜져 있을 때의 평상시 불투명도. */
  readonly alpha?: number;
  readonly disabledAlpha?: number;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly hover?: FrameButtonHover;
  /**
   * `"zone"` — 사각형 zone 하나가 히트를 가진다(조각 사이에 죽은 자리가 없다).
   * `"objects"` — 프레임과 라벨 자체가 히트 대상이다. hover 를 쓰는 버튼의 방식.
   */
  readonly hitTarget?: "zone" | "objects";
  /** 공용 반응의 세기. 화면의 주 결정 버튼은 `hero`. */
  readonly feedback?: Pick<UiFeedbackOptions, "intensity" | "sound" | "frame" | "burst">;
  readonly onActivate: () => void;
  /** 꺼진 채로 눌렸을 때(붉은 떨림과 함께) — 왜 안 되는지 화면이 말할 때 쓴다. */
  readonly onRejected?: () => void;
}

export interface FrameButtonHandle {
  readonly frame: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text | null;
  readonly labelRow: Phaser.GameObjects.Container | null;
  /** 프레임·라벨·zone. 씬은 이것을 자기 컨테이너에 넣고 다시 그릴 때 함께 버린다. */
  readonly objects: Phaser.GameObjects.GameObject[];
  /** 키보드·패드 커서와 확정을 같은 반응으로 보여 준다. */
  readonly feedback: UiFeedbackHandle;
  setEnabled(value: boolean): void;
  destroy(): void;
}

const DEFAULT_DISABLED_ALPHA = 0.42;

/**
 * 이미지 프레임 + 라벨 버튼.
 *
 * 브리핑의 리본·초대 행동 버튼과 정산의 하단 버튼이 각자 "프레임을 사각형에 맞춰
 * 늘이고, 라벨을 얹고, 누를 곳을 만들고, 꺼져 있으면 흐리게" 를 다시 적고 있었다.
 * 그 넷을 한 함수가 갖고, 다른 것(hover 유무·라벨 정렬·히트 방식)만 옵션으로 남긴다.
 * 호버·누름·거절의 몸짓과 소리는 공용 `uiFeedback` 에 등록해 모든 버튼이 같은 손맛을 갖는다.
 */
export function frameButton(scene: Phaser.Scene, spec: FrameButtonSpec): FrameButtonHandle {
  let enabled = spec.enabled ?? true;
  const restAlpha = spec.alpha ?? 1;
  const disabledAlpha = spec.disabledAlpha ?? DEFAULT_DISABLED_ALPHA;
  const centerX = spec.x + spec.width / 2;
  const centerY = spec.y + spec.height / 2;
  const labelX = spec.x + (spec.labelOffsetX ?? spec.width / 2);
  const labelY = spec.y + (spec.labelOffsetY ?? spec.height / 2);

  const frame = scene.add
    .image(centerX, centerY, spec.textureKey)
    .setDisplaySize(spec.width, spec.height)
    .setAlpha(enabled ? restAlpha : disabledAlpha);
  if (spec.name !== undefined) frame.setName(spec.name);
  if (spec.depth !== undefined) frame.setDepth(spec.depth);
  if (spec.data !== undefined) for (const [key, value] of Object.entries(spec.data)) frame.setData(key, value);

  let label: Phaser.GameObjects.Text | null = null;
  let labelRow: Phaser.GameObjects.Container | null = null;
  if (spec.keys === undefined) {
    label = scene.add
      .text(labelX, labelY, spec.label, spec.labelStyle)
      .setOrigin(spec.labelOriginX ?? 0.5, spec.labelOriginY ?? 0.5);
    if (spec.labelName !== undefined) label.setName(spec.labelName);
    if (spec.depth !== undefined) label.setDepth(spec.depth);
  } else {
    // 누를 키는 버튼 문구에 섞지 않고 칩으로 세워 문구 왼쪽에 붙인다.
    labelRow = keyHintRow(scene, [{ keys: spec.keys, label: spec.label }], labelX, labelY, spec.labelStyle, {
      originX: spec.labelOriginX ?? 0.5,
      keyFontSize: spec.keyFontSize ?? 12,
    }).container.setSize(spec.width, spec.height);
    if (spec.labelName !== undefined) labelRow.setName(spec.labelName);
    if (spec.depth !== undefined) labelRow.setDepth(spec.depth);
  }

  const setLabelColor = (color: string): void => {
    label?.setColor(color);
    for (const child of labelRow?.list ?? []) {
      if (child instanceof Phaser.GameObjects.Text) child.setColor(color);
    }
  };

  const objects: Phaser.GameObjects.GameObject[] = [frame];
  if (label !== null) objects.push(label);
  if (labelRow !== null) objects.push(labelRow);

  // 꺼진 버튼도 히트는 남긴다 — 누르면 아무 일도 없는 대신 붉게 떨며 "지금은 안 된다"를 말한다.
  const activate = (): void => { if (enabled) spec.onActivate(); else spec.onRejected?.(); };
  const cursor = (): Phaser.Types.Input.InputConfiguration => ({ useHandCursor: enabled });
  let zone: Phaser.GameObjects.Zone | null = null;
  const targets: Phaser.GameObjects.GameObject[] = [];
  if ((spec.hitTarget ?? "zone") === "zone") {
    zone = scene.add.zone(spec.x, spec.y, spec.width, spec.height).setOrigin(0).setInteractive(cursor());
    if (spec.depth !== undefined) zone.setDepth(spec.depth);
    objects.push(zone);
    targets.push(zone);
  } else {
    targets.push(frame);
    if (labelRow !== null) targets.push(labelRow);
    else if (label !== null) targets.push(label);
    for (const target of targets) target.setInteractive(cursor());
  }
  for (const target of targets) target.on("pointerdown", activate);

  const hover = spec.hover;
  const visuals: Phaser.GameObjects.GameObject[] = [frame];
  if (label !== null) visuals.push(label);
  if (labelRow !== null) visuals.push(labelRow);
  const feedback = uiFeedback(targets, {
    visuals,
    isEnabled: () => enabled,
    ...(spec.feedback ?? {}),
  });
  // 조각(프레임·글자) 사이를 오가도 out 뒤에 over 가 오므로 수를 센다.
  let hovering = 0;
  const lit = (): void => {
    const on = hovering > 0 && enabled;
    frame.setAlpha(enabled ? (on ? hover?.hoverAlpha ?? 1 : restAlpha) : disabledAlpha);
    if (hover !== undefined) setLabelColor(on ? hover.color : hover.restColor);
  };
  for (const target of targets) {
    target.on("pointerover", () => { hovering += 1; lit(); }).on("pointerout", () => { hovering = Math.max(0, hovering - 1); lit(); });
  }
  lit();

  return {
    frame,
    label,
    labelRow,
    objects,
    feedback,
    setEnabled(value: boolean): void {
      enabled = value;
      for (const target of targets) {
        if (target.input) target.input.cursor = value ? "pointer" : false;
      }
      // 포인터가 올라 있는 채로 켜지거나 꺼져도 다음 over/out 을 기다리지 않고 바로 맞는 색이 된다.
      lit();
      if (hovering > 0) {
        // Phaser 는 over 때만 손 커서를 건다 — 올라 있는 채로 바뀐 상태를 지금 반영한다.
        const manager = scene.input.manager;
        manager.canvas.style.cursor = value ? "pointer" : manager.defaultCursor;
      }
    },
    destroy(): void {
      for (const object of objects) object.destroy();
    },
  };
}
