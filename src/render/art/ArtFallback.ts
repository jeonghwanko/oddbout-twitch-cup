import Phaser from "phaser";
import { PALETTE } from "./palette";

/**
 * 원화가 없을 때 무엇을 할 것인가.
 *
 * 열한 개 파일이 `scene.textures.exists` 를 각자 물어보고 각자 다르게 답했다 — 어떤 곳은
 * `continue`, 어떤 곳은 다른 키로 대체, 어떤 곳은 통째로 `return`. 셋 다 "아무것도 그리지
 * 않는다" 로 끝나는데, 그 결과가 오브젝트마다 다르게 무겁다.
 *
 * 사다리·환기구·전리품이 보이지 않으면 플레이어에게는 **없는 것**이다. 판정은 레이아웃이
 * 갖고 있으니 오를 수는 있지만, 보이지 않는 통로를 찾아낼 방법이 없다. 반면 배경 타일이나
 * 램프 원화가 빠지는 것은 분위기 손실이지 진행 방해가 아니다.
 *
 * 그래서 등급으로 나눈다.
 * - `essential`: 상호작용·통과 대상. 원화가 없으면 대체 실루엣을 그려 **존재를 알린다.**
 * - `decorative`: 분위기. 조용히 생략한다.
 */
export type ArtGrade = "essential" | "decorative";

/** 원화가 빠진 자리에 세우는 공용 실루엣. 크기는 호출자가 원래 원화처럼 지정한다. */
export const MISSING_ART_TEXTURE = "tex-missing-art";

const MISSING_ART_SIZE = 64;

/**
 * 그릴 수 있는 텍스처 키. 없으면 `null` 이고, 그때는 아무것도 그리지 않는다.
 *
 * `essential` 은 `null` 을 돌려주지 않는다 — 대체 실루엣을 만들어서라도 자리를 채운다.
 */
export function artTextureKey(scene: Phaser.Scene, key: string | undefined, grade: ArtGrade): string | null {
  if (key !== undefined && key !== "" && scene.textures.exists(key)) return key;
  if (grade === "decorative") return null;
  buildMissingArtTexture(scene);
  return scene.textures.exists(MISSING_ART_TEXTURE) ? MISSING_ART_TEXTURE : null;
}

/**
 * 빠진 원화를 대신하는 실루엣.
 *
 * 배경으로 오해되지 않도록 경보색 테두리와 사선을 넣는다 — 플레이어에게는 "여기 무언가
 * 있다", 개발자에게는 "이 원화가 로드되지 않았다" 로 동시에 읽혀야 한다.
 */
function buildMissingArtTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(MISSING_ART_TEXTURE)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  const size = MISSING_ART_SIZE;
  graphics.fillStyle(PALETTE.outline, 0.85);
  graphics.fillRoundedRect(0, 0, size, size, 6);
  graphics.lineStyle(3, PALETTE.alarm, 0.9);
  graphics.strokeRoundedRect(1.5, 1.5, size - 3, size - 3, 6);
  graphics.lineStyle(2, PALETTE.alarm, 0.55);
  graphics.lineBetween(8, 8, size - 8, size - 8);
  graphics.lineBetween(size - 8, 8, 8, size - 8);
  graphics.generateTexture(MISSING_ART_TEXTURE, size, size);
  graphics.destroy();
}
