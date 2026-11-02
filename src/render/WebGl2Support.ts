/**
 * 이 브라우저가 three 카드 뷰(3D 마을)에 필요한 WebGL2 컨텍스트를 만들 수 있는가. 확인용 컨텍스트는 곧바로 놓는다.
 * 마을 씬과 마을 원화 미리 받기(`VillageSceneRegistry.prefetchVillageCards`)가 같이 묻는다 — 3D 를 못 그리는 기기에서 원화를 받아
 * 디코드해도 아무도 꺼내 가지 않는다. "된다"는 답만 기억한다: 한때 컨텍스트를 못 만든 것으로 그 페이지 내내 3D 를 끄지 않는다.
 * 같은 확인용 컨텍스트에서 블록 압축 지원도 함께 읽는다 — BC7·ASTC(`webgl2BlockCompression`)와 BC4(`webgl2Rgtc`). 컨텍스트 하나에
 * 약 7~9 ms 라 마을 로딩이 두 번 만들지 않게(2026-10-13).
 */
let available = false;
let blockCompression: boolean | undefined;
let rgtc: boolean | undefined;
let textureExtensions: Webgl2TextureExtensions | null = null;
function probe(): void {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    available = context !== null;
    blockCompression = context !== null && (context.getExtension('EXT_texture_compression_bptc') !== null
      || context.getExtension('WEBGL_compressed_texture_astc') !== null);
    rgtc = context !== null && context.getExtension('EXT_texture_compression_rgtc') !== null;
    if (context !== null) textureExtensions = textureExtensionsOf(context);
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { available = false; blockCompression = false; rgtc = false; }
}

/**
 * 이 기기 WebGL2 의 확장 목록(`renderer.extensions` 와 같은 모양 — `has`·`get`). three 의 KTX2 변환기가 바꿀 형식을 고를 때 읽는다
 * (`KTX2Loader.detectSupport`). 렌더러 없이 고를 수 있어야 로딩 화면이 마을에 들어오기 전에 바꿔 둔다(`NativeCityCompressedTexture`).
 */
export interface Webgl2TextureExtensions {
  has(name: string): boolean;
  get(name: string): { getSupportedProfiles(): string[] } | null;
}
function textureExtensionsOf(context: WebGL2RenderingContext): Webgl2TextureExtensions {
  const names = new Set(context.getSupportedExtensions() ?? []);
  const astc = context.getExtension('WEBGL_compressed_texture_astc') as { getSupportedProfiles?: () => string[] } | null;
  const profiles = astc?.getSupportedProfiles?.() ?? [];
  return {
    has: name => names.has(name),
    get: name => names.has(name) ? { getSupportedProfiles: () => name === 'WEBGL_compressed_texture_astc' ? profiles : [] } : null,
  };
}
export function webgl2TextureExtensions(): Webgl2TextureExtensions | null {
  if (textureExtensions === null) probe();
  return textureExtensions;
}
export function webgl2Available(): boolean {
  if (!available) probe();
  return available;
}

/** 이 기기의 WebGL2 가 BC7 이나 ASTC 를 받는가. 한 번 잰 답을 쓴다. */
export function webgl2BlockCompression(): boolean {
  if (blockCompression === undefined) probe();
  return blockCompression === true;
}

/** 이 기기의 WebGL2 가 BC4(RGTC, 한 채널 블록 압축)를 받는가. 데스크톱 GPU 는 대개 받고, ASTC 만 받는 모바일은 받지 않는다. */
export function webgl2Rgtc(): boolean {
  if (rgtc === undefined) probe();
  return rgtc === true;
}
