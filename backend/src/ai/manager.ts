import { env } from '../config/env.js';
import { CompletionCache } from './cache.js';
import { isAuthError, isRetryableProviderError, ProviderError } from './errors.js';
import { parseStructured } from './json.js';
import { CloudflareProvider } from './providers/cloudflare.js';
import { GeminiProvider } from './providers/gemini.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAIProvider } from './providers/openai.js';
import { isFreeOpenRouterModel, OpenRouterProvider } from './providers/openRouter.js';
import type { AIProvider, ChatMessage, CompletionRequest, CompletionResult } from './types.js';
import { hasImageContent } from './types.js';
import type { z } from 'zod';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const OPENROUTER_QUOTA_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function isOpenRouterQuotaMessage(message: string): boolean {
  return /free-models-per-day|rate limit|quota/i.test(message);
}

export class AIProviderManager {
  private readonly cache = new CompletionCache(env.AI_CACHE_TTL_MS);
  private readonly providers: AIProvider[];
  private openRouterQuotaUntil = 0;

  constructor(providers?: AIProvider[]) {
    this.providers = providers ?? buildDefaultProviders();
  }

  listConfigured(): AIProvider[] {
    return this.providers.filter((provider) => provider.isConfigured());
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const requestForCache = hasImageContent(request.messages) ? { ...request, cache: false } : request;
    const cached = this.cache.get(requestForCache);
    if (cached) {
      logUsage(cached, request.purpose, true);
      return cached;
    }

    const configured = this.listConfigured();
    if (configured.length === 0) {
      throw new Error(
        'No AI provider is configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, start Ollama, or add Cloudflare/Gemini credentials.',
      );
    }

    const controller = new AbortController();
    const failures: string[] = [];
    let fallbacks = 0;
    let skipOpenRouter = Date.now() < this.openRouterQuotaUntil;

    if (skipOpenRouter) {
      console.warn('--> Skipping OpenRouter: daily free quota cooldown is still active.');
    }

    for (const [index, provider] of configured.entries()) {
      if (skipOpenRouter && provider.id.startsWith('openrouter')) continue;
      if (index > 0) fallbacks += 1;
      const result = await this.invokeProvider(provider, request, controller.signal, fallbacks);
      if (result.ok) {
        this.cache.set(requestForCache, result.value);
        logUsage(result.value, request.purpose, false);
        return result.value;
      }
      failures.push(`${provider.id}: ${result.error}`);
      if (provider.id.startsWith('openrouter') && isOpenRouterQuotaMessage(result.error)) {
        skipOpenRouter = true;
        this.openRouterQuotaUntil = Date.now() + OPENROUTER_QUOTA_COOLDOWN_MS;
        console.warn('--> OpenRouter daily free quota hit; skipping remaining OpenRouter models.');
      }
      if (result.stopChain) break;
    }

    throw new Error(`All AI providers failed. ${failures.join(' | ')}`);
  }

  async completeJson<T>(
    schema: z.ZodType<T>,
    request: Omit<CompletionRequest, 'maxTokens'> & { maxTokens?: number; shapeHint: string },
  ): Promise<T> {
    const { shapeHint, maxTokens, messages: requestMessages, ...rest } = request;
    const messages: ChatMessage[] = [
      { role: 'system', content: shapeHint },
      ...requestMessages,
    ];
    const result = await this.complete({
      ...rest,
      messages,
      maxTokens: maxTokens ?? 900,
      cache: false,
    });
    try {
      return parseStructured(result.text, schema);
    } catch {
      const repaired = await this.complete({
        purpose: `${request.purpose}-json-repair`,
        messages: [
          { role: 'system', content: `${shapeHint}\nPrevious output was invalid JSON. Return valid JSON only.` },
          { role: 'user', content: result.text.slice(0, 4_000) },
        ],
        maxTokens: maxTokens ?? 900,
        temperature: 0,
        cache: false,
      });
      return parseStructured(repaired.text, schema);
    }
  }

  private async invokeProvider(
    provider: AIProvider,
    request: CompletionRequest,
    signal: AbortSignal,
    fallbacks: number,
  ): Promise<{ ok: true; value: CompletionResult } | { ok: false; error: string; stopChain: boolean }> {
    const maxAttempts = env.AI_MAX_RETRIES_PER_PROVIDER + 1;
    let lastError = 'unknown error';

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const value = await provider.complete(request, signal);
        return {
          ok: true,
          value: { ...value, retries: attempt, fallbacks },
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (isAuthError(error)) {
          return { ok: false, error: lastError, stopChain: false };
        }
        if (error instanceof ProviderError && (error.code === 'paid' || error.code === 'quota' || error.code === 'timeout')) {
          return { ok: false, error: lastError, stopChain: false };
        }
        const retry = attempt < maxAttempts - 1 && isRetryableProviderError(error);
        if (!retry) {
          return { ok: false, error: lastError, stopChain: false };
        }
        await sleep(250 * 3 ** attempt);
      }
    }

    return { ok: false, error: lastError, stopChain: false };
  }
}

function buildDefaultProviders(): AIProvider[] {
  const openRouter = new OpenRouterProvider(env.OPENROUTER_MODEL, 'openrouter');
  const openRouterAlt = env.OPENROUTER_FALLBACK_MODEL && isFreeOpenRouterModel(env.OPENROUTER_FALLBACK_MODEL)
    ? new OpenRouterProvider(env.OPENROUTER_FALLBACK_MODEL, 'openrouter-alt')
    : undefined;
  const ollama = new OllamaProvider();
  const cloudflare = new CloudflareProvider();
  const openai = new OpenAIProvider();
  const gemini = new GeminiProvider();

  const catalog: Record<string, AIProvider | undefined> = {
    openrouter: openRouter,
    'openrouter-alt': openRouterAlt,
    ollama,
    cloudflare,
    openai,
    gemini,
  };

  const preferred = env.AI_PROVIDER.trim().toLowerCase();
  const order = ['openrouter', 'openrouter-alt', 'ollama', 'cloudflare'];
  if (env.OPENAI_API_KEY) order.push('openai');
  if (env.GOOGLE_API_KEY || env.AI_INCLUDE_GEMINI) order.push('gemini');
  if (preferred === 'openai' && !order.includes('openai')) order.unshift('openai');
  if (preferred === 'gemini' && !order.includes('gemini')) order.unshift('gemini');
  if (preferred && preferred !== 'openrouter' && catalog[preferred]) {
    const rest = order.filter((id) => id !== preferred);
    order.splice(0, order.length, preferred, ...rest);
  }

  const seen = new Set<string>();
  const providers: AIProvider[] = [];
  for (const id of order) {
    const provider = catalog[id];
    if (!provider || seen.has(provider.id)) continue;
    seen.add(provider.id);
    providers.push(provider);
  }
  if (env.OPENAI_API_KEY && !seen.has(openai.id)) providers.push(openai);
  if ((env.GOOGLE_API_KEY || env.AI_INCLUDE_GEMINI) && !seen.has(gemini.id)) providers.push(gemini);
  return providers;
}

function logUsage(result: CompletionResult, purpose: string, fromCache: boolean): void {
  const tokens = result.usage
    ? ` tokens=${result.usage.promptTokens ?? '?'}/${result.usage.completionTokens ?? '?'}`
    : '';
  console.log(
    `--> AI ${result.provider}/${result.model} ${purpose} ${result.durationMs}ms retries=${result.retries} fallbacks=${result.fallbacks}${tokens}${fromCache ? ' cache=hit' : ''}`,
  );
}

function buildVisionProviders(): AIProvider[] {
  const vision = new OpenRouterProvider(env.OPENROUTER_VIDEO_MODEL, 'openrouter-vision');
  const visionAlt = env.OPENROUTER_VIDEO_FALLBACK_MODEL && isFreeOpenRouterModel(env.OPENROUTER_VIDEO_FALLBACK_MODEL)
    ? new OpenRouterProvider(env.OPENROUTER_VIDEO_FALLBACK_MODEL, 'openrouter-vision-alt')
    : undefined;
  return [vision, visionAlt, ...buildDefaultProviders()].filter((provider): provider is AIProvider => Boolean(provider));
}

export const ai = new AIProviderManager();
export const visionAi = new AIProviderManager(buildVisionProviders());
