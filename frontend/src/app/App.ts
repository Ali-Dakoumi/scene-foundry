import { Page } from '../components/Page';
import { Scroll } from '../core/Scroll';
import { GeneratorPage } from '../pages/GeneratorPage';
import { GalleryPage } from '../pages/GalleryPage';
import { DOM } from '../utils/DOM';

type PageRegistry = Map<string, Page>;

export class App {
  private readonly content: HTMLElement;
  private readonly pages: PageRegistry = new Map();
  private readonly scroll = Scroll.getInstance();
  private readonly lifecycleController = new AbortController();
  private navigationController: AbortController | null = null;
  private page: Page | null = null;
  private url = window.location.href;
  private loading = false;
  private frameId = 0;

  constructor() {
    this.content = DOM.select<HTMLElement>('#app');
    this.registerPages();
    this.createCurrentPage();
    this.addEventListeners();
    this.onResize();
    this.update(performance.now());
    void this.page?.show();
  }

  destroy(): void {
    this.navigationController?.abort();
    this.lifecycleController.abort();
    cancelAnimationFrame(this.frameId);
    this.page?.destroy();
    this.page = null;
  }

  async navigate(url: string, push = true): Promise<void> {
    const destination = new URL(url, window.location.href);
    if (this.loading || destination.href === this.url) return;

    this.loading = true;
    document.body.style.pointerEvents = 'none';
    this.navigationController?.abort();
    this.navigationController = new AbortController();

    try {
      const response = await fetch(destination.href, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html' },
        signal: this.navigationController.signal,
      });
      if (!response.ok) throw new Error(`Navigation failed with status ${response.status}.`);
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextPage = html.querySelector<HTMLElement>('#app > [data-template]');
      if (!nextPage) throw new Error('Fetched document has no #app > [data-template] page.');

      const nextTemplate = nextPage.dataset.template;
      if (!nextTemplate || !this.pages.has(nextTemplate)) {
        throw new Error(`No registered page for template '${nextTemplate ?? 'unknown'}'.`);
      }

      const previousTemplate = this.content.firstElementChild instanceof HTMLElement
        ? this.content.firstElementChild.dataset.template
        : undefined;
      await this.page?.hide(nextTemplate);
      this.page?.destroy();

      document.title = html.title || document.title;
      const importedPage = document.importNode(nextPage, true);
      this.content.replaceChildren(importedPage);

      if (push) window.history.pushState({}, document.title, destination.href);
      this.url = destination.href;
      this.page = this.pages.get(nextTemplate) ?? null;
      this.page?.create(this.content);
      this.page?.reset();
      this.scroll.scrollTo(0, { immediate: true });
      await this.page?.show(previousTemplate);
      this.scroll.refresh();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Navigation failed:', error);
        window.location.assign(destination.href);
      }
    } finally {
      document.body.style.pointerEvents = '';
      this.loading = false;
    }
  }

  private registerPages(): void {
    this.pages.set('generator', new GeneratorPage());
    this.pages.set('gallery', new GalleryPage());
  }

  private createCurrentPage(): void {
    const pageElement = DOM.select<HTMLElement>('#app > [data-template]', this.content);
    const template = pageElement.dataset.template;
    if (!template) throw new Error('Initial page is missing its data-template value.');

    const page = this.pages.get(template);
    if (!page) throw new Error(`No registered page for template '${template}'.`);

    this.page = page;
    this.page.create(this.content);
  }

  private addEventListeners(): void {
    const options = { signal: this.lifecycleController.signal };
    document.addEventListener('click', this.onLinkClick, options);
    window.addEventListener('popstate', this.onPopState, options);
    window.addEventListener('resize', this.onResize, { ...options, passive: true });
    window.addEventListener('orientationchange', this.onResize, { ...options, passive: true });
  }

  private readonly onLinkClick = (event: MouseEvent): void => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a');
    if (
      !link ||
      link.origin !== window.location.origin ||
      link.target === '_blank' ||
      link.hasAttribute('download')
    ) {
      return;
    }

    const destination = new URL(link.href);
    if (destination.hash && destination.pathname === window.location.pathname) {
      event.preventDefault();
      this.scroll.scrollTo(destination.hash);
      return;
    }

    event.preventDefault();
    void this.navigate(destination.href);
  };

  private readonly onPopState = (): void => {
    void this.navigate(window.location.href, false);
  };

  private readonly onResize = (): void => {
    requestAnimationFrame(() => {
      this.page?.onResize();
      this.scroll.refresh();
    });
  };

  private readonly update = (time: number): void => {
    this.page?.update(time);
    this.frameId = requestAnimationFrame(this.update);
  };
}
