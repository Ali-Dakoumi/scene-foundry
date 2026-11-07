import { env } from '../../config/env.js';
import { ProviderError } from '../errors.js';
import type { AIProvider, ChatContentPart, CompletionRequest, CompletionResult } from '../types.js';
import { contentToText } from '../types.js';

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini';

  get model(): string {
    return env.GEMINI_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(env.GOOGLE_API_KEY);
  }

  async complete(request: CompletionRequest, signal: AbortSignal): Promise<CompletionResult> {
    if (!env.GOOGLE_API_KEY) {
      throw new ProviderError('Gemini is not configured.', { provider: this.id, code: 'auth' });
    }

    const started = Date.now();
    const timeoutMs = Math.max(
      env.LLM_TIMEOUT_MS,
      request.messages.some((message) => typeof message.content !== 'string') ? 180_000 : 120_000,
    );
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combined = typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const system = request.messages
      .filter((message) => message.role === 'system')
      .map((message) => contentToText(message.content))
      .join('\n\n');
    const contents = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: geminiParts(message.content),
      }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: combined,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GOOGLE_API_KEY,
        },
        body: JSON.stringify({
          contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Respond.' }] }],
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: request.maxTokens,
          },
        }),
      });
      const raw = await response.text();
      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderError('Gemini quota was reached.', {
            provider: this.id,
            status: 429,
            retryable: true,
            code: 'quota',
          });
        }
        if (response.status === 401 || response.status === 403) {
          throw new ProviderError('Gemini rejected the credentials.', {
            provider: this.id,
            status: response.status,
            code: 'auth',
          });
        }
        throw new ProviderError(`Gemini request failed (${response.status}).`, {
          provider: this.id,
          status: response.status,
          retryable: response.status >= 500 || response.status === 404,
          code: response.status === 404 ? 'unavailable' : 'invalid',
        });
      }

      const text = textFromGeminiPayload(raw);
      if (!text) {
        throw new ProviderError('Gemini returned an empty completion.', {
          provider: this.id,
          retryable: true,
          code: 'invalid',
        });
      }
      return {
        text,
        provider: this.id,
        model: env.GEMINI_MODEL,
        durationMs: Date.now() - started,
        retries: 0,
        fallbacks: 0,
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && (error.name === 'AbortError' || /aborted|timeout/i.test(message))) {
        throw new ProviderError('Gemini timed out.', {
          provider: this.id,
          retryable: false,
          code: 'timeout',
          cause: error,
        });
      }
      if (/429|quota|rate[- ]limit/i.test(message)) {
        throw new ProviderError('Gemini quota was reached.', {
          provider: this.id,
          status: 429,
          retryable: true,
          code: 'quota',
          cause: error,
        });
      }
      throw new ProviderError('Gemini request failed.', {
        provider: this.id,
        retryable: /unavailable|404|no longer available/i.test(message),
        code: 'unavailable',
        cause: error,
      });
    }
  }
}

function geminiParts(content: CompletionRequest['messages'][number]['content']): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  if (typeof content === 'string') return [{ text: content }];
  return content.map((part: ChatContentPart) => {
    if (part.type === 'text') return { text: part.text };
    const url = part.image_url.url;
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match?.[1] || !match[2]) return { text: '' };
    return { inlineData: { mimeType: match[1], data: match[2] } };
  }).filter((part) => ('text' in part ? part.text.length > 0 : true));
}

function textFromGeminiPayload(raw: string): string {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return '';
  }
  const candidates = payload.candidates;
  const first = Array.isArray(candidates) ? candidates[0] : undefined;
  const content = first && typeof first === 'object' && first !== null
    ? (first as { content?: { parts?: Array<{ text?: string }> } }).content
    : undefined;
  const parts = content?.parts ?? [];
  return parts.map((part) => part.text ?? '').join('').trim();
}
