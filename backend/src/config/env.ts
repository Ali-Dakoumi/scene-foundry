import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ override: true });

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must be a PostgreSQL connection URL.',
  ),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  GOOGLE_API_KEY: z.string().min(1),
  GOOGLE_MODEL: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  GEMINI_FALLBACK_MODEL: z.string().min(1).default('gemini-2.0-flash-lite'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(300_000).default(90_000),
  GITHUB_TOKEN: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = environmentSchema.parse(process.env);

export const env = {
  ...parsed,
  GEMINI_MODEL: parsed.GEMINI_MODEL ?? parsed.GOOGLE_MODEL ?? 'gemini-2.0-flash',
};
