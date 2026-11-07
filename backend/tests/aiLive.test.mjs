import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { env } from '../dist/config/env.js';
import { prisma } from '../dist/utils/prisma.js';

after(async () => {
  await prisma.$disconnect();
});

test('live: existing Neon projects can still be retrieved', async () => {
  const count = await prisma.project.count();
  assert.equal(typeof count, 'number');
  const page = await prisma.project.findMany({
    where: { finalCode: { not: '' } },
    take: 1,
    select: { id: true, prompt: true, createdAt: true },
  });
  assert.ok(Array.isArray(page));
});

test('live: a generated HTML document can be saved and read back from Neon', async () => {
  const created = await prisma.project.create({
    data: {
      prompt: 'provider-migration-self-test',
      finalCode: '<!doctype html><html><body><canvas></canvas></body></html>',
    },
  });
  try {
    const loaded = await prisma.project.findUnique({
      where: { id: created.id },
      select: { id: true, finalCode: true },
    });
    assert.equal(loaded?.finalCode.includes('<html>'), true);
  } finally {
    await prisma.project.delete({ where: { id: created.id } });
  }
});

test('live: OpenRouter generates a valid response when a key is present', async (t) => {
  if (!env.OPENROUTER_API_KEY) {
    t.skip('OPENROUTER_API_KEY is not set; this remains a mocked-coverage path.');
    return;
  }
  const { OpenRouterProvider } = await import('../dist/ai/providers/openRouter.js');
  const provider = new OpenRouterProvider(env.OPENROUTER_MODEL);
  const result = await provider.complete({
    purpose: 'live-openrouter',
    messages: [
      { role: 'system', content: 'Reply with the single word pong.' },
      { role: 'user', content: 'ping' },
    ],
    maxTokens: 16,
    cache: false,
  }, new AbortController().signal);
  assert.ok(result.text.trim().length > 0);
  assert.equal(result.provider, 'openrouter');
});

test('live: Ollama works when the local server is available', async (t) => {
  const base = env.OLLAMA_BASE_URL.replace(/\/v1\/?$/, '');
  let healthy = false;
  try {
    const response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2_000) });
    healthy = response.ok;
  } catch {
    healthy = false;
  }
  if (!healthy) {
    t.skip('Ollama is not running on localhost:11434.');
    return;
  }
  const { OllamaProvider } = await import('../dist/ai/providers/ollama.js');
  const provider = new OllamaProvider();
  const result = await provider.complete({
    purpose: 'live-ollama',
    messages: [
      { role: 'system', content: 'Reply with the single word pong.' },
      { role: 'user', content: 'ping' },
    ],
    maxTokens: 16,
    cache: false,
  }, new AbortController().signal);
  assert.ok(result.text.trim().length > 0);
  assert.equal(result.provider, 'ollama');
});
