# Mini-LLM SDK Research Documentation

## Project Overview

**Mini-LLM SDK** is an embedded, routing-only LLM gateway + SDK that requires zero external infrastructure. It provides a lightweight, self-contained solution for integrating multiple LLM providers (OpenAI and Anthropic) through a unified API interface.

### Key Features
- **Zero Infrastructure**: No external services required
- **Provider Routing**: Automatic routing between OpenAI and Anthropic
- **Model Aliasing**: Custom model name mapping
- **Streaming Support**: Full SSE streaming for chat completions
- **Process Management**: Automatic gateway lifecycle management
- **TypeScript Native**: Built with TypeScript for type safety

## Architecture Analysis

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│  SDK (mini-llm)  │  Demo Apps  │  CLI Tools  │  Test Apps   │
├─────────────────────────────────────────────────────────────┤
│                    Gateway Layer                            │
├─────────────────────────────────────────────────────────────┤
│  HTTP Server  │  Router  │  Provider Handlers  │  Proxy     │
├─────────────────────────────────────────────────────────────┤
│                 Provider APIs                               │
│         OpenAI API    │    Anthropic API                   │
└─────────────────────────────────────────────────────────────┘
```

### Package Structure

```
mini-llm-monorepo/
├── packages/
│   ├── gateway/          # Core HTTP gateway server
│   ├── sdk/             # Client SDK with process management
│   ├── demo/            # Command-line demo application
│   ├── test-app/        # Web-based test application
│   └── dev-cli/         # Development CLI tools
├── package.json         # Root monorepo configuration
├── tsconfig.json        # TypeScript configuration
└── README.md           # Project documentation
```

## Detailed Component Analysis

### 1. Gateway Package (`packages/gateway/`)

#### Core Components

**Entry Point**: `src/index.ts`
- **Purpose**: Gateway server startup with port auto-increment
- **Key Features**: 
  - Automatic port selection (3333-3342)
  - Error handling for port conflicts
  - Graceful startup/shutdown

**Server**: `src/server.ts`
- **Purpose**: HTTP server with request routing
- **Endpoints**:
  - `GET /health` - Health check endpoint
  - `GET /v1/models` - List available models
  - `POST /v1/chat/completions` - OpenAI-compatible chat completions
  - `POST /v1/images/generations` - OpenAI image generation
  - `POST /v1/messages` - Anthropic messages API

**Environment Configuration**: `src/env.ts`
- **Purpose**: Environment variable parsing and validation
- **Configuration Options**:
  - `MINI_LLM_PORT`: Gateway port (default: 3333)
  - `OPENAI_API_KEY(S)`: OpenAI API key(s)
  - `ANTHROPIC_API_KEY(S)`: Anthropic API key(s)
  - `MINI_LLM_MODEL_ALIASES`: JSON model alias configuration

**Model Aliasing**: `src/alias.ts`
- **Purpose**: Model name resolution and provider routing
- **Resolution Logic**:
  - Explicit provider prefix: `openai:gpt-4o-mini`
  - Anthropic detection: `claude-*` models
  - Default to OpenAI for unknown models

#### Provider Handlers

**OpenAI Handler** (`src/router/openai.ts`)
- **Features**:
  - API key rotation for multiple keys
  - Streaming and non-streaming responses
  - Image generation support
  - Error handling and propagation

**Anthropic Handler** (`src/router/anthropic.ts`)
- **Features**:
  - API key rotation
  - Streaming support via SSE
  - Anthropic-specific headers
  - Error handling

### 2. SDK Package (`packages/sdk/`)

#### Core Components

**Gateway Manager**: `src/gateway-manager.ts`
- **Purpose**: Process lifecycle management
- **Key Features**:
  - Automatic gateway spawning via `tsx`
  - Health check monitoring
  - Port discovery and management
  - Process cleanup on exit
  - Singleton pattern for single gateway instance

**Port Utilities**: `src/port.ts`
- **Purpose**: Port availability and health checking
- **Functions**:
  - `isPortAvailable()`: Check if port is free
  - `findAvailablePort()`: Find next available port
  - `waitForHealth()`: Wait for gateway health endpoint
  - `checkHealth()`: Single health check request

**Type Definitions**: `src/types.ts`
- **Interfaces**:
  - `MiniLLMConfig`: SDK configuration options
  - `MiniLLMInstance`: Gateway instance interface

#### SDK Usage Pattern

```typescript
import { miniLLM, createMiniLLM } from 'mini-llm';

// Default singleton
await miniLLM.ready();
console.log(miniLLM.url); // http://127.0.0.1:3333

// Custom instance
const custom = createMiniLLM({ port: 4000 });
await custom.ready();
```

### 3. Demo Applications

#### Command-Line Demo (`packages/demo/index.ts`)
- **Purpose**: Comprehensive CLI demonstration
- **Features**:
  - Health check testing
  - OpenAI chat completions (streaming/non-streaming)
  - Anthropic messages API
  - Environment validation
  - Error handling examples

#### Web Test App (`packages/test-app/`)
- **Purpose**: Browser-based testing interface
- **Features**:
  - Real-time chat interface
  - Model selection dropdown
  - Streaming response visualization
  - Modern UI with CSS animations
  - Gateway proxy integration

### 4. Development Tools (`packages/dev-cli/`)

#### CLI Interface (`cli.ts`)
- **Commands**:
  - `start`: Start gateway daemon
  - `health`: Check gateway health
  - `test`: Run smoke tests

#### Smoke Tests (`smoke-test.ts`)
- **Test Coverage**:
  - Health endpoint validation
  - Model listing functionality
  - Chat completion endpoints
  - Streaming support
  - Error handling
  - Process management
  - Routing invariants

#### Performance Benchmark (`perf-compare.ts`)
- **Purpose**: Performance comparison with Bifrost gateway
- **Benchmarks**:
  - Small, medium, large prompts
  - Latency measurement
  - Token usage tracking
  - Error rate analysis

## Technical Implementation Details

### Request Flow

1. **Client Request** → Gateway HTTP Server
2. **Model Resolution** → Alias system determines provider
3. **Provider Routing** → OpenAI or Anthropic handler
4. **API Key Selection** → Round-robin key rotation
5. **Upstream Request** → Provider API
6. **Response Streaming** → Direct passthrough to client

### Error Handling Strategy

- **Port Conflicts**: Auto-increment to next available port
- **Missing API Keys**: Graceful error responses
- **Provider Errors**: Direct propagation to client
- **Network Issues**: Timeout handling and retries
- **Process Management**: Automatic cleanup on exit

### Security Considerations

- **Local Only**: Gateway binds to 127.0.0.1 (localhost only)
- **No Authentication**: Relies on application-level security
- **API Key Management**: Environment variable based
- **Process Isolation**: Separate gateway process per application

## Performance Characteristics

### Startup Behavior
- **Gateway Spawn**: ~2-3 seconds via tsx
- **Health Check**: 50 attempts × 100ms = 5 second timeout
- **Port Discovery**: Sequential port checking (10 attempts max)

### Runtime Performance
- **Zero Overhead**: Direct proxying without buffering
- **Streaming**: Real-time SSE passthrough
- **Memory Usage**: Minimal - only routing logic
- **CPU Usage**: Low - simple HTTP proxying

### Scalability Limits
- **Single Process**: One gateway per application
- **Port Range**: 10 ports available (3333-3342)
- **Key Rotation**: Round-robin across configured keys
- **Concurrent Requests**: Limited by Node.js HTTP server

## Development Workflow

### Setup Commands
```bash
# Install dependencies
npm install

# Run demo
npm run demo

# Start test app
npm run test-app

# Run smoke tests
npm run smoke-test

# CLI usage
npx mini-llm-dev start
npx mini-llm-dev health
npx mini-llm-dev test
```

### Environment Configuration
```bash
# Required API keys
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Optional configuration
export MINI_LLM_PORT=3333
export MINI_LLM_MODEL_ALIASES='{"fast":"openai:gpt-4o-mini"}'
```

## Integration Patterns

### Direct HTTP Usage
```typescript
// Using native fetch with gateway URL
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

### SDK Integration
```typescript
// Using the SDK for automatic lifecycle management
import { miniLLM } from 'mini-llm';

await miniLLM.ready();
const response = await fetch(`${miniLLM.url}/v1/chat/completions`, ...);
```

## Future Considerations

### Potential Enhancements
- **Additional Providers**: Google, Cohere, etc.
- **Caching Layer**: Response caching for identical requests
- **Rate Limiting**: Built-in rate limiting per provider
- **Metrics**: Performance and usage metrics
- **WebSocket Support**: Real-time bidirectional communication
- **Docker Support**: Containerized deployment

### Limitations
- **Single Tenant**: One gateway per application instance
- **No Persistence**: No request/response storage
- **Basic Routing**: Simple provider-based routing only
- **Local Development**: Primarily designed for local development

## Conclusion

The Mini-LLM SDK represents a minimalist approach to LLM gateway functionality, focusing on simplicity, zero infrastructure requirements, and seamless provider integration. Its architecture prioritizes developer experience through automatic process management and clean API abstractions while maintaining the flexibility to work with existing OpenAI and Anthropic client libraries.

The project successfully demonstrates how complex infrastructure can be simplified into a lightweight, embeddable solution suitable for development environments and small-scale applications.