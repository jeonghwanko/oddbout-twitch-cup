import { openDomModal, type DomModal } from "./domModal";
import { domTextSize } from "./domTextScale";
import { cssHex, FONT, PALETTE } from "../art/palette";
import { DOM_LAYER_Z } from "../depths";
import { stringOf } from "../../app/i18n";
import type { Locale } from "../../app/Locale";
import { FIGHT_STATUS_ICON_ATLAS, fightStatusIcon, fightStatusIconCell } from "../../assets/FightStatusArtCatalog";
import { CITY_FIGHT_FOE_STATUS_SIDE, CITY_FIGHT_PLAYER_STATUSES, type CityFightAnswer, type CityFightFoeSkill, type CityFightFoeStatus, type CityFightPlayerStatus }
  from "../../sim/cityFight/CityFightStatus";

/**
 * 싸움 상태 아이콘의 설명 창(2026-10-18): 아이콘 하나를 누르면 그 한 줄, `?`(패드는 안내 버튼)면 상대·나의 아이콘 전체, 상대 썸네일을 누르면 그의
 * 기술과 지금 켜진 상태. 가끔 뜨는 중요 정보라 남색 판(HUD 규칙), 문구는 두 줄을 넘지 않는다. 열린 동안 싸움은 멈춘다(씬이 `open` 을 붙듦으로
 * 읽는다). 닫기: 닫기 단추·Esc·패드 B(`openDomModal`), 판 밖 클릭.
 */

export type FightStatusSide = "foe" | "me";

/** A line of the table by an assembled key (`fight.status.<id>.name`); the key itself if it is missing. */
function t(locale: Locale, key: string): string {
  return stringOf(locale, key);
}

/** A key chip on a move's line: its key, and `when` (small, after it) if the key only works then; `ring` draws it as V's counter ring. */
interface Chip { readonly key: string; readonly when?: string; readonly ring?: boolean }
interface Row { readonly icon?: string; readonly grade?: "white" | "gold" | "red" | null; readonly line?: boolean; readonly name: string;
  readonly desc: string; readonly on: boolean; readonly tag?: string; readonly chips?: readonly Chip[] }
/** `column`: which column of a headless card it stacks in (0 when absent). `empty`: shown as a line when it has no rows (else it is left out). */
interface Section { readonly heading: string; readonly rows: readonly Row[]; readonly column?: number; readonly empty?: string }
/**
 * `headless`: no title line on the card (the opponent's — his name and face are already on the HP bar above; the title still names it).
 * `panes`: each column its own window side by side, titled so (the arena duel's effect board).
 */
export interface FightStatusDialogContent { readonly title: string; readonly headless?: boolean; readonly panes?: readonly string[];
  readonly sections: readonly Section[] }

const NAME_KEY: Readonly<Record<CityFightPlayerStatus, string>> = { guard: "guard", guardBroken: "guardBroken", invulnerable: "invulnerable",
  dizzy: "dizzy", grabbed: "grabbed" };
const MY_DESC: Partial<Record<CityFightPlayerStatus, string>> = { guard: "myGuard", invulnerable: "myInvulnerable" };

function statusRow(locale: Locale, side: FightStatusSide, status: CityFightFoeStatus | CityFightPlayerStatus, on: boolean): Row {
  const key = side === "me" ? NAME_KEY[status as CityFightPlayerStatus] : status;
  const desc = side === "me" ? MY_DESC[status as CityFightPlayerStatus] ?? key : key;
  return { icon: fightStatusIcon(status), name: t(locale, `fight.status.${key}.name`), desc: t(locale, `fight.status.${desc}.desc`),
    on, tag: on ? t(locale, "fight.status.on") : undefined };
}

/** One icon's line (a press on it). */
export function fightStatusEntryContent(locale: Locale, side: FightStatusSide, status: CityFightFoeStatus | CityFightPlayerStatus,
  on: boolean): FightStatusDialogContent {
  const row = statusRow(locale, side, status, on);
  return { title: row.name, sections: [{ heading: t(locale, side === "foe" ? "fight.status.foe" : "fight.status.me"), rows: [row] }] };
}

/** Every icon of both sides (`?`): `foeAll` the opponent's possible ones, `foeLit` / `meLit` the ones on now. */
export function fightStatusHelpContent(locale: Locale, foeAll: readonly CityFightFoeStatus[], foeLit: readonly CityFightFoeStatus[],
  meLit: readonly CityFightPlayerStatus[]): FightStatusDialogContent {
  return { title: t(locale, "fight.status.help"), sections: [
    { heading: t(locale, "fight.status.me"), rows: CITY_FIGHT_PLAYER_STATUSES.map(id => statusRow(locale, "me", id, meLit.includes(id))) },
    { heading: t(locale, "fight.status.foe"), rows: foeAll.map(id => statusRow(locale, "foe", id, foeLit.includes(id))) },
  ] };
}

/** The keys the player's bindings show now (keyboard or pad): Z guard, X dodge (the vault), V heavy, C attack. */
export interface FightAnswerKeys { readonly guard: string; readonly dodge: string; readonly heavy: string; readonly attack: string }

function answerChips(locale: Locale, answers: readonly CityFightAnswer[], keys: FightAnswerKeys): Chip[] {
  return answers.flatMap((answer): Chip[] => answer === "guard" ? [{ key: keys.guard }] : answer === "dodge" ? [{ key: keys.dodge }]
    : answer === "counter" ? [{ key: keys.heavy, ring: true, when: t(locale, "fight.skill.counterWhen") }]
      : [{ key: keys.attack }, { key: keys.heavy, when: t(locale, "fight.skill.cutWhen") }]);
}

/**
 * The opponent's card (his thumbnail): his moves beside his statuses with the ones on now — two columns, no head (2026-10-19 user: the face
 * and the name repeat the HP bar's). Each move is one line: what he does (the tell) and the keys that take it (2026-10-19 '신호 → 대응 키');
 * his shifts go under the HP bar's own heading, as its gold lines.
 */
export function fightFoeCardContent(locale: Locale, name: string, skills: readonly CityFightFoeSkill[], keys: FightAnswerKeys,
  foeAll: readonly CityFightFoeStatus[], foeLit: readonly CityFightFoeStatus[]): FightStatusDialogContent {
  const row = (skill: CityFightFoeSkill): Row => ({ grade: skill.grade, line: skill.id === "shifts",
    name: t(locale, `fight.skill.${skill.id}.name`), desc: t(locale, `fight.skill.${skill.id}.desc`), on: false,
    chips: answerChips(locale, skill.answers, keys) });
  const bar = skills.filter(skill => skill.id === "shifts"), moves = skills.filter(skill => skill.id !== "shifts");
  return { title: name, headless: true, sections: [{ heading: t(locale, "fight.status.skills"), rows: moves.map(row) },
    { heading: t(locale, "fight.skill.hpBar"), rows: bar.map(row) },
    { heading: t(locale, "fight.status.help"), rows: foeAll.map(id => statusRow(locale, "foe", id, foeLit.includes(id))), column: 1 }] };
}

/**
 * The arena duel's effect board (2026-10-22 사용자: "전체 효과 리스트를 (긍정, 부정) 2섹션으로 볼 수 있는 윈도우가 왼편, 현재 적용중인 상태가
 * 오른편 윈도우"): two windows side by side — the left every effect a fighter can have, his edges and his weaknesses
 * (`CITY_FIGHT_FOE_STATUS_SIDE`; his summons are edges), the right the ones on him now under his name. `summons`: his summon moves, `liveSummons`
 * the ones out on the stage.
 */
export function fightEffectBoardContent(locale: Locale, name: string, foeAll: readonly CityFightFoeStatus[], foeLit: readonly CityFightFoeStatus[],
  summons: readonly CityFightFoeSkill[], liveSummons: readonly CityFightFoeSkill[], keys: FightAnswerKeys): FightStatusDialogContent {
  const summonRow = (skill: CityFightFoeSkill, on: boolean): Row => ({ grade: skill.grade, name: t(locale, `fight.skill.${skill.id}.name`),
    desc: t(locale, `fight.skill.${skill.id}.desc`), on, tag: on ? t(locale, "fight.status.on") : undefined,
    chips: answerChips(locale, skill.answers, keys) });
  const side = (which: "positive" | "negative") => foeAll.filter(id => CITY_FIGHT_FOE_STATUS_SIDE[id] === which)
    .map(id => statusRow(locale, "foe", id, foeLit.includes(id)));
  const live = new Set(liveSummons.map(skill => skill.id));
  return { title: `${name} · ${t(locale, "fight.status.board")}`, headless: true,
    panes: [t(locale, "fight.status.board"), t(locale, "fight.status.active")], sections: [
      { heading: t(locale, "fight.status.positive"), rows: [...side("positive"), ...summons.map(skill => summonRow(skill, live.has(skill.id)))] },
      { heading: t(locale, "fight.status.negative"), rows: side("negative") },
      { heading: name, column: 1, empty: t(locale, "fight.status.none"),
        rows: [...foeLit.map(id => statusRow(locale, "foe", id, true)), ...liveSummons.map(skill => summonRow(skill, true))] },
    ] };
}

const STYLE_ID = "fight-status-dialog-style";
const GRADE: Readonly<Record<"white" | "gold" | "red", string>> = { white: cssHex(PALETTE.white), gold: cssHex(PALETTE.hotGold),
  red: cssHex(PALETTE.burgundyInk) };

function ensureStyle(): void {
  const document = globalThis.document;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  const white = cssHex(PALETTE.white), navy = cssHex(PALETTE.navyInk), ink = cssHex(PALETTE.webtoonInk), gold = cssHex(PALETTE.hotGold);
  style.textContent = `
.fight-status-veil{position:fixed;inset:0;z-index:${DOM_LAYER_Z.gameDialog};display:grid;place-items:center;padding:16px;background:transparent;font-family:${FONT.hudSans}}
.fight-status-card{max-width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:${navy};color:${white};border:1px solid ${white};padding:14px 16px 12px}
.fight-status-card[data-cols="2"]{max-width:min(820px,100%)}
.fight-status-split{background:transparent;border:0;padding:0}
.fight-status-split .fight-status-cols{gap:16px}
.fight-status-pane{background:${navy};border:1px solid ${white};padding:12px 16px 10px}
.fight-status-pane-title{margin:0 0 4px;font-size:${domTextSize("18px")};font-weight:700}
.fight-status-empty{margin:4px 0;font-size:${domTextSize("14px")};opacity:.62}.fight-status-cols{display:grid;grid-template-columns:repeat(var(--cols,1),minmax(0,1fr));gap:0 24px;align-items:start}
@media (max-width:640px){.fight-status-cols{grid-template-columns:minmax(0,1fr)}}
.fight-status-head{display:flex;align-items:center;gap:12px;margin:0 0 8px}
.fight-status-head-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.fight-status-head h2{margin:0;font-size:${domTextSize("20px")};font-weight:700}
.fight-status-card h3{margin:10px 0 4px;font-size:${domTextSize("13px")};font-weight:700;letter-spacing:.04em;opacity:.75}
.fight-status-row{display:grid;grid-template-columns:44px 1fr;gap:2px 10px;align-items:center;padding:4px 0;opacity:.62}
.fight-status-row[data-on="true"],.fight-status-row[data-skill="true"]{opacity:1}
.fight-status-icon{grid-row:span 2;width:44px;height:44px;background-repeat:no-repeat}
.fight-status-grade{grid-row:span 2;width:14px;height:14px;margin:0 15px;border:1px solid ${white};transform:rotate(45deg)}
.fight-status-name{font-size:${domTextSize("16px")};font-weight:700}
.fight-status-name small{margin-left:8px;font-size:${domTextSize("12px")};font-weight:700;color:${gold}}
.fight-status-chips{display:inline-flex;align-items:center;gap:4px;margin-left:10px;vertical-align:2px}
.fight-status-chip{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 4px;box-sizing:border-box;font:700 ${domTextSize("12px")} ${FONT.hudSans};color:${navy};background:${white};border-radius:3px}
.fight-status-chip[data-ring="true"]{border-radius:50%;background:transparent;color:${white};box-shadow:inset 0 0 0 2px ${gold}}
.fight-status-when{font-size:${domTextSize("11px")};font-weight:700;color:${gold};margin-right:4px}
.fight-status-line{grid-row:span 2;width:4px;height:26px;margin:0 20px;background:${gold}}
.fight-status-desc{font-size:${domTextSize("14px")};line-height:1.35}
.fight-status-close{display:block;margin:12px 0 0 auto;padding:6px 18px;font:700 ${domTextSize("15px")} ${FONT.hudSans};color:${white};background:transparent;border:1px solid ${white};cursor:pointer}
.fight-status-close:focus-visible,.fight-status-close:hover{background:${white};color:${ink}}
`;
  document.head.append(style);
}

function iconUrl(): string {
  return new URL(`./${FIGHT_STATUS_ICON_ATLAS.path}`, globalThis.document.baseURI).href;
}

/** The icon as a DOM box (the atlas cell, scaled to `size` px). */
export function fightStatusIconStyle(icon: string, size: number): Partial<CSSStyleDeclaration> {
  const cell = fightStatusIconCell(icon as Parameters<typeof fightStatusIconCell>[0]), scale = size / FIGHT_STATUS_ICON_ATLAS.frameWidth;
  return { backgroundImage: `url("${iconUrl()}")`, backgroundSize: `${FIGHT_STATUS_ICON_ATLAS.width * scale}px ${FIGHT_STATUS_ICON_ATLAS.height * scale}px`,
    backgroundPosition: `${-cell.x * scale}px ${-cell.y * scale}px` };
}

/** Opens the card over the game (`onClosed` once it is gone). */
export function openFightStatusDialog(locale: Locale, content: FightStatusDialogContent, onClosed: () => void): DomModal {
  ensureStyle();
  const document = globalThis.document, el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement) => {
    const node = document.createElement(tag); node.className = cls; parent.append(node); return node;
  };
  const veil = document.createElement("div");
  veil.className = "fight-status-veil";
  const panes = content.panes ?? [];
  const card = el("div", panes.length > 0 ? "fight-status-card fight-status-split" : "fight-status-card", veil);
  const head = el("div", content.headless ? "fight-status-head-hidden" : "fight-status-head", card);
  const title = el("h2", "", head);
  title.id = "fight-status-title"; title.textContent = content.title;
  // Headless (the opponent's card): its sections in their columns side by side; with panes each column is a window of its own.
  const sections = content.sections.filter(section => section.rows.length > 0 || section.empty !== undefined);
  const cols = content.headless ? Math.max(1, panes.length, ...sections.map(section => (section.column ?? 0) + 1)) : 1;
  const body = el("div", "fight-status-cols", card);
  body.style.setProperty("--cols", String(cols));
  card.dataset.cols = String(cols);
  const columns = Array.from({ length: cols }, (_, i) => {
    if (cols === 1) return body;
    const column = el("div", panes.length > 0 ? "fight-status-col fight-status-pane" : "fight-status-col", body);
    if (panes[i]) el("h2", "fight-status-pane-title", column).textContent = panes[i];
    return column;
  });
  for (const section of sections) {
    const column = columns[Math.min(cols - 1, section.column ?? 0)]!;
    el("h3", "", column).textContent = section.heading;
    if (section.rows.length === 0 && section.empty !== undefined) el("p", "fight-status-empty", column).textContent = section.empty;
    for (const row of section.rows) {
      const line = el("div", "fight-status-row", column);
      line.dataset.on = String(row.on);
      if (row.icon) Object.assign(el("span", "fight-status-icon", line).style, fightStatusIconStyle(row.icon, 44));
      else if (row.line) { line.dataset.skill = "true"; el("span", "fight-status-line", line); }
      else { line.dataset.skill = "true"; const mark = el("span", "fight-status-grade", line); mark.style.background = row.grade ? GRADE[row.grade] : "transparent"; }
      const name = el("span", "fight-status-name", line);
      name.textContent = row.name;
      if (row.tag) el("small", "", name).textContent = row.tag;
      if (row.chips?.length) {
        const chips = el("span", "fight-status-chips", name);
        for (const chip of row.chips) {
          const cap = el("span", "fight-status-chip", chips);
          cap.textContent = chip.key;
          if (chip.ring) cap.dataset.ring = "true";
          if (chip.when) el("span", "fight-status-when", chips).textContent = chip.when;
        }
      }
      el("span", "fight-status-desc", line).textContent = row.desc;
    }
  }
  // With panes it closes from the last window (the "on now" one), not from under both.
  const close = el("button", "fight-status-close", panes.length > 0 && cols > 1 ? columns[cols - 1]! : card);
  close.type = "button"; close.textContent = t(locale, "fight.status.close");
  let modal: DomModal | null = null;
  const done = () => { if (!modal || modal.closed) return; modal.close(); onClosed(); };
  close.addEventListener("click", done);
  veil.addEventListener("pointerdown", event => { if (event.target === veil) done(); });
  modal = openDomModal(veil, { labelledBy: title.id, onEscape: done, holdKeyUp: true,
    onKey: event => { if (event.key === "Enter" || event.key === "?" || event.key === "/") { event.preventDefault(); done(); } } });
  close.focus({ preventScroll: true });
  return { get closed() { return modal?.closed ?? true; }, close: done };
}
