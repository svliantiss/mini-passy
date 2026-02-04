# Mini-LLM SDK: Ultra-Simple Design

## Philosophy

**Zero hardcoding. Zero config files. Just environment variables.**

## Design

### Provider Discovery

Providers are defined entirely by environment variables:

```bash
# Format: PROVIDER_<ID>_URL and PROVIDER_<ID>_KEY

# OpenAI
PROVIDER_OPENAI_URL=https://api.openai.com
PROVIDER_OPENAI_KEY=sk-...

# Anthropic
PROVIDER_ANTHROPIC_URL=https://api.anthropic.com
PROVIDER_ANTHROPIC_KEY=sk-ant-...

# Nebius
PROVIDER_NEBIUS_URL=https://api.studio.nebius.ai
PROVIDER_NEBIUS_KEY=...

# Any custom provider
PROVIDER_MYCORP_URL=https://ai.mycorp.com
PROVIDER_MYCORP_KEY=secret
```

### Model Discovery

SDK fetches models from each provider's `/v1/models` endpoint on startup:

```typescript
// On startup, fetch models from all providers
for (const provider of providers) {
  const response = await fetch(`${provider.url}/v1/models`, {
    headers: { 'Authorization': `Bearer ${provider.key}` }
  });
  const data = await response.json();
  provider.models = data.data.map(m => m.id);
}
```

### Request Routing

Client sends model ID, SDK finds which provider has it:

```typescript
// Client request
{ "model": "gpt-4o", "messages": [...] }

// SDK finds provider with this model
const provider = providers.find(p => p.models.includes("gpt-4o"));

// Proxy to that provider
fetch(`${provider.url}/v1/chat/completions`, ...)
```

## Implementation (Single File)

`src/server.ts` (complete rewrite, ~100 lines):

```typescript
import http from "node:http";
import https from "node:https";

// Parse providers from env
const providers: Map<string, { url: string; key: string; models: string[] }> = new Map();

for (const [key, value] of Object.entries(process.env)) {
  const match = key.match(/^PROVIDER_(.+)_URL$/);
  if (match) {
    const id = match[1].toLowerCase();
    const url = value;
    const apiKey = process.env[`PROVIDER_${match[1]}_KEY`];
    if (apiKey) {
      providers.set(id, { url, key: apiKey, models: [] });
    }
  }
}

// Fetch models from all providers
async function fetchModels() {
  for (const [id, provider] of providers) {
    try {
      const res = await fetch(`${provider.url}/v1/models`, {
        headers: { 'Authorization': `Bearer ${provider.key}` }
      });
      if (res.ok) {
        const data = await res.json();
        provider.models = data.data?.map((m: any) => m.id) || [];
        console.log(`[${id}] Models: ${provider.models.length}`);
      }
    } catch (e) {
      console.error(`[${id}] Failed to fetch models:`, e);
    }
  }
}

// Find provider for model
function findProvider(model: string) {
  for (const [id, provider] of providers) {
    if (provider.models.includes(model)) {
      return { id, ...provider };
    }
  }
  return null;
}

// Proxy request
function proxy(req: http.IncomingMessage, res: http.ServerResponse, provider: any, body: any) {
  const payload = JSON.stringify(body);
  const url = new URL(provider.url);
  
  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "Authorization": `Bearer ${provider.key}`,
    },
  };
  
  const upstream = https.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  
  upstream.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  });
  
  upstream.write(payload);
  upstream.end();
}

// Parse body
function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Server
const server = http.createServer(async (req, res) => {
  const path = req.url || "/";
  
  // Health
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", providers: providers.size }));
  }
  
  // List all models from all providers
  if (path === "/v1/models") {
    const allModels = [];
    for (const [id, provider] of providers) {
      for (const model of provider.models) {
        allModels.push({
          id: model,
          object: "model",
          owned_by: id,
        });
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ object: "list", data: allModels }));
  }
  
  // Chat completions
  if (path === "/v1/chat/completions" && req.method === "POST") {
    const body = JSON.parse(await parseBody(req));
    const model = body.model;
    
    const provider = findProvider(model);
    if (!provider) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: `Model not found: ${model}` }));
    }
    
    return proxy(req, res, provider, body);
  }
  
  res.writeHead(404);
  res.end("Not found");
});

// Start
const PORT = parseInt(process.env.MINI_LLM_PORT || "3333", 10);

fetchModels().then(() => {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`Mini-LLM on http://127.0.0.1:${PORT}`);
    console.log(`Providers: ${Array.from(providers.keys()).join(", ")}`);
  });
});
```

## Usage

```bash
# Set providers
export PROVIDER_OPENAI_URL=https://api.openai.com
export PROVIDER_OPENAI_KEY=sk-...
export PROVIDER_NEBIUS_URL=https://api.studio.nebius.ai
export PROVIDER_NEBIUS_KEY=...

# Run
npx tsx src/server.ts

# Test
curl http://localhost:3333/v1/models
curl http://localhost:3333/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}]}'
```

## For passy.ai Integration

passy.ai just sets env vars and spawns:

```typescript
const miniLLM = spawn("npx", ["tsx", "mini-llm/src/server.ts"], {
  env: {
    ...process.env,
    // passy.ai provides all providers
    PROVIDER_NEBIUS_URL: "https://api.studio.nebius.ai",
    PROVIDER_NEBIUS_KEY: process.env.NEBIUS_API_KEY,
    PROVIDER_DEEPINFRA_URL: "https://api.deepinfra.com",
    PROVIDER_DEEPINFRA_KEY: process.env.DEEPINFRA_API_KEY,
    // passy.ai's own endpoint as another provider
    PROVIDER_PASSY_URL: "http://localhost:4002",
    PROVIDER_PASSY_KEY: internalKey,
  }
});
```

## Anthropic Compatibility

If a provider uses Anthropic format (like `/v1/messages`), SDK doesn't care:

```typescript
// Client requests OpenAI format
{ "model": "claude-sonnet", "messages": [...] }

// SDK finds provider with "claude-sonnet" model
// Proxies to provider's /v1/chat/completions
// Provider handles OpenAI → Anthropic translation
```

If provider ONLY supports Anthropic native:

```bash
# Client uses Anthropic SDK directly
# Points to Mini-LLM as base URL
# Mini-LLM proxies to provider's /v1/messages
```

## That's It

- No config files
- No hardcoded providers
- No hardcoded models
- No aliases
- Just env vars and proxy

**~100 lines of code.**