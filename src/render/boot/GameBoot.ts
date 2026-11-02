import Phaser from "phaser";
import { t } from "../../app/i18n";
import type { RuntimeOptions } from "../../app/RuntimeOptions";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../../sim/tuning";
import { installPerfOverlay } from "../../dev/PerfOverlay";
import { loadPlayerSettings, savePlayerSettings } from "../../platform/playerSettingsStorage";
import { installFatalErrorReporter, showRecoverableNotice } from "../../platform/fatalErrorOverlay";
import { applyPlayerSettings, installAccessibilityRuntime } from "../accessibility/AccessibilityRuntime";
import { loadUiFont, startDisplayFontLoad } from "../art/fontLoading";
import { sfx } from "../audio/sfx";
import { installGameCanvasBackground } from "../GameCanvasUnderlay";
import { installHighResolutionTextFactory } from "../installHighResolutionText";
import { observeDocumentVisibility } from "../lifecycle/DocumentVisibilityBinding";
import { installLocaleRuntime } from "../localization/LocaleRuntime";
import { installPhaserImageUploads } from "../PhaserTextureResidency";
import { RENDER_FRAME_RATE } from "../RenderFrameRate";
import { GAME_PARENT_ID, RENDER_SCALE } from "../RenderScale";
const PLAYER_SETTINGS_CHANGED_EVENT = "player-settings-changed";
import { UI_FEEDBACK_PLUGIN } from "../ui/UiFeedbackPlugin";

export type SceneClass = new () => Phaser.Scene;

/** 한 페이지의 부팅. 본편(`main.ts`, index.html)과 AI Fighter(`fighter.ts`, fighter.html)가 같은 부팅을 쓴다(2026-10-19). */
export interface GameBootSpec {
  readonly options: RuntimeOptions;
  /** 브라우저 탭 제목(`GameIdentity`). */
  readonly title: string;
  /** 부팅 때 등록하는 씬. 첫 씬이 시작한다. 마을·무투장 청크의 씬은 넣지 않는다(`VillageSceneRegistry`가 받아 등록한다). */
  readonly scenes: readonly SceneClass[];
  /** 첫 씬이 인트로 영상이면 표제 글꼴을 영상 뒤로 미룬다(`IntroScene`이 시작한다). */
  readonly displayFontAfterIntro: boolean;
}

/**
 * 부팅만 담당한다.
 *
 * Arcade 물리를 켜지 않는 이유는 sim 이 이동·충돌을 소유하기 때문이다.
 * 엔진이 위치를 소유하면 시드 + 입력만으로 런을 재생할 수 없다.
 */
export async function bootGame(spec: GameBootSpec): Promise<Phaser.Game> {
  const { options } = spec;
  globalThis.document.documentElement.lang = options.locale;
  globalThis.document.title = spec.title;

  // 부팅보다 먼저 건다. 씬 생성 중에 난 오류도 검은 화면이 아니라 설명으로 끝나야 한다.
  let bootedGame: Phaser.Game | null = null;
  const uninstallFatalErrorReporter = installFatalErrorReporter({
    locale: options.locale,
    onFatal: () => bootedGame?.loop.stop(),
  });

  installHighResolutionTextFactory();
  // 받은 원화는 메인 스레드 밖에서 디코드한 비트맵으로 올린다(`PhaserTextureResidency`). 게임을 만들기 전에 건다.
  installPhaserImageUploads();

  // Phaser Canvas Text 는 생성 시점에 글자 폭을 재서 굳힌다. 본문 글꼴이 늦게 도착하면
  // 첫 화면이 폴백 폭 그대로 남으므로 부팅을 글꼴 뒤로 미룬다. 표제용 조선궁서체는
  // 3.4MB 라 여기서 기다리지 않고, 도착한 뒤 useDisplayFont 가 다시 달아 준다.
  // 인트로로 여는 부팅은 영상이 먼저 받히도록 IntroScene 이 표제 글꼴을 늦게 시작한다.
  performance.mark?.("oddbout:fonts-start");
  await loadUiFont();
  performance.mark?.("oddbout:fonts-ready");
  if (!spec.displayFontAfterIntro) startDisplayFontLoad();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: GAME_PARENT_ID,
    // EXPAND의 논리 좌표는 각 씬 카메라가 RENDER_SCALE로 되돌리고, 캔버스 백버퍼만 키운다.
    width: VIEW_WIDTH * RENDER_SCALE,
    height: VIEW_HEIGHT * RENDER_SCALE,
    pixelArt: false,
    antialias: true,
    roundPixels: false,
    // 알파가 있는 컨텍스트로 부팅해 마을 3D 캔버스를 게임 캔버스 밑에 깔 수 있게 한다. 평소의 하늘색 불투명
    // 지우기는 부팅 직후 `installGameCanvasBackground` 가 건다(`render/GameCanvasUnderlay.ts`).
    transparent: true,
    fps: RENDER_FRAME_RATE,
    // 소리는 `render/audio` 의 WebAudio 싱글턴 하나가 소유한다. Phaser 사운드 매니저를 켜 두면
    // 아무도 쓰지 않는 두 번째 AudioContext 가 생긴다(co-op 부팅·E2E 픽스처와 같은 설정).
    audio: { noAudio: true },
    callbacks: {
      preBoot: (bootingGame) => installLocaleRuntime(bootingGame, options.locale),
    },
    scale: {
      // 16:9 밖을 본문 색으로 남기지 않고 실제 가로 화각으로 확장한다. 저택 배경은
      // 월드 폭 전체 TileSprite라 추가 영역도 같은 층 원화로 자연스럽게 채워진다.
      // 마을도 같은 모드로 상하·좌우 시야를 확장하며, 기준 렌즈와 원화 비율은 유지한다.
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // 손 커서를 가진 모든 버튼의 호버·누름·거절 반응. 씬마다 따로 붙이지 않는다(`render/ui/UiFeedback.ts`).
    plugins: { scene: [UI_FEEDBACK_PLUGIN] },
    scene: [...spec.scenes],
  });
  installGameCanvasBackground(game);
  if (options.perf) installPerfOverlay(game);
  // Development server: the combat recipes apply live (`dev/CombatRecipeHotReload`, loaded lazily — not on the boot path).

  bootedGame = game;
  // 첫 화면을 실제로 그린 뒤 HTML 표시를 걷는다. Loading은 preload UI도 화면이고, Intro DOM은 z-index 10으로 이어진다.
  const dismissBootLoading = (): void => {
    globalThis.document.getElementById("boot-loading")?.remove();
    game.events.off(Phaser.Core.Events.POST_RENDER, onFirstSceneRendered);
  };
  const onFirstSceneRendered = (): void => {
    if (game.scene.getScenes(false).some((scene) => scene.sys.isActive()
      || (scene.sys.settings.visible && (scene.children?.list.length ?? 0) > 0))) dismissBootLoading();
  };
  game.events.on(Phaser.Core.Events.POST_RENDER, onFirstSceneRendered);
  game.events.once(Phaser.Core.Events.DESTROY, dismissBootLoading);
  const uninstallAccessibility = installAccessibilityRuntime(game);

  // 오디오는 앱 수명 싱글턴이라 가시성 구독도 여기 한 번만 건다. 씬마다 걸면
  // 전환 중 내려가는 씬의 해제가 올라온 씬의 구독을 지운다.
  const uninstallAudioVisibility = observeDocumentVisibility({
    onHidden: () => sfx.suspendForBackground(),
    onVisible: () => sfx.resumeFromBackground(),
  });

  /**
   * 음소거 단축키(M)와 설정 화면의 음소거 행이 같은 하나의 상태를 쓰게 만든다.
   *
   * 단축키만 오디오 엔진을 흔들고 저장을 건너뛰면, 설정 화면을 여는 순간 저장된 옛
   * 값이 다시 적용되어 방금 끈 소리가 되살아난다. 저장은 오디오 계층이 아니라 앱
   * 수명 소유자인 여기서 한다 — `render/audio` 는 브라우저 저장소를 모른다.
   */
  const uninstallMuteSync = sfx.onMuteToggled((muted) => {
    const settings = { ...loadPlayerSettings(), muted };
    savePlayerSettings(settings);
    applyPlayerSettings(game, settings);
    game.events.emit(PLAYER_SETTINGS_CHANGED_EVENT, settings);
  });

  /**
   * WebGL 컨텍스트 상실은 치명적 오류가 아니다 — 게임 루프는 살아 있고 브라우저가
   * 컨텍스트를 되돌려 주면 그대로 이어진다. 그래서 전면 오류 화면이 아니라 걷어낼 수
   * 있는 알림을 띄운다.
   *
   * Phaser 3.90 의 WebGLRenderer 가 `webglcontextlost` 를 직접 듣고 `preventDefault()`
   * 까지 부른 뒤 `LOSE_WEBGL`/`RESTORE_WEBGL` 을 쏜다. 그러니 WebGL 렌더러면 그 이벤트만
   * 듣는다 — DOM 리스너를 함께 달면 한 번의 상실에 알림이 두 번 뜬다. Canvas 폴백처럼
   * 렌더러가 쏘지 않는 경우에만 DOM 이벤트로 내려간다.
   * (`Phaser.Core.Events.CONTEXT_LOST` 상수는 3.90 에 남아 있지만 아무도 emit 하지 않는다.)
   */
  const contextLostCopy = {
    message: t(options.locale, "common.boot.contextLost"),
    retryLabel: t(options.locale, "common.boot.reload"),
  };
  let dismissContextLostNotice: (() => void) | null = null;
  const onContextLost = (): void => {
    dismissContextLostNotice ??= showRecoverableNotice(contextLostCopy.message, {
      retryLabel: contextLostCopy.retryLabel,
    });
  };
  const onContextRestored = (): void => {
    dismissContextLostNotice?.();
    dismissContextLostNotice = null;
  };
  // 렌더러와 캔버스는 `new Phaser.Game()` 이 아니라 부팅에서 만들어진다. 생성 직후에
  // 구독하면 아직 없는 것에 거는 셈이라 READY 를 기다린다.
  let uninstallContextLoss: () => void = () => undefined;
  const bindContextLoss = (): void => {
    uninstallContextLoss = installContextLossNotice(game, onContextLost, onContextRestored);
  };
  game.events.once(Phaser.Core.Events.READY, bindContextLoss);

  // 개발용 진단 창구. 자동화 테스트가 카메라·오브젝트 상태를 직접 읽을 수 있게 한다.
  const runtimeHost = globalThis as unknown as Record<string, unknown>;
  runtimeHost["__game"] = game;
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    uninstallFatalErrorReporter();
    uninstallAccessibility();
    uninstallAudioVisibility();
    uninstallMuteSync();
    game.events.off(Phaser.Core.Events.READY, bindContextLoss);
    uninstallContextLoss();
    onContextRestored();
    sfx.shutdown();
    if (runtimeHost["__game"] === game) delete runtimeHost["__game"];
  });
  return game;
}

function installContextLossNotice(
  hostGame: Phaser.Game,
  onLost: () => void,
  onRestored: () => void,
): () => void {
  const renderer: unknown = hostGame.renderer;
  const emitter = renderer as Partial<Phaser.Events.EventEmitter> | null;
  if (hostGame.renderer?.type === Phaser.WEBGL && typeof emitter?.on === "function") {
    const webglRenderer = renderer as Phaser.Events.EventEmitter;
    webglRenderer.on(Phaser.Renderer.Events.LOSE_WEBGL, onLost);
    webglRenderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, onRestored);
    return () => {
      webglRenderer.off(Phaser.Renderer.Events.LOSE_WEBGL, onLost);
      webglRenderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, onRestored);
    };
  }
  const canvas: HTMLCanvasElement | null = hostGame.canvas ?? null;
  if (canvas === null) return () => undefined;
  // preventDefault 를 부르지 않으면 브라우저는 컨텍스트를 되돌려 주지 않는다.
  const domLost = (event: Event): void => { event.preventDefault(); onLost(); };
  canvas.addEventListener("webglcontextlost", domLost, false);
  canvas.addEventListener("webglcontextrestored", onRestored, false);
  return () => {
    canvas.removeEventListener("webglcontextlost", domLost, false);
    canvas.removeEventListener("webglcontextrestored", onRestored, false);
  };
}
