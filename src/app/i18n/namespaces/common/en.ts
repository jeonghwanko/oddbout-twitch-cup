import { defineBase } from "../../catalog";

/** 여러 화면이 함께 쓰는 짧은 낱말(계속·확인·단위 등). 키 접두사: `common.` */
export const COMMON_EN = defineBase({
  // index.html 하단 각주 링크 (LocaleRuntime 이 부팅 때 바꾼다)
  "common.footer.privacy": "Privacy details",
  "common.footer.studio": "Studio ↗",
  "common.footer.studioAria": "Studio (new tab)",
  // 설정 · 관리의 언어 행(52cccd7c). 영어 감사 E2E 통과 전까지 행은 빼 두고 문구만 보관한다.
  // 라벨에 영어를 함께 적어 모르는 언어 화면에서도 찾게 한다.
  "common.settings.language": "Language",
  "common.settings.languageValue": "English",
  "common.settings.languageBlocked": "Language can’t change mid-heist. Switch it in the village or on the title.",

  // ── 여러 화면 공용
  "common.communicationLog": "Communication log",
  "common.speaker.madameBell": "Madame Belle",
  "common.select": "Select",
  "common.close": "Close",
  // 크게 보기 창(`imageViewer`).
  "common.imageViewer.position": "{index} / {total}",
  "common.imageViewer.previous": "Previous image",
  "common.imageViewer.next": "Next image",
  "common.imageViewer.fit": "Fit",
  "common.imageViewer.zoom": "{zoom}×",
  "common.imageViewer.zoomName": "Change zoom · now {state}",
  "common.imageViewer.zoomHint": "The wheel, a double-click or + − 0 zoom too. Arrow keys move a zoomed picture",
  "common.imageViewer.background": "Background · {name}",
  "common.imageViewer.background.dark": "Dark",
  "common.imageViewer.background.light": "Light",
  "common.imageViewer.background.checker": "Checkered",
  "common.imageViewer.save": "Save",
  "common.unit.seconds": "s",
  "common.gold": "Gold",
  "common.fame": "Fame",
  "common.next": "Next",
  "common.village": "Village",
  "common.cancel": "Cancel",
  "common.health": "HP",
  "common.back": "Back",

  // ── 일시정지 메뉴 (PauseMenu)
  "common.pause.contextHeist": "Mid-heist · time is stopped",
  "common.pause.contextTraining": "Training · time is stopped",
  "common.pause.contextVillage": "Village · time is stopped",
  "common.pause.contextArena": "Arena · time is stopped",
  "common.pause.title": "Paused",
  "common.pause.item.resume": "Resume",
  "common.pause.item.settings": "Settings",
  "common.pause.item.retryFromCheckpoint": "Retry from checkpoint",
  "common.pause.item.restartRun": "Restart run",
  "common.pause.item.restartConfirm": "Press again to restart · progress is lost",
  "common.pause.item.returnToVillage": "Return to village",
  "common.pause.item.returnToVillageConfirm": "Press again to leave · this run is lost",
  "common.pause.item.retryThisChapter": "Retry this chapter",
  "common.pause.item.exitTutorial": "Exit tutorial",
  "common.pause.item.storybook": "Storybook",
  "common.pause.item.equipment": "Equipment",
  "common.pause.item.forfeit": "Forfeit the fight",
  "common.pause.item.forfeitConfirm": "Press again to forfeit · no prize",
  "common.pause.item.titleScreen": "Title screen",
  "common.pause.item.arenaSelect": "Character select",
  // 쿠마전 사람 플레이테스트(`?playtest=kuma`, 2026-10-20)의 관찰자 항목 — 일반 플레이에는 보이지 않는다.
  "common.pause.item.exportFightLog": "Export fight log",
  "common.pause.item.newTester": "Start a new tester",
  "common.pause.item.newTesterConfirm": "Press again to start over · the fight log stays",
  "common.pause.hint.select": "↑↓ Select",
  "common.pause.hint.padConfirm": "A Confirm",
  "common.pause.hint.padResume": "B · Menu Resume",
  "common.pause.hint.keyConfirm": "{confirm} Confirm",
  "common.pause.hint.keyResume": "Esc Resume",

  // ── 치명 오류·부팅·저장소 (FatalError · main · StorageStatus)
  "common.fatal.title": "The game stopped",
  "common.fatal.body": "Something went wrong. Your saved progress is intact · restart to continue where you left off.",
  "common.fatal.restart": "Restart",
  "common.fatal.technicalDetails": "Technical details",
  "common.fatal.copy": "Copy error details",
  "common.fatal.copied": "✓ Copied",
  "common.boot.contextLost": "The graphics device was lost. It should recover on its own · reload if it does not.",
  "common.boot.reload": "Reload",
  "common.storage.saveFailed": "Browser save failed · changes apply for this session only",
});
