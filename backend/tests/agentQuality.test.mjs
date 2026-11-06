import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isCriticApproval,
  MAX_REVIEW_ITERATIONS,
  shouldContinueReview,
} from '../dist/utils/agentQuality.js';

test('accepts only exact approval and never approves validation errors', () => {
  assert.equal(isCriticApproval(' APPROVED\n', false), true);
  assert.equal(isCriticApproval('APPROVED, looks great', false), false);
  assert.equal(isCriticApproval('APPROVED', true), false);
});

test('continues revisions until approval or the fixed review limit', () => {
  assert.equal(shouldContinueReview('Fix the camera framing.', false, 1), true);
  assert.equal(shouldContinueReview('APPROVED', false, 1), false);
  assert.equal(shouldContinueReview('Fix the camera framing.', false, MAX_REVIEW_ITERATIONS), false);
});

