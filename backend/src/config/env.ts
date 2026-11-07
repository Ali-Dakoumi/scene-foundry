import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ override: true });

const optionalString = z.string().optional().transform((value) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
});

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must be a PostgreSQL connection URL.',
  ),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  AI_PROVIDER: z.string().min(1).default('openrouter'),
  AI_INCLUDE_GEMINI: z.preprocess(
    (value) => value === true || value === 'true' || value === '1',
    z.boolean(),
  ).default(false),
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_MODEL: z.string().min(1).default('openrouter/free'),
  OPENROUTER_FALLBACK_MODEL: optionalString,
  OPENROUTER_VIDEO_MODEL: z.string().min(1).default('nvidia/nemotron-3.5-super-vl:free'),
  OPENROUTER_VIDEO_FALLBACK_MODEL: optionalString,
  OLLAMA_BASE_URL: z.string().min(1).default('http://localhost:11434/v1'),
  OLLAMA_MODEL: z.string().min(1).default('qwen2.5-coder:7b'),
  CLOUDFLARE_ACCOUNT_ID: optionalString,
  CLOUDFLARE_API_TOKEN: optionalString,
  CLOUDFLARE_MODEL: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  GOOGLE_API_KEY: optionalString,
  GOOGLE_MODEL: optionalString,
  GEMINI_MODEL: optionalString,
  GEMINI_FALLBACK_MODEL: optionalString,
  LLM_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(16_384).default(4_096),
  AI_MAX_RETRIES_PER_PROVIDER: z.coerce.number().int().min(0).max(3).default(2),
  AI_CACHE_TTL_MS: z.coerce.number().int().min(0).max(3_600_000).default(600_000),
  GITHUB_TOKEN: optionalString,
  PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = environmentSchema.parse(process.env);

function appendQueryParam(databaseUrl: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`).test(databaseUrl)) return databaseUrl;
  return `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}${key}=${value}`;
}

function withDatabaseTimeout(databaseUrl: string): string {
  // Long-lived Prisma works more reliably on Neon's direct host than the pooler.
  const direct = databaseUrl.replace(/(@[^/:]*?)-pooler\./, '$1.');
  return appendQueryParam(appendQueryParam(direct, 'sslmode', 'require'), 'connect_timeout', '30');
}

export const env = {
  ...parsed,
  DATABASE_URL: withDatabaseTimeout(parsed.DATABASE_URL),
  OPENAI_MODEL: parsed.OPENAI_MODEL ?? 'gpt-4o-mini',
  GEMINI_MODEL: parsed.GEMINI_MODEL ?? parsed.GOOGLE_MODEL ?? 'gemini-3.8-flash',
  GEMINI_FALLBACK_MODEL: parsed.GEMINI_FALLBACK_MODEL ?? 'gemini-3.8-flash',
};
