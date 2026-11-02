/**
 * 사용자가 요청한 파일을 기기에 내려 준다(재현 파일·플레이 로그·전설의 한 컷). 2026-10-11 세 벌을 하나로.
 * 공유 시트가 있는 브라우저는 `shareFile` 로 먼저 공유를 연다.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** JSON 한 덩어리를 들여쓴 파일로 내려 준다. */
export function downloadJson(value: unknown, filename: string): void {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), filename);
}

/**
 * 파일을 기기의 공유 시트로 보낸다(`canShare`: 이 브라우저가 그 파일을 공유할 수 있는가 — `app/LegendSharing`). 공유하지 못하면
 * "unsupported", 사용자가 닫으면 "cancelled".
 */
export async function shareFile(data: ShareData, canShare: (navigator: Navigator, data: ShareData) => boolean)
  : Promise<"shared" | "cancelled" | "unsupported"> {
  if (typeof navigator === "undefined" || !canShare(navigator, data)) return "unsupported";
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "unsupported";
  }
}
