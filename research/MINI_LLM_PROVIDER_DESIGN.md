# Mini-LLM SDK: Provider Extensibility & Routing Design

## Design Philosophy

**Keep it lightweight. Keep it simple. Keep it fast.**

The Mini-LLM SDK should remain a thin, fast routing layer. Complex logic (pricing, auto-scaling, multi-provider orchestration) belongs in services built **on top** of the SDK, not inside it.

## Core Principles

1. **SDK = Plumbing**: Routes requests to providers, handles streaming, manages fallbacks
2. **Services = Policy**: Pricing, scaling, provider selection logic lives in api.passy.ai
3. **Config over Code**: Add providers via configuration, not code changes
4. **Developer Experience**: Simple, intuitive API for local development

## Current SDK Architecture

```
mini-llm-sdk/
├── gateway/
│   ├── src/
│   │   ├── server.ts          # HTTP server
│   │   ├── router/
│   │   │   ├── openai.ts      # OpenAI provider
│   │   │   └── anthropic.ts   # Anthropic provider
│   │   └── alias.ts           # Model aliasing
```

**Current Limitations**:
- Hardcoded providers (OpenAI, Anthropic)
- No fallback mechanism
- No custom endpoint support
- Simple model aliasing only

## Proposed SDK Enhancements

### 1. Provider Plugin System

**Goal**: Add providers via configuration without code changes.

**Configuration Format**:
```typescript
// config/providers.ts
export const providers: ProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: {
      chat: '/v1/chat/completions',
      models: '/v1/models',
    },
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    authPrefix: '',
    apiVersion: '2023-06-01',
    endpoints: {
      chat: '/v1/messages',
      models: '/v1/models',
    },
    models: ['claude-3-5-sonnet', 'claude-3-haiku'],
  },
  {
    id: 'nebius',
    name: 'Nebius',
    baseUrl: 'https://api.studio.nebius.ai',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: {
      chat: '/v1/chat/completions',
      models: '/v1/models',
    },
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct'],
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    baseUrl: 'https://api.deepinfra.com',
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: {
      chat: '/v1/openai/chat/completions',
      models: '/v1/models',
    },
    models: ['meta-llama/Meta-Llama-3.1-70B-Instruct'],
  },
  // Custom/BYOK provider
  {
    id: 'custom',
    name: 'Custom Endpoint',
    baseUrl: '${CUSTOM_BASE_URL}',  // From env
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
    endpoints: {
      chat: '/v1/chat/completions',
      models: '/v1/models',
    },
    models: ['*'],  // Accept any model
  },
];
```

**Implementation**:
```typescript
// gateway/src/providers/registry.ts
export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  authHeader: string;
  authPrefix: string;
  apiVersion?: string;
  endpoints: {
    chat: string;
    models?: string;
  };
  models: string[];
}

export class ProviderRegistry {
  private providers = new Map<string, ProviderConfig>();
  
  register(config: ProviderConfig) {
    this.providers.set(config.id, config);
  }
  
  get(id: string): ProviderConfig | undefined {
    return this.providers.get(id);
  }
  
  list(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }
  
  // Auto-discover from environment
  loadFromEnv() {
    // Load PROVIDER_CONFIG_JSON or individual PROVIDER_* vars
    const configJson = process.env.MINI_LLM_PROVIDERS;
    if (configJson) {
      const configs: ProviderConfig[] = JSON.parse(configJson);
      configs.forEach(c => this.register(c));
    }
  }
}

export const registry = new ProviderRegistry();
```

### 2. Fallback System

**Goal**: When provider A fails, automatically try provider B.

**Configuration**:
```typescript
// config/routing.ts
export const routingRules: RoutingRule[] = [
  {
    model: 'llama-3.1-70b',
    // Try in order: Nebius → DeepInfra → Custom
    providers: ['nebius', 'deepinfra', 'custom'],
    fallbackOn: ['5xx', 'timeout', 'rate_limit'],
    timeout: 30000,
  },
  {
    model: 'gpt-4o',
    providers: ['openai'],
    // No fallback - fail fast
  },
  {
    model: 'claude-3-5-sonnet',
    providers: ['anthropic', 'openai'],  // Fallback to OpenAI proxy
  },
];
```

**Implementation**:
```typescript
// gateway/src/router/fallback.ts
export interface RoutingRule {
  model: string;
  providers: string[];
  fallbackOn: string[];
  timeout: number;
}

export async function routeWithFallback(
  request: Request,
  rule: RoutingRule
): Promise<Response> {
  const errors: Error[] = [];
  
  for (const providerId of rule.providers) {
    try {
      const provider = registry.get(providerId);
      if (!provider) continue;
      
      const response = await proxyToProvider(request, provider, {
        timeout: rule.timeout,
      });
      
      if (response.ok) {
        return response;
      }
      
      // Check if we should fallback
      if (!shouldFallback(response.status, rule.fallbackOn)) {
        return response;  // Return error response
      }
      
      errors.push(new Error(`${providerId}: ${response.status}`));
    } catch (error) {
      errors.push(error as Error);
      
      // Check if error type warrants fallback
      if (!shouldFallbackOnError(error, rule.fallbackOn)) {
        throw error;
      }
    }
  }
  
  // All providers failed
  throw new Error(`All providers failed: ${errors.map(e => e.message).join(', ')}`);
}

function shouldFallback(status: number, fallbackOn: string[]): boolean {
  if (fallbackOn.includes('5xx') && status >= 500) return true;
  if (fallbackOn.includes('rate_limit') && status === 429) return true;
  if (fallbackOn.includes('timeout') && status === 408) return true;
  return false;
}
```

### 3. Internal Naming/Routing

**Goal**: Users use simple names like `llama-70b`, SDK routes to actual provider.

**Configuration**:
```typescript
// config/models.ts
export const modelMappings: ModelMapping[] = [
  {
    alias: 'llama-70b',
    routes: [
      { provider: 'nebius', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
      { provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
    ],
  },
  {
    alias: 'kimi-k2',
    routes: [
      { provider: 'nebius', model: 'kimi-k2' },
    ],
  },
  {
    alias: 'gpt-4o',
    routes: [
      { provider: 'openai', model: 'gpt-4o' },
    ],
  },
  // BYOK: User's custom model
  {
    alias: 'my-custom-model',
    routes: [
      { provider: 'custom', model: 'my-fine-tuned-model' },
    ],
  },
];
```

**Usage**:
```typescript
// Client request
const response = await fetch('http://localhost:3333/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sk-...' },
  body: JSON.stringify({
    model: 'llama-70b',  // Simple alias
    messages: [...],
  }),
});

// SDK resolves to:
// 1. Map 'llama-70b' → nebius/meta-llama/Meta-Llama-3.1-70B-Instruct
// 2. Try nebius first
// 3. If fails, fallback to deepinfra
```

### 4. BYOK (Bring Your Own Key) Support

**Goal**: Users can add their own provider endpoints.

**Environment Configuration**:
```bash
# User adds custom provider
export MINI_LLM_PROVIDERS='[
  {
    "id": "my-openai",
    "name": "My OpenAI",
    "baseUrl": "https://api.openai.com",
    "authHeader": "Authorization",
    "authPrefix": "Bearer ",
    "endpoints": { "chat": "/v1/chat/completions" },
    "models": ["gpt-4o", "gpt-4o-mini"]
  }
]'

# Or simpler: just add keys for existing providers
export OPENAI_API_KEY="sk-user's-own-key"
export NEBIUS_API_KEY="user's-nebius-key"
```

**Configuration File**:
```json
// mini-llm.config.json
{
  "providers": [
    {
      "id": "openai",
      "enabled": true,
      "apiKey": "${OPENAI_API_KEY}"
    },
    {
      "id": "nebius",
      "enabled": true,
      "apiKey": "${NEBIUS_API_KEY}"
    },
    {
      "id": "custom",
      "enabled": true,
      "baseUrl": "${CUSTOM_BASE_URL}",
      "apiKey": "${CUSTOM_API_KEY}"
    }
  ],
  "routing": {
    "llama-70b": {
      "providers": ["nebius", "deepinfra"],
      "fallbackOn": ["5xx", "timeout"]
    }
  }
}
```

## SDK API Design

### Simple Usage (Local Development)

```typescript
import { miniLLM } from 'mini-llm';

// Start gateway
await miniLLM.ready();

// Use it
const response = await fetch(`${miniLLM.url}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'llama-70b',  // Simple alias
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});
```

### Advanced Usage (Custom Providers)

```typescript
import { createMiniLLM, registry } from 'mini-llm';

// Register custom provider
registry.register({
  id: 'my-provider',
  name: 'My Provider',
  baseUrl: 'https://my-llm-api.com',
  authHeader: 'Authorization',
  authPrefix: 'Bearer ',
  endpoints: { chat: '/v1/chat' },
  models: ['my-model'],
});

// Add routing rule
miniLLM.addRoutingRule({
  model: 'my-model',
  providers: ['my-provider', 'openai'],  // Fallback to OpenAI
  fallbackOn: ['5xx', 'timeout'],
});

await miniLLM.ready();
```

## What Stays in SDK vs api.passy.ai

### SDK (Lightweight)
- ✅ Provider plugin system
- ✅ Basic fallback mechanism
- ✅ Model aliasing/routing
- ✅ Request proxying
- ✅ Streaming support
- ✅ BYOK configuration

### api.passy.ai (Business Logic)
- ❌ Pricing calculations
- ❌ Auto-scaling logic
- ❌ 15-minute hosting decisions
- ❌ Usage-based routing
- ❌ Billing integration
- ❌ Complex provider selection algorithms

## Implementation Plan

### Phase 1: Provider Registry
1. Create `ProviderRegistry` class
2. Load providers from environment/config
3. Update router to use registry

### Phase 2: Fallback System
1. Add `routeWithFallback()` function
2. Implement retry logic
3. Add timeout handling

### Phase 3: Model Aliasing
1. Enhance `alias.ts` with routing rules
2. Support multiple providers per alias
3. Add priority/fallback configuration

### Phase 4: Configuration
1. Support `mini-llm.config.json`
2. Environment variable substitution
3. Hot-reload configuration

## Example: Full Configuration

```json
{
  "providers": {
    "openai": {
      "enabled": true,
      "apiKey": "${OPENAI_API_KEY}"
    },
    "anthropic": {
      "enabled": true,
      "apiKey": "${ANTHROPIC_API_KEY}"
    },
    "nebius": {
      "enabled": true,
      "apiKey": "${NEBIUS_API_KEY}"
    },
    "deepinfra": {
      "enabled": true,
      "apiKey": "${DEEPINFRA_API_KEY}"
    }
  },
  "models": {
    "gpt-4o": {
      "provider": "openai",
      "model": "gpt-4o"
    },
    "claude-sonnet": {
      "provider": "anthropic",
      "model": "claude-3-5-sonnet-20241022"
    },
    "llama-70b": {
      "providers": [
        { "id": "nebius", "model": "meta-llama/Meta-Llama-3.1-70B-Instruct" },
        { "id": "deepinfra", "model": "meta-llama/Meta-Llama-3.1-70B-Instruct" }
      ],
      "fallbackOn": ["5xx", "timeout", "rate_limit"],
      "timeout": 30000
    }
  }
}
```

This design keeps the SDK lightweight while enabling powerful routing and fallback capabilities that api.passy.ai can build upon for its business logic.