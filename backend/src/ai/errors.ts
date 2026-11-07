export type ProviderErrorCode = 'quota' | 'auth' | 'unavailable' | 'timeout' | 'paid' | 'invalid';

export class ProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly code: ProviderErrorCode;
  readonly provider: string;

  constructor(
    message: string,
    options: {
      provider: string;
      status?: number;
      retryable?: boolean;
      code?: ProviderErrorCode;
      cause?: unknown;
    },
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ProviderError';
    this.provider = options.provider;
    if (options.status !== undefined) this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.code = options.code ?? 'invalid';
  }
}

export function statusFromError(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}

export function isQuotaError(error: unknown): boolean {
  if (error instanceof ProviderError) return error.code === 'quota' || error.status === 429;
  const status = statusFromError(error);
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /429|too many requests|quota|rate[- ]limit/i.test(message);
}

export function isAuthError(error: unknown): boolean {
  if (error instanceof ProviderError) return error.code === 'auth';
  const status = statusFromError(error);
  if (status === 401 || status === 403) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /invalid api key|unauthorized|forbidden|incorrect api key/i.test(message);
}

export function isRetryableProviderError(error: unknown): boolean {
  if (isAuthError(error)) return false;
  if (error instanceof ProviderError) return error.retryable;
  const status = statusFromError(error);
  if (status === 408 || status === 409 || status === 429 || (typeof status === 'number' && status >= 500)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /timed? ?out|econnrefused|enotfound|unavailable|no longer available|404 not found/i.test(message);
}

/** @deprecated Use isQuotaError. Kept for existing imports. */
export const isGeminiQuotaError = isQuotaError;
