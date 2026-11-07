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
  private downloadBtn!: HTMLButtonElement;
  private speedControl!: HTMLInputElement;
  private hueControl!: HTMLInputElement;
  private wireframeControl!: HTMLInputElement;
  private generationLoader!: HTMLElement;
  private loaderKicker!: HTMLElement;
  private loaderTitle!: HTMLElement;
  private loaderDetail!: HTMLElement;
  private progressFill!: HTMLElement;
  private generationSteps: HTMLElement[] = [];
  private knowledgeUrl!: HTMLInputElement;
  private knowledgeVideo!: HTMLInputElement;
  private knowledgeVideoLabel!: HTMLElement;
  private ingestButton!: HTMLButtonElement;
  private knowledgeStatus!: HTMLParagraphElement;
  private knowledgeResults!: HTMLUListElement;
  private latestCode = '';
  private generating = false;
  private generationPreviewReceived = false;
  private ingesting = false;
  private releaseGenerationScroll: (() => void) | null = null;
  private parentProjectId: string | undefined;
  private highestGenerationStep = 0;

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
    this.downloadBtn = this.select<HTMLButtonElement>('#download-scene');
    this.speedControl = this.select<HTMLInputElement>('#control-speed');
    this.hueControl = this.select<HTMLInputElement>('#control-hue');
    this.wireframeControl = this.select<HTMLInputElement>('#control-wireframe');
    this.generationLoader = this.select<HTMLElement>('#generation-loader');
    this.loaderKicker = this.select<HTMLElement>('#generation-loader-kicker');
    this.loaderTitle = this.select<HTMLElement>('#generation-loader-title');
    this.loaderDetail = this.select<HTMLElement>('#generation-loader-detail');
    this.progressFill = this.select<HTMLElement>('#generation-progress-fill');
    this.generationSteps = this.selectAll<HTMLElement>('#generation-steps li');
    this.knowledgeUrl = this.select<HTMLInputElement>('#knowledge-url');
    this.knowledgeVideo = this.select<HTMLInputElement>('#knowledge-video');
    this.knowledgeVideoLabel = this.select<HTMLElement>('#knowledge-video-label');
    this.ingestButton = this.select<HTMLButtonElement>('#ingest-knowledge');
    this.knowledgeStatus = this.select<HTMLParagraphElement>('#knowledge-status');
    this.knowledgeResults = this.select<HTMLUListElement>('#knowledge-results');
    const reusedPrompt = new URL(window.location.href).searchParams.get('prompt');
    if (reusedPrompt) this.promptInput.value = reusedPrompt;
    const projectId = new URL(window.location.href).searchParams.get('project');
    if (projectId) void this.loadParentProject(projectId);
  }

  protected override addEventListeners(): void {
    this.listen(this.form, 'submit', this.handleSubmit);
    this.listen(this.promptInput, 'keydown', this.handlePromptKeydown);
    this.listen(this.assetUpload, 'change', this.handleUpload);
    this.listen(this.reloadBtn, 'click', this.handleReload);
    this.listen(this.downloadBtn, 'click', this.handleDownload);
    this.listen(this.speedControl, 'input', this.handleControlChange);
    this.listen(this.hueControl, 'input', this.handleControlChange);
    this.listen(this.wireframeControl, 'change', this.handleControlChange);
    this.listen(this.ingestButton, 'click', this.handleIngest);
    this.listen(this.knowledgeUrl, 'keydown', this.handleKnowledgeKeydown);
    this.listen(this.knowledgeVideo, 'change', this.handleKnowledgeVideo);
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

  private readonly handleDownload = (): void => {
    if (!this.latestCode) return;
    const url = URL.createObjectURL(new Blob([this.latestCode], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `scene-foundry-${new Date().toISOString().slice(0, 10)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  };

  private readonly handleControlChange = (): void => {
    this.previewFrame.contentWindow?.postMessage({
      type: 'scene-foundry:controls',
      controls: {
        speed: Number(this.speedControl.value),
        hue: Number(this.hueControl.value),
        wireframe: this.wireframeControl.checked,
      },
    }, '*');
  };

  private readonly handleUpload = (event: Event): void => {
    void this.uploadAsset(event);
  };

  private readonly handleIngest = (): void => {
    void this.ingestKnowledge();
  };

  private readonly handleKnowledgeVideo = (): void => {
    void this.ingestKnowledgeVideo();
  };

  private readonly handleKnowledgeKeydown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key !== 'Enter') return;
    keyboardEvent.preventDefault();
    void this.ingestKnowledge();
  };

  private async ingestKnowledge(): Promise<void> {
    const url = this.knowledgeUrl.value.trim();
    const video = this.knowledgeVideo.files?.[0];
    if (video) {
      await this.ingestKnowledgeVideo();
      return;
    }
    if (!url || this.ingesting) {
      if (!url) {
        this.knowledgeStatus.dataset.state = 'error';
        this.knowledgeStatus.textContent = 'Enter a GitHub, documentation, or YouTube URL, or choose a video.';
      }
      this.knowledgeUrl.focus();
      return;
    }

    this.ingesting = true;
    this.setIngestionState(true);
    this.knowledgeResults.replaceChildren();
    this.knowledgeStatus.dataset.state = 'loading';
    this.knowledgeStatus.textContent = 'Librarian is extracting motion and distilling techniques...';

    try {
      const result = await this.api.ingestKnowledge(url, undefined, this.signal);
      this.renderIngestionResult(result);
      this.knowledgeUrl.value = '';
    } catch (error) {
      this.showIngestionError(error);
    } finally {
      this.ingesting = false;
      if (this.isCreated) this.setIngestionState(false);
    }
  }

  private async ingestKnowledgeVideo(): Promise<void> {
    const file = this.knowledgeVideo.files?.[0];
    if (!file || this.ingesting) {
      if (!file && !this.knowledgeUrl.value.trim()) {
        this.knowledgeStatus.dataset.state = 'error';
        this.knowledgeStatus.textContent = 'Choose an .mp4 or .webm file, or enter a URL.';
      }
      return;
    }

    this.ingesting = true;
    this.setIngestionState(true);
    this.knowledgeResults.replaceChildren();
    this.knowledgeStatus.dataset.state = 'loading';
    this.knowledgeStatus.textContent = 'Librarian is deconstructing the video timeline...';
    this.knowledgeVideoLabel.textContent = `Reading ${file.name}`;

    try {
      const result = await this.api.ingestKnowledgeVideo(file, undefined, this.signal);
      this.renderIngestionResult(result);
      this.knowledgeUrl.value = '';
      this.knowledgeVideo.value = '';
    } catch (error) {
      this.showIngestionError(error);
    } finally {
      this.ingesting = false;
      if (this.isCreated) {
        this.setIngestionState(false);
        this.knowledgeVideoLabel.textContent = 'Or ingest .mp4 / .webm';
      }
    }
  }

  private renderIngestionResult(result: { count: number; items: Array<{ title: string; category: string }> }): void {
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
  }

  private showIngestionError(error: unknown): void {
    if (!this.isCreated || this.isAbortError(error)) return;
    this.knowledgeStatus.dataset.state = 'error';
    this.knowledgeStatus.textContent = error instanceof Error
      ? error.message
      : 'Could not ingest this source.';
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
    this.generationPreviewReceived = false;
    this.releaseGenerationScroll = this.scroll.lock();
    this.appendMessage('user', 'You', prompt);
    this.promptInput.value = '';
    this.setGenerating(true);

    try {
      const result = await this.api.generate(
        prompt,
        (event) => this.handleGenerationEvent(event),
        this.signal,
        this.parentProjectId,
      );
      if (!this.isCreated) return;

      this.renderGeneratedPreview(result.code);
      this.completeGenerationLoader();
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
      this.previewStatus.textContent = this.generationPreviewReceived
        ? 'Preview ready — final review did not complete'
        : 'Generation failed';
      if (!this.generationPreviewReceived) this.failGenerationLoader();
      this.appendMessage(
        'error',
        this.generationPreviewReceived ? 'Review' : 'Error',
        this.generationPreviewReceived
          ? `The preview is available, but final review and saving did not complete. ${error instanceof Error ? error.message : 'Generation failed.'}`
          : error instanceof Error ? error.message : 'Failed to generate.',
      );
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
      this.updateGenerationLoader(
        0,
        'Art Director',
        'Planning the visual system',
        'Translating your brief into composition, camera, materials, lighting, and a clear creative direction.',
      );
      return;
    }
    if (event.type === 'preview') {
      this.generationPreviewReceived = true;
      this.renderGeneratedPreview(event.data.code);
      this.generationLoader.hidden = true;
      this.previewStatus.textContent = event.data.iteration > 0
        ? `Revision ${event.data.iteration} rendered — visual review continues`
        : 'Preview ready — technical and visual review continue';
      this.appendMessage(
        'agent',
        'Preview',
        event.data.iteration > 0
          ? `Revision ${event.data.iteration} is live; the visual review continues.`
          : 'The first render is live; technical checks and visual review continue.',
      );
      return;
    }
    if (event.type === 'status') {
      this.previewStatus.textContent = event.data.phase;
      this.updateLoaderForNode(event.data.node, event.data.iterations);
      if (event.data.diagnostics?.includes('[ERROR')) {
        this.previewStatus.textContent = 'Technical checks found runtime issues';
      }
      if (event.data.notes) {
        const label = event.data.node === 'motionCritic'
          ? 'Motion critic'
          : event.data.node === 'technicalGate'
            ? 'Technical'
            : event.data.node === 'lookDev'
              ? 'Look Dev'
              : event.data.node === 'motionDirector'
                ? 'Motion'
                : 'Studio';
        this.appendMessage(
          event.data.diagnostics?.includes('[ERROR') ? 'error' : 'agent',
          label,
          event.data.notes,
        );
      }
    }
  }

  private renderGeneratedPreview(code: string): void {
    if (!code) return;
    const shouldLoad = code !== this.latestCode || !this.previewFrame.classList.contains('is-visible');
    this.latestCode = code;
    if (shouldLoad) this.previewFrame.srcdoc = code;
    this.previewFrame.classList.add('is-visible');
    this.emptyState.classList.add('is-hidden');
    this.reloadBtn.disabled = false;
    this.downloadBtn.disabled = false;
    this.liveControlsVisible(true);
  }

  private async loadParentProject(id: string): Promise<void> {
    try {
      const project = await this.api.getProject(id, this.signal);
      if (!this.isCreated) return;
      this.parentProjectId = project.id;
      this.latestCode = project.finalCode;
      this.previewFrame.srcdoc = project.finalCode;
      this.previewFrame.classList.add('is-visible');
      this.emptyState.classList.add('is-hidden');
      this.reloadBtn.disabled = false;
      this.downloadBtn.disabled = false;
      this.previewStatus.textContent = 'Ready to iterate';
      this.appendMessage('agent', 'Fork', 'Loaded the previous scene. Describe the change you want.');
    } catch (error) {
      if (!this.isCreated || this.isAbortError(error)) return;
      this.appendMessage('error', 'Fork', error instanceof Error ? error.message : 'Could not load the project.');
    }
  }

  private setGenerating(isGenerating: boolean): void {
    this.generateBtn.disabled = isGenerating;
    this.promptInput.disabled = isGenerating;
    this.assetUpload.disabled = isGenerating;
    this.generateBtn.dataset.state = isGenerating ? 'loading' : 'default';
    this.buttonLabel.textContent = isGenerating ? 'Agents working' : 'Generate scene';
    if (isGenerating) {
      this.startGenerationLoader();
    } else if (this.generationLoader.dataset.state === 'complete') {
      window.setTimeout(() => {
        if (!this.isCreated || this.generating) return;
        this.generationLoader.hidden = true;
        this.generationLoader.dataset.state = 'idle';
      }, detection.prefersReducedMotion() ? 0 : 850);
    }
  }

  private startGenerationLoader(): void {
    this.highestGenerationStep = 0;
    this.previewStatus.textContent = 'Preparing the agent team';
    this.generationLoader.hidden = false;
    this.generationLoader.dataset.state = 'loading';
    this.liveControlsVisible(false);
    this.updateGenerationLoader(
      0,
      'Preparing the studio',
      'Starting the agent team',
      'Opening a project and preparing a clean generation thread.',
    );
  }

  private updateLoaderForNode(node: string, iterations: number): void {
    const revision = iterations > 1 ? ` Revision ${iterations} is now in progress.` : '';
    if (node === 'artDirector') {
      this.updateGenerationLoader(1, 'Motion Director + Look Dev', 'Designing movement and atmosphere', `Defining timing, easing, materials, lighting, and visual depth.${revision}`);
      return;
    }
    if (node === 'specialists' || node === 'motionDirector' || node === 'lookDev') {
      this.updateGenerationLoader(2, 'Scene Builder', 'Writing the WebGL scene', `Building the Three.js structure, shaders, responsive behavior, and GSAP timeline.${revision}`);
      return;
    }
    if (node === 'sceneBuilder') {
      this.updateGenerationLoader(3, 'Technical gate', 'Rendering and checking the scene', 'Launching the generated page, checking WebGL, canvas visibility, requests, and runtime errors.');
      return;
    }
    if (node === 'technicalGate') {
      this.updateGenerationLoader(4, 'Motion Critic', 'Reviewing the finished motion', 'Watching the rendered clip for camera flow, easing, lighting stability, and dropped frames.');
      return;
    }
    if (node === 'motionCritic') {
      this.updateGenerationLoader(4, 'Review complete', 'Applying the critic verdict', 'Finishing the accepted scene or sending precise revision notes back to the builder.');
    }
  }

  private updateGenerationLoader(step: number, kicker: string, title: string, detail: string): void {
    this.highestGenerationStep = Math.max(this.highestGenerationStep, step);
    this.generationSteps.forEach((item, index) => {
      item.dataset.state = index < this.highestGenerationStep
        ? 'complete'
        : index === step
          ? 'active'
          : 'pending';
    });
    this.progressFill.style.transform = `scaleX(${Math.min(1, (this.highestGenerationStep + 1) / this.generationSteps.length)})`;

    if (detection.prefersReducedMotion()) {
      this.loaderKicker.textContent = kicker;
      this.loaderTitle.textContent = title;
      this.loaderDetail.textContent = detail;
      return;
    }
    const copy = [this.loaderKicker, this.loaderTitle, this.loaderDetail];
    this.anim.registerTween(gsap.to(copy, {
      opacity: 0,
      y: -6,
      duration: 0.16,
      ease: 'power2.in',
      overwrite: 'auto',
      onComplete: () => {
        if (!this.isCreated) return;
        this.loaderKicker.textContent = kicker;
        this.loaderTitle.textContent = title;
        this.loaderDetail.textContent = detail;
        this.anim.registerTween(gsap.fromTo(copy, { opacity: 0, y: 7 }, {
          opacity: 1,
          y: 0,
          duration: 0.28,
          stagger: 0.035,
          ease: 'sceneFoundry',
        }));
      },
    }));
  }

  private completeGenerationLoader(): void {
    this.generationLoader.dataset.state = 'complete';
    this.updateGenerationLoader(4, 'Scene ready', 'The world is live', 'The final code is saved. Preview controls and standalone export are now available.');
    this.generationSteps.forEach((item) => { item.dataset.state = 'complete'; });
    this.progressFill.style.transform = 'scaleX(1)';
    this.liveControlsVisible(true);
  }

  private failGenerationLoader(): void {
    this.generationLoader.hidden = false;
    this.generationLoader.dataset.state = 'error';
    this.loaderKicker.textContent = 'Generation stopped';
    this.loaderTitle.textContent = 'The agent run could not finish';
    this.loaderDetail.textContent = 'Review the error in the studio log, adjust the brief if needed, and try again.';
    this.liveControlsVisible(Boolean(this.latestCode));
  }

  private liveControlsVisible(visible: boolean): void {
    this.select<HTMLElement>('.live-controls').classList.toggle('is-hidden', !visible);
  }

  private setUploadState(isUploading: boolean, fileName = ''): void {
    this.assetUpload.disabled = isUploading;
    this.assetLabel.textContent = isUploading ? `Uploading ${fileName}` : 'Attach asset';
  }

  private setIngestionState(isIngesting: boolean): void {
    this.knowledgeUrl.disabled = isIngesting;
    this.knowledgeVideo.disabled = isIngesting;
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
