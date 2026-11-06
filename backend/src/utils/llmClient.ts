import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import type { Runnable } from '@langchain/core/runnables';
import { env } from '../config/env.js';

export const primaryLlm = new ChatGoogleGenerativeAI({
  model: env.GEMINI_MODEL,
  apiKey: env.GOOGLE_API_KEY,
  temperature: 0.2,
});

export const fallbackLlm = new ChatGoogleGenerativeAI({
  model: env.GEMINI_FALLBACK_MODEL,
  apiKey: env.GOOGLE_API_KEY,
  temperature: 0.2,
});

export function isGeminiQuotaError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    if (
      ('status' in error && error.status === 429)
      || ('statusCode' in error && error.statusCode === 429)
      || ('code' in error && (error.code === 429 || error.code === '429'))
      || (
        'response' in error
        && typeof error.response === 'object'
        && error.response !== null
        && 'status' in error.response
        && error.response.status === 429
      )
    ) {
      return true;
    }

    if ('message' in error && typeof error.message === 'string') {
      return /429|too many requests|quota|rate[- ]limit/i.test(error.message);
    }
  }

  return false;
}

export async function withGeminiQuotaFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (!isGeminiQuotaError(error)) throw error;

    console.warn(`Gemini primary model quota reached; retrying with ${env.GEMINI_FALLBACK_MODEL}.`);
    return fallback();
  }
}

export function invokeWithGeminiQuotaFallback<T>(
  primary: Runnable<BaseLanguageModelInput, T>,
  fallback: Runnable<BaseLanguageModelInput, T>,
  input: BaseLanguageModelInput,
): Promise<T> {
  return withGeminiQuotaFallback(
    () => primary.invoke(input),
    () => fallback.invoke(input),
  );
}
