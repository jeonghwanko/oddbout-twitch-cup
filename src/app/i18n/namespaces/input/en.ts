import { defineBase } from "../../catalog";

/** 조작 안내·키캡 옆 동사·패드 도움말. 키 접두사: `input.` */
export const INPUT_EN = defineBase({
  // ── 여러 화면 공용
  "input.padA": "Pad A",
  "input.padB": "Pad B",
  "input.padR1": "Pad R1",
  "input.padX": "Pad X",
  "input.cityFight": "City fight",

  // ── 잠입 HUD 조작 안내 (HudControlsHintView)
  "input.hud.leftStick": "Left stick",
  "input.hud.move": "Move",
  "input.hud.leave": "Leave",
  "input.hud.leaveTutorial": "Leave tutorial",
  "input.hud.mute": "Mute",
  "input.hud.controlsGuide": "Controls",

  // ── 상황 행동 프롬프트 (ContextActionView)
  "input.context.pickpocket": "Pickpocket",
  "input.context.intel": "Intel",
  "input.context.subdue": "Subdue",
  "input.context.ghostBid": "Ghost bid · stir the hall",
  "input.context.swapFake": "Swap for the fake",
  "input.context.grabAlarm": "Grab · alarm",
  "input.context.recover": "Recover",
  "input.context.keepStealing": "Keep stealing",
  "input.context.steal": "Steal",
  "input.context.exit": "Exit",
  "input.context.escape": "Escape",
  "input.context.hide": "Hide",
  "input.context.leaveCover": "Leave cover",
  "input.context.enterVent": "Enter vent",
  "input.context.ladder": "Ladder",
  "input.context.throwRope": "Throw rope",
  "input.context.pullChandelier": "Pull chandelier line",
  "input.context.startCaper": "Start caper chain",
  "input.context.dragBody": "Drag body · movement",
});
