# api.passy.ai Architecture

## Overview

api.passy.ai is a production API service built **on top** of Mini-LLM SDK. It adds business logic, multi-tenancy, and advanced routing while keeping the SDK lightweight.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  (Applications using passy.ai API)                               │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    api.passy.ai                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Hono API Layer                                          │    │
│  │  - Authentication (API keys)                             │    │
│  │  - Rate limiting                                         │    │
│  │  - Request validation                                    │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│  ┌─────────────────────────▼───────────────────────────────┐    │
│  │  Business Logic Layer                                    │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ Provider    │  │ Cost        │  │ Auto-Scaling    │  │    │
│  │  │ Selection   │  │ Calculator  │  │ Decision Engine │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│  ┌─────────────────────────▼───────────────────────────────┐    │
│  │  Mini-LLM SDK Integration                                │    │
│  │  - Route to providers                                    │    │
│  │  - Handle fallbacks                                      │    │
│  │  - Stream responses                                      │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │    Redis     │   │  Providers   │
│  (portal2_db)│   │   (Cache/    │   │  (Nebius,    │
│              │   │   Rate Limit)│   │   DeepInfra, │
│  - api_keys  │   │              │   │   etc.)      │
│  - usage     │   │  - Rate      │   │              │
│  - billing   │   │    limits    │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
```

## Key Components

### 1. API Layer (Hono)

**Routes**:
```typescript
// Public API (OpenAI-compatible)
app.post('/v1/chat/completions', handleChatCompletions);
app.get('/v1/models', handleListModels);

// Internal API (for passy.ai portal)
app.post('/keys/api', handleCreateKey);      // Create API key
app.get('/usage', handleGetUsage);           // Get usage stats
app.post('/webhooks/usage', handleUsageWebhook); // From SDK
```

### 2. Provider Selection Logic

**Decision Flow**:
```typescript
async function selectProvider(request: ChatRequest, apiKey: ApiKeyInfo): Promise<Provider> {
  const model = request.model;
  
  // 1. Check if user has BYOK for this model
  const customProvider = await getCustomProvider(apiKey.organizationId, model);
  if (customProvider) {
    return customProvider;
  }
  
  // 2. Get available providers for model
  const providers = getProvidersForModel(model);
  
  // 3. Check current costs
  const costs = await Promise.all(
    providers.map(async p => ({
      provider: p,
      costPerToken: await getCurrentCost(p, model),
      latency: await getRecentLatency(p),
    }))
  );
  
  // 4. Check if self-hosting is cheaper
  const selfHostCost = calculateSelfHostCost(model);
  const cheapestProvider = costs.sort((a, b) => a.costPerToken - b.costPerToken)[0];
  
  if (selfHostCost < cheapestProvider.costPerToken * estimatedTokens) {
    // Spin up self-hosted instance
    const selfHosted = await spinUpSelfHosted(model);
    if (selfHosted) return selfHosted;
  }
  
  // 5. Return cheapest available provider
  return cheapestProvider.provider;
}
```

### 3. Auto-Scaling / Self-Hosting Logic

**Trigger Conditions**:
```typescript
interface ScalingDecision {
  shouldSpinUp: boolean;
  reason: string;
  estimatedSavings: number;
}

function shouldSpinUpSelfHosted(
  model: string,
  recentUsage: UsageStats,
  providerCosts: CostEstimate[]
): ScalingDecision {
  // Calculate 15-minute window cost
  const tokensPer15Min = recentUsage.tokensPerMinute * 15;
  const providerCost15Min = Math.min(...providerCosts.map(c => c.perToken)) * tokensPer15Min;
  
  // Self-hosting cost (GPU rental)
  const selfHostCost15Min = getSelfHostCostPer15Min(model);
  
  // Decision logic
  if (providerCost15Min > selfHostCost15Min * 1.2) {  // 20% buffer
    return {
      shouldSpinUp: true,
      reason: `Provider cost $${providerCost15Min} > self-host $${selfHostCost15Min}`,
      estimatedSavings: providerCost15Min - selfHostCost15Min,
    };
  }
  
  return { shouldSpinUp: false, reason: 'Provider cheaper', estimatedSavings: 0 };
}
```

**Self-Hosting Manager**:
```typescript
class SelfHostedManager {
  private instances = new Map<string, SelfHostedInstance>();
  
  async spinUp(model: string): Promise<Provider> {
    // 1. Check if instance already exists
    if (this.instances.has(model)) {
      return this.instances.get(model)!;
    }
    
    // 2. Provision GPU (via RunPod, Vast.ai, etc.)
    const instance = await provisionGPU(model);
    
    // 3. Deploy model
    await deployModel(instance, model);
    
    // 4. Register as provider
    const provider: Provider = {
      id: `self-hosted-${model}`,
      baseUrl: instance.endpoint,
      // ...
    };
    
    this.instances.set(model, { provider, instance, startedAt: Date.now() });
    
    // 5. Set shutdown timer (15 min idle)
    this.scheduleShutdown(model);
    
    return provider;
  }
  
  private scheduleShutdown(model: string) {
    setTimeout(async () => {
      const instance = this.instances.get(model);
      if (!instance) return;
      
      // Check if still in use
      const recentRequests = await getRecentRequestCount(model, '15m');
      if (recentRequests === 0) {
        await this.shutdown(model);
      } else {
        // Reschedule
        this.scheduleShutdown(model);
      }
    }, 15 * 60 * 1000);
  }
  
  async shutdown(model: string) {
    const instance = this.instances.get(model);
    if (!instance) return;
    
    await releaseGPU(instance.instance);
    this.instances.delete(model);
  }
}
```

### 4. Cost Tracking

**Real-time Cost Calculation**:
```typescript
interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  routingFee: number;
  totalCost: number;
}

async function calculateCost(
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number
): Promise<CostBreakdown> {
  // Get provider pricing
  const pricing = await getProviderPricing(provider, model);
  
  // Calculate base cost
  const inputCost = inputTokens * pricing.inputPricePerToken;
  const outputCost = outputTokens * pricing.outputPricePerToken;
  
  // Add routing fee (passy.ai margin)
  const routingFee = (inputCost + outputCost) * 0.10;  // 10% margin
  
  return {
    inputCost,
    outputCost,
    routingFee,
    totalCost: inputCost + outputCost + routingFee,
  };
}
```

### 5. Usage Tracking

**Async Usage Recording**:
```typescript
// After each request
async function trackUsage(
  apiKeyId: string,
  model: string,
  provider: string,
  usage: TokenUsage,
  cost: CostBreakdown
) {
  // Write to database (async, don't block response)
  prisma.apiUsage.create({
    data: {
      id: generateId(),
      apiKeyId,
      model,
      provider,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      inputCost: cost.inputCost,
      outputCost: cost.outputCost,
      routingFee: cost.routingFee,
      totalCost: cost.totalCost,
    },
  }).catch(console.error);
  
  // Update organization credits (async)
  updateOrganizationCredits(apiKeyId, cost.totalCost).catch(console.error);
  
  // Update rate limit counters (Redis)
  incrementRateLimit(apiKeyId, usage.total_tokens).catch(console.error);
}
```

## Database Schema (Shared with Portal)

```prisma
// Key tables for api.passy.ai

model ApiKey {
  id            String    @id
  token         String    @unique
  status        String    // active, inactive, deleted
  projectId     String
  organization  Organization @relation(fields: [organizationId], references: [id])
  organizationId String
  usageLimit    Decimal?
  isTrial       Boolean   @default(false)
  // ...
}

model ApiUsage {
  id            String   @id
  apiKeyId      String
  model         String
  provider      String   // Which provider served the request
  inputTokens   Int
  outputTokens  Int
  totalTokens   Int
  inputCost     Decimal
  outputCost    Decimal
  routingFee    Decimal  // passy.ai margin
  totalCost     Decimal
  createdAt     DateTime @default(now())
  
  apiKey        ApiKey   @relation(fields: [apiKeyId], references: [id])
}

model ProviderPricing {
  id              String   @id
  provider        String   // nebius, deepinfra, etc.
  model           String
  inputPrice      Decimal  // per 1M tokens
  outputPrice     Decimal  // per 1M tokens
  effectiveDate   DateTime
}

model SelfHostedInstance {
  id            String    @id
  model         String
  providerId    String    // References Provider.id
  status        String    // starting, running, stopping, stopped
  startedAt     DateTime
  lastUsedAt    DateTime?
  costPer15Min  Decimal
}
```

## Integration with Mini-LLM SDK

### SDK as Dependency

```typescript
// api.passy.ai/src/lib/llm.ts
import { createMiniLLM, registry } from 'mini-llm';

// Configure SDK with our providers
export function initializeLLM() {
  const miniLLM = createMiniLLM({
    port: 3333,  // Internal port, not exposed
  });
  
  // Register providers from database
  const providers = await prisma.provider.findMany();
  providers.forEach(p => {
    registry.register({
      id: p.id,
      baseUrl: p.baseUrl,
      // ...
    });
  });
  
  // Add routing rules
  const rules = await prisma.routingRule.findMany();
  rules.forEach(rule => {
    miniLLM.addRoutingRule(rule);
  });
  
  await miniLLM.ready();
  return miniLLM;
}
```

### Using SDK for Requests

```typescript
// api.passy.ai/src/routes/chat.ts
app.post('/v1/chat/completions', async (c) => {
  // 1. Authenticate
  const apiKey = await validateApiKey(c);
  
  // 2. Check rate limits
  await checkRateLimit(apiKey);
  
  // 3. Select provider (business logic)
  const body = await c.req.json();
  const provider = await selectProvider(body, apiKey);
  
  // 4. Route via SDK
  const sdkResponse = await miniLLM.route({
    model: body.model,
    messages: body.messages,
    provider: provider.id,
    fallbackOn: ['5xx', 'timeout'],
  });
  
  // 5. Track usage
  trackUsage(apiKey.id, body.model, provider.id, sdkResponse.usage);
  
  // 6. Return response
  return c.json(sdkResponse);
});
```

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production

# Database (shared with portal)
DATABASE_URL=postgresql://postgres:password@localhost:5432/portal2_db

# Redis
REDIS_URL=redis://localhost:6379

# Mini-LLM SDK (internal)
MINI_LLM_PORT=3333

# Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NEBIUS_API_KEY=...
DEEPINFRA_API_KEY=...

# Self-Hosting (GPU providers)
RUNPOD_API_KEY=...
VAST_AI_API_KEY=...

# Pricing
ROUTING_FEE_PERCENTAGE=10
SELF_HOSTING_BUFFER=1.2  # 20% buffer

# Inter-service auth
EMBY_SECURE_KEY=...
```

## Deployment

### Docker Compose

```yaml
version: '3.8'

services:
  api-passy-ai:
    build: ./api-passy-ai
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/portal2_db
      - REDIS_URL=redis://redis:6379
      - MINI_LLM_PORT=3333
    depends_on:
      - postgres
      - redis
      - mini-llm
    
  mini-llm:
    build: ./mini-llm-sdk/packages/gateway
    ports:
      - "3333:3333"  # Internal only
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      
  postgres:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=portal2_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Key Differences from SDK

| Feature | Mini-LLM SDK | api.passy.ai |
|---------|--------------|--------------|
| **Scope** | Routing & proxying | Business logic & multi-tenancy |
| **Auth** | None (local) | API keys, rate limits |
| **Providers** | Configurable | Dynamic from DB |
| **Pricing** | None | Full cost tracking |
| **Self-hosting** | None | Auto-scaling logic |
| **Usage tracking** | None | Comprehensive |
| **Target** | Local dev | Production API |

## Summary

api.passy.ai is a **business logic layer** on top of Mini-LLM SDK:

1. **SDK handles**: Routing, streaming, fallbacks, provider abstraction
2. **api.passy.ai handles**: Multi-tenancy, pricing, auto-scaling, usage tracking
3. **Both share**: Database for API keys, Redis for rate limits
4. **Deployment**: Two containers (api + sdk) on Dokploy

This separation keeps the SDK lightweight while enabling powerful production features.