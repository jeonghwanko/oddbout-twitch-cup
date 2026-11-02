import Phaser from "phaser";
import { DisposableBag } from "../../app/DisposableBag";

/** Phaser Scene의 create→shutdown 한 회차에 외부 구독과 전역 핸들을 묶는다. */
export class SceneScope extends DisposableBag {
  /**
   * `await` 결과를 이 회차에 반영해도 되는가.
   *
   * `scene.isActive()` 를 쓰면 안 된다. Phaser 는 **일시정지도 비활성**으로 보고하므로,
   * 설정·퀘스트 기록 오버레이가 브리핑을 덮은 사이 도착한 초대장 응답이 조용히 버려진다.
   * 씬이 살아 있는 한 GameObject 도 살아 있다 — 물어야 할 것은 "돌고 있나"가 아니라
   * "이 회차가 끝났나"다.
   *
   * `this.scope` 를 그때그때 읽지 말고 `await` **앞에서** scope 를 지역 변수로 잡아 둔다.
   * 씬이 재시작되면 `create()` 가 새 scope 를 만들므로, 늦게 도착한 이전 회차의 결과가
   * 새 회차를 살아 있다고 착각해 남의 상태를 덮어쓴다.
   */
  get alive(): boolean {
    return !this.isDisposed;
  }

  on(
    emitter: Phaser.Events.EventEmitter,
    event: string | symbol,
    listener: (...args: never[]) => void,
    context?: unknown,
  ): void {
    emitter.on(event, listener, context);
    this.add(() => emitter.off(event, listener, context));
  }
}

export function createSceneScope(scene: Phaser.Scene): SceneScope {
  const scope = new SceneScope();
  const dispose = (): void => scope.dispose();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, dispose);
  scope.add(() => scene.events.off(Phaser.Scenes.Events.SHUTDOWN, dispose));
  return scope;
}
