import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterTechniquesByCategory,
  formatKnowledgeContext,
  getKnowledgeSearchTerms,
  selectRelevantTechniques,
} from '../dist/utils/knowledgeRetriever.js';

const techniques = [
  {
    title: 'Vertex shader displacement',
    category: 'shaders',
    summary: 'Displace mesh vertices with a time-based noise function.',
    codeSnippet: 'position.z += sin(position.x * 4.0 + time) * 0.1;',
    sourceUrl: 'https://example.com/shaders',
  },
  {
    title: 'Scroll-linked typography',
    category: 'animations',
    summary: 'Animate type when it enters the viewport.',
    codeSnippet: 'gsap.from(title, { y: 20, autoAlpha: 0 });',
    sourceUrl: 'https://example.com/type',
  },
  {
    title: 'Basic lighting',
    category: 'lighting',
    summary: 'Use a hemisphere light for a simple ambient setup.',
    codeSnippet: 'scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 1));',
    sourceUrl: 'https://example.com/light',
  },
];

test('extracts bounded, useful search terms from the brief and plan', () => {
  const terms = getKnowledgeSearchTerms(
    'Build a scene with animated shader noise',
    '{"lighting":"soft","materials":"glass"}',
  );
  assert.ok(terms.includes('animated'));
  assert.ok(terms.includes('shader'));
  assert.ok(terms.includes('noise'));
  assert.ok(terms.includes('lighting'));
  assert.ok(terms.length <= 8);
  assert.ok(!terms.includes('scene'));
});

test('ranks relevant techniques ahead of unrelated recent records', () => {
  const selected = selectRelevantTechniques(techniques, ['shader', 'noise']);
  assert.deepEqual(selected.map(({ title }) => title), ['Vertex shader displacement']);
});

test('caps retrieval count and formatted context size', () => {
  const largeItems = Array.from({ length: 10 }, (_, index) => ({
    title: `Shader technique ${index}`,
    category: 'shaders',
    summary: 'noise '.repeat(200),
    codeSnippet: 'position.x += time; '.repeat(300),
    sourceUrl: 'https://example.com',
  }));
  const selected = selectRelevantTechniques(largeItems, ['shader']);
  assert.equal(selected.length, 4);

  const context = formatKnowledgeContext(selected);
  assert.ok(context.length <= 8_000);
  assert.ok(Array.isArray(JSON.parse(context)));
});

test('returns an empty JSON array when no stored techniques are available', () => {
  assert.equal(formatKnowledgeContext([]), '[]');
});

test('snippet matches raise rank when title and summary are generic', () => {
  const selected = selectRelevantTechniques([
    {
      title: 'Generic helper',
      category: 'other',
      summary: 'Utility notes.',
      codeSnippet: 'const fresnel = pow(1.0 - ndotv, 3.0);',
      sourceUrl: 'https://example.com/a',
    },
    {
      title: 'Orbit camera',
      category: 'animations',
      summary: 'Move around a subject.',
      codeSnippet: 'camera.position.set(0, 0, 5);',
      sourceUrl: 'https://example.com/b',
    },
  ], ['fresnel']);
  assert.deepEqual(selected.map(({ title }) => title), ['Generic helper']);
});

test('category filter returns only animation techniques when asked', () => {
  const selected = filterTechniquesByCategory(techniques, ['animations']);
  assert.deepEqual(selected.map(({ title }) => title), ['Scroll-linked typography']);
  const ranked = selectRelevantTechniques(techniques, [], 4, ['animations']);
  assert.deepEqual(ranked.map(({ category }) => category), ['animations']);
});
