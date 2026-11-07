import assert from 'node:assert/strict';
import test from 'node:test';
import { publicErrorMessage } from '../dist/utils/publicError.js';

test('explains quota errors instead of dumping the raw SDK message', () => {
  const message = publicErrorMessage(new Error('[429 Too Many Requests] quota exceeded for gemini-2.0-flash'));
  assert.match(message, /quota/i);
  assert.match(message, /OpenRouter|Ollama/i);
  assert.equal(message.includes('generativelanguage.googleapis.com'), false);
});

test('maps quota status codes to a safe message', () => {
  const message = publicErrorMessage(Object.assign(new Error('Request failed'), { status: 429 }));
  assert.match(message, /quota|Ollama|Gemini|OpenAI/i);
  assert.equal(message.includes('Request failed'), false);
});

test('explains unreachable Neon without dumping the host', () => {
  const message = publicErrorMessage(new Error("Can't reach database server at `example.neon.tech:5432`"));
  assert.match(message, /waking up|unreachable/i);
  assert.equal(message.includes('example.neon.tech'), false);
});

test('explains missing Prisma columns', () => {
  const error = Object.assign(new Error('column missing'), { code: 'P2022' });
  assert.match(publicErrorMessage(error), /prisma migrate deploy/i);
});
