# @mini-passy

A lightweight, zero-config LLM gateway SDK for multiple AI providers with automatic model discovery and format normalization.

## Features

- **Multi-Provider Support**: OpenAI, Anthropic, Nebius, DeepInfra (and more via environment variables)
- **Zero Configuration**: All providers configured via environment variables - no code changes needed
- **Auto-Discovery**: Automatically fetches available models from each provider
- **Model Aliases**: Simple aliases like `gpt4o`, `claude_sonnet`, `kimi_k2` instead of long model IDs
- **Format Normalization**: Converts between OpenAI and Anthropic formats automatically
- **Fallback Support**: Primary and secondary providers for each alias
- **Single Port**: Runs on one port (default 9999) for all providers

## Quick Start

### 1. Install

```bash
npm install @mini-passy
# or
bun add @mini-passy
```

### 2. Configure Environment

Create a `.env` file:

```env
# Provider Configuration (required)
PROVIDER_OPENAI_URL=https://api.openai.com
PROVIDER_OPENAI_KEY=sk-your-openai-key

PROVIDER_ANTHROPIC_URL=https://api.anthropic.com
PROVIDER_ANTHROPIC_KEY=sk-your-anthropic-key

PROVIDER_NEBIUS_URL=https://api.studio.nebius.ai
PROVIDER_NEBIUS_KEY=your-nebius-key

PROVIDER_DEEPINFRA_URL=https://api.deepinfra.com
PROVIDER_DEEPINFRA_KEY=your-deepinfra-key

# Model Aliases (optional - defaults provided)
ALIAS_GPT4O=openai:gpt-4o
ALIAS_GPT4O_MINI=openai:gpt-4o-mini
ALIAS_CLAUDE_SONNET=anthropic:claude-sonnet-4-20250514
ALIAS_LLAMA33_70B=nebius:meta-llama/Llama-3.3-70B-Instruct
ALIAS_KIMI_K2=nebius:moonshotai/Kimi-K2-Instruct
ALIAS_DEEPSEEK_V3_2=deepinfra:deepseek-ai/DeepSeek-V3.2

# Optional Settings
PORT=9999
```

### 3. Start the Gateway

```bash
npx @mini-passy
# or pin to latest
npx @mini-passy@latest
# or
bunx @mini-passy
```

## Usage

### List Models

```bash
curl http://localhost:9999/v1/models
```

### Chat Completions (OpenAI format)

```bash
curl -X POST http://localhost:9999/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "gpt4o_mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Anthropic Messages

```bash
curl -X POST http://localhost:9999/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "claude_sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Programmatic Usage

```typescript
import { loadEnv, discoverProviders } from '@mini-passy';
import { proxyWithFallback } from '@mini-passy';

// Load configuration
const env = loadEnv();

// Discover models from all providers
await discoverProviders(env.providers);

// Use in your server
// proxyWithFallback(alias, body, providers, response)
```

## Adding Custom Providers

Just add environment variables:

```env
PROVIDER_MYCOMPANY_URL=https://api.mycompany.ai
PROVIDER_MYCOMPANY_KEY=my-api-key

ALIAS_MYMODEL=mycompany:model-id
```

No code changes needed! The gateway auto-discovers new providers on startup.

## Integration with Passy API

For full key management, rate limiting, and usage tracking:

```bash
git clone https://github.com/svliantiss/mini-passy
cd mini-passy/passy/emby-portal/passy-api
bun install
bun src/index.ts
```

This runs the unified Passy API with LLM Gateway on port 9999.

## License

MIT
