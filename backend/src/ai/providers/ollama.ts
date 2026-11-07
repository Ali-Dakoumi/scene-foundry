import { env } from '../../config/env.js';
import { openaiChatCompletion } from '../openaiCompatible.js';
import type { AIProvider, CompletionRequest, CompletionResult } from '../types.js';

export class OllamaProvider implements AIProvider {
  readonly id = 'ollama';

  get model(): string {
    return env.OLLAMA_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(env.OLLAMA_BASE_URL && env.OLLAMA_MODEL);
  }

  async complete(request: CompletionRequest, signal: AbortSignal): Promise<CompletionResult> {
    const base = env.OLLAMA_BASE_URL.replace(/\/$/, '');
    const url = base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    return openaiChatCompletion({
      provider: this.id,
      url,
      model: env.OLLAMA_MODEL,
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      timeoutMs: Math.min(env.LLM_TIMEOUT_MS, 4_000),
      signal,
    });
  }
}
