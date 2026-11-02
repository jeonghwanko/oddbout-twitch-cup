import { shareFile } from "./fileSave";

/**
 * 링크 하나를 보낸다(2026-10-24, ODDBOUT 경기 공유 — `app/ArenaBoutShare`). `sheet`(폰·태블릿)면 기기의 공유 시트를 먼저 연다. 시트가 없거나
 * 데스크톱이면 글과 링크를 클립보드에 복사한다. 사용자가 시트를 닫으면 "cancelled", 복사도 못 하면 "failed".
 */
export async function shareLink(data: { readonly title: string; readonly text: string; readonly url: string }, sheet: boolean)
  : Promise<"shared" | "copied" | "cancelled" | "failed"> {
  if (sheet) {
    const shared = await shareFile({ ...data }, (navigator, share) => typeof navigator.share === "function" && (navigator.canShare?.(share) ?? true));
    if (shared !== "unsupported") return shared;
  }
  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard) return "failed";
  try {
    await clipboard.writeText(`${data.text} ${data.url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
