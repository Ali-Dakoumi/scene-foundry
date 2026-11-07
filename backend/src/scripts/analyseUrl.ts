import { exploreAndAnalyseUrl } from '../utils/visualExplorer.js';

const url = process.argv[2];
if (!url) throw new Error('Usage: npm run visual:analyse -- https://example.com');
const result = await exploreAndAnalyseUrl(url);
console.log(JSON.stringify(result, null, 2));
