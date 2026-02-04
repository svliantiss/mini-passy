# Mini-LLM SDK: Simple Auto-Discovery Proxy

## Understanding the Current Code

Looking at the existing handlers:

**OpenAI** (`openai.ts`):
- Endpoint: `/v1/chat/completions`
- Auth: `Authorization: Bearer {key}`
- Models endpoint: `/v1/models`
- Streaming: Supported via SSE

**Anthropic** (`anthropic.ts`):
- Endpoint: `/v1/messages`
- Auth: `x-api-key: {key}` + `anthropic-version: 2023-06-01`
- Models endpoint: `/v1/models` (different format)
- Streaming: Supported via SSE

## Key Insight

**A provider can support BOTH formats or just one.**

We auto-discover by trying endpoints:
1. Try `/v1/models` (OpenAI compatible)
2. Try `/v1/models` with different auth (Anthropic)
3. Provider responds to whichever it supports

## Design

### Configuration (Environment Variables)

```bash
# Format: PROVIDER_{NAME}_URL and PROVIDER_{NAME}_KEY
PROVIDER_OPENAI_URL=https://api.openai.com
PROVIDER_OPENAI_KEY=sk-...

PROVIDER_ANTHROPIC_URL=https://api.anthropic.com
PROVIDER_ANTHROPIC_KEY=sk-ant-...

PROVIDER_NEBIUS_URL=https://api.studio.nebius.ai
PROVIDER_NEBIUS_KEY=...
```

### Auto-Discovery on Startup

```typescript
interface ProviderCapabilities {
  openaiCompatible: boolean;    // Has /v1/models, /v1/chat/completions
  anthropicCompatible: boolean; // Has /v1/models, /v1/messages
  models: string[];
}

async function discoverProvider(url: string, key: string): Promise<ProviderCapabilities> {
  const caps: ProviderCapabilities = {
    openaiCompatible: false,
    anthropicCompatible: false,
    models: [],
  };
  
  // Try OpenAI-style /v1/models
  try {
    const res = await fetch(`${url}/v1/models`, {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      caps.openaiCompatible = true;
      caps.models = data.data?.map((m: any) => m.id) || [];
    }
  } catch { /* ignore */ }
  
  // Try Anthropic-style (if OpenAI failed or for additional models)
  if (!caps.openaiCompatible || caps.models.length === 0) {
    try {
      const res = await fetch(`${url}/v1/models`, {
        headers: { 
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        caps.anthropicCompatible = true;
        // Anthropic might return different format
        const anthropicModels = data.data?.map((m: any) => m.id) || [];
        caps.models = [...caps.models, ...anthropicModels];
      }
    } catch { /* ignore */ }
  }
  
  return caps;
}
```

### Request Routing

Client specifies model. We find which provider has it and what format to use:

```typescript
// Client request
POST /v1/chat/completions
{ "model": "claude-3-sonnet", "messages": [...] }

// SDK finds provider with "claude-3-sonnet"
const provider = providers.find(p => p.models.includes("claude-3-sonnet"));

// Route based on provider's capabilities
if (provider.caps.openaiCompatible) {
  // Use OpenAI format
  proxyToProvider(provider, '/v1/chat/completions', body, 'openai');
} else if (provider.caps.anthropicCompatible) {
  // Use Anthropic format
  proxyToProvider(provider, '/v1/messages', convertToAnthropic(body), 'anthropic');
}
```

### Unified Proxy Function

```typescript
function proxyToProvider(
  provider: Provider,
  path: string,
  body: any,
  format: 'openai' | 'anthropic',
  res: http.ServerResponse
) {
  const payload = JSON.stringify(body);
  const url = new URL(provider.url);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload).toString(),
  };
  
  if (format === 'openai') {
    headers['Authorization'] = `Bearer ${provider.key}`;
  } else {
    headers['x-api-key'] = provider.key;
    headers['anthropic-version'] = '2023-06-01';
  }
  
  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: 443,
    path,
    method: 'POST',
    headers,
  };
  
  const upstream = https.request(options, (upRes) => {
    // Handle streaming
    const isStreaming = body.stream || upRes.headers['content-type']?.includes('text/event-stream');
    
    res.writeHead(upRes.statusCode || 200, {
      'Content-Type': isStreaming ? 'text/event-stream' : 'application/json',
      ...(isStreaming && {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }),
    });
    
    upRes.pipe(res);
  });
  
  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
  
  upstream.write(payload);
  upstream.end();
}
```

### Server Handler

```typescript
const server = http.createServer(async (req, res) => {
  const path = req.url || '/';
  
  // Health check
  if (path === '/health') {
    return sendJson(res, { 
      status: 'ok', 
      providers: providers.map(p => ({ 
        name: p.name, 
        models: p.models.length,
        formats: {
          openai: p.caps.openaiCompatible,
          anthropic: p.caps.anthropicCompatible,
        }
      }))
    });
  }
  
  // List all models from all providers
  if (path === '/v1/models') {
    const allModels = providers.flatMap(p => 
      p.models.map(m => ({
        id: m,
        object: 'model',
        owned_by: p.name,
      }))
    );
    return sendJson(res, { object: 'list', data: allModels });
  }
  
  // Chat completions
  if (path === '/v1/chat/completions' && req.method === 'POST') {
    const body = JSON.parse(await parseBody(req));
    const model = body.model;
    
    // Find provider with this model
    const provider = providers.find(p => p.models.includes(model));
    if (!provider) {
      return sendJson(res, { error: `Model not found: ${model}` }, 404);
    }
    
    // Route based on provider capabilities
    if (provider.caps.openaiCompatible) {
      return proxyToProvider(provider, '/v1/chat/completions', body, 'openai', res);
    } else if (provider.caps.anthropicCompatible) {
      // Convert OpenAI format to Anthropic
      const anthropicBody = {
        model: model,
        messages: body.messages,
        max_tokens: body.max_tokens || 4096,
        stream: body.stream,
      };
      return proxyToProvider(provider, '/v1/messages', anthropicBody, 'anthropic', res);
    }
    
    return sendJson(res, { error: 'Provider format not supported' }, 500);
  }
  
  // Anthropic native endpoint (optional)
  if (path === '/v1/messages' && req.method === 'POST') {
    // Similar to above but keep Anthropic format
  }
  
  res.writeHead(404);
  res.end('Not found');
});
```

## For passy.ai Integration

passy.ai sets up providers and Mini-LLM auto-discovers:

```typescript
spawn('npx', ['tsx', 'mini-llm/src/index.ts'], {
  env: {
    PROVIDER_NEBIUS_URL: 'https://api.studio.nebius.ai',
    PROVIDER_NEBIUS_KEY: process.env.NEBIUS_API_KEY,
    PROVIDER_DEEPINFRA_URL: 'https://api.deepinfra.com',
    PROVIDER_DEEPINFRA_KEY: process.env.DEEPINFRA_API_KEY,
    // passy.ai can add its own endpoint
    PROVIDER_PASSY_URL: 'http://localhost:4002',
    PROVIDER_PASSY_KEY: internalKey,
  }
});
```

On startup, Mini-LLM:
1. Parses all `PROVIDER_*_URL` and `PROVIDER_*_KEY`
2. Calls `/v1/models` on each to discover capabilities
3. Stores which formats each provider supports
4. Routes requests accordingly

## Summary

- **No hardcoded providers**: All from env vars
- **Auto-discovery**: Try `/v1/models` with OpenAI and Anthropic auth
- **Dual format support**: Provider can support both OpenAI and Anthropic formats
- **Simple routing**: Find provider by model ID, use appropriate format
- **Streaming**: Works with both formats

**~150 lines total**