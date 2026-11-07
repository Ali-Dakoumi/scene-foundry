import { env } from '../../config/env.js';
import { ProviderError } from '../errors.js';
import { openaiChatCompletion } from '../openaiCompatible.js';
import type { AIProvider, CompletionRequest, CompletionResult } from '../types.js';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai';

  get model(): string {
    return env.OPENAI_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(env.OPENAI_API_KEY);
  }

  async complete(request: CompletionRequest, signal: AbortSignal): Promise<CompletionResult> {
    if (!env.OPENAI_API_KEY) {
      throw new ProviderError('OpenAI is not configured.', {
        provider: this.id,
        code: 'auth',
      });
    }

    return openaiChatCompletion({
      provider: this.id,
      url: OPENAI_URL,
      model: env.OPENAI_MODEL,
      apiKey: env.OPENAI_API_KEY,
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      timeoutMs: env.LLM_TIMEOUT_MS,
      signal,
    });
  }
}
