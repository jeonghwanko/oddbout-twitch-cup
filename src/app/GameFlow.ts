import type { CityTournamentEntry } from "./CityTournamentProgress";
export const SCENE_KEYS = Object.freeze({
  intro: "Intro",
  title: "Title",
  loading: "Loading",
  characterSelect: "CharacterSelect",
  outfitShop: "OutfitShop",
  village: "Village",
  auctionLobby: "AuctionLobby",
  /** 주간 토너먼트 무투장(2026-10-18): 게시판 대진표에서 "입장"해 한 경기를 싸우는 별도 화면. 마을 청크에서 지연 등록한다. */
  arena: "Arena",
  arenaDuel: "ArenaDuel",
  /** 16강 컵 기록실(2026-10-24): 끝난 컵·경기 기록과 다시 보기. 무투장 청크에서 지연 등록한다(`loadArenaModule`). */
  arenaArchive: "ArenaArchive",
  /** 무투장 직접 링크(`?arena=1`, 2026-10-19)의 캐릭터 고르기: 고른 캐릭터로 연습 경기 한 판, 게스트 전적. 부팅 때 등록한다. */
  arenaSelect: "ArenaSelect",
  briefing: "Briefing",
  invitationPost: "InvitationPost",
  heist: "Heist",
  settlement: "Settlement",
  heistRetreat: "HeistRetreat",
  campaign: "Campaign",
  rooftop: "Rooftop",
  hud: "Hud",
  pause: "Pause",
  settings: "Settings",
  questJournal: "QuestJournal",
  storybook: "Storybook",
  tournament: "Tournament",
  otherworldSatchel: "OtherworldSatchel",
});


export type SceneKey = (typeof SCENE_KEYS)[keyof typeof SCENE_KEYS];
export interface GameRoute { readonly scene: string; readonly data?: object }
export type ArenaSceneData =
 | { readonly mode: "tournament"; readonly entry: CityTournamentEntry; readonly from: "board" | "select"; readonly autoPlay?: boolean }
 | { readonly mode: "exhibition"; readonly player: string; readonly opponentId: string; readonly rematch?: true; readonly autoPlay?: boolean };
// Shared duel controls retain route shapes; the standalone host never registers site screens.
export const GAME_FLOW = {
 arenaSelectEntered: (data: object = {}): GameRoute => ({ scene: SCENE_KEYS.arenaSelect, data }),
 arenaArchiveEntered: (data: object): GameRoute => ({ scene: SCENE_KEYS.arenaArchive, data }),
 arenaLeft: (data: object): GameRoute => ({ scene: SCENE_KEYS.village, data }),
 arenaExhibition: (player: string, opponentId: string, options: unknown): GameRoute => ({ scene: SCENE_KEYS.arena, data: { player, opponentId, options } }),
};
