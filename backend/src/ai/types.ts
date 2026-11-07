export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatTextPart {
  type: 'text';
  text: string;
}

export interface ChatImagePart {
  type: 'image_url';
  image_url: { url: string };
}

export type ChatContentPart = ChatTextPart | ChatImagePart;

export type ChatContent = string | ChatContentPart[];

export interface ChatMessage {
  role: ChatRole;
  content: ChatContent;
}

export function contentToText(content: ChatContent): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim();
}

export function hasImageContent(messages: readonly ChatMessage[]): boolean {
  return messages.some((message) => (
    Array.isArray(message.content)
    && message.content.some((part) => part.type === 'image_url')
  ));
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface CompletionRequest {
  purpose: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  cache?: boolean;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
  retries: number;
  fallbacks: number;
  usage?: TokenUsage;
  cached?: boolean;
}

export interface ProviderHealth {
  id: string;
  configured: boolean;
  model: string;
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  isConfigured(): boolean;
  complete(request: CompletionRequest, signal: AbortSignal): Promise<CompletionResult>;
}
