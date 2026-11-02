import type Phaser from "phaser";
import { declarePhaserTextureFamily } from "../PhaserTextureFamilies";
import { lowerPhaserTextureFamiliesAhead, setPhaserStubSheetPolicy } from "../PhaserTextureResidency";
import { nativeCityKtx2ActorSheet } from "../view/NativeCityKtx2Files";
import { webgl2Available } from "../WebGl2Support";

/**
 * Phaser 가 WebP 를 받지 않는 시트(2026-10-18): 광장 주민·쿠마의 시트 가운데 GPU 압축판(KTX2)이 있는 것. 3D 카드가 압축판으로만 그리므로
 * Phaser 는 크기·프레임만 가진 시트를 두고, 그 시트를 그리게 되면 그때 WebP 를 받는다(`setPhaserStubSheetPolicy`). 전에는 같은 시트를
 * WebP 와 KTX2 로 두 번 받았다(광장 주민·쿠마 WebP 약 36 MiB). 압축판이 있는 다른 몸(손님·집사·신사·로잘린·회사원)은 WebP 를 그대로
 * 받는다 — 2D 만화·초상이 그 픽셀을 캔버스로 읽는다.
 */
const STUB_SHEET_FOLDERS = /^art\/characters\/(plaza|kuma)\//;
const stubSheet = (path: string): boolean => STUB_SHEET_FOLDERS.test(path) && nativeCityKtx2ActorSheet(path);

/**
 * 마을 캐릭터 한 명의 시트 묶음을 알린다(`declarePhaserTextureFamily`). 3D 마을(WebGL2)에서는 그 몸을 three 가 그리므로 첫 방문에도
 * 시트가 처음부터 저해상도로 태어난다(`lowerPhaserTextureFamiliesAhead`) — 전에는 로딩 화면이 원본을 장당 40~75 ms 씩 메인 스레드로
 * 올린 뒤에야 three 가 맡으며 내렸다(2026-10-13). Phaser 가 그 시트를 그리면(3D 를 못 쓰게 된 화면, 문 앞 무대) 원본으로 되돌아간다.
 * 알린 뒤에 요청하는 시트 가운데 압축판으로만 그리는 시트는 파일 없이 만든다(`stubSheet`).
 */
export function declareNativeCityActorSheets(game: Phaser.Game, keys: readonly string[]): void {
  declarePhaserTextureFamily(keys);
  if (!webgl2Available()) return;
  setPhaserStubSheetPolicy(stubSheet);
  lowerPhaserTextureFamiliesAhead(game, keys);
}
