export interface GenerationStatusEvent {
  node: string;
  phase: string;
  iterations: number;
  approved?: boolean;
  feedback?: string;
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

export type GenerationEvent =
  | { type: 'project'; data: { projectId: string; threadId: string } }
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

  async uploadAsset(file: File, signal?: AbortSignal): Promise<string> {
    const formData = new FormData();
    formData.append('asset', file);
    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      body: formData,
      signal,
    });
    const payload = await response.json() as { url?: string; error?: string };
    if (!response.ok || !payload.url) throw new Error(payload.error ?? 'Upload failed.');
    return payload.url;
  }

  async listProjects(cursor?: string, signal?: AbortSignal): Promise<ProjectPage> {
    const query = new URLSearchParams({ limit: '12' });
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(`${this.baseUrl}/api/projects?${query}`, { signal });
    const payload = await response.json() as ProjectPage & ErrorPayload;
    if (!response.ok) throw new Error(payload.error ?? payload.message ?? 'Could not load projects.');
    return payload;
  }

  async getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
    const response = await fetch(`${this.baseUrl}/api/projects/${encodeURIComponent(id)}`, { signal });
    const payload = await response.json() as ProjectDetail & ErrorPayload;
    if (!response.ok) throw new Error(payload.error ?? payload.message ?? 'Could not load the project.');
    return payload;
  }

  async ingestKnowledge(
    url: string,
    category?: string,
    signal?: AbortSignal,
  ): Promise<KnowledgeIngestionResult> {
    const response = await fetch(`${this.baseUrl}/api/knowledge/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, ...(category ? { category } : {}) }),
      signal,
    });
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
  ): Promise<GenerationCompleteEvent> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ prompt, threadId: crypto.randomUUID() }),
      signal,
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
    return { type, data: JSON.parse(data.join('\n')) as unknown };
  }
}
