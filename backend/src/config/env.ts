import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must be a PostgreSQL connection URL.',
  ),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  GOOGLE_API_KEY: z.string().min(1),
  GOOGLE_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  GITHUB_TOKEN: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const env = environmentSchema.parse(process.env);
