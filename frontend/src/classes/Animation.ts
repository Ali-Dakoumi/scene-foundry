export interface AnimationOptions {
  element: HTMLElement;
  target?: HTMLElement;
  once?: boolean;
}

export abstract class Animation {
  protected readonly element: HTMLElement;
  protected readonly target: HTMLElement;
  protected isVisible = false;
  private readonly once: boolean;
  private observer: IntersectionObserver | null = null;

  constructor({ element, target = element, once = true }: AnimationOptions) {
    this.element = element;
    this.target = target;
    this.once = once;
  }

  observe(): void {
    if (!('IntersectionObserver' in window)) {
      this.animateIn();
      return;
    }

    this.animateOut();
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !this.isVisible) {
          this.animateIn();
          if (this.once) this.observer?.unobserve(this.target);
        } else if (!entry.isIntersecting && this.isVisible && !this.once) {
          this.animateOut();
        }
      });
    });
    this.observer.observe(this.target);
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.onDestroy();
  }

  onResize(): void {}
  protected abstract animateIn(): void;
  protected abstract animateOut(): void;
  protected onDestroy(): void {}
}
