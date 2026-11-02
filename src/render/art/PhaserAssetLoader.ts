import Phaser from "phaser";
import { arenaMobileSheet } from "../../assets/ArenaMobileArt";
import type { AsepriteAssetDefinition, ImageAssetDefinition } from "../../assets/RuntimeArtTypes";
import type { SpriteSheetAssetDefinition } from "../../assets/RuntimeArtTypes";
import { MOBILE_DEVICE } from "../DeviceProfile";

/**
 * 텍스처 키 → 에셋 경로. Phaser 는 불러온 뒤 Blob URL 을 해제하므로, 같은 원화를 다른 렌더러(마을 3D)가 다시 읽으려면
 * 원래 경로가 필요하다. 경로에서 받은 Blob 은 디코드가 메인 스레드 밖에서 돈다(`NativeCityCardView.actorTexture`).
 */
const ASSET_PATHS = new Map<string, string>();
export function phaserAssetPath(key: string): string | undefined { return ASSET_PATHS.get(key); }

/**
 * 텍스처 키 → Phaser 텍스처를 실제로 만든 파일. 모바일 판(`ArenaMobileArt`)으로 받은 시트만 원래 경로와 다르다. 저해상도 장부
 * (`PhaserTextureResidency`)는 Phaser 사본을 다시 디코드할 때 이 파일을 쓴다 — 원래 경로로 되올리면 모바일에서 원본 크기가 GPU 에 오른다.
 * 마을 3D 는 자기 사본을 원래 경로(`phaserAssetPath`)에서 받는다.
 */
const TEXTURE_FILES = new Map<string, string>();
export function phaserTextureFile(key: string): string | undefined { return TEXTURE_FILES.get(key) ?? ASSET_PATHS.get(key); }

/**
 * 같은 원화를 두 씬의 로더가 함께 받는 중이면(타이틀이 캐릭터 선택 원화를 미리 받는 동안 설정 화면을 연다 — 2026-10-18) 두 씬 모두
 * 내려받기를 기다리고, 늦게 끝난 쪽은 텍스처를 다시 등록하지 않는다. Phaser 는 로더 하나 안의 중복만 거른다. 다른 로더가 먼저 등록한
 * 키를 늦게 끝난 파일이 다시 등록하면 "Texture key already in use" 콘솔 오류를 낸다(그림은 먼저 들어온 것 그대로다).
 * 같은 키가 다른 경로에서 왔으면 진짜 충돌이므로 그대로 Phaser 가 알리게 둔다.
 */
const LANDED_PATHS = new Map<string, string>();
const LAND_ONCE_TYPES: ReadonlySet<string> = new Set(["image", "normalMap", "spritesheet"]);
const LAND_ONCE_FILES = new WeakSet<Phaser.Loader.File>();

function landOnce(scene: Phaser.Scene, key: string, path: string): void {
  for (const file of scene.load.list.getArray()) {
    if (file.key !== key || !LAND_ONCE_TYPES.has(file.type) || LAND_ONCE_FILES.has(file)) continue;
    LAND_ONCE_FILES.add(file);
    const addToCache = file.addToCache.bind(file);
    file.addToCache = () => {
      if (scene.textures.exists(key) && LANDED_PATHS.get(key) === path) return;
      addToCache();
      if (scene.textures.exists(key)) LANDED_PATHS.set(key, path);
    };
  }
}

/** 순수 manifest를 Phaser Loader 호출로 바꾸는 어댑터. */
export function preloadImageAssets(scene: Phaser.Scene, assets: readonly ImageAssetDefinition[]): void {
  for (const asset of assets) {
    ASSET_PATHS.set(asset.key, asset.path);
    if (scene.textures.exists(asset.key)) continue;
    if (asset.normalPath === undefined) scene.load.image(asset.key, asset.path);
    else scene.load.image({ key: asset.key, url: asset.path, normalMap: asset.normalPath });
    landOnce(scene, asset.key, asset.path);
  }
}

/**
 * 파일 없이 시트를 만드는 길(2026-10-18, `PhaserTextureResidency.setPhaserStubSheetPolicy`): 3D 마을이 GPU 압축판(KTX2)으로만 그리는
 * 시트는 Phaser 가 WebP 를 받지 않고 크기·프레임만 가진 시트를 만든다. 만들었으면 true. 부팅 경로가 마을 목록을 import 하지 않게 주입한다.
 */
type SpriteSheetStub = (scene: Phaser.Scene, asset: SpriteSheetAssetDefinition) => boolean;
let spriteSheetStub: SpriteSheetStub | null = null;
export function setPhaserSpriteSheetStub(stub: SpriteSheetStub | null): void { spriteSheetStub = stub; }

/**
 * 모바일 기기(`MOBILE_DEVICE`)가 받을 모바일 판(`ArenaMobileArt`). WebGL 만: Canvas 렌더러는 칸을 원본 좌표로 이미지에서 직접 오려
 * 작은 파일로는 그릴 수 없다. WebGL 렌더러는 `gl` 을 가진 렌더러로 알아본다 — 이 파일은 Phaser 를 타입으로만 쓴다(값으로 쓰면 Phaser 없는
 * 시험이 이 파일을 부를 때 Phaser 전체가 실려 `window` 를 찾는다).
 */
function mobileSheet(scene: Phaser.Scene, path: string): ReturnType<typeof arenaMobileSheet> {
  return MOBILE_DEVICE && "gl" in scene.game.renderer ? arenaMobileSheet(path) : null;
}

/**
 * 모바일 판으로 받은 시트를 원본 크기로 알린다: Phaser 는 GPU 에 받은 그대로(작게) 올리고, 칸 좌표·UV 는 여기 준 원본 가로·세로로
 * 잰다(`TextureSource` 크기). 그래서 칸 이름·원점·그리는 코드는 원본과 같다.
 */
function addAtSheetSize(scene: Phaser.Scene, key: string, width: number, height: number): void {
  for (const file of scene.load.list.getArray()) {
    if (file.key !== key || file.type !== "spritesheet") continue;
    file.addToCache = () => {
      if (scene.textures.exists(key)) return;
      const texture = scene.textures.create(key, file.data as HTMLImageElement, width, height);
      if (texture) scene.textures.addSpriteSheet(key, texture, file.config as Phaser.Types.Textures.SpriteSheetConfig);
    };
  }
}

/** manifest의 고정 프레임 시트를 한 번씩만 요청한다. 모바일 기기는 무투장 시트를 모바일 판으로 받는다(`mobileSheet`). */
export function preloadSpriteSheets(
  scene: Phaser.Scene,
  assets: readonly SpriteSheetAssetDefinition[],
): void {
  for (const asset of assets) {
    ASSET_PATHS.set(asset.key, asset.path);
    if (scene.textures.exists(asset.key)) continue;
    // 받는 중이던 같은 키의 파일이 늦게 끝나도 다시 등록하지 않는다(`landOnce`).
    if (spriteSheetStub?.(scene, asset)) { LANDED_PATHS.set(asset.key, asset.path); continue; }
    const mobile = mobileSheet(scene, asset.path), path = mobile?.path ?? asset.path;
    TEXTURE_FILES.set(asset.key, path);
    scene.load.spritesheet(asset.key, path, {
      frameWidth: asset.frameWidth,
      frameHeight: asset.frameHeight,
    });
    if (mobile) addAtSheetSize(scene, asset.key, mobile.width, mobile.height);
    landOnce(scene, asset.key, path);
  }
}

/** sprite-gen manifest의 정확한 frame_layout과 프레임별 duration을 Phaser에 넘긴다. */
export function preloadAsepriteAssets(
  scene: Phaser.Scene,
  assets: readonly AsepriteAssetDefinition[],
): void {
  for (const asset of assets) {
    ASSET_PATHS.set(asset.key, asset.path);
    if (scene.textures.exists(asset.key)) continue;
    scene.load.aseprite(asset.key, asset.path, asset.dataPath);
  }
}

/** 캐릭터 로딩 call path의 의미를 유지하는 얇은 별칭. */
export const preloadCharacterSpriteSheets = preloadSpriteSheets;
