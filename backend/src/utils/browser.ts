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

export async function launchSceneBrowser(): Promise<Browser> {
  const executablePath = getSystemBrowserPath();
  const options: LaunchOptions = {
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
    ],
  };
  if (executablePath) options.executablePath = executablePath;
  return puppeteer.launch(options);
}
