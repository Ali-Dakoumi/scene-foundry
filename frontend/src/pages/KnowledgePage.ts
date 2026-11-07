import { gsap } from 'gsap';
import { detection } from '../classes/Detection';
import { Page } from '../components/Page';
import { ApiClient, type KnowledgeSummary, type VisualAnalysisResult } from '../services/ApiClient';
import { DOM } from '../utils/DOM';

export class KnowledgePage extends Page {
  private readonly api = new ApiClient();
  private grid!: HTMLElement;
  private loadMoreButton!: HTMLButtonElement;
  private previewTitle!: HTMLElement;
  private previewCategory!: HTMLElement;
  private previewEmpty!: HTMLElement;
  private previewDetail!: HTMLElement;
  private previewSummary!: HTMLElement;
  private previewSnippet!: HTMLElement;
  private previewSource!: HTMLElement;
  private filters!: HTMLElement;
  private knowledgeUrl!: HTMLInputElement;
  private ingestButton!: HTMLButtonElement;
  private knowledgeStatus!: HTMLParagraphElement;
  private knowledgeResults!: HTMLUListElement;
  private nextCursor: string | null = null;
  private category = '';
  private loading = false;
  private ingesting = false;
  private selectedId: string | null = null;
  private visualUrl!: HTMLInputElement;
  private visualButton!: HTMLButtonElement;
  private visualStatus!: HTMLParagraphElement;
  private visualVideo!: HTMLVideoElement;
  private visualReport!: HTMLElement;
  private analysing = false;
  private cards = new Map<string, KnowledgeSummary>();

  constructor() {
    super({ element: '[data-template="knowledge"]' });
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
    this.grid = this.select<HTMLElement>('#knowledge-grid');
    this.loadMoreButton = this.select<HTMLButtonElement>('#load-more-knowledge');
    this.previewTitle = this.select<HTMLElement>('#knowledge-preview-title');
    this.previewCategory = this.select<HTMLElement>('#knowledge-preview-category');
    this.previewEmpty = this.select<HTMLElement>('#knowledge-empty-preview');
    this.previewDetail = this.select<HTMLElement>('#knowledge-detail');
    this.previewSummary = this.select<HTMLElement>('#knowledge-preview-summary');
    this.previewSnippet = this.select<HTMLElement>('#knowledge-preview-snippet');
    this.previewSource = this.select<HTMLElement>('#knowledge-preview-source');
    this.filters = this.select<HTMLElement>('.knowledge-filters');
    this.knowledgeUrl = this.select<HTMLInputElement>('#knowledge-url');
    this.ingestButton = this.select<HTMLButtonElement>('#ingest-knowledge');
    this.knowledgeStatus = this.select<HTMLParagraphElement>('#knowledge-status');
    this.knowledgeResults = this.select<HTMLUListElement>('#knowledge-results');
    this.visualUrl = this.select<HTMLInputElement>('#visual-analysis-url');
    this.visualButton = this.select<HTMLButtonElement>('#run-visual-analysis');
    this.visualStatus = this.select<HTMLParagraphElement>('#visual-analysis-status');
    this.visualVideo = this.select<HTMLVideoElement>('#visual-analysis-video');
    this.visualReport = this.select<HTMLElement>('#visual-analysis-report');
    void this.loadItems();
  }

  protected override addEventListeners(): void {
    this.listen(this.grid, 'click', this.handleCardClick);
    this.listen(this.loadMoreButton, 'click', this.handleLoadMore);
    this.listen(this.filters, 'click', this.handleFilterClick);
    this.listen(this.ingestButton, 'click', this.handleIngest);
    this.listen(this.visualButton, 'click', this.handleVisualAnalysis);
  }

  private readonly handleCardClick = (event: Event): void => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-knowledge-id]');
    if (!card?.dataset.knowledgeId) return;
    const item = this.cards.get(card.dataset.knowledgeId);
    if (!item) return;
    this.showItem(item, card);
  };

  private readonly handleLoadMore = (): void => {
    void this.loadItems(this.nextCursor ?? undefined);
  };

  private readonly handleFilterClick = (event: Event): void => {
    const chip = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');
    if (!chip || chip.dataset.category === undefined) return;
    this.category = chip.dataset.category;
    this.filters.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => {
      const active = button === chip;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    this.grid.replaceChildren();
    this.cards.clear();
    this.nextCursor = null;
    this.selectedId = null;
    this.previewTitle.textContent = 'Choose a card';
    this.previewCategory.textContent = '';
    this.previewDetail.hidden = true;
    this.previewEmpty.classList.remove('is-hidden');
    void this.loadItems();
  };

  private readonly handleIngest = (): void => {
    void this.ingestKnowledge();
  };

  private readonly handleVisualAnalysis = (): void => { void this.runVisualAnalysis(); };

  private async runVisualAnalysis(): Promise<void> {
    const url = this.visualUrl.value.trim();
    if (!url || this.analysing) return;
    this.analysing = true;
    this.visualButton.disabled = true;
    this.visualUrl.disabled = true;
    this.visualStatus.textContent = 'Opening the page, recording interactions, then watching sampled frames…';
    this.visualReport.hidden = true;
    this.visualVideo.hidden = true;
    try {
      const result = await this.api.analyseUrl(url, this.signal);
      if (!this.isCreated) return;
      this.visualStatus.textContent = `Analysed “${result.title || 'Untitled page'}” in ${(result.durationMs / 1_000).toFixed(1)}s.`;
      this.visualVideo.src = result.videoUrl;
      this.visualVideo.hidden = false;
      this.renderVisualReport(result);
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.visualStatus.textContent = error instanceof Error ? error.message : 'Visual analysis failed.';
    } finally {
      this.analysing = false;
      if (this.isCreated) {
        this.visualButton.disabled = false;
        this.visualUrl.disabled = false;
      }
    }
  }

  private renderVisualReport(result: VisualAnalysisResult): void {
    const section = (title: string, items: string[]): HTMLElement => {
      const wrapper = document.createElement('section');
      const heading = document.createElement('h3'); heading.textContent = title;
      const list = document.createElement('ul');
      items.forEach((text) => { const item = document.createElement('li'); item.textContent = text; list.append(item); });
      wrapper.append(heading, list); return wrapper;
    };
    const summary = document.createElement('p'); summary.className = 'visual-analysis-report__summary'; summary.textContent = result.report.executiveSummary;
    const animations = result.report.animations.map((item) => `${item.trigger}: ${item.observation} — ${item.timing} (${item.confidence} confidence)`);
    const interactions = result.report.interactions.map((item) => `${item.action}: ${item.response}`);
    const actions = result.actions.map((item) => `${(item.atMs / 1_000).toFixed(1)}s · ${item.type} · ${item.target}`);
    this.visualReport.replaceChildren(
      summary,
      section('Page structure', result.report.pageStructure), section('Layout', result.report.layout),
      section('Visual design', result.report.visualDesign), section('Typography', result.report.typography),
      section('Observed animations', animations), section('Interaction responses', interactions),
      section('Recorded action log', actions), section('Performance observations', result.report.performance),
      section('Issues', result.report.issues), section('Reconstruction guidance', result.report.implementationGuidance),
    );
    this.visualReport.hidden = false;
  }

  private async loadItems(cursor?: string): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.loadMoreButton.disabled = true;
    this.loadMoreButton.textContent = 'Loading';

    try {
      const page = await this.api.listKnowledge(
        cursor,
        this.category || undefined,
        this.signal,
      );
      if (!this.isCreated) return;
      if (!cursor && page.items.length === 0) this.renderEmpty();
      page.items.forEach((item) => {
        this.cards.set(item.id, item);
        this.grid.append(this.createCard(item));
      });
      this.nextCursor = page.nextCursor;
      this.loadMoreButton.hidden = !this.nextCursor;
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.renderError(error instanceof Error ? error.message : 'Could not load knowledge.');
    } finally {
      this.loading = false;
      if (this.isCreated) {
        this.loadMoreButton.disabled = false;
        this.loadMoreButton.textContent = 'Load more';
      }
    }
  }

  private async ingestKnowledge(): Promise<void> {
    const url = this.knowledgeUrl.value.trim();
    if (!url || this.ingesting) return;
    this.ingesting = true;
    this.ingestButton.disabled = true;
    this.knowledgeUrl.disabled = true;
    this.knowledgeStatus.textContent = 'Ingesting source…';
    this.knowledgeResults.replaceChildren();

    try {
      const result = await this.api.ingestKnowledge(url, undefined, this.signal);
      if (!this.isCreated) return;
      this.knowledgeStatus.textContent = `Learned ${result.count} technique${result.count === 1 ? '' : 's'}.`;
      result.items.forEach((item) => {
        const row = document.createElement('li');
        row.textContent = `${item.category}: ${item.title}`;
        this.knowledgeResults.append(row);
      });
      this.knowledgeUrl.value = '';
      this.grid.replaceChildren();
      this.cards.clear();
      this.nextCursor = null;
      void this.loadItems();
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.knowledgeStatus.textContent = error instanceof Error ? error.message : 'Ingest failed.';
    } finally {
      this.ingesting = false;
      if (this.isCreated) {
        this.ingestButton.disabled = false;
        this.knowledgeUrl.disabled = false;
      }
    }
  }

  private showItem(item: KnowledgeSummary, card: HTMLButtonElement): void {
    this.grid.querySelectorAll('[aria-pressed="true"]').forEach((element) => {
      element.setAttribute('aria-pressed', 'false');
    });
    card.setAttribute('aria-pressed', 'true');
    this.selectedId = item.id;
    this.previewTitle.textContent = item.title;
    this.previewCategory.textContent = item.category;
    this.previewSummary.textContent = item.summary;
    this.previewSnippet.textContent = item.codeSnippet;
    this.previewSource.textContent = item.sourceUrl;
    this.previewEmpty.classList.add('is-hidden');
    this.previewDetail.hidden = false;
  }

  private createCard(item: KnowledgeSummary): HTMLButtonElement {
    const card = DOM.create<HTMLButtonElement>('button', 'project-card');
    card.type = 'button';
    card.dataset.knowledgeId = item.id;
    card.setAttribute('aria-pressed', String(item.id === this.selectedId));

    const category = DOM.create<HTMLSpanElement>('span', 'project-card__date');
    category.textContent = item.category;
    const title = document.createElement('strong');
    title.textContent = item.title;
    const source = DOM.create<HTMLSpanElement>('span', 'project-card__id');
    source.textContent = item.sourceUrl.replace(/^scene-foundry:seed\//, 'seed/');
    card.append(category, title, source);
    return card;
  }

  private renderEmpty(): void {
    const message = DOM.create<HTMLParagraphElement>('p', 'gallery-notice');
    message.textContent = 'No technique cards yet. Run knowledge:seed or ingest a source.';
    this.grid.replaceChildren(message);
  }

  private renderError(messageText: string): void {
    const message = DOM.create<HTMLParagraphElement>('p', 'gallery-notice gallery-notice--error');
    message.textContent = messageText;
    this.grid.replaceChildren(message);
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }
}
