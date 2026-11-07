import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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

test('seed techniques are original, complete, and unique by title plus sourceUrl', async () => {
  const seedPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../knowledge/seed/techniques.json',
  );
  const cards = JSON.parse(await readFile(seedPath, 'utf8'));
  assert.ok(Array.isArray(cards) && cards.length >= 24);

  const keys = new Set();
  for (const [index, card] of cards.entries()) {
    assert.equal(typeof card.title, 'string', `item ${index} title`);
    assert.ok(card.title.trim().length > 0);
    assert.ok(categories.has(card.category), `item ${index} category`);
    assert.ok(card.summary.trim().length > 20);
    assert.ok(card.codeSnippet.trim().length > 10);
    assert.match(card.sourceUrl, /^(scene-foundry:seed\/|https:\/\/tympanus\.net\/codrops\/|https:\/\/github\.com\/codrops\/)/);
    assert.doesNotMatch(card.codeSnippet, /threejs-journey|bruno.?simon/i);
    const key = `${card.title}\0${card.sourceUrl}`;
    assert.equal(keys.has(key), false, `duplicate ${card.title}`);
    keys.add(key);
  }

  assert.ok(cards.some((card) => card.title === 'Semantic DOM mirrored into WebGL text'));
  assert.ok(cards.some((card) => card.title === 'Single-progress WebGL hover mask'));
  assert.ok(cards.some((card) => card.title === 'Scroll progress drives a section seam'));
  assert.ok(cards.some((card) => card.title === 'Motion personality with accessible states'));
});
