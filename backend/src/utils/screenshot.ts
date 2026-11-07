import type { Browser, Page } from 'puppeteer';
import { launchSceneBrowser } from './browser.js';
import type { SceneDiagnostic, SceneRenderMode } from './sceneValidator.js';

export type { SceneDiagnostic };

export interface SceneRenderResult {
  screenshotBase64: string;
  diagnostics: SceneDiagnostic[];
}

export async function renderScene(htmlContent: string, renderMode: SceneRenderMode = 'dom'): Promise<SceneRenderResult> {
  let browser: Browser | null = null;

  try {
    browser = await launchSceneBrowser();
    const page = await browser.newPage();
    const diagnostics = collectPageDiagnostics(page);
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    diagnostics.push(...await inspectRenderedScene(page, renderMode));
    const screenshotBase64 = await page.screenshot({ encoding: 'base64', type: 'png' });
    return { screenshotBase64, diagnostics: deduplicateDiagnostics(diagnostics) };
  } finally {
    await browser?.close();
  }
}

export function collectPageDiagnostics(page: Page): SceneDiagnostic[] {
  const diagnostics: SceneDiagnostic[] = [];

  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warn') return;
    diagnostics.push({
      severity: message.type() === 'error' ? 'error' : 'warning',
      code: message.type() === 'error' ? 'CONSOLE_ERROR' : 'CONSOLE_WARNING',
      message: message.text().slice(0, 500),
    });
  });
  page.on('pageerror', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push({ severity: 'error', code: 'UNCAUGHT_EXCEPTION', message: message.slice(0, 500) });
  });
  page.on('requestfailed', (request) => {
    diagnostics.push({
      severity: 'error',
      code: 'REQUEST_FAILED',
      message: `${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'request failed'}`.slice(0, 500),
    });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    diagnostics.push({
      severity: 'error',
      code: 'HTTP_ERROR',
      message: `${response.status()} ${response.url()}`.slice(0, 500),
    });
  });

  return diagnostics;
}

export async function inspectRenderedScene(page: Page, renderMode: SceneRenderMode = 'dom'): Promise<SceneDiagnostic[]> {
  const result = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const visibleCanvases = canvases.filter((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const probe = document.createElement('canvas');
    const webglAvailable = Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
    return { canvasCount: canvases.length, visibleCanvasCount: visibleCanvases.length, webglAvailable };
  });

  const diagnostics: SceneDiagnostic[] = [];
  if (renderMode === 'webgl' && !result.webglAvailable) {
    diagnostics.push({ severity: 'error', code: 'WEBGL_UNAVAILABLE', message: 'WebGL is unavailable in the render environment.' });
  }
  if (renderMode === 'webgl' && result.canvasCount === 0) {
    diagnostics.push({ severity: 'error', code: 'CANVAS_MISSING', message: 'The rendered scene did not create a canvas.' });
  } else if (renderMode === 'webgl' && result.visibleCanvasCount === 0) {
    diagnostics.push({ severity: 'error', code: 'CANVAS_HIDDEN', message: 'The generated canvas is not visible or has zero size.' });
  }
  return diagnostics;
}

function deduplicateDiagnostics(diagnostics: SceneDiagnostic[]): SceneDiagnostic[] {
  const unique = new Map<string, SceneDiagnostic>();
  for (const diagnostic of diagnostics) {
    unique.set(`${diagnostic.severity}:${diagnostic.code}:${diagnostic.message}`, diagnostic);
    if (unique.size >= 20) break;
  }
  return [...unique.values()];
}

export { deduplicateDiagnostics };
