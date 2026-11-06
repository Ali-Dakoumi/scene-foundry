import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCriticFeedback,
  getNextReviewRoute,
  parseCriticReview,
} from '../dist/utils/criticReview.js';
import { MAX_REVIEW_ITERATIONS } from '../dist/utils/agentQuality.js';

test('parses critic JSON and ignores surrounding text', () => {
  const review = parseCriticReview(`Notes
{"verdict":"REVISE","motion":["Use power2.out on the camera"],"look":[],"implementation":[]}
thanks`);
  assert.equal(review.verdict, 'REVISE');
  assert.deepEqual(review.motion, ['Use power2.out on the camera']);
  assert.deepEqual(review.look, []);
});

test('rejects APPROVED-with-notes and substring approval', () => {
  const review = parseCriticReview(JSON.stringify({
    verdict: 'APPROVED',
    motion: ['Camera pops at the end'],
    look: [],
    implementation: [],
  }));
  assert.equal(review.verdict, 'REVISE');
  assert.equal(formatCriticFeedback(review, false).includes('APPROVED'), false);

  assert.throws(() => parseCriticReview('APPROVED, looks great'));
});

test('routes look-only, motion-only, errors, and approval', () => {
  assert.equal(getNextReviewRoute({
    criticFeedback: 'APPROVED',
    runtimeDiagnostics: 'None',
    iterations: 1,
    criticNotes: JSON.stringify({ verdict: 'APPROVED', motion: [], look: [], implementation: [] }),
  }), '__end__');

  assert.equal(getNextReviewRoute({
    criticFeedback: 'Fix camera',
    runtimeDiagnostics: '[ERROR CANVAS_MISSING] missing',
    iterations: 1,
    criticNotes: JSON.stringify({ verdict: 'REVISE', motion: ['ease'], look: [], implementation: [] }),
  }), 'sceneBuilder');

  assert.equal(getNextReviewRoute({
    criticFeedback: 'Motion:\n- ease',
    runtimeDiagnostics: 'None',
    iterations: 1,
    criticNotes: JSON.stringify({ verdict: 'REVISE', motion: ['ease'], look: [], implementation: [] }),
  }), 'motionDirector');

  assert.equal(getNextReviewRoute({
    criticFeedback: 'Look:\n- warmer key',
    runtimeDiagnostics: 'None',
    iterations: 1,
    criticNotes: JSON.stringify({ verdict: 'REVISE', motion: [], look: ['warmer key'], implementation: [] }),
  }), 'lookDev');

  assert.equal(getNextReviewRoute({
    criticFeedback: 'Implementation:\n- missing listener',
    runtimeDiagnostics: 'None',
    iterations: 1,
    criticNotes: JSON.stringify({
      verdict: 'REVISE',
      motion: [],
      look: [],
      implementation: ['missing listener'],
    }),
  }), 'sceneBuilder');

  assert.equal(getNextReviewRoute({
    criticFeedback: 'Fix camera',
    runtimeDiagnostics: 'None',
    iterations: MAX_REVIEW_ITERATIONS,
    criticNotes: JSON.stringify({ verdict: 'REVISE', motion: ['ease'], look: [], implementation: [] }),
  }), '__end__');
});
