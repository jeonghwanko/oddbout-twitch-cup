/** 한 수명주기에 붙은 정리 작업을 역순으로, 정확히 한 번 실행한다. */
export type Disposer = () => void;

export class DisposableBag {
  private readonly disposers: Disposer[] = [];
  private disposed = false;

  add(disposer: Disposer): Disposer {
    if (this.disposed) disposer();
    else this.disposers.push(disposer);
    return disposer;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const disposers = this.disposers.splice(0).reverse();
    const errors: unknown[] = [];
    for (const dispose of disposers) {
      try { dispose(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Lifecycle cleanup failed");
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}
