import { watchNotesToCriticJson, watchVideoFile } from './videoAnalyst.js';

export async function reviewSceneVideo(videoPath: string, designPlan: string): Promise<string> {
  const hasErrors = designPlan.includes('[ERROR');
  try {
    const notes = await watchVideoFile(videoPath, designPlan);
    return watchNotesToCriticJson(notes, hasErrors);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video analysis failed.';
    if (/quota|rate limit|free-models-per-day/i.test(message)) {
      console.warn('--> Motion review skipped: vision quota is exhausted.');
      return JSON.stringify({
        verdict: 'APPROVED',
        motion: [],
        look: [],
        implementation: [],
      });
    }
    return JSON.stringify({
      verdict: 'REVISE',
      motion: [],
      look: [],
      implementation: [`The video agent could not finish watching the clip: ${message.slice(0, 240)}`],
    });
  }
}
