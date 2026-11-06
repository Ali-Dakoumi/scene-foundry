export type DiagnosticSeverity = 'error' | 'warning';

export interface SceneDiagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
}

const MAX_HTML_LENGTH = 500_000;

export function validateSceneHtml(html: string): SceneDiagnostic[] {
  const diagnostics: SceneDiagnostic[] = [];
  const normalized = html.toLowerCase();

  if (html.length > MAX_HTML_LENGTH) {
    diagnostics.push(error('HTML_TOO_LARGE', `Generated HTML exceeds ${MAX_HTML_LENGTH} characters.`));
  }
  if (!/^\s*<!doctype html>/i.test(html)) {
    diagnostics.push(error('DOCTYPE_MISSING', 'The document must begin with <!DOCTYPE html>.'));
  }
  if (!/<html(?:\s|>)/i.test(html) || !/<\/html\s*>/i.test(html)) {
    diagnostics.push(error('HTML_DOCUMENT_INCOMPLETE', 'The document must contain opening and closing html tags.'));
  }
  if (!/<style(?:\s|>)/i.test(html)) {
    diagnostics.push(error('STYLE_MISSING', 'The document must contain an inline style element.'));
  }
  if (!/<script\s+[^>]*type\s*=\s*["']module["'][^>]*>/i.test(html)) {
    diagnostics.push(error('MODULE_SCRIPT_MISSING', 'The document must contain a module script.'));
  }

  const forbiddenElements = ['base', 'embed', 'object'];
  for (const element of forbiddenElements) {
    if (new RegExp(`<${element}(?:\\s|>)`, 'i').test(html)) {
      diagnostics.push(error('FORBIDDEN_ELEMENT', `The <${element}> element is not allowed.`));
    }
  }

  if (/<meta\s+[^>]*http-equiv\s*=\s*["']?refresh/i.test(html)) {
    diagnostics.push(error('META_REFRESH_FORBIDDEN', 'Meta refresh navigation is not allowed.'));
  }
  if (/\b(?:href|src|action)\s*=\s*["']\s*(?:javascript|data\s*:\s*text\/html)/i.test(html)) {
    diagnostics.push(error('UNSAFE_URL', 'Executable javascript: and HTML data: URLs are not allowed.'));
  }
  if (normalized.includes('window.top') || normalized.includes('window.parent.location')) {
    diagnostics.push(error('PARENT_NAVIGATION_FORBIDDEN', 'Generated scenes cannot control the parent window.'));
  }
  if (!/three(?:\.module)?(?:\.min)?\.js|from\s+["'][^"']*three/i.test(html)) {
    diagnostics.push(warning('THREE_IMPORT_NOT_DETECTED', 'No recognizable Three.js import was detected.'));
  }
  if (!/gsap(?:\.min)?\.js|from\s+["'][^"']*gsap/i.test(html)) {
    diagnostics.push(warning('GSAP_IMPORT_NOT_DETECTED', 'No recognizable GSAP import was detected.'));
  }

  return diagnostics;
}

export function formatDiagnostics(diagnostics: SceneDiagnostic[]): string {
  if (diagnostics.length === 0) return 'None';
  return diagnostics
    .map((item) => `[${item.severity.toUpperCase()} ${item.code}] ${item.message}`)
    .join('\n');
}

export function hasDiagnosticErrors(diagnostics: SceneDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === 'error');
}

function error(code: string, message: string): SceneDiagnostic {
  return { severity: 'error', code, message };
}

function warning(code: string, message: string): SceneDiagnostic {
  return { severity: 'warning', code, message };
}
