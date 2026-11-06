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
  await page.setContent(htmlContent, { waitUntil: 'load', timeout: 15_000 });
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 10_000 });
  } catch {
    // CDN keep-alives can prevent a full idle; the clip still records running motion.
  }
}

export async function recordScene(htmlContent: string, durationSec = 3): Promise<string> {
  const result = await recordSceneWithDiagnostics(htmlContent, durationSec);
  return result.videoPath;
}

export async function recordSceneWithDiagnostics(
  htmlContent: string,
  durationSec = 3,
): Promise<SceneRecordingResult> {
  let browser: Browser | null = null;
  let recorder: InstanceType<typeof PuppeteerScreenRecorder> | null = null;

  try {
    await mkdir(uploadsDirectory, { recursive: true });
    const videoPath = path.join(uploadsDirectory, `${randomUUID()}.mp4`);
    browser = await launchSceneBrowser();
    const page = await browser.newPage();
    const diagnostics = collectPageDiagnostics(page);
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await loadScene(page, htmlContent);

    recorder = new PuppeteerScreenRecorder(page, {
      followNewTab: false,
      fps: 25,
      videoFrame: { width: 1280, height: 720 },
      aspectRatio: '16:9',
      videoCodec: 'libx264',
      videoPreset: 'ultrafast',
      videoBitrate: 1_200,
      recordDurationLimit: clampDuration(durationSec),
    });
    await recorder.start(videoPath);
    await new Promise((resolve) => setTimeout(resolve, clampDuration(durationSec) * 1_000));
    await recorder.stop();
    recorder = null;
    diagnostics.push(...await inspectRenderedScene(page));

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
