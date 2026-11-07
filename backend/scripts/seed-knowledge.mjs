import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config({ override: true });

const categories = new Set([
  'shaders',
  'animations',
  'three-boilerplates',
  'materials',
  'lighting',
  'interaction',
  'performance',
  'rendering',
  'other',
]);

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.resolve(currentDirectory, '../../knowledge/seed/techniques.json');
const prisma = new PrismaClient();

function assertCard(card, index) {
  if (!card || typeof card !== 'object') throw new Error(`Seed item ${index} is not an object.`);
  for (const key of ['title', 'category', 'summary', 'codeSnippet', 'sourceUrl']) {
    if (typeof card[key] !== 'string' || card[key].trim().length === 0) {
      throw new Error(`Seed item ${index} is missing ${key}.`);
    }
  }
  if (!categories.has(card.category)) {
    throw new Error(`Seed item ${index} has an unsupported category: ${card.category}`);
  }
}

const cards = JSON.parse(await readFile(seedPath, 'utf8'));
if (!Array.isArray(cards) || cards.length === 0) {
  throw new Error('knowledge/seed/techniques.json must contain a non-empty array.');
}

let created = 0;
let updated = 0;

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeItem" (
      "id" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "category" TEXT NOT NULL,
      "sourceUrl" TEXT NOT NULL,
      "summary" TEXT NOT NULL,
      "codeSnippet" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "KnowledgeItem_category_createdAt_idx"
    ON "KnowledgeItem"("category", "createdAt")
  `);

  for (const [index, card] of cards.entries()) {
    assertCard(card, index);
    const data = {
      title: card.title.trim(),
      category: card.category.trim(),
      summary: card.summary.trim(),
      codeSnippet: card.codeSnippet.trim(),
      sourceUrl: card.sourceUrl.trim(),
    };
    const existing = await prisma.knowledgeItem.findFirst({
      where: { title: data.title, sourceUrl: data.sourceUrl },
      select: { id: true },
    });
    if (existing) {
      await prisma.knowledgeItem.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.knowledgeItem.create({ data });
      created += 1;
    }
  }
  console.log(`Knowledge seed complete: ${created} created, ${updated} updated, ${cards.length} total.`);
} finally {
  await prisma.$disconnect();
}
