export interface MiniPassyConfig {
  port?: number;
  env?: Record<string, string>;
}

export interface MiniPassyInstance {
  ready(): Promise<void>;
  url: string;
  stop(): Promise<void>;
}
