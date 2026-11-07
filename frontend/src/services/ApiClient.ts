export interface GenerationStatusEvent {
  node: string;
  phase: string;
  iterations: number;
  approved?: boolean;
  feedback?: string;
  notes?: string;
  diagnostics?: string;
}

export interface GenerationCompleteEvent {
  projectId: string;
  threadId: string;
  code: string;
  iterations: number;
  criticFeedback: string;
  diagnostics: string;
  approved: boolean;
  reviewLimitReached: boolean;
}

export interface GenerationPreviewEvent {
  projectId: string;
  code: string;
  iteration: number;
}

export type GenerationEvent =
  | { type: 'project'; data: { projectId: string; threadId: string } }
  | { type: 'preview'; data: GenerationPreviewEvent }
  | { type: 'status'; data: GenerationStatusEvent }
  | { type: 'complete'; data: GenerationCompleteEvent };

type ErrorPayload = { message?: string; error?: string };

export interface ProjectSummary {
  id: string;
  prompt: string;
  createdAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  finalCode: string;
}

export interface ProjectPage {
  items: ProjectSummary[];
  nextCursor: string | null;
}

export interface KnowledgeIngestionResult {
  success: true;
  count: number;
  items: Array<{ title: string; category: string }>;
}

export interface KnowledgeSummary {
  id: string;
  title: string;
  category: string;
  summary: string;
  codeSnippet: string;
  sourceUrl: string;
  createdAt: string;
}

export interface KnowledgePageResult {
  items: KnowledgeSummary[];
  nextCursor: string | null;
}

export interface VisualAnalysisResult {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  durationMs: number;
  videoUrl: string;
  actions: Array<{ atMs: number; type: 'hover' | 'click' | 'scroll'; target: string }>;
  report: {
    executiveSummary: string;
    pageStructure: string[];
    layout: string[];
    visualDesign: string[];
    typography: string[];
    animations: Array<{ trigger: string; observation: string; timing: string; confidence: string }>;
    interactions: Array<{ action: string; response: string }>;
    performance: string[];
    issues: string[];
    implementationGuidance: string[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isKnowledgeIngestionResult(payload: unknown): payload is KnowledgeIngestionResult {
  if (!isRecord(payload)) return false;
  const result = payload;
  return result.success === true
    && Number.isInteger(result.count)
    && Array.isArray(result.items)
    && result.items.every((item: unknown) => (
      isRecord(item)
      && typeof item.title === 'string'
      && typeof item.category === 'string'
    ));
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }

  async uploadAsset(file: File, signal?: AbortSignal): Promise<string> {
    const formData = new FormData();
    formData.append('asset', file);
    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
      signal: this.requestSignal(signal, 30_000),
    });
    const payload = await response.json() as { url?: string; error?: string };
    if (!response.ok || !payload.url) throw new Error(payload.error ?? 'Upload failed.');
    return payload.url;
  }

  async listProjects(cursor?: string, signal?: AbortSignal): Promise<ProjectPage> {
    const query = new URLSearchParams({ limit: '12' });
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(`${this.baseUrl}/api/projects?${query}`, {
      signal: this.requestSignal(signal, 15_000),
    });
    const payload = await response.json() as ProjectPage & ErrorPayload;
    if (!response.ok) throw new Error(payload.error ?? payload.message ?? 'Could not load projects.');
    return payload;
  }

  async getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(id)}`, {
      signal: this.requestSignal(signal, 15_000),
    });
    const payload = await response.json() as ProjectDetail & ErrorPayload;
    if (!response.ok) throw new Error(payload.error ?? payload.message ?? 'Could not load the project.');
    return payload;
  }

  async listKnowledge(
    cursor?: string,
    category?: string,
    signal?: AbortSignal,
  ): Promise<KnowledgePageResult> {
    const query = new URLSearchParams({ limit: '24' });
    if (cursor) query.set('cursor', cursor);
    if (category) query.set('category', category);
    const response = await fetch(`${this.baseUrl}/api/knowledge?${query}`, {
      signal: this.requestSignal(signal, 15_000),
    });
    const payload = await response.json() as KnowledgePageResult & ErrorPayload;
    if (!response.ok) throw new Error(payload.error ?? payload.message ?? 'Could not load knowledge.');
    return payload;
  }

  async ingestKnowledge(
    url: string,
    category?: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeIngestionResult> {
    return this.parseIngestionResponse(await fetch(`${this.baseUrl}/api/knowledge/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, ...(category ? { category } : {}) }),
      signal: this.requestSignal(signal, 60_000),
    }));
  }

  async ingestKnowledgeVideo(
    file: File,
    category?: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeIngestionResult> {
    const formData = new FormData();
    formData.append('video', file);
    if (category) formData.append('category', category);
    return this.parseIngestionResponse(await fetch(`${this.baseUrl}/api/knowledge/ingest`, {
      method: 'POST',
      body: formData,
      signal: this.requestSignal(signal, 180_000),
    }));
  }

  async analyseUrl(url: string, signal?: AbortSignal): Promise<VisualAnalysisResult> {
    const response = await fetch(`${this.baseUrl}/api/visual-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: this.requestSignal(signal, 180_000),
    });
    const payload = await response.json() as VisualAnalysisResult & ErrorPayload;
    if (!response.ok) throw new Error(payload.error ?? payload.message ?? 'Visual analysis failed.');
    return { ...payload, videoUrl: new URL(payload.videoUrl, this.baseUrl).toString() };
  }

  private async parseIngestionResponse(response: Response): Promise<KnowledgeIngestionResult> {
    const payload: unknown = await response.json();
    if (!response.ok) {
      const errorMessage = isRecord(payload)
        ? (typeof payload.error === 'string' ? payload.error : payload.message)
        : undefined;
      throw new Error(typeof errorMessage === 'string' ? errorMessage : 'Could not ingest this source.');
    }
    if (!isKnowledgeIngestionResult(payload)) {
      throw new Error('The knowledge ingestion endpoint returned an invalid response.');
    }
    return payload;
  }

  async generate(
    prompt: string,
    onEvent: (event: GenerationEvent) => void,
    signal?: AbortSignal,
    parentProjectId?: string,
  ): Promise<GenerationCompleteEvent> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ prompt, threadId: crypto.randomUUID(), parentProjectId }),
      signal: this.requestSignal(signal, 300_000),
    });

    if (!response.ok) {
      const payload = await response.json() as ErrorPayload;
      throw new Error(payload.error ?? payload.message ?? 'Generation request failed.');
    }
    if (!response.body) throw new Error('The generation stream is unavailable.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completed: GenerationCompleteEvent | null = null;

    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const parsed = this.parseEvent(block);
          if (!parsed) continue;
          if (parsed.type === 'error') {
            const error = parsed.data as ErrorPayload;
            throw new Error(error.message ?? error.error ?? 'Generation failed.');
          }
          const event = parsed as GenerationEvent;
          onEvent(event);
          if (event.type === 'complete') completed = event.data;
        }

        if (done) break;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }

    if (!completed) throw new Error('The generation stream closed before completion.');
    return completed;
  }

  private parseEvent(block: string): { type: string; data: unknown } | null {
    let type = 'message';
    const data: string[] = [];

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }

    if (data.length === 0) return null;
    try {
      return { type, data: JSON.parse(data.join('\n')) as unknown };
    } catch {
      throw new Error('The generation stream returned malformed data.');
    }
  }
}
