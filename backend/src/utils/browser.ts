import { existsSync } from 'node:fs';
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';

const windowsBrowserPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

export function getSystemBrowserPath(): string | undefined {
  const configuredPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (configuredPath) return configuredPath;
  if (process.platform !== 'win32') return undefined;
  return windowsBrowserPaths.find((candidate) => existsSync(candidate));
}

export async function launchSceneBrowser(options: { interactive?: boolean } = {}): Promise<Browser> {
  const executablePath = getSystemBrowserPath();
  const launchOptions: LaunchOptions = {
    headless: options.interactive ? false : true,
    args: [
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--window-size=1280,720',
    ],
  };
  if (executablePath) launchOptions.executablePath = executablePath;
  return puppeteer.launch(launchOptions);
}
