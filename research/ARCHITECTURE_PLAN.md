# Simplified Architecture Plan: Portal + API Service

## Executive Summary

This document outlines a plan to simplify the emby-portal architecture by:
1. **Separating concerns**: Create a lightweight `api.passy.ai` service using Mini-LLM SDK
2. **Simplifying the portal**: Remove complex proxy logic, make it a pure UI/API management layer
3. **Shared database**: Both services use the same PostgreSQL database
4. **Dokploy deployment**: Two separate containers with their own domains

## Current Architecture Issues

### Current Flow (Complex)
```
Client → Portal → Unified Proxy → Gateway → LLM Providers
              ↓
         (400+ lines of proxy logic)
         - Rate limiting
         - Caching
         - Model transformation
         - Usage tracking
         - DeepInfra routing
         - Error handling
```

### Problems
1. **Portal is doing too much**: Acts as both UI and API gateway
2. **Complex proxy layer**: 400+ lines in `unified-proxy.ts`
3. **Dependency on Gateway**: Portal proxies to emby-gw which is "hacked"
4. **Maintenance burden**: Any API change requires portal updates
5. **Performance overhead**: Extra hop through portal for every API request

## Proposed Architecture

### New Flow (Simplified)
```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
└──────────────┬──────────────────────────────┬───────────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│   api.passy.ai           │    │   dev.emby.ai (Portal)       │
│   (Mini-LLM SDK API)     │    │   (UI + API Management)      │
│                          │    │                              │
│   - Direct LLM proxy     │    │   - Dashboard                │
│   - API key validation   │    │   - Key management           │
│   - Usage tracking       │    │   - Billing                  │
│   - Rate limiting        │    │   - NO proxy logic           │
└──────────┬───────────────┘    └──────────┬───────────────────┘
           │                               │
           │    Uses X-Authenticated header│
           │    to create keys in API      │
           │                               │
           └───────────────┬───────────────┘
                           │
           ┌───────────────▼───────────────┐
           │   Shared PostgreSQL DB        │
           │   (portal2_db)                │
           │                               │
           │   - api_keys                  │
           │   - usage_tracking            │
           │   - organizations             │
           │   - users                     │
           └───────────────────────────────┘
```

## Component Breakdown

### 1. api.passy.ai Service (New)

**Technology**: Mini-LLM SDK + Hono + Prisma

**Responsibilities**:
- OpenAI-compatible API endpoints (`/v1/chat/completions`, `/v1/models`)
- Direct LLM provider routing (no intermediate Gateway)
- API key validation against shared DB
- Rate limiting (Redis)
- Usage tracking (DB)
- Streaming support

**Key Files** (new service):
```
api-passy-ai/
├── src/
│   ├── app.ts              # Hono app with API routes
│   ├── lib/
│   │   ├── prisma.ts       # Shared DB connection
│   │   ├── iam.ts          # API key validation (from portal)
│   │   ├── rate-limit.ts   # Redis rate limiting
│   │   ├── usage.ts        # Usage tracking
│   │   └── providers/      # LLM provider handlers
│   │       ├── openai.ts
│   │       ├── anthropic.ts
│   │       └── nebius.ts
│   └── routes/
│       ├── chat.ts         # /v1/chat/completions
│       ├── models.ts       # /v1/models
│       └── keys.ts         # Key validation endpoint
├── prisma/
│   └── schema.prisma       # Same schema as portal
└── package.json
```

**Environment Variables**:
```env
PORT=3000
DATABASE_URL=postgresql://.../portal2_db
REDIS_URL=redis://...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NEBIUS_API_KEY=...
EMBY_SECURE_KEY=...        # For inter-service auth
```

### 2. Simplified Portal (Modified)

**Removes**:
- `src/middleware/unified-proxy.ts` (400+ lines)
- `src/routes/gateway-proxy.ts`
- `src/routes/models.ts` (complex model fetching)
- Gateway dependency (`EMBY_ROUTE_URL`)

**Keeps**:
- UI routes (dashboard, keys, billing)
- API key management (`src/routes/emby-keys.ts`)
- User authentication
- Organization management
- Billing/credits

**Modified API Key Creation**:
Instead of calling Gateway, portal calls api.passy.ai:

```typescript
// New flow in emby-keys.ts
const apiResponse = await fetch('https://api.passy.ai/keys/api', {
  method: 'POST',
  headers: {
    'X-Emby-Secure-Key': EMBY_SECURE_KEY,
    'X-Authenticated-User': user.id,  // New header
  },
  body: JSON.stringify({
    email,
    description,
    usageLimit,
    isTrial,
    isTest,
  }),
});
```

## Database Schema (Shared)

Both services use the same `portal2_db` with these key tables:

```prisma
// Key tables for API service
model ApiKey {
  id               String    @id
  token            String    @unique
  status           String    // active, inactive, deleted
  projectId        String
  createdBy        String
  usageLimit       Decimal?
  isTrial          Boolean   @default(false)
  trialStartDate   DateTime?
  trialEndDate     DateTime?
  // ... other fields
}

model ApiUsage {
  id           String   @id
  apiKeyId     String
  model        String
  inputTokens  Int
  outputTokens Int
  totalTokens  Int
  inputCost    Decimal
  outputCost   Decimal
  totalCost    Decimal
  createdAt    DateTime @default(now())
}

model RateLimitTracking {
  id            String   @id
  apiKeyId      String
  windowType    String   // daily, hourly, monthly
  windowStart   DateTime
  tokensUsed    BigInt   @default(0)
  requestsCount Int      @default(0)
}
```

## Inter-Service Communication

### API Key Creation Flow
```
1. User clicks "Create API Key" in Portal UI
2. Portal POST /emby/keys/api (internal route)
3. Portal validates user session
4. Portal calls api.passy.ai/keys/api with:
   - X-Emby-Secure-Key (shared secret)
   - X-Authenticated-User (user ID from session)
5. api.passy.ai creates key in shared DB
6. Returns key to portal
7. Portal returns key to user
```

### API Request Flow
```
1. Client sends request to api.passy.ai/v1/chat/completions
2. api.passy.ai validates Bearer token against DB
3. api.passy.ai checks rate limits (Redis)
4. api.passy.ai routes to appropriate LLM provider
5. api.passy.ai tracks usage (async DB write)
6. Response streamed back to client
```

## Implementation Phases

### Phase 1: Create api.passy.ai Service

1. **Setup project structure**
   - Initialize new Hono project
   - Copy prisma schema from portal
   - Setup shared lib files (prisma.ts, iam.ts)

2. **Implement core routes**
   - `GET /health` - Health check
   - `GET /v1/models` - List models
   - `POST /v1/chat/completions` - Chat completions
   - `POST /keys/api` - Create API key (internal)

3. **Implement provider handlers**
   - OpenAI proxy
   - Anthropic proxy
   - Nebius proxy
   - DeepInfra proxy

4. **Add middleware**
   - API key validation
   - Rate limiting
   - Usage tracking

### Phase 2: Simplify Portal

1. **Remove proxy code**
   - Delete `src/middleware/unified-proxy.ts`
   - Delete `src/routes/gateway-proxy.ts`
   - Remove Gateway-related env vars

2. **Update key creation**
   - Modify `src/routes/emby-keys.ts` to call api.passy.ai
   - Add `X-Authenticated-User` header

3. **Update frontend**
   - Change API endpoint references from `/v1/*` to `https://api.passy.ai/v1/*`

4. **Test thoroughly**
   - Key creation
   - Key usage
   - Usage tracking
   - Billing

### Phase 3: Deploy to Dokploy

1. **Create Docker Compose**
   ```yaml
   services:
     api-passy-ai:
       build: ./api-passy-ai
       environment:
         - DATABASE_URL=postgresql://.../portal2_db
         - REDIS_URL=redis://redis:6379
       ports:
         - "3000:3000"
     
     portal:
       build: ./emby-portal
       environment:
         - DATABASE_URL=postgresql://.../portal2_db
         - REDIS_URL=redis://redis:6379
         - API_PASSY_AI_URL=http://api-passy-ai:3000
       ports:
         - "3005:3005"
   ```

2. **Configure domains**
   - `api.passy.ai` → api-passy-ai service
   - `dev.emby.ai` → portal service

3. **Setup SSL**
   - Dokploy handles SSL automatically

## Code Snippets

### api.passy.ai: Key Validation
```typescript
// src/lib/iam.ts (simplified from portal)
export async function validateApiKey(token: string): Promise<ApiKeyInfo> {
  const cacheKey = `api_key:${token}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached as ApiKeyInfo;

  const apiKey = await prisma.apiKey.findUnique({
    where: { token },
    include: { project: { include: { organization: true } } }
  });

  if (!apiKey || apiKey.status !== 'active') {
    throw new HTTPException(401, { message: 'Invalid API key' });
  }

  const info: ApiKeyInfo = {
    apiKeyId: apiKey.id,
    projectId: apiKey.projectId,
    organizationId: apiKey.project.organizationId,
    isTrial: apiKey.isTrial,
  };

  await setCache(cacheKey, info, 600);
  return info;
}
```

### api.passy.ai: Chat Completions
```typescript
// src/routes/chat.ts
app.post('/v1/chat/completions', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKeyToken = extractApiKey(authHeader);
  
  // Validate key
  const apiKeyInfo = await validateApiKey(apiKeyToken);
  
  // Check rate limits
  await checkRateLimit(apiKeyInfo);
  
  // Parse request
  const body = await c.req.json();
  const { model, messages, stream = false } = body;
  
  // Route to provider
  const provider = getProviderForModel(model);
  const response = await proxyToProvider(provider, body);
  
  // Track usage (async)
  trackUsage(apiKeyInfo, model, response.usage).catch(console.error);
  
  return stream ? response : c.json(response);
});
```

### Portal: Modified Key Creation
```typescript
// src/routes/emby-keys.ts (modified)
embyKeys.openapi(createKeyRoute, async (c) => {
  // ... validation ...
  
  // Call api.passy.ai instead of Gateway
  const apiResponse = await fetch(`${API_PASSY_AI_URL}/keys/api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Emby-Secure-Key': EMBY_SECURE_KEY,
      'X-Authenticated-User': user.id,
    },
    body: JSON.stringify({
      email,
      description,
      usageLimit,
      isTrial: isTrialKey,
      isTest: isTestKey,
    }),
  });
  
  const data = await apiResponse.json();
  
  // Store reference in Portal DB (for UI listing)
  await prisma.apiKey.create({
    data: {
      id: data.apiKey.id,
      token: data.apiKey.token,
      projectId: project.id,
      createdBy: user.id,
      // ... other fields
    },
  });
  
  return c.json(data);
});
```

## Benefits

1. **Simpler portal**: Removes 400+ lines of proxy code
2. **Better separation**: UI vs API concerns separated
3. **Easier maintenance**: API changes only in one place
4. **Better performance**: Direct API access without portal hop
5. **Scalability**: Can scale API service independently
6. **Cleaner architecture**: No more "hacked Gateway"
7. **Dokploy-friendly**: Two simple containers vs complex setup

## Migration Strategy

1. **Deploy api.passy.ai** alongside existing setup
2. **Test thoroughly** with test keys
3. **Update portal** to use new API service
4. **Gradual cutover**: Move users in batches
5. **Deprecate old Gateway** once fully migrated
6. **Monitor** usage and performance

## Next Steps

1. Create the api.passy.ai service codebase
2. Create the simplified portal modifications
3. Create Dokploy configuration
4. Test end-to-end flow
5. Deploy to production