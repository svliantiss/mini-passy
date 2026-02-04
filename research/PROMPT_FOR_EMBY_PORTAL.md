# Prompt for Emby Portal Modifications

## Context

We are simplifying the emby-portal architecture by separating the API proxy functionality into a dedicated `api.passy.ai` service. This will make the portal lighter, faster, and easier to maintain.

## Current State

The portal currently:
1. Acts as a proxy to the Gateway (emby-gw) via `unified-proxy.ts` (400+ lines)
2. Handles API requests at `/v1/*` routes
3. Manages API keys by calling Gateway's `/emby/keys/api` endpoint
4. Has complex proxy logic including rate limiting, caching, model transformation

## Goal

Modify the emby-portal to:
1. **Remove all proxy logic** - No more acting as API gateway
2. **Become a pure UI/API management layer** - Dashboard, key management, billing only
3. **Use api.passy.ai for API key creation** - Call new service instead of Gateway
4. **Update frontend** to use `api.passy.ai` for LLM requests

## Files to Modify

### 1. Remove Proxy Files (Delete)

```
DELETE: src/middleware/unified-proxy.ts
DELETE: src/routes/gateway-proxy.ts
DELETE: src/routes/models.ts (the complex one - keep simple version if needed)
```

### 2. Modify src/app.ts

**Remove these route mounts:**
```typescript
// REMOVE these lines:
import { gatewayProxy } from "./routes/gateway-proxy.js";
import { models } from "./routes/models.js";

// REMOVE these route mounts:
app.route("/api/llm", gatewayProxy);
app.route("/v1", models);
app.route("/v1", gatewayProxy);
```

**Keep these routes:**
```typescript
// KEEP these:
app.route("/", home);
app.route("/test-simple", testSimple);
app.route("/test-key", testKey);
app.route("/", authPage);
app.route("/", dashboard);
app.route("/emby", embyKeys);  // Will be modified
app.route("/api/auth", auth);
app.route("/api/usage", apiUsage);
app.route("/api/providers", providers);
app.route("/api/team", team);
app.route("/api/invites", invites);
app.route("/api/billing", billing);
app.route("/api/requests", requests);
```

### 3. Modify src/routes/emby-keys.ts

**Change the key creation flow:**

Currently calls Gateway:
```typescript
const gatewayResponse = await fetch(`${GATEWAY_URL}/emby/keys/api`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Emby-Secure-Key": GATEWAY_SECURE_KEY,
  },
  body: JSON.stringify({...}),
});
```

**Change to call api.passy.ai:**
```typescript
const API_PASSY_AI_URL = process.env.API_PASSY_AI_URL || "https://api.passy.ai";

const apiResponse = await fetch(`${API_PASSY_AI_URL}/keys/api`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Emby-Secure-Key": EMBY_SECURE_KEY,
    "X-Authenticated-User": user.id,  // Pass authenticated user ID
  },
  body: JSON.stringify({
    email: isTestBool ? undefined : email,
    description: isTestBool ? "Test Key" : (isTrialKey ? "Trial Key" : (description || "Emby-generated API Key")),
    usageLimit: usageLimit ?? null,
    isTrial: isTrialKey,
    isTest: isTestKey,
  }),
});
```

**The api.passy.ai service will:**
1. Validate the `X-Emby-Secure-Key`
2. Use `X-Authenticated-User` to associate the key with the user
3. Create the key in the shared database
4. Return the key details

**Portal still needs to:**
1. Create/update user in Portal DB (if needed)
2. Create/update organization in Portal DB
3. Create/update project in Portal DB
4. Store key reference in Portal DB (for UI listing)
5. Set IAM rules in Portal DB

### 4. Update Environment Variables

**Add to .env:**
```env
# API Service URL
API_PASSY_AI_URL=https://api.passy.ai
# Or for local development:
# API_PASSY_AI_URL=http://localhost:3000
```

**Remove (no longer needed):**
```env
# REMOVE these:
EMBY_ROUTE_URL=http://localhost:4001
EMBY_GATEWAY_API_KEY=
```

Keep `EMBY_SECURE_KEY` and `EMBY_GATEWAY_SECURE_KEY` for inter-service auth.

### 5. Update Frontend Code

**Find and replace all API endpoint references:**

Search for patterns like:
```typescript
// Search for these patterns in the codebase:
`/v1/chat/completions`
`/v1/models`
`${baseUrl}/v1/`
```

**Replace with:**
```typescript
// Use api.passy.ai directly
const API_BASE = "https://api.passy.ai";
// or for relative URLs in same domain:
const API_BASE = "https://api.passy.ai";

// Then:
`${API_BASE}/v1/chat/completions`
`${API_BASE}/v1/models`
```

**Key files to check:**
- `app/dashboard/page.tsx` or similar
- Any components that make API calls
- Test pages (`test-simple.ts`, `test-key.ts`)

### 6. Simplify src/lib/iam.ts (Optional)

The IAM validation can be simplified since the portal no longer proxies requests:

**Keep:**
- `validateApiKey()` - For validating keys in the UI
- `extractApiKey()` - Utility function
- `validateModelAccess()` - For UI model filtering

**Can remove or simplify:**
- Rate limit checking (moved to api.passy.ai)
- Complex IAM rule enforcement (moved to api.passy.ai)

### 7. Update Documentation

**Update README.md:**
- Remove references to Gateway proxy functionality
- Document that API requests should go to api.passy.ai
- Update architecture diagram

## Testing Checklist

After making changes, verify:

- [ ] Portal starts without errors
- [ ] Can log in to portal
- [ ] Can create API keys
- [ ] Created keys work with api.passy.ai
- [ ] Usage tracking works
- [ ] Billing/credits work
- [ ] Dashboard shows correct data
- [ ] No 404s for removed routes

## Code Example: Modified emby-keys.ts

Here's the key section to modify in `src/routes/emby-keys.ts`:

```typescript
// Around line 137-160 - Replace this section:

// OLD CODE (remove):
const gatewayResponse = await fetch(`${GATEWAY_URL}/emby/keys/api`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Emby-Secure-Key": GATEWAY_SECURE_KEY,
  },
  body: JSON.stringify({
    email: isTestBool ? undefined : email,
    description: isTestBool ? "Test Key" : (isTrialKey ? "Trial Key" : (description || "Emby-generated API Key")),
    usageLimit: usageLimit ?? null,
  }),
});

// NEW CODE (replace with):
const API_PASSY_AI_URL = process.env.API_PASSY_AI_URL || "https://api.passy.ai";

const apiResponse = await fetch(`${API_PASSY_AI_URL}/keys/api`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Emby-Secure-Key": EMBY_SECURE_KEY,
    "X-Authenticated-User": user?.id || "test-org-user",
  },
  body: JSON.stringify({
    email: isTestBool ? undefined : email,
    description: isTestBool ? "Test Key" : (isTrialKey ? "Trial Key" : (description || "Emby-generated API Key")),
    usageLimit: usageLimit ?? null,
    isTrial: isTrialKey,
    isTest: isTestKey,
  }),
});

if (!apiResponse.ok) {
  const errorData = await apiResponse.json().catch(() => ({}));
  const statusCode = apiResponse.status as 400 | 401 | 403 | 404 | 500;
  throw new HTTPException(statusCode, {
    message: errorData.message || `API service returned ${apiResponse.status}`,
  });
}

const apiData = await apiResponse.json();

// Use apiData instead of gatewayData for the rest of the function
const gatewayData = apiData; // For minimal changes to rest of function
```

## Important Notes

1. **Database is shared**: Both portal and api.passy.ai use the same PostgreSQL database, so keys created via api.passy.ai will immediately be visible in the portal UI.

2. **IAM rules**: The portal should still set IAM rules in its database (via `setIamRule`), but the enforcement happens in api.passy.ai.

3. **Usage tracking**: api.passy.ai writes usage data to the database, which the portal reads for the dashboard.

4. **Test keys**: Test keys should still work the same way (limited to 2 requests).

5. **Backward compatibility**: If you need to support old API keys during migration, api.passy.ai can be configured to validate against both the new and old key formats.

## Questions?

Refer to these research documents:
- `research/ARCHITECTURE_PLAN.md` - Full architecture plan
- `research/EMBY_PORTAL_ANALYSIS.md` - Current portal analysis
- `research/README.md` - Mini-LLM SDK analysis