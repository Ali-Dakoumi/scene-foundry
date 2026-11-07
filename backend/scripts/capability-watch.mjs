import { stat } from 'node:fs/promises';
import { recordPageUrlWithDiagnostics } from '../dist/utils/recorder.js';
import { formatWatchNotesAsMarkdown, watchVideoFile } from '../dist/utils/videoAnalyst.js';

const demoUrl = process.env.DEMO_URL ?? 'http://localhost:5175/demos/tidal-form.html';
console.log(`--> Recording ${demoUrl} for 4s...`);
const recording = await recordPageUrlWithDiagnostics(demoUrl, 4, { sweepPointer: true, fps: 25 });
const info = await stat(recording.videoPath);
console.log('--> Clip', recording.videoPath, `${info.size} bytes`);
console.log('--> Diagnostics', JSON.stringify(recording.diagnostics));

console.log('--> Video agent watching frames...');
const notes = await watchVideoFile(
  recording.videoPath,
  'Study 01 Tidal Form: reconstruct the visible WebGL motion, lighting, and interaction from these frames.',
);
console.log(JSON.stringify(notes, null, 2));
console.log('--- markdown ---');
console.log(formatWatchNotesAsMarkdown(notes, demoUrl));
console.log('CLIP_PATH=' + recording.videoPath);
