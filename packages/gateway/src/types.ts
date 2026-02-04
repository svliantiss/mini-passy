export interface Provider {
  name: string;
  url: string;
  key: string;
  openai: boolean; // Supports OpenAI format
  anthropic: boolean; // Supports Anthropic format
  models: string[]; // Available models
}

export interface Alias {
  name: string;
  targets: { provider: string; model: string }[];
  fallbackOn: string[];
}

export interface EnvConfig {
  port: number;
  providers: Map<string, Provider>;
  aliases: Map<string, Alias>;
}