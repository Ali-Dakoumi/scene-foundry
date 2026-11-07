import { ProviderError } from './errors.js';
import type { ChatMessage, CompletionResult, TokenUsage } from './types.js';

interface OpenAIChatOptions {
  provider: string;
  url: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  signal: AbortSignal;
}

function usageFromPayload(payload: Record<string, unknown>): TokenUsage | undefined {
  const usage = payload.usage;
  if (typeof usage !== 'object' || usage === null) return undefined;
  const record = usage as Record<string, unknown>;
  const promptTokens = typeof record.prompt_tokens === 'number' ? record.prompt_tokens : undefined;
  const completionTokens = typeof record.completion_tokens === 'number' ? record.completion_tokens : undefined;
  const totalTokens = typeof record.total_tokens === 'number'
    ? record.total_tokens
    : (promptTokens ?? 0) + (completionTokens ?? 0) || undefined;
  if (promptTokens === undefined && completionTokens === undefined) return undefined;
  return {
    ...(promptTokens !== undefined ? { promptTokens } : {}),
    ...(completionTokens !== undefined ? { completionTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function classifyHttpError(provider: string, status: number, body: string): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(`${provider} rejected the credentials.`, {
      provider,
      status,
      retryable: false,
      code: 'auth',
    });
  }
  if (status === 429) {
    const hint = body.replace(/\s+/g, ' ').slice(0, 180);
    return new ProviderError(
      hint
        ? `${provider} rate limit or quota was reached. ${hint}`
        : `${provider} rate limit or quota was reached.`,
      {
        provider,
        status,
        retryable: true,
        code: 'quota',
      },
    );
  }
  if (status === 408 || status >= 500) {
    return new ProviderError(`${provider} is temporarily unavailable.`, {
      provider,
      status,
      retryable: true,
      code: 'unavailable',
    });
  }
  const paid = /payment required|credits|upgrade|requires a paid/i.test(body);
  return new ProviderError(`${provider} request failed (${status}).`, {
    provider,
    status,
    retryable: false,
    code: paid ? 'paid' : 'invalid',
  });
}

export async function openaiChatCompletion(options: OpenAIChatOptions): Promise<CompletionResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const onParentAbort = () => controller.abort();
  options.signal.addEventListener('abort', onParentAbort, { once: true });

  try {
    const response = await fetch(options.url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        ...options.headers,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw classifyHttpError(options.provider, response.status, raw.slice(0, 400));
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new ProviderError(`${options.provider} returned a non-JSON body.`, {
        provider: options.provider,
        code: 'invalid',
      });
    }

    const choices = payload.choices;
    const first = Array.isArray(choices) ? choices[0] : undefined;
    const message = first && typeof first === 'object' && first !== null
      ? (first as { message?: { content?: unknown } }).message
      : undefined;
    const text = typeof message?.content === 'string'
      ? message.content
      : Array.isArray(message?.content)
        ? message.content.map((part) => (
          typeof part === 'string'
            ? part
            : (typeof part === 'object' && part && 'text' in part ? String((part as { text: unknown }).text) : '')
        )).join('')
        : '';

    if (!text.trim()) {
      throw new ProviderError(`${options.provider} returned an empty completion.`, {
        provider: options.provider,
        code: 'invalid',
        retryable: true,
      });
    }

    const usage = usageFromPayload(payload);
    return {
      text,
      provider: options.provider,
      model: typeof payload.model === 'string' ? payload.model : options.model,
      durationMs: Date.now() - started,
      retries: 0,
      fallbacks: 0,
      ...(usage ? { usage } : {}),
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/i.test(error.message))) {
      throw new ProviderError(`${options.provider} timed out.`, {
        provider: options.provider,
        retryable: true,
        code: 'timeout',
        cause: error,
      });
    }
    const message = error instanceof Error ? error.message : String(error);
    const offline = /ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(message);
    throw new ProviderError(
      offline ? `${options.provider} is offline or unreachable.` : `${options.provider} request failed.`,
      {
        provider: options.provider,
        retryable: offline,
        code: 'unavailable',
        cause: error,
      },
    );
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener('abort', onParentAbort);
  }
}
