export interface MiniPassyConfig {
  port?: number;
  env?: Record<string, string>;
}

export interface MiniPassyInstance {
  ready(): Promise<void>;
  url: string;
  stop(): Promise<void>;
}

// New types for direct client (Vercel AI SDK-like)

export interface PassyConfig {
  /** API key for authentication (or use environment variables) */
  apiKey?: string;
  /** Base URL for custom provider */
  baseUrl?: string;
  /** Default model to use */
  defaultModel?: string;
  /** Request timeout in ms (default: 60000) */
  timeout?: number;
  /** Number of retries (default: 3) */
  retries?: number;
}

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  /** Model ID (e.g., "gpt-4o", "claude-3-sonnet") */
  model?: string;
  /** Messages for the conversation */
  messages: Message[];
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-2) */
  temperature?: number;
  /** Top-p sampling */
  topP?: number;
  /** Frequency penalty */
  frequencyPenalty?: number;
  /** Presence penalty */
  presencePenalty?: number;
  /** Stop sequences */
  stop?: string[];
}

export interface StreamOptions extends GenerateOptions {
  /** Callback for each chunk */
  onChunk?: (chunk: string) => void;
}

export interface GenerateResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ModelInfo {
  id: string;
  provider: string;
  object: string;
}
