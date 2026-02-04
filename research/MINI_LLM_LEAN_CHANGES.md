# Mini-LLM SDK: Lean Changes for passy.ai Integration

## Goal

Make minimal changes to Mini-LLM SDK so it can be easily integrated into passy.ai. Focus only on what's needed NOW.

## Current State

```
mini-llm-sdk/packages/gateway/src/
├── index.ts          # Entry point, port auto-increment
├── server.ts         # HTTP server, request routing
├── env.ts            # Environment config
├── alias.ts          # Model aliasing (simple)
├── health.ts         # Health check
└── router/
    ├── index.ts      # Exports
    ├── openai.ts     # OpenAI provider handler
    └── anthropic.ts  # Anthropic provider handler
```

**Current Limitations**:
- Hardcoded providers (OpenAI, Anthropic only)
- Simple model aliasing (no fallback)
- No way to add custom providers

## Required Changes (Minimal)

### 1. Add Provider Configuration (1 file)

Create `src/config.ts`:

```typescript
// Simple provider configuration
export interface ProviderConfig {
  id: string;
  baseUrl: string;
  authHeader: string;
  authPrefix: string;
  apiVersion?: string;
}

// Load from environment
export function loadProviders(): Map<string, ProviderConfig> {
  const providers = new Map<string, ProviderConfig>();
  
  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    providers.set('openai', {
      id: 'openai',
      baseUrl: 'https://api.openai.com',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
    });
  }
  
  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    providers.set('anthropic', {
      id: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      authHeader: 'x-api-key',
      authPrefix: '',
      apiVersion: '2023-06-01',
    });
  }
  
  // Nebius (NEW)
  if (process.env.NEBIUS_API_KEY) {
    providers.set('nebius', {
      id: 'nebius',
      baseUrl: 'https://api.studio.nebius.ai',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
    });
  }
  
  // DeepInfra (NEW)
  if (process.env.DEEPINFRA_API_KEY) {
    providers.set('deepinfra', {
      id: 'deepinfra',
      baseUrl: 'https://api.deepinfra.com',
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
    });
  }
  
  // Custom provider from env (NEW - for passy.ai integration)
  if (process.env.CUSTOM_PROVIDER_URL && process.env.CUSTOM_PROVIDER_KEY) {
    providers.set('custom', {
      id: 'custom',
      baseUrl: process.env.CUSTOM_PROVIDER_URL,
      authHeader: 'Authorization',
      authPrefix: 'Bearer ',
    });
  }
  
  return providers;
}

// Model routing (simple alias → provider:model)
export function resolveModel(alias: string, providers: Map<string, ProviderConfig>): { provider: string; model: string } | null {
  const routes: Record<string, { provider: string; model: string }> = {
    // OpenAI models
    'gpt-4o': { provider: 'openai', model: 'gpt-4o' },
    'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
    
    // Anthropic models
    'claude-sonnet': { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    'claude-haiku': { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
    
    // Nebius models (NEW)
    'llama-70b': { provider: 'nebius', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
    'llama-8b': { provider: 'nebius', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct' },
    
    // DeepInfra models (NEW)
    'llama-70b-alt': { provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct' },
  };
  
  return routes[alias] || null;
}
```

### 2. Update Router to Use Config (Modify 1 file)

Modify `src/router/openai.ts` → rename to `src/router/proxy.ts`:

```typescript
// Generic proxy for any OpenAI-compatible provider
import type http from "node:http";
import https from "node:https";
import type { ProviderConfig } from "../config.js";

export function proxyChatCompletion(
  res: http.ServerResponse,
  body: Record<string, unknown>,
  provider: ProviderConfig,
  apiKey: string,
  resolvedModel: string
): void {
  // Replace model with resolved upstream model
  body.model = resolvedModel;
  const payload = JSON.stringify(body);
  
  const options: https.RequestOptions = {
    hostname: provider.baseUrl.replace(/^https?:\/\//, ''),
    port: 443,
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      [provider.authHeader]: `${provider.authPrefix}${apiKey}`,
    },
  };
  
  // Add Anthropic version header if needed
  if (provider.apiVersion) {
    options.headers!["anthropic-version"] = provider.apiVersion;
  }
  
  const upstream = https.request(options, (upstreamRes) => {
    // Stream passthrough
    if (body.stream) {
      res.writeHead(upstreamRes.statusCode || 200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      upstreamRes.pipe(res);
    } else {
      res.writeHead(upstreamRes.statusCode || 200, {
        "Content-Type": "application/json",
      });
      upstreamRes.pipe(res);
    }
  });
  
  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  });
  
  upstream.write(payload);
  upstream.end();
}
```

### 3. Update Server to Route by Model (Modify 1 file)

Modify `src/server.ts`:

```typescript
import http from "node:http";
import { loadEnv } from "./env.js";
import { loadProviders, resolveModel } from "./config.js";  // NEW
import { proxyChatCompletion } from "./router/proxy.js";     // NEW

const env = loadEnv();
const providers = loadProviders();  // NEW

// ... existing parseBody, sendJson ...

async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const path = req.url || "/";
  const method = req.method || "GET";
  
  // Health check (unchanged)
  if (path === "/health" && method === "GET") {
    return sendJson(res, { status: "ok" });
  }
  
  // Chat completions (MODIFIED)
  if (path === "/v1/chat/completions" && method === "POST") {
    const rawBody = await parseBody(req);
    const body = JSON.parse(rawBody);
    const modelAlias = body.model as string;
    
    // Resolve alias to provider + model
    const resolved = resolveModel(modelAlias, providers);
    if (!resolved) {
      return sendJson(res, { error: `Unknown model: ${modelAlias}` }, 400);
    }
    
    const provider = providers.get(resolved.provider);
    if (!provider) {
      return sendJson(res, { error: `Provider not configured: ${resolved.provider}` }, 500);
    }
    
    // Get API key for provider
    const apiKey = getApiKey(resolved.provider);
    if (!apiKey) {
      return sendJson(res, { error: `API key not found for ${resolved.provider}` }, 500);
    }
    
    // Proxy to provider
    return proxyChatCompletion(res, body, provider, apiKey, resolved.model);
  }
  
  // Models endpoint (NEW - simple)
  if (path === "/v1/models" && method === "GET") {
    const models = [
      { id: "gpt-4o", object: "model" },
      { id: "gpt-4o-mini", object: "model" },
      { id: "claude-sonnet", object: "model" },
      { id: "llama-70b", object: "model" },
      { id: "llama-8b", object: "model" },
    ];
    return sendJson(res, { object: "list", data: models });
  }
  
  return sendJson(res, { error: "Not found" }, 404);
}

// Helper to get API key from env
function getApiKey(provider: string): string | undefined {
  const envMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    nebius: "NEBIUS_API_KEY",
    deepinfra: "DEEPINFRA_API_KEY",
    custom: "CUSTOM_PROVIDER_KEY",
  };
  return process.env[envMap[provider]];
}

// ... rest of server.ts ...
```

### 4. Remove Unused Files (Optional cleanup)

Can delete:
- `src/router/openai.ts` (replaced by proxy.ts)
- `src/router/anthropic.ts` (replaced by proxy.ts)
- `src/router/index.ts` (no longer needed)

## File Changes Summary

| Action | File | Lines |
|--------|------|-------|
| **CREATE** | `src/config.ts` | ~80 lines |
| **MODIFY** | `src/server.ts` | ~40 lines changed |
| **CREATE** | `src/router/proxy.ts` | ~60 lines |
| **DELETE** | `src/router/openai.ts` | -140 lines |
| **DELETE** | `src/router/anthropic.ts` | -69 lines |
| **DELETE** | `src/router/index.ts` | -6 lines |
| **NET** | | **~75 lines added** |

## Usage in passy.ai

```typescript
// passy.ai sets up Mini-LLM SDK as child process
import { spawn } from "child_process";

const miniLLM = spawn("npx", ["tsx", "mini-llm-gateway/src/index.ts"], {
  env: {
    ...process.env,
    // Passy.ai provides these:
    NEBIUS_API_KEY: process.env.NEBIUS_API_KEY,
    DEEPINFRA_API_KEY: process.env.DEEPINFRA_API_KEY,
    // Custom provider points to passy.ai's internal routing
    CUSTOM_PROVIDER_URL: "http://localhost:4002", // passy.ai internal
    CUSTOM_PROVIDER_KEY: internalApiKey,
  },
});

// Then proxy requests to Mini-LLM
const response = await fetch("http://localhost:3333/v1/chat/completions", {
  method: "POST",
  body: JSON.stringify({
    model: "llama-70b",  // Mini-LLM routes to nebius/deepinfra
    messages: [...],
  }),
});
```

## Environment Variables

```bash
# Existing
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
MINI_LLM_PORT=3333

# New (for passy.ai)
NEBIUS_API_KEY=...
DEEPINFRA_API_KEY=...
CUSTOM_PROVIDER_URL=https://api.passy.ai/internal  # Optional
CUSTOM_PROVIDER_KEY=...                            # Optional
```

## What This Enables

1. **passy.ai can use Mini-LLM SDK** as a child process
2. **Multiple providers**: OpenAI, Anthropic, Nebius, DeepInfra
3. **Simple model aliases**: `llama-70b` → actual provider model
4. **Custom provider**: passy.ai can inject its own routing layer
5. **Still lightweight**: Only ~75 net new lines

## What's NOT Included (Keep it lean)

- ❌ Fallback logic (passy.ai handles this)
- ❌ Rate limiting (passy.ai handles this)
- ❌ Usage tracking (passy.ai handles this)
- ❌ Complex routing rules (passy.ai handles this)
- ❌ Provider registry class (simple function is enough)
- ❌ BYOK UI (passy.ai portal handles this)

Mini-LLM SDK stays simple: **route requests to providers based on model alias**.