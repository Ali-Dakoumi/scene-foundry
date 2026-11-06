import { GoogleGenerativeAI } from '@google/generative-ai';
import { FileState, GoogleAIFileManager } from '@google/generative-ai/server';
import { env } from '../config/env.js';

const POLL_INTERVAL_MS = 4_000;
const MAX_WAIT_MS = 120_000;

async function withModelTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Critic model timed out. Please try again.')), env.LLM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForActiveFile(
  fileManager: GoogleAIFileManager,
  fileName: string,
): Promise<{ uri: string; mimeType: string }> {
  const startedAt = Date.now();
  let file = await fileManager.getFile(fileName);

  while (file.state === FileState.PROCESSING) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error('Timed out waiting for Gemini to process the scene recording.');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    file = await fileManager.getFile(fileName);
  }

  if (file.state === FileState.FAILED || !file.uri) {
    throw new Error('Gemini failed to process the scene recording.');
  }

  return { uri: file.uri, mimeType: file.mimeType };
}

export async function reviewSceneVideo(videoPath: string, designPlan: string): Promise<string> {
  const fileManager = new GoogleAIFileManager(env.GOOGLE_API_KEY);
  const uploaded = await fileManager.uploadFile(videoPath, {
    mimeType: 'video/mp4',
    displayName: 'scene-critic-clip',
  });

  try {
    const activeFile = await waitForActiveFile(fileManager, uploaded.file.name);
    const genAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await withModelTimeout(model.generateContent([
      {
        fileData: {
          fileUri: activeFile.uri,
          mimeType: activeFile.mimeType,
        },
      },
      {
        text: `You are a strict motion and look critic for generated Three.js/GSAP scenes.

Return ONLY a JSON object with this shape:
{"verdict":"APPROVED"|"REVISE","motion":["..."],"look":["..."],"implementation":["..."]}

Use verdict APPROVED only when the 3-second clip satisfies the design, motion, and look plans and every array is empty. Never set APPROVED when any note is required.

Split notes by owner:
- motion: GSAP easing, camera path, timeline, frame pacing, abrupt stops
- look: lighting stability, materials, shaders, color, clipping silhouettes that are look issues
- implementation: broken code, missing canvas, controls listener, incorrect library usage

Check:
- GSAP easing fluidity (proper deceleration vs abrupt stops)
- Three.js camera motion and clipping
- Lighting stability during movement
- Apparent frame rate and dropped frames
- Whether motion matches the requested 3-second timeline

Design plan and review context:
${designPlan}`,
      },
    ]));

    return result.response.text().trim();
  } finally {
    try {
      await fileManager.deleteFile(uploaded.file.name);
    } catch {
      // Local cleanup still happens in the critic node.
    }
  }
}
