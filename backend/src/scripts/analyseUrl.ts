import { exploreAndAnalyseUrl } from '../utils/visualExplorer.js';

const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith('--'));
const interactive = args.includes('--interactive');
if (!url) throw new Error('Usage: npm run visual:analyse -- https://example.com [--interactive]');

try {
  const result = await exploreAndAnalyseUrl(url, { interactive });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nVisual analysis stopped: ${message}`);
  if (/Cloudflare|verification challenge/i.test(message) && !interactive) {
    console.error(`Retry with a visible browser:\n  npm run visual:analyse -- ${url} --interactive`);
  }
  process.exitCode = 1;
}
