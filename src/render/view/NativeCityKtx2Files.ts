import manifest from '../../assets/native-city-ktx2.json';
import { webgl2BlockCompression, webgl2Rgtc } from '../WebGl2Support';

/**
 * 마을 3D 원화의 GPU 압축판(KTX2) 목록·받기(2026-10-11, 3D 그래픽 메모리 줄이기). three 를 import 하지 않는다 —
 * 로딩 화면(`NativeCityCardPrefetch`)이 쓰고, three 청크는 카드 뷰를 열 때 받는다. 바꾸기는 `NativeCityCompressedTexture`.
 *
 * RGBA 원화는 GPU 에서 화소당 4 바이트다. KTX2(UASTC)는 이 GPU 가 받는 블록 압축(데스크톱 BC7, 모바일 ASTC)으로 바꿔 올려
 * 화소당 1 바이트다. 바꾸기(transcode)는 three 의 `KTX2Loader` 워커가 한다(메인 스레드 밖). 목록과 출처 해시는
 * `assets/native-city-ktx2.json`, 굽기는 `tools/art/encode-city-ktx2.mjs` 가 소유한다.
 *
 * 블록 압축을 받지 않는 GPU 에서는 아무것도 바꾸지 않는다 — 지금까지처럼 WebP 를 받는다(`nativeCityKtx2Path` 가 null).
 * 한 채널 지도의 BC4 판(`options.bc4`, 2026-10-14)은 basis 를 거치지 않고 BC4 블록 그대로 올라가므로 RGTC 를 받는 기기만 쓴다.
 */
interface Ktx2Entry { readonly ktx2: string; readonly width: number; readonly height: number;
  readonly options?: { readonly linear?: boolean; readonly mipmaps?: boolean; readonly pad?: boolean; readonly bc4?: boolean; readonly actor?: boolean } }
const TEXTURES = manifest.textures as Readonly<Record<string, Ktx2Entry>>;

/** 이 기기의 WebGL2 가 BC7 이나 ASTC 를 받는가(`webgl2BlockCompression` — WebGL2 확인과 같은 컨텍스트로 한 번 잰다). */
const compressedSupported = webgl2BlockCompression;

/** 이 원화를 압축판으로 받을 때 그 경로(`public/` 기준). 압축판이 없거나 이 기기가 받지 못하면 null. */
export function nativeCityKtx2Path(path: string): string | null {
  return nativeCityKtx2Entry(path)?.ktx2 ?? null;
}

/**
 * 압축판 경로와 쓰임: 색이 아닌 데이터(`linear` — 조명 지도)인가, 밉맵이 들어 있는가. `padded`: 4의 배수로 맞추려 오른쪽·아래에 투명
 * 여백을 붙여 구운 시트의 크기(2026-10-13) — 그림의 칸 좌표는 원래 화소 그대로라, 그리는 쪽이 이 크기로 나눈다. 받지 못하면 null.
 */
export function nativeCityKtx2Entry(path: string): { readonly ktx2: string; readonly linear: boolean; readonly mipmaps: boolean;
  readonly padded: { readonly width: number; readonly height: number } | null } | null {
  const entry = TEXTURES[path];
  if (entry === undefined || !(entry.options?.bc4 === true ? webgl2Rgtc() : compressedSupported())) return null;
  return { ktx2: entry.ktx2, linear: entry.options?.linear === true, mipmaps: entry.options?.mipmaps !== false,
    padded: entry.options?.pad === true ? { width: entry.width, height: entry.height } : null };
}

/** 캐릭터 판 시트(`options.actor`)이고 이 기기가 그 압축판을 받는가 — 3D 카드가 압축판만으로 그린다. */
export function nativeCityKtx2ActorSheet(path: string): boolean {
  return TEXTURES[path]?.options?.actor === true && nativeCityKtx2Entry(path) !== null;
}

/** 압축판 파일을 받는다(로딩 화면이 미리 받아 둔다). */
export async function fetchNativeCityKtx2(ktx2Path: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(`${import.meta.env.BASE_URL}${ktx2Path.replace(/^\//, '')}`, signal ? { signal } : {});
  if (!response.ok) throw new Error(`City KTX2 ${ktx2Path}: HTTP ${response.status}`);
  return response.arrayBuffer();
}
