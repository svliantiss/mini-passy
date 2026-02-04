# Mini-LLM SDK: Final Design

## Core Idea

**Just proxy. No model discovery. No intelligence.**

The client tells us the provider. We just proxy.

## Usage

```bash
# Set your providers
export OPENAI_KEY=sk-...
export ANTHROPIC_KEY=sk-ant-...
export NEBIUS_KEY=...

# Run
npx mini-llm

# Use
# OpenAI format → OpenAI
# Anthropic format → Anthropic
# Custom → Custom
```

## Design

### URL Format

```
http://localhost:3333/{provider}/v1/...
http://localhost:3333/{provider}/v1/models
http://localhost:3333/{provider}/v1/chat/completions
```

Examples:
```
POST http://localhost:3333/openai/v1/chat/completions
POST http://localhost:3333/anthropic/v1/messages
GET  http://localhost:3333/nebius/v1/models
```

### Implementation (~50 lines)

```typescript
import http from "node:http";
import https from "node:https";

// Map provider names to env vars
const keys: Record<string, string> = {
  openai: process.env.OPENAI_KEY!,
  anthropic: process.env.ANTHROPIC_KEY!,
  nebius: process.env.NEBIUS_KEY!,
  deepinfra: process.env.DEEPINFRA_KEY!,
};

// Provider base URLs
const urls: Record<string, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  nebius: "https://api.studio.nebius.ai",
  deepinfra: "https://api.deepinfra.com",
};

const server = http.createServer((req, res) => {
  // Parse: /{provider}/v1/...
  const match = req.url?.match(/^\/([^\/]+)(\/.*)$/);
  if (!match) {
    res.writeHead(404);
    return res.end("Use /{provider}/v1/...");
  }
  
  const [, provider, path] = match;
  const baseUrl = urls[provider];
  const key = keys[provider];
  
  if (!baseUrl || !key) {
    res.writeHead(404);
    return res.end(`Unknown provider: ${provider}`);
  }
  
  // Proxy to provider
  const url = new URL(baseUrl);
  const options: https.RequestOptions = {
    hostname: url.hostname,
    port: 443,
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: url.hostname,
      authorization: `Bearer ${key}`,
    },
  };
  
  // Anthropic needs special header
  if (provider === "anthropic") {
    options.headers!["x-api-key"] = key;
    options.headers!["anthropic-version"] = "2023-06-01";
    delete options.headers!.authorization;
  }
  
  const upstream = https.request(options, (upRes) => {
    res.writeHead(upRes.statusCode!, upRes.headers);
    upRes.pipe(res);
  });
  
  upstream.on("error", (err) => {
    res.writeHead(502);
    res.end(JSON.stringify({ error: err.message }));
  });
  
  req.pipe(upstream);
});

server.listen(3333, () => console.log("Mini-LLM on :3333"));
```

## passy.ai Integration

passy.ai just adds itself as another provider:

```typescript
spawn("npx", ["mini-llm"], {
  env: {
    OPENAI_KEY: process.env.OPENAI_KEY,
    ANTHROPIC_KEY: process.env.ANTHROPIC_KEY,
    NEBIUS_KEY: process.env.NEBIUS_KEY,
    PASSY_KEY: internalKey,  // passy.ai's own routing
  }
});

// Then in passy.ai config:
// urls['passy'] = 'http://localhost:4002'
```

## Client Usage

```bash
# Direct to OpenAI
curl http://localhost:3333/openai/v1/chat/completions \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}]}'

# Direct to Anthropic  
curl http://localhost:3333/anthropic/v1/messages \
  -d '{"model":"claude-sonnet-4-5","messages":[{"role":"user","content":"Hi"}]}'

# To passy.ai (with routing logic)
curl http://localhost:3333/passy/v1/chat/completions \
  -d '{"model":"llama-70b","messages":[{"role":"user","content":"Hi"}]}'
```

## That's It

- No model discovery
- No model mapping
- No aliases
- No config files
- Just proxy by provider name

**~50 lines. Done.**