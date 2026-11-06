import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getKnowledgeDirectory } from './knowledgePaths.js';

let cachedKnowledge: string | null = null;

export function getKnowledgeContext(): string {
  if (cachedKnowledge) return cachedKnowledge;

  const knowledgeDirectory = getKnowledgeDirectory();
  const rules = readFileSync(path.join(knowledgeDirectory, 'rules.md'), 'utf8');
  const snippets = readFileSync(path.join(knowledgeDirectory, 'threejs-snippets.ts'), 'utf8');
  cachedKnowledge = [
    '--- CORE RULES ---',
    rules.trim(),
    '',
    '--- SMALL STARTER EXAMPLE ---',
    snippets.trim(),
  ].join('\n');

  return cachedKnowledge;
}
