import { env } from '../../config/env.js';
import { ProviderError } from '../errors.js';
import { openaiChatCompletion } from '../openaiCompatible.js';
import type { AIProvider, CompletionRequest, CompletionResult } from '../types.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export function isFreeOpenRouterModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'openrouter/free') return true;
  if (normalized.endsWith(':free')) return true;
  if (normalized.includes(':free')) return true;
  return false;
}

export class OpenRouterProvider implements AIProvider {
  readonly id: string;

  constructor(
    private readonly configuredModel: string,
    id = 'openrouter',
  ) {
    this.id = id;
  }

  get model(): string {
    return this.configuredModel;
  }

  isConfigured(): boolean {
    return Boolean(env.OPENROUTER_API_KEY) && isFreeOpenRouterModel(this.configuredModel);
  }

  async complete(request: CompletionRequest, signal: AbortSignal): Promise<CompletionResult> {
    if (!env.OPENROUTER_API_KEY) {
      throw new ProviderError('OpenRouter is not configured.', {
        provider: this.id,
        code: 'auth',
      });
    }
    if (!isFreeOpenRouterModel(this.configuredModel)) {
      throw new ProviderError('Refusing a paid OpenRouter model.', {
        provider: this.id,
        code: 'paid',
      });
    }

    return openaiChatCompletion({
      provider: this.id,
      url: OPENROUTER_URL,
      model: this.configuredModel,
      apiKey: env.OPENROUTER_API_KEY,
      headers: {
        'HTTP-Referer': env.FRONTEND_ORIGIN,
        'X-Title': 'Scene Foundry',
      },
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      timeoutMs: env.LLM_TIMEOUT_MS,
      signal,
    });
  }
}
