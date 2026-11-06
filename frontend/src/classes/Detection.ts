export class Detection {
  private mobile: boolean | null = null;
  private webP: boolean | null = null;
  private reducedMotion: boolean | null = null;

  isMobile(): boolean {
    this.mobile ??= window.matchMedia('(pointer: coarse)').matches;
    return this.mobile;
  }

  isWebPSupported(): boolean {
    if (this.webP === null) {
      const canvas = document.createElement('canvas');
      this.webP = canvas.getContext('2d') !== null
        && canvas.toDataURL('image/webp').startsWith('data:image/webp');
    }
    return this.webP;
  }

  prefersReducedMotion(): boolean {
    this.reducedMotion ??= window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return this.reducedMotion;
  }

  refresh(): void {
    this.mobile = null;
    this.reducedMotion = null;
  }
}

export const detection = new Detection();
