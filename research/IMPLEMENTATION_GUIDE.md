# Implementation Guide: Local Development Setup

## Overview

This guide covers setting up both services locally before deployment to Dokploy.

**Services**:
1. **mini-llm-sdk** (enhanced with provider system) - Port 3333
2. **api.passy.ai** - Port 3000
3. **passy.ai portal** (simplified) - Port 3005

## Project Structure

```
workspace/
├── mini-llm-sdk/           # Enhanced SDK
│   ├── packages/
│   │   ├── gateway/        # Core gateway
│   │   └── sdk/            # Node.js SDK
│   └── config/
│       └── providers.json  # Provider configurations
│
├── api-passy-ai/           # API service
│   ├── src/
│   │   ├── app.ts
│   │   ├── routes/
│   │   └── lib/
│   └── prisma/
│       └── schema.prisma   # Shared schema
│
└── passy-portal/           # Simplified portal
    ├── src/
    │   ├── app.ts          # Without proxy routes
    │   └── routes/
    └── prisma/
        └── schema.prisma   # Same schema
```

## Phase 1: Enhance Mini-LLM SDK

### Step 1.1: Add Provider Registry

Create `packages/gateway/src/providers/registry.ts`:

```typescript
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
  // For fallback/load balancing
  priority?: number;
  timeout?: number;
}

export class ProviderRegistry {
  private providers = new Map<string, ProviderConfig>();
  
  register(config: ProviderConfig) {
    this.providers.set(config.id, config);
    console.log(`[ProviderRegistry] Registered: ${config.id}`);
  }
  
  get(id: string): ProviderConfig | undefined {
    return this.providers.get(id);
  }
  
  list(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }
  
  findByModel(model: string): ProviderConfig[] {
    return this.list().filter(p => 
      p.models.includes(model) || p.models.includes('*')
    );
  }
  
  loadFromEnv() {
    const configJson = process.env.MINI_LLM_PROVIDERS;
    if (configJson) {
      try {
        const configs: ProviderConfig[] = JSON.parse(configJson);
        configs.forEach(c => this.register(c));
      } catch (e) {
        console.error('[ProviderRegistry] Failed to parse MINI_LLM_PROVIDERS:', e);
      }
    }
    
    // Load from individual env vars for common providers
    this.loadStandardProviders();
  }
  
  private loadStandardProviders() {
    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.register({
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        endpoints: { chat: '/v1/chat/completions', models: '/v1/models' },
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      });
    }
    
    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      this.register({
        id: 'anthropic',
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        authHeader: 'x-api-key',
        authPrefix: '',
        apiVersion: '2023-06-01',
        endpoints: { chat: '/v1/messages', models: '/v1/models' },
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus', 'claude-3-haiku'],
      });
    }
    
    // Nebius
    if (process.env.NEBIUS_API_KEY) {
      this.register({
        id: 'nebius',
        name: 'Nebius',
        baseUrl: 'https://api.studio.nebius.ai',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        endpoints: { chat: '/v1/chat/completions', models: '/v1/models' },
        models: [
          'meta-llama/Meta-Llama-3.1-70B-Instruct',
          'meta-llama/Meta-Llama-3.1-8B-Instruct',
        ],
      });
    }
    
    // DeepInfra
    if (process.env.DEEPINFRA_API_KEY) {
      this.register({
        id: 'deepinfra',
        name: 'DeepInfra',
        baseUrl: 'https://api.deepinfra.com',
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        endpoints: { chat: '/v1/openai/chat/completions', models: '/v1/models' },
        models: [
          'meta-llama/Meta-Llama-3.1-70B-Instruct',
          'meta-llama/Meta-Llama-3.1-8B-Instruct',
        ],
      });
    }
  }
}

export const registry = new ProviderRegistry();
```

### Step 1.2: Add Routing Configuration

Create `packages/gateway/src/config/routing.ts`:

```typescript
export interface RouteConfig {
  alias: string;
  targets: {
    provider: string;
    model: string;
    priority?: number;
  }[];
  fallbackOn: ('5xx' | '4xx' | 'timeout' | 'rate_limit')[];
  timeout?: number;
}

export class RoutingTable {
  private routes = new Map<string, RouteConfig>();
  
  add(config: RouteConfig) {
    this.routes.set(config.alias, config);
  }
  
  resolve(alias: string): RouteConfig | undefined {
    return this.routes.get(alias);
  }
  
  loadFromEnv() {
    const routingJson = process.env.MINI_LLM_ROUTING;
    if (routingJson) {
      try {
        const routes: RouteConfig[] = JSON.parse(routingJson);
        routes.forEach(r => this.add(r));
      } catch (e) {
        console.error('[RoutingTable] Failed to parse MINI_LLM_ROUTING:', e);
      }
    }
    
    // Default routes
    this.loadDefaultRoutes();
  }
  
  private loadDefaultRoutes() {
    // Llama 70B with fallback
    this.add({
      alias: 'llama-70b',
      targets: [
        { provider: 'nebius', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct', priority: 1 },
        { provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct', priority: 2 },
      ],
      fallbackOn: ['5xx', 'timeout', 'rate_limit'],
      timeout: 30000,
    });
    
    // Llama 8B
    this.add({
      alias: 'llama-8b',
      targets: [
        { provider: 'nebius', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct', priority: 1 },
        { provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct', priority: 2 },
      ],
      fallbackOn: ['5xx', 'timeout'],
      timeout: 30000,
    });
    
    // GPT-4o (no fallback)
    this.add({
      alias: 'gpt-4o',
      targets: [{ provider: 'openai', model: 'gpt-4o', priority: 1 }],
      fallbackOn: [],
      timeout: 60000,
    });
    
    // Claude (with OpenAI fallback for compatibility)
    this.add({
      alias: 'claude-sonnet',
      targets: [
        { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', priority: 1 },
      ],
      fallbackOn: ['5xx'],
      timeout: 60000,
    });
  }
}

export const routingTable = new RoutingTable();
```

### Step 1.3: Add Fallback Handler

Create `packages/gateway/src/router/fallback.ts`:

```typescript
import type { Context } from 'hono';
import { registry, type ProviderConfig } from '../providers/registry.js';
import { routingTable, type RouteConfig } from '../config/routing.js';

interface ProxyOptions {
  timeout: number;
  fallbackOn: string[];
}

export async function proxyWithFallback(
  c: Context,
  routeConfig: RouteConfig,
  body: any
): Promise<Response> {
  const errors: Error[] = [];
  
  // Sort targets by priority
  const targets = routeConfig.targets.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  
  for (const target of targets) {
    const provider = registry.get(target.provider);
    if (!provider) {
      errors.push(new Error(`Provider not found: ${target.provider}`));
      continue;
    }
    
    try {
      // Replace model in body
      const requestBody = { ...body, model: target.model };
      
      const response = await proxyToProvider(c, provider, requestBody, {
        timeout: routeConfig.timeout || 30000,
      });
      
      if (response.ok) {
        return response;
      }
      
      // Check if we should fallback
      if (shouldFallback(response.status, routeConfig.fallbackOn)) {
        errors.push(new Error(`${target.provider}: HTTP ${response.status}`));
        continue;
      }
      
      // Return error response
      return response;
    } catch (error) {
      errors.push(error as Error);
      
      if (!shouldFallbackOnError(error, routeConfig.fallbackOn)) {
        throw error;
      }
    }
  }
  
  // All providers failed
  return c.json({
    error: {
      message: `All providers failed: ${errors.map(e => e.message).join(', ')}`,
      type: 'provider_error',
    },
  }, 502);
}

async function proxyToProvider(
  c: Context,
  provider: ProviderConfig,
  body: any,
  options: { timeout: number }
): Promise<Response> {
  const apiKey = getProviderApiKey(provider.id);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [provider.authHeader]: `${provider.authPrefix}${apiKey}`,
  };
  
  if (provider.apiVersion) {
    headers['anthropic-version'] = provider.apiVersion;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);
  
  try {
    const response = await fetch(`${provider.baseUrl}${provider.endpoints.chat}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getProviderApiKey(providerId: string): string {
  const envMap: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    nebius: 'NEBIUS_API_KEY',
    deepinfra: 'DEEPINFRA_API_KEY',
  };
  
  const envKey = envMap[providerId];
  if (!envKey) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  
  const key = process.env[envKey];
  if (!key) {
    throw new Error(`Missing API key for ${providerId}`);
  }
  
  return key;
}

function shouldFallback(status: number, fallbackOn: string[]): boolean {
  if (fallbackOn.includes('5xx') && status >= 500) return true;
  if (fallbackOn.includes('4xx') && status >= 400 && status < 500) return true;
  if (fallbackOn.includes('rate_limit') && status === 429) return true;
  return false;
}

function shouldFallbackOnError(error: unknown, fallbackOn: string[]): boolean {
  if (error instanceof Error) {
    if (fallbackOn.includes('timeout') && error.name === 'AbortError') return true;
    if (fallbackOn.includes('timeout') && error.message.includes('timeout')) return true;
  }
  return false;
}
```

### Step 1.4: Update Server to Use New System

Modify `packages/gateway/src/server.ts`:

```typescript
import { registry } from './providers/registry.js';
import { routingTable } from './config/routing.js';
import { proxyWithFallback } from './router/fallback.js';

// Initialize at startup
registry.loadFromEnv();
routingTable.loadFromEnv();

// In request handler:
async function handleRequest(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  
  if (path === '/v1/chat/completions' && req.method === 'POST') {
    const body = await req.json();
    const modelAlias = body.model;
    
    // Resolve alias to route config
    const routeConfig = routingTable.resolve(modelAlias);
    if (!routeConfig) {
      return new Response(JSON.stringify({
        error: { message: `Unknown model: ${modelAlias}` }
      }), { status: 400 });
    }
    
    // Proxy with fallback
    return await proxyWithFallback(req, routeConfig, body);
  }
  
  // ... rest of handlers
}
```

## Phase 2: Create api.passy.ai

### Step 2.1: Initialize Project

```bash
mkdir api-passy-ai
cd api-passy-ai
npm init -y
npm install hono @hono/zod-openapi zod prisma @prisma/client
npm install -D typescript @types/node tsx
```

### Step 2.2: Setup Prisma

Copy schema from emby-portal:

```bash
cp ../emby-portal/prisma/schema.prisma ./prisma/
npx prisma generate
```

### Step 2.3: Create Basic Structure

`src/app.ts`:

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { prisma } from './lib/prisma.js';
import { chatRouter } from './routes/chat.js';
import { keysRouter } from './routes/keys.js';
import { modelsRouter } from './routes/models.js';

const app = new Hono();

// CORS
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Routes
app.route('/v1/chat/completions', chatRouter);
app.route('/v1/models', modelsRouter);
app.route('/keys', keysRouter);

// Error handling
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
```

### Step 2.4: Create Chat Route

`src/routes/chat.ts`:

```typescript
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validateApiKey } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rate-limit.js';
import { selectProvider } from '../lib/provider-selection.js';
import { trackUsage } from '../lib/usage.js';
import { miniLLM } from '../lib/mini-llm.js';

const app = new Hono();

app.post('/', async (c) => {
  // 1. Authenticate
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or invalid Authorization header' });
  }
  
  const apiKeyToken = authHeader.slice(7);
  const apiKey = await validateApiKey(apiKeyToken);
  
  // 2. Check rate limits
  await checkRateLimit(apiKey);
  
  // 3. Parse request
  const body = await c.req.json();
  const { model, messages, stream = false } = body;
  
  // 4. Select provider (business logic)
  const provider = await selectProvider(model, apiKey);
  
  // 5. Route via Mini-LLM SDK
  const response = await miniLLM.route({
    model,
    messages,
    provider: provider.id,
    stream,
  });
  
  // 6. Track usage (async)
  if (!stream && response.usage) {
    trackUsage({
      apiKeyId: apiKey.id,
      model,
      provider: provider.id,
      usage: response.usage,
    }).catch(console.error);
  }
  
  return c.json(response);
});

export const chatRouter = app;
```

### Step 2.5: Create Provider Selection Logic

`src/lib/provider-selection.ts`:

```typescript
import { prisma } from './prisma.js';
import { miniLLM } from './mini-llm.js';

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
}

export async function selectProvider(
  model: string,
  apiKey: { organizationId: string }
): Promise<Provider> {
  // 1. Check for custom/BYOK provider
  const customProvider = await prisma.customProvider.findFirst({
    where: {
      organizationId: apiKey.organizationId,
      status: 'active',
      providerModels: {
        some: { modelId: model },
      },
    },
  });
  
  if (customProvider) {
    return {
      id: `custom-${customProvider.id}`,
      name: customProvider.name,
      baseUrl: customProvider.baseUrl!,
    };
  }
  
  // 2. Use Mini-LLM SDK routing
  const route = miniLLM.getRoute(model);
  if (!route) {
    throw new Error(`Model not available: ${model}`);
  }
  
  // 3. Return first available provider
  return {
    id: route.targets[0].provider,
    name: route.targets[0].provider,
    baseUrl: '',  // SDK knows this
  };
}
```

### Step 2.6: Create Mini-LLM Integration

`src/lib/mini-llm.ts`:

```typescript
// Client for Mini-LLM SDK
const MINI_LLM_URL = process.env.MINI_LLM_URL || 'http://localhost:3333';

export const miniLLM = {
  async route(options: {
    model: string;
    messages: any[];
    provider?: string;
    stream?: boolean;
  }) {
    const response = await fetch(`${MINI_LLM_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        stream: options.stream,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Mini-LLM error');
    }
    
    return await response.json();
  },
  
  getRoute(model: string) {
    // Query Mini-LLM for route config
    // This would be an API endpoint in Mini-LLM
    return null;  // Placeholder
  },
};
```

## Phase 3: Simplify Portal

### Step 3.1: Remove Proxy Routes

In `src/app.ts`:

```typescript
// REMOVE these imports:
// import { gatewayProxy } from "./routes/gateway-proxy.js";
// import { models } from "./routes/models.js";

// REMOVE these routes:
// app.route("/api/llm", gatewayProxy);
// app.route("/v1", models);
// app.route("/v1", gatewayProxy);
```

### Step 3.2: Update Key Creation

In `src/routes/emby-keys.ts`:

```typescript
// Change from Gateway to api.passy.ai
const API_PASSY_AI_URL = process.env.API_PASSY_AI_URL || 'http://localhost:3000';

// Replace Gateway call:
const apiResponse = await fetch(`${API_PASSY_AI_URL}/keys/api`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Emby-Secure-Key': EMBY_SECURE_KEY,
    'X-Authenticated-User': user.id,
  },
  body: JSON.stringify({
    email: isTestBool ? undefined : email,
    description: isTestBool ? "Test Key" : (isTrialKey ? "Trial Key" : (description || "Emby-generated API Key")),
    usageLimit: usageLimit ?? null,
    isTrial: isTrialKey,
    isTest: isTestKey,
  }),
});
```

### Step 3.3: Update Frontend

Change API endpoint in frontend code:

```typescript
// OLD:
const API_BASE = '/v1';

// NEW:
const API_BASE = 'http://localhost:3000/v1';  // api.passy.ai
```

## Running Locally

### Terminal 1: Mini-LLM SDK

```bash
cd mini-llm-sdk/packages/gateway
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export NEBIUS_API_KEY="..."
export DEEPINFRA_API_KEY="..."
npm start
# Runs on http://localhost:3333
```

### Terminal 2: api.passy.ai

```bash
cd api-passy-ai
export DATABASE_URL="postgresql://postgres:password@localhost:5432/portal2_db"
export REDIS_URL="redis://localhost:6379"
export MINI_LLM_URL="http://localhost:3333"
npx tsx src/index.ts
# Runs on http://localhost:3000
```

### Terminal 3: passy-portal

```bash
cd passy-portal
export DATABASE_URL="postgresql://postgres:password@localhost:5432/portal2_db"
export API_PASSY_AI_URL="http://localhost:3000"
npm run dev
# Runs on http://localhost:3005
```

## Testing

1. **Create API key** via portal (http://localhost:3005)
2. **Test API** directly:
   ```bash
   curl http://localhost:3000/v1/chat/completions \
     -H "Authorization: Bearer YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "llama-70b",
       "messages": [{"role": "user", "content": "Hello!"}]
     }'
   ```
3. **Verify fallback**: Stop one provider, request should still work
4. **Check usage**: View in portal dashboard

## Next Steps

1. Test thoroughly locally
2. Add Docker Compose for easy local setup
3. Deploy to Dokploy
4. Configure domains (api.passy.ai, passy.ai)