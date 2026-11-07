import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegPath = require('ffmpeg-static') as string | null;
const execFileAsync = promisify(execFile);

export interface VideoFrame {
  index: number;
  timeSec: number;
  mimeType: 'image/jpeg';
  base64: string;
}

function ffmpegBinary(): string {
  if (!ffmpegPath) throw new Error('ffmpeg is not available for frame extraction.');
  return ffmpegPath;
}

export async function getVideoDurationSec(videoPath: string): Promise<number> {
  try {
    await execFileAsync(ffmpegBinary(), ['-i', videoPath], { timeout: 20_000 });
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr)
      : '';
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      return Math.max(0.4, hours * 3600 + minutes * 60 + seconds);
    }
  }
  return 3;
}

export async function writeTestClip(outputPath: string, durationSec = 1): Promise<void> {
  await execFileAsync(ffmpegBinary(), [
    '-f', 'lavfi',
    '-i', `testsrc=duration=${durationSec}:size=320x240:rate=12`,
    '-pix_fmt', 'yuv420p',
    '-y',
    outputPath,
  ], { timeout: 20_000 });
}

export async function extractVideoFrames(
  videoPath: string,
  frameCount = 5,
): Promise<VideoFrame[]> {
  const duration = await getVideoDurationSec(videoPath);
  const count = Math.min(4, Math.max(3, frameCount));
  const fps = Math.max(1, count / duration);
  const workDir = path.join(os.tmpdir(), `scene-foundry-frames-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    await execFileAsync(ffmpegBinary(), [
      '-i', videoPath,
      '-vf', `fps=${fps.toFixed(3)},scale=384:-2`,
      '-q:v', '8',
      '-y',
      path.join(workDir, 'frame-%02d.jpg'),
    ], { timeout: 20_000 });

    const files = (await readdir(workDir)).filter((name) => name.endsWith('.jpg')).sort();
    if (files.length === 0) {
      throw new Error('ffmpeg produced no frames from the video.');
    }

    const selected = files.slice(0, count);
    const frames: VideoFrame[] = [];
    for (const [index, fileName] of selected.entries()) {
      const bytes = await readFile(path.join(workDir, fileName));
      frames.push({
        index,
        timeSec: Number(((duration * index) / Math.max(1, selected.length - 1)).toFixed(2)),
        mimeType: 'image/jpeg',
        base64: bytes.toString('base64'),
      });
    }
    return frames;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
