import { gsap } from 'gsap';
import { Page } from '../components/Page';
import { detection } from '../classes/Detection';
import { Scroll } from '../core/Scroll';
import { ApiClient, type GenerationEvent } from '../services/ApiClient';
import { DOM } from '../utils/DOM';

export class GeneratorPage extends Page {
  private readonly scroll = Scroll.getInstance();
  private readonly api = new ApiClient();
  private form!: HTMLFormElement;
  private generateBtn!: HTMLButtonElement;
  private buttonLabel!: HTMLSpanElement;
  private promptInput!: HTMLTextAreaElement;
  private previewFrame!: HTMLIFrameElement;
  private chatHistory!: HTMLDivElement;
  private assetUpload!: HTMLInputElement;
  private assetLabel!: HTMLElement;
  private emptyState!: HTMLDivElement;
  private previewStatus!: HTMLElement;
  private reloadBtn!: HTMLButtonElement;
  private knowledgeUrl!: HTMLInputElement;
  private ingestButton!: HTMLButtonElement;
  private knowledgeStatus!: HTMLParagraphElement;
  private knowledgeResults!: HTMLUListElement;
  private latestCode = '';
  private generating = false;
  private ingesting = false;
  private releaseGenerationScroll: (() => void) | null = null;

  constructor() {
    super({
      element: '[data-template="generator"]',
      elements: {
        workspace: '.workspace-panel',
        preview: '.preview-shell',
      },
    });
  }

  override async show(previousTemplate?: string): Promise<void> {
    await super.show(previousTemplate);
    const sections = this.selectAll<HTMLElement>('.workspace-panel, .preview-shell');
    if (detection.prefersReducedMotion()) {
      gsap.set(sections, { clearProps: 'all' });
      return;
    }

    await new Promise<void>((resolve) => {
      this.anim.registerTween(gsap.fromTo(
        sections,
        { y: 24, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.75,
          stagger: 0.08,
          ease: 'sceneFoundry',
          clearProps: 'transform,opacity',
          onComplete: resolve,
        },
      ));
    });
  }

  override async hide(nextTemplate?: string): Promise<void> {
    await super.hide(nextTemplate);
    if (detection.prefersReducedMotion()) return;

    await new Promise<void>((resolve) => {
      this.anim.registerTween(gsap.to(this.element, {
        y: -24,
        opacity: 0,
        duration: 0.4,
        ease: 'power3.inOut',
        onComplete: resolve,
      }));
    });
  }

  protected override onCreate(): void {
    this.form = this.select<HTMLFormElement>('#prompt-form');
    this.generateBtn = this.select<HTMLButtonElement>('#generate-btn');
    this.buttonLabel = this.select<HTMLSpanElement>('.button-label');
    this.promptInput = this.select<HTMLTextAreaElement>('#prompt');
    this.previewFrame = this.select<HTMLIFrameElement>('#preview-frame');
    this.chatHistory = this.select<HTMLDivElement>('#chat-history');
    this.assetUpload = this.select<HTMLInputElement>('#asset-upload');
    this.assetLabel = this.select<HTMLElement>('.asset-label-text');
    this.emptyState = this.select<HTMLDivElement>('#empty-state');
    this.previewStatus = this.select<HTMLElement>('#preview-status');
    this.reloadBtn = this.select<HTMLButtonElement>('#reload-preview');
    this.knowledgeUrl = this.select<HTMLInputElement>('#knowledge-url');
    this.ingestButton = this.select<HTMLButtonElement>('#ingest-knowledge');
    this.knowledgeStatus = this.select<HTMLParagraphElement>('#knowledge-status');
    this.knowledgeResults = this.select<HTMLUListElement>('#knowledge-results');
    const reusedPrompt = new URL(window.location.href).searchParams.get('prompt');
    if (reusedPrompt) this.promptInput.value = reusedPrompt;
  }

  protected override addEventListeners(): void {
    this.listen(this.form, 'submit', this.handleSubmit);
    this.listen(this.promptInput, 'keydown', this.handlePromptKeydown);
    this.listen(this.assetUpload, 'change', this.handleUpload);
    this.listen(this.reloadBtn, 'click', this.handleReload);
    this.listen(this.ingestButton, 'click', this.handleIngest);
    this.listen(this.knowledgeUrl, 'keydown', this.handleKnowledgeKeydown);
  }

  protected override onDestroy(): void {
    this.releaseGenerationScroll?.();
    this.releaseGenerationScroll = null;
    this.generating = false;
    this.ingesting = false;
  }

  private readonly handleSubmit = (event: Event): void => {
    event.preventDefault();
    void this.handleGenerate();
  };

  private readonly handlePromptKeydown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Enter' && (keyboardEvent.ctrlKey || keyboardEvent.metaKey)) {
      keyboardEvent.preventDefault();
      this.form.requestSubmit();
    }
  };

  private readonly handleReload = (): void => {
    if (!this.latestCode) return;
    this.previewFrame.srcdoc = '';
    requestAnimationFrame(() => {
      if (this.isCreated) this.previewFrame.srcdoc = this.latestCode;
    });
  };

  private readonly handleUpload = (event: Event): void => {
    void this.uploadAsset(event);
  };

  private readonly handleIngest = (): void => {
    void this.ingestKnowledge();
  };

  private readonly handleKnowledgeKeydown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter') return;
    keyboardEvent.preventDefault();
    void this.ingestKnowledge();
  };

  private async ingestKnowledge(): Promise<void> {
    const url = this.knowledgeUrl.value.trim();
    if (!url || this.ingesting) {
      if (!url) {
        this.knowledgeStatus.dataset.state = 'error';
        this.knowledgeStatus.textContent = 'Enter a GitHub repository or documentation URL.';
      }
      this.knowledgeUrl.focus();
      return;
    }

    this.ingesting = true;
    this.setIngestionState(true);
    this.knowledgeResults.replaceChildren();
    this.knowledgeStatus.dataset.state = 'loading';
    this.knowledgeStatus.textContent = 'Librarian is extracting and distilling code...';

    try {
      const result = await this.api.ingestKnowledge(url, undefined, this.signal);
      if (!this.isCreated) return;

      for (const item of result.items) {
        const row = document.createElement('li');
        const title = document.createElement('strong');
        const category = document.createElement('span');
        title.textContent = item.title;
        category.textContent = item.category;
        row.append(title, category);
        this.knowledgeResults.append(row);
      }
      this.knowledgeStatus.dataset.state = 'success';
      this.knowledgeStatus.textContent = `Librarian learned ${result.count} reusable pattern${result.count === 1 ? '' : 's'}.`;
      this.knowledgeUrl.value = '';
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.knowledgeStatus.dataset.state = 'error';
      this.knowledgeStatus.textContent = error instanceof Error
        ? error.message
        : 'Could not ingest this source.';
    } finally {
      this.ingesting = false;
      if (this.isCreated) this.setIngestionState(false);
    }
  }

  private async uploadAsset(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.setUploadState(true, file.name);

    try {
      const assetUrl = await this.api.uploadAsset(file, this.signal);
      if (!this.isCreated) return;

      const separator = this.promptInput.value.trim() ? '\n\n' : '';
      this.promptInput.value += `${separator}Use this asset URL: ${assetUrl}`;
      this.appendMessage('agent', 'Asset', `${file.name} uploaded and added to the brief.`);
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.appendMessage('error', 'Upload', error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      if (this.isCreated) {
        this.setUploadState(false);
        input.value = '';
      }
    }
  }

  private async handleGenerate(): Promise<void> {
    const prompt = this.promptInput.value.trim();
    if (!prompt || this.generating) return;

    this.generating = true;
    this.releaseGenerationScroll = this.scroll.lock();
    this.appendMessage('user', 'You', prompt);
    this.promptInput.value = '';
    this.setGenerating(true);

    try {
      const result = await this.api.generate(
        prompt,
        (event) => this.handleGenerationEvent(event),
        this.signal,
      );
      if (!this.isCreated) return;

      this.latestCode = result.code;
      this.previewFrame.srcdoc = result.code;
      this.previewFrame.classList.add('is-visible');
      this.emptyState.classList.add('is-hidden');
      this.reloadBtn.disabled = false;
      const hasRuntimeErrors = result.diagnostics.includes('[ERROR');
      this.previewStatus.textContent = hasRuntimeErrors
        ? 'Rendered with issues'
        : result.approved
          ? 'Scene reviewed and approved'
          : 'Best effort — review incomplete';
      this.appendMessage(
        hasRuntimeErrors || !result.approved ? 'error' : 'agent',
        hasRuntimeErrors ? 'Diagnostics' : result.approved ? 'Studio' : 'Review',
        hasRuntimeErrors
          ? this.summarizeDiagnostics(result.diagnostics)
          : result.approved
            ? 'The Critic approved the scene and runtime checks passed.'
            : result.reviewLimitReached
              ? `The scene rendered, but the Critic did not approve it after ${result.iterations} review attempts. ${result.criticFeedback}`
              : `The scene rendered, but the Critic did not approve it. ${result.criticFeedback}`,
      );
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.previewStatus.textContent = 'Generation failed';
      this.appendMessage('error', 'Error', error instanceof Error ? error.message : 'Failed to generate.');
    } finally {
      this.generating = false;
      this.releaseGenerationScroll?.();
      this.releaseGenerationScroll = null;
      if (this.isCreated) {
        this.setGenerating(false);
        this.promptInput.focus();
      }
    }
  }

  private handleGenerationEvent(event: GenerationEvent): void {
    if (!this.isCreated) return;
    if (event.type === 'project') {
      this.previewStatus.textContent = 'Project created';
      return;
    }
    if (event.type === 'status') {
      this.previewStatus.textContent = event.data.phase;
      if (event.data.diagnostics?.includes('[ERROR')) {
        this.previewStatus.textContent = 'Critic reviewing runtime issues';
      }
    }
  }

  private setGenerating(isGenerating: boolean): void {
    this.generateBtn.disabled = isGenerating;
    this.promptInput.disabled = isGenerating;
    this.assetUpload.disabled = isGenerating;
    this.generateBtn.dataset.state = isGenerating ? 'loading' : 'default';
    this.buttonLabel.textContent = isGenerating ? 'Agents working' : 'Generate scene';
    if (isGenerating) {
      this.previewStatus.textContent = 'Directing, building, and reviewing';
    }
  }

  private setUploadState(isUploading: boolean, fileName = ''): void {
    this.assetUpload.disabled = isUploading;
    this.assetLabel.textContent = isUploading ? `Uploading ${fileName}` : 'Attach asset';
  }

  private setIngestionState(isIngesting: boolean): void {
    this.knowledgeUrl.disabled = isIngesting;
    this.ingestButton.disabled = isIngesting;
    this.ingestButton.textContent = isIngesting ? 'Extracting...' : 'Ingest source';
    this.ingestButton.setAttribute('aria-busy', String(isIngesting));
  }

  private appendMessage(kind: 'user' | 'agent' | 'error', label: string, message: string): void {
    const container = DOM.create<HTMLDivElement>('div', `message message--${kind}`);
    const messageLabel = DOM.create<HTMLSpanElement>('span', 'message-label');
    const content = document.createElement('p');
    messageLabel.textContent = label;
    content.textContent = message;
    container.append(messageLabel, content);
    this.chatHistory.append(container);
    this.chatHistory.scrollTo({ top: this.chatHistory.scrollHeight, behavior: 'smooth' });
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  private summarizeDiagnostics(diagnostics: string): string {
    const errors = diagnostics
      .split('\n')
      .filter((line) => line.startsWith('[ERROR'));
    if (errors.length === 0) return 'Runtime checks passed.';
    const firstError = errors[0]?.replace(/^\[ERROR [^\]]+\]\s*/, '') ?? 'Runtime validation failed.';
    return errors.length === 1 ? firstError : `${firstError} ${errors.length - 1} more issue(s) detected.`;
  }
}
