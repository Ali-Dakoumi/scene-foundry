import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Browser, Page } from 'puppeteer';
import { launchSceneBrowser } from './browser.js';
import { uploadsDirectory } from './upload.js';
import {
  collectPageDiagnostics,
  deduplicateDiagnostics,
  inspectRenderedScene,
  type SceneDiagnostic,
} from './screenshot.js';
import type { SceneRenderMode } from './sceneValidator.js';
import { getMouseSweepPosition } from './mouseSweep.js';

const require = createRequire(import.meta.url);
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder') as {
  PuppeteerScreenRecorder: new (page: Page, config?: Record<string, unknown>) => {
    start: (savePath: string) => Promise<void>;
    stop: () => Promise<void>;
  };
};

export interface SceneRecordingResult {
  videoPath: string;
  diagnostics: SceneDiagnostic[];
}

function clampDuration(durationSec: number): number {
  if (!Number.isFinite(durationSec)) return 3;
  return Math.min(8, Math.max(1, durationSec));
}

async function loadScene(page: Page, htmlContent: string): Promise<void> {
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 });
  } catch {
    // CDN keep-alives can prevent a full idle; the clip still records running motion.
  }
}

async function loadUrl(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  if (response && !response.ok()) {
    throw new Error(`Could not open experiment page (${response.status()}).`);
  }
  await page.waitForSelector('canvas', { visible: true, timeout: 15_000 });
  await new Promise((resolve) => setTimeout(resolve, 800));
}

async function sweepCanvasPointer(page: Page, durationSec: number): Promise<void> {
  const canvas = await page.$('canvas.blob-canvas, canvas.scene, canvas');
  const bounds = await canvas?.boundingBox();
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    throw new Error('The WebGL experiment canvas is not visible for pointer recording.');
  }

  const frameCount = Math.ceil(durationSec * 60);
  const start = Date.now();
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const progress = frame / frameCount;
    const point = getMouseSweepPosition(progress, bounds.width, bounds.height);
    await page.mouse.move(bounds.x + point.x, bounds.y + point.y);
    const deadline = start + (frame / 60) * 1_000;
    const delay = deadline - Date.now();
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

async function recordPage(
  load: (page: Page) => Promise<void>,
  durationSec: number,
  renderMode: SceneRenderMode,
  options: { fps: number; sweepPointer: boolean },
): Promise<SceneRecordingResult> {
  let browser: Browser | null = null;
  let recorder: InstanceType<typeof PuppeteerScreenRecorder> | null = null;
  const duration = clampDuration(durationSec);

  try {
    await mkdir(uploadsDirectory, { recursive: true });
    const videoPath = path.join(uploadsDirectory, `${randomUUID()}.mp4`);
    browser = await launchSceneBrowser();
    const page = await browser.newPage();
    const diagnostics = collectPageDiagnostics(page);
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await load(page);

    recorder = new PuppeteerScreenRecorder(page, {
      followNewTab: false,
      fps: options.fps,
      videoFrame: { width: 1280, height: 720 },
      aspectRatio: '16:9',
      videoCodec: 'libx264',
      videoPreset: 'ultrafast',
      videoBitrate: 1_200,
      recordDurationLimit: duration,
    });
    await recorder.start(videoPath);
    const startedAt = Date.now();
    if (options.sweepPointer) await sweepCanvasPointer(page, duration);
    const remaining = duration * 1_000 - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    await recorder.stop();
    recorder = null;
    diagnostics.push(...await inspectRenderedScene(page, renderMode));

    return { videoPath, diagnostics: deduplicateDiagnostics(diagnostics) };
  } finally {
    if (recorder) {
      try {
        await recorder.stop();
      } catch {
        // Browser teardown still runs if encoding already failed.
      }
    }
    await browser?.close();
  }
}

export async function recordScene(htmlContent: string, durationSec = 3): Promise<string> {
  const result = await recordSceneWithDiagnostics(htmlContent, durationSec);
  return result.videoPath;
}

export async function recordSceneWithDiagnostics(
  htmlContent: string,
  durationSec = 3,
  renderMode: SceneRenderMode = 'dom',
): Promise<SceneRecordingResult> {
  return recordPage(
    (page) => loadScene(page, htmlContent),
    durationSec,
    renderMode,
    { fps: 25, sweepPointer: false },
  );
}

export async function recordPageUrlWithDiagnostics(
  url: string,
  durationSec = 4,
  options: { sweepPointer?: boolean; fps?: number; renderMode?: SceneRenderMode } = {},
): Promise<SceneRecordingResult> {
  const target = new URL(url);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('The experiment URL must use HTTP or HTTPS.');
  }

  return recordPage(
    (page) => loadUrl(page, target.toString()),
    durationSec,
    options.renderMode ?? 'webgl',
    { fps: options.fps ?? 25, sweepPointer: options.sweepPointer ?? false },
  );
}

export async function recordBlobExperimentWithDiagnostics(
  url: string,
  durationSec = 4,
): Promise<SceneRecordingResult> {
  return recordPageUrlWithDiagnostics(url, durationSec, {
    sweepPointer: true,
    fps: 60,
    renderMode: 'webgl',
  });
}
