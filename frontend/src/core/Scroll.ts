import Lenis, { type ScrollToOptions } from 'lenis';
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

type ScrollTarget = string | HTMLElement | number;

export class Scroll {
  private static instance: Scroll | null = null;
  private readonly lenis: Lenis;
  private readonly tickerCallback: (time: number) => void;
  private lockCount = 0;
  private destroyed = false;

  private constructor() {
    gsap.registerPlugin(ScrollTrigger, CustomEase);
    CustomEase.create('sceneFoundry', '0.16, 1, 0.3, 1');

    this.lenis = new Lenis({
      autoRaf: false,
      duration: 1.2,
      easing: (time) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
    });
    this.lenis.on('scroll', ScrollTrigger.update);

    this.tickerCallback = (time: number): void => {
      this.lenis.raf(time * 1000);
    };
    gsap.ticker.add(this.tickerCallback);
    gsap.ticker.lagSmoothing(0);
  }

  static getInstance(): Scroll {
    Scroll.instance ??= new Scroll();
    return Scroll.instance;
  }

  stop(): void {
    if (this.destroyed) return;
    this.lockCount += 1;
    if (this.lockCount === 1) {
      this.lenis.stop();
      document.documentElement.classList.add('is-scroll-locked');
    }
  }

  start(): void {
    if (this.destroyed || this.lockCount === 0) return;
    this.lockCount -= 1;
    if (this.lockCount === 0) {
      this.lenis.start();
      document.documentElement.classList.remove('is-scroll-locked');
    }
  }

  lock(): () => void {
    this.stop();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.start();
    };
  }

  scrollTo(target: ScrollTarget, options?: ScrollToOptions): void {
    if (this.destroyed) return;
    this.lenis.scrollTo(target, options);
  }

  refresh(): void {
    if (this.destroyed) return;
    this.lenis.resize();
    ScrollTrigger.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    gsap.ticker.remove(this.tickerCallback);
    this.lenis.destroy();
    document.documentElement.classList.remove('is-scroll-locked');
    this.lockCount = 0;
    Scroll.instance = null;
  }
}
