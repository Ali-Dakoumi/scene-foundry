import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { watchNotesToCriticJson, formatWatchNotesAsMarkdown } from '../dist/utils/videoAnalyst.js';
import { extractVideoFrames, writeTestClip } from '../dist/utils/videoFrames.js';
import { parseCriticReview } from '../dist/utils/criticReview.js';
import { env } from '../dist/config/env.js';

test('frame watcher turns missing motion into revisable critic JSON', () => {
  const json = watchNotesToCriticJson({
    summary: 'A still gray sphere on a dark field.',
    subjectVisible: true,
    motionDetected: false,
    timeline: [{ time: '00:00', event: 'Sphere stays centered' }],
    motion: [],
    look: ['Warm key light'],
    issues: [],
    reusableTechnique: 'Keep the globe in frame.',
    snippet: 'gsap.to(globe.rotation, { y: Math.PI * 2, duration: 8, repeat: -1 });',
  }, false);
  const review = parseCriticReview(json);
  assert.equal(review.verdict, 'REVISE');
  assert.ok(review.motion.some((note) => /move/i.test(note)));
  assert.deepEqual(review.look, []);
});

test('critic approves positive observations without requesting needless revisions', () => {
  const json = watchNotesToCriticJson({
    summary: 'A moving organic form with balanced lighting.',
    subjectVisible: true,
    motionDetected: true,
    timeline: [{ time: '00:01', event: 'Surface shifts smoothly' }],
    motion: ['Smooth organic deformation'],
    look: ['Teal and violet lighting'],
    issues: [],
    reusableTechnique: '',
    snippet: '',
  }, false);

  const review = parseCriticReview(json);
  assert.equal(review.verdict, 'APPROVED');
  assert.deepEqual(review.motion, []);
  assert.deepEqual(review.look, []);
  assert.deepEqual(review.implementation, []);
});

test('markdown deconstruction keeps timeline and snippet', () => {
  const markdown = formatWatchNotesAsMarkdown({
    summary: 'Orbit',
    subjectVisible: true,
    motionDetected: true,
    timeline: [{ time: '00:01', event: 'Globe travels right' }],
    motion: [],
    look: [],
    issues: [],
    reusableTechnique: 'Parent the globe to a pivot.',
    snippet: 'pivot.rotation.y += 0.01;',
  }, 'seed-clip');
  assert.match(markdown, /00:01 - Globe travels right/);
  assert.match(markdown, /pivot.rotation.y/);
});

test('ffmpeg extracts ordered JPEG frames from a clip', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-video-'));
  const clip = path.join(dir, 'clip.mp4');
  try {
    await writeTestClip(clip, 1);
    const frames = await extractVideoFrames(clip, 3);
    assert.equal(frames.length, 3);
    assert.ok(frames[0].base64.length > 100);
    assert.ok(frames[2].timeSec >= frames[0].timeSec);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('live: video agent watches sampled frames when OpenRouter is configured', async (t) => {
  if (!env.OPENROUTER_API_KEY) {
    t.skip('OPENROUTER_API_KEY is not set.');
    return;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sf-watch-'));
  const clip = path.join(dir, 'clip.mp4');
  try {
    await writeTestClip(clip, 1);
    const { watchVideoFile } = await import('../dist/utils/videoAnalyst.js');
    try {
      const notes = await watchVideoFile(clip, 'A synthetic test pattern that changes over one second.');
      assert.ok(notes.summary.length > 8);
      assert.equal(typeof notes.subjectVisible, 'boolean');
      assert.equal(typeof notes.motionDetected, 'boolean');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/quota|rate limit/i.test(message)) {
        t.skip('OpenRouter vision quota is exhausted; frame extraction still passed.');
        return;
      }
      throw error;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
