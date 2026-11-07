import type { z } from 'zod';

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const candidates = [trimmed];
  const start = trimmed.search(/[\[{]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start >= 0 && end > start) {
    candidates.push(trimmed.slice(start, end + 1));
  }

  let lastError: unknown;
  for (const candidate of candidates) {
    for (const variant of [candidate, repairJsonText(candidate)]) {
      try {
        return JSON.parse(variant);
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Model response was not valid JSON.');
}

function repairJsonText(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null');
}

export function parseStructured<T>(raw: string, schema: z.ZodType<T>): T {
  return schema.parse(extractJson(raw));
}

export function jsonShapeHint(example: unknown): string {
  return `Return JSON only. No markdown. Shape: ${JSON.stringify(example)}`;
}
