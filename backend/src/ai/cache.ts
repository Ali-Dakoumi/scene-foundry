import { createHash } from 'node:crypto';
import type { CompletionRequest, CompletionResult } from './types.js';

interface CacheEntry {
  expiresAt: number;
  value: CompletionResult;
}

export class CompletionCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 50,
  ) {}

  key(request: CompletionRequest): string {
    return createHash('sha256')
      .update(JSON.stringify({
        purpose: request.purpose,
        messages: request.messages,
        maxTokens: request.maxTokens,
        temperature: request.temperature ?? 0.2,
      }))
      .digest('hex');
  }

  get(request: CompletionRequest): CompletionResult | undefined {
    if (request.cache === false) return undefined;
    const key = this.key(request);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return { ...entry.value, cached: true, durationMs: 0, retries: 0, fallbacks: 0 };
  }

  set(request: CompletionRequest, value: CompletionResult): void {
    if (request.cache === false) return;
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest) this.entries.delete(oldest);
    }
    this.entries.set(this.key(request), {
      expiresAt: Date.now() + this.ttlMs,
      value: { ...value, cached: true },
    });
  }
}
