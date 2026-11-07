import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

function isUnreachableDatabase(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === 'P1001' || /Can't reach database server/i.test(message);
}

const basePrisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
});

export const prisma = basePrisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      try {
        return await query(args);
      } catch (error) {
        if (!isUnreachableDatabase(error)) throw error;
        console.warn('--> Database unreachable; retrying after Neon wake.');
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        return query(args);
      }
    },
  },
});
