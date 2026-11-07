import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getKnowledgeDirectory } from './knowledgePaths.js';

const cachedKnowledge = new Map<'dom' | 'webgl', string>();

export function getKnowledgeContext(renderMode: 'dom' | 'webgl' = 'dom'): string {
  const cached = cachedKnowledge.get(renderMode);
  if (cached) return cached;

  const knowledgeDirectory = getKnowledgeDirectory();
  const rules = readFileSync(path.join(knowledgeDirectory, 'rules.md'), 'utf8');
  const sections = [
    '--- CORE RULES ---',
    rules.trim(),
  ];
  if (renderMode === 'webgl') {
    const snippets = readFileSync(path.join(knowledgeDirectory, 'threejs-snippets.ts'), 'utf8');
    sections.push('', '--- SMALL WEBGL STARTER EXAMPLE ---', snippets.trim());
  }
  const context = sections.join('\n').slice(0, 6_000);
  cachedKnowledge.set(renderMode, context);

  return context;
}
