import assert from 'node:assert/strict';
import test from 'node:test';
import { isGeminiQuotaError, isQuotaError, ProviderError } from '../dist/utils/llmClient.js';

test('recognizes quota responses by status and message', () => {
  assert.equal(isGeminiQuotaError(Object.assign(new Error('Request failed'), { status: 429 })), true);
  assert.equal(isQuotaError(new Error('Quota exceeded for requests per day')), true);
  assert.equal(isQuotaError(new Error('Invalid API key')), false);
});

test('auth errors are not treated as quota', () => {
  const error = new ProviderError('bad key', { provider: 'openrouter', status: 401, code: 'auth' });
  assert.equal(isQuotaError(error), false);
});
