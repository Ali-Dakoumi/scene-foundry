import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export function getKnowledgeDirectory(): string {
  const candidates = [
    path.resolve(process.cwd(), 'knowledge'),
    path.resolve(process.cwd(), '../knowledge'),
    path.resolve(currentDirectory, '../../../knowledge'),
    path.resolve(currentDirectory, '../../knowledge'),
  ];
  const directory = candidates.find((candidate) => existsSync(path.join(candidate, 'rules.md')));

  if (!directory) {
    throw new Error('Could not locate the repository knowledge directory.');
  }

  return directory;
}
