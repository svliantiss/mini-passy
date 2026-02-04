# Mini-LLM SDK Product Vision

## Vision Statement

**Mini-LLM SDK**: The lightweight, open-source AI routing layer that just works—whether you're a solo developer or a Fortune 500 company.

## Core Philosophy

1. **Open Source First**: The SDK is and always will be open source
2. **Optional Passy.ai Integration**: Use passy.ai as the default wallet for the easiest experience, but never required
3. **BYOK Always Supported**: Bring your own keys, use your own endpoints
4. **Zero Lock-in**: Easy to switch providers, easy to self-host

## Architecture for Bake-in

### Design Principle: "Progressive Enhancement"

The SDK works standalone, but gets better with passy.ai:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Mini-LLM SDK (Open Source)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Core Features (Always Free)                             │   │
│  │  - Local provider routing                                │   │
│  │  - BYOK support                                          │   │
│  │  - Basic fallbacks                                       │   │
│  │  - Model aliasing                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Passy.ai Integration (Optional, Default)                │   │
│  │  - One-click API key (no setup)                        │   │
│  │  - Cheapest routing (10% discount)                     │   │
│  │  - Automatic fallbacks to passy.ai                     │   │
│  │  - Usage dashboard                                     │   │
│  │  - Team sharing                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Default Wallet Integration

**Configuration Priority**:
1. User's explicit configuration (BYOK)
2. Passy.ai default wallet (if no explicit config)
3. Error (no providers configured)

```typescript
// mini-llm.config.json
{
  "wallet": {
    // Option 1: Use passy.ai (default, easiest)
    "type": "passy",
    "apiKey": "${PASSY_API_KEY}"  // Generated via CLI or menubar app
    
    // Option 2: BYOK (explicit override)
    // "type": "custom",
    // "providers": [...]
  }
}
```

**SDK Behavior**:
```typescript
// If no wallet configured, suggest passy.ai
if (!config.wallet) {
  console.log(`
    No AI wallet configured. 
    
    Quick start with passy.ai (recommended):
      npx mini-llm login
    
    Or configure your own providers:
      export OPENAI_API_KEY=sk-...
  `);
}

// If passy.ai wallet configured, use it as default + fallback
if (config.wallet?.type === 'passy') {
  // Primary: User's BYOK providers (if any)
  // Fallback: Passy.ai (always available)
}
```

## Passy.ai Value Proposition

### For SDK Users

**Why use passy.ai as default wallet?**

1. **Zero Setup**: `npx mini-llm login` → get API key → done
2. **Cheapest Pricing**: 
   - 10% discount on all providers (volume pricing)
   - Automatic cost optimization (cheapest provider wins)
   - No minimum spend
3. **Automatic Fallbacks**:
   - Your OpenAI key fails? → Routes to passy.ai
   - Your local model down? → Routes to passy.ai
   - Always available, always working
4. **Unified Billing**:
   - One bill for all providers
   - Usage dashboard
   - Team cost sharing

### For Passy.ai

**Why bake into SDK?**

1. **Distribution**: SDK is the distribution channel
2. **Network Effects**: More SDK users → More passy.ai users
3. **Data**: Usage patterns inform pricing and routing
4. **Lock-in (the good kind)**: Users stay because it's better, not because they have to

## MacOS Menubar App

### Vision: "Tailscale for AI"

A beautiful, simple MacOS menubar app for managing your AI configuration:

```
┌─────────────────────────────────────────┐
│  Mini-LLM                    [Icon]     │
├─────────────────────────────────────────┤
│  Status: Connected to passy.ai ✓       │
│                                         │
│  Current Model: llama-70b              │
│  Provider: Nebius → DeepInfra (fallback)│
│                                         │
│  Usage Today: $2.34                    │
│  Credits: $47.66                       │
│                                         │
├─────────────────────────────────────────┤
│  [Open Dashboard]  [Settings]          │
│                                         │
│  Providers:                            │
│  ✓ passy.ai (default)                  │
│  ✓ OpenAI (your key)                   │
│  ✓ Custom Endpoint (localhost:8080)    │
│                                         │
├─────────────────────────────────────────┤
│  [+ Add Provider]  [Network...]        │
└─────────────────────────────────────────┘
```

### Features

**Phase 1: Configuration Management**
- Visual JSON editor for providers
- One-click passy.ai login
- API key management
- Model alias editor

**Phase 2: Monitoring**
- Real-time usage tracking
- Cost breakdown by provider
- Request history
- Performance metrics

**Phase 3: Network (Future)**
- Connect to private endpoints (like Tailscale)
- Secure tunnel to company AI infrastructure
- Team sharing of private models

**Phase 4: Advanced**
- Local model management (download, run)
- GPU monitoring
- Auto-scaling recommendations

## Implementation Strategy

### Phase 1: SDK Core (Now)
- Build lightweight, open-source SDK
- Support BYOK
- Basic routing and fallbacks

### Phase 2: Passy.ai Integration (After Portal Works)
- Add passy.ai as default wallet
- Implement "login" flow
- Add automatic fallback to passy.ai

### Phase 3: MacOS App (Later)
- Menubar configuration UI
- Usage dashboard
- Provider management

### Phase 4: Network Features (Future)
- Private endpoint connections
- Team sharing
- Secure tunnels

## Open Source vs. Commercial

### Open Source (SDK)
- Core routing logic
- Provider plugins
- Basic fallbacks
- BYOK support
- Local development

### Commercial (Passy.ai)
- Managed API keys
- Volume pricing
- Advanced routing algorithms
- Usage analytics
- Team features
- Support

### Freemium Model

**SDK (Free, Open Source)**:
- Unlimited local usage
- BYOK with your own keys
- Basic features

**Passy.ai (Free Tier)**:
- $5 free credits on signup
- Standard pricing
- Basic dashboard

**Passy.ai (Pro)**:
- 10% discount on all providers
- Advanced routing
- Team features
- Priority support

## Marketing Positioning

### Tagline

"The AI router that just works."

### Messaging

**For Developers**:
> "Mini-LLM SDK is the open-source AI routing layer you wish existed. Route between providers, handle fallbacks, and manage your AI infrastructure—all from a simple JSON config. Use your own keys, or let passy.ai handle it for you."

**For Companies**:
> "Self-host Mini-LLM for complete control over your AI infrastructure. Or use passy.ai for the easiest setup with volume pricing and enterprise support. Your choice, no lock-in."

**For Passy.ai Users**:
> "Get started in 30 seconds: `npx mini-llm login`. Your AI wallet is ready."

## Technical Implementation

### Passy.ai Wallet Protocol

```typescript
// SDK detects passy.ai wallet
interface PassyWallet {
  type: 'passy';
  apiKey: string;
  endpoint: 'https://api.passy.ai/v1';
  features: {
    fallback: true;        // Use passy.ai when BYOK fails
    costOptimization: true; // Route to cheapest provider
    discounts: true;       // 10% off provider pricing
  };
}

// SDK uses passy.ai as default + fallback
const providers = [
  ...userConfiguredProviders,  // User's BYOK
  { id: 'passy', ...passyWallet },  // Always last (fallback)
];
```

### CLI Integration

```bash
# Login to passy.ai (sets up default wallet)
npx mini-llm login
# Opens browser to passy.ai/auth
# Returns API key
# Saves to ~/.mini-llm/config.json

# Check status
npx mini-llm status
# Connected to passy.ai
# Credits: $47.66
# Today's usage: $2.34

# Configure providers (BYOK)
npx mini-llm providers add openai --key sk-...
npx mini-llm providers add custom --url http://localhost:8080

# Start gateway
npx mini-llm start
```

## Success Metrics

### SDK Adoption
- GitHub stars
- npm downloads
- Community contributions

### Passy.ai Conversion
- % of SDK users using passy.ai wallet
- Revenue per SDK user
- Churn rate

### Product Satisfaction
- NPS score
- Support ticket volume
- Feature requests

## Long-term Vision

**Year 1**: 
- SDK is the go-to open-source AI router
- Passy.ai is the default wallet for 50% of users
- MacOS app launched

**Year 2**:
- Network features (private endpoints)
- Enterprise adoption
- Other platform apps (Windows, Linux)

**Year 3**:
- Industry standard for AI routing
- Passy.ai is the "Stripe for AI"
- Ecosystem of plugins and integrations

## Summary

Mini-LLM SDK is:
- **Open source** and always will be
- **Better with passy.ai** but works without it
- **The easiest way** to route AI requests
- **The foundation** for a new AI infrastructure layer

Passy.ai is:
- **The default wallet** for the SDK
- **Optional** but recommended
- **Cheaper and easier** than DIY
- **The commercial layer** that funds open source development

Together, they create a sustainable open-core business model that benefits both developers and the company.