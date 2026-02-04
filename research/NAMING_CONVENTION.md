# Mini-LLM Naming Convention

## Package Names

### NPM Package
- **Name**: `mini-llm`
- **NOT**: `mini-llm-gateway`, `@passy-ai/mini-llm`, or any scoped name
- **Rationale**: Simple, memorable, easy to install

### Installation
```bash
npm install mini-llm
npx mini-llm
```

## Repository Structure

```
mini-llm/
├── packages/
│   ├── core/           # Core gateway (was "gateway")
│   ├── sdk/            # Node.js SDK
│   ├── cli/            # CLI tool (optional)
│   └── demo/           # Demo app
```

## Import Names

```typescript
// SDK
import { miniLLM } from 'mini-llm';

// Core (if importing directly)
import { startServer } from 'mini-llm/core';
```

## CLI Command

```bash
mini-llm start
mini-llm status
mini-llm stop
```

## Environment Variables

Prefix with `MINI_LLM_`:

```bash
MINI_LLM_PORT=3333
MINI_LLM_ALIASES={...}
```

## Docker Image

```bash
docker pull mini-llm
docker run -p 3333:3333 mini-llm
```

## Documentation References

- Use "Mini-LLM" (with hyphen) in titles
- Use "mini-llm" (lowercase) in code/commands
- Use "the SDK" or "the gateway" when referring to components

## Examples

✅ **Correct**:
- "Install mini-llm via npm"
- "The Mini-LLM SDK provides..."
- "mini-llm start"
- "MINI_LLM_PORT"

❌ **Incorrect**:
- "Install @passy-ai/mini-llm"
- "The gateway provides..."
- "mini-llm-gateway start"
- "GATEWAY_PORT"