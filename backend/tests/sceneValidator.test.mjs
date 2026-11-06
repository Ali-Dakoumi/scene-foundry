import assert from 'node:assert/strict';
import test from 'node:test';
import { renderScene } from '../dist/utils/screenshot.js';
import { validateSceneHtml } from '../dist/utils/sceneValidator.js';

const validScene = `<!DOCTYPE html>
<html lang="en">
  <head><style>html,body,canvas { width: 100%; height: 100%; margin: 0; }</style></head>
  <body>
    <canvas id="scene"></canvas>
    <script type="module">
      import * as THREE from 'https://esm.sh/three';
      import gsap from 'https://esm.sh/gsap';
      window.__libraries = { THREE, gsap };
    </script>
  </body>
</html>`;

test('accepts a structurally valid generated scene', () => {
  assert.deepEqual(validateSceneHtml(validScene), []);
});

test('rejects unsafe navigation and embedding primitives', () => {
  const unsafeScene = validScene
    .replace('<head>', '<head><base href="https://example.com">')
    .replace('window.__libraries', 'window.top.location = "https://example.com"; window.__libraries');
  const codes = validateSceneHtml(unsafeScene).map(({ code }) => code);
  assert.ok(codes.includes('FORBIDDEN_ELEMENT'));
  assert.ok(codes.includes('PARENT_NAVIGATION_FORBIDDEN'));
});

test('captures browser exceptions and missing canvases', async () => {
  const brokenScene = `<!DOCTYPE html>
  <html><head><style>body { margin: 0; }</style></head><body>
    <script type="module">
      import * as THREE from 'https://esm.sh/three';
      import gsap from 'https://esm.sh/gsap';
      window.__libraries = { THREE, gsap };
      throw new Error('diagnostic smoke test');
    </script>
  </body></html>`;
  const result = await renderScene(brokenScene);
  const codes = result.diagnostics.map(({ code }) => code);
  assert.ok(codes.includes('UNCAUGHT_EXCEPTION'));
  assert.ok(codes.includes('CANVAS_MISSING'));
  assert.ok(result.screenshotBase64.length > 1_000);
});
