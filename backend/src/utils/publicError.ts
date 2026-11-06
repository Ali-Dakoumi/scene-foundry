import { isGeminiQuotaError } from './llmClient.js';

export function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (isGeminiQuotaError(error)) {
    return 'Gemini rate limit or quota is exhausted. Set GEMINI_MODEL and GEMINI_FALLBACK_MODEL in backend/.env to models with remaining quota, or wait for the daily reset.';
  }

  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'P2022'
  ) {
    return 'The database is missing a required column. From backend/ run: npx prisma migrate deploy';
  }

  return message || 'Generation failed.';
}
