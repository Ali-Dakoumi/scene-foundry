import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isYouTubeHost,
  normalizeYouTubeUrl,
} from '../dist/utils/youtubeUrl.js';

test('accepts public YouTube hosts and watch, shorts, and share URLs', () => {
  assert.equal(isYouTubeHost('www.youtube.com'), true);
  assert.equal(isYouTubeHost('youtu.be'), true);
  assert.equal(isYouTubeHost('github.com'), false);
  assert.equal(
    normalizeYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12s'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.equal(
    normalizeYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
  assert.equal(
    normalizeYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  );
});

test('rejects credentialed or non-YouTube video URLs', () => {
  assert.throws(() => normalizeYouTubeUrl('http://youtube.com/watch?v=dQw4w9WgXcQ'), /HTTPS/);
  assert.throws(() => normalizeYouTubeUrl('https://user:pass@youtu.be/dQw4w9WgXcQ'), /credentials/);
  assert.throws(() => normalizeYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ'), /YouTube/);
  assert.throws(() => normalizeYouTubeUrl('https://www.youtube.com/watch?v=short'), /valid video id/);
});
