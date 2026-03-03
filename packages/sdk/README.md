# @mini-passy/cli

CLI and SDK for running Mini-Passy - a lightweight AI gateway for routing LLM requests.

## What is Mini-Passy?

Mini-Passy is a local HTTP gateway that provides a unified OpenAI-compatible API for multiple LLM providers (OpenAI, Anthropic, DeepSeek, Nebius, DeepInfra). It handles:

- Provider routing via model aliases (e.g., `gpt4o`, `kimi_k2_5`, `deepseek`)
- Automatic fallback between providers
- Streaming responses (Server-Sent Events)
- Tool calling support

## Installation

```bash
# Global install
npm install -g @mini-passy/cli

# Or use via npx (no install)
npx @mini-passy/cli
```

## Quick Start

### 1. Create a `.env` file

```bash
# Required: At least one provider API key
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
NEBIUS_API_KEY=...
DEEPINFRA_API_KEY=...

# Optional: Model aliases (defaults provided)
ALIAS_GPT4O=openai:gpt-4o
ALIAS_KIMI_K2_5=deepinfra:moonshotai/Kimi-K2.5
ALIAS_DEEPSEEK=deepseek:deepseek-chat

# Optional: Port (default: 3333)
PORT=3333
```

### 2. Run the gateway

```bash
# If installed globally
mini-passy

# Or via npx
npx @mini-passy/cli
```

The gateway will start on `http://127.0.0.1:3333` (or next available port).

### 3. Use it

```bash
# List available models
curl http://localhost:3333/v1/models

# Chat completion
curl -X POST http://localhost:3333/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## CLI Commands

### `mini-passy`

Start the gateway server.

**Environment Variables:**
- `PORT` - Server port (default: 3333)
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `DEEPSEEK_API_KEY` - DeepSeek API key
- `NEBIUS_API_KEY` - Nebius API key
- `DEEPINFRA_API_KEY` - DeepInfra API key
- `ALIAS_*` - Model aliases (see Configuration)

**Examples:**

```bash
# Start with default port
mini-passy

# Start on specific port
PORT=8080 mini-passy

# With specific provider
DEEPSEEK_API_KEY=sk-... mini-passy
```

### `mini-passy --version`

Show version information.

### `mini-passy --help`

Show help message.

## Configuration

### Model Aliases

Aliases map short names to provider:model pairs:

```env
ALIAS_GPT4O=openai:gpt-4o
ALIAS_CLAUDE=anthropic:claude-3-5-sonnet-20241022
ALIAS_KIMI_K2=deepinfra:moonshotai/Kimi-K2-Thinking
ALIAS_KIMI_K2_5=deepinfra:moonshotai/Kimi-K2.5
ALIAS_DEEPSEEK=deepseek:deepseek-chat
```

Use aliases in API calls:
```json
{
  "model": "kimi_k2_5",
  "messages": [...]
}
```

### Provider Configuration

Each provider needs its API key:

| Provider | Env Variable | Base URL |
|----------|-------------|----------|
| OpenAI | `OPENAI_API_KEY` | https://api.openai.com/v1 |
| Anthropic | `ANTHROPIC_API_KEY` | https://api.anthropic.com/v1 |
| DeepSeek | `DEEPSEEK_API_KEY` | https://api.deepseek.com/v1 |
| Nebius | `NEBIUS_API_KEY` | https://api.studio.nebius.ai/v1 |
| DeepInfra | `DEEPINFRA_API_KEY` | https://api.deepinfra.com/v1/openai |

## Programmatic Usage

Use the SDK to manage the gateway programmatically:

```typescript
import { createMiniPassy } from "@mini-passy/cli";

// Create instance
const miniPassy = createMiniPassy({
  port: 3333,
  env: {
    DEEPSEEK_API_KEY: "sk-...",
    DEEPINFRA_API_KEY: "...",
  }
});

// Start gateway
await miniPassy.ready();
console.log("Gateway running at:", miniPassy.url);

// Use the API
const response = await fetch(`${miniPassy.url}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "kimi_k2_5",
    messages: [{ role: "user", content: "Hello!" }]
  })
});

// Stop gateway
await miniPassy.stop();
```

## Developer Experience

### Local Development Workflow

```bash
# 1. Create project directory
mkdir my-ai-project && cd my-ai-project

# 2. Create .env with your API keys
cat > .env << 'EOF'
DEEPSEEK_API_KEY=sk-...
DEEPINFRA_API_KEY=...
ALIAS_KIMI_K2_5=deepinfra:moonshotai/Kimi-K2.5
EOF

# 3. Run gateway
npx @mini-passy/cli

# 4. In another terminal, test it
curl http://localhost:3333/v1/models
curl -X POST http://localhost:3333/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"kimi_k2_5","messages":[{"role":"user","content":"Hi"}]}'
```

### Integration with Applications

**Node.js:**
```javascript
import { createMiniPassy } from "@mini-passy/cli";

const miniPassy = createMiniPassy();
await miniPassy.ready();

// Use with OpenAI SDK
import OpenAI from "openai";
const openai = new OpenAI({
  baseURL: miniPassy.url + "/v1",
  apiKey: "dummy" // Gateway handles auth
});
```

**Python:**
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3333/v1",
    api_key="dummy"
)

response = client.chat.completions.create(
    model="kimi_k2_5",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Environment Management

The CLI looks for `.env` in the current working directory. This means:

- Each project can have its own `.env`
- Switch projects = switch configurations
- No global state or conflicts

```bash
# Project A - uses DeepSeek
cd project-a
npx @mini-passy/cli

# Project B - uses OpenAI
cd ../project-b
npx @mini-passy/cli
```

## Troubleshooting

### "No providers configured"

Add at least one API key to your `.env` file:
```env
DEEPSEEK_API_KEY=sk-...
```

### "Model not found"

Check your alias configuration:
```bash
curl http://localhost:3333/v1/models
```

Add the alias to `.env`:
```env
ALIAS_MYMODEL=provider:actual-model-name
```

### Port already in use

The gateway auto-increments ports (3333 → 3334 → ...). Check the output for the actual port, or set a specific one:
```bash
PORT=8080 mini-passy
```

## API Reference

The gateway provides an OpenAI-compatible API:

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completions (streaming supported)
- `POST /v1/completions` - Text completions

See [OpenAI API docs](https://platform.openai.com/docs/api-reference) for full details.

## License

MIT
