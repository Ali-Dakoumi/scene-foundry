import { Animation } from '../classes/Animation';
import { Component, type ComponentOptions } from '../classes/Component';
import { AnimationManager } from '../core/AnimationManager';

export abstract class Page extends Component {
  protected readonly anim = new AnimationManager();
  protected isVisible = false;
  private readonly pageAnimations = new Set<Animation>();

  constructor(options: ComponentOptions) {
    super(options);
  }

  override create(root: ParentNode = document): void {
    super.create(root);
    this.createAnimations();
  }

  async show(_previousTemplate?: string): Promise<void> {
    this.isVisible = true;
  }

  async hide(_nextTemplate?: string): Promise<void> {
    this.isVisible = false;
  }

  reset(): void {}
  update(_time: number): void {}

  onResize(): void {
    this.pageAnimations.forEach((animation) => animation.onResize());
  }

  override destroy(): void {
    this.pageAnimations.forEach((animation) => animation.destroy());
    this.pageAnimations.clear();
    this.anim.killAll();
    super.destroy();
  }

  protected registerAnimation<T extends Animation>(animation: T): T {
    this.pageAnimations.add(animation);
    animation.observe();
    return animation;
  }

  protected createAnimations(): void {}
}
