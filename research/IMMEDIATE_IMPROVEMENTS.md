# Immediate Improvements for Mini-LLM SDK

These are the changes that offer real impact and should be implemented now.

---

## 1. Add Build System (Critical)

**Why**: Can't publish to npm without compiled JavaScript

**Files to modify**:
- `packages/gateway/package.json`
- `packages/sdk/package.json`
- `tsconfig.json`

**Changes**:

```json
// packages/gateway/package.json
{
  "name": "@passy-ai/mini-llm-gateway",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist/**/*"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js"
  }
}
```

```json
// tsconfig.build.json (new file)
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true
  }
}
```

---

## 2. Fix Body Parsing Performance (High Impact)

**Why**: String concatenation is O(n²), slow for large requests

**File**: `packages/gateway/src/server.ts`

**Change**:
```typescript
// BEFORE (slow)
function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// AFTER (fast)
function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
```

---

## 3. Add Connection Pooling (High Impact)

**Why**: New HTTPS connection per request is slow

**Files**: 
- `packages/gateway/src/router/openai.ts`
- `packages/gateway/src/router/anthropic.ts`

**Change**:
```typescript
import https from "node:https";

// Reuse connections
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
});

// In request options:
const options: https.RequestOptions = {
  agent,  // Add this
  hostname: "api.openai.com",
  // ...
};
```

---

## 4. Add Error Handling (Critical)

**Why**: JSON parse errors crash the server

**File**: `packages/gateway/src/server.ts`

**Change**:
```typescript
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    // ... existing code ...
    
    if (path === "/v1/chat/completions" && method === "POST") {
      let body: Record<string, unknown>;
      try {
        const rawBody = await parseBody(req);
        body = JSON.parse(rawBody);
      } catch (e) {
        return sendJson(res, { error: "Invalid JSON body" }, 400);
      }
      // ... rest of handling
    }
  } catch (error) {
    console.error("Request error:", error);
    sendJson(res, { error: "Internal server error" }, 500);
  }
}
```

---

## 5. Add Body Size Limit (Security)

**Why**: Prevent memory exhaustion attacks

**File**: `packages/gateway/src/server.ts`

**Change**:
```typescript
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}
```

---

## 6. Sanitize Error Messages (Security)

**Why**: Don't leak internal details to clients

**Files**: 
- `packages/gateway/src/router/openai.ts`
- `packages/gateway/src/router/anthropic.ts`

**Change**:
```typescript
// BEFORE (leaks details)
upstream.on("error", (err) => {
  res.writeHead(500, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: err.message }));
});

// AFTER (generic message)
upstream.on("error", (err) => {
  console.error("OpenAI error:", err);  // Log full error
  res.writeHead(502, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Provider unavailable" }));
});
```

---

## 7. Add Request Timeout (Reliability)

**Why**: Prevent hanging requests

**File**: `packages/gateway/src/server.ts`

**Change**:
```typescript
const REQUEST_TIMEOUT = 60000; // 60 seconds

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Request timeout"));
    }, REQUEST_TIMEOUT);
    
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      clearTimeout(timeout);
      resolve(Buffer.concat(chunks).toString());
    });
    req.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
```

---

## 8. Update Package Metadata (Required for npm)

**File**: `package.json` (root)

**Change**:
```json
{
  "name": "@passy-ai/mini-llm",
  "version": "0.1.0",
  "description": "Lightweight AI gateway for routing LLM requests",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/passy-ai/mini-llm.git"
  },
  "keywords": ["ai", "llm", "gateway", "openai", "anthropic"],
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 9. Add Graceful Shutdown (Reliability)

**File**: `packages/gateway/src/index.ts`

**Change**:
```typescript
async function main() {
  // ... existing startup code ...
  
  const server = await startServer(currentPort);
  
  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    server.stop();
    process.exit(0);
  };
  
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
```

---

## 10. Add Input Validation (Security)

**File**: `packages/gateway/src/alias.ts`

**Change**:
```typescript
export function resolveAlias(
  modelInput: string,
  aliases: Record<string, string>
): ResolvedModel {
  if (!modelInput || typeof modelInput !== "string") {
    throw new Error("Model must be a non-empty string");
  }
  
  if (modelInput.length > 100) {
    throw new Error("Model name too long");
  }
  
  // ... rest of function
}
```

---

## Implementation Priority

### Phase 1: Critical (Do First)
1. Add build system
2. Fix body parsing
3. Add error handling
4. Update package.json

### Phase 2: High Impact (Do Next)
5. Add connection pooling
6. Add body size limit
7. Sanitize error messages
8. Add request timeout

### Phase 3: Polish (Do Last)
9. Add graceful shutdown
10. Add input validation

---

## Testing After Changes

```bash
# Build
npm run build

# Test basic functionality
npm run demo

# Test error handling
curl http://localhost:3333/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d "invalid json"

# Test large body rejection
curl http://localhost:3333/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d @huge-file.json

# Test streaming still works
curl http://localhost:3333/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hi"}],"stream":true}'
```

---

## Expected Impact

| Improvement | Performance Gain | Reliability Gain |
|-------------|------------------|------------------|
| Build system | N/A (required) | N/A (required) |
| Body parsing | 10-100x faster | Prevents crashes |
| Connection pooling | 5-10x faster | Better resource use |
| Error handling | N/A | Prevents crashes |
| Body size limit | N/A | Prevents DoS |
| Error sanitization | N/A | Security |
| Timeout | N/A | Prevents hangs |
| Graceful shutdown | N/A | Clean exits |
| Input validation | N/A | Security |