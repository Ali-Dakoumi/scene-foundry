import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderError, isQuotaError, isAuthError } from '../dist/ai/errors.js';
import { AIProviderManager } from '../dist/ai/manager.js';
import { isFreeOpenRouterModel } from '../dist/ai/providers/openRouter.js';
import { parseStructured } from '../dist/ai/json.js';
import { z } from 'zod';

function mockProvider(id, complete) {
  return {
    id,
    model: `${id}-model`,
    isConfigured: () => true,
    complete,
  };
}

test('mocked: OpenRouter daily quota skips remaining OpenRouter models', async () => {
  let altCalls = 0;
  let geminiCalls = 0;
  const manager = new AIProviderManager([
    mockProvider('openrouter', async () => {
      throw new ProviderError('openrouter rate limit or quota was reached. free-models-per-day', {
        provider: 'openrouter',
        status: 429,
        retryable: true,
        code: 'quota',
      });
    }),
    mockProvider('openrouter-alt', async () => {
      altCalls += 1;
      throw new ProviderError('should not run', { provider: 'openrouter-alt', code: 'quota' });
    }),
    mockProvider('gemini', async () => {
      geminiCalls += 1;
      return {
        text: 'pong',
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        durationMs: 20,
        retries: 0,
        fallbacks: 0,
      };
    }),
  ]);

  const result = await manager.complete({
    purpose: 'quota-skip',
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 16,
    cache: false,
  });

  assert.equal(altCalls, 0);
  assert.equal(geminiCalls, 1);
  assert.equal(result.provider, 'gemini');
});

test('mocked: OpenRouter quota falls back to OpenAI', async () => {
  const manager = new AIProviderManager([
    mockProvider('openrouter', async () => {
      throw new ProviderError('openrouter rate limit or quota was reached. free-models-per-day', {
        provider: 'openrouter',
        status: 429,
        retryable: true,
        code: 'quota',
      });
    }),
    mockProvider('openai', async () => ({
      text: 'from-openai',
      provider: 'openai',
      model: 'gpt-4o-mini',
      durationMs: 8,
      retries: 0,
      fallbacks: 0,
    })),
  ]);

  const result = await manager.complete({
    purpose: 'openai-fallback',
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 16,
    cache: false,
  });
  assert.equal(result.provider, 'openai');
  assert.equal(result.text, 'from-openai');
});

test('mocked: OpenRouter quota error falls back to the next provider', async () => {
  let secondCalls = 0;
  const manager = new AIProviderManager([
    mockProvider('openrouter', async () => {
      throw new ProviderError('quota', { provider: 'openrouter', status: 429, retryable: true, code: 'quota' });
    }),
    mockProvider('ollama', async () => {
      secondCalls += 1;
      return {
        text: '<html><body>ok</body></html>',
        provider: 'ollama',
        model: 'qwen2.5-coder:7b',
        durationMs: 12,
        retries: 0,
        fallbacks: 0,
      };
    }),
  ]);

  const result = await manager.complete({
    purpose: 'scene-builder',
    messages: [{ role: 'user', content: 'hello' }],
    maxTokens: 128,
    cache: false,
  });

  assert.equal(result.provider, 'ollama');
  assert.equal(result.fallbacks, 1);
  assert.equal(secondCalls, 1);
  assert.match(result.text, /<html/i);
});

test('mocked: invalid credentials skip retries on that provider and continue', async () => {
  let openRouterCalls = 0;
  const manager = new AIProviderManager([
    mockProvider('openrouter', async () => {
      openRouterCalls += 1;
      throw new ProviderError('bad key', { provider: 'openrouter', status: 401, code: 'auth' });
    }),
    mockProvider('ollama', async () => ({
      text: 'fallback',
      provider: 'ollama',
      model: 'qwen2.5-coder:7b',
      durationMs: 4,
      retries: 0,
      fallbacks: 0,
    })),
  ]);

  const result = await manager.complete({
    purpose: 'test',
    messages: [{ role: 'user', content: 'x' }],
    maxTokens: 16,
    cache: false,
  });
  assert.equal(openRouterCalls, 1);
  assert.equal(result.text, 'fallback');
});

test('mocked: Ollama offline is a graceful fallback miss', async () => {
  const manager = new AIProviderManager([
    mockProvider('ollama', async () => {
      throw new ProviderError('Ollama is offline or unreachable.', {
        provider: 'ollama',
        retryable: true,
        code: 'unavailable',
      });
    }),
  ]);

  await assert.rejects(
    manager.complete({
      purpose: 'test',
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 16,
      cache: false,
    }),
    /All AI providers failed/,
  );
});

test('mocked: identical successful requests are cached', async () => {
  let calls = 0;
  const manager = new AIProviderManager([
    mockProvider('openrouter', async () => {
      calls += 1;
      return {
        text: '{"ok":true}',
        provider: 'openrouter',
        model: 'openrouter/free',
        durationMs: 9,
        retries: 0,
        fallbacks: 0,
      };
    }),
  ]);
  const request = {
    purpose: 'cache',
    messages: [{ role: 'user', content: 'same' }],
    maxTokens: 32,
  };
  const first = await manager.complete(request);
  const second = await manager.complete(request);
  assert.equal(calls, 1);
  assert.equal(first.text, second.text);
  assert.equal(second.cached, true);
});

test('refuses paid OpenRouter model ids', () => {
  assert.equal(isFreeOpenRouterModel('openrouter/free'), true);
  assert.equal(isFreeOpenRouterModel('qwen/qwen3-coder:free'), true);
  assert.equal(isFreeOpenRouterModel('openai/gpt-4o'), false);
  assert.equal(isFreeOpenRouterModel('anthropic/claude-3.5-sonnet'), false);
});

test('quota and auth classifiers stay safe for public errors', () => {
  assert.equal(isQuotaError(new Error('[429 Too Many Requests] quota exceeded')), true);
  assert.equal(isAuthError(new ProviderError('nope', { provider: 'openrouter', status: 401, code: 'auth' })), true);
});

test('structured JSON parse strips fences and trailing commas', () => {
  const schema = z.object({ verdict: z.string() });
  assert.deepEqual(parseStructured('```json\n{"verdict":"REVISE"}\n```', schema), { verdict: 'REVISE' });
  assert.deepEqual(parseStructured('{"verdict":"APPROVED",}', schema), { verdict: 'APPROVED' });
});
