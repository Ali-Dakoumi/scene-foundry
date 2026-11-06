import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ override: true });
const prisma = new PrismaClient();

await prisma.$executeRawUnsafe('ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "parentProjectId" TEXT');
await prisma.$executeRawUnsafe(
  'CREATE INDEX IF NOT EXISTS "Project_parentProjectId_idx" ON "Project"("parentProjectId")',
);
const columns = await prisma.$queryRawUnsafe(
  'SELECT column_name FROM information_schema.columns WHERE table_name = \'Project\' ORDER BY column_name',
);
console.log('Project columns:', columns.map((row) => row.column_name).join(', '));
await prisma.$disconnect();
