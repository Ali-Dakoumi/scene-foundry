import { isCriticApproval, shouldContinueReview } from './agentQuality.js';

export const criticReviewSchema = {
  verdict: ['APPROVED', 'REVISE'] as const,
};

export interface CriticReview {
  verdict: 'APPROVED' | 'REVISE';
  motion: string[];
  look: string[];
  implementation: string[];
}

export type ReviewRoute = '__end__' | 'sceneBuilder' | 'motionDirector' | 'lookDev' | 'motionCritic';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Critic response was not valid JSON.');
  }
}

export function parseCriticReview(raw: string): CriticReview {
  const parsed = extractJsonObject(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Critic response was not a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  const verdictRaw = typeof record.verdict === 'string' ? record.verdict.trim().toUpperCase() : '';
  const motion = asStringArray(record.motion);
  const look = asStringArray(record.look);
  const implementation = asStringArray(record.implementation);
  const hasNotes = motion.length + look.length + implementation.length > 0;
  const verdict: CriticReview['verdict'] = verdictRaw === 'APPROVED' && !hasNotes
    ? 'APPROVED'
    : 'REVISE';

  return { verdict, motion, look, implementation };
}

export function formatCriticFeedback(review: CriticReview, hasErrors: boolean): string {
  if (review.verdict === 'APPROVED' && !hasErrors) return 'APPROVED';

  const sections = [
    review.motion.length > 0 ? `Motion:\n- ${review.motion.join('\n- ')}` : '',
    review.look.length > 0 ? `Look:\n- ${review.look.join('\n- ')}` : '',
    review.implementation.length > 0 ? `Implementation:\n- ${review.implementation.join('\n- ')}` : '',
  ].filter(Boolean);

  return sections.join('\n\n') || 'Revise the scene to match the design, motion, and look plans.';
}

export function getNextReviewRoute(state: {
  criticFeedback: string;
  runtimeDiagnostics: string;
  iterations: number;
  criticNotes?: string;
}): ReviewRoute {
  const hasErrors = state.runtimeDiagnostics.includes('[ERROR');
  if (!shouldContinueReview(state.criticFeedback, hasErrors, state.iterations)) {
    return '__end__';
  }
  if (hasErrors) return 'sceneBuilder';

  let review: CriticReview | null = null;
  if (state.criticNotes) {
    try {
      review = parseCriticReview(state.criticNotes);
    } catch {
      review = null;
    }
  }

  const motionOnly = Boolean(review && review.motion.length > 0 && review.look.length === 0 && review.implementation.length === 0);
  const lookOnly = Boolean(review && review.look.length > 0 && review.motion.length === 0 && review.implementation.length === 0);
  if (motionOnly) return 'motionDirector';
  if (lookOnly) return 'lookDev';
  return 'sceneBuilder';
}

export { isCriticApproval };
