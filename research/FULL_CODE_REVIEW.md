# Full Code Review - File by File

## Project Structure

```
.
├── README.md
├── package-lock.json
├── package.json
├── packages
│   ├── demo
│   │   ├── index.ts
│   │   └── package.json
│   ├── dev-cli
│   │   ├── cli.ts
│   │   ├── package.json
│   │   ├── perf-compare.ts
│   │   └── smoke-test.ts
│   ├── gateway
│   │   ├── index.ts
│   │   ├── package.json
│   │   └── src
│   │       ├── alias.ts
│   │       ├── env.ts
│   │       ├── health.ts
│   │       ├── index.ts
│   │       ├── router
│   │       │   ├── anthropic.ts
│   │       │   ├── index.ts
│   │       │   └── openai.ts
│   │       └── server.ts
│   ├── sdk
│   │   ├── package.json
│   │   └── src
│   │       ├── gateway-manager.ts
│   │       ├── index.ts
│   │       ├── port.ts
│   │       └── types.ts
│   └── test-app
│       ├── index.html
│       ├── package.json
│       └── server.ts
├── research/
└── tsconfig.json
```

---

## Root Level Files

### 1. `README.md`

**Current State**: Basic documentation

**Recommendations**:
- Add installation instructions
- Add API documentation
- Add environment variable reference
- Add troubleshooting section
- Add badges (npm version, license)

---

### 2. `package.json` (Root)

**Current State**:
```json
{
  "name": "mini-llm-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "devDependencies": {...},
  "scripts": {...}
}
```

**Issues**:
- Missing `engines` field (Node version requirement)
- Missing `repository` field
- Missing `license` field
- Missing `keywords`

**Recommendations**:
```json
{
  "name": "mini-llm",
  "version": "0.1.0",
  "description": "Lightweight AI gateway for routing LLM requests",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/passy-ai/mini-llm.git"
  },
  "keywords": ["ai", "llm", "gateway", "openai", "anthropic", "proxy", "passy"],
  "engines": {
    "node": ">=18.0.0"
  },
  "packageManager": "npm@10.0.0"
}
```

---

### 3. `package-lock.json`

**Status**: Auto-generated, no changes needed

---

### 4. `tsconfig.json`

**Current State**:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["packages/**/*.ts"]
}
```

**Issues**:
- `noEmit: true` prevents building distributable JS
- No `outDir` specified
- No `declaration` for type definitions

**Recommendations**:
Create separate tsconfig for build:
```json
// tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

---

## Package: `packages/gateway`

### 5. `packages/gateway/package.json`

**Current State**:
```json
{
  "name": "mini-llm-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "start": "bun run src/index.ts"
  }
}
```

**Issues**:
- `private: true` prevents publishing
- `main` points to TypeScript file
- Only has `bun` script (not portable)
- Missing `files` field

**Recommendations**:
```json
{
  "name": "@passy-ai/mini-llm-gateway",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist/**/*", ".env.example"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### 6. `packages/gateway/index.ts`

**Current State**: Entry point that re-exports from src/

**Content**:
```typescript
// Empty or re-export file
```

**Recommendations**:
- Remove this file (redundant with src/index.ts)
- Or make it the actual entry point and move src/ contents here

---

### 7. `packages/gateway/src/index.ts`

**Current State**:
```typescript
import { startServer, env } from "./server.js";

const port = env.port;

async function main() {
  let currentPort = port;

  // Try to bind, auto-increment if occupied
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const server = await startServer(currentPort);
      console.log(`mini-llm-gateway running on http://127.0.0.1:${server.port}`);
      return;
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        "code" in e &&
        (e as NodeJS.ErrnoException).code === "EADDRINUSE"
      ) {
        currentPort++;
      } else {
        throw e;
      }
    }
  }

  console.error("Failed to start gateway: all ports occupied");
  process.exit(1);
}

main();
```

**Issues**:
- No JSDoc comments
- Hardcoded retry count (10)
- Error type casting is verbose
- No graceful shutdown handling
- Process.exit(1) is abrupt

**Recommendations**:
```typescript
#!/usr/bin/env node
/**
 * Mini-LLM Gateway Entry Point
 * 
 * Starts the HTTP gateway with automatic port selection.
 * 
 * @module
 */

import { startServer, env } from "./server.js";

const MAX_PORT_RETRIES = parseInt(process.env.MINI_LLM_PORT_RETRIES || '10', 10);

async function main(): Promise<void> {
  let currentPort = env.port;

  for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt++) {
    try {
      const server = await startServer(currentPort);
      console.log(`✓ Mini-LLM Gateway running on http://127.0.0.1:${server.port}`);
      
      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log('\nShutting down gracefully...');
        server.stop();
        process.exit(0);
      });
      
      return;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EADDRINUSE') {
        console.log(`Port ${currentPort} in use, trying ${currentPort + 1}...`);
        currentPort++;
      } else {
        console.error('Failed to start server:', error);
        process.exitCode = 1;
        throw error;
      }
    }
  }

  console.error(`Failed to find available port after ${MAX_PORT_RETRIES} attempts`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

---

### 8. `packages/gateway/src/server.ts`

**Current State**: Main HTTP server with routing

**Issues**:
1. **Performance**: `parseBody` uses string concatenation (O(n²))
2. **No body size limit**: Risk of memory exhaustion
3. **No timeout handling**: Requests can hang indefinitely
4. **JSON parse errors**: Not caught, crashes server
5. **No request logging**: Hard to debug
6. **Hardcoded providers**: Only OpenAI and Anthropic
7. **No connection pooling**: New HTTPS connection per request

**Recommendations**:

```typescript
/**
 * HTTP Server and Request Router
 * 
 * Handles incoming requests and routes to appropriate providers.
 */

import http from "node:http";
import { loadEnv } from "./env.js";
import { resolveAlias } from "./alias.js";
import {
  handleOpenAIModels,
  handleOpenAIChatCompletions,
  handleOpenAIImageGenerations,
  handleAnthropicMessages,
} from "./router/index.js";

const env = loadEnv();

/** Maximum request body size (10MB) */
const MAX_BODY_SIZE = 10 * 1024 * 1024;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT = 30000;

/**
 * Parse request body with size limit and timeout
 */
function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const timeout = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, REQUEST_TIMEOUT);

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        clearTimeout(timeout);
        reject(new Error(`Body exceeds ${MAX_BODY_SIZE} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function sendJson(res: http.ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  const path = req.url || '/';
  const method = req.method || 'GET';

  // Log request (optional, based on env)
  if (process.env.MINI_LLM_LOG_REQUESTS === 'true') {
    console.log(`${method} ${path}`);
  }

  try {
    // Health check
    if (path === '/health' && method === 'GET') {
      return sendJson(res, { 
        status: 'ok',
        version: process.env.npm_package_version || '0.1.0',
        providers: Object.keys(env.modelAliases).length,
      });
    }

    // ... rest of routing with try/catch around JSON.parse
  } catch (error) {
    console.error('Request error:', error);
    sendJson(res, { error: 'Internal server error' }, 500);
  }
}

export function startServer(port: number): Promise<{ port: number; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handleRequest);

    server.on('error', (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: actualPort,
        stop: () => {
          server.close();
          server.closeAllConnections?.();
        },
      });
    });
  });
}

export { env };
```

---

### 9. `packages/gateway/src/env.ts`

**Current State**: Environment variable parsing

**Issues**:
1. No validation of values
2. Silent JSON parse failure
3. No type coercion checks
4. No warnings for missing keys

**Recommendations**:
```typescript
/**
 * Environment Configuration
 * 
 * Loads and validates environment variables.
 */

export interface EnvConfig {
  port: number;
  openaiApiKeys: string[];
  anthropicApiKeys: string[];
  modelAliases: Record<string, string>;
}

function parseKeys(single?: string, multiple?: string): string[] {
  if (multiple?.trim()) {
    return multiple
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
  }
  if (single?.trim()) {
    return [single.trim()];
  }
  return [];
}

function validateApiKey(key: string, provider: string): boolean {
  const prefixes: Record<string, string> = {
    openai: 'sk-',
    anthropic: 'sk-ant-',
  };
  
  const prefix = prefixes[provider];
  if (prefix && !key.startsWith(prefix)) {
    console.warn(`Warning: ${provider} key should start with '${prefix}'`);
    return false;
  }
  return true;
}

export function loadEnv(): EnvConfig {
  // Parse port
  const port = parseInt(process.env.MINI_LLM_PORT || '3333', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid MINI_LLM_PORT: ${process.env.MINI_LLM_PORT}`);
  }

  // Parse API keys
  const openaiApiKeys = parseKeys(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_API_KEYS
  );
  
  const anthropicApiKeys = parseKeys(
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_API_KEYS
  );

  // Validate keys
  openaiApiKeys.forEach(k => validateApiKey(k, 'openai'));
  anthropicApiKeys.forEach(k => validateApiKey(k, 'anthropic'));

  // Parse aliases
  let modelAliases: Record<string, string> = {};
  const aliasesEnv = process.env.MINI_LLM_MODEL_ALIASES;
  if (aliasesEnv) {
    try {
      modelAliases = JSON.parse(aliasesEnv);
      if (typeof modelAliases !== 'object' || modelAliases === null) {
        throw new Error('MINI_LLM_MODEL_ALIASES must be an object');
      }
    } catch (e) {
      console.error('Failed to parse MINI_LLM_MODEL_ALIASES:', e);
      console.error('Value was:', aliasesEnv);
      // Continue with empty aliases
    }
  }

  // Log configuration (without keys)
  console.log('Configuration:');
  console.log(`  Port: ${port}`);
  console.log(`  OpenAI keys: ${openaiApiKeys.length}`);
  console.log(`  Anthropic keys: ${anthropicApiKeys.length}`);
  console.log(`  Aliases: ${Object.keys(modelAliases).length}`);

  return {
    port,
    openaiApiKeys,
    anthropicApiKeys,
    modelAliases,
  };
}
```

---

### 10. `packages/gateway/src/alias.ts`

**Current State**: Model alias resolution

**Issues**:
1. Limited provider types in TypeScript
2. No validation
3. Hardcoded provider detection

**Recommendations**:
```typescript
/**
 * Model Alias Resolution
 * 
 * Maps user-friendly aliases to provider:model pairs.
 */

export interface ResolvedModel {
  provider: string;
  model: string;
}

/** Valid provider identifiers */
const VALID_PROVIDERS = ['openai', 'anthropic', 'nebius', 'deepinfra'];

/**
 * Resolve a model alias to provider and model
 */
export function resolveAlias(
  modelInput: string,
  aliases: Record<string, string>
): ResolvedModel {
  if (!modelInput || typeof modelInput !== 'string') {
    throw new Error('Model must be a non-empty string');
  }

  const resolved = aliases[modelInput] || modelInput;

  // Explicit provider prefix
  const colonIndex = resolved.indexOf(':');
  if (colonIndex > 0) {
    const provider = resolved.slice(0, colonIndex).toLowerCase();
    const model = resolved.slice(colonIndex + 1);
    
    if (!VALID_PROVIDERS.includes(provider)) {
      console.warn(`Unknown provider: ${provider}`);
    }
    
    return { provider, model };
  }

  // Infer from model name
  if (/claude/i.test(resolved)) {
    return { provider: 'anthropic', model: resolved };
  }

  // Default to OpenAI
  return { provider: 'openai', model: resolved };
}

/**
 * Get all aliased model names
 */
export function getAliasedModels(aliases: Record<string, string>): string[] {
  return Object.keys(aliases);
}

/**
 * Validate an alias name
 */
export function validateAliasName(name: string): boolean {
  return /^[a-z0-9-_]+$/i.test(name);
}
```

---

### 11. `packages/gateway/src/health.ts`

**Current State**: Simple health check

**Content**:
```typescript
export function handleHealth(): Response {
  return Response.json({ status: "ok" });
}
```

**Issues**:
- Uses web-standard `Response` (not Node.js http)
- Not used anywhere
- No actual health checks

**Recommendations**:
- Remove this file (functionality is in server.ts)
- Or integrate with server.ts for actual health checks

---

### 12. `packages/gateway/src/router/index.ts`

**Current State**: Barrel export file

**Content**:
```typescript
export {
  handleOpenAIModels,
  handleOpenAIChatCompletions,
  handleOpenAIImageGenerations,
} from "./openai.js";
export { handleAnthropicMessages } from "./anthropic.js";
```

**Status**: OK, but could be auto-generated

---

### 13. `packages/gateway/src/router/openai.ts`

**Current State**: OpenAI provider handlers

**Issues**:
1. **Performance**: No connection pooling
2. **Security**: Error messages leak to client
3. **No retry logic**: Single failure = request failure
4. **Key rotation**: Good, but not thread-safe
5. **Hardcoded host**: Can't use custom endpoints

**Recommendations**:
```typescript
/**
 * OpenAI Provider Handler
 */

import type http from "node:http";
import https from "node:https";

// Connection pooling for performance
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
});

let keyIndex = 0;

function getNextKey(keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;
  const key = keys[keyIndex % keys.length];
  keyIndex = (keyIndex + 1) % keys.length;
  return key;
}

export function handleOpenAIModels(
  res: http.ServerResponse,
  aliases: Record<string, string>
): void {
  const models = Object.keys(aliases)
    .filter(alias => {
      const resolved = aliases[alias];
      return resolved.startsWith('openai:') || !resolved.includes('claude');
    })
    .map(id => ({
      id,
      object: "model" as const,
      created: Date.now(),
      owned_by: "mini-llm",
    }));

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ object: "list", data: models }));
}

export function handleOpenAIChatCompletions(
  res: http.ServerResponse,
  body: Record<string, unknown>,
  apiKeys: string[],
  resolvedModel: string
): void {
  body.model = resolvedModel;
  const payload = JSON.stringify(body);

  const apiKey = getNextKey(apiKeys);
  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "OpenAI API key not configured" }));
    return;
  }

  const options: https.RequestOptions = {
    hostname: "api.openai.com",
    port: 443,
    path: "/v1/chat/completions",
    method: "POST",
    agent,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "Authorization": `Bearer ${apiKey}`,
    },
  };

  const upstream = https.request(options, (upstreamRes) => {
    const isStreaming = body.stream || upstreamRes.headers['content-type']?.includes('text/event-stream');
    
    res.writeHead(upstreamRes.statusCode || 200, {
      "Content-Type": isStreaming ? "text/event-stream" : "application/json",
      ...(isStreaming && {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      }),
    });
    
    upstreamRes.pipe(res);
  });

  upstream.on("error", (err) => {
    console.error("OpenAI upstream error:", err);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Provider unavailable" }));
  });

  upstream.write(payload);
  upstream.end();
}

// ... similar improvements for handleOpenAIImageGenerations
```

---

### 14. `packages/gateway/src/router/anthropic.ts`

**Current State**: Anthropic provider handler

**Issues**: Same as openai.ts

**Recommendations**: Apply same improvements (connection pooling, error handling)

---

## Package: `packages/sdk`

### 15. `packages/sdk/package.json`

**Current State**:
```json
{
  "name": "mini-llm",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "mini-llm-gateway": "*"
  }
}
```

**Issues**:
- `main` points to TypeScript
- Missing `files` field
- Missing `bin` for CLI
- Version should match gateway

**Recommendations**:
```json
{
  "name": "@passy-ai/mini-llm",
  "version": "0.1.0",
  "description": "SDK for Mini-LLM Gateway",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist/**/*"],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "bin": {
    "mini-llm": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@passy-ai/mini-llm-gateway": "^0.1.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### 16. `packages/sdk/src/index.ts`

**Current State**: SDK exports

**Content**:
```typescript
import { createMiniLLM } from "./gateway-manager.js";

export type { MiniLLMConfig, MiniLLMInstance } from "./types.js";
export { createMiniLLM } from "./gateway-manager.js";

export const miniLLM = createMiniLLM();
```

**Status**: OK, but add JSDoc

---

### 17. `packages/sdk/src/types.ts`

**Current State**: Type definitions

**Content**:
```typescript
export interface MiniLLMConfig {
  port?: number;
  env?: Record<string, string>;
}

export interface MiniLLMInstance {
  ready(): Promise<void>;
  url: string;
  stop(): Promise<void>;
}
```

**Recommendations**: Add JSDoc
```typescript
/**
 * Configuration for Mini-LLM SDK
 */
export interface MiniLLMConfig {
  /** Port to run gateway on (default: 3333) */
  port?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Mini-LLM SDK Instance
 */
export interface MiniLLMInstance {
  /** Wait for gateway to be ready */
  ready(): Promise<void>;
  /** Gateway URL */
  url: string;
  /** Stop the gateway */
  stop(): Promise<void>;
}
```

---

### 18. `packages/sdk/src/gateway-manager.ts`

**Current State**: Gateway process management

**Issues**:
1. Depends on `npx tsx` (dev dependency, not production)
2. Fragile stdout parsing
3. No restart on crash
4. No periodic health checks

**Recommendations**:
```typescript
/**
 * Gateway Process Manager
 * 
 * Spawns and manages the Mini-LLM gateway process.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { waitForHealth } from "./port.js";
import type { MiniLLMConfig, MiniLLMInstance } from "./types.js";

const DEFAULT_PORT = 3333;
const HEALTH_CHECK_INTERVAL = 30000;

let gatewayProcess: ChildProcess | null = null;
let gatewayPort: number | null = null;
let readyPromise: Promise<void> | null = null;
let healthCheckTimer: NodeJS.Timeout | null = null;
let isShuttingDown = false;

function getGatewayEntryPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  
  // Use compiled JS in production, TS in dev
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev
    ? join(__dirname, "../../gateway/src/index.ts")
    : join(__dirname, "../../gateway/dist/index.js");
}

function spawnGateway(config: MiniLLMConfig): Promise<number> {
  return new Promise((resolve, reject) => {
    const port = config.port || DEFAULT_PORT;
    const gatewayEntry = getGatewayEntryPath();
    const isDev = process.env.NODE_ENV !== 'production';

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MINI_LLM_PORT: String(port),
      ...config.env,
    };

    const command = isDev ? 'npx' : 'node';
    const args = isDev ? ['tsx', gatewayEntry] : [gatewayEntry];

    gatewayProcess = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let actualPort = port;
    let resolved = false;

    gatewayProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      const match = output.match(/running on http:\/\/127\.0\.0\.1:(\d+)/);
      if (match && !resolved) {
        actualPort = parseInt(match[1], 10);
        resolved = true;
        resolve(actualPort);
      }
    });

    gatewayProcess.stderr?.on("data", (data: Buffer) => {
      if (!resolved) {
        console.error("[Gateway]", data.toString().trim());
      }
    });

    gatewayProcess.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    gatewayProcess.on("exit", (code) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Gateway exited with code ${code}`));
      } else if (code !== 0 && !isShuttingDown) {
        console.error(`Gateway crashed (code ${code}), will restart...`);
        // Could add auto-restart logic here
      }
    });

    // Timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Gateway startup timeout'));
      }
    }, 10000);
  });
}

async function ensureGateway(config: MiniLLMConfig): Promise<void> {
  if (gatewayPort !== null) {
    const healthy = await waitForHealth(gatewayPort, 3, 100);
    if (healthy) return;
    cleanup();
  }

  const port = await spawnGateway(config);
  const healthy = await waitForHealth(port, 50, 100);

  if (!healthy) {
    throw new Error("Gateway failed to start");
  }

  gatewayPort = port;
  
  // Start health check interval
  healthCheckTimer = setInterval(async () => {
    if (gatewayPort && !(await waitForHealth(gatewayPort, 1, 1000))) {
      console.warn('Gateway unhealthy');
    }
  }, HEALTH_CHECK_INTERVAL);
}

function cleanup() {
  isShuttingDown = true;
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  if (gatewayProcess) {
    gatewayProcess.kill();
    gatewayProcess = null;
    gatewayPort = null;
  }
}

// Cleanup handlers
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});

export function createMiniLLM(config: MiniLLMConfig = {}): MiniLLMInstance {
  return {
    ready(): Promise<void> {
      if (!readyPromise) {
        readyPromise = ensureGateway(config);
      }
      return readyPromise;
    },

    get url(): string {
      if (gatewayPort === null) {
        throw new Error("Gateway not ready. Call ready() first.");
      }
      return `http://127.0.0.1:${gatewayPort}`;
    },

    async stop(): Promise<void> {
      cleanup();
      readyPromise = null;
    },
  };
}
```

---

### 19. `packages/sdk/src/port.ts`

**Current State**: Port utilities

**Issues**:
- `isPortAvailable` has race condition
- `findAvailablePort` is slow (sequential)

**Recommendations**:
```typescript
/**
 * Port Utilities
 */

import http from "node:http";

/**
 * Check if port is available (note: has race condition)
 * Prefer trying to bind directly instead.
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 500 }, () => {
      resolve(false);
    });
    req.on("error", () => resolve(true));
    req.on("timeout", () => {
      req.destroy();
      resolve(true);
    });
  });
}

/**
 * Find an available port starting from startPort
 * Uses random offset to reduce collision in concurrent scenarios
 */
export async function findAvailablePort(startPort: number): Promise<number> {
  for (let i = 0; i < 20; i++) {
    // Add random offset to avoid collisions
    const port = startPort + Math.floor(Math.random() * 100);
    if (port > 65535) continue;
    
    try {
      const server = http.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.close(() => resolve());
        });
      });
      return port;
    } catch {
      continue;
    }
  }
  throw new Error("No available port found");
}

/**
 * Wait for health endpoint to respond
 */
export async function waitForHealth(
  port: number,
  maxAttempts = 50,
  intervalMs = 100
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkHealth(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

function checkHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 500 }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === "ok");
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
```

---

## Package: `packages/demo`

### 20. `packages/demo/package.json`

**Current State**: Demo app dependencies

**Status**: OK for internal use, not published

---

### 21. `packages/demo/index.ts`

**Current State**: Demo implementation

**Status**: OK for testing, well-structured

---

## Package: `packages/dev-cli`

### 22. `packages/dev-cli/package.json`

**Current State**: CLI tools

**Status**: OK for internal use

---

### 23. `packages/dev-cli/cli.ts`

**Current State**: CLI entry point

**Status**: OK, could add more commands

---

### 24. `packages/dev-cli/smoke-test.ts`

**Current State**: Test suite

**Status**: Good coverage, should be run in CI

---

### 25. `packages/dev-cli/perf-compare.ts`

**Current State**: Performance comparison

**Status**: Useful for benchmarking

---

## Package: `packages/test-app`

### 26. `packages/test-app/package.json`

**Current State**: Test web app

**Status**: OK for manual testing

---

### 27. `packages/test-app/server.ts`

**Current State**: Test server

**Status**: OK

---

### 28. `packages/test-app/index.html`

**Current State**: Test UI

**Status**: OK for manual testing

---

## Summary

### Critical Issues (Must Fix)

1. **Build System**: Add TypeScript compilation to JS
2. **package.json**: Fix `main`/`types` fields to point to `dist/`
3. **Performance**: Add connection pooling in providers
4. **Error Handling**: Add try/catch around JSON.parse
5. **Body Parsing**: Use Buffer instead of string concatenation

### High Priority (Should Fix)

1. Add JSDoc comments to all public APIs
2. Add input validation
3. Add request timeouts
4. Add body size limits
5. Sanitize error messages to clients

### Medium Priority (Nice to Have)

1. Add request logging option
2. Add health check interval in SDK
3. Add graceful shutdown
4. Add CLI interface
5. Add tests

### Low Priority (Future)

1. Rate limiting
2. Caching
3. Metrics
4. Language bindings (not needed for passy.ai)