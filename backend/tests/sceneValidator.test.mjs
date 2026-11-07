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
      const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#scene') });
      gsap.to(renderer.domElement, { opacity: 1 });
      window.__libraries = { THREE, gsap };
    </script>
  </body>
</html>`;

test('accepts a structurally valid generated scene', () => {
  assert.deepEqual(validateSceneHtml(validScene, 'webgl'), []);
});

test('accepts a DOM and GSAP scene without Three.js or canvas', () => {
  const domScene = `<!DOCTYPE html>
  <html><head><style>body { margin: 0; }</style></head><body>
    <main>Creative typography</main>
    <script type="module">
      import gsap from 'https://esm.sh/gsap';
      gsap.from('main', { opacity: 0 });
    </script>
  </body></html>`;
  assert.deepEqual(validateSceneHtml(domScene, 'dom'), []);
});

test('expects Three.js only when WebGL mode is selected', () => {
  const domOnly = validScene.replace("import * as THREE from 'https://esm.sh/three';", '').replace('THREE, ', '');
  const codes = validateSceneHtml(domOnly, 'webgl').map(({ code }) => code);
  assert.ok(codes.includes('THREE_IMPORT_MISSING'));
});

test('requires a renderer implementation in WebGL mode', () => {
  const noRenderer = validScene
    .replace("const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#scene') });", 'const renderer = { domElement: document.querySelector(\'#scene\') };');
  const codes = validateSceneHtml(noRenderer, 'webgl').map(({ code }) => code);
  assert.ok(codes.includes('WEBGL_RENDERER_MISSING'));
});

test('rejects documents that import GSAP without implementing animation code', () => {
  const noAnimation = validScene.replace('gsap.to(renderer.domElement, { opacity: 1 });', '');
  const codes = validateSceneHtml(noAnimation, 'webgl').map(({ code }) => code);
  assert.ok(codes.includes('ANIMATION_CODE_MISSING'));
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
  const result = await renderScene(brokenScene, 'webgl');
  const codes = result.diagnostics.map(({ code }) => code);
  assert.ok(codes.includes('UNCAUGHT_EXCEPTION'));
  assert.ok(codes.includes('CANVAS_MISSING'));
  assert.ok(result.screenshotBase64.length > 1_000);
});
