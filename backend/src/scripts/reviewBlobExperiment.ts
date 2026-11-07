import { env } from '../config/env.js';
import { recordBlobExperimentWithDiagnostics } from '../utils/recorder.js';
import { reviewSceneVideo } from '../utils/videoCritic.js';

const reviewBrief = `Review this original procedural WebGL sphere for the Scene Foundry Soft Matter field study.
Look for a clearly visible organic, smoothly deformed form; layered motion rather than spikes or jitter;
pointer response with inertia; changing teal/violet lighting and specular highlights; stable framing;
and any obvious stutter, clipping, shader artifacts, or console/runtime issues.
Describe only what is visible in the sampled frames. Report motion/look only for defects that require
correction, put actionable defects in issues, and leave issues empty when the criteria are satisfied.
Do not treat positive observations as requested revisions.`;

async function main(): Promise<void> {
  const frontendOrigin = process.argv[2] ?? env.FRONTEND_ORIGIN;
  const url = new URL('/blob.html', frontendOrigin);
  console.log(`Recording ${url.toString()} at 1280x720, 60fps for 4 seconds.`);
  const recording = await recordBlobExperimentWithDiagnostics(url.toString(), 4);
  console.log(`Video saved: ${recording.videoPath}`);
  console.log('Runtime diagnostics:', JSON.stringify(recording.diagnostics, null, 2));
  const critique = await reviewSceneVideo(recording.videoPath, reviewBrief);
  console.log('Vision critique:');
  console.log(critique);
}

main().catch((error: unknown) => {
  console.error('Blob experiment review failed:', error);
  process.exitCode = 1;
});
