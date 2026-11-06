import assert from 'node:assert/strict';
import test from 'node:test';
import { publicErrorMessage } from '../dist/utils/publicError.js';

test('explains Gemini quota errors instead of dumping the raw SDK message', () => {
  const message = publicErrorMessage(new Error('[429 Too Many Requests] quota exceeded for gemini-3.5-flash'));
  assert.match(message, /quota/i);
  assert.match(message, /GOOGLE_MODEL/);
  assert.equal(message.includes('generativelanguage.googleapis.com'), false);
});

test('explains missing Prisma columns', () => {
  const error = Object.assign(new Error('column missing'), { code: 'P2022' });
  assert.match(publicErrorMessage(error), /prisma migrate deploy/i);
});
