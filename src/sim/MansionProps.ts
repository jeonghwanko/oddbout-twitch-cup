/**
 * 저택에 놓이는 소품 표.
 *
 * `public/art/props/<kit>/<id>.webp` 와 1:1 로 대응하고, **크기는 그 그림의 실제 픽셀
 * 크기다.** 화면에 그려지는 것과 시선을 끊는 판정이 같은 숫자에서 나와야 한다 — 보이는
 * 책장보다 좁게 판정하면 책장 뒤에 숨었는데 보이고, 넓게 판정하면 허공이 시야를 막는다.
 * 잠입에서 그 어긋남은 곧 부당한 실패다.
 *
 * 그림이 바뀌면 이 표의 수치도 함께 바꿔야 한다. `test/props.test.ts`는 파일 존재와
 * 선언 누락을, `test/normal-map.test.ts`는 실제 크기와 노멀맵 일치를 검사한다.
 */

/** 아트 키트 이름. 층 인덱스가 아니라 저택의 층 이름을 따른다. */
export type PropKit = "3f" | "2f" | "1f" | "b1";

/**
 * 층 인덱스 → 아트 키트.
 *
 * **뒤집혀 있다.** 층 인덱스 0 은 월드 Y 의 맨 위, 즉 3F 다락이다.
 * 이 매핑을 여러 곳에서 각자 계산하면 반드시 한 곳이 틀린다.
 */
export const KIT_BY_FLOOR: readonly PropKit[] = ["3f", "2f", "1f", "b1"];

export type PropRole =
  /** 바닥에 서서 시선을 끊는다. sim 의 blocker 지오메트리가 된다 */
  | "blocker"
  /** 빛을 낸다. 레이아웃의 lamp 자리에 그린다 */
  | "lamp"
  /** 판정이 없다. 벽걸이·바닥깔개·거미줄 */
  | "decor";

export interface PropDef {
  readonly id: string;
  readonly kit: PropKit;
  readonly role: PropRole;
  readonly w: number;
  readonly h: number;
}

export const PROPS: readonly PropDef[] = [
  // 1F 현관 — 손님을 맞는 층. 넓고 밝고 장식적이다.
  { id: "console-desk", kit: "1f", role: "blocker", w: 94, h: 76 },
  { id: "potted-palm", kit: "1f", role: "blocker", w: 49, h: 92 },
  { id: "decorative-urn", kit: "1f", role: "blocker", w: 28, h: 48 },
  { id: "chandelier", kit: "1f", role: "lamp", w: 72, h: 70 },
  { id: "wall-sconce", kit: "1f", role: "lamp", w: 31, h: 36 },
  { id: "table-lamp", kit: "1f", role: "lamp", w: 25, h: 38 },
  { id: "landscape-painting", kit: "1f", role: "decor", w: 64, h: 44 },
  // 벨벳 로프는 넘겨다보인다. 시선을 끊는 것으로 두면 화면이 거짓말을 한다.
  { id: "velvet-rope", kit: "1f", role: "decor", w: 77, h: 52 },

  // 2F 복도 — 좁고 반복적이다. 가장 "복도" 다워야 하는 층.
  { id: "grandfather-clock", kit: "2f", role: "blocker", w: 36, h: 108 },
  { id: "linen-cabinet", kit: "2f", role: "blocker", w: 61, h: 82 },
  { id: "curtains", kit: "2f", role: "blocker", w: 77, h: 104 },
  { id: "potted-plant", kit: "2f", role: "blocker", w: 34, h: 86 },
  { id: "wall-sconce", kit: "2f", role: "lamp", w: 29, h: 36 },
  { id: "portrait-painting", kit: "2f", role: "decor", w: 42, h: 52 },
  { id: "runner-carpet", kit: "2f", role: "decor", w: 60, h: 18 },
  { id: "ceramic-vase", kit: "2f", role: "decor", w: 32, h: 42 },

  // 3F 다락 — 쌓아 둔 것들. 어둡고 잡다하다.
  { id: "crate-stack", kit: "3f", role: "blocker", w: 64, h: 72 },
  { id: "covered-armchair", kit: "3f", role: "blocker", w: 73, h: 80 },
  { id: "bookcase", kit: "3f", role: "blocker", w: 56, h: 88 },
  { id: "garment-rack", kit: "3f", role: "blocker", w: 69, h: 88 },
  { id: "globe", kit: "3f", role: "blocker", w: 36, h: 68 },
  { id: "hanging-lantern", kit: "3f", role: "lamp", w: 21, h: 48 },
  { id: "travel-trunk", kit: "3f", role: "decor", w: 78, h: 46 },
  { id: "cobweb", kit: "3f", role: "decor", w: 66, h: 64 },

  // B1 창고 — 가장 어둡고 가장 비싼 것이 있는 층.
  { id: "shelving-rack", kit: "b1", role: "blocker", w: 71, h: 88 },
  { id: "crate-stack", kit: "b1", role: "blocker", w: 60, h: 78 },
  { id: "sack-pile", kit: "b1", role: "blocker", w: 75, h: 66 },
  { id: "barrel-cluster", kit: "b1", role: "blocker", w: 74, h: 64 },
  { id: "bare-bulb", kit: "b1", role: "lamp", w: 16, h: 45 },
  { id: "bottle-jar-cluster", kit: "b1", role: "decor", w: 55, h: 48 },
  { id: "rope-barrier", kit: "b1", role: "decor", w: 62, h: 48 },
  { id: "locked-chest", kit: "b1", role: "decor", w: 65, h: 48 },
];

export function kitOfFloor(floor: number): PropKit {
  return KIT_BY_FLOOR[floor] ?? "1f";
}

export function propsOf(kit: PropKit, role: PropRole): readonly PropDef[] {
  return PROPS.filter((p) => p.kit === kit && p.role === role);
}

/**
 * 그림 파일 경로. 렌더가 텍스처 키를 만들 때도 같은 함수를 쓴다.
 *
 * 폴더 이름이 `props` 인 이유는 `obj` 가 저장소 최상위 `.gitignore` 첫 줄에 있기
 * 때문이다(.NET/Unity 빌드 산출물). `art/obj/` 에 두면 파일이 조용히 커밋되지 않고,
 * 개발 중에는 로컬에 있으니 아무도 눈치채지 못한다.
 */
export function propTextureKey(prop: PropDef): string {
  return `prop-${prop.kit}-${prop.id}`;
}

export function propTexturePath(prop: PropDef): string {
  return `art/props/${prop.kit}/${prop.id}.webp`;
}

export function propNormalTexturePath(prop: PropDef): string {
  return `art/props/${prop.kit}/${prop.id}-n.webp`;
}

export function backgroundTextureKey(kit: PropKit): string {
  return `bg-${kit}`;
}

export function backgroundTexturePath(kit: PropKit): string {
  return `art/bg/${kit}-v2.webp`;
}

export function backgroundNormalTexturePath(kit: PropKit): string {
  return `art/bg/${kit}-v2-n.webp`;
}

/** 배경 플레이트 한 장의 폭. 월드가 더 넓으면 이 폭으로 반복한다. */
export const BACKGROUND_TILE_WIDTH = 914;

/**
 * 각 배경 플레이트가 **이미 그려져 있는 밝기**.
 *
 * 층의 `light` 를 그대로 곱하면 이중으로 어두워진다 — B1 그림은 그 자체로 어두운데
 * 거기에 0.36 을 또 곱하면 거의 검정이 된다. 그림이 어느 밝기로 그려졌는지 여기 적어
 * 두고, 렌더는 그 값 대비 **차이만** 틴트로 표현한다. 예고장이 조명을 흔들 때
 * (「자정에 뵙겠소」 ×0.45, 「전등은 켜두시오」 하한 1) 그 변화만 화면에 나타난다.
 */
export const BACKGROUND_NOMINAL_LIGHT: Readonly<Record<PropKit, number>> = {
  "3f": 0.7,
  "2f": 0.9,
  "1f": 0.9,
  b1: 0.36,
};
