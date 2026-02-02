# Mini-LLM SDK

An embedded, routing-only LLM gateway + SDK. Zero external infrastructure required.

## Quick Start

```ts
import { miniLLM } from "mini-llm";

await miniLLM.ready();

// Use native fetch with the gateway URL
const response = await fetch(`${miniLLM.url}/v1/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello!" }],
    stream: true,
  }),
});
```

## Environment Variables

```bash
# Required: API keys for providers you want to use
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Gateway port (default: 3333)
MINI_LLM_PORT=3333

# Optional: Model aliases
MINI_LLM_MODEL_ALIASES='{"gpt-fast":"openai:gpt-4o-mini","claude-fast":"anthropic:claude-3-haiku-20240307"}'
```

## Supported Endpoints

### OpenAI Compatible
- `GET /health` → `{ "status": "ok" }`
- `GET /v1/models` → List of aliased models
- `POST /v1/chat/completions` → Chat completions (streaming supported)

### Anthropic Compatible
- `POST /v1/messages` → Messages API (streaming supported)

## Model Aliasing

Define aliases in `MINI_LLM_MODEL_ALIASES` to route requests:

```json
{
  "gpt-fast": "openai:gpt-4o-mini",
  "claude-fast": "anthropic:claude-3-haiku-20240307"
}
```

When you request `model: "gpt-fast"`, it routes to OpenAI's `gpt-4o-mini`.

## SDK API

```ts
import { miniLLM, createMiniLLM } from "mini-llm";

// Default singleton
await miniLLM.ready();
console.log(miniLLM.url); // http://127.0.0.1:3333
await miniLLM.stop();

// Custom instance
const custom = createMiniLLM({ port: 4000 });
await custom.ready();
```

## Running the Demo

```bash
# Set your API key
export OPENAI_API_KEY=sk-...

# Run demo
npm run demo
```

## Architecture

```
packages/
├── gateway/     # HTTP server, routing, streaming
├── sdk/         # Auto-lifecycle, process management
└── demo/        # Example usage
```

The SDK automatically spawns and manages the gateway process. One gateway per app, hot-reload safe.
