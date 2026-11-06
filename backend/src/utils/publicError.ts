export function publicErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/429|Too Many Requests|quota|rate[- ]limit/i.test(message)) {
    return 'Gemini quota is exhausted for this API key and model. In backend/.env set GOOGLE_MODEL=gemini-2.5-flash (or another model with remaining quota) and restart the backend, or wait for the daily reset.';
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
