import assert from 'node:assert/strict';
import test from 'node:test';
import { isGeminiQuotaError, withGeminiQuotaFallback } from '../dist/utils/llmClient.js';

test('recognizes Gemini quota responses by status and message', () => {
  assert.equal(isGeminiQuotaError(Object.assign(new Error('Request failed'), { status: 429 })), true);
  assert.equal(isGeminiQuotaError(new Error('Quota exceeded for requests per day')), true);
  assert.equal(isGeminiQuotaError(new Error('Invalid API key')), false);
});

test('uses the fallback only when the primary reports a quota failure', async () => {
  let fallbackCalls = 0;
  const result = await withGeminiQuotaFallback(
    async () => {
      throw Object.assign(new Error('Quota exceeded'), { status: 429 });
    },
    async () => {
      fallbackCalls += 1;
      return 'fallback result';
    },
  );

  assert.equal(result, 'fallback result');
  assert.equal(fallbackCalls, 1);
});

test('does not mask non-quota primary errors with the fallback', async () => {
  let fallbackCalls = 0;

  await assert.rejects(
    withGeminiQuotaFallback(
      async () => {
        throw new Error('Invalid API key');
      },
      async () => {
        fallbackCalls += 1;
        return 'fallback result';
      },
    ),
    /Invalid API key/,
  );
  assert.equal(fallbackCalls, 0);
});
