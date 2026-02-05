/**
 * Direct Client SDK for Passy
 * 
 * This provides a Vercel AI SDK-like experience:
 * - No separate server to run
 * - Direct API calls to LLM providers
 * - Built-in routing, retries, and fallbacks
 */

import type { 
  PassyConfig, 
  GenerateOptions, 
  StreamOptions,
  GenerateResponse,
  ModelInfo
} from "./types.js";

// Default provider configurations
const PROVIDER_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  nebius: "https://api.nebius.ai/v1",
  deepinfra: "https://api.deepinfra.com/v1",
};

// Model to provider mapping
const MODEL_PROVIDERS: Record<string, string> = {
  // OpenAI models
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4-turbo": "openai",
  "gpt-4": "openai",
  "gpt-3.5-turbo": "openai",
  
  // Anthropic models
  "claude-3-5-sonnet": "anthropic",
  "claude-3-opus": "anthropic",
  "claude-3-sonnet": "anthropic",
  "claude-3-haiku": "anthropic",
  
  // Nebius models (emby/ prefix)
  "emby/kimi-k2": "nebius",
  "emby/minimax-m2": "nebius",
  "nebius/kimi-k2": "nebius",
  
  // DeepInfra models
  "deepinfra/llama-3.3-70b": "deepinfra",
  "deepinfra/deepseek-v3": "deepinfra",
};

// Transform model names for providers
function transformModel(model: string, provider: string): string {
  // Remove provider prefixes
  if (model.includes("/")) {
    const parts = model.split("/");
    return parts[parts.length - 1];
  }
  return model;
}

// Get provider for model
function getProvider(model: string): string | null {
  // Check direct mapping
  if (MODEL_PROVIDERS[model]) {
    return MODEL_PROVIDERS[model];
  }
  
  // Check prefix
  if (model.includes("/")) {
    const prefix = model.split("/")[0];
    if (PROVIDER_URLS[prefix]) {
      return prefix;
    }
  }
  
  return null;
}

// Get API key for provider from environment
function getProviderApiKey(provider: string): string | undefined {
  const envVar = `${provider.toUpperCase()}_API_KEY`;
  return process.env[envVar];
}

// Get provider URL
function getProviderUrl(provider: string, baseUrl?: string): string {
  if (baseUrl) return baseUrl;
  return PROVIDER_URLS[provider] || "";
}

// Convert Anthropic format to OpenAI format
function anthropicToOpenAI(anthropicResponse: any): GenerateResponse {
  return {
    id: anthropicResponse.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: anthropicResponse.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: anthropicResponse.content?.[0]?.text || "",
      },
      finish_reason: anthropicResponse.stop_reason === "end_turn" ? "stop" : anthropicResponse.stop_reason,
    }],
    usage: {
      prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
      completion_tokens: anthropicResponse.usage?.output_tokens || 0,
      total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0),
    },
  };
}

// Convert OpenAI messages to Anthropic format
function openAIToAnthropicMessages(messages: Array<{role: string, content: string}>): any {
  const systemMessage = messages.find(m => m.role === "system");
  const chatMessages = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
  
  return {
    system: systemMessage?.content,
    messages: chatMessages,
  };
}

/**
 * Create a Passy direct client
 * No server required - makes direct API calls
 */
export function createPassy(config: PassyConfig = {}) {
  const { 
    apiKey, 
    baseUrl,
    defaultModel = "gpt-4o-mini",
    timeout = 60000,
    retries = 3,
  } = config;

  async function makeRequest(
    provider: string,
    endpoint: string,
    body: any,
    attempt = 1
  ): Promise<Response> {
    const url = `${getProviderUrl(provider, baseUrl)}${endpoint}`;
    const providerApiKey = apiKey || getProviderApiKey(provider);
    
    if (!providerApiKey) {
      throw new Error(`No API key for provider: ${provider}. Set ${provider.toUpperCase()}_API_KEY or pass apiKey to config.`);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Provider-specific auth
    if (provider === "anthropic") {
      headers["x-api-key"] = providerApiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${providerApiKey}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Provider error (${response.status}): ${error}`);
      }

      return response;
    } catch (error) {
      if (attempt < retries) {
        console.log(`[Passy] Retry ${attempt}/${retries} for ${provider}...`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
        return makeRequest(provider, endpoint, body, attempt + 1);
      }
      throw error;
    }
  }

  async function generateText(options: GenerateOptions): Promise<GenerateResponse> {
    const model = options.model || defaultModel;
    const provider = getProvider(model);
    
    if (!provider) {
      throw new Error(`Unknown model: ${model}`);
    }

    const transformedModel = transformModel(model, provider);

    // Provider-specific request format
    let body: any;
    let endpoint: string;

    if (provider === "anthropic") {
      endpoint = "/messages";
      const { system, messages } = openAIToAnthropicMessages(options.messages);
      body = {
        model: transformedModel,
        messages,
        system,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature,
        top_p: options.topP,
        stream: false,
      };
    } else {
      // OpenAI-compatible format
      endpoint = "/chat/completions";
      body = {
        model: transformedModel,
        messages: options.messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stop,
        stream: false,
      };
    }

    const response = await makeRequest(provider, endpoint, body);
    const data = await response.json();

    // Convert Anthropic response to OpenAI format
    if (provider === "anthropic") {
      return anthropicToOpenAI(data);
    }

    return data as GenerateResponse;
  }

  async function* streamText(options: StreamOptions): AsyncGenerator<string, void, unknown> {
    const model = options.model || defaultModel;
    const provider = getProvider(model);
    
    if (!provider) {
      throw new Error(`Unknown model: ${model}`);
    }

    const transformedModel = transformModel(model, provider);

    let body: any;
    let endpoint: string;

    if (provider === "anthropic") {
      endpoint = "/messages";
      const { system, messages } = openAIToAnthropicMessages(options.messages);
      body = {
        model: transformedModel,
        messages,
        system,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature,
        stream: true,
      };
    } else {
      endpoint = "/chat/completions";
      body = {
        model: transformedModel,
        messages: options.messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        stream: true,
      };
    }

    const response = await makeRequest(provider, endpoint, body);
    
    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              
              // Extract content based on provider format
              let content = "";
              if (provider === "anthropic") {
                content = parsed.delta?.text || "";
              } else {
                content = parsed.choices?.[0]?.delta?.content || "";
              }
              
              if (content) {
                yield content;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function listModels(): Promise<ModelInfo[]> {
    // Return known models
    return Object.keys(MODEL_PROVIDERS).map(id => ({
      id,
      provider: MODEL_PROVIDERS[id],
      object: "model",
    }));
  }

  return {
    generateText,
    streamText,
    listModels,
    
    // For compatibility with old SDK
    ready: async () => {}, // No-op - no server to wait for
    get url() { return "direct"; },
    stop: async () => {}, // No-op - no server to stop
  };
}

// Default singleton instance
export const passy = createPassy();
