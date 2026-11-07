export interface KnowledgeTechnique {
  title: string;
  category: string;
  summary: string;
  codeSnippet: string;
  sourceUrl: string;
}

export const MAX_RETRIEVED_TECHNIQUES = 4;
export const MAX_RETRIEVED_CONTEXT_CHARS = 8_000;

const stopWords = new Set([
  'about', 'after', 'also', 'build', 'create', 'from', 'have', 'into',
  'make', 'scene', 'that', 'their', 'this', 'with', 'your', 'when',
]);

export function getKnowledgeSearchTerms(userPrompt: string, designPlan: string): string[] {
  return [...new Set(`${userPrompt} ${designPlan}`
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/g) ?? [])]
    .filter((term) => !stopWords.has(term))
    .slice(0, 8);
}

function scoreTechnique(item: KnowledgeTechnique, terms: readonly string[]): number {
  const title = item.title.toLowerCase();
  const category = item.category.toLowerCase();
  const summary = item.summary.toLowerCase();
  const snippet = item.codeSnippet.toLowerCase();

  return terms.reduce((score, term) => (
    score
    + (title.includes(term) ? 4 : 0)
    + (category.includes(term) ? 3 : 0)
    + (summary.includes(term) ? 1 : 0)
    + (snippet.includes(term) ? 2 : 0)
  ), 0);
}

export function filterTechniquesByCategory(
  items: readonly KnowledgeTechnique[],
  categories?: readonly string[],
): KnowledgeTechnique[] {
  if (!categories || categories.length === 0) return [...items];
  const allowed = new Set(categories.map((category) => category.toLowerCase()));
  return items.filter((item) => allowed.has(item.category.toLowerCase()));
}

export function selectRelevantTechniques(
  items: readonly KnowledgeTechnique[],
  terms: readonly string[],
  limit = MAX_RETRIEVED_TECHNIQUES,
  categories?: readonly string[],
): KnowledgeTechnique[] {
  const scoped = filterTechniquesByCategory(items, categories);
  const ranked = scoped
    .map((item, index) => ({ item, index, score: scoreTechnique(item, terms) }))
    .filter(({ score }) => terms.length === 0 || score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);

  return ranked.slice(0, limit).map(({ item }) => item);
}

export function formatKnowledgeContext(
  items: readonly KnowledgeTechnique[],
  maxChars = MAX_RETRIEVED_CONTEXT_CHARS,
): string {
  const boundedItems: KnowledgeTechnique[] = [];

  for (const item of items.slice(0, MAX_RETRIEVED_TECHNIQUES)) {
    const boundedItem = {
      title: item.title.slice(0, 120),
      category: item.category.slice(0, 64),
      summary: item.summary.slice(0, 700),
      codeSnippet: item.codeSnippet.slice(0, 2_500),
      sourceUrl: item.sourceUrl.slice(0, 300),
    };
    const candidate = JSON.stringify([...boundedItems, boundedItem]);
    if (candidate.length > maxChars) break;
    boundedItems.push(boundedItem);
  }

  return JSON.stringify(boundedItems);
}
