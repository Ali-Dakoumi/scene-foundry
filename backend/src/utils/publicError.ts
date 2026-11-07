import { isAuthError, isQuotaError } from '../ai/errors.js';

export function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/no credits remaining|insufficient_quota|Add credits to continue using the API/i.test(message)) {
    return 'OpenAI has no API credits. Add billing credit at https://platform.openai.com/settings/organization/billing then retry Generate.';
  }

  if (isQuotaError(error) || /All AI providers failed.*quota|rate limit/i.test(message)) {
    return 'OpenRouter free daily quota is exhausted. Retry generate so OpenAI or Gemini can answer if those keys are set, start Ollama, wait for the daily reset, or add OpenRouter credits.';
  }

  if (isAuthError(error)) {
    return 'An AI provider rejected its credentials. Check OPENROUTER_API_KEY, OPENAI_API_KEY, or optional Cloudflare/Gemini keys.';
  }

  if (/No AI provider is configured/i.test(message) || /All AI providers failed/i.test(message)) {
    return message;
  }

  if (
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P1001')
    || /Can't reach database server/i.test(message)
  ) {
    return 'The database is waking up or unreachable. Wait a few seconds and retry.';
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
