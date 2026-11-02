import type { Locale } from "./Locale";
import { t } from "./i18n";

/**
 * 잡히지 않은 오류의 최종 목적지.
 *
 * 각 계층은 오류를 성실히 만들고 전파하는데 맨 위에서 아무도 받지 않았다.
 * 그 결과 플레이어가 보는 것은 아무 설명 없이 멈춘 캔버스였다.
 *
 * 여기는 순수 부분만 소유한다 — 문구와 보고서 조립. 화면에 그리는 일과 전역
 * 리스너 등록은 브라우저 API 계층인 `platform/fatalErrorOverlay` 가 한다.
 */

export interface FatalErrorCopy {
  readonly title: string;
  readonly body: string;
  readonly reload: string;
  readonly detailsLabel: string;
  readonly copy: string;
  readonly copied: string;
}

export function fatalErrorCopy(locale: Locale): FatalErrorCopy {
  return {
    title: t(locale, "common.fatal.title"),
    body: t(locale, "common.fatal.body"),
    reload: t(locale, "common.fatal.restart"),
    detailsLabel: t(locale, "common.fatal.technicalDetails"),
    copy: t(locale, "common.fatal.copy"),
    copied: t(locale, "common.fatal.copied"),
  };
}

/** cause 사슬을 따라갈 최대 깊이. 순환 참조가 있어도 여기서 멈춘다. */
const MAX_CAUSE_DEPTH = 4;

/**
 * `unknown` 을 사람이 읽고 그대로 붙여 넣을 수 있는 한 덩어리로 만든다.
 *
 * `cause` 를 반드시 따라간다 — `PresentationEventDispatchError` 처럼 원인을 감싸는
 * 오류가 이미 있어서, 겉면만 보면 "어떤 구독자가 실패했다"까지만 알고 진짜 원인을 잃는다.
 */
export function fatalErrorDetail(reason: unknown, depth = 0): string {
  if (reason instanceof Error) {
    const head = reason.stack !== undefined && reason.stack !== ""
      ? reason.stack
      : `${reason.name}: ${reason.message}`;
    const cause: unknown = (reason as { cause?: unknown }).cause;
    if (cause === undefined || depth >= MAX_CAUSE_DEPTH) return head;
    return `${head}\ncaused by: ${fatalErrorDetail(cause, depth + 1)}`;
  }
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    // 순환 참조나 직렬화 불가 값. 종류라도 남긴다.
    return String(reason);
  }
}

export interface FatalErrorReport {
  readonly detail: string;
  /** 치명적 오류 직전까지 조용히 사라졌던 거부들. 진단의 실마리는 대개 여기 있다. */
  readonly priorRejections: readonly string[];
}

export function fatalErrorReportText(report: FatalErrorReport): string {
  if (report.priorRejections.length === 0) return report.detail;
  const listed = report.priorRejections.map((entry, index) => `[${index + 1}] ${entry}`).join("\n");
  return `${report.detail}\n\n--- earlier unhandled rejections (${report.priorRejections.length}) ---\n${listed}`;
}
