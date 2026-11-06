import { gsap } from 'gsap';
import { detection } from '../classes/Detection';
import { Page } from '../components/Page';
import { ApiClient, type ProjectSummary } from '../services/ApiClient';
import { DOM } from '../utils/DOM';

export class GalleryPage extends Page {
  private readonly api = new ApiClient();
  private projectGrid!: HTMLElement;
  private loadMoreButton!: HTMLButtonElement;
  private previewFrame!: HTMLIFrameElement;
  private previewEmpty!: HTMLElement;
  private previewTitle!: HTMLElement;
  private reuseLink!: HTMLAnchorElement;
  private nextCursor: string | null = null;
  private loading = false;

  constructor() {
    super({ element: '[data-template="gallery"]' });
  }

  override async show(previousTemplate?: string): Promise<void> {
    await super.show(previousTemplate);
    if (detection.prefersReducedMotion()) return;
    this.anim.registerTween(gsap.fromTo(
      this.selectAll<HTMLElement>('.gallery-sidebar, .gallery-preview'),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.65, stagger: 0.08, ease: 'sceneFoundry', clearProps: 'opacity,transform' },
    ));
  }

  override async hide(nextTemplate?: string): Promise<void> {
    await super.hide(nextTemplate);
    if (detection.prefersReducedMotion()) return;
    await new Promise<void>((resolve) => {
      this.anim.registerTween(gsap.to(this.element, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.inOut',
        onComplete: resolve,
      }));
    });
  }

  protected override onCreate(): void {
    this.projectGrid = this.select<HTMLElement>('#project-grid');
    this.loadMoreButton = this.select<HTMLButtonElement>('#load-more-projects');
    this.previewFrame = this.select<HTMLIFrameElement>('#gallery-preview-frame');
    this.previewEmpty = this.select<HTMLElement>('#gallery-empty-preview');
    this.previewTitle = this.select<HTMLElement>('#gallery-preview-title');
    this.reuseLink = this.select<HTMLAnchorElement>('#reuse-project');
    void this.loadProjects();
  }

  protected override addEventListeners(): void {
    this.listen(this.projectGrid, 'click', this.handleProjectClick);
    this.listen(this.loadMoreButton, 'click', this.handleLoadMore);
  }

  private readonly handleProjectClick = (event: Event): void => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-project-id]');
    if (!card?.dataset.projectId) return;
    void this.openProject(card.dataset.projectId, card);
  };

  private readonly handleLoadMore = (): void => {
    void this.loadProjects(this.nextCursor ?? undefined);
  };

  private async loadProjects(cursor?: string): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.loadMoreButton.disabled = true;
    this.loadMoreButton.textContent = 'Loading';

    try {
      const page = await this.api.listProjects(cursor, this.signal);
      if (!this.isCreated) return;
      if (!cursor && page.items.length === 0) this.renderEmptyGallery();
      page.items.forEach((project) => this.projectGrid.append(this.createProjectCard(project)));
      this.nextCursor = page.nextCursor;
      this.loadMoreButton.hidden = !this.nextCursor;
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.renderGalleryError(error instanceof Error ? error.message : 'Could not load projects.');
    } finally {
      this.loading = false;
      if (this.isCreated) {
        this.loadMoreButton.disabled = false;
        this.loadMoreButton.textContent = 'Load more';
      }
    }
  }

  private async openProject(id: string, card: HTMLButtonElement): Promise<void> {
    this.projectGrid.querySelectorAll('[aria-pressed="true"]').forEach((element) => element.setAttribute('aria-pressed', 'false'));
    card.setAttribute('aria-pressed', 'true');
    this.previewTitle.textContent = 'Loading project';

    try {
      const project = await this.api.getProject(id, this.signal);
      if (!this.isCreated) return;
      this.previewFrame.srcdoc = project.finalCode;
      this.previewFrame.classList.add('is-visible');
      this.previewEmpty.classList.add('is-hidden');
      this.previewTitle.textContent = this.truncate(project.prompt, 70);
      this.reuseLink.href = `/?prompt=${encodeURIComponent(project.prompt)}`;
      this.reuseLink.hidden = false;
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.previewTitle.textContent = error instanceof Error ? error.message : 'Could not open project.';
    }
  }

  private createProjectCard(project: ProjectSummary): HTMLButtonElement {
    const card = DOM.create<HTMLButtonElement>('button', 'project-card');
    card.type = 'button';
    card.dataset.projectId = project.id;
    card.setAttribute('aria-pressed', 'false');

    const date = DOM.create<HTMLTimeElement>('time', 'project-card__date');
    date.dateTime = project.createdAt;
    date.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(project.createdAt));
    const prompt = document.createElement('strong');
    prompt.textContent = this.truncate(project.prompt, 120);
    const id = DOM.create<HTMLSpanElement>('span', 'project-card__id');
    id.textContent = project.id.slice(0, 8);
    card.append(date, prompt, id);
    return card;
  }

  private renderEmptyGallery(): void {
    const message = DOM.create<HTMLParagraphElement>('p', 'gallery-notice');
    message.textContent = 'No completed scenes yet. Generate your first project to start the archive.';
    this.projectGrid.replaceChildren(message);
  }

  private renderGalleryError(messageText: string): void {
    const message = DOM.create<HTMLParagraphElement>('p', 'gallery-notice gallery-notice--error');
    message.textContent = messageText;
    this.projectGrid.replaceChildren(message);
  }

  private truncate(value: string, length: number): string {
    return value.length > length ? `${value.slice(0, length - 1).trimEnd()}…` : value;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }
}
