import { gsap } from 'gsap';
import { detection } from '../classes/Detection';
import { OrganicBlobRenderer } from '../classes/OrganicBlobRenderer';
import { Page } from '../components/Page';

export class BlobExperimentPage extends Page {
  private canvas!: HTMLCanvasElement;
  private status!: HTMLParagraphElement;
  private renderer: OrganicBlobRenderer | null = null;

  constructor() {
    super({ element: '[data-template="blob-experiment"]' });
  }

  override async show(previousTemplate?: string): Promise<void> {
    await super.show(previousTemplate);
    if (detection.prefersReducedMotion()) return;

    this.anim.registerTween(gsap.fromTo(
      this.selectAll<HTMLElement>('.blob-copy > *, .blob-stage'),
      { opacity: 0, y: 18 },
      {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.07,
        ease: 'power3.out',
        clearProps: 'opacity,transform',
      },
    ));
  }

  override async hide(nextTemplate?: string): Promise<void> {
    await super.hide(nextTemplate);
    if (detection.prefersReducedMotion()) return;

    await new Promise<void>((resolve) => {
      this.anim.registerTween(gsap.to(this.element, {
        opacity: 0,
        duration: 0.25,
        ease: 'power2.inOut',
        onComplete: resolve,
      }));
    });
  }

  override update(time: number): void {
    if (this.isVisible) this.renderer?.update(time, detection.prefersReducedMotion());
  }

  override onResize(): void {
    super.onResize();
    this.renderer?.resize();
  }

  protected override onCreate(): void {
    this.canvas = this.select<HTMLCanvasElement>('.blob-canvas');
    this.status = this.select<HTMLParagraphElement>('.blob-status');

    try {
      this.renderer = new OrganicBlobRenderer(this.canvas);
      this.status.textContent = 'Move your pointer across the form.';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'WebGL could not start.';
      this.status.textContent = `This experiment needs WebGL: ${message}`;
      this.canvas.hidden = true;
    }
  }

  protected override addEventListeners(): void {
    this.listen(this.canvas, 'pointermove', this.handlePointerMove);
    this.listen(this.canvas, 'pointerleave', this.handlePointerLeave);
  }

  protected override onDestroy(): void {
    this.renderer?.destroy();
    this.renderer = null;
  }

  private readonly handlePointerMove = (event: Event): void => {
    if (!this.renderer) return;
    const pointer = event as PointerEvent;
    const bounds = this.canvas.getBoundingClientRect();
    const x = ((pointer.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = 1 - ((pointer.clientY - bounds.top) / bounds.height) * 2;
    this.renderer.setPointer(x, y);
  };

  private readonly handlePointerLeave = (): void => {
    this.renderer?.setPointer(0, 0);
  };
}
