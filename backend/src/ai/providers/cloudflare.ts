import { env } from '../../config/env.js';
import { ProviderError } from '../errors.js';
import { openaiChatCompletion } from '../openaiCompatible.js';
import type { AIProvider, CompletionRequest, CompletionResult } from '../types.js';

export class CloudflareProvider implements AIProvider {
  readonly id = 'cloudflare';

  get model(): string {
    return env.CLOUDFLARE_MODEL ?? '@cf/meta/llama-3.1-8b-instruct';
  }

  isConfigured(): boolean {
    return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN);
  }

  async complete(request: CompletionRequest, signal: AbortSignal): Promise<CompletionResult> {
    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
      throw new ProviderError('Cloudflare Workers AI is not configured.', {
        provider: this.id,
        code: 'auth',
      });
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`;
    return openaiChatCompletion({
      provider: this.id,
      url,
      model: this.model,
      apiKey: env.CLOUDFLARE_API_TOKEN,
      messages: request.messages,
      maxTokens: request.maxTokens,
      temperature: request.temperature ?? 0.2,
      timeoutMs: env.LLM_TIMEOUT_MS,
      signal,
    });
  }
}
