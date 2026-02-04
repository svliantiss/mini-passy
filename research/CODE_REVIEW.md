# Mini-LLM SDK Code Review & Recommendations

## Executive Summary

The codebase is clean and functional but needs improvements for:
1. **Public npm package** readiness
2. **Performance optimizations**
3. **Code quality** (comments, error handling)
4. **Cross-language compatibility** (for other languages to use)

## File-by-File Analysis

### 1. `packages/gateway/src/index.ts`

**Current Issues:**
- No JSDoc comments
- Error handling could be more specific
- Port retry logic is good but could be configurable

**Recommendations:**
```typescript
/**
 * Mini-LLM Gateway Entry Point
 * Handles port binding with automatic retry logic
 */

// Make retry count configurable
const MAX_PORT_RETRIES = parseInt(process.env.MINI_LLM_PORT_RETRIES || '10', 10);

// Better error typing
interface ServerError extends Error {
  code?: string;
}
```

### 2. `packages/gateway/src/server.ts`

**Current Issues:**
- Hardcoded providers (OpenAI, Anthropic only)
- No request timeout handling
- Missing request logging option
- No rate limiting
- JSON parse errors not handled

**Performance Issues:**
- `parseBody` uses string concatenation (slow for large bodies)
- No request body size limit
- No keep-alive configuration

**Recommendations:**
```typescript
// Use Buffer for better performance
function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

// Add body size limit
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
let size = 0;
req.on('data', chunk => {
  size += chunk.length;
  if (size > MAX_BODY_SIZE) {
    reject(new Error('Body too large'));
  }
});

// Add timeout
req.setTimeout(30000, () => {
  reject(new Error('Request timeout'));
});
```

### 3. `packages/gateway/src/env.ts`

**Current Issues:**
- No validation of environment variables
- Silent failure on invalid JSON
- No type coercion for port

**Recommendations:**
```typescript
export function loadEnv(): EnvConfig {
  const port = parseInt(process.env.MINI_LLM_PORT || '3333', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${process.env.MINI_LLM_PORT}`);
  }
  
  // Validate API keys format
  for (const key of openaiApiKeys) {
    if (!key.startsWith('sk-')) {
      console.warn(`Warning: OpenAI key doesn't start with 'sk-': ${key.slice(0, 10)}...`);
    }
  }
  
  // Better error handling for JSON
  if (aliasesEnv) {
    try {
      modelAliases = JSON.parse(aliasesEnv);
    } catch (e) {
      console.error('Failed to parse MINI_LLM_MODEL_ALIASES:', e);
      modelAliases = {};
    }
  }
}
```

### 4. `packages/gateway/src/alias.ts`

**Current Issues:**
- Limited provider types in TypeScript
- No validation of alias format
- Hardcoded provider detection logic

**Recommendations:**
```typescript
// Support any provider
export interface ResolvedModel {
  provider: string;  // Not just "openai" | "anthropic"
  model: string;
}

// Add validation
export function validateAlias(alias: string): boolean {
  return /^[a-z0-9-_]+$/i.test(alias);
}

// More flexible provider detection
const PROVIDER_PATTERNS: Record<string, RegExp> = {
  anthropic: /claude/i,
  openai: /gpt|davinci|curie|babbage/i,
};
```

### 5. `packages/gateway/src/router/openai.ts` & `anthropic.ts`

**Current Issues:**
- Key rotation logic is good but not thread-safe
- No connection pooling
- Error messages leak to client (security)
- No retry logic for failed requests

**Performance Issues:**
- New HTTPS connection for every request
- No keep-alive

**Recommendations:**
```typescript
// Use agent for connection pooling
import https from 'https';

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
});

// In request options:
const options = {
  agent,  // Reuse connections
  // ...
};

// Sanitize errors
upstream.on('error', (err) => {
  console.error('Upstream error:', err);  // Log full error
  res.writeHead(502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Provider unavailable' }));  // Generic message to client
});
```

### 6. `packages/sdk/src/gateway-manager.ts`

**Current Issues:**
- Process spawning depends on `npx tsx` (not production-ready)
- No health check interval
- Gateway output parsing is fragile
- No restart on crash

**Recommendations:**
```typescript
// Use compiled JS in production
const isDev = process.env.NODE_ENV !== 'production';
const gatewayEntry = isDev 
  ? join(__dirname, '../../gateway/src/index.ts')
  : join(__dirname, '../../gateway/dist/index.js');

const command = isDev ? 'npx' : 'node';
const args = isDev ? ['tsx', gatewayEntry] : [gatewayEntry];

// Add restart logic
gatewayProcess.on('exit', (code) => {
  if (code !== 0 && !isShuttingDown) {
    console.log('Gateway crashed, restarting...');
    setTimeout(() => spawnGateway(config), 1000);
  }
});

// Periodic health checks
setInterval(async () => {
  if (gatewayPort && !(await checkHealth(gatewayPort))) {
    console.warn('Gateway unhealthy, restarting...');
    cleanup();
    await ensureGateway(config);
  }
}, 30000);
```

### 7. `packages/sdk/src/port.ts`

**Current Issues:**
- `isPortAvailable` has race condition (port could be taken between check and bind)
- `findAvailablePort` tries sequentially (slow)

**Recommendations:**
```typescript
// Don't check availability, just try to bind
// Let the OS assign a free port if needed
export async function findAvailablePort(startPort: number): Promise<number> {
  // Try random ports to avoid collisions in concurrent scenarios
  for (let i = 0; i < 20; i++) {
    const port = startPort + Math.floor(Math.random() * 100);
    if (port > 65535) continue;
    
    try {
      const server = http.createServer();
      await new Promise<void>((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => {
          server.close(() => resolve());
        });
        server.on('error', reject);
      });
      return port;
    } catch {
      continue;
    }
  }
  throw new Error('No available port found');
}
```

## Package.json Issues

### Root `package.json`

**Missing:**
- No `engines` field (Node version requirement)
- No `repository` field
- No `license` field
- No `keywords` for npm search

**Recommendations:**
```json
{
  "name": "mini-llm",
  "version": "0.1.0",
  "description": "Lightweight AI gateway for routing LLM requests",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourorg/mini-llm.git"
  },
  "keywords": ["ai", "llm", "gateway", "openai", "anthropic", "proxy"],
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### SDK `package.json`

**Issues:**
- `main` points to `.ts` file (won't work when published)
- No `files` field (publishes everything)
- No `bin` entry for CLI usage

**Recommendations:**
```json
{
  "name": "mini-llm",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist/**/*"],
  "bin": {
    "mini-llm": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  }
}
```

## Performance Optimizations

### 1. Connection Pooling
Add to all provider handlers:
```typescript
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  freeSocketTimeout: 30000,
});
```

### 2. Response Caching (Optional)
```typescript
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 60 }); // 1 minute cache for identical requests
```

### 3. Streaming Optimization
Current code pipes streams correctly, but add:
```typescript
// Disable Nagle's algorithm for lower latency
upstream.setNoDelay(true);
```

### 4. Body Parsing
Use streams for large bodies:
```typescript
import { pipeline } from 'stream';
import { createBrotliDecompress, createGunzip } from 'zlib';

// Handle compressed responses
const decompress = res.headers['content-encoding'] === 'br' 
  ? createBrotliDecompress()
  : res.headers['content-encoding'] === 'gzip'
  ? createGunzip()
  : null;

if (decompress) {
  pipeline(res, decompress, clientRes, (err) => {
    if (err) console.error('Pipeline error:', err);
  });
} else {
  res.pipe(clientRes);
}
```

## Cross-Language Compatibility

To make this usable from other languages:

### 1. Add gRPC or HTTP/JSON API
Current HTTP API is language-agnostic, but document it:
```markdown
## HTTP API

### POST /v1/chat/completions
Request body (OpenAI compatible):
```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}]
}
```
```

### 2. Language Bindings
Create thin wrappers:
- **Python**: `mini-llm-py` - subprocess wrapper
- **Go**: `mini-llm-go` - HTTP client
- **Rust**: `mini-llm-rs` - HTTP client

### 3. CLI Interface
Add CLI for non-JS usage:
```bash
mini-llm start --port 3333
mini-llm status
mini-llm stop
```

## Security Improvements

1. **Input Validation**:
```typescript
import { z } from 'zod';

const ChatRequestSchema = z.object({
  model: z.string().min(1).max(100),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(100000),
  })).max(100),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(32000).optional(),
});
```

2. **Rate Limiting**:
```typescript
import { RateLimiter } from 'limiter';
const limiter = new RateLimiter({ tokensPerInterval: 100, interval: 'minute' });
```

3. **Request Signing** (for passy.ai integration):
```typescript
// Verify requests from passy.ai
function verifyRequest(req: IncomingMessage): boolean {
  const signature = req.headers['x-signature'];
  const timestamp = req.headers['x-timestamp'];
  // HMAC verification
}
```

## Testing Gaps

**Missing:**
- Unit tests
- Integration tests
- Load tests
- Error scenario tests

**Recommendations:**
```typescript
// Add test suite
// __tests__/server.test.ts
import { startServer } from '../src/server.js';

describe('Mini-LLM Gateway', () => {
  it('should handle health check', async () => {
    const server = await startServer(3333);
    const res = await fetch('http://localhost:3333/health');
    expect(res.status).toBe(200);
    server.stop();
  });
  
  it('should route to correct provider', async () => {
    // Mock provider responses
  });
  
  it('should handle streaming', async () => {
    // Test SSE streaming
  });
});
```

## Build & Publish Checklist

### For npm Publication

1. **Add build step**:
```json
{
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist",
    "prepublishOnly": "npm run clean && npm run build"
  }
}
```

2. **Update tsconfig for build**:
```json
{
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "noEmit": false
  }
}
```

3. **Add .npmignore**:
```
src/
*.test.ts
.env
.gitignore
```

4. **GitHub Actions for CI**:
```yaml
name: Publish
on:
  push:
    tags:
      - 'v*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Summary of Priority Changes

### High Priority (Before npm publish)
1. Add build step and compiled JS output
2. Fix `package.json` main/types fields
3. Add connection pooling for performance
4. Add input validation
5. Add proper error handling

### Medium Priority (After initial publish)
1. Add tests
2. Add CLI interface
3. Add rate limiting
4. Add request logging
5. Add caching

### Low Priority (Future)
1. Language bindings
2. gRPC support
3. Advanced routing rules
4. Metrics/monitoring